import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  ApproveVolunteerCertificateParams,
  ApproveVolunteerCertificateResponse,
  ListStaffCertificatesQueryParams,
  ListStaffCertificatesResponse,
  ListStudentCertificatesResponse,
  RejectVolunteerCertificateBody,
  RejectVolunteerCertificateParams,
  RejectVolunteerCertificateResponse,
  RequestVolunteerCertificateBody,
  RequestVolunteerCertificateResponse,
  VerifyVolunteerCertificateParams,
  VerifyVolunteerCertificateResponse,
} from "@workspace/api-zod";
import {
  db,
  and,
  desc,
  eq,
  eventsTable,
  registrationsTable,
  usersTable,
  volunteerCertificatesTable,
} from "@workspace/db";
import { isUniqueViolation } from "../lib/db-errors";
import {
  buildVolunteerCertificatePdf,
  UnsupportedCertificateTextError,
} from "../lib/certificate-pdf";
import { requireCsrf, requireRole } from "../lib/nss-auth";
import { recordStaffAction } from "../lib/staff-audit";

const router: IRouter = Router();

function certificateDto(
  certificate: typeof volunteerCertificatesTable.$inferSelect,
  eventTitle: string,
) {
  return {
    id: certificate.id,
    certificateId: certificate.certificateId,
    eventId: certificate.eventId,
    eventTitle,
    volunteerHours: Number(certificate.volunteerHours),
    status: certificate.status,
    requestedAt: certificate.requestedAt.toISOString(),
    issuedAt: certificate.issuedAt?.toISOString() ?? null,
    rejectionReason: certificate.rejectionReason,
  };
}

router.get(
  "/student/certificates",
  requireRole("student"),
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        certificate: volunteerCertificatesTable,
        eventTitle: eventsTable.title,
      })
      .from(volunteerCertificatesTable)
      .innerJoin(eventsTable, eq(volunteerCertificatesTable.eventId, eventsTable.id))
      .where(eq(volunteerCertificatesTable.studentId, req.auth!.id))
      .orderBy(desc(volunteerCertificatesTable.requestedAt));
    res.json(
      ListStudentCertificatesResponse.parse(
        rows.map(({ certificate, eventTitle }) =>
          certificateDto(certificate, certificate.eventTitle ?? eventTitle),
        ),
      ),
    );
  },
);

router.post(
  "/student/certificates",
  requireRole("student"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = RequestVolunteerCertificateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [eligible] = await db
      .select({
        registrationId: registrationsTable.id,
        eventId: eventsTable.id,
        eventTitle: eventsTable.title,
        attendanceStatus: registrationsTable.attendanceStatus,
        attendanceHours: registrationsTable.attendanceHours,
        volunteerHours: eventsTable.volunteerHours,
        endsAt: eventsTable.endsAt,
      })
      .from(registrationsTable)
      .innerJoin(eventsTable, eq(registrationsTable.eventId, eventsTable.id))
      .where(
        and(
          eq(registrationsTable.studentId, req.auth!.id),
          eq(registrationsTable.eventId, parsed.data.eventId),
          eq(registrationsTable.status, "registered"),
        ),
      )
      .limit(1);
    if (
      !eligible ||
      eligible.attendanceStatus !== "attended" ||
      eligible.endsAt > new Date()
    ) {
      res.status(409).json({
        error: "A certificate can only be requested for completed, verified attendance.",
      });
      return;
    }

    const [existing] = await db
      .select()
      .from(volunteerCertificatesTable)
      .where(eq(volunteerCertificatesTable.registrationId, eligible.registrationId))
      .limit(1);
    const certificateId = `NSS-${randomBytes(12).toString("hex").toUpperCase()}`;
    const requestedAt = new Date();
    let certificate: typeof volunteerCertificatesTable.$inferSelect;
    if (existing?.status === "rejected") {
      const [updated] = await db
        .update(volunteerCertificatesTable)
        .set({
          certificateId,
          status: "pending",
          rejectionReason: null,
          collegeName: null,
          unitName: null,
          studentName: null,
          eventTitle: null,
          requestedAt,
          reviewedBy: null,
          reviewedAt: null,
          issuedAt: null,
        })
        .where(
          and(
            eq(volunteerCertificatesTable.id, existing.id),
            eq(volunteerCertificatesTable.status, "rejected"),
          ),
        )
        .returning({ id: volunteerCertificatesTable.id });
      if (!updated) {
        res.status(409).json({ error: "A certificate request already exists for this activity." });
        return;
      }
      const [reissued] = await db
        .select()
        .from(volunteerCertificatesTable)
        .where(eq(volunteerCertificatesTable.id, existing.id))
        .limit(1);
      if (!reissued) {
        res.status(404).json({ error: "Certificate request not found." });
        return;
      }
      certificate = reissued;
    } else if (existing) {
      res.status(409).json({ error: "A certificate request already exists for this activity." });
      return;
    } else {
      try {
        const [created] = await db
          .insert(volunteerCertificatesTable)
          .values({
            certificateId,
            registrationId: eligible.registrationId,
            studentId: req.auth!.id,
            eventId: eligible.eventId,
            volunteerHours: String(
              eligible.attendanceHours ?? eligible.volunteerHours,
            ),
          })
          .returning({ id: volunteerCertificatesTable.id });
        const [inserted] = await db
          .select()
          .from(volunteerCertificatesTable)
          .where(eq(volunteerCertificatesTable.id, created.id))
          .limit(1);
        if (!inserted) {
          throw new Error("Could not retrieve the created certificate request.");
        }
        certificate = inserted;
      } catch (error) {
        if (isUniqueViolation(error)) {
          res.status(409).json({ error: "A certificate request already exists for this activity." });
          return;
        }
        throw error;
      }
    }

    res.status(201).json(
      RequestVolunteerCertificateResponse.parse(
        certificateDto(certificate, eligible.eventTitle),
      ),
    );
  },
);

