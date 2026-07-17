import {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from '../battery-health/battery-v2-domain';
import { isHvMeasurementSupported } from '../drive-profile/drive-profile-resolver';
import {
  getPolicyDefinition,
  resolveRestingBandsForChemistry,
} from './battery-policy-profile.catalog';
import {
  isCrankMeasurementType,
} from './battery-policy-profile.measurement-sets';
import type {
  BatteryPolicyProfile,
  BatteryPolicyResolverInput,
  MeasurementPolicyEvaluationContext,
  ResolvedBatteryPolicy,
} from './battery-policy-profile.types';
import { BatteryPolicyProfile as BatteryPolicyProfileEnum } from './battery-policy-profile.types';

function resolvePolicyKey(
  input: BatteryPolicyResolverInput,
): BatteryPolicyProfile {
  const { driveProfile, chemistry } = input;
  const lvPresent = input.lvSignalPresent === true;

  if (driveProfile === BatteryDriveProfile.BEV) {
    if (!lvPresent) {
      return BatteryPolicyProfileEnum.UNSUPPORTED_PROFILE;
    }
    if (chemistry === BatteryChemistry.LITHIUM) {
      return BatteryPolicyProfileEnum.EV_AUX_LITHIUM;
    }
    return BatteryPolicyProfileEnum.EV_AUX_LEAD_ACID;
  }

  if (driveProfile === BatteryDriveProfile.PHEV) {
    return BatteryPolicyProfileEnum.PHEV_AUX;
  }

  if (
    driveProfile === BatteryDriveProfile.ICE ||
    driveProfile === BatteryDriveProfile.HEV
  ) {
    switch (chemistry) {
      case BatteryChemistry.LEAD_ACID:
        return BatteryPolicyProfileEnum.ICE_LEAD_ACID;
      case BatteryChemistry.AGM:
        return BatteryPolicyProfileEnum.ICE_AGM;
      case BatteryChemistry.EFB:
        return BatteryPolicyProfileEnum.ICE_EFB;
      default:
        return BatteryPolicyProfileEnum.UNKNOWN_PROFILE;
    }
  }

  return BatteryPolicyProfileEnum.UNKNOWN_PROFILE;
}

function materializePolicy(
  profileKey: BatteryPolicyProfile,
  input: BatteryPolicyResolverInput,
): ResolvedBatteryPolicy {
  const definition = getPolicyDefinition(profileKey);
  const restingBands =
    definition.restingBands ??
    (profileKey === BatteryPolicyProfileEnum.PHEV_AUX
      ? resolveRestingBandsForChemistry(input.chemistry)
      : null);

  const hvPipelineAllowed =
    definition.hvPipelineAllowed ||
    isHvMeasurementSupported(input.driveProfile);

  return {
    profile: definition.profile,
    driveProfile: input.driveProfile,
    chemistry: input.chemistry,
    supportedMeasurementTypes: [...definition.supportedMeasurementTypes],
    forbiddenMeasurementTypes: [...definition.forbiddenMeasurementTypes],
    restingBands,
    chemicalSocEstimationAllowed: definition.chemicalSocEstimationAllowed,
    startProxyAllowed: definition.startProxyAllowed,
    startProxyRequiresConfirmedIceStart:
      definition.startProxyRequiresConfirmedIceStart,
    lvAssessmentAllowed: definition.lvAssessmentAllowed,
    hvPipelineAllowed,
    minimumContext: { ...definition.minimumContext },
    evidence: [
      `policy:${definition.profile}`,
      `drive:${input.driveProfile}`,
      `chemistry:${input.chemistry}`,
      `lv_signal:${input.lvSignalPresent === true}`,
    ],
  };
}

/**
 * Maps drive profile + chemistry (+ signal context) to a central battery policy.
 */
export function resolveBatteryPolicy(
  input: BatteryPolicyResolverInput,
): ResolvedBatteryPolicy {
  const profileKey = resolvePolicyKey(input);
  return materializePolicy(profileKey, input);
}

export function isMeasurementAllowedForPolicy(
  policy: ResolvedBatteryPolicy,
  measurementType: BatteryMeasurementType,
  context?: MeasurementPolicyEvaluationContext,
): boolean {
  if (policy.forbiddenMeasurementTypes.includes(measurementType)) {
    return false;
  }

  if (!policy.supportedMeasurementTypes.includes(measurementType)) {
    return false;
  }

  if (
    policy.startProxyRequiresConfirmedIceStart &&
    isCrankMeasurementType(measurementType) &&
    context?.confirmedIceStart !== true
  ) {
    return false;
  }

  if (
    !policy.startProxyAllowed &&
    isCrankMeasurementType(measurementType)
  ) {
    return false;
  }

  return true;
}

/**
 * Central measurement gate — replaces scattered drive/chemistry if-checks.
 */
export function guardMeasurementQualityForPolicy(input: {
  policy: ResolvedBatteryPolicy;
  measurementType: BatteryMeasurementType;
  quality: BatteryMeasurementQuality;
  context?: MeasurementPolicyEvaluationContext;
}): BatteryMeasurementQuality {
  if (isMeasurementAllowedForPolicy(input.policy, input.measurementType, input.context)) {
    return input.quality;
  }

  if (
    input.quality === BatteryMeasurementQuality.MISSED ||
    input.quality === BatteryMeasurementQuality.PROVIDER_ERROR
  ) {
    return input.quality;
  }

  return BatteryMeasurementQuality.UNSUPPORTED_PROFILE;
}

export function isStartProxyAllowedForPolicy(
  policy: ResolvedBatteryPolicy,
  context?: MeasurementPolicyEvaluationContext,
): boolean {
  if (!policy.startProxyAllowed) {
    return false;
  }
  if (
    policy.startProxyRequiresConfirmedIceStart &&
    context?.confirmedIceStart !== true
  ) {
    return false;
  }
  return true;
}
