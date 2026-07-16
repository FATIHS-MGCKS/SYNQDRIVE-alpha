import { BatteryPolicyProfile } from '../../battery-policy-profile/battery-policy-profile.types';
import {
  presentBatteryDataQuality,
  type BatteryDataQualityStatus,
} from '../battery-data-quality';
import {
  BATTERY_FRESHNESS_THRESHOLDS_MS,
  buildObservationFreshness,
  observationFreshnessIsDecisionFresh,
} from '../battery-freshness.policy';
import {
  LV_CANONICAL_RESOLVER_VERSION,
  LV_CANONICAL_SCORE_LABEL_DE,
  LV_CANONICAL_SCORE_SEMANTICS,
  type CanonicalLvBatteryResponse,
  type LvCanonicalLegacyDiagnostic,
  type LvCanonicalLiveVoltage,
  type LvCanonicalPrimaryTruth,
  type LvCanonicalTruthSource,
  type ResolveCanonicalLvBatteryInput,
} from './lv-canonical-battery.types';

export {
  LV_CANONICAL_RESOLVER_VERSION,
  LV_CANONICAL_TRUTH_SOURCES,
  type CanonicalLvBatteryResponse,
  type LvCanonicalTruthSource,
} from './lv-canonical-battery.types';

const PLAUSIBLE_LV_VOLTAGE_MIN = 9;
const PLAUSIBLE_LV_VOLTAGE_MAX = 16;
const CHARGING_VOLTAGE_THRESHOLD = 13.2;

function isSupportedProfile(
  policy: ResolveCanonicalLvBatteryInput['policy'],
): boolean {
  return (
    policy.lvAssessmentAllowed &&
    policy.profile !== BatteryPolicyProfile.UNSUPPORTED_PROFILE &&
    policy.profile !== BatteryPolicyProfile.UNKNOWN_PROFILE
  );
}

function isSafeLiveTelemetry(
  live: LvCanonicalLiveVoltage | null,
  now: Date,
): live is LvCanonicalLiveVoltage {
  if (!live) return false;
  if (
    live.voltageV < PLAUSIBLE_LV_VOLTAGE_MIN ||
    live.voltageV > PLAUSIBLE_LV_VOLTAGE_MAX
  ) {
    return false;
  }
  if (live.engineRunning === true) {
    return false;
  }
  if (live.voltageV >= CHARGING_VOLTAGE_THRESHOLD) {
    return false;
  }
  const freshness = buildObservationFreshness({
    observedAt: live.observedAt,
    maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
    now,
    hasValueCarrier: true,
  });
  return observationFreshnessIsDecisionFresh(freshness);
}

function hasLegacyDiagnostic(
  legacy: ResolveCanonicalLvBatteryInput['legacy'],
): boolean {
  if (!legacy) return false;
  return (
    legacy.publishedSohPct != null ||
    legacy.stabilizedSohPct != null ||
    legacy.rawSohPct != null
  );
}

function buildPrimaryTruth(
  input: ResolveCanonicalLvBatteryInput,
  now: Date,
): LvCanonicalPrimaryTruth {
  const base = {
    semanticType: LV_CANONICAL_SCORE_SEMANTICS,
    labelDe: LV_CANONICAL_SCORE_LABEL_DE,
  } as const;

  if (!isSupportedProfile(input.policy)) {
    return {
      ...base,
      source: 'UNSUPPORTED',
      estimatedHealthScore: null,
      decisionCapable: false,
    };
  }

  const workshop = input.workshopEvidence;
  if (workshop?.estimatedHealthScore != null) {
    return {
      ...base,
      source: 'WORKSHOP_MANUAL_EVIDENCE',
      estimatedHealthScore: workshop.estimatedHealthScore,
      decisionCapable: true,
    };
  }

  const publication = input.publication;
  if (
    publication?.userFacingPublished &&
    publication.maturity === 'STABLE' &&
    publication.publishedEstimatedHealth != null
  ) {
    return {
      ...base,
      source: 'V2_PUBLICATION_STABLE',
      estimatedHealthScore: publication.publishedEstimatedHealth,
      decisionCapable: true,
    };
  }

  if (
    publication?.userFacingPublished &&
    publication.maturity === 'PROVISIONAL' &&
    publication.publishedEstimatedHealth != null
  ) {
    return {
      ...base,
      source: 'V2_PUBLICATION_PROVISIONAL',
      estimatedHealthScore: publication.publishedEstimatedHealth,
      decisionCapable: true,
    };
  }

  const shadowAssessment =
    input.assessment?.assessmentMode === 'SHADOW' &&
    input.assessment.estimatedHealthScore != null;
  if (shadowAssessment) {
    return {
      ...base,
      source: 'V2_SHADOW_DIAGNOSTIC',
      estimatedHealthScore: input.assessment!.estimatedHealthScore,
      decisionCapable: false,
    };
  }

  if (isSafeLiveTelemetry(input.liveVoltage, now)) {
    return {
      ...base,
      source: 'LIVE_TELEMETRY',
      estimatedHealthScore: null,
      decisionCapable: false,
    };
  }

  if (hasLegacyDiagnostic(input.legacy)) {
    return {
      ...base,
      source: 'LEGACY_UNVERIFIED',
      estimatedHealthScore: input.legacy!.publishedSohPct,
      decisionCapable: false,
    };
  }

  return {
    ...base,
    source: 'UNAVAILABLE',
    estimatedHealthScore: null,
    decisionCapable: false,
  };
}

