import type { VehicleRegistryLifecycle } from '@prisma/client';
import type { VsiCanonicalSignalKey } from './canonical-signal-keys';
import type { VsiVehicleSignalEvidenceDescriptorV1 } from './vehicle-signal-evidence.contract';

/** P1 scoped canonical signals (VSI-03). */
export const VSI_P1_SIGNAL_KEYS = [
  'lv_voltage',
  'hv_battery_soc',
  'provider_source_timestamp',
  'device_connectivity',
] as const satisfies readonly VsiCanonicalSignalKey[];

export type VsiP1SignalKey = (typeof VSI_P1_SIGNAL_KEYS)[number];

export const VSI_READONLY_COMPOSER_VERSION = 'vsi-readonly-composer-v1' as const;

export type VsiReadonlyComposerRequest = {
  organizationId: string;
  vehicleId: string;
  projectionAsOf?: Date;
  /** Bounded poll-log lookback for strict source advance (default 5, max 20). */
  pollLogLookbackLimit?: number;
};

export type VsiConnectionIdentityProjection = {
  provider: string;
  providerSourceLinkId: string | 'UNRESOLVED';
  verifiedModality: string | 'UNRESOLVED';
  physicalDeviceReference: string | 'NOT_APPLICABLE' | 'UNKNOWN' | 'UNRESOLVED';
  telemetrySourceFamily: 'RUPTELA_R1' | 'API_SYNTHETIC' | 'HIGH_MOBILITY' | 'UNKNOWN' | 'UNRESOLVED';
  /** False for verified software integration — never inferred from vehicles.hardwareType. */
  treatsAsPhysicalHardwareDevice: boolean;
  confidenceLimitations: string[];
};

export type VsiReadonlyComposerResult = {
  contractVersion: typeof VSI_READONLY_COMPOSER_VERSION;
  projectionAsOf: Date;
  organizationId: string;
  vehicleId: string;
  registryLifecycle: VehicleRegistryLifecycle | 'UNKNOWN';
  hardwareTypeLegacy: string | 'UNKNOWN';
  identityProjections: VsiConnectionIdentityProjection[];
  signals: VsiVehicleSignalEvidenceDescriptorV1[];
  /** Read-only flags for operators — not wired to APDS runtime. */
  apdsConsumptionBoundary: {
    wiredToShadowDecisionPath: false;
    stratifyByConnectionIdentity: true;
    teslaSoftwareIntegrationDistinctFromRuptelaR1: true;
  };
};

export type VsiLatestStateSnapshot = {
  vehicleId: string;
  providerBindingId: string | null;
  providerSource: string | null;
  lvBatteryVoltage: number | null;
  evSoc: number | null;
  online: boolean;
  sourceTimestamp: Date | null;
  providerFetchedAt: Date | null;
  updatedAt: Date;
  rawPayloadJson: unknown;
};

export type VsiSourceLinkRow = {
  id: string;
  provider: string;
  isActive: boolean;
  metadata: unknown;
  consentId?: string | null;
  /**
   * When true, vehicle provider consent is ACTIVE for this link (org eligibility only).
   * Does not imply provider-side telemetry authorization in P1 descriptors.
   */
  scopedOrgProviderConsentValid?: boolean;
};

export type VsiPollLogRow = {
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
};
