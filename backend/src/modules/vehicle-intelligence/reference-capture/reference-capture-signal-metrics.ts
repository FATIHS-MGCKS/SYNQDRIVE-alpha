/**
 * Reference-capture signal quality metrics — methodology-correct analysis helpers.
 * Used by ops audit scripts and unit tests.
 */

export type SignalMetricsObsRow = {
  observationKind: string;
  providerField: string | null;
  acquisitionSurface: string | null;
  providerTimestamp: Date | string | null;
  synqReceivedAt: Date | string;
  requestStartedAt: Date | string | null;
  requestCompletedAt: Date | string | null;
  sequenceNumber: number | null;
  physicalSampleFingerprint: string | null;
  rawValueJson: unknown;
  createdAt: Date | string;
};

export type GapClassification =
  | 'BOUNDARY_GAP'
  | 'PROVIDER_GAP'
  | 'RETRIEVAL_GAP'
  | 'UNKNOWN_GAP';

export type SignalDynamicsClassification =
  | 'OBSERVED_NON_NULL'
  | 'DYNAMICALLY_INFORMATIVE'
  | 'STATIC_OR_CONTEXTUAL'
  | 'INSUFFICIENT_VARIATION'
  | 'NON_NUMERIC_CONTEXT'
  | 'UNKNOWN';

export const OUT_OF_ORDER_PREVIOUS_INVALIDATED_NOTE =
  'Prior outOfOrderCount=0 / outOfOrderRate=0 invalidated — analysis sorted by providerTimestamp before detection (INVALIDATED_BY_ANALYSIS_BUG).';

function toMs(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

export function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function stddev(nums: number[]): number | null {
  if (nums.length < 2) return null;
  const m = mean(nums)!;
  const v = nums.reduce((s, n) => s + (n - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
}

export function hasNonNullValue(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === 'object' && raw !== null && 'value' in (raw as object)) {
    return (raw as { value?: unknown }).value != null;
  }
  return true;
}

export function extractNumericValue(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'object' && raw !== null && 'value' in (raw as object)) {
    const v = (raw as { value?: unknown }).value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

export function sortByAcquisitionOrder<T extends SignalMetricsObsRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const sa = a.sequenceNumber;
    const sb = b.sequenceNumber;
    if (sa != null && sb != null && sa !== sb) return sa - sb;
    if (sa != null && sb == null) return -1;
    if (sa == null && sb != null) return 1;
    const ta = toMs(a.synqReceivedAt) ?? toMs(a.createdAt) ?? 0;
    const tb = toMs(b.synqReceivedAt) ?? toMs(b.createdAt) ?? 0;
    return ta - tb;
  });
}

export function detectOutOfOrder(rows: SignalMetricsObsRow[]) {
  const ordered = sortByAcquisitionOrder(rows).filter((r) => toMs(r.providerTimestamp) != null);
  let outOfOrderCount = 0;
  let negativeTimestampJumps = 0;
  let largestBackwardsJumpSeconds = 0;
  for (let i = 1; i < ordered.length; i++) {
    const prev = toMs(ordered[i - 1].providerTimestamp)!;
    const cur = toMs(ordered[i].providerTimestamp)!;
    if (cur < prev) {
      outOfOrderCount++;
      negativeTimestampJumps++;
      largestBackwardsJumpSeconds = Math.max(largestBackwardsJumpSeconds, (prev - cur) / 1000);
    }
  }
  const comparisons = Math.max(0, ordered.length - 1);
  return {
    outOfOrderCount,
    outOfOrderRate: comparisons > 0 ? outOfOrderCount / comparisons : 0,
    negativeTimestampJumps,
    largestBackwardsJumpSeconds: negativeTimestampJumps > 0 ? largestBackwardsJumpSeconds : 0,
    acquisitionOrderedSampleCount: ordered.length,
  };
}

export function uniqueProviderTimestamps(rows: SignalMetricsObsRow[]): number[] {
  const set = new Set<number>();
  for (const r of rows) {
    const ms = toMs(r.providerTimestamp);
    if (ms != null) set.add(ms);
  }
  return [...set].sort((a, b) => a - b);
}

export function computePositiveDeltaTSeconds(uniqueSortedMs: number[]): number[] {
  const dts: number[] = [];
  for (let i = 1; i < uniqueSortedMs.length; i++) {
    const dt = (uniqueSortedMs[i] - uniqueSortedMs[i - 1]) / 1000;
    if (dt > 0) dts.push(dt);
  }
  return dts;
}

