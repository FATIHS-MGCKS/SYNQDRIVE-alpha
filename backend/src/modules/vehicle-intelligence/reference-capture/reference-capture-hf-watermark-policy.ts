import { canonicalizeBucketTimestamp } from './reference-capture-hf-aggregate-bucket-analysis';
import type { ReferenceCaptureAcquisitionState } from './reference-capture.types';

/** Bounded overlap for HF historical re-query (RD001 provisional — requires more drives). */
export const HF_QUERY_OVERLAP_MS = 2000;

export const HF_AGGREGATION_TYPE = 'AVG' as const;
export const HF_REQUESTED_INTERVAL = '1s' as const;

export type HfCommittedWatermarkState = {
  /** Legacy global committed cursor — max(per-field) provider bucket time after durable persist. */
  hfWatermarkAt: string | null;
  /** Per-field DATA watermark: highest durable provider bucket timestamp represented. */
  hfWatermarkByField: Record<string, string>;
  /** Per-field QUERY COVERAGE: highest query-to boundary successfully queried (not persisted data). */
  hfQueryCoverageByField: Record<string, string>;
};

export function normalizeHfCommittedWatermarkState(
  state: Pick<
    ReferenceCaptureAcquisitionState,
    'hfWatermarkAt' | 'hfWatermarkByField' | 'hfQueryCoverageByField'
  >,
): HfCommittedWatermarkState {
  const byField =
    state.hfWatermarkByField && typeof state.hfWatermarkByField === 'object'
      ? { ...state.hfWatermarkByField }
      : {};
  const queryCoverage =
    state.hfQueryCoverageByField && typeof state.hfQueryCoverageByField === 'object'
      ? { ...state.hfQueryCoverageByField }
      : {};
  return {
    hfWatermarkAt: state.hfWatermarkAt ?? null,
    hfWatermarkByField: byField,
    hfQueryCoverageByField: queryCoverage,
  };
}

export function getFieldDataWatermark(
  state: HfCommittedWatermarkState,
  providerField: string,
): string | null {
  if (state.hfWatermarkByField[providerField]) {
    return state.hfWatermarkByField[providerField];
  }
  if (Object.keys(state.hfWatermarkByField).length === 0 && state.hfWatermarkAt) {
    return state.hfWatermarkAt;
  }
  return null;
}

export function getFieldQueryCoverage(
  state: HfCommittedWatermarkState,
  providerField: string,
): string | null {
  return state.hfQueryCoverageByField[providerField] ?? null;
}

/**
 * Per-field query FROM — coverage-driven once a field has been successfully queried.
 * DATA watermark is diagnostic/evidence only; it must not pin query range after later coverage advances.
 */
export function getFieldHfQueryFrom(
  state: HfCommittedWatermarkState,
  providerField: string,
  sessionStartedAt: Date,
  overlapMs: number = HF_QUERY_OVERLAP_MS,
): Date {
  const queryCoverage = getFieldQueryCoverage(state, providerField);
  if (queryCoverage) {
    const ms = Date.parse(canonicalizeBucketTimestamp(queryCoverage));
    if (Number.isFinite(ms)) return new Date(ms - overlapMs);
  }

  const dataCommitted = getFieldDataWatermark(state, providerField);
  if (dataCommitted) {
    const ms = Date.parse(canonicalizeBucketTimestamp(dataCommitted));
    if (Number.isFinite(ms)) return new Date(ms - overlapMs);
  }

  return sessionStartedAt;
}

/**
 * Multi-field HF query FROM = min(per-field from).
 * Prevents fast-field suppression and silent-field session-start pinning.
 */
export function computeHfQueryFrom(
  state: HfCommittedWatermarkState,
  sessionStartedAt: Date,
  providerFields: string[],
  overlapMs: number = HF_QUERY_OVERLAP_MS,
): Date {
  if (!providerFields.length) return sessionStartedAt;

  let minFromMs = Number.POSITIVE_INFINITY;
  for (const field of providerFields) {
    minFromMs = Math.min(
      minFromMs,
      getFieldHfQueryFrom(state, field, sessionStartedAt, overlapMs).getTime(),
    );
  }

  return new Date(minFromMs);
}

/** ACTUAL_QUERY_TO — temporal boundary sent to DIMO GraphQL (requestStartedAt at query build). */
export function resolveHfActualQueryTo(actualQueryToAt: Date): Date {
  return actualQueryToAt;
}

export function advanceHfQueryCoverageAfterQuery(
  state: HfCommittedWatermarkState,
  providerFields: string[],
  actualQueryTo: string | Date,
): HfCommittedWatermarkState {
  const ts = canonicalizeBucketTimestamp(actualQueryTo);
  const nextCoverage = { ...state.hfQueryCoverageByField };
  for (const field of providerFields) {
    const prev = nextCoverage[field];
    if (!prev || Date.parse(ts) > Date.parse(canonicalizeBucketTimestamp(prev))) {
      nextCoverage[field] = ts;
    }
  }
  return { ...state, hfQueryCoverageByField: nextCoverage };
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

  return { hfWatermarkAt, hfWatermarkByField: nextByField, hfQueryCoverageByField: state.hfQueryCoverageByField };
}

