/**
 * Frontend mirror of the Rental Health finding identity contract.
 * Canonical implementation: `backend/src/modules/rental-health/health-finding-identity.ts`
 */
export const HEALTH_FINDING_IDENTITY_VERSION = 'health-finding-identity-v1' as const;

export type HealthFindingModule =
  | 'battery'
  | 'tires'
  | 'brakes'
  | 'error_codes'
  | 'service_compliance'
  | 'complaints'
  | 'vehicle_alerts';

export type HealthFindingSourceEntityType =
  | 'rental_health_module'
  | 'rental_reason_code'
  | 'dtc_code'
  | 'brake_alert'
  | 'tire_alert'
  | 'battery_signal'
  | 'compliance_signal'
  | 'vehicle_alert'
  | 'complaint'
  | 'oem_dashboard_light';

export type HealthFindingIdentityInput = {
  organizationId: string;
  vehicleId: string;
  healthModule: HealthFindingModule;
  findingCode: string;
  sourceEntityType: HealthFindingSourceEntityType;
  sourceEntityId: string;
  firstObservedAt: string;
  currentObservedAt: string;
  occurrenceGeneration?: number;
};

export type HealthFindingIdentity = HealthFindingIdentityInput & {
  version: typeof HEALTH_FINDING_IDENTITY_VERSION;
  sourceFindingId: string;
  findingOccurrenceId: string;
  occurrenceGeneration: number;
};

export type HealthFindingFingerprintPair = {
  sourceFindingId: string;
  findingOccurrenceId: string;
  occurrenceGeneration: number;
  version: typeof HEALTH_FINDING_IDENTITY_VERSION;
};
