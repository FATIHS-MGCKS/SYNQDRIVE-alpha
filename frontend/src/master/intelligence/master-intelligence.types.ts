/** Canonical Master Intelligence URL + presentation types (display-only; no classification logic). */

export type MasterIntelligenceView = 'vsi-intelligence' | 'apds-intelligence';

export type LvStandbyProfileLabel = 'LV_8H_OBSERVED' | 'LV_24H_OBSERVED' | 'UNKNOWN';

export type ActiveRpmProfileLabel = 'RPM_1HZ' | 'RPM_STANDARD' | 'UNKNOWN';

export type IceRpmApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';

export type ObservedRpmDensityLabel =
  | 'SUB_ONE_HZ'
  | 'ONE_SECOND_BUCKETS_UNPROVEN'
  | 'IRREGULAR'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type ProfileConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type EvidencePresentationKind =
  | 'observed'
  | 'simulated_shadow'
  | 'verified_real_execution'
  | 'not_available'
  | 'insufficient_evidence'
  | 'not_applicable'
  | 'evaluation_blocked';

export type MasterIntelligenceContextState = {
  orgId: string | null;
  vehicleId: string | null;
  providerSourceLinkId: string | null;
  physicalDeviceId: string | null;
  apdOpportunityId: string | null;
  policyVersion: string | null;
  apdEpochId: string | null;
  asOf: string | null;
  /** Invalid query values dropped at parse time (for UI hints). */
  rejectedParams: string[];
};

export const EMPTY_MASTER_INTELLIGENCE_CONTEXT: MasterIntelligenceContextState = {
  orgId: null,
  vehicleId: null,
  providerSourceLinkId: null,
  physicalDeviceId: null,
  apdOpportunityId: null,
  policyVersion: null,
  apdEpochId: null,
  asOf: null,
  rejectedParams: [],
};

export type MasterIntelligenceCrossLinkTarget =
  | 'vehicles'
  | 'device-inventory'
  | 'vsi-intelligence'
  | 'apds-intelligence';
