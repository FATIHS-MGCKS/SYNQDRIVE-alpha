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

export interface HvChargingCounterRevalidationAnchorV1 {
  segmentStartAt: Date;
  segmentEndAt: Date | null;
  providerObservedAt: Date | null;
  lastDurableBatchCreatedAt: Date | null;
  lastProviderQueryAt: Date | null;
}

function resolveRevalidationAnchorAt(anchor: HvChargingCounterRevalidationAnchorV1): Date | null {
  const candidates = [anchor.lastDurableBatchCreatedAt, anchor.lastProviderQueryAt].filter(
    (d): d is Date => d != null,
  );
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}

/**
 * Bounded correction-discovery policy.
 *
 * Trade-off: DIMO has no explicit provider revision signal for interval buckets, so corrected
 * values are only discoverable by re-querying the segment window. Skipping queries when session
 * identity is unchanged minimizes rate-budget use but delays correction detection until the
 * revalidation interval elapses or the HV session row is re-ingested (changed persist result).
 *
 * `lastProviderQueryAt` (checkpoint) prevents repeat queries within the interval after a
 * duplicate-batch revalidation left `lastDurableBatchCreatedAt` unchanged at T0.
 */
export function decideHvChargingCounterProviderQueryV1(input: {
  anchor: HvChargingCounterRevalidationAnchorV1 | null;
  session: {
    startAt: Date;
    endAt: Date | null;
    providerObservedAt: Date | null;
    updatedAt: Date;
  };
  persistResult?: Pick<HvChargeSessionPersistResult, 'changed' | 'changeKind'>;
  evaluatedAt: Date;
}): HvChargingCounterRevalidationDecisionV1 {
  const anchor = input.anchor;
  if (!anchor || anchor.lastDurableBatchCreatedAt == null) {
    if (anchor?.lastProviderQueryAt == null) {
      return { queryProvider: true, reason: 'no_prior_batch' };
    }
  }

  if (!anchor) {
    return { queryProvider: true, reason: 'no_prior_batch' };
  }

  const identityUnchanged =
    sameInstant(anchor.segmentStartAt, input.session.startAt) &&
    sameInstant(anchor.segmentEndAt, input.session.endAt) &&
    sameInstant(anchor.providerObservedAt, input.session.providerObservedAt);

  if (!identityUnchanged) {
    return { queryProvider: true, reason: 'session_identity_changed' };
  }

  if (input.persistResult?.changed) {
    return { queryProvider: true, reason: 'persist_result_changed' };
  }

  const durableCreatedAt = anchor.lastDurableBatchCreatedAt;
  const lastProviderQueryAt = anchor.lastProviderQueryAt;
  if (
    durableCreatedAt != null &&
    input.session.updatedAt.getTime() > durableCreatedAt.getTime()
  ) {
    const sessionEditNotYetRevalidated =
      lastProviderQueryAt == null ||
      input.session.updatedAt.getTime() > lastProviderQueryAt.getTime();
    if (sessionEditNotYetRevalidated) {
      return { queryProvider: true, reason: 'session_reingested' };
    }
  }

  const revalidationAnchorAt = resolveRevalidationAnchorAt(anchor);
  if (revalidationAnchorAt == null) {
    return { queryProvider: true, reason: 'no_prior_batch' };
  }

  const intervalMs = getBatteryV2HvChargingCounterRevalidationIntervalMs();
  const elapsedMs = input.evaluatedAt.getTime() - revalidationAnchorAt.getTime();
  if (elapsedMs >= intervalMs) {
    return { queryProvider: true, reason: 'revalidation_interval_elapsed' };
  }

  return { queryProvider: false, reason: 'unchanged_within_revalidation_window' };
}
