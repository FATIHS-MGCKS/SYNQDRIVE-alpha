import type { PositionState } from '../core/types';
import { DI_V0_SPEED_QC_CALIBRATION_PROVISIONAL_V1 } from './di-v0-speed-qc-calibration';
import {
  buildDiV0SpeedQcPositionIndex,
  buildDiV0SpeedQcR1Index,
  isValidGeoCoordinate,
  normalizeBucketLabelSafe,
} from './di-v0-speed-qc-position-index';
import {
  DI_V0_SPEED_QC_POLICY_V1,
  DI_V0_SPEED_QC_POLICY_V2,
  resolveDiV0SpeedQcPolicyVersion,
} from './di-v0-speed-qc-policy.version';
import { DI_V0_SPEED_QC_REASON, type DiV0SpeedQcReasonCode } from './di-v0-speed-qc-reason-codes';
import {
  bucketLabelMinusSeconds,
  bucketLabelPlusSeconds,
  bucketLabelToMs,
  haversineMeters,
} from './di-v0-speed-qc-geo';
import type {
  DiV0SpeedQcEvaluateInput,
  DiV0SpeedQcIntervalVerdict,
  DiV0SpeedQcPositionSample,
  DiV0SpeedQcTrustLevel,
} from './di-v0-speed-qc.types';

const SUPPORT_COMPROMISED_FLAGS = new Set([
  'L3_SUPPORT_CROSSES_GAP',
  'L3_SUPPORT_CROSSES_HOLD',
  'L3_SUPPORT_CROSSES_RELEASE',
  'L3_SUPPORT_DUPLICATE_BUCKET_LABEL',
  'L3_SUPPORT_NONPOSITIVE_TIME_DELTA',
]);

const FROZEN_OR_RELEASE: ReadonlySet<PositionState> = new Set([
  'FROZEN_UNRESOLVED',
  'FROZEN_MOVEMENT_SUPPORTED',
  'FROZEN_STOP_SUPPORTED',
  'RELEASE',
]);

/** Aligns with CALIBRATION_UNSET_V0 crawl / stop bands — QC-only, PROVISIONAL. */
const STATIONARY_MAX_TRUSTED_SPEED_KMH = 5;

function legSpeedMps(distanceM: number, deltaSeconds: number): number | null {
  if (!Number.isFinite(distanceM) || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return null;
  }
  return distanceM / deltaSeconds;
}

function r1Corroborates(l3Kmh: number | null, r1Kmh: number | null): boolean {
  if (l3Kmh == null || r1Kmh == null || !Number.isFinite(l3Kmh) || !Number.isFinite(r1Kmh)) {
    return false;
  }
  const cal = DI_V0_SPEED_QC_CALIBRATION_PROVISIONAL_V1;
  const delta = Math.abs(r1Kmh - l3Kmh);
  const band = Math.max(cal.r1CorroborationAbsKmh, l3Kmh * cal.r1CorroborationRelPct);
  return delta <= band;
}

function r1Disagrees(l3Kmh: number | null, r1Kmh: number | null): boolean {
  if (l3Kmh == null || r1Kmh == null || !Number.isFinite(l3Kmh) || !Number.isFinite(r1Kmh)) {
    return false;
  }
  const cal = DI_V0_SPEED_QC_CALIBRATION_PROVISIONAL_V1;
  const delta = Math.abs(r1Kmh - l3Kmh);
  const threshold = Math.max(cal.r1DisagreementAbsKmh, l3Kmh * cal.r1DisagreementRelPct);
  return delta >= threshold;
}

function untrusted(
  reasons: DiV0SpeedQcReasonCode[],
  partial: Omit<DiV0SpeedQcIntervalVerdict, 'trustLevel' | 'reasonCodes' | 'qcTrustedSpeedKmh'>,
): DiV0SpeedQcIntervalVerdict {
  return {
    ...partial,
    trustLevel: 'UNTRUSTED',
    reasonCodes: reasons,
    qcTrustedSpeedKmh: null,
  };
}

/**
 * Pure, deterministic speed QC for one shadow interval (DI_V0_SPEED_QC_POLICY_V1).
 * Does not mutate shadow data or call external systems.
 */