export function computeRetrievalCadenceSeconds(rows: SignalMetricsObsRow[], field: 'requestStartedAt' | 'synqReceivedAt') {
  const ordered = sortByAcquisitionOrder(rows);
  const ms = ordered.map((r) => toMs(r[field])).filter((v): v is number => v != null);
  const dts: number[] = [];
  for (let i = 1; i < ms.length; i++) {
    const dt = (ms[i] - ms[i - 1]) / 1000;
    if (dt > 0) dts.push(dt);
  }
  const sorted = [...dts].sort((a, b) => a - b);
  return {
    sampleCount: dts.length,
    deltaTSeconds: summarizeDeltaT(sorted),
  };
}

function gapCountsFromDts(dts: number[]) {
  const gapCountsAbove = { gt2s: 0, gt5s: 0, gt10s: 0, gt30s: 0 };
  for (const dt of dts) {
    if (dt > 2) gapCountsAbove.gt2s++;
    if (dt > 5) gapCountsAbove.gt5s++;
    if (dt > 10) gapCountsAbove.gt10s++;
    if (dt > 30) gapCountsAbove.gt30s++;
  }
  return gapCountsAbove;
}

function summarizeDeltaT(sortedDts: number[]) {
  return {
    sampleCount: sortedDts.length,
    min: sortedDts.length ? sortedDts[0] : null,
    p50: percentile(sortedDts, 50),
    p90: percentile(sortedDts, 90),
    p95: percentile(sortedDts, 95),
    p99: percentile(sortedDts, 99),
    max: sortedDts.length ? sortedDts[sortedDts.length - 1] : null,
    mean: mean(sortedDts),
    stdDev: stddev(sortedDts),
  };
}

export function computeProviderCadence(rows: SignalMetricsObsRow[]) {
  const uniqueMs = uniqueProviderTimestamps(rows);
  const dts = computePositiveDeltaTSeconds(uniqueMs);
  const sortedDts = [...dts].sort((a, b) => a - b);
  const withTs = rows.filter((r) => toMs(r.providerTimestamp) != null);
  const dupTs = withTs.length - uniqueMs.length;
  return {
    observationCount: rows.length,
    uniqueProviderTimestampCount: uniqueMs.length,
    duplicateProviderTimestampRetrievals: dupTs,
    positiveDeltaTSampleCount: dts.length,
    deltaTSeconds: summarizeDeltaT(sortedDts),
    jitterSeconds: stddev(dts),
    maxGapSeconds: sortedDts.length ? sortedDts[sortedDts.length - 1] : null,
    gapCountsAbove: gapCountsFromDts(dts),
    firstProviderTimestamp: uniqueMs.length ? new Date(uniqueMs[0]).toISOString() : null,
    lastProviderTimestamp: uniqueMs.length ? new Date(uniqueMs[uniqueMs.length - 1]).toISOString() : null,
  };
}

export function computeLatencyMetrics(rows: SignalMetricsObsRow[]) {
  const http: number[] = [];
  const boundary: number[] = [];
  const sampleAge: number[] = [];
  for (const r of rows) {
    const started = toMs(r.requestStartedAt);
    const completed = toMs(r.requestCompletedAt);
    const received = toMs(r.synqReceivedAt);
    const provider = toMs(r.providerTimestamp);
    if (started != null && completed != null && completed >= started) {
      http.push(completed - started);
    }
    if (started != null && received != null && received >= started) {
      boundary.push(received - started);
    }
    if (provider != null && received != null) {
      sampleAge.push(received - provider);
    }
  }
  const sort = (a: number[]) => [...a].sort((x, y) => x - y);
  const summarize = (a: number[]) => ({
    p50: percentile(sort(a), 50),
    p95: percentile(sort(a), 95),
    p99: percentile(sort(a), 99),
    max: a.length ? sort(a)[sort(a).length - 1] : null,
    sampleCount: a.length,
  });
  return {
    httpRequestDurationMs: summarize(http),
    synqResponseBoundaryMs: summarize(boundary),
    providerSampleAgeAtIngressMs: summarize(sampleAge),
  };
}

