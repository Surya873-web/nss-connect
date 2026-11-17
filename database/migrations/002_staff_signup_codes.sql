CREATE TABLE IF NOT EXISTS nss_staff_signup_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS nss_staff_signup_codes_expires_at_idx
  ON nss_staff_signup_codes (expires_at);
