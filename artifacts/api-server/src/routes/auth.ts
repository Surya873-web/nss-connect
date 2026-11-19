import { Router, type IRouter } from "express";
import {
  ChangeStudentPasswordBody,
  ChangeStudentPasswordResponse,
  GetStudentProfileResponse,
  GetSessionResponse,
  LoginBody,
  LoginResponse,
  RegisterStudentBody,
  RegisterStudentResponse,
  UpdateStudentProfileBody,
  UpdateStudentProfileResponse,
} from "@workspace/api-zod";
import {
  db,
  and,
  eq,
  gt,
  like,
  lt,
  or,
  sql,
  authLoginAttemptsTable,
  authSessionsTable,
  usersTable,
} from "@workspace/db";
import { isUniqueViolation } from "../lib/db-errors";
import {
  clearSession,
  createSession,
  digestToken,
  hashPassword,
  publicUser,
  requireAuth,
  requireCsrf,
  requireRole,
  resolveSession,
  verifyPassword,
} from "../lib/nss-auth";
import { verifiedHoursForStudent, studentProfileDto } from "../lib/nss-data";

const router: IRouter = Router();
const MAX_LOGIN_ATTEMPTS = 8;
const MAX_IP_LOGIN_ATTEMPTS = 30;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;
const LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastLoginAttemptCleanup = 0;

async function loginIsLocked(keyHash: string): Promise<boolean> {
  const [attempt] = await db
    .select({ lockedUntil: authLoginAttemptsTable.lockedUntil })
    .from(authLoginAttemptsTable)
    .where(
      and(
        eq(authLoginAttemptsTable.keyHash, keyHash),
        gt(authLoginAttemptsTable.lockedUntil, new Date()),
      ),
    )
    .limit(1);
  return Boolean(attempt);
}

async function recordLoginFailure(keyHash: string, threshold: number): Promise<void> {
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const lockedUntil = new Date(now.getTime() + LOGIN_LOCKOUT_MS);
  await db
    .insert(authLoginAttemptsTable)
    .values({
      keyHash,
      attempts: 1,
      windowStartedAt: now,
      lockedUntil: null,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        attempts: sql`CASE WHEN ${authLoginAttemptsTable.windowStartedAt} <= ${windowCutoff} THEN 1 ELSE ${authLoginAttemptsTable.attempts} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${authLoginAttemptsTable.windowStartedAt} <= ${windowCutoff} THEN ${now} ELSE ${authLoginAttemptsTable.windowStartedAt} END`,
        lockedUntil: sql`CASE WHEN ${authLoginAttemptsTable.windowStartedAt} <= ${windowCutoff} THEN NULL WHEN ${authLoginAttemptsTable.attempts} + 1 >= ${threshold} THEN ${lockedUntil} ELSE ${authLoginAttemptsTable.lockedUntil} END`,
        updatedAt: now,
      },
    });
}

async function clearLoginFailures(keyHash: string): Promise<void> {
  await db
    .delete(authLoginAttemptsTable)
    .where(eq(authLoginAttemptsTable.keyHash, keyHash));
}

async function cleanOldLoginAttempts(now: number): Promise<void> {
  if (now - lastLoginAttemptCleanup < LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS) return;
  await db
    .delete(authLoginAttemptsTable)
    .where(
      lt(
        authLoginAttemptsTable.updatedAt,
        new Date(now - LOGIN_ATTEMPT_RETENTION_MS),
      ),
    );
  lastLoginAttemptCleanup = now;
}

