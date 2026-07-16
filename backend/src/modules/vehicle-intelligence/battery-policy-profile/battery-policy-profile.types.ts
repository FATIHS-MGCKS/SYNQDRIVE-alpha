import type {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryMeasurementType,
} from '../battery-health/battery-v2-domain';

export const BatteryPolicyProfile = {
  ICE_LEAD_ACID: 'ICE_LEAD_ACID',
  ICE_AGM: 'ICE_AGM',
  ICE_EFB: 'ICE_EFB',
  PHEV_AUX: 'PHEV_AUX',
  EV_AUX_LEAD_ACID: 'EV_AUX_LEAD_ACID',
  EV_AUX_LITHIUM: 'EV_AUX_LITHIUM',
  UNKNOWN_PROFILE: 'UNKNOWN_PROFILE',
  UNSUPPORTED_PROFILE: 'UNSUPPORTED_PROFILE',
} as const;

export type BatteryPolicyProfile =
  (typeof BatteryPolicyProfile)[keyof typeof BatteryPolicyProfile];

/** Chemistry-specific resting voltage bands (good / watch / warning lower bounds). */
export interface ChemistryRestingBands {
  chemistry: BatteryChemistry;
  goodMinV: number;
  watchMinV: number;
  warningMinV: number;
  /** Upper bound of plausible resting band for the chemistry. */
  maxRestingV: number;
}

export interface BatteryPolicyContextRequirements {
  /** Live LV measurements require a provider source timestamp. */
  lvLiveRequiresProviderTimestamp: boolean;
  /** REST measurements require confirmed engine-off context. */
  restRequiresEngineOff: boolean;
  /** Minimum rest window duration when applicable (ms). */
  restMinDurationMs?: number;
  /** Crank/start-proxy paths require confirmed ICE combustion start (PHEV). */
  crankRequiresConfirmedIceStart: boolean;
  /** HV session paths require traction SOC or energy signal. */
  hvRequiresSocOrEnergySignal: boolean;
}

export interface BatteryPolicyDefinition {
  profile: BatteryPolicyProfile;
  supportedMeasurementTypes: readonly BatteryMeasurementType[];
  forbiddenMeasurementTypes: readonly BatteryMeasurementType[];
  restingBands: ChemistryRestingBands | null;
  chemicalSocEstimationAllowed: boolean;
  startProxyAllowed: boolean;
  startProxyRequiresConfirmedIceStart: boolean;
  lvAssessmentAllowed: boolean;
  hvPipelineAllowed: boolean;
  minimumContext: BatteryPolicyContextRequirements;
}

export interface BatteryPolicyResolverInput {
  driveProfile: BatteryDriveProfile;
  chemistry: BatteryChemistry;
  /** Whether `lowVoltageBatteryCurrentVoltage` (or equivalent) is observed. */
  lvSignalPresent?: boolean;
  /** PHEV: combustion engine start confirmed for the active trip/window. */
  confirmedIceStart?: boolean;
}

export interface ResolvedBatteryPolicy {
  profile: BatteryPolicyProfile;
  driveProfile: BatteryDriveProfile;
  chemistry: BatteryChemistry;
  supportedMeasurementTypes: BatteryMeasurementType[];
  forbiddenMeasurementTypes: BatteryMeasurementType[];
  restingBands: ChemistryRestingBands | null;
  chemicalSocEstimationAllowed: boolean;
  startProxyAllowed: boolean;
  startProxyRequiresConfirmedIceStart: boolean;
  lvAssessmentAllowed: boolean;
  hvPipelineAllowed: boolean;
  minimumContext: BatteryPolicyContextRequirements;
  evidence: string[];
}

export interface MeasurementPolicyEvaluationContext {
  confirmedIceStart?: boolean;
}
