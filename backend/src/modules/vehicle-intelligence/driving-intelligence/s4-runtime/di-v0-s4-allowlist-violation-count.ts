import { Prisma, type PrismaClient } from '@prisma/client';
import { parseDiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';

/**
 * Count work items outside configured org/vehicle allowlists.
 * Returns 0 when either allowlist is empty (NONE semantics — no enforcement signal).
 */
export async function countDiV0S4AllowlistViolationWorkItems(
  prisma: PrismaClient,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  const cfg = parseDiV0S4ControlPlaneConfig(env);
  if (cfg.organizationAllowlist.size === 0 || cfg.vehicleAllowlist.size === 0) {
    return 0;
  }
  const orgIds = [...cfg.organizationAllowlist];
  const vehicleIds = [...cfg.vehicleAllowlist];
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n
    FROM di_v0_s4_work_items
    WHERE organization_id NOT IN (${Prisma.join(orgIds)})
       OR vehicle_id NOT IN (${Prisma.join(vehicleIds)})`;
  return Number(rows[0]?.n ?? 0);
}
