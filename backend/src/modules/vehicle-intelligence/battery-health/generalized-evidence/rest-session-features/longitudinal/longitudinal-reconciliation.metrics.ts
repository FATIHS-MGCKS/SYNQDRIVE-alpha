import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { LongitudinalReconciliationTickOutcome } from './longitudinal-reconciliation.service';

export const LONGITUDINAL_RECONCILIATION_TICK_RESULTS = [
  'NOT_LEADER',
  'FLAG_OFF',
  'OVERLAP',
  'COMPLETED',
  'FAILED',
] as const;

export type LongitudinalReconciliationTickResult =
  (typeof LONGITUDINAL_RECONCILIATION_TICK_RESULTS)[number];

export const LONGITUDINAL_RECONCILIATION_PROCESSED_OUTCOMES = [
  'CREATED',
  'EXISTING',
  'D1_REJECTED',
  'D2_REJECTED',
  'ERROR',
] as const;

export type LongitudinalReconciliationProcessedOutcome =
  (typeof LONGITUDINAL_RECONCILIATION_PROCESSED_OUTCOMES)[number];

export const LONGITUDINAL_RECONCILIATION_ACK_OUTCOMES = ['CREATED', 'EXISTING'] as const;

export type LongitudinalReconciliationAckOutcome =
  (typeof LONGITUDINAL_RECONCILIATION_ACK_OUTCOMES)[number];

function failOpen(record: () => void): void {
  try {
    record();
  } catch {
    // Observability only — must not affect reconciliation correctness.
  }
}

export function recordLongitudinalReconciliationSchedulerTick(
  metrics: TripMetricsService | undefined,
  input: {
    result: LongitudinalReconciliationTickResult;
    durationSeconds?: number;
    candidateCount?: number;
  },
): void {
  if (!metrics) return;
  failOpen(() => {
    metrics.batteryLongitudinalReconciliationTicksTotal.inc({ result: input.result });
    if (input.durationSeconds != null) {
      metrics.batteryLongitudinalReconciliationDurationSeconds.observe(
        { result: input.result },
        input.durationSeconds,
      );
    }
    if (input.result === 'COMPLETED') {
      if (input.candidateCount != null) {
        metrics.batteryLongitudinalReconciliationCandidates.observe(input.candidateCount);
      }
      metrics.batteryLongitudinalReconciliationLastSuccessTimestamp.set(Date.now() / 1000);
    }
  });
}

/** Test-visible invariant: processed outcome buckets must sum to processedCount. */
export function assertLongitudinalReconciliationProcessedOutcomeSum(
  outcome: LongitudinalReconciliationTickOutcome,
): void {
  const sum =
    outcome.createdCount +
    outcome.existingCount +
    outcome.d1RejectedCount +
    outcome.d2RejectedCount +
    outcome.errorCount;
  if (sum !== outcome.processedCount) {
    throw new Error(
      `longitudinal reconciliation processed outcome sum ${sum} != processedCount ${outcome.processedCount}`,
    );
  }
}

/** Mirrors {@link LongitudinalReconciliationTickOutcome} processed counters exactly. */
export function recordLongitudinalReconciliationTickOutcomes(
  metrics: TripMetricsService | undefined,
  outcome: LongitudinalReconciliationTickOutcome,
): void {
  if (!metrics || outcome.status !== 'COMPLETED') return;
  failOpen(() => {
    assertLongitudinalReconciliationProcessedOutcomeSum(outcome);
    const buckets: Array<[LongitudinalReconciliationProcessedOutcome, number]> = [
      ['CREATED', outcome.createdCount],
      ['EXISTING', outcome.existingCount],
      ['D1_REJECTED', outcome.d1RejectedCount],
      ['D2_REJECTED', outcome.d2RejectedCount],
      ['ERROR', outcome.errorCount],
    ];
    for (const [label, count] of buckets) {
      if (count > 0) {
        metrics.batteryLongitudinalReconciliationProcessedTotal.inc({ outcome: label }, count);
      }
    }
  });
}

export function recordLongitudinalReconciliationAckOutcome(
  metrics: TripMetricsService | undefined,
  outcome: LongitudinalReconciliationAckOutcome,
): void {
  if (!metrics) return;
  failOpen(() => {
    metrics.batteryLongitudinalReconciliationAckTotal.inc({ outcome });
  });
}
