-- NSS Connect MySQL schema.
-- This file is equivalent to lib/db/src/schema/nss.ts.

CREATE TABLE IF NOT EXISTS nss_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  student_id TEXT,
  role TEXT NOT NULL DEFAULT 'student',
  password_hash TEXT NOT NULL,
  department TEXT,
  year INTEGER,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS nss_users_email_lower_unique
  ON nss_users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS nss_users_student_id_unique
  ON nss_users (student_id);
CREATE INDEX IF NOT EXISTS nss_users_name_idx
  ON nss_users (name);

CREATE TABLE IF NOT EXISTS nss_staff_signup_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS nss_staff_signup_codes_expires_at_idx
  ON nss_staff_signup_codes (expires_at);

CREATE TABLE IF NOT EXISTS nss_auth_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_hash TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES nss_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nss_auth_sessions_user_id_idx
  ON nss_auth_sessions (user_id);

CREATE TABLE IF NOT EXISTS nss_auth_login_attempts (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nss_auth_login_attempts_updated_at_idx
  ON nss_auth_login_attempts (updated_at);

CREATE TABLE IF NOT EXISTS nss_staff_audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES nss_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nss_staff_audit_logs_actor_created_idx
  ON nss_staff_audit_logs (actor_id, created_at);
CREATE INDEX IF NOT EXISTS nss_staff_audit_logs_entity_idx
  ON nss_staff_audit_logs (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS nss_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  venue TEXT NOT NULL,
  registration_deadline TIMESTAMPTZ NOT NULL,
  volunteer_hours NUMERIC(5, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by INTEGER NOT NULL REFERENCES nss_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nss_events_status_starts_at_idx
  ON nss_events (status, starts_at);

CREATE TABLE IF NOT EXISTS nss_registrations (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES nss_events(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES nss_users(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'registered',
  attendance_status TEXT,
  attendance_hours NUMERIC(5, 2),
  attendance_marked_at TIMESTAMPTZ,
  attendance_marked_by INTEGER REFERENCES nss_users(id) ON DELETE SET NULL,
  attendance_source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS nss_registrations_event_student_unique
  ON nss_registrations (event_id, student_id);
CREATE INDEX IF NOT EXISTS nss_registrations_student_id_idx
  ON nss_registrations (student_id);
CREATE INDEX IF NOT EXISTS nss_registrations_event_id_idx
  ON nss_registrations (event_id);

CREATE TABLE IF NOT EXISTS nss_attendance_qr_tokens (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES nss_events(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES nss_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nss_attendance_qr_tokens_event_idx
  ON nss_attendance_qr_tokens (event_id);
CREATE INDEX IF NOT EXISTS nss_attendance_qr_tokens_expires_idx
  ON nss_attendance_qr_tokens (expires_at);

CREATE TABLE IF NOT EXISTS nss_volunteer_certificates (
  id SERIAL PRIMARY KEY,
  certificate_id TEXT NOT NULL UNIQUE,
  registration_id INTEGER NOT NULL UNIQUE
    REFERENCES nss_registrations(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES nss_users(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES nss_events(id) ON DELETE CASCADE,
  event_title TEXT,
  volunteer_hours NUMERIC(5, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  college_name TEXT,
  unit_name TEXT,
  student_name TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by INTEGER REFERENCES nss_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS nss_volunteer_certificates_student_idx
  ON nss_volunteer_certificates (student_id);
CREATE INDEX IF NOT EXISTS nss_volunteer_certificates_status_idx
  ON nss_volunteer_certificates (status, requested_at);

CREATE TABLE IF NOT EXISTS nss_announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER NOT NULL REFERENCES nss_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nss_announcements_published_idx
  ON nss_announcements (published);

CREATE TABLE IF NOT EXISTS nss_announcement_reads (
  announcement_id INTEGER NOT NULL
    REFERENCES nss_announcements(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL
    REFERENCES nss_users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS nss_announcement_reads_announcement_student_unique
  ON nss_announcement_reads (announcement_id, student_id);
CREATE INDEX IF NOT EXISTS nss_announcement_reads_student_id_idx
  ON nss_announcement_reads (student_id);
