ALTER TABLE nss_registrations
  ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_marked_by INTEGER REFERENCES nss_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendance_source TEXT,
  ADD COLUMN IF NOT EXISTS attendance_hours NUMERIC(5, 2);

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
