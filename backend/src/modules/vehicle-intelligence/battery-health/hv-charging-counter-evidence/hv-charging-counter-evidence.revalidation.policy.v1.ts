import { getBatteryV2HvChargingCounterRevalidationIntervalMs } from '@config/battery-health-v2.config';
import type { HvChargeSessionPersistResult } from '../hv-charge-session/hv-charge-session.types';

export type HvChargingCounterRevalidationDecisionV1 =
  | { queryProvider: true; reason: 'no_prior_batch' | 'session_identity_changed' | 'session_reingested' | 'revalidation_interval_elapsed' | 'persist_result_changed' }
  | { queryProvider: false; reason: 'unchanged_within_revalidation_window' };

function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

export interface HvChargingCounterLatestBatchSnapshotV1 {
  segmentStartAt: Date;
  segmentEndAt: Date | null;
  providerObservedAt: Date | null;
  createdAt: Date;
}

/**
 * Bounded correction-discovery policy.
 *
 * Trade-off: DIMO has no explicit provider revision signal for interval buckets, so corrected
 * values are only discoverable by re-querying the segment window. Skipping queries when session
 * identity is unchanged minimizes rate-budget use but delays correction detection until the
 * revalidation interval elapses or the HV session row is re-ingested (changed persist result).
 */
export function decideHvChargingCounterProviderQueryV1(input: {
  latestBatch: HvChargingCounterLatestBatchSnapshotV1 | null;
  session: {
    startAt: Date;
    endAt: Date | null;
    providerObservedAt: Date | null;
    updatedAt: Date;
  };
  persistResult?: Pick<HvChargeSessionPersistResult, 'changed' | 'changeKind'>;
  evaluatedAt: Date;
}): HvChargingCounterRevalidationDecisionV1 {
  const latest = input.latestBatch;
  if (!latest) {
    return { queryProvider: true, reason: 'no_prior_batch' };
  }

  const identityUnchanged =
    sameInstant(latest.segmentStartAt, input.session.startAt) &&
    sameInstant(latest.segmentEndAt, input.session.endAt) &&
    sameInstant(latest.providerObservedAt, input.session.providerObservedAt);

  if (!identityUnchanged) {
    return { queryProvider: true, reason: 'session_identity_changed' };
  }

  if (input.persistResult?.changed) {
    return { queryProvider: true, reason: 'persist_result_changed' };
  }

  if (input.session.updatedAt.getTime() > latest.createdAt.getTime()) {
    return { queryProvider: true, reason: 'session_reingested' };
  }

  const intervalMs = getBatteryV2HvChargingCounterRevalidationIntervalMs();
  const elapsedMs = input.evaluatedAt.getTime() - latest.createdAt.getTime();
  if (elapsedMs >= intervalMs) {
    return { queryProvider: true, reason: 'revalidation_interval_elapsed' };
  }

  return { queryProvider: false, reason: 'unchanged_within_revalidation_window' };
}
