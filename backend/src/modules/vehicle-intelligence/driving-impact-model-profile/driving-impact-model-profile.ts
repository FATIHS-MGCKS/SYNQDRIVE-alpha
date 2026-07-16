/**
 * Driving Impact model profile resolver and gating (P45).
 */

import { getVehicleCapabilities } from '../vehicle-capabilities';
import { deriveVehicleCapabilityProfile } from '../vehicle-capabilities';
import { computeDrivingStressScore } from '../driving-impact/driving-impact-scorer';
import type {
  DrivingImpactLoadComponent,
  DrivingImpactLoadComponents,
} from '../driving-impact/driving-impact-load-components';
import { DRIVING_IMPACT_CONFIG as C } from '../driving-impact/driving-impact.config';
import { DRIVING_IMPACT_MODEL_PROFILES } from './driving-impact-model-profile.config';
import {
  DRIVING_IMPACT_MODEL_PROFILE_VERSION,
  type BehavioralEvidenceInput,
  type DrivingImpactModelProfileDefinition,
  type DrivingImpactModelProfileId,
  type DrivingImpactModelProfileManifest,
  type ProfileGatedStressScores,
  type ResolveDrivingImpactModelProfileInput,
} from './driving-impact-model-profile.types';

export function resolveDrivingImpactModelProfile(
  input: ResolveDrivingImpactModelProfileInput,
): DrivingImpactModelProfileDefinition {
  const caps = getVehicleCapabilities(input.hardwareType);
  const capabilityProfile = deriveVehicleCapabilityProfile({
    hardwareType: input.hardwareType,
    fuelType: input.fuelType,
  });
  const engineSignalsAvailable =
    input.engineSignalsAvailable ?? capabilityProfile.engineSignalsAvailable;

  if (capabilityProfile.engineSignalsAvailable === false && isBatteryElectric(input.fuelType)) {
    const base = DRIVING_IMPACT_MODEL_PROFILES.TESLA_LIMITED;
    return {
      ...base,
      behavioralIngestionPath: caps.drivingEventsSource === 'TELEMETRY_EVENTS'
        ? 'TELEMETRY_EVENTS'
        : 'HF_DERIVED',
      nativeEventCapable: caps.nativeEventCapable,
      zeroEventsWithoutNativeCapabilityIsUnknown: !caps.nativeEventCapable,
    };
  }

  if (input.hardwareType === 'LTE_R1') {
    if (engineSignalsAvailable) {
      return DRIVING_IMPACT_MODEL_PROFILES.ICE_SIGNAL_CONTEXT;
    }
    return DRIVING_IMPACT_MODEL_PROFILES.LTE_R1_NATIVE;
  }

  if (input.hardwareType === 'SMART5') {
    return DRIVING_IMPACT_MODEL_PROFILES.SMART5_LIMITED;
  }

  return DRIVING_IMPACT_MODEL_PROFILES.UNKNOWN_LIMITED;
}

function isBatteryElectric(fuelType?: string | null): boolean {
  if (!fuelType) return false;
  const f = fuelType.trim().toLowerCase();
  return (
    f === 'electric' ||
    f === 'ev' ||
    f === 'bev' ||
    f === 'battery_electric' ||
    f === 'battery-electric' ||
    f.includes('electric')
  );
}

function sumBehavioralCounts(counts: BehavioralEvidenceInput['counts']): number {
  return (
    counts.hardAccel +
    counts.extremeAccel +
    counts.hardBrake +
    counts.extremeBrake +
    counts.fullBraking +
    counts.kickdown +
    counts.launchLike +
    counts.brakesTotal
  );
}

/**
 * Returns true when behavioral stress can be interpreted (including calm native trips).
 * HF-only profiles without events must not produce artificially low stress.
 */
export function hasBehavioralEvidenceForProfile(
  profile: DrivingImpactModelProfileDefinition,
  evidence: BehavioralEvidenceInput,
): boolean {
  if (profile.nativeEventCapable && profile.behavioralIngestionPath === 'TELEMETRY_EVENTS') {
    return true;
  }

  const totalCounts = sumBehavioralCounts(evidence.counts);
  const noSignals =
    totalCounts === 0 &&
    evidence.hfEventCount === 0 &&
    evidence.nativeEventCount === 0;

  if (noSignals && profile.zeroEventsWithoutNativeCapabilityIsUnknown) {
    return false;
  }

  if (evidence.hfEventCount > 0) return true;
  if (evidence.nativeEventCount > 0 && profile.nativeEventCapable) return true;
  if (totalCounts > 0) return true;

  return !profile.zeroEventsWithoutNativeCapabilityIsUnknown;
}

