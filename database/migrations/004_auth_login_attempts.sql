CREATE TABLE IF NOT EXISTS nss_auth_login_attempts (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nss_auth_login_attempts_updated_at_idx
  ON nss_auth_login_attempts (updated_at);
