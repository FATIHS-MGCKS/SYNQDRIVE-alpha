/**
 * Driving Impact model profiles (P45).
 *
 * Hardware-aware scoring profiles prevent direct cross-fleet comparison of
 * incompatible evidence paths (native provider events vs HF reconstruction).
 */

export const DRIVING_IMPACT_MODEL_PROFILE_VERSION = 'impact-model-profile-v1';

export type DrivingImpactModelProfileId =
  | 'LTE_R1_NATIVE'
  | 'ICE_SIGNAL_CONTEXT'
  | 'SMART5_LIMITED'
  | 'TESLA_LIMITED'
  | 'UNKNOWN_LIMITED';

export type DrivingImpactComparabilityGroupId =
  | 'NATIVE_LTE'
  | 'HF_LIMITED'
  | 'EV_LIMITED';

export type DrivingImpactBehavioralIngestionPath =
  | 'TELEMETRY_EVENTS'
  | 'HF_DERIVED';

export type DrivingImpactStressComponentKey =
  | 'longitudinal'
  | 'braking'
  | 'stopGo'
  | 'highSpeed'
  | 'thermal';

export type DrivingImpactLoadComponentKey =
  | 'longitudinalLoad'
  | 'brakingLoad'
  | 'stopGoLoad'
  | 'speedLoad'
  | 'thermalLoad'
  | 'engineLoad'
  | 'transmissionLoad'
  | 'tireLoad'
  | 'dataQuality'
  | 'vehicleLoad';

export type ModelProfileReasonCode =
  | 'BEHAVIORAL_EVIDENCE_ABSENT'
  | 'NATIVE_EVENTS_NOT_CAPABLE'
  | 'HF_PROXY_NOT_EQUIVALENT_TO_NATIVE'
  | 'COMPONENT_NOT_IN_PROFILE'
  | 'PROFILE_RENORMALIZED';

export type DrivingImpactModelProfileManifest = {
  version: typeof DRIVING_IMPACT_MODEL_PROFILE_VERSION;
  profile: DrivingImpactModelProfileId;
  comparabilityGroup: DrivingImpactComparabilityGroupId;
  behavioralIngestionPath: DrivingImpactBehavioralIngestionPath;
  nativeEventCapable: boolean;
  engineContextCapable: boolean;
  availableStressComponents: DrivingImpactStressComponentKey[];
  availableLoadComponents: DrivingImpactLoadComponentKey[];
  crossFleetComparableProfiles: DrivingImpactModelProfileId[];
  comparabilityHint: string;
  gatingApplied: boolean;
  reasonCodes: ModelProfileReasonCode[];
};

export type DrivingImpactModelProfileDefinition = {
  profile: DrivingImpactModelProfileId;
  comparabilityGroup: DrivingImpactComparabilityGroupId;
  behavioralIngestionPath: DrivingImpactBehavioralIngestionPath;
  nativeEventCapable: boolean;
  engineContextCapable: boolean;
  /** Zero behavioral events without native capability must not read as low stress. */
  zeroEventsWithoutNativeCapabilityIsUnknown: boolean;
  availableStressComponents: readonly DrivingImpactStressComponentKey[];
  availableLoadComponents: readonly DrivingImpactLoadComponentKey[];
  crossFleetComparableProfiles: readonly DrivingImpactModelProfileId[];
  label: string;
  comparabilityHintDe: string;
};

export type ResolveDrivingImpactModelProfileInput = {
  hardwareType: 'LTE_R1' | 'SMART5' | 'UNKNOWN';
  fuelType?: string | null;
  engineSignalsAvailable?: boolean;
};

export type BehavioralEvidenceInput = {
  nativeEventCount: number;
  hfEventCount: number;
  primarySource: string;
  counts: {
    hardAccel: number;
    extremeAccel: number;
    hardBrake: number;
    extremeBrake: number;
    fullBraking: number;
    kickdown: number;
    launchLike: number;
    brakesTotal: number;
  };
};

export type ProfileGatedStressScores = {
  longitudinalStressScore: number | null;
  brakingStressScore: number | null;
  stopGoStressScore: number | null;
  highSpeedStressScore: number | null;
  thermalBrakeStressScore: number | null;
  drivingStressScore: number | null;
  gatingApplied: boolean;
  reasonCodes: ModelProfileReasonCode[];
};
