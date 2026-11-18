CREATE UNIQUE INDEX IF NOT EXISTS nss_users_email_lower_unique
  ON nss_users (LOWER(email));

CREATE OR REPLACE FUNCTION enforce_nss_staff_account_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'staff' THEN
    IF (SELECT COUNT(*) FROM nss_users WHERE role = 'staff') >= 100 THEN
      RAISE EXCEPTION 'Maximum staff limit reached.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_nss_staff_account_limit_trigger ON nss_users;
CREATE TRIGGER enforce_nss_staff_account_limit_trigger
BEFORE INSERT ON nss_users
FOR EACH ROW
EXECUTE FUNCTION enforce_nss_staff_account_limit();
