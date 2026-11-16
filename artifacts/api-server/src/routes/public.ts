import { and, asc, desc, eq, gt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetPublicOverviewResponse } from "@workspace/api-zod";
import { db, announcementsTable, eventsTable } from "@workspace/db";
import { eventDtos } from "../lib/nss-data";

const router: IRouter = Router();

router.get("/public/overview", async (_req, res): Promise<void> => {
  const events = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.status, "published"),
        gt(eventsTable.startsAt, new Date()),
      ),
    )
    .orderBy(asc(eventsTable.startsAt))
    .limit(4);
  const [announcement] = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.published, true))
    .orderBy(desc(announcementsTable.createdAt))
    .limit(1);
  const publicEvents = await eventDtos(events);
  res.json(
    GetPublicOverviewResponse.parse({
      events: publicEvents,
      announcement: announcement
        ? {
            id: announcement.id,
            title: announcement.title,
            body: announcement.body,
            published: announcement.published,
            createdAt: announcement.createdAt.toISOString(),
            isRead: false,
          }
        : null,
    }),
  );
});

export default router;