router.get(
  "/student/certificates/:certificateId/pdf",
  requireRole("student"),
  async (req, res): Promise<void> => {
    const certificateId = req.params.certificateId;
    if (typeof certificateId !== "string" || certificateId.length > 64) {
      res.status(400).json({ error: "Enter a valid certificate ID." });
      return;
    }
    const [row] = await db
      .select({ certificate: volunteerCertificatesTable, eventTitle: eventsTable.title })
      .from(volunteerCertificatesTable)
      .innerJoin(eventsTable, eq(volunteerCertificatesTable.eventId, eventsTable.id))
      .where(
        and(
          eq(volunteerCertificatesTable.certificateId, certificateId),
          eq(volunteerCertificatesTable.studentId, req.auth!.id),
          eq(volunteerCertificatesTable.status, "approved"),
        ),
      )
      .limit(1);
    if (
      !row ||
      !row.certificate.studentName ||
      !row.certificate.collegeName ||
      !row.certificate.unitName ||
      !row.certificate.issuedAt
    ) {
      res.status(404).json({ error: "Approved certificate not found." });
      return;
    }

    try {
      const pdf = await buildVolunteerCertificatePdf({
        certificateId: row.certificate.certificateId,
        studentName: row.certificate.studentName,
        collegeName: row.certificate.collegeName,
        unitName: row.certificate.unitName,
        eventTitle: row.certificate.eventTitle ?? row.eventTitle,
        volunteerHours: Number(row.certificate.volunteerHours),
        issuedAt: row.certificate.issuedAt,
      });
      res
        .type("application/pdf")
        .attachment(`NSS-Certificate-${row.certificate.certificateId}.pdf`)
        .send(Buffer.from(pdf));
    } catch (error) {
      if (error instanceof UnsupportedCertificateTextError) {
        res.status(422).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

router.get(
  "/staff/certificates",
  requireRole("staff"),
  async (req, res): Promise<void> => {
    const query = ListStaffCertificatesQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const rows = await db
      .select({
        certificate: volunteerCertificatesTable,
        eventTitle: eventsTable.title,
        studentName: usersTable.name,
        studentCode: usersTable.studentId,
        studentEmail: usersTable.email,
      })
      .from(volunteerCertificatesTable)
      .innerJoin(eventsTable, eq(volunteerCertificatesTable.eventId, eventsTable.id))
      .innerJoin(usersTable, eq(volunteerCertificatesTable.studentId, usersTable.id))
      .where(eq(volunteerCertificatesTable.status, query.data.status))
      .orderBy(desc(volunteerCertificatesTable.requestedAt))
      .limit(200);
    res.json(
      ListStaffCertificatesResponse.parse(
        rows.map(({ certificate, eventTitle, studentName, studentCode, studentEmail }) => ({
          ...certificateDto(certificate, certificate.eventTitle ?? eventTitle),
          studentId: certificate.studentId,
          studentName,
          studentCode: studentCode ?? "",
          studentEmail,
        })),
      ),
    );
  },
);

router.post(
  "/staff/certificates/:certificateId/approve",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const params = ApproveVolunteerCertificateParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const issuedAt = new Date();
    const certificate = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          certificate: volunteerCertificatesTable,
          studentName: usersTable.name,
          eventTitle: eventsTable.title,
        })
        .from(volunteerCertificatesTable)
        .innerJoin(usersTable, eq(volunteerCertificatesTable.studentId, usersTable.id))
        .innerJoin(eventsTable, eq(volunteerCertificatesTable.eventId, eventsTable.id))
        .where(
          and(
            eq(volunteerCertificatesTable.certificateId, params.data.certificateId),
            eq(volunteerCertificatesTable.status, "pending"),
          ),
        )
        .for("update")
        .limit(1);
      if (!row) return null;
      const collegeName =
        process.env.NSS_COLLEGE_NAME?.trim() ||
        "Bannari Amman Institute of Technology";
      const unitName =
        process.env.NSS_UNIT_NAME?.trim() || "National Service Scheme";
      const [updated] = await tx
        .update(volunteerCertificatesTable)
        .set({
          status: "approved",
          studentName: row.studentName,
          collegeName,
          unitName,
          eventTitle: row.eventTitle,
          reviewedBy: req.auth!.id,
          reviewedAt: issuedAt,
          issuedAt,
          rejectionReason: null,
        })
        .where(eq(volunteerCertificatesTable.id, row.certificate.id))
        .returning({ id: volunteerCertificatesTable.id });
      if (!updated) return null;
      const [issued] = await tx
        .select()
        .from(volunteerCertificatesTable)
        .where(eq(volunteerCertificatesTable.id, row.certificate.id))
        .limit(1);
      if (!issued) return null;
      return { certificate: issued, eventTitle: row.eventTitle };
    });
    if (!certificate) {
      res.status(404).json({ error: "Pending certificate request not found." });
      return;
    }
    await recordStaffAction(
      req.auth!.id,
      "certificate.approved",
      "certificate",
      certificate.certificate.id,
      { certificateId: certificate.certificate.certificateId },
    );
    res.json(
      ApproveVolunteerCertificateResponse.parse(
        certificateDto(certificate.certificate, certificate.eventTitle),
      ),
    );
  },
);

