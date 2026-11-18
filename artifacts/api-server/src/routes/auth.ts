import { eq, ilike, or } from "drizzle-orm";
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
import { db, authSessionsTable, usersTable } from "@workspace/db";
import { isUniqueViolation } from "../lib/db-errors";
import {
  clearSession,
  createSession,
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
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

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
  const key = `${req.ip ?? "unknown"}:${identifier.toLowerCase()}`;
  const now = Date.now();
  const existingAttempt = attempts.get(key);
  if (existingAttempt && existingAttempt.resetAt > now && existingAttempt.count >= MAX_LOGIN_ATTEMPTS) {
    res.status(429).json({ error: "Too many sign-in attempts. Please wait 15 minutes." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      identifier.includes("@")
        ? ilike(usersTable.email, identifier)
        : or(
            ilike(usersTable.email, identifier),
            eq(usersTable.studentId, identifier),
          ),
    )
    .limit(1);
  if (
    !user ||
    (user.role === "staff" && user.email.toLowerCase() !== identifier.toLowerCase()) ||
    !verifyPassword(parsed.data.password, user.passwordHash)
  ) {
    const count =
      existingAttempt && existingAttempt.resetAt > now
        ? existingAttempt.count + 1
        : 1;
    attempts.set(key, { count, resetAt: now + LOGIN_WINDOW_MS });
    res.status(401).json({ error: "The email/student ID or password is incorrect." });
    return;
  }
  attempts.delete(key);
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
    const [user] = await db
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
      .returning();
    const session = await createSession(
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
    const [row] = await db
      .update(usersTable)
      .set(parsed.data)
      .where(eq(usersTable.id, req.auth!.id))
      .returning();
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
