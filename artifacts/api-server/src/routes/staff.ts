import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lt,
  or,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateAnnouncementBody,
  CreateAnnouncementResponse,
  CreateEventBody,
  CreateEventResponse,
  DeleteAnnouncementParams,
  DeleteAnnouncementResponse,
  GetStaffDashboardResponse,
  ListEventRegistrationsParams,
  ListEventRegistrationsResponse,
  ListManageAnnouncementsResponse,
  ListStudentsQueryParams,
  ListStudentsResponse,
  PublishEventParams,
  PublishEventResponse,
  RecordAttendanceBody,
  RecordAttendanceParams,
  RecordAttendanceResponse,
  UpdateAnnouncementBody,
  UpdateAnnouncementResponse,
  UpdateAnnouncementParams,
  UpdateEventBody,
  UpdateEventParams,
  UpdateEventResponse,
  CancelEventParams,
  CancelEventResponse,
} from "@workspace/api-zod";
import {
  db,
  announcementsTable,
  eventsTable,
  registrationsTable,
  usersTable,
} from "@workspace/db";
import { requireCsrf, requireRole } from "../lib/nss-auth";
import {
  eventDtos,
  studentProfileDto,
} from "../lib/nss-data";
import { getRegistrationView } from "./events";

const router: IRouter = Router();

router.get("/staff/dashboard", requireRole("staff"), async (_req, res): Promise<void> => {
  const now = new Date();
  const [students] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(eq(usersTable.role, "student"));
  const [upcoming] = await db
    .select({ total: count() })
    .from(eventsTable)
    .where(and(eq(eventsTable.status, "published"), gt(eventsTable.startsAt, now)));
  const [completed] = await db
    .select({ total: count() })
    .from(eventsTable)
    .where(and(eq(eventsTable.status, "published"), lt(eventsTable.startsAt, now)));
  const [registrations] = await db
    .select({ total: count() })
    .from(registrationsTable)
    .where(eq(registrationsTable.status, "registered"));
  const attendedRows = await db
    .select({ eventHours: eventsTable.volunteerHours })
    .from(registrationsTable)
    .innerJoin(eventsTable, eq(registrationsTable.eventId, eventsTable.id))
    .where(eq(registrationsTable.attendanceStatus, "attended"));
  const [attendedCount] = await db
    .select({ total: count() })
    .from(registrationsTable)
    .where(eq(registrationsTable.attendanceStatus, "attended"));
  const eventRows = await db
    .select()
    .from(eventsTable)
    .orderBy(desc(eventsTable.startsAt))
    .limit(100);
  const recentEvents = await eventDtos(eventRows);
  const recentRegistrationRows = await db
    .select({
      registration: registrationsTable,
      event: eventsTable,
      student: usersTable,
    })
    .from(registrationsTable)
    .innerJoin(eventsTable, eq(registrationsTable.eventId, eventsTable.id))
    .innerJoin(usersTable, eq(registrationsTable.studentId, usersTable.id))
    .orderBy(desc(registrationsTable.registeredAt))
    .limit(8);
  const recentRegistrations = recentRegistrationRows
    .filter(({ registration }) => registration.status !== "cancelled")
    .map(({ registration, event, student }) => ({
      id: registration.id,
      eventId: event.id,
      eventTitle: event.title,
      studentId: student.id,
      studentName: student.name,
      studentCode: student.studentId ?? "",
      department: student.department ?? "",
      registeredAt: registration.registeredAt.toISOString(),
      attendanceStatus: registration.attendanceStatus,
      verifiedHours:
        registration.attendanceStatus === "attended"
          ? Number(event.volunteerHours)
          : 0,
    }));
  res.json(
    GetStaffDashboardResponse.parse({
      totalStudents: students.total,
      upcomingEvents: upcoming.total,
      completedEvents: completed.total,
      totalRegistrations: registrations.total,
      attendedStudents: attendedCount.total,
      verifiedVolunteerHours: attendedRows.reduce(
        (total, row) => total + Number(row.eventHours),
        0,
      ),
      recentEvents,
      recentRegistrations,
    }),
  );
});

router.get("/staff/students", requireRole("staff"), async (req, res): Promise<void> => {
  const query = ListStudentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const search = query.data.search?.trim();
  const students = await db
    .select()
    .from(usersTable)
    .where(
      search
        ? and(
            eq(usersTable.role, "student"),
            or(
              ilike(usersTable.name, `%${search}%`),
              ilike(usersTable.email, `%${search}%`),
              ilike(usersTable.studentId, `%${search}%`),
              ilike(usersTable.department, `%${search}%`),
            ),
          )
        : eq(usersTable.role, "student"),
    )
    .orderBy(asc(usersTable.name));
  const attendanceRows =
    students.length === 0
      ? []
      : await db
          .select({
            studentId: registrationsTable.studentId,
            hours: eventsTable.volunteerHours,
          })
          .from(registrationsTable)
          .innerJoin(eventsTable, eq(registrationsTable.eventId, eventsTable.id))
          .where(
            and(
              inArray(
                registrationsTable.studentId,
                students.map((student) => student.id),
              ),
              eq(registrationsTable.attendanceStatus, "attended"),
            ),
          );
  const hoursByStudent = new Map<number, number>();
  for (const row of attendanceRows) {
    hoursByStudent.set(
      row.studentId,
      (hoursByStudent.get(row.studentId) ?? 0) + Number(row.hours),
    );
  }
  res.json(
    ListStudentsResponse.parse(
      students.map((student) =>
        studentProfileDto(student, hoursByStudent.get(student.id) ?? 0),
      ),
    ),
  );
});

