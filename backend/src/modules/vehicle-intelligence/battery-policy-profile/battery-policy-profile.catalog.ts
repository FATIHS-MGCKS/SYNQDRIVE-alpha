import { BatteryChemistry } from '../battery-health/battery-v2-domain';
import {
  getVersionedRestingBandsForChemistry,
  LV_CHEMISTRY_RESTING_BANDS,
} from '../battery-health/lv-assessment/lv-assessment-thresholds';
import type {
  BatteryPolicyDefinition,
  ChemistryRestingBands,
} from './battery-policy-profile.types';
import { BatteryPolicyProfile } from './battery-policy-profile.types';
import {
  EV_AUX_LV_LIVE_ONLY,
  HV_ALL_MEASUREMENT_TYPES,
  ICE_LV_FULL_SUPPORTED,
  LV_CRANK_MEASUREMENT_TYPES,
  LV_LIVE_MEASUREMENT_TYPES,
  LV_REST_MEASUREMENT_TYPES,
  LV_WORKSHOP_MEASUREMENT_TYPES,
  UNKNOWN_LV_SUPPORTED,
} from './battery-policy-profile.measurement-sets';

const REST_60M_MS = 60 * 60_000;

const LEAD_ACID_BANDS: ChemistryRestingBands =
  LV_CHEMISTRY_RESTING_BANDS[BatteryChemistry.LEAD_ACID];

const AGM_BANDS: ChemistryRestingBands =
  LV_CHEMISTRY_RESTING_BANDS[BatteryChemistry.AGM];

const EFB_BANDS: ChemistryRestingBands =
  LV_CHEMISTRY_RESTING_BANDS[BatteryChemistry.EFB];

const DEFAULT_ICE_CONTEXT = {
  lvLiveRequiresProviderTimestamp: true,
  restRequiresEngineOff: true,
  restMinDurationMs: REST_60M_MS,
  crankRequiresConfirmedIceStart: false,
  hvRequiresSocOrEnergySignal: false,
} as const;

function icePolicy(
  profile: BatteryPolicyProfile,
  restingBands: ChemistryRestingBands,
): BatteryPolicyDefinition {
  return {
    profile,
    supportedMeasurementTypes: ICE_LV_FULL_SUPPORTED,
    forbiddenMeasurementTypes: HV_ALL_MEASUREMENT_TYPES,
    restingBands,
    chemicalSocEstimationAllowed: true,
    startProxyAllowed: true,
    startProxyRequiresConfirmedIceStart: false,
    lvAssessmentAllowed: true,
    hvPipelineAllowed: false,
    minimumContext: { ...DEFAULT_ICE_CONTEXT },
  };
}

export const BATTERY_POLICY_CATALOG: Record<
  BatteryPolicyProfile,
  BatteryPolicyDefinition
