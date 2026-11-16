import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "nss_users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    studentId: text("student_id"),
    role: text("role").notNull().default("student"),
    passwordHash: text("password_hash").notNull(),
    department: text("department"),
    year: integer("year"),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("nss_users_email_lower_unique").on(table.email),
    uniqueIndex("nss_users_student_id_unique").on(table.studentId),
    index("nss_users_name_idx").on(table.name),
  ],
);

export const authSessionsTable = pgTable(
  "nss_auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    csrfHash: text("csrf_hash").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("nss_auth_sessions_user_id_idx").on(table.userId)],
);

export const eventsTable = pgTable(
  "nss_events",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    venue: text("venue").notNull(),
    registrationDeadline: timestamp("registration_deadline", {
      withTimezone: true,
    }).notNull(),
    volunteerHours: numeric("volunteer_hours", {
      precision: 5,
      scale: 2,
    }).notNull(),
    status: text("status").notNull().default("draft"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("nss_events_status_starts_at_idx").on(table.status, table.startsAt),
  ],
);

export const registrationsTable = pgTable(
  "nss_registrations",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    registeredAt: timestamp("registered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: text("status").notNull().default("registered"),
    attendanceStatus: text("attendance_status"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("nss_registrations_event_student_unique").on(
      table.eventId,
      table.studentId,
    ),
    index("nss_registrations_student_id_idx").on(table.studentId),
    index("nss_registrations_event_id_idx").on(table.eventId),
  ],
);

export const announcementsTable = pgTable(
  "nss_announcements",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    published: boolean("published").notNull().default(true),
    createdBy: integer("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("nss_announcements_published_idx").on(table.published)],
);

export const announcementReadsTable = pgTable(
  "nss_announcement_reads",
  {
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcementsTable.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("nss_announcement_reads_announcement_student_unique").on(
      table.announcementId,
      table.studentId,
    ),
    index("nss_announcement_reads_student_id_idx").on(table.studentId),
  ],
);
