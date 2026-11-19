import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  db,
  count,
  eq,
  announcementsTable,
  eventsTable,
  usersTable,
} from "@workspace/db";
import { hashPassword } from "../lib/nss-auth";

const input = createInterface({ input: stdin, output: stdout, terminal: true });

async function askPassword(prompt: string): Promise<string> {
  const internal = input as unknown as {
    _writeToOutput?: (value: string) => void;
  };
  const originalWrite = internal._writeToOutput;
  stdout.write(prompt);
  internal._writeToOutput = () => {};
  try {
    return await input.question("");
  } finally {
    internal._writeToOutput = originalWrite;
    stdout.write("\n");
  }
}

async function main() {
  const [existing] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(eq(usersTable.role, "staff"));
  if (existing.total > 0) {
    throw new Error("A staff account already exists. This bootstrap command only creates the first one.");
  }

  const name = (await input.question("Staff name: ")).trim();
  const email = (await input.question("Staff email: ")).trim().toLowerCase();
  const password = await askPassword("Password (at least 12 characters): ");
  const confirmation = await askPassword("Confirm password: ");
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid name and email address.");
  }
  if (password.length < 12 || password !== confirmation) {
    throw new Error("Passwords must match and be at least 12 characters long.");
  }

  await db.insert(usersTable).values({
    name,
    email,
    role: "staff",
    passwordHash: hashPassword(password),
  });
  await seedWelcomeContent();
  stdout.write("First staff account created. Sign in using this email and password.\n");
}

async function seedWelcomeContent() {
  const [existingEvents] = await db
    .select({ total: count() })
    .from(eventsTable);
  if (existingEvents.total > 0) return;
  const [staff] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "staff"))
    .limit(1);
  if (!staff) return;

  const eventData = [
    {
      title: "Riverbank Cleanup Drive",
      description:
        "Join local residents for a morning of cleanup, waste sorting, and a safer riverside.",
      venue: "Lower Ganga Ghat",
      daysFromNow: 10,
      hours: "3.00",
    },
    {
      title: "Community Health & Wellness Camp",
      description:
        "Support health workers with registration, visitor guidance, and community outreach.",
      venue: "Ward 14 Community Hall",
      daysFromNow: 21,
      hours: "4.00",
    },
    {
      title: "Digital Literacy Workshop",
      description:
        "Help neighborhood learners practice essential smartphone and online safety skills.",
      venue: "College Learning Centre",
      daysFromNow: 35,
      hours: "2.50",
    },
  ];
  const now = new Date();
  await db.insert(eventsTable).values(
    eventData.map((item) => {
      const startsAt = new Date(now.getTime() + item.daysFromNow * 86_400_000);
      startsAt.setHours(9, 0, 0, 0);
      const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
      const registrationDeadline = new Date(startsAt.getTime() - 2 * 86_400_000);
      return {
        title: item.title,
        description: item.description,
        startsAt,
        endsAt,
        venue: item.venue,
        registrationDeadline,
        volunteerHours: item.hours,
        status: "published",
        createdBy: staff.id,
      };
    }),
  );
  await db.insert(announcementsTable).values({
    title: "Welcome to NSS Connect",
    body: "Explore upcoming service opportunities, register for activities, and keep your verified volunteer hours in one place.",
    published: true,
    createdBy: staff.id,
  });
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Setup failed.";
    stdout.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    input.close();
    const { pool } = await import("@workspace/db");
    await pool.end();
  });
