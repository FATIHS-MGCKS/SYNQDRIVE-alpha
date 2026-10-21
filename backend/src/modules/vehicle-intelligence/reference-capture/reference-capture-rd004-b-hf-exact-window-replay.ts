/**
 * RD004-B.4 / DI-EV-0035B.4 — exact-window HF aggregate bucket replay analysis.
 * Read-only evidence methodology; no production runtime changes.
 */
import {
  aggregateBucketKey,
  bucketIntervalBoundsMs,
  canonicalizeBucketTimestamp,
  classifyBucketClosureAtOriginalResponse,
  classifyWatermarkExclusion,
  compareAggregateBucketMaps,
  computeAvailabilityLagLowerBoundSeconds,
  countDefinitelyExcludedUniqueBucketTimestamps,
  DIMO_PROVIDER_SOURCE_AUTHORITY,
  summarizeLagSeconds,
  type AggregateBucketObservation,
  type HfLateArrivalDifferentialRow,
  type WatermarkExclusionClassification,
} from './reference-capture-hf-aggregate-bucket-analysis';
import { HF_QUERY_OVERLAP_MS } from './reference-capture-hf-watermark-policy';
import { extractNumericValue } from './reference-capture-signal-metrics';
import type { Rd004ObservationRow } from './reference-capture-rd004-a-segment-a';

export const RD004_B4_EVIDENCE_ID = 'DI-EV-0035B.4';

export const DIMO_BUCKET_SEMANTICS = 'QUERY_FROM_ANCHORED';
export const CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID = 'NO';
export const B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID = 'NO';
export const B3_108_VS_66_RESULT = 'DENSITY_DIAGNOSTIC_ONLY_NOT_BUCKET_IDENTITY_PROOF';

/** Documented example: different query origins anchor different 1s bucket grids. */
export const QUERY_FROM_ANCHORED_BUCKET_EXAMPLE = {
  originA: { hfWindowFrom: '2026-09-04T03:47:50.768Z', exampleBucketTimestamp: '2026-09-04T03:47:51.768Z' },
  originB: { hfWindowFrom: '2026-09-04T03:46:00.000Z', exampleBucketTimestamp: '2026-09-04T03:47:52.000Z' },
} as const;

export type HfCaptureRootCause =
  | 'PROVIDER_LATE_ARRIVAL'
  | 'PROVIDER_BUCKET_REVISION'
  | 'CAPTURE_WATERMARK_RECOVERY_GAP'
  | 'PROVIDER_LATE_ARRIVAL_PLUS_CAPTURE_WATERMARK_RECOVERY_GAP'
  | 'INTERNAL_PERSISTENCE_LOSS'
  | 'INTERNAL_DEDUP_LOSS'
  | 'QUERY_ORIGIN_MISMATCH'
  | 'NOT_DETERMINABLE';

export type OriginalHfQueryWindow = {
  windowId: string;
  hfWindowFrom: string;
  hfWindowTo: string;
  hfActualQueryTo: string | null;
  requestStartedAt: string;
  requestCompletedAt: string | null;
  requestedInterval: string;
  requestedAggregation: string;
  providerFieldsObserved: string[];
  hasSpeedBucket: boolean;
  captureCycleId: string | null;
  requestCorrelationId: string | null;
};

export type ExactWindowSpeedComparison = {
  windowId: string;
  hfWindowFrom: string;
  hfWindowTo: string;
  hfActualQueryTo: string | null;
  requestStartedAt: string;
  requestCompletedAt: string | null;
  originalSpeedBucketCount: number;
  replaySpeedBucketCount: number;
  unchangedBucketCount: number;
  changedValueBucketCount: number;
  newReplayBucketCount: number;
  missingNowBucketCount: number;
  exactIntersectionCount: number;
  originalBucketTimestamps: string[];
  replayBucketTimestamps: string[];
  newReplayBucketTimestamps: string[];
  missingNowBucketTimestamps: string[];
};