export function evaluateDiV0SpeedQcInterval(input: DiV0SpeedQcEvaluateInput): DiV0SpeedQcIntervalVerdict {
  const cal = DI_V0_SPEED_QC_CALIBRATION_PROVISIONAL_V1;
  const { shadow, centerBucketLabel, evidenceIdentity } = input;
  const qcPolicyVersion = resolveDiV0SpeedQcPolicyVersion(input.qcPolicyVersion);

  const basePartial = (): Omit<DiV0SpeedQcIntervalVerdict, 'trustLevel' | 'reasonCodes' | 'qcTrustedSpeedKmh'> => ({
    qcPolicyVersion,
    inputEvidenceIdentity: evidenceIdentity,
    originalEstimatedSpeedKmh: shadow.estimatedSpeedKmh,
    supportAssessment: {
      prevLabel: null,
      centerLabel: centerBucketLabel,
      nextLabel: null,
      calendarSupportComplete: false,
      legDistancesM: { prevToCenter: null, centerToNext: null },
      legImpliedSpeedMps: { prevToCenter: null, centerToNext: null },
      legDeltaSeconds: { prevToCenter: null, centerToNext: null },
      supportQualityFlags: [],
    },
    sourceCorroboration: {
      r1PresentAtCenter: false,
      r1SpeedKmhAtCenter: null,
      r1CorroboratesL3: false,
      r1IndependentWitness: false,
      r1IntervalOnlyAtCenter: false,
    },
    physicalPlausibility: {
      calibrationKind: 'PROVISIONAL',
      maxLegSpeedMpsApplied: cal.maxLegSpeedMpsUncorroborated,
      maxLongitudinalAccelMps2Applied: cal.maxLongitudinalAccelMps2,
      impliedAccelPrevCenterNextMps2: null,
    },
  });

  if (evidenceIdentity.expectedPinnedSnapshotHash != null) {
    if (evidenceIdentity.expectedPinnedSnapshotHash !== evidenceIdentity.pinnedSnapshotHash) {
      return untrusted([DI_V0_SPEED_QC_REASON.SNAPSHOT_INTEGRITY_FAIL], basePartial());
    }
  }

  const centerLabel = centerBucketLabel;
  try {
    bucketLabelToMs(centerLabel);
  } catch {
    return untrusted([DI_V0_SPEED_QC_REASON.INVALID_INPUT], basePartial());
  }

  const centerRef = normalizeBucketLabelSafe(centerLabel);
  const shadowRef = normalizeBucketLabelSafe(shadow.referenceTime);
  if (centerRef == null || shadowRef == null || centerRef !== shadowRef) {
    return untrusted(
      [DI_V0_SPEED_QC_REASON.REFERENCE_TIME_MISMATCH],
      basePartial(),
    );
  }

  const positionIndex = buildDiV0SpeedQcPositionIndex(input.positions);
  if (!positionIndex.ok) {
    return untrusted([DI_V0_SPEED_QC_REASON.DUPLICATE_BUCKET_LABEL], basePartial());
  }
  const posMap = positionIndex.byLabel;

  const r1Index = buildDiV0SpeedQcR1Index(input.r1Obd);
  if (!r1Index.ok) {
    return untrusted([DI_V0_SPEED_QC_REASON.DUPLICATE_R1_BUCKET_LABEL], basePartial());
  }
  const r1Map = r1Index.byLabel;

  const prevLabel = bucketLabelMinusSeconds(centerLabel, 1);
  const nextLabel = bucketLabelPlusSeconds(centerLabel, 1);
  const prev = posMap.get(prevLabel);
  const center = posMap.get(centerLabel);
  const next = posMap.get(nextLabel);

  const partial = basePartial();
  const supportAssessment = partial.supportAssessment;
  supportAssessment.prevLabel = prevLabel;
  supportAssessment.nextLabel = nextLabel;
  supportAssessment.calendarSupportComplete = Boolean(prev && center && next);

  const r1Center = r1Map.get(centerLabel);
  const r1Speed = r1Center?.speedKmh ?? null;
  const r1IntervalOnly = shadow.sourceQualityFlags.includes('R1_INTERVAL_ONLY');
  const sourceCorroboration = partial.sourceCorroboration;
  sourceCorroboration.r1PresentAtCenter = r1Speed != null && Number.isFinite(r1Speed);
  sourceCorroboration.r1SpeedKmhAtCenter = r1Speed;
  sourceCorroboration.r1CorroboratesL3 = r1Corroborates(shadow.estimatedSpeedKmh, r1Speed);
  sourceCorroboration.r1IntervalOnlyAtCenter = r1IntervalOnly;
  sourceCorroboration.r1IndependentWitness =
    sourceCorroboration.r1CorroboratesL3 && !r1IntervalOnly;

  const physical = partial.physicalPlausibility;
  physical.maxLegSpeedMpsApplied = sourceCorroboration.r1IndependentWitness
    ? cal.maxLegSpeedMpsCorroborated
    : cal.maxLegSpeedMpsUncorroborated;

  const buildVerdict = (
    trustLevel: DiV0SpeedQcTrustLevel,
    reasonCodes: DiV0SpeedQcReasonCode[],
    qcSpeed: number | null,
  ): DiV0SpeedQcIntervalVerdict => ({
    qcPolicyVersion,
    trustLevel,
    reasonCodes,
    inputEvidenceIdentity: evidenceIdentity,
    originalEstimatedSpeedKmh: shadow.estimatedSpeedKmh,
    qcTrustedSpeedKmh: qcSpeed,
    supportAssessment,
    sourceCorroboration,
    physicalPlausibility: physical,
  });

  const speed = shadow.estimatedSpeedKmh;
  if (speed === null) {
    if (qcPolicyVersion === DI_V0_SPEED_QC_POLICY_V2) {
      const stationaryVerdict = attemptV2StationaryNullSpeedAcceptance({
        shadow,
        centerLabel,
        prev,
        center,
        next,
        posMap,
        supportAssessment,
        buildVerdict,
      });
      if (stationaryVerdict != null) {
        return stationaryVerdict;
      }
    }
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.NO_NUMERIC], null);
  }
  if (speed == null || !Number.isFinite(speed)) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.NO_NUMERIC], null);
  }

  if (shadow.sourceRelation === 'CONFLICTING' || shadow.sourceRelation === 'CONFLICT_EXPLAINED') {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT], null);
  }

  const abstainedStates = new Set(['NONE', 'ABSTAINED', 'MOVEMENT_ONLY']);
  if (shadow.abstentionReason != null || abstainedStates.has(shadow.speedEvidenceState)) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.SHADOW_ABSTAINED], null);
  }

  if (shadow.speedEvidenceState === 'STATIONARY_BAND') {
    const movingMotion =
      shadow.motionState === 'MOVING_SPEED_ESTIMATED' || shadow.motionState === 'MOVING_SPEED_UNKNOWN';
    if (movingMotion || speed > STATIONARY_MAX_TRUSTED_SPEED_KMH) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.STATIONARY_INCONSISTENT], null);
    }
    if (shadow.motionState !== 'STATIONARY_SUPPORTED') {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.STATIONARY_INCONSISTENT], null);
    }
    const centerPos = posMap.get(centerLabel);
    if (
      !centerPos ||
      centerPos.availability !== 'PRESENT' ||
      centerPos.latitude == null ||
      centerPos.longitude == null ||
      !isValidGeoCoordinate(centerPos.latitude, centerPos.longitude)
    ) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE], null);
    }
    return buildVerdict('TRUSTED_LIMITED', [DI_V0_SPEED_QC_REASON.OK_MODERATE], null);
  }

  const compromised = shadow.sourceQualityFlags.filter((f) => SUPPORT_COMPROMISED_FLAGS.has(f));
  supportAssessment.supportQualityFlags = compromised;
  if (compromised.length > 0) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.SUPPORT_WINDOW_COMPROMISED], null);
  }

  if (!prev || !center || !next) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE], null);
  }

  for (const row of [prev, center, next]) {
    if (row.availability === 'ROW_ABSENT' || row.availability === 'SIGNAL_NULL') {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE], null);
    }
    if (row.latitude == null || row.longitude == null) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE], null);
    }
    if (!isValidGeoCoordinate(row.latitude, row.longitude)) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.INVALID_GEO_COORDINATES], null);
    }
  }

  for (const row of [prev, center, next]) {
    const ps = row.positionState ?? shadow.positionState;
    if (FROZEN_OR_RELEASE.has(ps)) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.FROZEN_OR_RELEASE_IN_SUPPORT], null);
    }
  }

  const dPrev = haversineMeters(prev.latitude!, prev.longitude!, center.latitude!, center.longitude!);
  const dNext = haversineMeters(center.latitude!, center.longitude!, next.latitude!, next.longitude!);
  const dtPrev = (bucketLabelToMs(centerLabel) - bucketLabelToMs(prevLabel)) / 1000;
  const dtNext = (bucketLabelToMs(nextLabel) - bucketLabelToMs(centerLabel)) / 1000;

  if (dtPrev <= 0 || dtNext <= 0) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.INVALID_INPUT], null);
  }

  supportAssessment.legDistancesM = { prevToCenter: dPrev, centerToNext: dNext };
  supportAssessment.legDeltaSeconds = { prevToCenter: dtPrev, centerToNext: dtNext };
  const vPrev = legSpeedMps(dPrev, dtPrev);
  const vNext = legSpeedMps(dNext, dtNext);
  supportAssessment.legImpliedSpeedMps = { prevToCenter: vPrev, centerToNext: vNext };

  const maxLeg = physical.maxLegSpeedMpsApplied;

  if (vPrev != null && vPrev > maxLeg) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.GEOMETRY_JUMP], null);
  }
  if (vNext != null && vNext > maxLeg) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.GEOMETRY_JUMP], null);
  }

  if (vPrev != null && vNext != null) {
    const dtMid = (dtPrev + dtNext) / 2;
    const accel = (vNext - vPrev) / dtMid;
    physical.impliedAccelPrevCenterNextMps2 = accel;
    if (Number.isFinite(accel) && Math.abs(accel) > cal.maxLongitudinalAccelMps2) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.KINEMATIC_IMPLAUSIBLE_LEG], null);
    }
  }

  let postGapAbsentInLookback = false;
  for (let s = 1; s <= cal.postGapLookbackSeconds; s += 1) {
    const label = bucketLabelMinusSeconds(centerLabel, s);
    if (posMap.get(label)?.availability === 'ROW_ABSENT') {
      postGapAbsentInLookback = true;
      break;
    }
  }
  if (
    postGapAbsentInLookback &&
    ((vPrev != null && vPrev > maxLeg) ||
      (vNext != null && vNext > maxLeg) ||
      shadow.sourceQualityFlags.includes('L3_SUPPORT_CROSSES_GAP'))
  ) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.POST_GAP_REACQUIRE], null);
  }

  if (r1Speed != null && Number.isFinite(r1Speed) && r1Disagrees(speed, r1Speed)) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.R1_DISAGREEMENT], null);
  }

  if (shadow.valueConfidence === 'LOW' || shadow.valueConfidence === 'UNAVAILABLE') {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.LOW_SHADOW_CONFIDENCE], null);
  }

  if (shadow.valueConfidence === 'MODERATE') {
    return buildVerdict('TRUSTED_LIMITED', [DI_V0_SPEED_QC_REASON.OK_MODERATE], speed);
  }

  return buildVerdict('TRUSTED', [DI_V0_SPEED_QC_REASON.OK], speed);
}

