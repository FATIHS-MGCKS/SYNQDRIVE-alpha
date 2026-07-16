import type { ResolvedBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.types';
import type { BatteryMeasurementType } from '../battery-v2-domain';
import type { BatteryDataQualityPresentation } from '../battery-data-quality';
import type {
  BatteryDomainFreshnessBundle,
  FetchFreshness,
  ObservationFreshness,
} from '../battery-freshness.policy';
import type { HvMethodProfile } from '../hv-method-profile/hv-method-profile.types';
import type {
  CanonicalLvBatteryResponse,
  LvCanonicalAssessment,
  LvCanonicalChemistry,
  LvCanonicalLegacyDiagnostic,
  LvCanonicalLiveVoltage,
  LvCanonicalProfile,
  LvCanonicalPublication,
  LvCanonicalRestMeasurement,
  LvCanonicalStartProxy,
} from '../lv-canonical/lv-canonical-battery.types';
import type { HvSohGateReasonCode } from '../hv-capacity-shadow/hv-soh-gate.types';

export const CANONICAL_BATTERY_RESOLVER_VERSION = '1.0.0';

export const CANONICAL_BATTERY_LIVE_STATUS = {
  READY: 'ready',
  CALIBRATING: 'calibrating',
  STABILIZING: 'stabilizing',
  NO_RECENT_DATA: 'no_recent_data',
  ESTIMATE_UNAVAILABLE: 'estimate_unavailable',
  UNSUPPORTED: 'unsupported',
} as const;

export type CanonicalBatteryLiveStatus =
  (typeof CANONICAL_BATTERY_LIVE_STATUS)[keyof typeof CANONICAL_BATTERY_LIVE_STATUS];

export interface CanonicalBatteryLiveScopeState {
  observedAt: string | null;
  receivedAt: string | null;
  status: CanonicalBatteryLiveStatus;
}

export interface CanonicalBatteryLvLiveValues {
  voltageV: number | null;
  voltageSource: 'live_telemetry' | 'resting_snapshot' | null;
  temperatureC: number | null;
  restingVoltageV: number | null;
  crankingVoltageV: number | null;
  chargingVoltageV: number | null;
  engineRunning: boolean | null;
}

export interface CanonicalBatteryHvLiveValues {
  socPercent: number | null;
  rangeKm: number | null;
  currentEnergyKwh: number | null;
  grossCapacityKwh: number | null;
  addedEnergyKwh: number | null;
  chargingPowerKw: number | null;
  currentVoltageV: number | null;
  temperatureC: number | null;
  isCharging: boolean | null;
  chargingCableConnected: boolean | null;
  providerSohPercent: number | null;
}

export interface CanonicalBatteryLiveState {
  lv: CanonicalBatteryLiveScopeState & { values: CanonicalBatteryLvLiveValues };
  hv: CanonicalBatteryLiveScopeState & { values: CanonicalBatteryHvLiveValues };
}

export interface CanonicalBatteryLvSection {
  profile: LvCanonicalProfile;
  chemistry: LvCanonicalChemistry;
  latestQualifiedRest: LvCanonicalRestMeasurement | null;
  latestStartProxy: LvCanonicalStartProxy | null;
  assessment: LvCanonicalAssessment | null;
  publication: LvCanonicalPublication | null;
  liveVoltage: LvCanonicalLiveVoltage | null;
  canonical: CanonicalLvBatteryResponse;
}

export interface CanonicalBatteryHvChargeSession {
  sessionId: string;
  source: string;
  startAt: string;
  endAt: string | null;
  isOngoing: boolean;
  qualityStatus: string | null;
  capacityShadowEligible: boolean;
  sessionMedianKwh: number | null;
  shadowGatePassed: boolean | null;
}

export interface CanonicalBatteryHvCapacityAssessment {
  assessmentId: string | null;
  estimatedUsableCapacityKwh: number | null;
  confidence: string | null;
  maturity: string | null;
  shadowGatePassed: boolean;
  gateReasonCodes: string[];
  sessionCount: number;
  computedAt: string | null;
  modelVersion: number | null;
}

export interface CanonicalBatteryHvProviderSoh {
  percent: number | null;
  source: 'PROVIDER' | 'DOCUMENT' | 'MANUAL' | 'CAPACITY_ESTIMATE' | null;
  observedAt: string | null;
  decisionFresh: boolean;
  evidenceType: string | null;
}

export interface CanonicalBatteryHvReferenceCapacity {
  id: string;
  capacityKwh: number;
  capacityType: string;
  source: string;
  verificationStatus: string;
  verifiedAt: string | null;
}

export interface CanonicalBatteryHvSohAssessment {
  assessmentId: string | null;
  sohAvailability: string | null;
  estimatedSohPercent: number | null;
  estimatedUsableCapacityKwh: number | null;
  verifiedReferenceCapacityKwh: number | null;
  maturity: string | null;
  confidence: string | null;
  sohGatePassed: boolean;
  gateReasonCodes: HvSohGateReasonCode[];
  sohPublicationEnabled: boolean;
  computedAt: string | null;
  modelVersion: number | null;
}

export interface CanonicalBatteryHvSection {
  supported: boolean;
  soc: { percent: number | null; observedAt: string | null };
  currentEnergy: { kwh: number | null; observedAt: string | null };
  chargingState: {
    isCharging: boolean | null;
    cableConnected: boolean | null;
    powerKw: number | null;
    state: 'charging' | 'not_charging' | 'unknown';
  };
  currentChargeSession: CanonicalBatteryHvChargeSession | null;
  lastChargeSession: CanonicalBatteryHvChargeSession | null;
  capacityAssessment: CanonicalBatteryHvCapacityAssessment | null;
  providerSoh: CanonicalBatteryHvProviderSoh;
  referenceCapacity: CanonicalBatteryHvReferenceCapacity | null;
  sohAssessment: CanonicalBatteryHvSohAssessment | null;
}

export interface CanonicalBatteryUnsupportedMeasurement {
  measurementType: BatteryMeasurementType;
  reasonCode: string;
  labelDe: string;
}

export interface CanonicalBatteryCapabilities {
  policy: ResolvedBatteryPolicy;
  hvMethodProfile: HvMethodProfile;
  supportedMeasurementTypes: BatteryMeasurementType[];
  unsupportedMeasurementTypes: CanonicalBatteryUnsupportedMeasurement[];
}

export interface CanonicalBatteryDataQuality {
  aggregate: BatteryDataQualityPresentation;
  slices: {
    lvEstimatedHealth: BatteryDataQualityPresentation;
    lvRestingVoltage: BatteryDataQualityPresentation;
    lvCrank: BatteryDataQualityPresentation;
    hvSoh: BatteryDataQualityPresentation;
    hvLegacyCapacity: BatteryDataQualityPresentation;
  };
  fetchFreshness: FetchFreshness | null;
  observationFreshness: ObservationFreshness | null;
  lvFreshnessBundle: BatteryDomainFreshnessBundle | null;
  hvFreshnessBundle: BatteryDomainFreshnessBundle | null;
  staleReasons: string[];
  unsupportedReasons: string[];
  errors: string[];
}

export interface CanonicalBatteryLegacySection {
  collapsed: true;
  lvDiagnostic: LvCanonicalLegacyDiagnostic | null;
  hvLegacyCapacity: Record<string, unknown> | null;
  crankDiagnostic: Record<string, unknown> | null;
  startProxyDiagnostic: Record<string, unknown> | null;
  v2Features: {
    publishedSohPct: number | null;
    stabilizedSohPct: number | null;
    rawSohPct: number | null;
    publicationState: string | null;
    scoredAt: string | null;
  } | null;
}

export interface CanonicalBatteryDto {
  resolverVersion: typeof CANONICAL_BATTERY_RESOLVER_VERSION;
  organizationId: string;
  vehicleId: string;
  resolvedAt: string;
  isEv: boolean;
  liveState: CanonicalBatteryLiveState;
  lv: CanonicalBatteryLvSection;
  hv: CanonicalBatteryHvSection | null;
  capabilities: CanonicalBatteryCapabilities;
  dataQuality: CanonicalBatteryDataQuality;
  legacy: CanonicalBatteryLegacySection;
}