function extractAvgValue(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw != null && typeof raw === 'object' && 'value' in (raw as object)) {
    const v = (raw as { value?: unknown }).value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export function buildOriginalHfWindowId(
  hfWindowFrom: string,
  hfWindowTo: string,
  requestStartedAt: string,
): string {
  return `${hfWindowFrom}|${hfWindowTo}|${requestStartedAt}`;
}

export function reconstructOriginalHfQueryWindows(rows: Rd004ObservationRow[]): {
  ORIGINAL_HF_QUERY_WINDOWS: OriginalHfQueryWindow[];
  ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE: 'YES' | 'NO' | 'PARTIAL';
} {
  const meta = new Map<
    string,
    {
      hfWindowFrom: string;
      hfWindowTo: string;
      hfActualQueryTo: string | null;
      requestStartedAt: string;
      completedCandidates: string[];
      providerFields: Set<string>;
      hasSpeedBucket: boolean;
      captureCycleId: string | null;
      requestCorrelationId: string | null;
      requestedInterval: string;
      requestedAggregation: string;
    }
  >();

  for (const row of rows) {
    if (row.acquisitionSurface !== 'HF_HISTORICAL') continue;
    const prov = (row.provenanceJson ?? {}) as Record<string, string>;
    const hfWindowFrom = prov.hfWindowFrom;
    const hfWindowTo = prov.hfWindowTo;
    const requestStartedAt = row.requestStartedAt ?? '';
    if (!hfWindowFrom || !hfWindowTo || !requestStartedAt) continue;

    const windowId = buildOriginalHfWindowId(hfWindowFrom, hfWindowTo, requestStartedAt);
    if (!meta.has(windowId)) {
      meta.set(windowId, {
        hfWindowFrom,
        hfWindowTo,
        hfActualQueryTo: prov.hfActualQueryTo ?? hfWindowTo,
        requestStartedAt,
        completedCandidates: [],
        providerFields: new Set(),
        hasSpeedBucket: false,
        captureCycleId: (row as { captureCycleId?: string }).captureCycleId ?? null,
        requestCorrelationId: (row as { requestCorrelationId?: string }).requestCorrelationId ?? null,
        requestedInterval: prov.requestedInterval ?? '1s',
        requestedAggregation: prov.requestedAggregation ?? 'AVG',
      });
    }
    const m = meta.get(windowId)!;
    m.providerFields.add(row.providerField);
    if (row.providerField === 'speed' && row.providerTimestamp) {
      m.hasSpeedBucket = true;
    }
    if (typeof row.requestCompletedAt === 'string') {
      m.completedCandidates.push(row.requestCompletedAt);
    }
  }

  const windows: OriginalHfQueryWindow[] = [...meta.entries()]
    .map(([windowId, m]) => {
      const completedMs = m.completedCandidates
        .map((v) => Date.parse(v))
        .filter((ms) => Number.isFinite(ms))
        .sort((a, b) => b - a);
      return {
        windowId,
        hfWindowFrom: m.hfWindowFrom,
        hfWindowTo: m.hfWindowTo,
        hfActualQueryTo: m.hfActualQueryTo,
        requestStartedAt: m.requestStartedAt,
        requestCompletedAt: completedMs.length ? new Date(completedMs[0]).toISOString() : null,
        requestedInterval: m.requestedInterval,
        requestedAggregation: m.requestedAggregation,
        providerFieldsObserved: [...m.providerFields].sort(),
        hasSpeedBucket: m.hasSpeedBucket,
        captureCycleId: m.captureCycleId,
        requestCorrelationId: m.requestCorrelationId,
      };
    })
    .sort((a, b) => a.requestStartedAt.localeCompare(b.requestStartedAt));

  return {
    ORIGINAL_HF_QUERY_WINDOWS: windows,
    ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE: 'NO',
  };
}

export function loadOriginalSpeedBucketsByWindow(
  rows: Rd004ObservationRow[],
): Map<string, Map<string, AggregateBucketObservation>> {
  const byWindow = new Map<string, Map<string, AggregateBucketObservation>>();
  for (const row of rows) {
    if (row.acquisitionSurface !== 'HF_HISTORICAL' || row.providerField !== 'speed') continue;
    const prov = (row.provenanceJson ?? {}) as Record<string, string>;
    const hfWindowFrom = prov.hfWindowFrom;
    const hfWindowTo = prov.hfWindowTo;
    const requestStartedAt = row.requestStartedAt ?? '';
    if (!hfWindowFrom || !hfWindowTo || !requestStartedAt) continue;
    const avgValue = extractAvgValue(row.rawValueJson);
    if (avgValue == null || !row.providerTimestamp) continue;

    const windowId = buildOriginalHfWindowId(hfWindowFrom, hfWindowTo, requestStartedAt);
    if (!byWindow.has(windowId)) byWindow.set(windowId, new Map());
    const bucketTimestamp = canonicalizeBucketTimestamp(row.providerTimestamp);
    byWindow.get(windowId)!.set(aggregateBucketKey('speed', bucketTimestamp), {
      providerField: 'speed',
      bucketTimestamp,
      avgValue,
    });
  }
  return byWindow;
}

export function parseReplaySpeedBuckets(
  signalRows: Array<Record<string, unknown>>,
): Map<string, AggregateBucketObservation> {
  const out = new Map<string, AggregateBucketObservation>();
  for (const row of signalRows) {
    const rowTs = typeof row.timestamp === 'string' ? row.timestamp : null;
    if (!rowTs || !('speed' in row)) continue;
    const avgValue = extractAvgValue(row.speed);
    if (avgValue == null) continue;
    const bucketTimestamp = canonicalizeBucketTimestamp(rowTs);
    out.set(aggregateBucketKey('speed', bucketTimestamp), {
      providerField: 'speed',
      bucketTimestamp,
      avgValue,
    });
  }
  return out;
}

export function compareExactWindowSpeedBuckets(
  original: Map<string, AggregateBucketObservation>,
  replay: Map<string, AggregateBucketObservation>,
): Omit<
  ExactWindowSpeedComparison,
  'windowId' | 'hfWindowFrom' | 'hfWindowTo' | 'hfActualQueryTo' | 'requestStartedAt' | 'requestCompletedAt'
> {
  const cmp = compareAggregateBucketMaps(original, replay);
  const intersectionKeys = [...original.keys()].filter((k) => replay.has(k));
  const newKeys = [...replay.keys()].filter((k) => !original.has(k));
  const missingKeys = [...original.keys()].filter((k) => !replay.has(k));

  const ts = (keys: string[]) =>
    keys
      .map((k) => original.get(k)?.bucketTimestamp ?? replay.get(k)?.bucketTimestamp)
      .filter((t): t is string => Boolean(t))
      .sort();

  return {
    originalSpeedBucketCount: original.size,
    replaySpeedBucketCount: replay.size,
    unchangedBucketCount: cmp.unchangedBucketObservations,
    changedValueBucketCount: cmp.changedValueBucketObservations,
    newReplayBucketCount: cmp.newBucketObservations,
    missingNowBucketCount: cmp.removedBucketObservations,
    exactIntersectionCount: intersectionKeys.length,
    originalBucketTimestamps: ts([...original.keys()]),
    replayBucketTimestamps: ts([...replay.keys()]),
    newReplayBucketTimestamps: ts(newKeys),
    missingNowBucketTimestamps: ts(missingKeys),
  };
}

export function crossOriginBucketIdentitiesEquivalent(
  originAFrom: string,
  bucketTimestampA: string,
  originBFrom: string,
  bucketTimestampB: string,
): boolean {
  if (originAFrom === originBFrom) {
    return canonicalizeBucketTimestamp(bucketTimestampA) === canonicalizeBucketTimestamp(bucketTimestampB);
  }
  return false;
}

export function buildLateArrivalRows(args: {
  windows: OriginalHfQueryWindow[];
  perWindowComparisons: ExactWindowSpeedComparison[];
  originalBucketsByWindow: Map<string, Map<string, AggregateBucketObservation>>;
  replayBucketsByWindow: Map<string, Map<string, AggregateBucketObservation>>;
  generatedAt: string;
}): HfLateArrivalDifferentialRow[] {
  const rows: HfLateArrivalDifferentialRow[] = [];
  const windowById = new Map(args.windows.map((w) => [w.windowId, w]));
  const sortedWindows = [...args.windows].sort((a, b) =>
    a.requestStartedAt.localeCompare(b.requestStartedAt),
  );

  for (const cmp of args.perWindowComparisons) {
    const window = windowById.get(cmp.windowId);
    if (!window) continue;
    const windowIdx = sortedWindows.findIndex((w) => w.windowId === cmp.windowId);
    const nextWindow = windowIdx >= 0 ? sortedWindows[windowIdx + 1] ?? null : null;
    const replayBuckets = args.replayBucketsByWindow.get(cmp.windowId) ?? new Map();
    const originalBuckets = args.originalBucketsByWindow.get(cmp.windowId) ?? new Map();

    for (const key of cmp.newReplayBucketTimestamps.map((ts) => aggregateBucketKey('speed', ts))) {
      const bucket = replayBuckets.get(key);
      if (!bucket) continue;
      if (originalBuckets.has(key)) continue;

      const { endMs } = bucketIntervalBoundsMs(bucket.bucketTimestamp);
      const closure = classifyBucketClosureAtOriginalResponse({
        bucketTimestamp: bucket.bucketTimestamp,
        requestCompletedAt: window.requestCompletedAt,
      });
      const lagSeconds = computeAvailabilityLagLowerBoundSeconds({
        bucketTimestamp: bucket.bucketTimestamp,
        requestCompletedAt: window.requestCompletedAt,
      });
      const watermarkClassification = classifyWatermarkExclusion({
        bucketTimestamp: bucket.bucketTimestamp,
        nextWindowFrom: nextWindow?.hfWindowFrom ?? null,
      });

      rows.push({
        observationType: 'HF_AGGREGATE_BUCKET_OBSERVATION',
        providerField: 'speed',
        bucketStart: bucket.bucketTimestamp,
        bucketEnd: new Date(endMs).toISOString(),
        avgValue: bucket.avgValue,
        originalHfWindowFrom: window.hfWindowFrom,
        originalHfWindowTo: window.hfWindowTo,
        originalRequestStartedAt: window.requestStartedAt,
        originalRequestCompletedAt: window.requestCompletedAt,
        nextKnownHfWindowFrom: nextWindow?.hfWindowFrom ?? null,
        watermarkClassification,
        bucketClosureAtOriginalResponse: closure.bucketClosureAtOriginalResponse,
        availabilityLagLowerBoundSeconds: lagSeconds,
        replayExperimentGeneratedAt: args.generatedAt,
      });
    }
  }
  return rows;
}

export function analyzeWatermarkRecovery(args: {
  lateArrivalRows: HfLateArrivalDifferentialRow[];
  overlapMs: number;
}): {
  LATE_ARRIVAL_BUCKET_COUNT: number;
  CLOSED_LATE_ARRIVAL_BUCKET_COUNT: number;
  LATE_ARRIVAL_LAG_MIN_SECONDS: number | null;
  LATE_ARRIVAL_LAG_P50_SECONDS: number | null;
  LATE_ARRIVAL_LAG_P95_SECONDS: number | null;
  LATE_ARRIVAL_LAG_MAX_SECONDS: number | null;
  DEFINITELY_EXCLUDED_LATE_BUCKET_COUNT: number;
  CURRENT_2S_OVERLAP_SUFFICIENT: 'YES' | 'NO' | 'NOT_DETERMINABLE';
  HF_QUERY_OVERLAP_MS: number;
  watermarkClassificationCounts: Record<WatermarkExclusionClassification, number>;
} {
  const counts: Record<WatermarkExclusionClassification, number> = {
    DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK: 0,
    PARTIALLY_OVERLAPPED_BY_NEXT_WINDOW: 0,
    POTENTIALLY_REQUERYABLE: 0,
    NO_NEXT_WINDOW_EVIDENCE: 0,
  };
  const closedLags: number[] = [];
  let closedCount = 0;

  for (const row of args.lateArrivalRows) {
    counts[row.watermarkClassification]++;
    if (row.bucketClosureAtOriginalResponse === 'CLOSED') {
      closedCount++;
      if (row.availabilityLagLowerBoundSeconds != null) {
        closedLags.push(row.availabilityLagLowerBoundSeconds);
      }
    }
  }

  const lagSummary = summarizeLagSeconds(closedLags);
  const definitelyExcluded = countDefinitelyExcludedUniqueBucketTimestamps(args.lateArrivalRows);

  let overlapSufficient: 'YES' | 'NO' | 'NOT_DETERMINABLE' = 'NOT_DETERMINABLE';
  if (args.lateArrivalRows.length > 0) {
    const overlapSeconds = args.overlapMs / 1000;
    if (definitelyExcluded > 0) overlapSufficient = 'NO';
    else if ((lagSummary.p95Seconds ?? 0) <= overlapSeconds && definitelyExcluded === 0) {
      overlapSufficient = 'YES';
    } else if ((lagSummary.p95Seconds ?? 0) > overlapSeconds) {
      overlapSufficient = 'NO';
    }
  }

  return {
    LATE_ARRIVAL_BUCKET_COUNT: args.lateArrivalRows.length,
    CLOSED_LATE_ARRIVAL_BUCKET_COUNT: closedCount,
    LATE_ARRIVAL_LAG_MIN_SECONDS: lagSummary.minSeconds,
    LATE_ARRIVAL_LAG_P50_SECONDS: lagSummary.p50Seconds,
    LATE_ARRIVAL_LAG_P95_SECONDS: lagSummary.p95Seconds,
    LATE_ARRIVAL_LAG_MAX_SECONDS: lagSummary.maxSeconds,
    DEFINITELY_EXCLUDED_LATE_BUCKET_COUNT: definitelyExcluded,
    CURRENT_2S_OVERLAP_SUFFICIENT: overlapSufficient,
    HF_QUERY_OVERLAP_MS: args.overlapMs,
    watermarkClassificationCounts: counts,
  };
}

export function classifyHfCaptureRootCause(args: {
  exactReplayAttempted: boolean;
  exactReplaySucceeded: boolean;
  aggregateNewReplayBuckets: number;
  aggregateChangedValueBuckets: number;
  definitelyExcludedLateBuckets: number;
  closedLateArrivalCount: number;
}): HfCaptureRootCause {
  if (!args.exactReplayAttempted || !args.exactReplaySucceeded) return 'NOT_DETERMINABLE';
  if (args.definitelyExcludedLateBuckets > 0 && args.closedLateArrivalCount > 0) {
    return 'PROVIDER_LATE_ARRIVAL_PLUS_CAPTURE_WATERMARK_RECOVERY_GAP';
  }
  if (args.definitelyExcludedLateBuckets > 0) return 'CAPTURE_WATERMARK_RECOVERY_GAP';
  if (args.aggregateNewReplayBuckets > 0 && args.closedLateArrivalCount > 0) {
    return 'PROVIDER_LATE_ARRIVAL';
  }
  if (args.aggregateChangedValueBuckets > 0) return 'PROVIDER_BUCKET_REVISION';
  if (args.aggregateNewReplayBuckets > 0) return 'PROVIDER_LATE_ARRIVAL';
  return 'NOT_DETERMINABLE';
}

export type ExactWindowReplayInput = {
  windows: OriginalHfQueryWindow[];
  originalBucketsByWindow: Map<string, Map<string, AggregateBucketObservation>>;
  replayBucketsByWindow: Map<string, Map<string, AggregateBucketObservation>>;
  replayAttempted: boolean;
  replaySucceeded: boolean;
  replayError?: string | null;
  generatedAt?: string;
};

export function buildExactWindowReplayAnalysis(input: ExactWindowReplayInput) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const perWindow: ExactWindowSpeedComparison[] = input.windows.map((w) => {
    const original = input.originalBucketsByWindow.get(w.windowId) ?? new Map();
    const replay = input.replayBucketsByWindow.get(w.windowId) ?? new Map();
    return {
      windowId: w.windowId,
      hfWindowFrom: w.hfWindowFrom,
      hfWindowTo: w.hfWindowTo,
      hfActualQueryTo: w.hfActualQueryTo,
      requestStartedAt: w.requestStartedAt,
      requestCompletedAt: w.requestCompletedAt,
      ...compareExactWindowSpeedBuckets(original, replay),
    };
  });

  const aggregate = perWindow.reduce(
    (acc, w) => ({
      ORIGINAL_EXACT_WINDOW_SPEED_BUCKET_COUNT:
        acc.ORIGINAL_EXACT_WINDOW_SPEED_BUCKET_COUNT + w.originalSpeedBucketCount,
      REPLAY_EXACT_WINDOW_SPEED_BUCKET_COUNT:
        acc.REPLAY_EXACT_WINDOW_SPEED_BUCKET_COUNT + w.replaySpeedBucketCount,
      EXACT_BUCKET_INTERSECTION_COUNT: acc.EXACT_BUCKET_INTERSECTION_COUNT + w.exactIntersectionCount,
      NEW_REPLAY_BUCKET_COUNT: acc.NEW_REPLAY_BUCKET_COUNT + w.newReplayBucketCount,
      MISSING_NOW_BUCKET_COUNT: acc.MISSING_NOW_BUCKET_COUNT + w.missingNowBucketCount,
      CHANGED_VALUE_BUCKET_COUNT: acc.CHANGED_VALUE_BUCKET_COUNT + w.changedValueBucketCount,
    }),
    {
      ORIGINAL_EXACT_WINDOW_SPEED_BUCKET_COUNT: 0,
      REPLAY_EXACT_WINDOW_SPEED_BUCKET_COUNT: 0,
      EXACT_BUCKET_INTERSECTION_COUNT: 0,
      NEW_REPLAY_BUCKET_COUNT: 0,
      MISSING_NOW_BUCKET_COUNT: 0,
      CHANGED_VALUE_BUCKET_COUNT: 0,
    },
  );

  const lateArrivalRows = buildLateArrivalRows({
    windows: input.windows,
    perWindowComparisons: perWindow,
    originalBucketsByWindow: input.originalBucketsByWindow,
    replayBucketsByWindow: input.replayBucketsByWindow,
    generatedAt,
  });

  const watermark = analyzeWatermarkRecovery({
    lateArrivalRows,
    overlapMs: HF_QUERY_OVERLAP_MS,
  });

  const rootCause = classifyHfCaptureRootCause({
    exactReplayAttempted: input.replayAttempted,
    exactReplaySucceeded: input.replaySucceeded,
    aggregateNewReplayBuckets: aggregate.NEW_REPLAY_BUCKET_COUNT,
    aggregateChangedValueBuckets: aggregate.CHANGED_VALUE_BUCKET_COUNT,
    definitelyExcludedLateBuckets: watermark.DEFINITELY_EXCLUDED_LATE_BUCKET_COUNT,
    closedLateArrivalCount: watermark.CLOSED_LATE_ARRIVAL_BUCKET_COUNT,
  });

  let hfSparseCadenceOrigin = 'NOT_DETERMINABLE';
  let hfCaptureCompletenessValidated: 'YES' | 'NO' | 'PARTIAL' = 'NO';
  let rd003Explanation =
    'Exact-window replay not completed — cannot reconcile RD003 ~2 s vs RD004 sealed sparsity';

  if (input.replaySucceeded) {
    hfCaptureCompletenessValidated = 'PARTIAL';
    if (rootCause === 'PROVIDER_LATE_ARRIVAL_PLUS_CAPTURE_WATERMARK_RECOVERY_GAP') {
      hfSparseCadenceOrigin = 'NOT_DETERMINABLE';
      rd003Explanation =
        'Provider can supply ~1s aggregate buckets that arrive after original window close; SynqDrive 2s watermark overlap may fail to recover them — sealed ~10.6s cadence is acquisition completeness not necessarily true provider cadence';
    } else if (aggregate.NEW_REPLAY_BUCKET_COUNT > 0) {
      hfSparseCadenceOrigin = 'NOT_DETERMINABLE';
      rd003Explanation =
        'Exact-origin replay shows additional provider buckets vs sealed capture; RD003 ~2s and RD004 sealed sparsity may both be true at different layers';
    } else if (aggregate.EXACT_BUCKET_INTERSECTION_COUNT >= aggregate.ORIGINAL_EXACT_WINDOW_SPEED_BUCKET_COUNT * 0.95) {
      hfSparseCadenceOrigin = 'PROVIDER_OR_UPSTREAM_CONFIRMED';
      hfCaptureCompletenessValidated = 'YES';
      rd003Explanation =
        'Exact-window replay matches sealed buckets — sealed sparsity reflects provider/upstream availability at capture time';
    }
  }

  return {
    evidenceId: RD004_B4_EVIDENCE_ID,
    mode: 'HF_EXACT_WINDOW_AGGREGATE_BUCKET_REPLAY',
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    DIMO_BUCKET_SEMANTICS,
    dimoProviderSourceAuthority: DIMO_PROVIDER_SOURCE_AUTHORITY,
    CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID,
    B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID,
    B3_108_VS_66_RESULT,
    EXACT_WINDOW_REPLAY_ATTEMPTED: input.replayAttempted ? 'YES' : 'NO',
    EXACT_WINDOW_REPLAY_SUCCEEDED: input.replaySucceeded ? 'YES' : 'NO',
    EXACT_WINDOW_REPLAY_WINDOW_COUNT: input.windows.length,
    ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE: 'NO',
    replayError: input.replayError ?? null,
    ORIGINAL_HF_QUERY_WINDOWS: input.windows,
    perWindowReplay: perWindow,
    aggregate,
    lateArrivalAnalysis: {
      differentialRowCount: lateArrivalRows.length,
      rows: lateArrivalRows,
    },
    watermarkRecoveryAnalysis: watermark,
    HF_CAPTURE_ROOT_CAUSE: rootCause,
    HF_SPARSE_CADENCE_ORIGIN: hfSparseCadenceOrigin,
    HF_CAPTURE_COMPLETENESS_VALIDATED: hfCaptureCompletenessValidated,
    RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED: rd003Explanation,
    generatedAt,
  };
}

export function buildLateArrivalAnalysisArtifact(
  exactReplay: ReturnType<typeof buildExactWindowReplayAnalysis>,
) {
  return {
    evidenceId: RD004_B4_EVIDENCE_ID,
    mode: 'HF_LATE_ARRIVAL_ANALYSIS',
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    ...exactReplay.lateArrivalAnalysis,
    watermarkRecoveryAnalysis: exactReplay.watermarkRecoveryAnalysis,
    HF_CAPTURE_ROOT_CAUSE: exactReplay.HF_CAPTURE_ROOT_CAUSE,
  };
}

export function buildWatermarkRecoveryAnalysisArtifact(
  exactReplay: ReturnType<typeof buildExactWindowReplayAnalysis>,
) {
  return {
    evidenceId: RD004_B4_EVIDENCE_ID,
    mode: 'HF_WATERMARK_RECOVERY_ANALYSIS',
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    ...exactReplay.watermarkRecoveryAnalysis,
    HF_CAPTURE_ROOT_CAUSE: exactReplay.HF_CAPTURE_ROOT_CAUSE,
    HF_QUERY_OVERLAP_MS,
    note:
      'Audit only — production watermark policy not changed in B.4',
  };
}
