import { and, asc, count, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetStudentDashboardResponse,
  ListAnnouncementsResponse,
  ListStudentAttendanceResponse,
  MarkAnnouncementReadParams,
  MarkAnnouncementReadResponse,
} from "@workspace/api-zod";
import {
  db,
  announcementReadsTable,
  announcementsTable,
  eventsTable,
  registrationsTable,
} from "@workspace/db";
import { requireCsrf, requireRole } from "../lib/nss-auth";
import { eventDtos, verifiedHoursForStudent } from "../lib/nss-data";

const router: IRouter = Router();

router.get("/student/dashboard", requireRole("student"), async (req, res): Promise<void> => {
  const studentId = req.auth!.id;
  const now = new Date();
  const [registeredCount] = await db
    .select({ total: count() })
    .from(registrationsTable)
    .where(
      and(
        eq(registrationsTable.studentId, studentId),
        eq(registrationsTable.status, "registered"),
      ),
    );
  const attendanceRows = await db
    .select({
      attendanceStatus: registrationsTable.attendanceStatus,
      startsAt: eventsTable.startsAt,
    })
    .from(registrationsTable)
    .innerJoin(eventsTable, eq(registrationsTable.eventId, eventsTable.id))
    .where(eq(registrationsTable.studentId, studentId));
  const completedActivities = attendanceRows.filter(
    (row) => row.attendanceStatus === "attended" && row.startsAt < now,
  ).length;
  const attendedActivities = attendanceRows.filter(
    (row) => row.attendanceStatus === "attended",
  ).length;
  const upcomingRows = await db
    .select({ event: eventsTable })
    .from(registrationsTable)
    .innerJoin(eventsTable, eq(registrationsTable.eventId, eventsTable.id))
    .where(
      and(
        eq(registrationsTable.studentId, studentId),
        eq(registrationsTable.status, "registered"),
        eq(eventsTable.status, "published"),
        gt(eventsTable.startsAt, now),
      ),
    )
    .orderBy(asc(eventsTable.startsAt))
    .limit(5);
  const allPublished = await db
    .select({ id: announcementsTable.id })
    .from(announcementsTable)
    .where(eq(announcementsTable.published, true));
  const readRows =
    allPublished.length === 0
      ? []
      : await db
          .select({ announcementId: announcementReadsTable.announcementId })
          .from(announcementReadsTable)
          .where(
            and(
              eq(announcementReadsTable.studentId, studentId),
              inArray(
                announcementReadsTable.announcementId,
                allPublished.map((item) => item.id),
              ),
            ),
          );
  const events = await eventDtos(
    upcomingRows.map((row) => row.event),
    studentId,
  );
  res.json(
    GetStudentDashboardResponse.parse({
      registeredEvents: registeredCount.total,
      completedActivities,
      attendedActivities,
      verifiedHours: await verifiedHoursForStudent(studentId),
      upcomingEvents: events,
      unreadAnnouncements: Math.max(0, allPublished.length - readRows.length),
    }),
  );
});

router.get("/student/attendance", requireRole("student"), async (req, res): Promise<void> => {
  const rows = await db
    .select({
      registrationId: registrationsTable.id,
      eventId: eventsTable.id,
      eventTitle: eventsTable.title,
      eventDate: eventsTable.startsAt,
      venue: eventsTable.venue,
      status: registrationsTable.attendanceStatus,
      volunteerHours: eventsTable.volunteerHours,
    })
    .from(registrationsTable)
    .innerJoin(eventsTable, eq(registrationsTable.eventId, eventsTable.id))
    .where(
      and(
        eq(registrationsTable.studentId, req.auth!.id),
        inArray(registrationsTable.attendanceStatus, ["attended", "absent"]),
      ),
    )
    .orderBy(desc(eventsTable.startsAt));
  res.json(
    ListStudentAttendanceResponse.parse(
      rows.map((row) => ({
        registrationId: row.registrationId,
        eventId: row.eventId,
        eventTitle: row.eventTitle,
        eventDate: row.eventDate.toISOString(),
        venue: row.venue,
        status: row.status,
        verifiedHours:
          row.status === "attended" ? Number(row.volunteerHours) : 0,
      })),
    ),
  );
});

router.get("/announcements", requireRole("student"), async (req, res): Promise<void> => {
  const rows = await db
    .select({
      announcement: announcementsTable,
      readAt: announcementReadsTable.readAt,
    })
    .from(announcementsTable)
    .leftJoin(
      announcementReadsTable,
      and(
        eq(announcementReadsTable.announcementId, announcementsTable.id),
        eq(announcementReadsTable.studentId, req.auth!.id),
      ),
    )
    .where(eq(announcementsTable.published, true))
    .orderBy(desc(announcementsTable.createdAt));
  res.json(
    ListAnnouncementsResponse.parse(
      rows.map(({ announcement, readAt }) => ({
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        published: announcement.published,
        createdAt: announcement.createdAt.toISOString(),
        isRead: readAt !== null,
      })),
    ),
  );
});

router.post(
  "/announcements/:announcementId/read",
  requireRole("student"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const params = MarkAnnouncementReadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [announcement] = await db
      .select({ id: announcementsTable.id })
      .from(announcementsTable)
      .where(
        and(
          eq(announcementsTable.id, params.data.announcementId),
          eq(announcementsTable.published, true),
        ),
      )
      .limit(1);
    if (!announcement) {
      res.status(404).json({ error: "Announcement not found." });
      return;
    }
    await db
      .insert(announcementReadsTable)
      .values({
        announcementId: announcement.id,
        studentId: req.auth!.id,
      })
      .onConflictDoNothing();
    res.json(MarkAnnouncementReadResponse.parse({ ok: true }));
  },
);

export default router;
