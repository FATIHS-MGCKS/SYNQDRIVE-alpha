import { createHash } from 'crypto';
import type { DiV0SpeedQcPositionSample } from '../speed-qc/di-v0-speed-qc.types';
import { isValidGeoCoordinate } from '../speed-qc/di-v0-speed-qc-position-index';
import { halfOpenWindowFromInclusiveEnd } from './di-v0-exp021-bucket-interval-alignment';
import { bucketLabelPlusSeconds } from '../speed-qc/di-v0-speed-qc-geo';
import { enumerateAcquisitionBucketLabels, type AcquisitionWindow } from './di-v0-p21-r3-forensic-classify';
import { classifyBucketStage, type PositionBucketStage } from './di-v0-exp021-position-gap-forensic';
import type { DiV0AcquiredPositionBucket } from '../position-acquisition/di-v0-position-acquisition.types';

export type BucketPresence = 'ABSENT' | 'PRESENT_VALID' | 'NULL_OR_INVALID';

export type DisjointBucketCategory =
  | 'NOT_COMPARABLE'
  | 'NULL_OR_INVALID'
  | 'PIN_ABSENT_PROVIDER_PRESENT'
  | 'PIN_ABSENT_PROVIDER_ABSENT'
  | 'PIN_PRESENT_PROVIDER_ABSENT'
  | 'PIN_PRESENT_PROVIDER_PRESENT';

export function presenceFromPinSample(
  row: DiV0SpeedQcPositionSample | undefined,
  stage: PositionBucketStage,
): BucketPresence {
  if (stage === 'EXPECTED_BUCKET_ABSENT_FROM_SNAPSHOT_MAP' || stage === 'WINDOW_EDGE_OUTSIDE_ACQUISITION') {
    return 'ABSENT';
  }
  if (!row) return 'ABSENT';
  if (row.availability === 'ROW_ABSENT') return 'ABSENT';
  if (row.availability === 'SIGNAL_NULL') return 'NULL_OR_INVALID';
  if (
    row.latitude == null ||
    row.longitude == null ||
    !isValidGeoCoordinate(row.latitude, row.longitude)
  ) {
    return 'NULL_OR_INVALID';
  }
  return 'PRESENT_VALID';
}

export function presenceFromProviderBucket(bucket: DiV0AcquiredPositionBucket | undefined): BucketPresence {
  if (!bucket) return 'ABSENT';
  if (bucket.availability === 'ROW_ABSENT') return 'ABSENT';
  if (bucket.availability === 'SIGNAL_NULL') return 'NULL_OR_INVALID';
  const lat = bucket.observation.latitude;
  const lon = bucket.observation.longitude;
  if (lat == null || lon == null || !isValidGeoCoordinate(lat, lon)) return 'NULL_OR_INVALID';
  return 'PRESENT_VALID';
}

