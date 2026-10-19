import type { HvChargingCounterDimoIntervalRowV1 } from './hv-charging-counter-evidence.types.v1';

export type HvChargingCounterBoundaryClassificationV1 =
  | 'PRE_SESSION_RESET_CANDIDATE'
  | 'IN_SESSION_MONOTONIC'
  | 'IN_SESSION_NEGATIVE_DELTA'
  | 'POST_SESSION_NEGATIVE_CORRECTION'
  | 'BOUNDARY_UNCERTAIN'
  | 'INSUFFICIENT_COVERAGE';

export interface HvChargingCounterBoundaryForensicsInputV1 {
  /** SynqDrive / DIMO recharge segment boundaries (UTC ISO). */
  sessionStartInclusive: string;
  sessionEndInclusive: string;
  /** Provider query window (includes padding). */
  queryFromInclusive: string;
  queryToInclusive: string;
  rows: HvChargingCounterDimoIntervalRowV1[];
  /** Minimum drop (kWh) between consecutive numeric LAST treated as reset. */
  resetDropKwh?: number;
}

export interface HvChargingCounterBoundaryForensicsV1 {
  classifications: HvChargingCounterBoundaryClassificationV1[];
  bucketCount: number;
  numericLastCount: number;
  nullLastCount: number;
  minMaxAvailableCount: number;
  missingMinuteGaps: number;
  positiveDeltas: number;
  negativeDeltas: number;
  zeroDeltas: number;
  resetCandidates: number;
  maxMonotonicRunLength: number;
  counterBeforeSession: number | null;
  counterAtSessionStart: number | null;
  firstNumericInSession: number | null;
  lastNumericInSession: number | null;
  counterAfterSession: number | null;
  counterDeltaFirstLastInSession: number | null;
  reliableSessionDelta: boolean;
  notes: string[];
}

function parseMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function isNumeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function floorMinuteMs(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000;
}