router.post(
  "/staff/events",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = CreateEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const eventData = toEventDates(parsed.data);
    if (!validEventDates(eventData.startsAt, eventData.endsAt, eventData.registrationDeadline)) {
      res.status(400).json({ error: "Check the event dates and registration deadline." });
      return;
    }
    const [event] = await db
      .insert(eventsTable)
      .values({
        ...eventData,
        volunteerHours: String(parsed.data.volunteerHours),
        status: "draft",
        createdBy: req.auth!.id,
      })
      .returning();
    const [dto] = await eventDtos([event]);
    res.status(201).json(CreateEventResponse.parse(dto));
  },
);

router.patch(
  "/staff/events/:eventId",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const params = UpdateEventParams.safeParse(req.params);
    const parsed = UpdateEventBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, params.data.eventId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Event not found." });
      return;
    }
    const startsAt = parsed.data.startsAt ?? existing.startsAt;
    const endsAt = parsed.data.endsAt ?? existing.endsAt;
    const registrationDeadline =
      parsed.data.registrationDeadline ?? existing.registrationDeadline;
    if (!validEventDates(startsAt, endsAt, registrationDeadline)) {
      res.status(400).json({ error: "Check the event dates and registration deadline." });
      return;
    }
    const update: Partial<typeof eventsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.title !== undefined) update.title = parsed.data.title.trim();
    if (parsed.data.description !== undefined) update.description = parsed.data.description;
    if (parsed.data.startsAt !== undefined) update.startsAt = startsAt;
    if (parsed.data.endsAt !== undefined) update.endsAt = endsAt;
    if (parsed.data.venue !== undefined) update.venue = parsed.data.venue.trim();
    if (parsed.data.registrationDeadline !== undefined) {
      update.registrationDeadline = registrationDeadline;
    }
    if (parsed.data.volunteerHours !== undefined) {
      update.volunteerHours = String(parsed.data.volunteerHours);
    }
    const [event] = await db
      .update(eventsTable)
      .set(update)
      .where(eq(eventsTable.id, existing.id))
      .returning();
    const [dto] = await eventDtos([event]);
    res.json(UpdateEventResponse.parse(dto));
  },
);

router.post(
  "/staff/events/:eventId/publish",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const params = PublishEventParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, params.data.eventId))
      .limit(1);
    if (!event) {
      res.status(404).json({ error: "Event not found." });
      return;
    }
    if (event.startsAt <= new Date() || event.registrationDeadline <= new Date()) {
      res.status(409).json({ error: "Update the event dates before publishing." });
      return;
    }
    const [updated] = await db
      .update(eventsTable)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(eventsTable.id, event.id))
      .returning();
    const [dto] = await eventDtos([updated]);
    res.json(PublishEventResponse.parse(dto));
  },
);

router.post(
  "/staff/events/:eventId/cancel",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const params = CancelEventParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [event] = await db
      .update(eventsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(eventsTable.id, params.data.eventId))
      .returning();
    if (!event) {
      res.status(404).json({ error: "Event not found." });
      return;
    }
    const [dto] = await eventDtos([event]);
    res.json(CancelEventResponse.parse(dto));
  },
);

router.get(
  "/staff/events/:eventId/registrations",
  requireRole("staff"),
  async (req, res): Promise<void> => {
    const params = ListEventRegistrationsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [event] = await db
      .select({ id: eventsTable.id })
      .from(eventsTable)
      .where(eq(eventsTable.id, params.data.eventId))
      .limit(1);
    if (!event) {
      res.status(404).json({ error: "Event not found." });
      return;
    }
    const rows = await db
      .select({ registration: registrationsTable, event: eventsTable, student: usersTable })
      .from(registrationsTable)
      .innerJoin(eventsTable, eq(registrationsTable.eventId, eventsTable.id))
      .innerJoin(usersTable, eq(registrationsTable.studentId, usersTable.id))
      .where(
        and(
          eq(registrationsTable.eventId, params.data.eventId),
          eq(registrationsTable.status, "registered"),
        ),
      )
      .orderBy(asc(registrationsTable.registeredAt));
    const response = rows.map(({ registration, event: joinedEvent, student }) => ({
      id: registration.id,
      eventId: joinedEvent.id,
      eventTitle: joinedEvent.title,
      studentId: student.id,
      studentName: student.name,
      studentCode: student.studentId ?? "",
      department: student.department ?? "",
      registeredAt: registration.registeredAt.toISOString(),
      attendanceStatus: registration.attendanceStatus,
      verifiedHours:
        registration.attendanceStatus === "attended"
          ? Number(joinedEvent.volunteerHours)
          : 0,
    }));
    res.json(ListEventRegistrationsResponse.parse(response));
  },
);