export function classifySignalDynamics(rows: SignalMetricsObsRow[]): {
  classification: SignalDynamicsClassification;
  nonNullCount: number;
  uniqueValueCount: number;
  valueChangeCount: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  stdDev: number | null;
  range: number | null;
  staticFraction: number | null;
} {
  const nonNullRows = rows.filter((r) => hasNonNullValue(r.rawValueJson));
  if (nonNullRows.length === 0) {
    return {
      classification: 'UNKNOWN',
      nonNullCount: 0,
      uniqueValueCount: 0,
      valueChangeCount: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
      range: null,
      staticFraction: null,
    };
  }

  const numeric = nonNullRows
    .map((r) => extractNumericValue(r.rawValueJson))
    .filter((v): v is number => v != null);
  if (numeric.length === 0) {
    const uniqueJson = new Set(nonNullRows.map((r) => JSON.stringify(r.rawValueJson)));
    let changes = 0;
    const ordered = sortByAcquisitionOrder(nonNullRows);
    for (let i = 1; i < ordered.length; i++) {
      if (JSON.stringify(ordered[i].rawValueJson) !== JSON.stringify(ordered[i - 1].rawValueJson)) changes++;
    }
    return {
      classification: uniqueJson.size > 1 || changes > 0 ? 'NON_NUMERIC_CONTEXT' : 'STATIC_OR_CONTEXTUAL',
      nonNullCount: nonNullRows.length,
      uniqueValueCount: uniqueJson.size,
      valueChangeCount: changes,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
      range: null,
      staticFraction: changes === 0 ? 1 : null,
    };
  }

  const uniqueVals = new Set(numeric.map((n) => n.toString()));
  const orderedNums = sortByAcquisitionOrder(nonNullRows)
    .map((r) => extractNumericValue(r.rawValueJson))
    .filter((v): v is number => v != null);
  let valueChangeCount = 0;
  for (let i = 1; i < orderedNums.length; i++) {
    if (orderedNums[i] !== orderedNums[i - 1]) valueChangeCount++;
  }
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const range = max - min;
  const m = mean(numeric);
  const sd = stddev(numeric);
  const staticFraction =
    orderedNums.length > 1 ? 1 - valueChangeCount / (orderedNums.length - 1) : 1;

  let classification: SignalDynamicsClassification = 'OBSERVED_NON_NULL';
  if (uniqueVals.size === 1 || valueChangeCount === 0) {
    classification = 'STATIC_OR_CONTEXTUAL';
  } else if (range > 0 && (valueChangeCount >= 3 || (sd != null && sd > 0))) {
    classification = 'DYNAMICALLY_INFORMATIVE';
  } else if (valueChangeCount > 0) {
    classification = 'INSUFFICIENT_VARIATION';
  }

  return {
    classification,
    nonNullCount: nonNullRows.length,
    uniqueValueCount: uniqueVals.size,
    valueChangeCount,
    min,
    max,
    mean: m,
    stdDev: sd,
    range,
    staticFraction,
  };
}

export function classifyMaxGap(params: {
  gapSeconds: number;
  surface: string | null;
  field: string;
  gapIndex: number;
  totalUniqueTimestamps: number;
  sessionStartedAtMs: number | null;
  firstAcquisitionMs: number | null;
  providerTimestamps: number[];
}): GapClassification {
  const { gapSeconds, gapIndex, totalUniqueTimestamps, sessionStartedAtMs, firstAcquisitionMs, providerTimestamps } =
    params;
  if (gapIndex <= 0 || gapIndex >= totalUniqueTimestamps - 1) return 'BOUNDARY_GAP';
  if (firstAcquisitionMs != null && providerTimestamps[gapIndex] != null) {
    const ts = providerTimestamps[gapIndex];
    if (ts < firstAcquisitionMs - 60_000) return 'BOUNDARY_GAP';
    const tsBefore = providerTimestamps[gapIndex - 1];
    if (
      tsBefore != null &&
      tsBefore < firstAcquisitionMs &&
      ts <= firstAcquisitionMs + 120_000 &&
      gapSeconds >= 60
    ) {
      return 'BOUNDARY_GAP';
    }
  }
  if (sessionStartedAtMs != null && providerTimestamps[gapIndex] != null) {
    const ts = providerTimestamps[gapIndex];
    if (Math.abs(ts - sessionStartedAtMs) < 120_000) return 'BOUNDARY_GAP';
  }
  if (gapSeconds >= 30) return 'PROVIDER_GAP';
  if (gapSeconds >= 10) return 'UNKNOWN_GAP';
  return 'RETRIEVAL_GAP';
}