export function analyzeHvChargingCounterBoundaryForensicsV1(
  input: HvChargingCounterBoundaryForensicsInputV1,
): HvChargingCounterBoundaryForensicsV1 {
  const notes: string[] = [];
  const classifications: HvChargingCounterBoundaryClassificationV1[] = [];
  const resetDrop = input.resetDropKwh ?? 0.05;

  const sessionStartMs = parseMs(input.sessionStartInclusive);
  const sessionEndMs = parseMs(input.sessionEndInclusive);
  const queryFromMs = parseMs(input.queryFromInclusive);
  const queryToMs = parseMs(input.queryToInclusive);

  if (
    sessionStartMs == null ||
    sessionEndMs == null ||
    queryFromMs == null ||
    queryToMs == null ||
    sessionEndMs < sessionStartMs
  ) {
    return {
      classifications: ['INSUFFICIENT_COVERAGE', 'BOUNDARY_UNCERTAIN'],
      bucketCount: 0,
      numericLastCount: 0,
      nullLastCount: 0,
      minMaxAvailableCount: 0,
      missingMinuteGaps: 0,
      positiveDeltas: 0,
      negativeDeltas: 0,
      zeroDeltas: 0,
      resetCandidates: 0,
      maxMonotonicRunLength: 0,
      counterBeforeSession: null,
      counterAtSessionStart: null,
      firstNumericInSession: null,
      lastNumericInSession: null,
      counterAfterSession: null,
      counterDeltaFirstLastInSession: null,
      reliableSessionDelta: false,
      notes: ['invalid_session_or_query_boundaries'],
    };
  }

  const sorted = [...input.rows].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );

  let numericLastCount = 0;
  let nullLastCount = 0;
  let minMaxAvailableCount = 0;
  let missingMinuteGaps = 0;
  let prevMs: number | null = null;

  for (const row of sorted) {
    const ms = parseMs(row.timestamp);
    if (ms == null) continue;
    if (prevMs != null && ms - prevMs > 60_000) {
      missingMinuteGaps += Math.round((ms - prevMs) / 60_000) - 1;
    }
    prevMs = ms;

    if (isNumeric(row.addedKwhLast)) numericLastCount++;
    else nullLastCount++;

    if (
      isNumeric(row.addedKwhMin) &&
      isNumeric(row.addedKwhMax) &&
      isNumeric(row.addedKwhLast)
    ) {
      minMaxAvailableCount++;
    }
  }

  const expectedMinutes =
    Math.max(0, Math.floor((queryToMs - queryFromMs) / 60_000)) + 1;
  if (sorted.length < expectedMinutes * 0.5) {
    classifications.push('INSUFFICIENT_COVERAGE');
    notes.push('sparse_bucket_coverage_vs_query_window');
  }

  const numericSeries = sorted
    .map((row) => ({
      ms: parseMs(row.timestamp),
      last: row.addedKwhLast,
      min: row.addedKwhMin,
      max: row.addedKwhMax,
    }))
    .filter((row) => row.ms != null && isNumeric(row.last)) as Array<{
    ms: number;
    last: number;
    min: number | null;
    max: number | null;
  }>;

  let positiveDeltas = 0;
  let negativeDeltas = 0;
  let zeroDeltas = 0;
  let resetCandidates = 0;
  let maxMonotonicRunLength = 0;
  let currentRun = numericSeries.length > 0 ? 1 : 0;

  for (let i = 1; i < numericSeries.length; i++) {
    const delta = numericSeries[i].last - numericSeries[i - 1].last;
    if (delta > 0) positiveDeltas++;
    else if (delta < 0) negativeDeltas++;
    else zeroDeltas++;

    const drop = numericSeries[i - 1].last - numericSeries[i].last;
    if (drop > resetDrop) {
      resetCandidates++;
    }

    if (delta >= 0) currentRun++;
    else {
      maxMonotonicRunLength = Math.max(maxMonotonicRunLength, currentRun);
      currentRun = 1;
    }
  }
  maxMonotonicRunLength = Math.max(maxMonotonicRunLength, currentRun);

  const sessionStartMinute = floorMinuteMs(sessionStartMs);
  const sessionEndMinute = floorMinuteMs(sessionEndMs);

  const beforeSession = numericSeries.filter((p) => p.ms < sessionStartMinute);
  const inSession = numericSeries.filter(
    (p) => p.ms >= sessionStartMinute && p.ms <= sessionEndMinute,
  );
  const afterSession = numericSeries.filter((p) => p.ms > sessionEndMinute);

  const counterBeforeSession =
    beforeSession.length > 0 ? beforeSession[beforeSession.length - 1].last : null;
  const firstNumericInSession = inSession.length > 0 ? inSession[0].last : null;
  const lastNumericInSession =
    inSession.length > 0 ? inSession[inSession.length - 1].last : null;
  const counterAfterSession = afterSession.length > 0 ? afterSession[0].last : null;

  const counterAtSessionStart =
    numericSeries.find((p) => p.ms >= sessionStartMinute)?.last ?? null;

  const counterDeltaFirstLastInSession =
    firstNumericInSession != null && lastNumericInSession != null
      ? lastNumericInSession - firstNumericInSession
      : null;

  if (
    counterBeforeSession != null &&
    firstNumericInSession != null &&
    counterBeforeSession - firstNumericInSession > resetDrop
  ) {
    classifications.push('PRE_SESSION_RESET_CANDIDATE');
  }

  const inSessionNeg = inSession.filter((row, idx) => {
    if (idx === 0) return false;
    return row.last - inSession[idx - 1].last < 0;
  }).length;

  if (inSession.length >= 2 && inSessionNeg === 0 && negativeDeltas === 0) {
    classifications.push('IN_SESSION_MONOTONIC');
  } else if (inSessionNeg > 0) {
    classifications.push('IN_SESSION_NEGATIVE_DELTA');
  }

  if (
    lastNumericInSession != null &&
    counterAfterSession != null &&
    counterAfterSession < lastNumericInSession - resetDrop
  ) {
    classifications.push('POST_SESSION_NEGATIVE_CORRECTION');
  }

  if (inSession.length < 2 || nullLastCount > numericLastCount) {
    if (!classifications.includes('INSUFFICIENT_COVERAGE')) {
      classifications.push('BOUNDARY_UNCERTAIN');
    }
  }

  const reliableSessionDelta =
    classifications.includes('IN_SESSION_MONOTONIC') &&
    !classifications.includes('PRE_SESSION_RESET_CANDIDATE') &&
    !classifications.includes('IN_SESSION_NEGATIVE_DELTA') &&
    !classifications.includes('INSUFFICIENT_COVERAGE') &&
    counterDeltaFirstLastInSession != null;

  if (classifications.length === 0) {
    classifications.push('BOUNDARY_UNCERTAIN');
  }

  return {
    classifications: [...new Set(classifications)],
    bucketCount: sorted.length,
    numericLastCount,
    nullLastCount,
    minMaxAvailableCount,
    missingMinuteGaps,
    positiveDeltas,
    negativeDeltas,
    zeroDeltas,
    resetCandidates,
    maxMonotonicRunLength,
    counterBeforeSession,
    counterAtSessionStart,
    firstNumericInSession,
    lastNumericInSession,
    counterAfterSession,
    counterDeltaFirstLastInSession,
    reliableSessionDelta,
    notes,
  };
}