router.post(
  "/staff/certificates/:certificateId/reject",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const params = RejectVolunteerCertificateParams.safeParse(req.params);
    const parsed = RejectVolunteerCertificateBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .select({
        certificate: volunteerCertificatesTable,
        eventTitle: eventsTable.title,
      })
      .from(volunteerCertificatesTable)
      .innerJoin(eventsTable, eq(volunteerCertificatesTable.eventId, eventsTable.id))
      .where(
        and(
          eq(volunteerCertificatesTable.certificateId, params.data.certificateId),
          eq(volunteerCertificatesTable.status, "pending"),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Pending certificate request not found." });
      return;
    }
    const reviewedAt = new Date();
    const [updated] = await db
      .update(volunteerCertificatesTable)
      .set({
        status: "rejected",
        rejectionReason: parsed.data.reason.trim(),
        reviewedBy: req.auth!.id,
        reviewedAt,
      })
      .where(
        and(
          eq(volunteerCertificatesTable.id, row.certificate.id),
          eq(volunteerCertificatesTable.status, "pending"),
        ),
      )
      .returning({ id: volunteerCertificatesTable.id });
    if (!updated) {
      res.status(404).json({ error: "Pending certificate request not found." });
      return;
    }
    const rejected = {
      ...row.certificate,
      status: "rejected",
      rejectionReason: parsed.data.reason.trim(),
      reviewedBy: req.auth!.id,
      reviewedAt,
    };
    await recordStaffAction(
      req.auth!.id,
      "certificate.rejected",
      "certificate",
      rejected.id,
      { certificateId: rejected.certificateId },
    );
    res.json(
      RejectVolunteerCertificateResponse.parse(
        certificateDto(rejected, row.eventTitle),
      ),
    );
  },
);

router.get(
  "/public/certificates/:certificateId",
  async (req, res): Promise<void> => {
    const params = VerifyVolunteerCertificateParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .select({
        certificate: volunteerCertificatesTable,
        eventTitle: eventsTable.title,
      })
      .from(volunteerCertificatesTable)
      .innerJoin(eventsTable, eq(volunteerCertificatesTable.eventId, eventsTable.id))
      .where(
        and(
          eq(volunteerCertificatesTable.certificateId, params.data.certificateId),
          eq(volunteerCertificatesTable.status, "approved"),
        ),
      )
      .limit(1);
    if (
      !row ||
      !row.certificate.studentName ||
      !row.certificate.collegeName ||
      !row.certificate.unitName ||
      !row.certificate.issuedAt
    ) {
      res.status(404).json({ error: "Issued certificate not found." });
      return;
    }
    res.json(
      VerifyVolunteerCertificateResponse.parse({
        certificateId: row.certificate.certificateId,
        studentName: row.certificate.studentName,
        collegeName: row.certificate.collegeName,
        unitName: row.certificate.unitName,
        eventTitle: row.certificate.eventTitle ?? row.eventTitle,
        volunteerHours: Number(row.certificate.volunteerHours),
        issuedAt: row.certificate.issuedAt.toISOString(),
      }),
    );
  },
);

export default router;
