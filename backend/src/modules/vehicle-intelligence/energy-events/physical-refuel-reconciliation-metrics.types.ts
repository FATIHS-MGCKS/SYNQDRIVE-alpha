/** Bounded recovery backlog reasons exported to Prometheus (Gauge label `reason`). */
export const PHYSICAL_REFUEL_RECOVERY_BACKLOG_REASONS = [
  'orphan_refuel',
  'settlement_due',
  'stale_enrichment',
  'lost_enqueue',
  'coordinate_initial',
  'coordinate_retry',
] as const;

export type PhysicalRefuelRecoveryBacklogReason =
  (typeof PHYSICAL_REFUEL_RECOVERY_BACKLOG_REASONS)[number];

export const PHYSICAL_REFUEL_RECOVERY_RUN_RESULTS = [
  'success',
  'failure',
  'overlap_skipped',
  'disabled',
] as const;

export type PhysicalRefuelRecoveryRunResult =
  (typeof PHYSICAL_REFUEL_RECOVERY_RUN_RESULTS)[number];

export type PhysicalRefuelRecoveryBacklogCounts = Record<
  PhysicalRefuelRecoveryBacklogReason,
  number
>;

/** Maps canonical backlog repository keys to recovery reason gauge labels. */
export function mapRepositoryBacklogToRecoveryReasons(
  counts: Record<string, number>,
): PhysicalRefuelRecoveryBacklogCounts {
  return {
    orphan_refuel: counts.orphanRefuels ?? 0,
    settlement_due: counts.reconciliationDue ?? 0,
    stale_enrichment: counts.staleEnrichment ?? 0,
    lost_enqueue: counts.lostEnqueuePending ?? 0,
    coordinate_initial: counts.coordinateInitialDue ?? 0,
    coordinate_retry: counts.coordinateRetryDue ?? 0,
  };
}
