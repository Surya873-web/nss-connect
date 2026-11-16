import { and, eq, inArray } from "drizzle-orm";
import { db, eventsTable, registrationsTable } from "@workspace/db";

export function eventDto(
  event: typeof eventsTable.$inferSelect,
  registrationCount: number,
  myRegistrationStatus: string | null = null,
) {
  const status =
    event.status === "published" && event.startsAt.getTime() < Date.now()
      ? "completed"
      : event.status;
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    venue: event.venue,
    registrationDeadline: event.registrationDeadline.toISOString(),
    volunteerHours: Number(event.volunteerHours),
    status,
    registrationCount,
    myRegistrationStatus,
  };
}

export async function eventDtos(
  rows: (typeof eventsTable.$inferSelect)[],
  studentId?: number,
) {
  const eventIds = rows.map((row) => row.id);
  const registrationRows =
    eventIds.length === 0
      ? []
      : await db
          .select({
            eventId: registrationsTable.eventId,
            studentId: registrationsTable.studentId,
            status: registrationsTable.status,
            attendanceStatus: registrationsTable.attendanceStatus,
          })
          .from(registrationsTable)
          .where(inArray(registrationsTable.eventId, eventIds));
  const counts = new Map<number, number>();
  const mine = new Map<number, string | null>();
  for (const registration of registrationRows) {
    if (registration.status !== "cancelled") {
      counts.set(registration.eventId, (counts.get(registration.eventId) ?? 0) + 1);
    }
    if (registration.studentId === studentId) {
      mine.set(
        registration.eventId,
        registration.status === "cancelled"
          ? "cancelled"
          : registration.attendanceStatus ?? "registered",
      );
    }
  }
  return rows.map((row) =>
    eventDto(row, counts.get(row.id) ?? 0, mine.get(row.id) ?? null),
  );
}

export function studentProfileDto(
  user: {
    id: number;
    name: string;
    email: string;
    studentId: string | null;
    department: string | null;
    year: number | null;
    phone: string | null;
    role: string;
  },
  verifiedHours: number,
) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    studentId: user.studentId ?? "",
    department: user.department ?? "",
    year: user.year ?? 1,
    phone: user.phone,
    role: user.role,
    verifiedHours,
  };
}

export async function verifiedHoursForStudent(studentId: number): Promise<number> {
  const rows = await db
    .select({
      hours: eventsTable.volunteerHours,
    })
    .from(registrationsTable)
    .innerJoin(eventsTable, eq(registrationsTable.eventId, eventsTable.id))
    .where(
      and(
        eq(registrationsTable.studentId, studentId),
        eq(registrationsTable.attendanceStatus, "attended"),
      ),
    );
  return rows.reduce((total, row) => total + Number(row.hours), 0);
}