export function buildDrivingImpactModelProfileManifest(
  profile: DrivingImpactModelProfileDefinition,
  gating: Pick<ProfileGatedStressScores, 'gatingApplied' | 'reasonCodes'>,
): DrivingImpactModelProfileManifest {
  return {
    version: DRIVING_IMPACT_MODEL_PROFILE_VERSION,
    profile: profile.profile,
    comparabilityGroup: profile.comparabilityGroup,
    behavioralIngestionPath: profile.behavioralIngestionPath,
    nativeEventCapable: profile.nativeEventCapable,
    engineContextCapable: profile.engineContextCapable,
    availableStressComponents: [...profile.availableStressComponents],
    availableLoadComponents: [...profile.availableLoadComponents],
    crossFleetComparableProfiles: [...profile.crossFleetComparableProfiles],
    comparabilityHint: profile.comparabilityHintDe,
    gatingApplied: gating.gatingApplied,
    reasonCodes: gating.reasonCodes,
  };
}

export function areDrivingImpactModelProfilesComparable(
  a: Pick<DrivingImpactModelProfileManifest, 'profile' | 'comparabilityGroup' | 'behavioralIngestionPath'>,
  b: Pick<DrivingImpactModelProfileManifest, 'profile' | 'comparabilityGroup' | 'behavioralIngestionPath'>,
): boolean {
  if (a.comparabilityGroup !== b.comparabilityGroup) return false;
  if (a.behavioralIngestionPath !== b.behavioralIngestionPath) return false;
  const profileA = DRIVING_IMPACT_MODEL_PROFILES[a.profile];
  const profileB = DRIVING_IMPACT_MODEL_PROFILES[b.profile];
  return (
    profileA.crossFleetComparableProfiles.includes(b.profile) &&
    profileB.crossFleetComparableProfiles.includes(a.profile)
  );
}

function renormalizeDrivingStressScore(input: {
  profile: DrivingImpactModelProfileDefinition;
  scores: {
    longitudinalStressScore: number | null;
    brakingStressScore: number | null;
    stopGoStressScore: number | null;
    highSpeedStressScore: number | null;
  };
}): number | null {
  const entries: Array<{ key: keyof typeof C.DRIVING_STRESS_WEIGHTS; score: number | null }> = [
    { key: 'longitudinal', score: input.scores.longitudinalStressScore },
    { key: 'braking', score: input.scores.brakingStressScore },
    { key: 'stopGo', score: input.scores.stopGoStressScore },
    { key: 'highSpeed', score: input.scores.highSpeedStressScore },
  ];

  const available = entries.filter(
    (e) =>
      input.profile.availableStressComponents.includes(
        e.key as (typeof input.profile.availableStressComponents)[number],
      ) && e.score != null,
  );

  if (available.length === 0) return null;

  const totalWeight = available.reduce((sum, e) => sum + C.DRIVING_STRESS_WEIGHTS[e.key], 0);
  if (totalWeight <= 0) return null;

  const weighted = available.reduce(
    (sum, e) => sum + (e.score as number) * (C.DRIVING_STRESS_WEIGHTS[e.key] / totalWeight),
    0,
  );
  return Math.round(weighted * 10) / 10;
}

/**
 * Apply profile gating to raw stress scores. Same 0–100 scale; unavailable or
 * uninterpretable components are nulled instead of reading as low stress.
 */
