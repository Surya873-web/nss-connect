import { db, staffAuditLogsTable } from "@workspace/db";

type AuditDetails = Record<string, string | number | boolean | null>;

export async function recordStaffAction(
  actorId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  details: AuditDetails = {},
): Promise<void> {
  await db.insert(staffAuditLogsTable).values({
    actorId,
    action,
    entityType,
    entityId,
    details,
  });
}