> = {
  [BatteryPolicyProfile.ICE_LEAD_ACID]: icePolicy(
    BatteryPolicyProfile.ICE_LEAD_ACID,
    LEAD_ACID_BANDS,
  ),
  [BatteryPolicyProfile.ICE_AGM]: icePolicy(
    BatteryPolicyProfile.ICE_AGM,
    AGM_BANDS,
  ),
  [BatteryPolicyProfile.ICE_EFB]: icePolicy(
    BatteryPolicyProfile.ICE_EFB,
    EFB_BANDS,
  ),
  [BatteryPolicyProfile.PHEV_AUX]: {
    profile: BatteryPolicyProfile.PHEV_AUX,
    supportedMeasurementTypes: [
      ...ICE_LV_FULL_SUPPORTED,
      ...HV_ALL_MEASUREMENT_TYPES,
    ],
    forbiddenMeasurementTypes: [],
    restingBands: null,
    chemicalSocEstimationAllowed: true,
    startProxyAllowed: true,
    startProxyRequiresConfirmedIceStart: true,
    lvAssessmentAllowed: true,
    hvPipelineAllowed: true,
    minimumContext: {
      lvLiveRequiresProviderTimestamp: true,
      restRequiresEngineOff: true,
      restMinDurationMs: REST_60M_MS,
      crankRequiresConfirmedIceStart: true,
      hvRequiresSocOrEnergySignal: true,
    },
  },
  [BatteryPolicyProfile.EV_AUX_LEAD_ACID]: {
    profile: BatteryPolicyProfile.EV_AUX_LEAD_ACID,
    supportedMeasurementTypes: [
      ...EV_AUX_LV_LIVE_ONLY,
      ...HV_ALL_MEASUREMENT_TYPES,
    ],
    forbiddenMeasurementTypes: [
      ...LV_REST_MEASUREMENT_TYPES,
      ...LV_CRANK_MEASUREMENT_TYPES,
    ],
    restingBands: LEAD_ACID_BANDS,
    chemicalSocEstimationAllowed: false,
    startProxyAllowed: false,
    startProxyRequiresConfirmedIceStart: false,
    lvAssessmentAllowed: false,
    hvPipelineAllowed: true,
    minimumContext: {
      lvLiveRequiresProviderTimestamp: true,
      restRequiresEngineOff: true,
      crankRequiresConfirmedIceStart: false,
      hvRequiresSocOrEnergySignal: true,
    },
  },
  [BatteryPolicyProfile.EV_AUX_LITHIUM]: {
    profile: BatteryPolicyProfile.EV_AUX_LITHIUM,
    supportedMeasurementTypes: [
      ...EV_AUX_LV_LIVE_ONLY,
      ...HV_ALL_MEASUREMENT_TYPES,
    ],
    forbiddenMeasurementTypes: [
      ...LV_REST_MEASUREMENT_TYPES,
      ...LV_CRANK_MEASUREMENT_TYPES,
    ],
    restingBands: null,
    chemicalSocEstimationAllowed: false,
    startProxyAllowed: false,
    startProxyRequiresConfirmedIceStart: false,
    lvAssessmentAllowed: false,
    hvPipelineAllowed: true,
    minimumContext: {
      lvLiveRequiresProviderTimestamp: true,
      restRequiresEngineOff: false,
      crankRequiresConfirmedIceStart: false,
      hvRequiresSocOrEnergySignal: true,
    },
  },
  [BatteryPolicyProfile.UNKNOWN_PROFILE]: {
    profile: BatteryPolicyProfile.UNKNOWN_PROFILE,
    supportedMeasurementTypes: UNKNOWN_LV_SUPPORTED,
    forbiddenMeasurementTypes: [
      ...LV_REST_MEASUREMENT_TYPES,
      ...LV_CRANK_MEASUREMENT_TYPES,
    ],
    restingBands: null,
    chemicalSocEstimationAllowed: false,
    startProxyAllowed: false,
    startProxyRequiresConfirmedIceStart: false,
    lvAssessmentAllowed: false,
    hvPipelineAllowed: false,
    minimumContext: {
      lvLiveRequiresProviderTimestamp: true,
      restRequiresEngineOff: true,
      crankRequiresConfirmedIceStart: false,
      hvRequiresSocOrEnergySignal: false,
    },
  },
  [BatteryPolicyProfile.UNSUPPORTED_PROFILE]: {
    profile: BatteryPolicyProfile.UNSUPPORTED_PROFILE,
    supportedMeasurementTypes: [...HV_ALL_MEASUREMENT_TYPES],
    forbiddenMeasurementTypes: [
      ...LV_LIVE_MEASUREMENT_TYPES,
      ...LV_REST_MEASUREMENT_TYPES,
      ...LV_CRANK_MEASUREMENT_TYPES,
      ...LV_WORKSHOP_MEASUREMENT_TYPES,
    ],
    restingBands: null,
    chemicalSocEstimationAllowed: false,
    startProxyAllowed: false,
    startProxyRequiresConfirmedIceStart: false,
    lvAssessmentAllowed: false,
    hvPipelineAllowed: true,
    minimumContext: {
      lvLiveRequiresProviderTimestamp: false,
      restRequiresEngineOff: false,
      crankRequiresConfirmedIceStart: false,
      hvRequiresSocOrEnergySignal: true,
    },
  },
};

export function getPolicyDefinition(
  profile: BatteryPolicyProfile,
): BatteryPolicyDefinition {
  return BATTERY_POLICY_CATALOG[profile];
}

export function resolveRestingBandsForChemistry(
  chemistry: BatteryChemistry,
): ChemistryRestingBands | null {
  return getVersionedRestingBandsForChemistry(chemistry);
}
