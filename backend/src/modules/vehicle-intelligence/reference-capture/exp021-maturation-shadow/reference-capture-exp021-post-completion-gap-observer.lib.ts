import { CANONICAL_EXP021_BUCKET_IDENTITY } from '../reference-capture-settlement-shadow-bucket-identity';

export const OBSERVER_SCHEMA_VERSION = 'exp021-post-completion-gap-observer-v1';
export const POST_TRIP_TEST_GEOMETRY_MS = 60_000;
export const SNAPSHOT_OFFSETS_MS = [0, 30_000, 120_000, 300_000, 600_000] as const;
export const SNAPSHOT_LABELS = ['S0', 'S1', 'S2', 'S3', 'S4'] as const;
export type SnapshotLabel = (typeof SNAPSHOT_LABELS)[number];

export const EXCLUDED_TRIP_ID = '9037edf0-68cc-4a18-a438-b81a49d9ca0a';

export const EXP021_GAP_OBSERVER_COHORT = [
  {
    vehicleLabel: 'KS MX 2024',
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    tokenId: 187336,
  },
  {
    vehicleLabel: 'KS MS 661',
    vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    tokenId: 187361,
  },
  {
    vehicleLabel: 'WOB L 7503',
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    tokenId: 192922,
  },
] as const;

export const HF_FAST_LOOP_FIELDS = [
  'angularVelocityYaw',
  'chassisAxleRow1WheelLeftSpeed',
  'chassisAxleRow1WheelRightSpeed',
  'obdEngineLoad',
  'obdThrottlePosition',
  'powertrainCombustionEngineMAF',
  'powertrainCombustionEngineSpeed',
  'powertrainCombustionEngineTPS',
  'powertrainCombustionEngineTorque',
  'powertrainCombustionEngineTorquePercent',
  'powertrainTractionBatteryStateOfChargeCurrent',
  'speed',
] as const;

export const SETTLEMENT_SHADOW_FIELDS = [
  'angularVelocityYaw',
  'chassisAxleRow1WheelLeftSpeed',
  'chassisAxleRow1WheelLeftTirePressure',
  'chassisAxleRow1WheelRightSpeed',
  'chassisAxleRow1WheelRightTirePressure',
  'chassisAxleRow2WheelLeftTirePressure',
  'chassisAxleRow2WheelRightTirePressure',
  'chassisBrakeCircuit1PressurePrimary',
  'chassisBrakeCircuit2PressurePrimary',
  'chassisBrakeIsPedalPressed',
  'chassisBrakePedalPosition',
  'chassisTireSystemIsWarningOn',
  'currentLocationAltitude',
  'currentLocationHeading',
  'exteriorAirTemperature',
  'obdEngineLoad',
  'obdIntakeTemp',
  'obdOilTemperature',
  'obdThrottlePosition',
  'powertrainCombustionEngineECT',
  'powertrainCombustionEngineMAF',
  'powertrainCombustionEngineSpeed',
  'powertrainCombustionEngineTPS',
  'powertrainCombustionEngineTorque',
  'powertrainCombustionEngineTorquePercent',
  'powertrainTractionBatteryCurrentPower',
  'powertrainTractionBatteryStateOfChargeCurrent',
  'powertrainTransmissionActualGear',
  'powertrainTransmissionActualGearRatio',
  'powertrainTransmissionCurrentGear',
  'powertrainTransmissionSelectedGear',
  'powertrainTransmissionTemperature',
  'speed',
] as const;

export type SnapshotStatus = 'PENDING' | 'MISSED' | 'COMPLETE';

export type GapMetrics = {
  bucketLocusCount: number;
  temporalBucketCount: number;
  firstProviderTimestamp: string | null;
  lastProviderTimestamp: string | null;
  medianGapMs: number | null;
  p95GapMs: number | null;
  maxGapMs: number | null;
  gapsGt2s: number;
  gapsGt5s: number;
  gapsGt10s: number;
};

export function mergeLaneManifests(manifests: string[][]): string[] {
  return [...new Set(manifests.flat())].sort();
}

function locusTimestampIso(loc: string): string {
  const idx = loc.indexOf('|');
  return idx >= 0 ? loc.slice(idx + 1) : '';
}

export function computeGapMetricsFromManifest(manifest: string[]): GapMetrics {
  const loci = [...new Set(manifest)].sort();
  const ts = loci
    .map((loc) => Date.parse(locusTimestampIso(loc)))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const gaps = ts.length > 1 ? ts.slice(1).map((t, i) => t - ts[i]) : [];
  const sortedGaps = [...gaps].sort((a, b) => a - b);

  const pct = (p: number): number | null => {
    if (!sortedGaps.length) return null;
    const idx = Math.min(sortedGaps.length - 1, Math.max(0, Math.ceil(sortedGaps.length * p) - 1));
    return sortedGaps[idx];
  };

  const iso = (ms: number) => new Date(ms).toISOString();

  return {
    bucketLocusCount: loci.length,
    temporalBucketCount: ts.length,
    firstProviderTimestamp: ts.length ? iso(ts[0]) : null,
    lastProviderTimestamp: ts.length ? iso(ts[ts.length - 1]) : null,
    medianGapMs: pct(0.5),
    p95GapMs: pct(0.95),
    maxGapMs: sortedGaps.length ? sortedGaps[sortedGaps.length - 1] : null,
    gapsGt2s: gaps.filter((g) => g > 2000).length,
    gapsGt5s: gaps.filter((g) => g > 5000).length,
    gapsGt10s: gaps.filter((g) => g > 10000).length,
  };
}

