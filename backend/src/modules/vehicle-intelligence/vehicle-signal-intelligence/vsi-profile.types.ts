import type { VsiCanonicalSignalKey } from './canonical-signal-keys';
import type {
  VsiEmpiricalObservationStatus,
  VsiEvidenceOrigin,
  VsiProviderCatalogStatus,
} from './vehicle-signal-evidence.contract';

export const VSI_PROFILE_CONTRACT_VERSION = 'vsi-signal-profile-v1' as const;

/** Canonical keys materialized in P0+P1 (P1 composer keys plus common DIMO telemetry). */
export const VSI_PROFILE_MATERIALIZATION_KEYS = [
  'lv_voltage',
  'hv_battery_soc',
  'provider_source_timestamp',
  'device_connectivity',
  'provider_last_successful_fetch',
  'vehicle_speed',
  'odometer',
  'fuel_level_relative',
  'diagnostic_trouble_code',
] as const satisfies readonly VsiCanonicalSignalKey[];

export type VsiProfileMaterializationKey = (typeof VSI_PROFILE_MATERIALIZATION_KEYS)[number];

export type VsiProfileDeclaredSupport =
  | 'LISTED'
  | 'NOT_LISTED'
  | 'UNKNOWN';

export type VsiProfileSignalSnapshotV1 = {
  canonicalSignalKey: VsiProfileMaterializationKey;
  providerNativeSignalName: string;
  declaredSupport: VsiProfileDeclaredSupport;
  empiricalObservation: VsiEmpiricalObservationStatus;
  lastValidObservationAt: string | null;
  lastSourceTimestamp: string | null;
  lastProviderFetchAt: string | null;
  lastProvenStrictSourceAdvanceAt: string | null;
  strictSourceAdvanced: boolean | 'UNKNOWN';
  freshnessClassification: 'FRESH' | 'STALE' | 'UNKNOWN';
  evidenceProvenance: VsiEvidenceOrigin[];
  limitations: string[];
};

export type VsiProfileEvaluationResult = {
  contractVersion: typeof VSI_PROFILE_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  providerIdentity: string;
  verifiedModality: string | null;
  telemetrySourceFamily: string | null;
  evaluatedAt: Date;
  declaredCatalogCheckedAt: Date | null;
  lastMaterializedSourceTimestamp: Date | null;
  lastMaterializedProviderFetchAt: Date | null;
  lastProvenStrictSourceAdvanceAt: Date | null;
  signals: VsiProfileSignalSnapshotV1[];
  profileLimitations: string[];
};

export function mapVsiCatalogToDeclaredSupport(
  catalog: VsiProviderCatalogStatus,
): VsiProfileDeclaredSupport {
  switch (catalog) {
    case 'LISTED':
      return 'LISTED';
    case 'NOT_LISTED':
      return 'NOT_LISTED';
    default:
      return 'UNKNOWN';
  }
}
