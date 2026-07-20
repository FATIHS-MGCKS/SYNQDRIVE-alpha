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

/** API-facing stable finding on rental-health modules (snake_case). */
export type RentalHealthSourceFinding = {
  finding_code: string;
  source_entity_type: HealthFindingSourceEntityType;
  source_entity_id: string;
  source_finding_id: string;
  finding_occurrence_id: string;
  occurrence_generation: number;
  version: typeof HEALTH_FINDING_IDENTITY_VERSION;
  first_observed_at: string;
  current_observed_at: string;
  severity: 'critical' | 'warning' | 'info' | 'unknown';
  reason?: string;
};
