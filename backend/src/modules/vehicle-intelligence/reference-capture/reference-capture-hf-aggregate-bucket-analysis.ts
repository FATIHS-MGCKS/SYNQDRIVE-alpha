/**
 * HF aggregate bucket analysis helpers for RD001 exact-window replay experiments.
 */

export const HF_AGGREGATE_BUCKET_INTERVAL_MS = 1000;

export type WatermarkExclusionClassification =
  | 'DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK'
  | 'PARTIALLY_OVERLAPPED_BY_NEXT_WINDOW'
  | 'POTENTIALLY_REQUERYABLE'
  | 'NO_NEXT_WINDOW_EVIDENCE';

export type BucketClosureAtOriginalResponse = 'CLOSED' | 'OPEN';

export type BucketClosureClassification =
  | 'CLOSED_BUCKET_NOT_AVAILABLE_AT_ORIGINAL_RESPONSE'
  | 'BUCKET_NOT_CLOSED_AT_ORIGINAL_RESPONSE';

export type HfLateArrivalDifferentialRow = {
  observationType: 'HF_AGGREGATE_BUCKET_OBSERVATION';
  providerField: string;
  bucketStart: string;
  bucketEnd: string;
  avgValue: number;
  originalHfWindowFrom: string;
  originalHfWindowTo: string;
  originalRequestStartedAt: string;
  originalRequestCompletedAt: string | null;
  nextKnownHfWindowFrom: string | null;
  watermarkClassification: WatermarkExclusionClassification;
  bucketClosureAtOriginalResponse: BucketClosureAtOriginalResponse;
  availabilityLagLowerBoundSeconds: number | null;
  replayExperimentGeneratedAt: string;
};

export type AggregateBucketObservation = {
  providerField: string;
  bucketTimestamp: string;
  avgValue: number;
};

