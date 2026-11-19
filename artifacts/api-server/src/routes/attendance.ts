import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  CreateAttendanceQrBody,
  CreateAttendanceQrResponse,
  RevokeAttendanceQrParams,
  RevokeAttendanceQrResponse,
  SubmitQrAttendanceBody,
  SubmitQrAttendanceResponse,
} from "@workspace/api-zod";
import {
  attendanceQrTokensTable,
  and,
  db,
  eq,
  eventsTable,
  gt,
  isNull,
  registrationsTable,
} from "@workspace/db";
import { digestToken, requireCsrf, requireRole } from "../lib/nss-auth";
import { recordStaffAction } from "../lib/staff-audit";

const router: IRouter = Router();

router.post(
  "/staff/events/:eventId/attendance-qr",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const eventId = Number(req.params.eventId);
    if (!Number.isSafeInteger(eventId) || eventId < 1) {
      res.status(400).json({ error: "Enter a valid event ID." });
      return;
    }
    const parsed = CreateAttendanceQrBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [event] = await db
      .select({
        id: eventsTable.id,
        status: eventsTable.status,
        startsAt: eventsTable.startsAt,
        endsAt: eventsTable.endsAt,
        volunteerHours: eventsTable.volunteerHours,
      })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId))
      .limit(1);
    if (!event) {
      res.status(404).json({ error: "Event not found." });
      return;
    }
    const now = new Date();
    if (
      event.status !== "published" ||
      event.startsAt > now ||
      event.endsAt <= now
    ) {
      res.status(409).json({ error: "Attendance QR is only available while an event is in progress." });
      return;
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + parsed.data.expiresInSeconds * 1000);
    const [createdQr] = await db
      .insert(attendanceQrTokensTable)
      .values({
        eventId,
        tokenHash: digestToken(`attendance-qr:${token}`),
        expiresAt,
        createdBy: req.auth!.id,
      })
      .$returningId();
    const qrId = createdQr.id;
    await recordStaffAction(
      req.auth!.id,
      "attendance_qr.created",
      "attendance_qr",
      qrId,
      { eventId, expiresAt: expiresAt.toISOString() },
    );
    res.status(201).json(
      CreateAttendanceQrResponse.parse({
        id: qrId,
        eventId,
        token,
        expiresAt: expiresAt.toISOString(),
      }),
    );
  },
);

router.delete(
  "/staff/attendance-qr/:qrId",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = RevokeAttendanceQrParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [activeQr] = await db
      .select({ eventId: attendanceQrTokensTable.eventId })
      .from(attendanceQrTokensTable)
      .where(
        and(
          eq(attendanceQrTokensTable.id, parsed.data.qrId),
          isNull(attendanceQrTokensTable.revokedAt),
        ),
      )
      .limit(1);
    if (!activeQr) {
      res.status(404).json({ error: "Active attendance QR token not found." });
      return;
    }
    const [updated] = await db
      .update(attendanceQrTokensTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(attendanceQrTokensTable.id, parsed.data.qrId),
          isNull(attendanceQrTokensTable.revokedAt),
        ),
      )
    if (updated.affectedRows !== 1) {
      res.status(404).json({ error: "Active attendance QR token not found." });
      return;
    }
    await recordStaffAction(
      req.auth!.id,
      "attendance_qr.revoked",
      "attendance_qr",
      parsed.data.qrId,
      { eventId: activeQr.eventId },
    );
    res.json(RevokeAttendanceQrResponse.parse({ ok: true }));
  },
);

router.post(
  "/student/attendance/qr",
  requireRole("student"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = SubmitQrAttendanceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const now = new Date();
    const tokenHash = digestToken(`attendance-qr:${parsed.data.token}`);
    const [qr] = await db
      .select({
        eventId: attendanceQrTokensTable.eventId,
      })
      .from(attendanceQrTokensTable)
      .where(
        and(
          eq(attendanceQrTokensTable.tokenHash, tokenHash),
          gt(attendanceQrTokensTable.expiresAt, now),
          isNull(attendanceQrTokensTable.revokedAt),
        ),
      )
      .limit(1);
    if (!qr) {
      res.status(403).json({ error: "This attendance QR is invalid, expired, or revoked." });
      return;
    }

    const [event] = await db
      .select({
        status: eventsTable.status,
        startsAt: eventsTable.startsAt,
        endsAt: eventsTable.endsAt,
        volunteerHours: eventsTable.volunteerHours,
      })
      .from(eventsTable)
      .where(eq(eventsTable.id, qr.eventId))
      .limit(1);
    if (
      !event ||
      event.status !== "published" ||
      event.startsAt > now ||
      event.endsAt <= now
    ) {
      res.status(409).json({ error: "Attendance is not open for this event." });
      return;
    }

    const [registration] = await db
      .select({ id: registrationsTable.id })
      .from(registrationsTable)
      .where(
        and(
          eq(registrationsTable.eventId, qr.eventId),
          eq(registrationsTable.studentId, req.auth!.id),
          eq(registrationsTable.status, "registered"),
          isNull(registrationsTable.attendanceStatus),
        ),
      )
      .limit(1);
    if (!registration) {
      res.status(409).json({
        error: "An active registration is required and attendance can only be recorded once.",
      });
      return;
    }

    const [attendanceUpdate] = await db
      .update(registrationsTable)
      .set({
        attendanceStatus: "attended",
        attendanceHours: event.volunteerHours,
        attendanceMarkedAt: now,
        attendanceMarkedBy: req.auth!.id,
        attendanceSource: "qr",
        updatedAt: now,
      })
      .where(
        and(
          eq(registrationsTable.eventId, qr.eventId),
          eq(registrationsTable.id, registration.id),
          eq(registrationsTable.studentId, req.auth!.id),
          eq(registrationsTable.status, "registered"),
          isNull(registrationsTable.attendanceStatus),
        ),
      )
    if (attendanceUpdate.affectedRows !== 1) {
      res.status(409).json({
        error: "An active registration is required and attendance can only be recorded once.",
      });
      return;
    }

    res.json(
      SubmitQrAttendanceResponse.parse({
        registrationId: registration.id,
        eventId: qr.eventId,
        attendanceAt: now.toISOString(),
      }),
    );
  },
);

export default router;