export function classifyDisjointBucketCategory(
  pin: BucketPresence,
  provider: BucketPresence,
): DisjointBucketCategory {
  if (pin === 'NULL_OR_INVALID' || provider === 'NULL_OR_INVALID') return 'NULL_OR_INVALID';
  if (pin === 'ABSENT' && provider === 'PRESENT_VALID') return 'PIN_ABSENT_PROVIDER_PRESENT';
  if (pin === 'ABSENT' && provider === 'ABSENT') return 'PIN_ABSENT_PROVIDER_ABSENT';
  if (pin === 'PRESENT_VALID' && provider === 'ABSENT') return 'PIN_PRESENT_PROVIDER_ABSENT';
  if (pin === 'PRESENT_VALID' && provider === 'PRESENT_VALID') return 'PIN_PRESENT_PROVIDER_PRESENT';
  return 'NOT_COMPARABLE';
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** `sortedAbsentLabels` must be ascending UTC bucket labels where the dimension is absent. */
export function summarizeAbsentRuns(sortedAbsentLabels: string[]): {
  absentRunCount: number;
  longestAbsentRunSeconds: number;
  longestAbsentRunStart: string | null;
  longestAbsentRunEndExclusive: string | null;
} {
  if (sortedAbsentLabels.length === 0) {
    return {
      absentRunCount: 0,
      longestAbsentRunSeconds: 0,
      longestAbsentRunStart: null,
      longestAbsentRunEndExclusive: null,
    };
  }
  let longest = 0;
  let longestStart: string | null = null;
  let longestEnd: string | null = null;
  let run = 0;
  let runStart: string | null = null;
  let runCount = 0;
  for (let i = 0; i < sortedAbsentLabels.length; i++) {
    const label = sortedAbsentLabels[i];
    const prev = i > 0 ? sortedAbsentLabels[i - 1] : null;
    const consecutive = prev != null && bucketLabelPlusSeconds(prev, 1) === label;
    if (!consecutive) {
      if (run > 0) runCount += 1;
      run = 1;
      runStart = label;
    } else {
      run += 1;
    }
    if (run > longest) {
      longest = run;
      longestStart = runStart;
      longestEnd = label;
    }
  }
  if (run > 0) runCount += 1;
  return {
    absentRunCount: runCount,
    longestAbsentRunSeconds: longest,
    longestAbsentRunStart: longestStart,
    longestAbsentRunEndExclusive:
      longestEnd != null ? bucketLabelPlusSeconds(longestEnd, 1) : null,
  };
}

export function comparePinToProviderBuckets(input: {
  pinPositions: DiV0SpeedQcPositionSample[];
  providerBuckets: DiV0AcquiredPositionBucket[];
  acquisitionWindow: AcquisitionWindow;
  subWindowInclusiveEnd?: { startInclusive: string; endInclusive: string };
}): {
  expectedBucketCount: number;
  matrix: Record<DisjointBucketCategory, number>;
  bothPresentCoordinateChanged: number;
  bothPresentCoordinateUnchanged: number;
  subWindow?: Record<DisjointBucketCategory, number>;
  providerRawRowCount: number;
  providerUniqueTimestampLabels: number;
  providerDuplicateTimestampLabels: number;
  providerRejectedRows: number;
  pinAbsentRunSummary: ReturnType<typeof summarizeAbsentRuns>;
  providerAbsentRunSummary: ReturnType<typeof summarizeAbsentRuns>;
} {
  const posByLabel = new Map(input.pinPositions.map((p) => [p.bucketLabel, p]));
  const provByLabel = new Map(input.providerBuckets.map((b) => [b.bucketLabel, b]));
  const expected = enumerateAcquisitionBucketLabels(input.acquisitionWindow);

  const matrix: Record<DisjointBucketCategory, number> = {
    NOT_COMPARABLE: 0,
    NULL_OR_INVALID: 0,
    PIN_ABSENT_PROVIDER_PRESENT: 0,
    PIN_ABSENT_PROVIDER_ABSENT: 0,
    PIN_PRESENT_PROVIDER_ABSENT: 0,
    PIN_PRESENT_PROVIDER_PRESENT: 0,
  };
  let bothPresentCoordinateChanged = 0;
  let bothPresentCoordinateUnchanged = 0;
  const pinAbsentLabels: string[] = [];
  const providerAbsentLabels: string[] = [];

  const subLabels =
    input.subWindowInclusiveEnd != null
      ? new Set(
          enumerateAcquisitionBucketLabels({
            startLabel: input.subWindowInclusiveEnd.startInclusive,
            endLabel: halfOpenWindowFromInclusiveEnd(
              input.subWindowInclusiveEnd.startInclusive,
              input.subWindowInclusiveEnd.endInclusive,
            ).endExclusive,
          }),
        )
      : null;
  const subMatrix: Record<DisjointBucketCategory, number> = {
    NOT_COMPARABLE: 0,
    NULL_OR_INVALID: 0,
    PIN_ABSENT_PROVIDER_PRESENT: 0,
    PIN_ABSENT_PROVIDER_ABSENT: 0,
    PIN_PRESENT_PROVIDER_ABSENT: 0,
    PIN_PRESENT_PROVIDER_PRESENT: 0,
  };

  for (const label of expected) {
    const pinRow = posByLabel.get(label);
    const pinStage = classifyBucketStage(label, posByLabel, input.acquisitionWindow);
    const pinP = presenceFromPinSample(pinRow, pinStage);
    const provP = presenceFromProviderBucket(provByLabel.get(label));
    const cat = classifyDisjointBucketCategory(pinP, provP);
    matrix[cat] += 1;
    if (subLabels?.has(label)) subMatrix[cat] += 1;
    if (pinP === 'ABSENT') pinAbsentLabels.push(label);
    if (provP === 'ABSENT') providerAbsentLabels.push(label);

    if (cat === 'PIN_PRESENT_PROVIDER_PRESENT' && pinRow && provByLabel.get(label)) {
      const pb = provByLabel.get(label)!;
      const latMatch = pinRow.latitude === pb.observation.latitude;
      const lonMatch = pinRow.longitude === pb.observation.longitude;
      if (latMatch && lonMatch) bothPresentCoordinateUnchanged += 1;
      else bothPresentCoordinateChanged += 1;
    }
  }

  const tsCounts = new Map<string, number>();
  for (const b of input.providerBuckets) {
    if (b.providerRowCount > 0) {
      tsCounts.set(b.bucketLabel, (tsCounts.get(b.bucketLabel) ?? 0) + 1);
    }
  }
  let dup = 0;
  for (const c of tsCounts.values()) {
    if (c > 1) dup += c - 1;
  }

  return {
    expectedBucketCount: expected.length,
    matrix,
    bothPresentCoordinateChanged,
    bothPresentCoordinateUnchanged,
    subWindow: subLabels ? subMatrix : undefined,
    providerRawRowCount: input.providerBuckets.reduce((s, b) => s + b.providerRowCount, 0),
    providerUniqueTimestampLabels: tsCounts.size,
    providerDuplicateTimestampLabels: dup,
    providerRejectedRows: 0,
    pinAbsentRunSummary: summarizeAbsentRuns(pinAbsentLabels),
    providerAbsentRunSummary: summarizeAbsentRuns(providerAbsentLabels),
  };
}