export function analyzeSignalGroup(rows: SignalMetricsObsRow[], context?: {
  sessionStartedAtMs?: number | null;
  firstAcquisitionMs?: number | null;
}) {
  const nonNull = rows.filter((r) => hasNonNullValue(r.rawValueJson));
  const cadence = computeProviderCadence(rows);
  const outOfOrder = detectOutOfOrder(rows);
  const latency = computeLatencyMetrics(rows);
  const dynamics = classifySignalDynamics(rows);
  const phys = rows.map((r) => r.physicalSampleFingerprint).filter(Boolean) as string[];
  const uniquePhys = new Set(phys);

  const uniqueMs = uniqueProviderTimestamps(rows);
  const dts = computePositiveDeltaTSeconds(uniqueMs);
  const maxGap = cadence.maxGapSeconds;
  let maxGapClassification: GapClassification | null = null;
  if (maxGap != null && dts.length > 0) {
    const maxIdx = dts.indexOf(maxGap) + 1;
    maxGapClassification = classifyMaxGap({
      gapSeconds: maxGap,
      surface: rows[0]?.acquisitionSurface ?? null,
      field: rows[0]?.providerField ?? 'UNKNOWN',
      gapIndex: maxIdx,
      totalUniqueTimestamps: uniqueMs.length,
      sessionStartedAtMs: context?.sessionStartedAtMs ?? null,
      firstAcquisitionMs: context?.firstAcquisitionMs ?? null,
      providerTimestamps: uniqueMs,
    });
  }

  return {
    observationCount: rows.length,
    nonNullCount: nonNull.length,
    nullRate: rows.length ? (rows.length - nonNull.length) / rows.length : null,
    providerCadence: cadence,
    outOfOrder,
    latency,
    dynamics,
    fingerprint: {
      fingerprintEligibleRows: rows.length,
      fingerprintedRows: phys.length,
      fingerprintCoverageRate: rows.length ? phys.length / rows.length : null,
      uniqueFingerprints: uniquePhys.size,
      duplicateFingerprintRetrievals: phys.length - uniquePhys.size,
    },
    maxGapClassification,
    retrievalCadenceByRequestStartedAt: computeRetrievalCadenceSeconds(rows, 'requestStartedAt'),
    retrievalCadenceBySynqReceivedAt: computeRetrievalCadenceSeconds(rows, 'synqReceivedAt'),
  };
}

export function buildSurfaceCoverage(rows: SignalMetricsObsRow[]) {
  const surfaces = new Set(rows.map((r) => r.acquisitionSurface ?? 'UNKNOWN'));
  const out: Record<string, {
    earliestProviderTimestamp: string | null;
    latestProviderTimestamp: string | null;
    firstRequestStartedAt: string | null;
    lastRequestStartedAt: string | null;
    firstSynqReceivedAt: string | null;
    lastSynqReceivedAt: string | null;
    observationCount: number;
  }> = {};
  for (const surface of surfaces) {
    const subset = rows.filter((r) => (r.acquisitionSurface ?? 'UNKNOWN') === surface);
    const prov = subset.map((r) => toMs(r.providerTimestamp)).filter((v): v is number => v != null);
    const req = subset.map((r) => toMs(r.requestStartedAt)).filter((v): v is number => v != null);
    const synq = subset.map((r) => toMs(r.synqReceivedAt)).filter((v): v is number => v != null);
    const min = (a: number[]) => (a.length ? Math.min(...a) : null);
    const max = (a: number[]) => (a.length ? Math.max(...a) : null);
    out[surface] = {
      earliestProviderTimestamp: min(prov) != null ? new Date(min(prov)!).toISOString() : null,
      latestProviderTimestamp: max(prov) != null ? new Date(max(prov)!).toISOString() : null,
      firstRequestStartedAt: min(req) != null ? new Date(min(req)!).toISOString() : null,
      lastRequestStartedAt: max(req) != null ? new Date(max(req)!).toISOString() : null,
      firstSynqReceivedAt: min(synq) != null ? new Date(min(synq)!).toISOString() : null,
      lastSynqReceivedAt: max(synq) != null ? new Date(max(synq)!).toISOString() : null,
      observationCount: subset.length,
    };
  }
  return out;
}

