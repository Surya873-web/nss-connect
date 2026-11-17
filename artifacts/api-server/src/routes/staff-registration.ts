import { randomInt, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { createTransport } from "nodemailer";
import { RegisterStaffBody, RegisterStaffResponse } from "@workspace/api-zod";
import { db, staffSignupCodesTable, usersTable } from "@workspace/db";
import { createSession, digestToken, hashPassword } from "../lib/nss-auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const STAFF_REGISTRATION_EMAIL = "suryasaravanan542@gmail.com";
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_RESEND_DELAY_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

router.post("/auth/staff/code", async (_req, res): Promise<void> => {
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!appPassword) {
    res.status(503).json({
      error: "Gmail SMTP is not configured. Contact the site operator.",
    });
    return;
  }

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, STAFF_REGISTRATION_EMAIL))
    .limit(1);
  if (existingUser) {
    res.status(409).json({ error: "A staff login already exists for this email." });
    return;
  }

  const now = new Date();
  const [existingCode] = await db
    .select({ lastSentAt: staffSignupCodesTable.lastSentAt })
    .from(staffSignupCodesTable)
    .where(eq(staffSignupCodesTable.email, STAFF_REGISTRATION_EMAIL))
    .limit(1);
  if (
    existingCode &&
    now.getTime() - existingCode.lastSentAt.getTime() < CODE_RESEND_DELAY_MS
  ) {
    res.status(429).json({ error: "Please wait a minute before requesting another code." });
    return;
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = digestToken(`${STAFF_REGISTRATION_EMAIL}:${code}`);
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  await db
    .insert(staffSignupCodesTable)
    .values({
      email: STAFF_REGISTRATION_EMAIL,
      codeHash,
      attempts: 0,
      expiresAt,
      lastSentAt: now,
    })
    .onConflictDoUpdate({
      target: staffSignupCodesTable.email,
      set: { codeHash, attempts: 0, expiresAt, lastSentAt: now },
    });

  const transporter = createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: STAFF_REGISTRATION_EMAIL, pass: appPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  try {
    await transporter.sendMail({
      from: `NSS Connect <${STAFF_REGISTRATION_EMAIL}>`,
      to: STAFF_REGISTRATION_EMAIL,
      subject: "Your NSS Connect staff signup code",
      text: `Your NSS Connect staff signup code is ${code}. It expires in 10 minutes and can only be used once.`,
    });
  } catch (error) {
    await invalidateSignupCode(codeHash);
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    const responseCode =
      typeof error === "object" &&
      error !== null &&
      "responseCode" in error &&
      typeof error.responseCode === "number"
        ? error.responseCode
        : undefined;
    logger.error({ code, responseCode }, "Failed to send staff signup code");
    res.status(502).json({ error: "Unable to send the signup code. Please try again later." });
    return;
  } finally {
    transporter.close();
  }

  res.json({ ok: true });
});

router.post("/auth/staff", async (req, res): Promise<void> => {
  const parsed = RegisterStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const suppliedHash = digestToken(`${STAFF_REGISTRATION_EMAIL}:${data.code}`);
  let result: Awaited<ReturnType<typeof createStaffAccount>>;
  try {
    result = await createStaffAccount(data.name.trim(), data.password, suppliedHash);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A staff login already exists for this email." });
      return;
    }
    throw error;
  }

  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  const session = await createSession(
    {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      studentId: result.user.studentId,
      role: "staff",
      department: result.user.department,
      year: result.user.year,
      phone: result.user.phone,
    },
    res,
  );
  res.status(201).json(RegisterStaffResponse.parse(session));
});

async function createStaffAccount(name: string, password: string, suppliedHash: string) {
  return db.transaction(async (tx) => {
    const [signupCode] = await tx
      .select()
      .from(staffSignupCodesTable)
      .where(eq(staffSignupCodesTable.email, STAFF_REGISTRATION_EMAIL))
      .for("update")
      .limit(1);

    if (!signupCode || signupCode.expiresAt <= new Date()) {
      if (signupCode) {
        await tx
          .delete(staffSignupCodesTable)
          .where(eq(staffSignupCodesTable.email, STAFF_REGISTRATION_EMAIL));
      }
      return { error: "The signup code is invalid or expired." } as const;
    }

    if (signupCode.attempts >= MAX_CODE_ATTEMPTS) {
      await tx
        .delete(staffSignupCodesTable)
        .where(eq(staffSignupCodesTable.email, STAFF_REGISTRATION_EMAIL));
      return { error: "Too many incorrect codes. Request a new code." } as const;
    }

    const matches = timingSafeEqual(
      Buffer.from(signupCode.codeHash, "hex"),
      Buffer.from(suppliedHash, "hex"),
    );
    if (!matches) {
      const attempts = signupCode.attempts + 1;
      if (attempts >= MAX_CODE_ATTEMPTS) {
        await tx
          .delete(staffSignupCodesTable)
          .where(eq(staffSignupCodesTable.email, STAFF_REGISTRATION_EMAIL));
        return { error: "Too many incorrect codes. Request a new code." } as const;
      }
      await tx
        .update(staffSignupCodesTable)
        .set({ attempts })
        .where(eq(staffSignupCodesTable.email, STAFF_REGISTRATION_EMAIL));
      return { error: "The signup code is invalid or expired." } as const;
    }

    const [user] = await tx
      .insert(usersTable)
      .values({
        name,
        email: STAFF_REGISTRATION_EMAIL,
        studentId: null,
        role: "staff",
        passwordHash: hashPassword(password),
      })
      .returning();
    await tx
      .delete(staffSignupCodesTable)
      .where(eq(staffSignupCodesTable.email, STAFF_REGISTRATION_EMAIL));
    return { user } as const;
  });
}

async function invalidateSignupCode(codeHash: string): Promise<void> {
  await db
    .update(staffSignupCodesTable)
    .set({ attempts: MAX_CODE_ATTEMPTS, expiresAt: new Date() })
    .where(
      and(
        eq(staffSignupCodesTable.email, STAFF_REGISTRATION_EMAIL),
        eq(staffSignupCodesTable.codeHash, codeHash),
      ),
    );
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