export function applyModelProfileToStressScores(input: {
  profile: DrivingImpactModelProfileDefinition;
  evidence: BehavioralEvidenceInput;
  scores: {
    longitudinalStressScore: number;
    brakingStressScore: number;
    stopGoStressScore: number;
    highSpeedStressScore: number;
    thermalBrakeStressScore: number;
  };
}): ProfileGatedStressScores {
  const reasonCodes: ProfileGatedStressScores['reasonCodes'] = [];
  const hasEvidence = hasBehavioralEvidenceForProfile(input.profile, input.evidence);

  if (!hasEvidence) {
    reasonCodes.push('BEHAVIORAL_EVIDENCE_ABSENT');
    if (!input.profile.nativeEventCapable) {
      reasonCodes.push('NATIVE_EVENTS_NOT_CAPABLE');
    }
    return {
      longitudinalStressScore: null,
      brakingStressScore: null,
      stopGoStressScore: null,
      highSpeedStressScore: null,
      thermalBrakeStressScore: null,
      drivingStressScore: null,
      gatingApplied: true,
      reasonCodes,
    };
  }

  const gateComponent = (
    key: (typeof input.profile.availableStressComponents)[number],
    score: number,
  ): number | null => {
    if (!input.profile.availableStressComponents.includes(key)) {
      reasonCodes.push('COMPONENT_NOT_IN_PROFILE');
      return null;
    }
    return score;
  };

  const longitudinalStressScore = gateComponent(
    'longitudinal',
    input.scores.longitudinalStressScore,
  );
  const brakingStressScore = gateComponent('braking', input.scores.brakingStressScore);
  const stopGoStressScore = gateComponent('stopGo', input.scores.stopGoStressScore);
  const highSpeedStressScore = gateComponent('highSpeed', input.scores.highSpeedStressScore);
  const thermalBrakeStressScore = input.profile.availableStressComponents.includes('thermal')
    ? input.scores.thermalBrakeStressScore
    : null;

  const drivingStressScore = renormalizeDrivingStressScore({
    profile: input.profile,
    scores: {
      longitudinalStressScore,
      brakingStressScore,
      stopGoStressScore,
      highSpeedStressScore,
    },
  });

  if (reasonCodes.length > 0) {
    reasonCodes.push('PROFILE_RENORMALIZED');
  }

  return {
    longitudinalStressScore,
    brakingStressScore,
    stopGoStressScore,
    highSpeedStressScore,
    thermalBrakeStressScore,
    drivingStressScore,
    gatingApplied: reasonCodes.length > 0,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

export function getModelProfileById(
  profileId: DrivingImpactModelProfileId,
): DrivingImpactModelProfileDefinition {
  return DRIVING_IMPACT_MODEL_PROFILES[profileId];
}

function markInsufficient(
  component: DrivingImpactLoadComponent,
  reason: 'BEHAVIORAL_EVIDENCE_ABSENT' | 'COMPONENT_NOT_IN_PROFILE',
): DrivingImpactLoadComponent {
  return {
    ...component,
    level: null,
    score: null,
    evidenceStrength: 'NONE',
    assessability: 'INSUFFICIENT_DATA',
    reasons: [...new Set([...component.reasons, reason])] as DrivingImpactLoadComponent['reasons'],
  };
}

/**
 * Align load components with profile availability and behavioral gating.
 */
export function applyModelProfileToLoadComponents(
  loadComponents: DrivingImpactLoadComponents,
  profile: DrivingImpactModelProfileDefinition,
  gating: ProfileGatedStressScores,
): DrivingImpactLoadComponents {
  const behavioralGated =
    gating.gatingApplied && gating.longitudinalStressScore === null;

  const gateIfNeeded = (
    key: keyof DrivingImpactLoadComponents,
    component: DrivingImpactLoadComponent,
  ): DrivingImpactLoadComponent => {
    if (
      key !== 'version' &&
      key !== 'vehicleLoad' &&
      !profile.availableLoadComponents.includes(
        key as (typeof profile.availableLoadComponents)[number],
      )
    ) {
      return {
        ...component,
        level: null,
        score: null,
        assessability: 'UNSUPPORTED',
        sourceQuality: 'UNSUPPORTED',
        evidenceStrength: 'NONE',
        reasons: [...component.reasons, 'COMPONENT_NOT_IN_PROFILE'],
      };
    }
    if (behavioralGated && key !== 'dataQuality' && key !== 'version') {
      return markInsufficient(component, 'BEHAVIORAL_EVIDENCE_ABSENT');
    }
    return component;
  };

  const gated: DrivingImpactLoadComponents = {
    ...loadComponents,
    longitudinalLoad: gateIfNeeded('longitudinalLoad', loadComponents.longitudinalLoad),
    brakingLoad: gateIfNeeded('brakingLoad', loadComponents.brakingLoad),
    stopGoLoad: gateIfNeeded('stopGoLoad', loadComponents.stopGoLoad),
    speedLoad: gateIfNeeded('speedLoad', loadComponents.speedLoad),
    thermalLoad: gateIfNeeded('thermalLoad', loadComponents.thermalLoad),
    engineLoad: gateIfNeeded('engineLoad', loadComponents.engineLoad),
    tireLoad: gateIfNeeded('tireLoad', loadComponents.tireLoad),
    dataQuality: loadComponents.dataQuality,
    vehicleLoad: behavioralGated
      ? {
          ...loadComponents.vehicleLoad,
          level: null,
          score: null,
          assessability: 'INSUFFICIENT_DATA',
          evidenceStrength: 'NONE',
          reasons: [
            ...loadComponents.vehicleLoad.reasons,
            'BEHAVIORAL_EVIDENCE_ABSENT',
          ],
        }
      : loadComponents.vehicleLoad,
  };

  if (loadComponents.transmissionLoad) {
    gated.transmissionLoad = gateIfNeeded(
      'transmissionLoad',
      loadComponents.transmissionLoad,
    );
  }

  return gated;
}
