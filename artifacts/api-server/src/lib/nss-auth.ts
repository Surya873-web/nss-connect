import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, db, eq, gt, authSessionsTable, usersTable } from "@workspace/db";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  studentId: string | null;
  role: "student" | "staff";
  department: string | null;
  year: number | null;
  phone: string | null;
};

export type AuthContext = SessionUser & {
  tokenHash: string;
  csrfHash: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const SESSION_COOKIE = "nss_session";
const CSRF_COOKIE = "nss_csrf";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

export function digestToken(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, salt, expected.length, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function cookieValue(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator < 0 || trimmed.slice(0, separator) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(separator + 1));
    } catch {
      return null;
    }
  }
  return null;
}

export async function resolveSession(req: Request): Promise<AuthContext | null> {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = digestToken(token);
  const [row] = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      studentId: usersTable.studentId,
      role: usersTable.role,
      department: usersTable.department,
      year: usersTable.year,
      phone: usersTable.phone,
      csrfHash: authSessionsTable.csrfHash,
    })
    .from(authSessionsTable)
    .innerJoin(usersTable, eq(authSessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(authSessionsTable.tokenHash, tokenHash),
        gt(authSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row || (row.role !== "student" && row.role !== "staff")) return null;
  return {
    id: row.userId,
    name: row.name,
    email: row.email,
    studentId: row.studentId,
    role: row.role,
    department: row.department,
    year: row.year,
    phone: row.phone,
    tokenHash,
    csrfHash: row.csrfHash,
  };
}

export async function attachOptionalSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    req.auth = (await resolveSession(req)) ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    req.auth = (await resolveSession(req)) ?? undefined;
    if (!req.auth) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(role: "student" | "staff") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.auth = (await resolveSession(req)) ?? undefined;
      if (!req.auth) {
        res.status(401).json({ error: "Sign in to continue." });
        return;
      }
      if (req.auth.role !== role) {
        res.status(403).json({ error: "You do not have access to this resource." });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function requireCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.get("x-csrf-token");
  const cookie = cookieValue(req, CSRF_COOKIE);
  const auth = req.auth;
  if (
    !auth ||
    !header ||
    !cookie ||
    header !== cookie ||
    digestToken(header) !== auth.csrfHash
  ) {
    res.status(403).json({ error: "Security token expired. Refresh and try again." });
    return;
  }
  next();
}

export async function createSession(
  user: SessionUser,
  res: Response,
): Promise<{ authenticated: true; user: ReturnType<typeof publicUser>; csrfToken: string }> {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const tokenHash = digestToken(token);
  const csrfHash = digestToken(csrfToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(authSessionsTable).values({
    tokenHash,
    csrfHash,
    userId: user.id,
    expiresAt,
  });
  const secure = process.env.NODE_ENV === "production";
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api",
    maxAge: SESSION_TTL_MS,
  });
  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
  return { authenticated: true, user: publicUser(user), csrfToken };
}

export async function clearSession(req: Request, res: Response): Promise<void> {
  const token = cookieValue(req, SESSION_COOKIE);
  if (token) {
    await db.delete(authSessionsTable).where(eq(authSessionsTable.tokenHash, digestToken(token)));
  }
  const secure = process.env.NODE_ENV === "production";
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: "lax", path: "/api" });
  res.clearCookie(CSRF_COOKIE, { secure, sameSite: "lax", path: "/" });
}

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    studentId: user.studentId,
    role: user.role,
  };
}

export function userFromRow(row: {
  id: number;
  name: string;
  email: string;
  studentId: string | null;
  role: string;
  department: string | null;
  year: number | null;
  phone: string | null;
}): SessionUser | null {
  if (row.role !== "student" && row.role !== "staff") return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    studentId: row.studentId,
    role: row.role,
    department: row.department,
    year: row.year,
    phone: row.phone,
  };
}
