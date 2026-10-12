import type { PrismaClient } from '@prisma/client';
import {
  countClaimableWorkItemsForManifest,
  evaluateHistoricalBacklogSafetyProof,
  loadAllWorkItemSnapshots,
  loadScopedWorkItemSnapshots,
  parseHistoricalBacklogManifestFromEnv,
  type HistoricalBacklogManifest,
} from '../di-v0-s4-historical-backlog-quarantine-production/di-v0-s4-historical-backlog-quarantine-production.lib';

export const DI_S4_GATE6_REOPEN_MANIFEST_REQUIRED_ENV = 'DI_S4_HISTORICAL_BACKLOG_QUARANTINE_IDS';

export interface TrustedReopenBacklogProof {
  source: 'DATABASE';
  claimableCount: number;
  globalWorkItemCount: number;
  evaluatedAtIso: string;
}

export type TrustedReopenBacklogProofFailure =
  | 'REOPEN_MANIFEST_MISSING'
  | 'REOPEN_MANIFEST_INVALID'
  | 'REOPEN_BACKLOG_CLAIMABLE_NONZERO'
  | 'REOPEN_BACKLOG_SAFETY_PROOF_FAILED'
  | 'REOPEN_BACKLOG_PROOF_READ_FAILED';

export function resolveReopenManifestFromEnv(env: NodeJS.ProcessEnv = process.env): HistoricalBacklogManifest | null {
  return parseHistoricalBacklogManifestFromEnv(env);
}

export async function evaluateTrustedReopenBacklogProofFromDatabase(
  client: Pick<PrismaClient, '$queryRaw'>,
  manifest: HistoricalBacklogManifest,
): Promise<
  | { ok: true; proof: TrustedReopenBacklogProof }
  | { ok: false; failures: TrustedReopenBacklogProofFailure[]; claimableCount?: number }
> {
  try {
    const globalRows = await loadAllWorkItemSnapshots(client);
    const scopedRows = await loadScopedWorkItemSnapshots(client, manifest);
    const safety = evaluateHistoricalBacklogSafetyProof({ manifest, globalRows, scopedRows });
    const claimableCount = await countClaimableWorkItemsForManifest(client, manifest);
    if (!safety.ok || claimableCount !== 0) {
      return {
        ok: false,
        failures: [
          claimableCount > 0 ? 'REOPEN_BACKLOG_CLAIMABLE_NONZERO' : 'REOPEN_BACKLOG_SAFETY_PROOF_FAILED',
        ],
        claimableCount,
      };
    }
    return {
      ok: true,
      proof: {
        source: 'DATABASE',
        claimableCount: 0,
        globalWorkItemCount: globalRows.length,
        evaluatedAtIso: new Date().toISOString(),
      },
    };
  } catch {
    return { ok: false, failures: ['REOPEN_BACKLOG_PROOF_READ_FAILED'] };
  }
}
