/**
 * LDI-10D Phase 3D — GPS evidence quality & observability (offline).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/calibration/CALIBRATION_UNSET_V0';
import { classifyPositionRows } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/position/hold-release';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import {
  FIXTURE_REL,
  loadCommittedFixture,
  runSevenAlgorithmReplay,
  type FixtureBucket,
} from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import {
  computeCandidateSpeed,
  fixtureRowsToObservations,
  reproduceVideoBaselineMetrics,
  loadVideoComparison,
  VIDEO_BASELINE_EXPECTED,
} from './ldi10d-phase3c-gps-speed-research.lib';

export const EVIDENCE_TAGS = [
  'POSITION_PRESENT',
  'ROW_ABSENT',
  'FROZEN_COORDINATE',
  'TIMESTAMP_IRREGULARITY',
  'GPS_GEOMETRY_OUTLIER',
  'QC_UNTRUSTED',
  'TRUSTED_SPEED',
  'INSUFFICIENT_EVIDENCE',
] as const;

export type EvidenceTag = (typeof EVIDENCE_TAGS)[number];

export type BucketQualityRecord = {
  bucketLabelUtc: string;
  observedTags: EvidenceTag[];
  inferredTags: EvidenceTag[];
  epistemic: {
    observed: 'CONFIRMED';
    inferred: 'INFERRED' | 'NOT_APPLICABLE';
  };
  reasons: string[];
  provenance: string[];
  positionAvailability: string;
  qcTrustLevel: string;
  qcReasonCodes: string[];
  pinnedProductionL3Kmh: number | null;
  replayL3Kmh: number | null;
  l3DriftKmh: number | null;
  confidenceEvidenceScore: number;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
};

function labelMs(label: string): number {
  return Date.parse(label);
}

function isTrustedQc(q: string): boolean {
  return q === 'TRUSTED' || q === 'TRUSTED_LIMITED';
}

function coordsEqual(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): boolean {
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;
}

export function verifyPhase3dPreflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL';
  fixtureHashParity: boolean;
  phase3c2BaselineMae: number | null;
  phase3c2PairedN: number;
} {
  const errors: string[] = [];
  const fixtureDir = path.join(repoRoot, FIXTURE_REL);
  for (const f of [
    'TESLA_POSITION_GRID.json',
    'PROVENANCE_MANIFEST.json',
    'SHA256SUMS',
    'POSITION_CHANNEL_SNAPSHOT_V0_1.txt',
  ]) {
    if (!fs.existsSync(path.join(fixtureDir, f))) errors.push(`missing fixture ${f}`);
  }
  const grid = loadCommittedFixture(repoRoot);
  if (grid.bucketCount !== 1136) errors.push(`bucketCount ${grid.bucketCount}`);
  if (grid.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) errors.push('position hash mismatch');

  const sumsPath = path.join(fixtureDir, 'SHA256SUMS');
  let fixtureHashParity = false;
  if (fs.existsSync(sumsPath)) {
    const lines = fs.readFileSync(sumsPath, 'utf8').trim().split('\n');
    fixtureHashParity = lines.every((line) => {
      const parts = line.trim().split(/\s{2,}/);
      if (parts.length < 2) return false;
      const name = parts[0]!.trim();
      const expected = parts[parts.length - 1]!.trim();
      const filePath = path.join(fixtureDir, name);
      if (!fs.existsSync(filePath)) return false;
      const actual = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
      return actual === expected;
    });
    if (!fixtureHashParity) errors.push('SHA256SUMS mismatch');
  }

  const replay = runSevenAlgorithmReplay(repoRoot);
  const base = replay.baseline.trustedWitnessPairs;
  const video = reproduceVideoBaselineMetrics(loadVideoComparison(repoRoot));
  if (video.n !== VIDEO_BASELINE_EXPECTED.pairedN) errors.push(`video paired n ${video.n}`);
  if (base.maeKmh == null || Math.abs(base.maeKmh - VIDEO_BASELINE_EXPECTED.maeKmh) > 0.001) {
    errors.push('phase3c2 baseline MAE drift');
  }

  return {
    ok: errors.length === 0,
    errors,
    inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL',
    fixtureHashParity,
    phase3c2BaselineMae: base.maeKmh,
    phase3c2PairedN: base.n,
  };
}

function computeConfidenceEvidenceScore(
  b: FixtureBucket,
  observed: EvidenceTag[],
  replayL3: number | null,
): { score: number; band: BucketQualityRecord['confidenceBand'] } {
  let score = 0;
  if (observed.includes('POSITION_PRESENT')) score += 0.25;
  if (!observed.includes('ROW_ABSENT')) score += 0.1;
  if (!observed.includes('FROZEN_COORDINATE')) score += 0.15;
  if (!observed.includes('TIMESTAMP_IRREGULARITY')) score += 0.1;
  if (!observed.includes('GPS_GEOMETRY_OUTLIER')) score += 0.15;
  if (isTrustedQc(b.qcTrustLevel)) score += 0.15;
  if (replayL3 != null) score += 0.1;
  if (observed.includes('INSUFFICIENT_EVIDENCE')) score = Math.min(score, 0.35);
  score = Math.min(1, Math.max(0, score));
  const band =
    score >= 0.75 ? 'HIGH' : score >= 0.5 ? 'MEDIUM' : score >= 0.25 ? 'LOW' : 'NONE';
  return { score, band };
}

export function analyzeBucketQuality(
  buckets: FixtureBucket[],
  classified: ReturnType<typeof classifyPositionRows>,
): BucketQualityRecord[] {
  const classifiedByLabel = new Map(classified.map((r, i) => [r.observation.bucketLabel, i]));
  const out: BucketQualityRecord[] = [];

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const observed: EvidenceTag[] = [];
    const inferred: EvidenceTag[] = [];
    const reasons: string[] = [];
    const provenance = ['TESLA_POSITION_GRID.json', 'offline_phase3d_classifier_v1'];

    if (b.availability === 'PRESENT' && b.latitude != null && b.longitude != null) {
      observed.push('POSITION_PRESENT');
      reasons.push('availability=PRESENT with finite coordinates');
    }
    if (b.availability === 'ROW_ABSENT') {
      observed.push('ROW_ABSENT');
      reasons.push(`providerRowCount=${b.providerRowCount}`);
    }

    const prev = i > 0 ? buckets[i - 1] : null;
    if (prev) {
      const dt = (labelMs(b.bucketLabelUtc) - labelMs(prev.bucketLabelUtc)) / 1000;
      if (dt !== 1) {
        observed.push('TIMESTAMP_IRREGULARITY');
        reasons.push(`deltaSec=${dt} from previous bucket label`);
      }
    }

    if (
      prev &&
      b.latitude != null &&
      b.longitude != null &&
      prev.latitude != null &&
      prev.longitude != null
    ) {
      if (coordsEqual({ lat: prev.latitude, lon: prev.longitude }, { lat: b.latitude, lon: b.longitude })) {
        observed.push('FROZEN_COORDINATE');
        reasons.push('consecutive identical coordinates (observed)');
      }
      const dt = (labelMs(b.bucketLabelUtc) - labelMs(prev.bucketLabelUtc)) / 1000;
      if (dt > 0) {
        const d = haversineMeters(prev.latitude, prev.longitude, b.latitude, b.longitude);
        if (d / dt > 50) {
          inferred.push('GPS_GEOMETRY_OUTLIER');
          reasons.push(`inferred jump ${(d / dt).toFixed(1)} m/s between present fixes`);
        }
      }
    }

    if (!isTrustedQc(b.qcTrustLevel)) {
      observed.push('QC_UNTRUSTED');
      if (b.qcReasonCodes.length) reasons.push(`qcReasonCodes=${b.qcReasonCodes.join(',')}`);
    }

    if (b.qcTrustLevel === 'TRUSTED' && b.pinnedProductionL3Kmh != null) {
      observed.push('TRUSTED_SPEED');
      reasons.push('pinned production L3 numeric with TRUSTED QC');
    }

    const idx = classifiedByLabel.get(b.bucketLabelUtc);
    const replayL3 =
      idx !== undefined
        ? computeCandidateSpeed('L3_BASELINE_PRODUCTION', classified, idx, { value: null }).speedKmh
        : null;

    const insufficient =
      b.pinnedProductionL3Kmh == null &&
      (b.abstentionReason != null || !isTrustedQc(b.qcTrustLevel) || b.availability !== 'PRESENT');
    if (insufficient) {
      observed.push('INSUFFICIENT_EVIDENCE');
      reasons.push(
        b.abstentionReason
          ? `abstention=${b.abstentionReason}`
          : 'no trusted numeric speed at bucket',
      );
    }

    const drift =
      b.pinnedProductionL3Kmh != null && replayL3 != null
        ? Math.abs(b.pinnedProductionL3Kmh - replayL3)
        : null;

    const { score, band } = computeConfidenceEvidenceScore(b, observed, replayL3);

    out.push({
      bucketLabelUtc: b.bucketLabelUtc,
      observedTags: [...new Set(observed)],
      inferredTags: [...new Set(inferred)],
      epistemic: { observed: 'CONFIRMED', inferred: inferred.length ? 'INFERRED' : 'NOT_APPLICABLE' },
      reasons,
      provenance,
      positionAvailability: b.availability,
      qcTrustLevel: b.qcTrustLevel,
      qcReasonCodes: b.qcReasonCodes,
      pinnedProductionL3Kmh: b.pinnedProductionL3Kmh,
      replayL3Kmh: replayL3,
      l3DriftKmh: drift,
      confidenceEvidenceScore: score,
      confidenceBand: band,
    });
  }
  return out;
}

export type TripObservability = {
  bucketsTotal: number;
  positionPresent: number;
  rowAbsent: number;
  frozenCoordinateBuckets: number;
  timestampIrregularities: number;
  geometryOutlierInferred: number;
  qcUntrusted: number;
  trustedSpeed: number;
  trustedLimitedWithNumeric: number;
  insufficientEvidence: number;
  replayL3Numeric: number;
  maxL3DriftKmh: number;
  meanL3DriftKmh: number | null;
  qcReasonHistogram: Record<string, number>;
  abstentionHistogram: Record<string, number>;
  videoPairedTrustedN: number;
  accelDecelEvidence: {
    consecutiveTrustedNumericPairs: number;
    accelerationCandidateBucketsDeltaGte4Kmh: number;
    decelerationCandidateBucketsDeltaLteMinus4Kmh: number;
    epistemic: 'OBSERVED_DELTA_ON_PINNED_L3';
    note: string;
  };
};

export function buildTripObservability(
  records: BucketQualityRecord[],
  buckets: FixtureBucket[],
  videoPairedN: number,
): TripObservability {
  const tagCount = (tag: EvidenceTag) =>
    records.filter((r) => r.observedTags.includes(tag) || r.inferredTags.includes(tag)).length;

  const drifts = records
    .map((r) => r.l3DriftKmh)
    .filter((d): d is number => d != null && d > 1e-9);

  const qcHist: Record<string, number> = {};
  const abstHist: Record<string, number> = {};
  for (const r of records) {
    for (const c of r.qcReasonCodes) qcHist[c] = (qcHist[c] ?? 0) + 1;
  }
  for (const b of buckets) {
    const key = b.abstentionReason ?? 'NONE';
    abstHist[key] = (abstHist[key] ?? 0) + 1;
  }

  let consecutiveTrustedPairs = 0;
  let accelCandidates = 0;
  let decelCandidates = 0;
  for (let i = 1; i < buckets.length; i++) {
    const prev = buckets[i - 1]!;
    const cur = buckets[i]!;
    const dt = (labelMs(cur.bucketLabelUtc) - labelMs(prev.bucketLabelUtc)) / 1000;
    if (dt !== 1) continue;
    if (
      prev.pinnedProductionL3Kmh == null ||
      cur.pinnedProductionL3Kmh == null ||
      !isTrustedQc(prev.qcTrustLevel) ||
      !isTrustedQc(cur.qcTrustLevel)
    ) {
      continue;
    }
    consecutiveTrustedPairs += 1;
    const delta = cur.pinnedProductionL3Kmh - prev.pinnedProductionL3Kmh;
    if (delta >= 4) accelCandidates += 1;
    if (delta <= -4) decelCandidates += 1;
  }

  return {
    bucketsTotal: records.length,
    positionPresent: tagCount('POSITION_PRESENT'),
    rowAbsent: tagCount('ROW_ABSENT'),
    frozenCoordinateBuckets: tagCount('FROZEN_COORDINATE'),
    timestampIrregularities: tagCount('TIMESTAMP_IRREGULARITY'),
    geometryOutlierInferred: tagCount('GPS_GEOMETRY_OUTLIER'),
    qcUntrusted: tagCount('QC_UNTRUSTED'),
    trustedSpeed: tagCount('TRUSTED_SPEED'),
    trustedLimitedWithNumeric: records.filter(
      (r) => r.qcTrustLevel === 'TRUSTED_LIMITED' && r.pinnedProductionL3Kmh != null,
    ).length,
    insufficientEvidence: tagCount('INSUFFICIENT_EVIDENCE'),
    replayL3Numeric: records.filter((r) => r.replayL3Kmh != null).length,
    maxL3DriftKmh: drifts.length ? Math.max(...drifts) : 0,
    meanL3DriftKmh: drifts.length ? drifts.reduce((s, x) => s + x, 0) / drifts.length : null,
    qcReasonHistogram: qcHist,
    abstentionHistogram: abstHist,
    videoPairedTrustedN: videoPairedN,
    accelDecelEvidence: {
      consecutiveTrustedNumericPairs: consecutiveTrustedPairs,
      accelerationCandidateBucketsDeltaGte4Kmh: accelCandidates,
      decelerationCandidateBucketsDeltaLteMinus4Kmh: decelCandidates,
      epistemic: 'OBSERVED_DELTA_ON_PINNED_L3',
      note:
        'Calendar-adjacent 1 s buckets with TRUSTED/TRUSTED_LIMITED pinned L3 at both ends; ±4 km/h delta heuristic for observability only (not native event confirmation).',
    },
  };
}

export type CoverageRootCause = {
  causeId: string;
  layer: 'PROVIDER' | 'ACQUISITION' | 'QC' | 'ALGORITHM';
  bucketImpact: number;
  recoverableResearchOnly: boolean;
  note: string;
};

export function buildCoverageRootCauses(obs: TripObservability, buckets: FixtureBucket[]): {
  causes: CoverageRootCause[];
  recoverableBucketsEstimate: number;
  irrecoverableBucketsEstimate: number;
} {
  const noNumeric = buckets.filter((b) => b.pinnedProductionL3Kmh == null).length;
  const rowAbsent = obs.rowAbsent;
  const qcBlocked = buckets.filter((b) => !isTrustedQc(b.qcTrustLevel) && b.availability === 'PRESENT').length;

  const causes = [
    {
      causeId: 'PROVIDER_ROW_ABSENT',
      layer: 'PROVIDER' as const,
      bucketImpact: rowAbsent,
      recoverableResearchOnly: false,
      note: 'No DIMO provider row mapped to bucket — not recoverable without new telemetry',
    },
    {
      causeId: 'QC_NO_NUMERIC_OR_UNTRUSTED',
      layer: 'QC' as const,
      bucketImpact: qcBlocked,
      recoverableResearchOnly: true,
      note: 'Present position but QC did not emit trusted numeric speed — policy-sensitive, not measured recovery',
    },
    {
      causeId: 'L3_SUPPORT_WINDOW_GAPS',
      layer: 'ALGORITHM' as const,
      bucketImpact: Math.max(0, noNumeric - rowAbsent - qcBlocked),
      recoverableResearchOnly: true,
      note: 'Abstention from L3 support/hold semantics — algorithm change may shift coverage, not create GPS',
    },
    {
      causeId: 'FROZEN_COORDINATE_HOLD',
      layer: 'ALGORITHM' as const,
      bucketImpact: obs.frozenCoordinateBuckets,
      recoverableResearchOnly: false,
      note: 'Repeated coordinates — abstention intentional; not GPS interpolation',
    },
  ].sort((a, b) => b.bucketImpact - a.bucketImpact) as CoverageRootCause[];

  const irrecoverable = rowAbsent + obs.frozenCoordinateBuckets;
  const recoverable = Math.max(0, noNumeric - irrecoverable);

  return {
    causes,
    recoverableBucketsEstimate: recoverable,
    irrecoverableBucketsEstimate: irrecoverable,
  };
}

export function runPhase3dAnalysis(repoRoot: string): {
  records: BucketQualityRecord[];
  observability: TripObservability;
  rootCauses: ReturnType<typeof buildCoverageRootCauses>;
  l3BaselineDrift: 'NONE' | 'DRIFT';
  preflight: ReturnType<typeof verifyPhase3dPreflight>;
} {
  const preflight = verifyPhase3dPreflight(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  const classified = classifyPositionRows(
    fixtureRowsToObservations(fixture.buckets),
    CALIBRATION_UNSET_V0_BUNDLE,
  );
  const records = analyzeBucketQuality(fixture.buckets, classified);
  const observability = buildTripObservability(records, fixture.buckets, preflight.phase3c2PairedN);

  const drifts = records.map((r) => r.l3DriftKmh).filter((d): d is number => d != null);
  const maxDrift = drifts.length ? Math.max(...drifts) : 0;
  const l3BaselineDrift = maxDrift > 0.001 ? 'DRIFT' : 'NONE';

  const rootCauses = buildCoverageRootCauses(observability, fixture.buckets);

  return { records, observability, rootCauses, l3BaselineDrift, preflight };
}
