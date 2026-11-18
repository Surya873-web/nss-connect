import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query(`
    DROP INDEX IF EXISTS nss_users_email_lower_unique;
    CREATE UNIQUE INDEX nss_users_email_lower_unique
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
  `);
  console.log("Staff account database limit applied.");
} finally {
  await client.end();
}
