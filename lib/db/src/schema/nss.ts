import {
  boolean,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  decimal,
} from "drizzle-orm/mysql-core";

export const usersTable = mysqlTable(
  "nss_users",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    studentId: varchar("student_id", { length: 60 }),
    role: varchar("role", { length: 16 }).notNull().default("student"),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    department: varchar("department", { length: 120 }),
    year: int("year"),
    phone: varchar("phone", { length: 40 }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("nss_users_email_unique").on(table.email),
    uniqueIndex("nss_users_student_id_unique").on(table.studentId),
    index("nss_users_name_idx").on(table.name),
    index("nss_users_role_idx").on(table.role),
  ],
);

export const staffSignupCodesTable = mysqlTable(
  "nss_staff_signup_codes",
  {
    email: varchar("email", { length: 320 }).primaryKey(),
    codeHash: varchar("code_hash", { length: 128 }).notNull(),
    attempts: int("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    lastSentAt: timestamp("last_sent_at", { mode: "date" }).notNull(),
  },
  (table) => [index("nss_staff_signup_codes_expires_at_idx").on(table.expiresAt)],
);

export const authSessionsTable = mysqlTable(
  "nss_auth_sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    csrfHash: varchar("csrf_hash", { length: 64 }).notNull(),
    userId: int("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("nss_auth_sessions_user_id_idx").on(table.userId)],
);

export const authLoginAttemptsTable = mysqlTable(
  "nss_auth_login_attempts",
  {
    keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
    attempts: int("attempts").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { mode: "date" }).notNull(),
    lockedUntil: timestamp("locked_until", { mode: "date" }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("nss_auth_login_attempts_updated_at_idx").on(table.updatedAt)],
);

export const staffAuditLogsTable = mysqlTable(
  "nss_staff_audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorId: int("actor_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: int("entity_id"),
    details: json("details")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("nss_staff_audit_logs_actor_created_idx").on(table.actorId, table.createdAt),
    index("nss_staff_audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const eventsTable = mysqlTable(
  "nss_events",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    startsAt: timestamp("starts_at", { mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { mode: "date" }).notNull(),
    venue: varchar("venue", { length: 180 }).notNull(),
    registrationDeadline: timestamp("registration_deadline", { mode: "date" }).notNull(),
    volunteerHours: decimal("volunteer_hours", { precision: 5, scale: 2 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    createdBy: int("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("nss_events_status_starts_at_idx").on(table.status, table.startsAt),
  ],
);

export const registrationsTable = mysqlTable(
  "nss_registrations",
  {
    id: int("id").autoincrement().primaryKey(),
    eventId: int("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    studentId: int("student_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    registeredAt: timestamp("registered_at", { mode: "date" }).notNull().defaultNow(),
    status: varchar("status", { length: 16 }).notNull().default("registered"),
    attendanceStatus: varchar("attendance_status", { length: 16 }),
    attendanceHours: decimal("attendance_hours", { precision: 5, scale: 2 }),
    attendanceMarkedAt: timestamp("attendance_marked_at", { mode: "date" }),
    attendanceMarkedBy: int("attendance_marked_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    attendanceSource: varchar("attendance_source", { length: 16 }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
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

export const announcementsTable = mysqlTable(
  "nss_announcements",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    published: boolean("published").notNull().default(true),
    createdBy: int("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("nss_announcements_published_idx").on(table.published)],
);

export const attendanceQrTokensTable = mysqlTable(
  "nss_attendance_qr_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    eventId: int("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdBy: int("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("nss_attendance_qr_tokens_event_idx").on(table.eventId),
    index("nss_attendance_qr_tokens_expires_idx").on(table.expiresAt),
  ],
);

export const volunteerCertificatesTable = mysqlTable(
  "nss_volunteer_certificates",
  {
    id: int("id").autoincrement().primaryKey(),
    certificateId: varchar("certificate_id", { length: 64 }).notNull().unique(),
    registrationId: int("registration_id")
      .notNull()
      .references(() => registrationsTable.id, { onDelete: "cascade" })
      .unique(),
    studentId: int("student_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    eventId: int("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    eventTitle: varchar("event_title", { length: 180 }),
    volunteerHours: decimal("volunteer_hours", { precision: 5, scale: 2 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    rejectionReason: varchar("rejection_reason", { length: 500 }),
    collegeName: varchar("college_name", { length: 200 }),
    unitName: varchar("unit_name", { length: 120 }),
    studentName: varchar("student_name", { length: 120 }),
    requestedAt: timestamp("requested_at", { mode: "date" }).notNull().defaultNow(),
    reviewedBy: int("reviewed_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    issuedAt: timestamp("issued_at", { mode: "date" }),
  },
  (table) => [
    index("nss_volunteer_certificates_student_idx").on(table.studentId),
    index("nss_volunteer_certificates_status_idx").on(table.status, table.requestedAt),
  ],
);

export const announcementReadsTable = mysqlTable(
  "nss_announcement_reads",
  {
    announcementId: int("announcement_id")
      .notNull()
      .references(() => announcementsTable.id, { onDelete: "cascade" }),
    studentId: int("student_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("nss_announcement_reads_announcement_student_unique").on(
      table.announcementId,
      table.studentId,
    ),
    index("nss_announcement_reads_student_id_idx").on(table.studentId),
  ],
);
