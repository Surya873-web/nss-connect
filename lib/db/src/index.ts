import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const parsedDatabaseUrl = new URL(databaseUrl);
if (parsedDatabaseUrl.protocol !== "mysql:") {
  throw new Error("DATABASE_URL must use the mysql:// scheme.");
}

export const pool = mysql.createPool({
  host: parsedDatabaseUrl.hostname,
  port: Number(parsedDatabaseUrl.port || 3306),
  user: decodeURIComponent(parsedDatabaseUrl.username),
  password: decodeURIComponent(parsedDatabaseUrl.password),
  database: decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)),
  timezone: "Z",
  waitForConnections: true,
  connectionLimit: 10,
  ssl:
    parsedDatabaseUrl.searchParams.get("ssl") === "true" ||
    parsedDatabaseUrl.searchParams.get("ssl-mode")?.toUpperCase() === "REQUIRED"
      ? {}
      : undefined,
});
export const db = drizzle(pool, { mode: "default", schema });

export * from "./schema";
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  like,
  lt,
  or,
  sql,
} from "drizzle-orm";
