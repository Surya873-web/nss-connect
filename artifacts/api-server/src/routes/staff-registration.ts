import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { RegisterStaffBody, RegisterStaffResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { createSession, digestToken, hashPassword } from "../lib/nss-auth";

const router: IRouter = Router();
const STAFF_REGISTRATION_EMAIL = "suryasaravanan542@gmail.com";
const INVITATION_PASSWORD_MIN_LENGTH = 16;
const MAX_SIGNUP_ATTEMPTS = 5;
const SIGNUP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const signupAttempts = new Map<string, { count: number; resetAt: number }>();

router.post("/auth/staff", async (req, res): Promise<void> => {
  const parsed = RegisterStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const invitationPassword = process.env.STAFF_SIGNUP_INVITE_PASSWORD;
  if (
    !invitationPassword ||
    invitationPassword.length < INVITATION_PASSWORD_MIN_LENGTH ||
    invitationPassword.length > 128
  ) {
    res.status(503).json({
      error: "Staff signup is not configured. Contact the site operator.",
    });
    return;
  }

  const attemptKey = req.ip ?? "unknown";
  const now = Date.now();
  const existingAttempt = signupAttempts.get(attemptKey);
  if (
    existingAttempt &&
    existingAttempt.resetAt > now &&
    existingAttempt.count >= MAX_SIGNUP_ATTEMPTS
  ) {
    res.status(429).json({ error: "Too many attempts. Please wait 15 minutes." });
    return;
  }

  const data = parsed.data;
  const suppliedHash = Buffer.from(digestToken(`staff-signup:${data.invitationPassword}`), "hex");
  const expectedHash = Buffer.from(digestToken(`staff-signup:${invitationPassword}`), "hex");
  if (!timingSafeEqual(suppliedHash, expectedHash)) {
    const count =
      existingAttempt && existingAttempt.resetAt > now
        ? existingAttempt.count + 1
        : 1;
    signupAttempts.set(attemptKey, {
      count,
      resetAt: now + SIGNUP_ATTEMPT_WINDOW_MS,
    });
    res.status(401).json({ error: "The staff invitation password is incorrect." });
    return;
  }
  signupAttempts.delete(attemptKey);

  let user: Awaited<ReturnType<typeof createStaffAccount>>;
  try {
    user = await createStaffAccount(data.name.trim(), data.password);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A staff login already exists for this email." });
      return;
    }
    throw error;
  }

  const session = await createSession(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      studentId: user.studentId,
      role: "staff",
      department: user.department,
      year: user.year,
      phone: user.phone,
    },
    res,
  );
  res.status(201).json(RegisterStaffResponse.parse(session));
});

async function createStaffAccount(name: string, password: string) {
  const [user] = await db
    .insert(usersTable)
    .values({
      name,
      email: STAFF_REGISTRATION_EMAIL,
      studentId: null,
      role: "staff",
      passwordHash: hashPassword(password),
    })
    .returning();
  return user;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export default router;
