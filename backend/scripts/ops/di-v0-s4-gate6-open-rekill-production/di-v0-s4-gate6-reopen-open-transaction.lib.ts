import type { PrismaClient } from '@prisma/client';
import {
  lockGlobalKillMustBeKilled,
  countClaimableWorkItemsForManifest,
  type HistoricalBacklogManifest,
} from '../di-v0-s4-historical-backlog-quarantine-production/di-v0-s4-historical-backlog-quarantine-production.lib';
import {
  openGlobalKillRow,
  type DiV0S4GlobalKillTransitionAudit,
  type OpenGlobalKillTransitionResult,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-global-kill-transition';
import type { OpenTransactionPhase } from './di-v0-s4-gate6-open-orchestration.lib';

export class ReopenBacklogUnsafeError extends Error {
  readonly claimableCount: number;

  constructor(claimableCount: number) {
    super(`REOPEN_BACKLOG_CLAIMABLE_NONZERO:${claimableCount}`);
    this.claimableCount = claimableCount;
  }
}

export async function runReopenWithHistoryOpenTransaction(
  prisma: PrismaClient,
  audit: DiV0S4GlobalKillTransitionAudit,
  manifest: HistoricalBacklogManifest,
): Promise<OpenTransactionPhase> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockGlobalKillMustBeKilled(tx);
      const claimable = await countClaimableWorkItemsForManifest(tx, manifest);
      if (claimable !== 0) throw new ReopenBacklogUnsafeError(claimable);
      return openGlobalKillRow(tx, audit);
    });
    if (result.outcome === 'OPENED_NOT_KILLED') return { phase: 'SUCCESS', result };
    return { phase: 'REFUSED', result };
  } catch (error) {
    if (error instanceof ReopenBacklogUnsafeError) {
      return { phase: 'REFUSED', result: { outcome: 'REFUSED_MALFORMED' } };
    }
    return {
      phase: 'COMMIT_OUTCOME_UNKNOWN',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