export type LocusDelta = {
  newLoci: number;
  lostLoci: number;
  unchangedLoci: number;
  newTemporalBuckets: number;
  previousMaxGapMs: number | null;
  newMaxGapMs: number | null;
  previousP95GapMs: number | null;
  newP95GapMs: number | null;
  gapReductionOccurred: boolean;
};

export function compareLocusSets(previous: string[], next: string[]): LocusDelta {
  const a = new Set(previous);
  const b = new Set(next);
  const prevMetrics = computeGapMetricsFromManifest(previous);
  const nextMetrics = computeGapMetricsFromManifest(next);
  const ta = new Set(previous.map((l) => locusTimestampIso(l)));
  const tb = new Set(next.map((l) => locusTimestampIso(l)));
  const maxImproved =
    prevMetrics.maxGapMs != null &&
    nextMetrics.maxGapMs != null &&
    nextMetrics.maxGapMs < prevMetrics.maxGapMs;
  const p95Improved =
    prevMetrics.p95GapMs != null &&
    nextMetrics.p95GapMs != null &&
    nextMetrics.p95GapMs < prevMetrics.p95GapMs;

  return {
    newLoci: [...b].filter((x) => !a.has(x)).length,
    lostLoci: [...a].filter((x) => !b.has(x)).length,
    unchangedLoci: [...a].filter((x) => b.has(x)).length,
    newTemporalBuckets: [...tb].filter((x) => !ta.has(x)).length,
    previousMaxGapMs: prevMetrics.maxGapMs,
    newMaxGapMs: nextMetrics.maxGapMs,
    previousP95GapMs: prevMetrics.p95GapMs,
    newP95GapMs: nextMetrics.p95GapMs,
    gapReductionOccurred: maxImproved || p95Improved,
  };
}

export function findFirstStableSnapshot(
  snapshots: Array<{ label: SnapshotLabel; manifest: string[] | null; status: SnapshotStatus }>,
): SnapshotLabel | null {
  const complete = snapshots.filter((s) => s.status === 'COMPLETE' && s.manifest);
  for (let i = 0; i < complete.length; i++) {
    const base = new Set(complete[i].manifest!);
    let stable = true;
    for (let j = i + 1; j < complete.length; j++) {
      const later = new Set(complete[j].manifest!);
      if (base.size !== later.size) {
        stable = false;
        break;
      }
      for (const loc of base) {
        if (!later.has(loc)) {
          stable = false;
          break;
        }
      }
      if (!stable) break;
    }
    if (stable) return complete[i].label;
  }
  return null;
}

export function shouldMarkSnapshotMissed(
  nowMs: number,
  targetAtMs: number,
  missGraceMs: number,
): boolean {
  return nowMs > targetAtMs + missGraceMs;
}

export function bucketIdentityVersion(): string {
  return CANONICAL_EXP021_BUCKET_IDENTITY;
}

export type SeriesAggregateRow = {
  tripId: string;
  vehicleLabel: string;
  s0Locus: number | null;
  s30Locus: number | null;
  s120Locus: number | null;
  s300Locus: number | null;
  s600Locus: number | null;
  firstStable: SnapshotLabel | null;
  lateDataFound: boolean;
};

function median(vals: number[]): number | null {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function buildInterimAggregate(rows: SeriesAggregateRow[]) {
  const complete = rows.filter((r) => r.s600Locus != null);
  const locusAt = (key: keyof SeriesAggregateRow) =>
    complete.map((r) => r[key] as number | null).filter((v): v is number => v != null);

  return {
    completeSeriesCount: complete.length,
    minCompleteSeriesCheckpoint: 5,
    targetCompleteSeriesCheckpoint: 10,
    byAge: {
      S0: { tripCount: complete.length, medianLocusCount: median(locusAt('s0Locus')) },
      S1: { tripCount: complete.filter((r) => r.s30Locus != null).length, medianLocusCount: median(locusAt('s30Locus')) },
      S2: { tripCount: complete.filter((r) => r.s120Locus != null).length, medianLocusCount: median(locusAt('s120Locus')) },
      S3: { tripCount: complete.filter((r) => r.s300Locus != null).length, medianLocusCount: median(locusAt('s300Locus')) },
      S4: { tripCount: complete.length, medianLocusCount: median(locusAt('s600Locus')) },
    },
    tripsStableAtS0: complete.filter((r) => r.firstStable === 'S0').length,
    tripsStableBy30s: complete.filter((r) => r.firstStable === 'S0' || r.firstStable === 'S1').length,
    tripsStableBy120s: complete.filter((r) => ['S0', 'S1', 'S2'].includes(r.firstStable ?? '')).length,
    tripsStableBy300s: complete.filter((r) => r.firstStable != null).length,
    tripsStableBy600s: complete.filter((r) => r.firstStable != null).length,
    tripsGainingAfterS0: complete.filter((r) => r.lateDataFound).length,
  };
}