router.patch(
  "/staff/registrations/:registrationId/attendance",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const params = RecordAttendanceParams.safeParse(req.params);
    const parsed = RecordAttendanceBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [registration] = await db
      .select()
      .from(registrationsTable)
      .where(
        and(
          eq(registrationsTable.id, params.data.registrationId),
          eq(registrationsTable.status, "registered"),
        ),
      )
      .limit(1);
    if (!registration) {
      res.status(404).json({ error: "Active event registration not found." });
      return;
    }
    await db
      .update(registrationsTable)
      .set({
        attendanceStatus: parsed.data.status,
        updatedAt: new Date(),
      })
      .where(eq(registrationsTable.id, registration.id));
    const view = await getRegistrationView(registration.eventId, registration.studentId);
    res.json(RecordAttendanceResponse.parse(view));
  },
);

router.get(
  "/staff/announcements",
  requireRole("staff"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(announcementsTable)
      .orderBy(desc(announcementsTable.createdAt));
    res.json(
      ListManageAnnouncementsResponse.parse(
        rows.map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          published: row.published,
          createdAt: row.createdAt.toISOString(),
          isRead: false,
        })),
      ),
    );
  },
);

router.post(
  "/staff/announcements",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = CreateAnnouncementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [announcement] = await db
      .insert(announcementsTable)
      .values({
        title: parsed.data.title.trim(),
        body: parsed.data.body,
        published: true,
        createdBy: req.auth!.id,
      })
      .returning();
    res.status(201).json(
      CreateAnnouncementResponse.parse({
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        published: announcement.published,
        createdAt: announcement.createdAt.toISOString(),
        isRead: false,
      }),
    );
  },
);

router.patch(
  "/staff/announcements/:announcementId",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const params = UpdateAnnouncementParams.safeParse(req.params);
    const parsed = UpdateAnnouncementBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const update: Partial<typeof announcementsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.title !== undefined) update.title = parsed.data.title.trim();
    if (parsed.data.body !== undefined) update.body = parsed.data.body;
    if (parsed.data.published !== undefined) update.published = parsed.data.published;
    const [announcement] = await db
      .update(announcementsTable)
      .set(update)
      .where(eq(announcementsTable.id, params.data.announcementId))
      .returning();
    if (!announcement) {
      res.status(404).json({ error: "Announcement not found." });
      return;
    }
    res.json(
      UpdateAnnouncementResponse.parse({
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        published: announcement.published,
        createdAt: announcement.createdAt.toISOString(),
        isRead: false,
      }),
    );
  },
);

router.delete(
  "/staff/announcements/:announcementId",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const params = DeleteAnnouncementParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(announcementsTable)
      .where(eq(announcementsTable.id, params.data.announcementId))
      .returning({ id: announcementsTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Announcement not found." });
      return;
    }
    res.json(DeleteAnnouncementResponse.parse({ ok: true }));
  },
);

router.get(
  "/staff/reports/volunteer-hours",
  requireRole("staff"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select({
        studentId: usersTable.studentId,
        studentName: usersTable.name,
        email: usersTable.email,
        department: usersTable.department,
        eventTitle: eventsTable.title,
        eventDate: eventsTable.startsAt,
        hours: eventsTable.volunteerHours,
      })
      .from(registrationsTable)
      .innerJoin(usersTable, eq(registrationsTable.studentId, usersTable.id))
      .innerJoin(eventsTable, eq(registrationsTable.eventId, eventsTable.id))
      .where(eq(registrationsTable.attendanceStatus, "attended"))
      .orderBy(asc(usersTable.name), asc(eventsTable.startsAt));
    const csv = [
      [
        "Student ID",
        "Student name",
        "Email",
        "Department",
        "Event",
        "Event date",
        "Verified hours",
      ].map(csvCell).join(","),
      ...rows.map((row) =>
        [
          row.studentId,
          row.studentName,
          row.email,
          row.department,
          row.eventTitle,
          row.eventDate.toISOString(),
          Number(row.hours).toFixed(2),
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n");
    res
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .attachment("nss-volunteer-hours.csv")
      .send(`\uFEFF${csv}`);
  },
);

function toEventDates(data: {
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  venue: string;
  registrationDeadline: Date;
}) {
  return {
    title: data.title.trim(),
    description: data.description,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    venue: data.venue.trim(),
    registrationDeadline: data.registrationDeadline,
  };
}

function validEventDates(startsAt: Date, endsAt: Date, registrationDeadline: Date) {
  return (
    Number.isFinite(startsAt.getTime()) &&
    Number.isFinite(endsAt.getTime()) &&
    Number.isFinite(registrationDeadline.getTime()) &&
    endsAt > startsAt &&
    registrationDeadline < startsAt
  );
}

function csvCell(value: string | number | null): string {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export default router;
