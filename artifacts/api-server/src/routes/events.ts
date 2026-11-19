import { Router, type IRouter } from "express";
import {
  CancelEventRegistrationParams,
  CancelEventRegistrationResponse,
  GetEventParams,
  GetEventResponse,
  ListEventsQueryParams,
  ListEventsResponse,
  RegisterForEventParams,
  RegisterForEventResponse,
} from "@workspace/api-zod";
import {
  db,
  and,
  asc,
  eq,
  gt,
  inArray,
  like,
  lt,
  or,
  eventsTable,
  registrationsTable,
  usersTable,
} from "@workspace/db";
import { isUniqueViolation } from "../lib/db-errors";
import {
  attachOptionalSession,
  requireCsrf,
  requireRole,
} from "../lib/nss-auth";
import { eventDtos } from "../lib/nss-data";

const router: IRouter = Router();

router.get("/events", attachOptionalSession, async (req, res): Promise<void> => {
  const query = ListEventsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const now = new Date();
  const filters = [inArray(eventsTable.status, ["published", "cancelled"])];
  if (query.data.status === "upcoming") {
    filters.push(and(eq(eventsTable.status, "published"), gt(eventsTable.startsAt, now))!);
  } else if (query.data.status === "completed") {
    filters.push(and(eq(eventsTable.status, "published"), lt(eventsTable.endsAt, now))!);
  }
  if (query.data.search?.trim()) {
    filters.push(
      or(
        like(eventsTable.title, `%${query.data.search.trim()}%`),
        like(eventsTable.description, `%${query.data.search.trim()}%`),
        like(eventsTable.venue, `%${query.data.search.trim()}%`),
      )!,
    );
  }
  const rows = await db
    .select()
    .from(eventsTable)
    .where(and(...filters))
    .orderBy(asc(eventsTable.startsAt));
  const data = await eventDtos(
    rows,
    req.auth?.role === "student" ? req.auth.id : undefined,
  );
  res.json(ListEventsResponse.parse(data));
});

router.get("/events/:eventId", attachOptionalSession, async (req, res): Promise<void> => {
  const params = GetEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.id, params.data.eventId),
        inArray(eventsTable.status, ["published", "cancelled"]),
      ),
    )
    .limit(1);
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  const [dto] = await eventDtos(
    [event],
    req.auth?.role === "student" ? req.auth.id : undefined,
  );
  res.json(GetEventResponse.parse(dto));
});

router.post(
  "/events/:eventId/registration",
  requireRole("student"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const params = RegisterForEventParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, params.data.eventId))
      .limit(1);
    if (!event || event.status !== "published") {
      res.status(404).json({ error: "This event is not available for registration." });
      return;
    }
    if (event.startsAt <= new Date() || event.registrationDeadline <= new Date()) {
      res.status(409).json({ error: "The registration deadline has passed." });
      return;
    }
    const [existing] = await db
      .select()
      .from(registrationsTable)
      .where(
        and(
          eq(registrationsTable.eventId, event.id),
          eq(registrationsTable.studentId, req.auth!.id),
        ),
      )
      .limit(1);
    if (existing?.status === "registered") {
      res.status(409).json({ error: "You are already registered for this event." });
      return;
    }
    try {
      if (existing) {
        await db
          .update(registrationsTable)
          .set({
            status: "registered",
            attendanceStatus: null,
            attendanceHours: null,
            attendanceMarkedAt: null,
            attendanceMarkedBy: null,
            attendanceSource: null,
            registeredAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(registrationsTable.id, existing.id));
      } else {
        await db.insert(registrationsTable).values({
          eventId: event.id,
          studentId: req.auth!.id,
        });
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "You are already registered for this event." });
        return;
      }
      throw error;
    }
    const response = await getRegistrationView(event.id, req.auth!.id);
    res.status(201).json(RegisterForEventResponse.parse(response));
  },
);

router.delete(
  "/events/:eventId/registration",
  requireRole("student"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const params = CancelEventRegistrationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, params.data.eventId))
      .limit(1);
    const [registration] = await db
      .select()
      .from(registrationsTable)
      .where(
        and(
          eq(registrationsTable.eventId, params.data.eventId),
          eq(registrationsTable.studentId, req.auth!.id),
          eq(registrationsTable.status, "registered"),
        ),
      )
      .limit(1);
    if (!event || !registration) {
      res.status(404).json({ error: "Registration not found." });
      return;
    }
    if (event.registrationDeadline <= new Date() || event.status === "cancelled") {
      res.status(409).json({ error: "This registration can no longer be cancelled." });
      return;
    }
    await db
      .update(registrationsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(registrationsTable.id, registration.id));
    res.json(CancelEventRegistrationResponse.parse({ ok: true }));
  },
);

export async function getRegistrationView(eventId: number, studentId: number) {
  const [row] = await db
    .select({
      registration: registrationsTable,
      event: eventsTable,
      student: usersTable,
    })
    .from(registrationsTable)
    .innerJoin(eventsTable, eq(registrationsTable.eventId, eventsTable.id))
    .innerJoin(usersTable, eq(registrationsTable.studentId, usersTable.id))
    .where(
      and(
        eq(registrationsTable.eventId, eventId),
        eq(registrationsTable.studentId, studentId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.registration.id,
    eventId: row.event.id,
    eventTitle: row.event.title,
    studentId: row.student.id,
    studentName: row.student.name,
    studentCode: row.student.studentId ?? "",
    department: row.student.department ?? "",
    registeredAt: row.registration.registeredAt.toISOString(),
    attendanceStatus: row.registration.attendanceStatus,
    verifiedHours:
      row.registration.attendanceStatus === "attended"
        ? Number(row.registration.attendanceHours ?? row.event.volunteerHours)
        : 0,
  };
}

export default router;
