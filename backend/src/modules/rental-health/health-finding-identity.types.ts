import { HEALTH_FINDING_IDENTITY_VERSION } from './health-finding-identity.config';

/**
 * Canonical Rental Health module keys — aligned with Rental Health V1 aggregates.
 * Identity must never be derived from task types or UI labels alone.
 */
export type HealthFindingModule =
  | 'battery'
  | 'tires'
  | 'brakes'
  | 'error_codes'
  | 'service_compliance'
  | 'complaints'
  | 'vehicle_alerts';

/**
 * Stable upstream entity class that produced the finding signal.
 * Use structured codes/ids — never free-form display text.
 */
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
  /** Stable machine code (e.g. WEAR_MEASURED_CRITICAL, DTC_P0420) — not UI copy. */
  findingCode: string;
  sourceEntityType: HealthFindingSourceEntityType;
  /** Stable scoped id for the upstream entity (code, axle key, complaint id, …). */
  sourceEntityId: string;
  /** First time this occurrence episode was observed (ISO 8601). */
  firstObservedAt: string;
  /** Latest observation timestamp for this occurrence episode (ISO 8601). */
  currentObservedAt: string;
  /**
   * Monotonic episode counter for the same logical finding after remediation.
   * Defaults to 1; increment when the same `sourceFindingId` reappears post-resolution.
   */
  occurrenceGeneration?: number;
};

/**
 * Stable health-finding identity contract shared across rental health, tasks,
 * service cases, and operational surfaces.
 */
export type HealthFindingIdentity = HealthFindingIdentityInput & {
  version: typeof HEALTH_FINDING_IDENTITY_VERSION;
  /**
   * Logical fingerprint for the finding pattern (org + vehicle + module + code + source).
   * Stable across recurring episodes until the underlying signal identity changes.
   */
  sourceFindingId: string;
  /**
   * Unique id for one occurrence episode — distinguishes reopen after remediation
   * from the prior episode with the same `sourceFindingId`.
   */
  findingOccurrenceId: string;
  occurrenceGeneration: number;
};

export type HealthFindingFingerprintPair = {
  sourceFindingId: string;
  findingOccurrenceId: string;
  occurrenceGeneration: number;
  version: typeof HEALTH_FINDING_IDENTITY_VERSION;
};