export function buildCoverageWindows(params: {
  sessionStartedAt: string | null;
  sessionCompletedAt: string | null;
  rows: SignalMetricsObsRow[];
}) {
  const signalRows = params.rows.filter((r) => r.observationKind === 'SIGNAL_POINT');
  const req = signalRows.map((r) => toMs(r.requestStartedAt)).filter((v): v is number => v != null);
  const synq = signalRows.map((r) => toMs(r.synqReceivedAt)).filter((v): v is number => v != null);
  const prov = signalRows.map((r) => toMs(r.providerTimestamp)).filter((v): v is number => v != null);
  const min = (a: number[]) => (a.length ? Math.min(...a) : null);
  const max = (a: number[]) => (a.length ? Math.max(...a) : null);
  const sessionStart = toMs(params.sessionStartedAt);
  const sessionEnd = toMs(params.sessionCompletedAt);
  const acqStart = min(req);
  const acqEnd = max(synq);
  const provStart = min(prov);
  const provEnd = max(prov);
  return {
    SESSION_LIFECYCLE_WINDOW: {
      start: params.sessionStartedAt,
      end: params.sessionCompletedAt,
      durationSeconds:
        sessionStart != null && sessionEnd != null ? (sessionEnd - sessionStart) / 1000 : null,
    },
    ACQUISITION_EXECUTION_WINDOW: {
      firstRequestStartedAt: acqStart != null ? new Date(acqStart).toISOString() : null,
      lastSynqReceivedAt: acqEnd != null ? new Date(acqEnd).toISOString() : null,
      durationSeconds: acqStart != null && acqEnd != null ? (acqEnd - acqStart) / 1000 : null,
    },
    PROVIDER_DATA_COVERAGE_WINDOW: {
      earliestProviderTimestamp: provStart != null ? new Date(provStart).toISOString() : null,
      latestProviderTimestamp: provEnd != null ? new Date(provEnd).toISOString() : null,
      durationSeconds: provStart != null && provEnd != null ? (provEnd - provStart) / 1000 : null,
    },
    historicalBackfillBeforeFirstAcquisitionSeconds:
      acqStart != null && provStart != null && provStart < acqStart ? (acqStart - provStart) / 1000 : 0,
  };
}

export function auditFingerprintSemantics(rows: SignalMetricsObsRow[]) {
  const signalRows = rows.filter((r) => r.observationKind === 'SIGNAL_POINT');
  const bySurface: Record<string, { eligible: number; fingerprinted: number; unique: number }> = {};
  for (const r of signalRows) {
    const s = r.acquisitionSurface ?? 'UNKNOWN';
    if (!bySurface[s]) bySurface[s] = { eligible: 0, fingerprinted: 0, unique: 0 };
    bySurface[s].eligible++;
    if (r.physicalSampleFingerprint) bySurface[s].fingerprinted++;
  }
  for (const s of Object.keys(bySurface)) {
    const fps = new Set(
      signalRows
        .filter((r) => (r.acquisitionSurface ?? 'UNKNOWN') === s && r.physicalSampleFingerprint)
        .map((r) => r.physicalSampleFingerprint as string),
    );
    bySurface[s].unique = fps.size;
  }
  const allFps = signalRows.map((r) => r.physicalSampleFingerprint).filter(Boolean) as string[];
  const uniqueAll = new Set(allFps);
  return {
    note: 'physicalSampleFingerprint is populated on HF_HISTORICAL rows in RD001; not a global all-surface unique-physical-sample count unless coverage is complete.',
    fingerprintEligibleRows: signalRows.length,
    fingerprintedRows: allFps.length,
    fingerprintCoverageRate: signalRows.length ? allFps.length / signalRows.length : null,
    uniqueFingerprintsAllSurfaces: uniqueAll.size,
    duplicateFingerprintRetrievals: allFps.length - uniqueAll.size,
    bySurface,
  };
}

const BRAKE_SIGNAL_PATTERNS = [
  'brake',
  'braking',
  'brakepedal',
  'brake_pedal',
  'brakepressure',
  'brake_pressure',
  'brakefluid',
  'brake_fluid',
  'brakecircuit',
  'brake_circuit',
  'isbrakepedal',
  'isbrakeon',
];

export function isBrakeCaptureEligible(availableSignals: string[]): boolean {
  const lower = availableSignals.map((s) => s.toLowerCase());
  return BRAKE_SIGNAL_PATTERNS.some((p) => lower.some((s) => s.includes(p)));
}

export function classifyBrakeEvidence(availableSignals: string[], observedFields: string[]): {
  brakeDirectSignalAvailable: boolean;
  brakeProxyEvidenceAvailable: boolean;
  brakeNativeEventAvailable: boolean;
  brakeCaptureEligiblePreflight: boolean;
} {
  const lowerSignals = availableSignals.map((s) => s.toLowerCase());
  const lowerObserved = observedFields.map((s) => s.toLowerCase());
  const direct = [...lowerSignals, ...lowerObserved].some((s) =>
    BRAKE_SIGNAL_PATTERNS.some((p) => s.includes(p)),
  );
  const proxy = lowerObserved.some((s) =>
    ['deceleration', 'longitudinal', 'abs', 'esc', 'stability'].some((p) => s.includes(p)),
  );
  return {
    brakeDirectSignalAvailable: direct,
    brakeProxyEvidenceAvailable: proxy && !direct,
    brakeNativeEventAvailable: false,
    brakeCaptureEligiblePreflight: isBrakeCaptureEligible(availableSignals),
  };
}

export const ACQUISITION_SURFACES = ['HF_HISTORICAL', 'LATEST_LIVE', 'LATEST_SLOW'] as const;
