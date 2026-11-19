ALTER TABLE nss_volunteer_certificates
  ADD COLUMN IF NOT EXISTS event_title TEXT;
