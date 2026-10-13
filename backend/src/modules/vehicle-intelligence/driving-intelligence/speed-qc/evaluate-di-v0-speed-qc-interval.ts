import type { PositionState } from '../core/types';
import { DI_V0_SPEED_QC_CALIBRATION_PROVISIONAL_V1 } from './di-v0-speed-qc-calibration';
import { DI_V0_SPEED_QC_POLICY_V1 } from './di-v0-speed-qc-policy.version';
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
  DiV0SpeedQcR1Sample,
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

function positionByLabel(positions: DiV0SpeedQcPositionSample[]): Map<string, DiV0SpeedQcPositionSample> {
  const map = new Map<string, DiV0SpeedQcPositionSample>();
  for (const p of positions) {
    map.set(p.bucketLabel, p);
  }
  return map;
}

function r1ByLabel(samples: DiV0SpeedQcR1Sample[] | undefined): Map<string, DiV0SpeedQcR1Sample> {
  const map = new Map<string, DiV0SpeedQcR1Sample>();
  for (const r of samples ?? []) {
    map.set(r.bucketLabel, r);
  }
  return map;
}

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

function trusted(
  level: DiV0SpeedQcTrustLevel,
  reason: DiV0SpeedQcReasonCode,
  speedKmh: number | null,
  partial: Omit<DiV0SpeedQcIntervalVerdict, 'trustLevel' | 'reasonCodes' | 'qcTrustedSpeedKmh'>,
): DiV0SpeedQcIntervalVerdict {
  return {
    ...partial,
    trustLevel: level,
    reasonCodes: [reason],
    qcTrustedSpeedKmh: speedKmh,
  };
}

/**
 * Pure, deterministic speed QC for one shadow interval (DI_V0_SPEED_QC_POLICY_V1).
 * Does not mutate shadow data or call external systems.
 */
