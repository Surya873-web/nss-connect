import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  RegisterStaffBody,
  RegisterStaffResponse,
  ValidateStaffInvitationBody,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { isUniqueViolation } from "../lib/db-errors";
import { createSession, digestToken, hashPassword } from "../lib/nss-auth";

const router: IRouter = Router();
const STAFF_REGISTRATION_EMAIL = "suryasaravanan542@gmail.com";
const INVITATION_PASSWORD_MIN_LENGTH = 15;
const MAX_SIGNUP_ATTEMPTS = 5;
const SIGNUP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const signupAttempts = new Map<string, { count: number; resetAt: number }>();

router.post("/auth/staff/invitation", async (req, res): Promise<void> => {
  const parsed = ValidateStaffInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const validationError = validateInvitationPassword(
    parsed.data.invitationPassword,
    req.ip ?? "unknown",
  );
  if (validationError) {
    res.status(validationError.status).json({ error: validationError.message });
    return;
  }

  res.status(204).end();
});

router.post("/auth/staff", async (req, res): Promise<void> => {
  const parsed = RegisterStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const validationError = validateInvitationPassword(data.invitationPassword, req.ip ?? "unknown");
  if (validationError) {
    res.status(validationError.status).json({ error: validationError.message });
    return;
  }

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

function validateInvitationPassword(
  suppliedPassword: string,
  attemptKey: string,
): { status: 401 | 429 | 503; message: string } | null {
  const invitationPassword = process.env.STAFF_SIGNUP_INVITE_PASSWORD;
  if (
    !invitationPassword ||
    invitationPassword.length < INVITATION_PASSWORD_MIN_LENGTH ||
    invitationPassword.length > 128
  ) {
    return {
      status: 503,
      message: "Staff signup is not configured. Contact the site operator.",
    };
  }

  const now = Date.now();
  const existingAttempt = signupAttempts.get(attemptKey);
  if (
    existingAttempt &&
    existingAttempt.resetAt > now &&
    existingAttempt.count >= MAX_SIGNUP_ATTEMPTS
  ) {
    return { status: 429, message: "Too many attempts. Please wait 15 minutes." };
  }

  const suppliedHash = Buffer.from(digestToken(`staff-signup:${suppliedPassword}`), "hex");
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
    return { status: 401, message: "Incorrect password. Please try again." };
  }

  signupAttempts.delete(attemptKey);
  return null;
}

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

export default router;