/** Canonical RFC3339 instant for aggregate bucket identity comparisons. */
export function canonicalizeBucketTimestamp(timestamp: string | Date): string {
  const ms = timestamp instanceof Date ? timestamp.getTime() : Date.parse(timestamp);
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid bucket timestamp: ${String(timestamp)}`);
  }
  return new Date(ms).toISOString();
}

export function aggregateBucketKey(providerField: string, bucketTimestamp: string | Date): string {
  return `${providerField}|${canonicalizeBucketTimestamp(bucketTimestamp)}`;
}

export function bucketIntervalBoundsMs(bucketTimestamp: string | Date): { startMs: number; endMs: number } {
  const startMs = Date.parse(canonicalizeBucketTimestamp(bucketTimestamp));
  return { startMs, endMs: startMs + HF_AGGREGATE_BUCKET_INTERVAL_MS };
}

export function classifyWatermarkExclusion(args: {
  bucketTimestamp: string | Date;
  nextWindowFrom: string | Date | null | undefined;
}): WatermarkExclusionClassification {
  if (args.nextWindowFrom == null) return 'NO_NEXT_WINDOW_EVIDENCE';
  const { startMs, endMs } = bucketIntervalBoundsMs(args.bucketTimestamp);
  const nextFromMs = Date.parse(canonicalizeBucketTimestamp(args.nextWindowFrom));
  if (!Number.isFinite(nextFromMs)) return 'NO_NEXT_WINDOW_EVIDENCE';
  if (endMs <= nextFromMs) return 'DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK';
  if (startMs < nextFromMs && nextFromMs < endMs) return 'PARTIALLY_OVERLAPPED_BY_NEXT_WINDOW';
  if (startMs >= nextFromMs) return 'POTENTIALLY_REQUERYABLE';
  return 'UNKNOWN_REQUIRES_VALIDATION' as never;
}

export type AggregateBucketComparison = {
  originalBucketObservations: number;
  replayBucketObservations: number;
  unchangedBucketObservations: number;
  newBucketObservations: number;
  removedBucketObservations: number;
  changedValueBucketObservations: number;
};

export function compareAggregateBucketMaps(
  original: Map<string, AggregateBucketObservation>,
  replay: Map<string, AggregateBucketObservation>,
  valueEpsilon = 1e-9,
): AggregateBucketComparison {
  let unchangedBucketObservations = 0;
  let changedValueBucketObservations = 0;
  let removedBucketObservations = 0;
  let newBucketObservations = 0;

  for (const [key, ob] of original.entries()) {
    const rb = replay.get(key);
    if (!rb) {
      removedBucketObservations++;
      continue;
    }
    if (Math.abs(ob.avgValue - rb.avgValue) < valueEpsilon) unchangedBucketObservations++;
    else changedValueBucketObservations++;
  }
  for (const key of replay.keys()) {
    if (!original.has(key)) newBucketObservations++;
  }

  return {
    originalBucketObservations: original.size,
    replayBucketObservations: replay.size,
    unchangedBucketObservations,
    newBucketObservations,
    removedBucketObservations,
    changedValueBucketObservations,
  };
}

export function classifyBucketClosureAtOriginalResponse(args: {
  bucketTimestamp: string | Date;
  requestCompletedAt: string | Date | null | undefined;
}): {
  bucketClosureAtOriginalResponse: BucketClosureAtOriginalResponse;
  bucketClosureClassification: BucketClosureClassification | null;
} {
  if (args.requestCompletedAt == null) {
    return {
      bucketClosureAtOriginalResponse: 'OPEN',
      bucketClosureClassification: 'BUCKET_NOT_CLOSED_AT_ORIGINAL_RESPONSE',
    };
  }
  const { endMs } = bucketIntervalBoundsMs(args.bucketTimestamp);
  const completedMs = Date.parse(canonicalizeBucketTimestamp(args.requestCompletedAt));
  if (!Number.isFinite(completedMs)) {
    return {
      bucketClosureAtOriginalResponse: 'OPEN',
      bucketClosureClassification: 'BUCKET_NOT_CLOSED_AT_ORIGINAL_RESPONSE',
    };
  }
  if (endMs > completedMs) {
    return {
      bucketClosureAtOriginalResponse: 'OPEN',
      bucketClosureClassification: 'BUCKET_NOT_CLOSED_AT_ORIGINAL_RESPONSE',
    };
  }
  return {
    bucketClosureAtOriginalResponse: 'CLOSED',
    bucketClosureClassification: 'CLOSED_BUCKET_NOT_AVAILABLE_AT_ORIGINAL_RESPONSE',
  };
}

export function computeAvailabilityLagLowerBoundSeconds(args: {
  bucketTimestamp: string | Date;
  requestCompletedAt: string | Date | null | undefined;
}): number | null {
  const closure = classifyBucketClosureAtOriginalResponse(args);
  if (closure.bucketClosureAtOriginalResponse !== 'CLOSED' || args.requestCompletedAt == null) return null;
  const { endMs } = bucketIntervalBoundsMs(args.bucketTimestamp);
  const completedMs = Date.parse(canonicalizeBucketTimestamp(args.requestCompletedAt));
  if (!Number.isFinite(completedMs)) return null;
  const lagSeconds = (completedMs - endMs) / 1000;
  return lagSeconds >= 0 ? lagSeconds : null;
}

export function countDefinitelyExcludedUniqueBucketTimestamps(
  rows: Array<Pick<HfLateArrivalDifferentialRow, 'bucketStart' | 'watermarkClassification'>>,
): number {
  const unique = new Set<string>();
  for (const row of rows) {
    if (row.watermarkClassification !== 'DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK') continue;
    unique.add(canonicalizeBucketTimestamp(row.bucketStart));
  }
  return unique.size;
}

export function summarizeLagSeconds(values: number[]): {
  count: number;
  minSeconds: number | null;
  p50Seconds: number | null;
  p95Seconds: number | null;
  maxSeconds: number | null;
} {
  if (!values.length) {
    return { count: 0, minSeconds: null, p50Seconds: null, p95Seconds: null, maxSeconds: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))];
  return {
    count: sorted.length,
    minSeconds: sorted[0],
    p50Seconds: pct(50),
    p95Seconds: pct(95),
    maxSeconds: sorted[sorted.length - 1],
  };
}

export const DIMO_PROVIDER_SOURCE_AUTHORITY = {
  primaryPublicRepo: 'DIMO-Network/telemetry-api',
  primaryCommitSha: '98d88534857fec95a507a61331d5e357b86cfcc6',
  primaryFiles: [
    'internal/service/ch/ch.go',
    'internal/service/ch/queries.go',
  ],
  bucketSemantics: 'QUERY-FROM-ANCHORED AGGREGATION BUCKETS',
  bucketTimestampMeaning: 'timestamp = start of interval',
  bucketOriginParameter: 'aggArgs.FromTS passed to selectInterval(..., origin)',
  successorNote:
    'DIMO-Network/dq may proxy/serve production queries; telemetry-api ch/queries.go is the verified public ClickHouse aggregation implementation cited here.',
} as const;
