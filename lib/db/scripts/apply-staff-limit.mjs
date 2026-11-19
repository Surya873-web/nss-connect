import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const parsedUrl = new URL(databaseUrl);
const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl:
    parsedUrl.searchParams.get("ssl") === "true" ||
    parsedUrl.searchParams.get("sslmode")?.toLowerCase() === "require"
      ? { rejectUnauthorized: false }
      : undefined,
});
try {
  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_nss_staff_account_limit()
    RETURNS TRIGGER AS $function$
    BEGIN
      IF NEW.role = 'staff' AND
        (SELECT COUNT(*) FROM nss_users WHERE role = 'staff') >= 100
      THEN
        RAISE EXCEPTION 'Maximum staff limit reached.' USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $function$ LANGUAGE plpgsql;
  `);
  await pool.query("DROP TRIGGER IF EXISTS enforce_nss_staff_account_limit_trigger ON nss_users");
  await pool.query(`
    CREATE TRIGGER enforce_nss_staff_account_limit_trigger
    BEFORE INSERT ON nss_users
    FOR EACH ROW
    EXECUTE FUNCTION enforce_nss_staff_account_limit()
  `);
  console.info("PostgreSQL staff account limit applied.");
} finally {
  await pool.end();
}
