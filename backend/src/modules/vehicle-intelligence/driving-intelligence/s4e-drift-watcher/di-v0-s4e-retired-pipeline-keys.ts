import type { PrismaClient } from '@prisma/client';
import { DI_V0_S4E_TUNING } from './di-v0-s4e-config';

/**
 * Bounded, deterministic read of RETIRED pipeline registry keys (DB authoritative; no mutation).
 */
export async function listDiV0S4RetiredPipelineVersionKeys(
  prisma: PrismaClient,
  limit?: number,
): Promise<string[]> {
  const capped = Math.max(1, Math.min(limit ?? DI_V0_S4E_TUNING.t12MaxPipelinesPerTick, DI_V0_S4E_TUNING.maxRetiredPipelineKeysPerRead));
  const rows = await prisma.$queryRaw<Array<{ pipeline_version_key: string }>>`
    SELECT pipeline_version_key
    FROM di_v0_s4_pipeline_versions
    WHERE status = 'RETIRED'
    ORDER BY pipeline_version_key ASC
    LIMIT ${capped}`;
  return rows.map((r) => r.pipeline_version_key);
}