type BuildVerdictFn = (
  trustLevel: DiV0SpeedQcTrustLevel,
  reasonCodes: DiV0SpeedQcReasonCode[],
  qcSpeed: number | null,
) => DiV0SpeedQcIntervalVerdict;

/**
 * V2 only: evaluate S1 stationary band with intentional null speed before NO_NUMERIC.
 * Returns null to fall through to NO_NUMERIC.
 */
function attemptV2StationaryNullSpeedAcceptance(ctx: {
  shadow: DiV0SpeedQcEvaluateInput['shadow'];
  centerLabel: string;
  prev: DiV0SpeedQcPositionSample | undefined;
  center: DiV0SpeedQcPositionSample | undefined;
  next: DiV0SpeedQcPositionSample | undefined;
  posMap: Map<string, DiV0SpeedQcPositionSample>;
  supportAssessment: DiV0SpeedQcIntervalVerdict['supportAssessment'];
  buildVerdict: BuildVerdictFn;
}): DiV0SpeedQcIntervalVerdict | null {
  const { shadow, centerLabel, prev, center, next, buildVerdict } = ctx;

  if (shadow.speedEvidenceState !== 'STATIONARY_BAND' || shadow.motionState !== 'STATIONARY_SUPPORTED') {
    return null;
  }

  if (shadow.sourceRelation === 'CONFLICTING' || shadow.sourceRelation === 'CONFLICT_EXPLAINED') {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT], null);
  }

  if (shadow.positionState === 'FROZEN_UNRESOLVED' || shadow.positionState === 'RELEASE') {
    return null;
  }

  const compromised = shadow.sourceQualityFlags.filter((f) => SUPPORT_COMPROMISED_FLAGS.has(f));
  ctx.supportAssessment.supportQualityFlags = compromised;
  if (compromised.length > 0) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.SUPPORT_WINDOW_COMPROMISED], null);
  }

  const centerPos = center ?? ctx.posMap.get(centerLabel);
  if (
    !centerPos ||
    centerPos.availability !== 'PRESENT' ||
    centerPos.latitude == null ||
    centerPos.longitude == null ||
    !isValidGeoCoordinate(centerPos.latitude, centerPos.longitude)
  ) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE], null);
  }

  if (shadow.abstentionReason != null && shadow.positionState !== 'FROZEN_STOP_SUPPORTED') {
    return null;
  }

  if (shadow.positionState === 'FROZEN_STOP_SUPPORTED') {
    const centerPs = centerPos.positionState ?? shadow.positionState;
    if (centerPs !== 'FROZEN_STOP_SUPPORTED') {
      return null;
    }
    return buildVerdict('TRUSTED_LIMITED', [DI_V0_SPEED_QC_REASON.OK_STATIONARY_NULL_SPEED], null);
  }

  if (!prev || !center || !next) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE], null);
  }

  for (const row of [prev, center, next]) {
    if (row.availability === 'ROW_ABSENT' || row.availability === 'SIGNAL_NULL') {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE], null);
    }
    if (row.latitude == null || row.longitude == null) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE], null);
    }
    if (!isValidGeoCoordinate(row.latitude, row.longitude)) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.INVALID_GEO_COORDINATES], null);
    }
    const ps = row.positionState ?? shadow.positionState;
    if (FROZEN_OR_RELEASE.has(ps)) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.FROZEN_OR_RELEASE_IN_SUPPORT], null);
    }
  }

  const prevLabel = bucketLabelMinusSeconds(centerLabel, 1);
  const nextLabel = bucketLabelPlusSeconds(centerLabel, 1);
  const dPrev = haversineMeters(prev.latitude!, prev.longitude!, center.latitude!, center.longitude!);
  const dNext = haversineMeters(center.latitude!, center.longitude!, next.latitude!, next.longitude!);
  const dtPrev = (bucketLabelToMs(centerLabel) - bucketLabelToMs(prevLabel)) / 1000;
  const dtNext = (bucketLabelToMs(nextLabel) - bucketLabelToMs(centerLabel)) / 1000;
  if (dtPrev <= 0 || dtNext <= 0) {
    return null;
  }
  const vPrevMps = legSpeedMps(dPrev, dtPrev);
  const vNextMps = legSpeedMps(dNext, dtNext);
  const maxStationaryMps = (STATIONARY_MAX_TRUSTED_SPEED_KMH * 1000) / 3600;
  if (
    (vPrevMps != null && vPrevMps > maxStationaryMps) ||
    (vNextMps != null && vNextMps > maxStationaryMps)
  ) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.STATIONARY_INCONSISTENT], null);
  }

  return buildVerdict('TRUSTED_LIMITED', [DI_V0_SPEED_QC_REASON.OK_STATIONARY_NULL_SPEED], null);
}
