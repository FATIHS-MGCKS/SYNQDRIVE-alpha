import { Prisma } from '@prisma/client';
import type { MasterAdminAuditRecordInput } from '@modules/activity-log/master-admin-audit.contract';
import { persistMasterAdminAuditActivityLog } from '@modules/activity-log/master-admin-audit-persistence.util';

/**
 * Writes master-admin audit inside an open Prisma transaction so permission
 * mutations roll back when activityLog persistence fails (F2 audit integrity).
 */
export async function persistPlatformPermissionMandatoryAuditTx(
  tx: Prisma.TransactionClient,
  input: MasterAdminAuditRecordInput,
): Promise<void> {
  await persistMasterAdminAuditActivityLog(tx, input);
}