function mapPrimaryTruthToQuality(
  source: LvCanonicalTruthSource,
  decisionCapable: boolean,
): BatteryDataQualityStatus {
  switch (source) {
    case 'WORKSHOP_MANUAL_EVIDENCE':
      return 'VERIFIED';
    case 'V2_PUBLICATION_STABLE':
    case 'V2_PUBLICATION_PROVISIONAL':
      return decisionCapable ? 'ESTIMATED' : 'STALE';
    case 'V2_SHADOW_DIAGNOSTIC':
      return 'EXPERIMENTAL';
    case 'LIVE_TELEMETRY':
      return 'PROXY';
    case 'LEGACY_UNVERIFIED':
      return 'LEGACY_UNVERIFIED';
    case 'UNSUPPORTED':
      return 'UNSUPPORTED';
    case 'UNAVAILABLE':
    default:
      return 'UNAVAILABLE';
  }
}

function buildLegacyDiagnostic(
  input: ResolveCanonicalLvBatteryInput,
  primaryTruth: LvCanonicalPrimaryTruth,
): LvCanonicalLegacyDiagnostic | null {
  if (!hasLegacyDiagnostic(input.legacy)) {
    return null;
  }

  const legacy = input.legacy!;
  return {
    displayMode: 'LEGACY_UNVERIFIED',
    decisionCapable: false,
    publishedSohPct: legacy.publishedSohPct,
    stabilizedSohPct: legacy.stabilizedSohPct,
    rawSohPct: legacy.rawSohPct,
    publicationState: legacy.publicationState,
    scoredAt: legacy.scoredAt,
    supersededByPrimary: primaryTruth.source !== 'LEGACY_UNVERIFIED',
  };
}

/**
 * Resolves the canonical LV battery answer during the V2 transition.
 * Exactly one primaryTruth — legacy never outranks workshop or qualified V2 publication.
 */
export function resolveCanonicalLvBattery(
  input: ResolveCanonicalLvBatteryInput,
): CanonicalLvBatteryResponse {
  const now = input.now ?? new Date();
  const primaryTruth = buildPrimaryTruth(input, now);
  const primaryQualityStatus = mapPrimaryTruthToQuality(
    primaryTruth.source,
    primaryTruth.decisionCapable,
  );
  const aggregateQualityStatus: BatteryDataQualityStatus =
    primaryTruth.decisionCapable
      ? primaryQualityStatus
      : primaryQualityStatus;

  const observedAt =
    input.publication?.assessmentEvidenceObservedAt ??
    input.workshopEvidence?.observedAt ??
    input.liveVoltage?.observedAt ??
    input.legacy?.scoredAt ??
    null;

  return {
    resolverVersion: LV_CANONICAL_RESOLVER_VERSION,
    vehicleId: input.vehicleId,
    resolvedAt: now.toISOString(),
    profile: {
      profile: input.policy.profile,
      driveProfile: input.policy.driveProfile,
      lvAssessmentAllowed: input.policy.lvAssessmentAllowed,
      supported: isSupportedProfile(input.policy),
    },
    chemistry: {
      chemistry: input.policy.chemistry,
      chemicalSocEstimationAllowed: input.policy.chemicalSocEstimationAllowed,
    },
    primaryTruth,
    liveVoltage: input.liveVoltage,
    latestQualifiedRestMeasurement: input.latestQualifiedRestMeasurement,
    latestStartProxy: input.latestStartProxy,
    assessment: input.assessment,
    publication: input.publication,
    freshness: input.freshness,
    quality: {
      aggregate: presentBatteryDataQuality(aggregateQualityStatus, observedAt),
      primaryTruth: presentBatteryDataQuality(primaryQualityStatus, observedAt),
    },
    legacyDiagnostic: buildLegacyDiagnostic(input, primaryTruth),
    unsupported: primaryTruth.source === 'UNSUPPORTED',
    unavailable: primaryTruth.source === 'UNAVAILABLE',
  };
}
