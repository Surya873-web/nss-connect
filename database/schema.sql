-- NSS Connect PostgreSQL schema.
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
  ON nss_users (email);
CREATE UNIQUE INDEX IF NOT EXISTS nss_users_student_id_unique
  ON nss_users (student_id);
CREATE INDEX IF NOT EXISTS nss_users_name_idx
  ON nss_users (name);

CREATE TABLE IF NOT EXISTS nss_auth_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_hash TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES nss_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nss_auth_sessions_user_id_idx
  ON nss_auth_sessions (user_id);

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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS nss_registrations_event_student_unique
  ON nss_registrations (event_id, student_id);
CREATE INDEX IF NOT EXISTS nss_registrations_student_id_idx
  ON nss_registrations (student_id);
CREATE INDEX IF NOT EXISTS nss_registrations_event_id_idx
  ON nss_registrations (event_id);

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
