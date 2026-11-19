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
