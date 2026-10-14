import type { LegacyReconcileApplyResult } from './legacy-connection-identity-reconcile.service';

export class LegacyReconcileFailFastError extends Error {
  readonly results: LegacyReconcileApplyResult[];
  readonly failedLinkId: string;
  readonly reasonCodes: string[];

  constructor(failedLinkId: string, reasonCodes: string[], results: LegacyReconcileApplyResult[]) {
    super(`LEGACY_RECONCILE_FAIL_FAST:${failedLinkId}:${reasonCodes.join(',')}`);
    this.name = 'LegacyReconcileFailFastError';
    this.failedLinkId = failedLinkId;
    this.reasonCodes = reasonCodes;
    this.results = results;
  }
}

export function assertLegacyReconcileBatchOutcome(results: LegacyReconcileApplyResult[]): void {
  for (const result of results) {
    if (result.outcome === 'SKIPPED') {
      throw new LegacyReconcileFailFastError(result.sourceLinkId, result.reasonCodes, results);
    }
  }
}
