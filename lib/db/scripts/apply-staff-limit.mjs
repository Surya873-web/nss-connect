import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const connection = await mysql.createConnection(databaseUrl);
try {
  await connection.query("DROP TRIGGER IF EXISTS enforce_nss_staff_account_limit_trigger");
  await connection.query(`
    CREATE TRIGGER enforce_nss_staff_account_limit_trigger
    BEFORE INSERT ON nss_users
    FOR EACH ROW
    BEGIN
      IF NEW.role = 'staff' AND
        (SELECT COUNT(*) FROM nss_users WHERE role = 'staff') >= 100
      THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Maximum staff limit reached.';
      END IF;
    END
  `);
  console.info("MySQL staff account limit applied.");
} finally {
  await connection.end();
}