/** Committed data watermark must not advance when nothing was durably represented. */
export function shouldAdvanceHfWatermark(durableBucketCount: number): boolean {
  return durableBucketCount > 0;
}

export type HfQueryWindowSimulationCycle = {
  cycle: number;
  queryFromMs: number;
  queryToMs: number;
  windowMs: number;
};

export type HfQueryWindowSimulationResult = {
  cycles: HfQueryWindowSimulationCycle[];
  windowMsP50: number;
  windowMsP95: number;
  windowMsMax: number;
};

/** Deterministic query-window growth analysis for audit/tests. */
export function simulateHfQueryWindowGrowth(args: {
  sessionStartedAt: Date;
  cycleCount: number;
  cycleIntervalMs: number;
  providerFields: string[];
  fieldBucketCadenceMs?: Record<string, number | null>;
  overlapMs?: number;
}): HfQueryWindowSimulationResult {
  const overlapMs = args.overlapMs ?? HF_QUERY_OVERLAP_MS;
  let state = normalizeHfCommittedWatermarkState({
    hfWatermarkAt: null,
    hfWatermarkByField: {},
    hfQueryCoverageByField: {},
  });

  const cycles: HfQueryWindowSimulationCycle[] = [];
  const windows: number[] = [];

  for (let cycle = 1; cycle <= args.cycleCount; cycle += 1) {
    const queryToMs = args.sessionStartedAt.getTime() + cycle * args.cycleIntervalMs;
    const queryFrom = computeHfQueryFrom(state, args.sessionStartedAt, args.providerFields, overlapMs);
    const windowMs = queryToMs - queryFrom.getTime();
    windows.push(windowMs);
    cycles.push({ cycle, queryFromMs: queryFrom.getTime(), queryToMs, windowMs });

    state = advanceHfQueryCoverageAfterQuery(
      state,
      args.providerFields,
      new Date(queryToMs).toISOString(),
    );

    for (const field of args.providerFields) {
      const cadence = args.fieldBucketCadenceMs?.[field];
      if (!cadence) continue;
      const dataTs = new Date(queryToMs - cadence).toISOString();
      state = advanceHfWatermarksAfterPersistedBuckets(state, [
        { providerField: field, providerTimestamp: dataTs },
      ]);
    }
  }

  const sorted = [...windows].sort((a, b) => a - b);
  const pct = (p: number) =>
    sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))];

  return {
    cycles,
    windowMsP50: sorted.length ? pct(50) : 0,
    windowMsP95: sorted.length ? pct(95) : 0,
    windowMsMax: sorted.length ? sorted[sorted.length - 1] : 0,
  };
}

/** Simulate a field that emits buckets early then becomes runtime-silent while queries continue. */
export function simulateHfActiveThenSilentQueryGrowth(args: {
  sessionStartedAt: Date;
  cycleCount: number;
  cycleIntervalMs: number;
  providerFields: string[];
  silentField: string;
  silentFieldActiveUntilCycle: number;
  fieldBucketCadenceMs?: Record<string, number | null>;
  overlapMs?: number;
}): HfQueryWindowSimulationResult {
  const overlapMs = args.overlapMs ?? HF_QUERY_OVERLAP_MS;
  let state = normalizeHfCommittedWatermarkState({
    hfWatermarkAt: null,
    hfWatermarkByField: {},
    hfQueryCoverageByField: {},
  });

  const cycles: HfQueryWindowSimulationCycle[] = [];
  const windows: number[] = [];

  for (let cycle = 1; cycle <= args.cycleCount; cycle += 1) {
    const actualQueryToMs = args.sessionStartedAt.getTime() + cycle * args.cycleIntervalMs;
    const queryFrom = computeHfQueryFrom(state, args.sessionStartedAt, args.providerFields, overlapMs);
    const windowMs = actualQueryToMs - queryFrom.getTime();
    windows.push(windowMs);
    cycles.push({ cycle, queryFromMs: queryFrom.getTime(), queryToMs: actualQueryToMs, windowMs });

    state = advanceHfQueryCoverageAfterQuery(
      state,
      args.providerFields,
      new Date(actualQueryToMs).toISOString(),
    );

    for (const field of args.providerFields) {
      if (field === args.silentField && cycle > args.silentFieldActiveUntilCycle) {
        continue;
      }
      const cadence = args.fieldBucketCadenceMs?.[field];
      if (!cadence) continue;
      const dataTs = new Date(actualQueryToMs - cadence).toISOString();
      state = advanceHfWatermarksAfterPersistedBuckets(state, [
        { providerField: field, providerTimestamp: dataTs },
      ]);
    }
  }

  const sorted = [...windows].sort((a, b) => a - b);
  const pct = (p: number) =>
    sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))];

  return {
    cycles,
    windowMsP50: sorted.length ? pct(50) : 0,
    windowMsP95: sorted.length ? pct(95) : 0,
    windowMsMax: sorted.length ? sorted[sorted.length - 1] : 0,
  };
}
