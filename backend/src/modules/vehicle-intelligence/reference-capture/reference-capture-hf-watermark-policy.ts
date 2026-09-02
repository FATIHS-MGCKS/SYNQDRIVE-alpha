import { canonicalizeBucketTimestamp } from './reference-capture-hf-aggregate-bucket-analysis';
import type { ReferenceCaptureAcquisitionState } from './reference-capture.types';

/** Bounded overlap for HF historical re-query (RD001 provisional — requires more drives). */
export const HF_QUERY_OVERLAP_MS = 2000;

export const HF_AGGREGATION_TYPE = 'AVG' as const;
export const HF_REQUESTED_INTERVAL = '1s' as const;

export type HfCommittedWatermarkState = {
  /** Legacy global committed cursor — max(per-field) when per-field map is populated. */
  hfWatermarkAt: string | null;
  /** Per-field committed provider bucket timestamps (ISO). */
  hfWatermarkByField: Record<string, string>;
};

export function normalizeHfCommittedWatermarkState(
  state: Pick<ReferenceCaptureAcquisitionState, 'hfWatermarkAt' | 'hfWatermarkByField'>,
): HfCommittedWatermarkState {
  const byField =
    state.hfWatermarkByField && typeof state.hfWatermarkByField === 'object'
      ? { ...state.hfWatermarkByField }
      : {};
  return {
    hfWatermarkAt: state.hfWatermarkAt ?? null,
    hfWatermarkByField: byField,
  };
}

export function getFieldCommittedWatermark(
  state: HfCommittedWatermarkState,
  providerField: string,
): string | null {
  return state.hfWatermarkByField[providerField] ?? state.hfWatermarkAt ?? null;
}

/**
 * Query FROM = min(per-field committed provider time) - overlap.
 * Prevents a fast-advancing global wall-clock cursor from suppressing slower fields.
 */
export function computeHfQueryFrom(
  state: HfCommittedWatermarkState,
  sessionStartedAt: Date,
  providerFields: string[],
  overlapMs: number = HF_QUERY_OVERLAP_MS,
): Date {
  if (!providerFields.length) return sessionStartedAt;

  let minFromMs = Number.POSITIVE_INFINITY;
  let hasCommitted = false;

  for (const field of providerFields) {
    const committed = getFieldCommittedWatermark(state, field);
    if (!committed) {
      minFromMs = Math.min(minFromMs, sessionStartedAt.getTime() - overlapMs);
      continue;
    }
    hasCommitted = true;
    const committedMs = Date.parse(canonicalizeBucketTimestamp(committed));
    if (Number.isFinite(committedMs)) {
      minFromMs = Math.min(minFromMs, committedMs - overlapMs);
    }
  }

  if (!hasCommitted && minFromMs === Number.POSITIVE_INFINITY) {
    return sessionStartedAt;
  }

  return new Date(minFromMs);
}

/** Query TO uses response boundary — not pre-request wall clock. */
export function computeHfQueryTo(requestCompletedAt: Date | null | undefined, fallback: Date): Date {
  if (requestCompletedAt && Number.isFinite(requestCompletedAt.getTime())) {
    return requestCompletedAt;
  }
  return fallback;
}

export function advanceHfWatermarksAfterPersistedBuckets(
  state: HfCommittedWatermarkState,
  persistedBuckets: Array<{ providerField: string; providerTimestamp: string }>,
): HfCommittedWatermarkState {
  if (!persistedBuckets.length) return state;

  const nextByField = { ...state.hfWatermarkByField };
  for (const bucket of persistedBuckets) {
    const ts = canonicalizeBucketTimestamp(bucket.providerTimestamp);
    const prev = nextByField[bucket.providerField];
    if (!prev || Date.parse(ts) > Date.parse(canonicalizeBucketTimestamp(prev))) {
      nextByField[bucket.providerField] = ts;
    }
  }

  const globalCandidates = Object.values(nextByField);
  const hfWatermarkAt =
    globalCandidates.length > 0
      ? globalCandidates.reduce((max, ts) =>
          Date.parse(ts) > Date.parse(max) ? ts : max,
        )
      : state.hfWatermarkAt;

  return { hfWatermarkAt, hfWatermarkByField: nextByField };
}

/** Committed watermark must not advance when nothing new was durably represented. */
export function shouldAdvanceHfWatermark(newPersistedBucketCount: number): boolean {
  return newPersistedBucketCount > 0;
}