export function evaluateDiV0SpeedQcInterval(input: DiV0SpeedQcEvaluateInput): DiV0SpeedQcIntervalVerdict {
  const cal = DI_V0_SPEED_QC_CALIBRATION_PROVISIONAL_V1;
  const { shadow, centerBucketLabel, evidenceIdentity } = input;

  const basePartial = (): Omit<DiV0SpeedQcIntervalVerdict, 'trustLevel' | 'reasonCodes' | 'qcTrustedSpeedKmh'> => ({
    qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V1,
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

  let centerLabel = centerBucketLabel;
  try {
    bucketLabelToMs(centerLabel);
  } catch {
    return untrusted([DI_V0_SPEED_QC_REASON.INVALID_INPUT], basePartial());
  }

  const posMap = positionByLabel(input.positions);
  const r1Map = r1ByLabel(input.r1Obd);

  const prevLabel = bucketLabelMinusSeconds(centerLabel, 1);
  const nextLabel = bucketLabelPlusSeconds(centerLabel, 1);
  const prev = posMap.get(prevLabel);
  const center = posMap.get(centerLabel);
  const next = posMap.get(nextLabel);

  const supportAssessment = basePartial().supportAssessment;
  supportAssessment.prevLabel = prevLabel;
  supportAssessment.nextLabel = nextLabel;
  supportAssessment.calendarSupportComplete = Boolean(prev && center && next);

  const r1Center = r1Map.get(centerLabel);
  const r1Speed = r1Center?.speedKmh ?? null;
  const sourceCorroboration = basePartial().sourceCorroboration;
  sourceCorroboration.r1PresentAtCenter = r1Speed != null && Number.isFinite(r1Speed);
  sourceCorroboration.r1SpeedKmhAtCenter = r1Speed;
  sourceCorroboration.r1CorroboratesL3 = r1Corroborates(shadow.estimatedSpeedKmh, r1Speed);
  sourceCorroboration.r1IndependentWitness = sourceCorroboration.r1CorroboratesL3;

  const physical = basePartial().physicalPlausibility;
  physical.maxLegSpeedMpsApplied = sourceCorroboration.r1IndependentWitness
    ? cal.maxLegSpeedMpsCorroborated
    : cal.maxLegSpeedMpsUncorroborated;

  const buildVerdict = (
    trustLevel: DiV0SpeedQcTrustLevel,
    reasonCodes: DiV0SpeedQcReasonCode[],
    qcSpeed: number | null,
  ): DiV0SpeedQcIntervalVerdict => ({
    qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V1,
    trustLevel,
    reasonCodes,
    inputEvidenceIdentity: evidenceIdentity,
    originalEstimatedSpeedKmh: shadow.estimatedSpeedKmh,
    qcTrustedSpeedKmh: qcSpeed,
    supportAssessment,
    sourceCorroboration,
    physicalPlausibility: physical,
  });

  // Q1 — no numeric shadow speed
  const speed = shadow.estimatedSpeedKmh;
  if (speed == null || !Number.isFinite(speed)) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.NO_NUMERIC], null);
  }

  // Q2 — cross-source conflict on shadow row
  if (shadow.sourceRelation === 'CONFLICTING' || shadow.sourceRelation === 'CONFLICT_EXPLAINED') {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT], null);
  }

  // Q3 — shadow abstained / non-numeric evidence state
  const abstainedStates = new Set(['NONE', 'ABSTAINED', 'MOVEMENT_ONLY']);
  if (shadow.abstentionReason != null || abstainedStates.has(shadow.speedEvidenceState)) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.SHADOW_ABSTAINED], null);
  }

  if (shadow.speedEvidenceState === 'STATIONARY_BAND') {
    return buildVerdict('TRUSTED_LIMITED', [DI_V0_SPEED_QC_REASON.OK_MODERATE], null);
  }

  // Q4 — compromised L3 support flags on shadow interval
  const compromised = shadow.sourceQualityFlags.filter((f) => SUPPORT_COMPROMISED_FLAGS.has(f));
  supportAssessment.supportQualityFlags = compromised;
  if (compromised.length > 0) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.SUPPORT_WINDOW_COMPROMISED], null);
  }

  // Position evidence required for kinematic rules — fail closed
  if (!prev || !center || !next) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE], null);
  }

  for (const row of [prev, center, next]) {
    if (row.availability === 'ROW_ABSENT' || row.availability === 'SIGNAL_NULL') {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE], null);
    }
    if (row.latitude == null || row.longitude == null || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE], null);
    }
  }

  // Q9 — frozen / release in calendar support window
  for (const row of [prev, center, next]) {
    const ps = row.positionState ?? shadow.positionState;
    if (FROZEN_OR_RELEASE.has(ps)) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.FROZEN_OR_RELEASE_IN_SUPPORT], null);
    }
  }

  // Q7 — post-gap recovery (ROW_ABSENT in lookback before center)
  const lookback = cal.postGapLookbackSeconds;
  for (let s = 1; s <= lookback; s += 1) {
    const label = bucketLabelMinusSeconds(centerLabel, s);
    const sample = posMap.get(label);
    if (sample?.availability === 'ROW_ABSENT') {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.POST_GAP_REACQUIRE], null);
    }
  }

  const dPrev = haversineMeters(prev.latitude!, prev.longitude!, center.latitude!, center.longitude!);
  const dNext = haversineMeters(center.latitude!, center.longitude!, next.latitude!, next.longitude!);
  const dtPrev = (bucketLabelToMs(centerLabel) - bucketLabelToMs(prevLabel)) / 1000;
  const dtNext = (bucketLabelToMs(nextLabel) - bucketLabelToMs(centerLabel)) / 1000;

  supportAssessment.legDistancesM = { prevToCenter: dPrev, centerToNext: dNext };
  supportAssessment.legDeltaSeconds = { prevToCenter: dtPrev, centerToNext: dtNext };
  const vPrev = legSpeedMps(dPrev, dtPrev);
  const vNext = legSpeedMps(dNext, dtNext);
  supportAssessment.legImpliedSpeedMps = { prevToCenter: vPrev, centerToNext: vNext };

  const maxLeg = physical.maxLegSpeedMpsApplied;

  // Q6 — geometry jump per leg
  if (vPrev != null && vPrev > maxLeg) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.GEOMETRY_JUMP], null);
  }
  if (vNext != null && vNext > maxLeg) {
    return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.GEOMETRY_JUMP], null);
  }

  // Q5 — acceleration consistency across support legs
  if (vPrev != null && vNext != null && dtPrev > 0 && dtNext > 0) {
    const dtMid = (dtPrev + dtNext) / 2;
    const accel = (vNext - vPrev) / dtMid;
    physical.impliedAccelPrevCenterNextMps2 = accel;
    if (Number.isFinite(accel) && Math.abs(accel) > cal.maxLongitudinalAccelMps2) {
      return buildVerdict('UNTRUSTED', [DI_V0_SPEED_QC_REASON.KINEMATIC_IMPLAUSIBLE_LEG], null);
    }
  }

  // Q8 — R1 disagreement when R1 present (independent witness semantics)
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