router.get("/auth/session", async (req, res): Promise<void> => {
  const user = await resolveSession(req);
  if (!user) {
    res.json(GetSessionResponse.parse({ authenticated: false, user: null, csrfToken: null }));
    return;
  }
  res.json(
    GetSessionResponse.parse({
      authenticated: true,
      user: publicUser(user),
      csrfToken: null,
    }),
  );
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your email or student ID and password." });
    return;
  }

  const identifier = parsed.data.identifier.trim();
  const now = Date.now();
  await cleanOldLoginAttempts(now);
  const ipKey = digestToken(`login-ip:${req.ip ?? "unknown"}`);
  if (await loginIsLocked(ipKey)) {
    res.status(429).json({ error: "Too many sign-in attempts. Please wait 15 minutes." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      identifier.includes("@")
        ? like(usersTable.email, identifier)
        : or(
            like(usersTable.email, identifier),
            eq(usersTable.studentId, identifier),
          ),
    )
    .limit(1);
  const accountKey = digestToken(
    user
      ? `login-user:${user.id}`
      : `login-identifier:${identifier.toLowerCase()}`,
  );
  if (await loginIsLocked(accountKey)) {
    res.status(429).json({ error: "Too many sign-in attempts. Please wait 15 minutes." });
    return;
  }
  if (
    !user ||
    (parsed.data.role === "staff" && user.role !== "staff") ||
    (user.role === "staff" && user.email.toLowerCase() !== identifier.toLowerCase()) ||
    !verifyPassword(parsed.data.password, user.passwordHash)
  ) {
    await Promise.all([
      recordLoginFailure(accountKey, MAX_LOGIN_ATTEMPTS),
      recordLoginFailure(ipKey, MAX_IP_LOGIN_ATTEMPTS),
    ]);
    res.status(401).json({ error: "The email/student ID or password is incorrect." });
    return;
  }
  await clearLoginFailures(accountKey);
  const session = await createSession(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      studentId: user.studentId,
      role: user.role as "student" | "staff",
      department: user.department,
      year: user.year,
      phone: user.phone,
    },
    res,
  );
  res.json(LoginResponse.parse(session));
});

router.post("/auth/logout", requireAuth, requireCsrf, async (req, res): Promise<void> => {
  await clearSession(req, res);
  res.json({ ok: true });
});

router.post("/auth/students", async (req, res): Promise<void> => {
  const parsed = RegisterStudentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  try {
    const [created] = await db
      .insert(usersTable)
      .values({
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        studentId: data.studentId.trim(),
        role: "student",
        passwordHash: hashPassword(data.password),
        department: data.department.trim(),
        year: data.year,
        phone: data.phone?.trim() || null,
      })
      .$returningId();
    const session = await createSession(
      {
        id: created.id,
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        studentId: data.studentId.trim(),
        role: "student",
        department: data.department.trim(),
        year: data.year,
        phone: data.phone?.trim() || null,
      },
      res,
    );
    res.status(201).json(RegisterStudentResponse.parse(session));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "That email or student ID is already registered." });
      return;
    }
    throw error;
  }
});

router.get("/student/profile", requireRole("student"), async (req, res): Promise<void> => {
  const user = req.auth!;
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Student profile not found." });
    return;
  }
  const hours = await verifiedHoursForStudent(user.id);
  res.json(GetStudentProfileResponse.parse(studentProfileDto(row, hours)));
});

router.patch(
  "/student/profile",
  requireRole("student"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = UpdateStudentProfileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await db
      .update(usersTable)
      .set(parsed.data)
      .where(eq(usersTable.id, req.auth!.id));
    const [row] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.id))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Student profile not found." });
      return;
    }
    const hours = await verifiedHoursForStudent(req.auth!.id);
    res.json(UpdateStudentProfileResponse.parse(studentProfileDto(row, hours)));
  },
);

router.post(
  "/student/password",
  requireRole("student"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = ChangeStudentPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.id))
      .limit(1);
    if (!user || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
      res.status(400).json({ error: "Current password is incorrect." });
      return;
    }
    await db
      .update(usersTable)
      .set({ passwordHash: hashPassword(parsed.data.newPassword) })
      .where(eq(usersTable.id, req.auth!.id));
    await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, req.auth!.id));
    await createSession(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        studentId: user.studentId,
        role: "student",
        department: user.department,
        year: user.year,
        phone: user.phone,
      },
      res,
    );
    res.json(ChangeStudentPasswordResponse.parse({ ok: true }));
  },
);

export default router;
