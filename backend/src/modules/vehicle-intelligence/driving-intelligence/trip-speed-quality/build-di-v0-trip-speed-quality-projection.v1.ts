import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import {
  DI_V0_SPEED_QC_DEFAULT_POLICY_VERSION,
  resolveDiV0SpeedQcPolicyVersion,
} from '../speed-qc/di-v0-speed-qc-policy.version';
import { DI_V0_SPEED_QC_REASON, type DiV0SpeedQcReasonCode } from '../speed-qc/di-v0-speed-qc-reason-codes';
import type { DiV0SpeedQcShadowInterval } from '../speed-qc/di-v0-speed-qc.types';
import { evaluateDiV0SpeedQcInterval } from '../speed-qc/evaluate-di-v0-speed-qc-interval';
import {
  deriveDiV0TripSpeedQualityAssessability,
  resolveDiV0TripSpeedMaxAssessability,
} from './di-v0-trip-speed-quality-assessability';
import {
  emptyDiV0TripSpeedQualityMotionCounts,
  incrementDiV0TripSpeedQualityMotionCounter,
} from './di-v0-trip-speed-quality-motion';
import type { DiV0TripSpeedQualityEvidenceBundle } from './di-v0-trip-speed-quality-evidence';
import { DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1 } from './di-v0-trip-speed-quality-projection.version';
import type {
  DiV0TripSpeedQualityProjectionV1,
  DiV0TripSpeedQualityTrustedDistributionBand,
} from './di-v0-trip-speed-quality-projection.types';

const TRUSTED_SPEED_BANDS: Array<{ label: string; min: number; max: number | null }> = [
  { label: '0', min: 0, max: 1 },
  { label: '1-30', min: 1, max: 31 },
  { label: '31-50', min: 31, max: 51 },
  { label: '51-80', min: 51, max: 81 },
  { label: '81-120', min: 81, max: 121 },
  { label: '121+', min: 121, max: null },
];

export interface DiV0TripSpeedQualityShadowRow {
  intervalStart: Date;
  intervalEnd: Date;
  referenceTime: Date;
  motionState: string;
  positionState: string;
  estimatedSpeedKmh: number | null;
  speedEvidenceState: string | null;
  valueConfidence: string;
  sourceRelation: string;
  abstentionReason: string | null;
  evidenceSources: unknown;
  sourceQualityFlags: unknown;
}

function dateToBucketLabel(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function toShadowInterval(row: DiV0TripSpeedQualityShadowRow): DiV0SpeedQcShadowInterval {
  return {
    intervalStart: dateToBucketLabel(row.intervalStart),
    intervalEnd: dateToBucketLabel(row.intervalEnd),
    referenceTime: dateToBucketLabel(row.referenceTime),
    estimatedSpeedKmh: row.estimatedSpeedKmh,
    speedEvidenceState: (row.speedEvidenceState ?? 'NONE') as DiV0SpeedQcShadowInterval['speedEvidenceState'],
    valueConfidence: row.valueConfidence as DiV0SpeedQcShadowInterval['valueConfidence'],
    sourceRelation: row.sourceRelation as DiV0SpeedQcShadowInterval['sourceRelation'],
    motionState: row.motionState as DiV0SpeedQcShadowInterval['motionState'],
    positionState: row.positionState as DiV0SpeedQcShadowInterval['positionState'],
    abstentionReason: row.abstentionReason as DiV0SpeedQcShadowInterval['abstentionReason'],
    sourceQualityFlags: Array.isArray(row.sourceQualityFlags) ? row.sourceQualityFlags.map(String) : [],
    evidenceSources: Array.isArray(row.evidenceSources) ? row.evidenceSources.map(String) : [],
  };
}

function incrementReason(
  breakdown: Partial<Record<DiV0SpeedQcReasonCode, number>>,
  code: DiV0SpeedQcReasonCode,
): void {
  breakdown[code] = (breakdown[code] ?? 0) + 1;
}

function bandForTrustedSpeed(kmh: number): DiV0TripSpeedQualityTrustedDistributionBand | null {
  for (const b of TRUSTED_SPEED_BANDS) {
    if (kmh >= b.min && (b.max == null || kmh < b.max)) {
      return {
        label: b.label,
        minKmhInclusive: b.min,
        maxKmhExclusive: b.max,
        trustedIntervalCount: 0,
      };
    }
  }
  return null;
}

function percent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((1000 * numerator) / denominator) / 10;
}

