import { timingSafeEqual } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  RegisterStaffBody,
  RegisterStaffResponse,
  ResetStaffPasswordBody,
  ValidateStaffInvitationBody,
} from "@workspace/api-zod";
import { authSessionsTable, db, usersTable } from "@workspace/db";
import { isUniqueViolation } from "../lib/db-errors";
import { createSession, digestToken, hashPassword, requireCsrf, requireRole } from "../lib/nss-auth";

const router: IRouter = Router();
const STAFF_REGISTRATION_EMAIL = "suryasaravanan542@gmail.com";
const INVITATION_PASSWORD_MIN_LENGTH = 15;
const MAX_SIGNUP_ATTEMPTS = 5;
const SIGNUP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const STAFF_ACCOUNT_LIMIT = 100;
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

router.post("/auth/staff/password", async (req, res): Promise<void> => {
  const parsed = ResetStaffPasswordBody.safeParse(req.body);
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

  const reset = await db.transaction(async (tx) => {
    const [staff] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, STAFF_REGISTRATION_EMAIL), eq(usersTable.role, "staff")))
      .limit(1);
    if (!staff) return false;

    await tx
      .update(usersTable)
      .set({ passwordHash: hashPassword(parsed.data.newPassword) })
      .where(eq(usersTable.id, staff.id));
    await tx
      .delete(authSessionsTable)
      .where(eq(authSessionsTable.userId, staff.id));
    return true;
  });

  if (!reset) {
    res.status(404).json({ error: "No staff login exists for this account." });
    return;
  }

  res.status(204).end();
});

router.post(
  "/auth/staff",
  requireRole("staff"),
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = RegisterStaffBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (parsed.data.password !== parsed.data.confirmPassword) {
      res.status(400).json({ error: "Password and Confirm Password must match." });
      return;
    }

    try {
      const user = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(3942026001)`);
        const [countRow] = await tx
          .select({ total: count() })
          .from(usersTable)
          .where(eq(usersTable.role, "staff"));
        if (countRow.total >= STAFF_ACCOUNT_LIMIT) return null;
        const [created] = await tx
          .insert(usersTable)
          .values({
            name: parsed.data.name.trim(),
            email: parsed.data.email.trim().toLowerCase(),
            studentId: null,
            role: "staff",
            passwordHash: hashPassword(parsed.data.password),
          })
          .returning();
        return created;
      });
      if (!user) {
        res.status(409).json({ error: "Maximum staff limit reached." });
        return;
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
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "A staff account already uses that email address." });
        return;
      }
      throw error;
    }
  },
);

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

export default router;
