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