export function buildDiV0TripSpeedQualityProjectionV1(input: {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  workItemId: string;
  shadowRunId: string;
  pinnedSnapshotHash: string;
  boundaryFingerprint: string;
  sourceFamily: DiV0S4SourceFamily;
  combinedInputIdentity: string | null;
  shadowInputEvidenceVersion: string | null;
  workItemCompletedAt: Date | null;
  snapshotVerified: boolean;
  evidence: DiV0TripSpeedQualityEvidenceBundle;
  shadowIntervals: DiV0TripSpeedQualityShadowRow[];
  qcPolicyVersion?: string;
}): DiV0TripSpeedQualityProjectionV1 {
  const qcPolicyVersion = resolveDiV0SpeedQcPolicyVersion(
    input.qcPolicyVersion ?? DI_V0_SPEED_QC_DEFAULT_POLICY_VERSION,
  );
  const reasonCodeBreakdown: Partial<Record<DiV0SpeedQcReasonCode, number>> = {};
  let numericSpeedCount = 0;
  let trustedNumericCount = 0;
  let trustedLimitedCount = 0;
  let trustedLimitedStationaryCount = 0;
  let trustedLimitedNumericCount = 0;
  let untrustedCount = 0;
  let missingEvidenceCount = 0;
  let sourceConflictCount = 0;
  let shadowRawMax: number | null = null;
  let qcTrustedMax: number | null = null;
  const trustedSpeedsForMean: number[] = [];
  const bandCounts = new Map<string, number>();
  for (const b of TRUSTED_SPEED_BANDS) {
    bandCounts.set(b.label, 0);
  }

  const motion = emptyDiV0TripSpeedQualityMotionCounts();

  for (const row of input.shadowIntervals) {
    const shadow = toShadowInterval(row);
    incrementDiV0TripSpeedQualityMotionCounter(shadow.motionState, motion);
    if (shadow.estimatedSpeedKmh != null && Number.isFinite(shadow.estimatedSpeedKmh)) {
      numericSpeedCount += 1;
      shadowRawMax = shadowRawMax == null ? shadow.estimatedSpeedKmh : Math.max(shadowRawMax, shadow.estimatedSpeedKmh);
    }
    const centerLabel = dateToBucketLabel(row.referenceTime);
    const verdict = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: centerLabel,
      shadow,
      positions: input.evidence.positions,
      r1Obd: input.evidence.r1Obd,
      evidenceIdentity: { pinnedSnapshotHash: input.pinnedSnapshotHash },
      qcPolicyVersion,
    });
    for (const code of verdict.reasonCodes) {
      incrementReason(reasonCodeBreakdown, code);
    }
    if (verdict.reasonCodes.includes(DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE)) {
      missingEvidenceCount += 1;
    }
    if (verdict.reasonCodes.includes(DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT)) {
      sourceConflictCount += 1;
    }
    if (verdict.trustLevel === 'TRUSTED') {
      trustedNumericCount += 1;
      if (verdict.qcTrustedSpeedKmh != null && Number.isFinite(verdict.qcTrustedSpeedKmh)) {
        trustedSpeedsForMean.push(verdict.qcTrustedSpeedKmh);
        qcTrustedMax =
          qcTrustedMax == null ? verdict.qcTrustedSpeedKmh : Math.max(qcTrustedMax, verdict.qcTrustedSpeedKmh);
        const band = bandForTrustedSpeed(verdict.qcTrustedSpeedKmh);
        if (band) {
          bandCounts.set(band.label, (bandCounts.get(band.label) ?? 0) + 1);
        }
      }
    } else if (verdict.trustLevel === 'TRUSTED_LIMITED') {
      trustedLimitedCount += 1;
      const stationaryLimited =
        shadow.speedEvidenceState === 'STATIONARY_BAND' || shadow.motionState === 'STATIONARY_SUPPORTED';
      if (stationaryLimited) {
        trustedLimitedStationaryCount += 1;
      } else {
        trustedLimitedNumericCount += 1;
      }
    } else {
      untrustedCount += 1;
    }
  }

  const totalIntervalCount = input.shadowIntervals.length;
  const numericCoveragePercent = percent(numericSpeedCount, totalIntervalCount);
  const trustedNumericCoveragePercent = percent(trustedNumericCount, totalIntervalCount);
  const trustedLimitedCoveragePercent = percent(trustedLimitedCount, totalIntervalCount);
  const nonUntrustedCoveragePercent = percent(trustedNumericCount + trustedLimitedCount, totalIntervalCount);
  const trustedCoveragePercent = trustedNumericCoveragePercent;

  const trustedSpeedDistribution: DiV0TripSpeedQualityTrustedDistributionBand[] = TRUSTED_SPEED_BANDS.map((b) => ({
    label: b.label,
    minKmhInclusive: b.min,
    maxKmhExclusive: b.max,
    trustedIntervalCount: bandCounts.get(b.label) ?? 0,
  }));

  const maxSpeedAssessability = resolveDiV0TripSpeedMaxAssessability({
    trustedNumericCount,
    trustedLimitedCount,
    qcTrustedMaxKmh: qcTrustedMax,
    shadowRawMaxKmh: shadowRawMax,
  });

  const quality = {
    totalIntervalCount,
    numericSpeedCount,
    trustedNumericCount,
    trustedLimitedCount,
    trustedLimitedStationaryCount,
    trustedLimitedNumericCount,
    untrustedCount,
    numericCoveragePercent,
    trustedNumericCoveragePercent,
    trustedLimitedCoveragePercent,
    nonUntrustedCoveragePercent,
    trustedCoveragePercent,
    reasonCodeBreakdown,
    missingEvidenceCount,
    sourceConflictCount,
  };

  const speed = {
    shadowRawMaxKmh: shadowRawMax,
    qcTrustedMaxKmh: qcTrustedMax,
    qcTrustedMeanKmh:
      trustedSpeedsForMean.length === 0
        ? null
        : Math.round((trustedSpeedsForMean.reduce((a, b) => a + b, 0) / trustedSpeedsForMean.length) * 100) / 100,
    trustedSpeedDistribution,
    maxSpeedAssessability,
  };

  const assessability = deriveDiV0TripSpeedQualityAssessability(quality, speed, input.snapshotVerified);

  return {
    identity: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      workItemId: input.workItemId,
      shadowRunId: input.shadowRunId,
      pinnedSnapshotHash: input.pinnedSnapshotHash,
      boundaryFingerprint: input.boundaryFingerprint,
      qcPolicyVersion,
      projectionVersion: DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1,
    },
    quality,
    speed,
    motion,
    assessability,
    provenance: {
      sourceFamily: input.sourceFamily,
      qcPolicyVersion,
      projectionVersion: DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1,
      combinedInputIdentity: input.combinedInputIdentity,
      shadowInputEvidenceVersion: input.shadowInputEvidenceVersion,
      workItemCompletedAt: input.workItemCompletedAt?.toISOString() ?? null,
    },
  };
}
