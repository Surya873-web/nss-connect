import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  decimal,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "nss_users",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    studentId: varchar("student_id", { length: 60 }),
    role: varchar("role", { length: 16 }).notNull().default("student"),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    department: varchar("department", { length: 120 }),
    year: integer("year"),
    phone: varchar("phone", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("nss_users_email_unique").on(table.email),
    uniqueIndex("nss_users_student_id_unique").on(table.studentId),
    index("nss_users_name_idx").on(table.name),
    index("nss_users_role_idx").on(table.role),
  ],
);

export const staffSignupCodesTable = pgTable(
  "nss_staff_signup_codes",
  {
    email: varchar("email", { length: 320 }).primaryKey(),
    codeHash: varchar("code_hash", { length: 128 }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("nss_staff_signup_codes_expires_at_idx").on(table.expiresAt)],
);

export const authSessionsTable = pgTable(
  "nss_auth_sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    csrfHash: varchar("csrf_hash", { length: 64 }).notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("nss_auth_sessions_user_id_idx").on(table.userId)],
);

export const authLoginAttemptsTable = pgTable(
  "nss_auth_login_attempts",
  {
    keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
    attempts: integer("attempts").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("nss_auth_login_attempts_updated_at_idx").on(table.updatedAt)],
);

export const staffAuditLogsTable = pgTable(
  "nss_staff_audit_logs",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: integer("entity_id"),
    details: jsonb("details")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("nss_staff_audit_logs_actor_created_idx").on(table.actorId, table.createdAt),
    index("nss_staff_audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const eventsTable = pgTable(
  "nss_events",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    venue: varchar("venue", { length: 180 }).notNull(),
    registrationDeadline: timestamp("registration_deadline", { withTimezone: true }).notNull(),
    volunteerHours: decimal("volunteer_hours", { precision: 5, scale: 2 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    status: varchar("status", { length: 16 }).notNull().default("registered"),
    attendanceStatus: varchar("attendance_status", { length: 16 }),
    attendanceHours: decimal("attendance_hours", { precision: 5, scale: 2 }),
    attendanceMarkedAt: timestamp("attendance_marked_at", { withTimezone: true }),
    attendanceMarkedBy: integer("attendance_marked_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    attendanceSource: varchar("attendance_source", { length: 16 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("nss_registrations_event_student_unique").on(table.eventId, table.studentId),
    index("nss_registrations_student_id_idx").on(table.studentId),
    index("nss_registrations_event_id_idx").on(table.eventId),
  ],
);

export const announcementsTable = pgTable(
  "nss_announcements",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    published: boolean("published").notNull().default(true),
    createdBy: integer("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("nss_announcements_published_idx").on(table.published)],
);

export const attendanceQrTokensTable = pgTable(
  "nss_attendance_qr_tokens",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("nss_attendance_qr_tokens_event_idx").on(table.eventId),
    index("nss_attendance_qr_tokens_expires_idx").on(table.expiresAt),
  ],
);

export const volunteerCertificatesTable = pgTable(
  "nss_volunteer_certificates",
  {
    id: serial("id").primaryKey(),
    certificateId: varchar("certificate_id", { length: 64 }).notNull().unique(),
    registrationId: integer("registration_id")
      .notNull()
      .references(() => registrationsTable.id, { onDelete: "cascade" })
      .unique(),
    studentId: integer("student_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    eventTitle: varchar("event_title", { length: 180 }),
    volunteerHours: decimal("volunteer_hours", { precision: 5, scale: 2 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    rejectionReason: varchar("rejection_reason", { length: 500 }),
    collegeName: varchar("college_name", { length: 200 }),
    unitName: varchar("unit_name", { length: 120 }),
    studentName: varchar("student_name", { length: 120 }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: integer("reviewed_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
  },
  (table) => [
    index("nss_volunteer_certificates_student_idx").on(table.studentId),
    index("nss_volunteer_certificates_status_idx").on(table.status, table.requestedAt),
  ],
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
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("nss_announcement_reads_announcement_student_unique").on(
      table.announcementId,
      table.studentId,
    ),
    index("nss_announcement_reads_student_id_idx").on(table.studentId),
  ],
);
