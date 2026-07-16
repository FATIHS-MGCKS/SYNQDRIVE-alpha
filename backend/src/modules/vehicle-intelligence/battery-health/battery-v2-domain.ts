/**
 * Battery Health V2 — shared domain vocabulary (Prisma-aligned).
 *
 * Canonical source for Battery V2 enums introduced in P0 migration
 * `battery_v2_enums`. Values must stay in sync with `schema.prisma`.
 *
 * Reused legacy enums (no Prisma duplicate):
 * - `BatteryPublicationStatus` → `SohPublicationState`
 * - Measurement/assessment scope → `BatteryEvidenceScope` (LV / HV)
 *
 * @see docs/architecture/battery-health-v2-prisma-plan.md §3
 */

import type {
  BatteryEvidenceScope as PrismaBatteryEvidenceScope,
  SohPublicationState as PrismaSohPublicationState,
} from '@prisma/client';

// ── Reused publication enum (no new Prisma type) ─────────────────────────────

export type BatteryPublicationStatus = PrismaSohPublicationState;

export const BatteryPublicationStatus = {
  INITIAL_CALIBRATION: 'INITIAL_CALIBRATION',
  STABILIZING: 'STABILIZING',
  STABLE: 'STABLE',
} as const satisfies Record<
  PrismaSohPublicationState,
  PrismaSohPublicationState
>;

export const BATTERY_PUBLICATION_STATUSES = Object.values(
  BatteryPublicationStatus,
) as PrismaSohPublicationState[];

// ── Reused scope enum (no BatteryMeasurementScope duplicate) ─────────────────

export type BatteryMeasurementScope = PrismaBatteryEvidenceScope;

export const BatteryMeasurementScope = {
  LV: 'LV',
  HV: 'HV',
} as const satisfies Record<PrismaBatteryEvidenceScope, PrismaBatteryEvidenceScope>;

export const BATTERY_MEASUREMENT_SCOPES = Object.values(
  BatteryMeasurementScope,
) as PrismaBatteryEvidenceScope[];

// ── Measurement type (messart) ───────────────────────────────────────────────

export const BatteryMeasurementType = {
  LIVE_VOLTAGE: 'LIVE_VOLTAGE',
  LIVE_LOADED_VOLTAGE: 'LIVE_LOADED_VOLTAGE',
  CHARGING_VOLTAGE: 'CHARGING_VOLTAGE',
  REST_AFTER_SHUTDOWN: 'REST_AFTER_SHUTDOWN',
  REST_60M: 'REST_60M',
  REST_6H: 'REST_6H',
  PRE_WAKE_VOLTAGE: 'PRE_WAKE_VOLTAGE',
  PRE_START_VOLTAGE: 'PRE_START_VOLTAGE',
  START_DIP_PROXY: 'START_DIP_PROXY',
  RECOVERY_5S_VOLTAGE: 'RECOVERY_5S_VOLTAGE',
  RECOVERY_30S_VOLTAGE: 'RECOVERY_30S_VOLTAGE',
  RECOVERY_PROXY_VOLTAGE: 'RECOVERY_PROXY_VOLTAGE',
  WORKSHOP_OCV: 'WORKSHOP_OCV',
  WORKSHOP_LOAD_TEST: 'WORKSHOP_LOAD_TEST',
  LIVE_HV_SOC: 'LIVE_HV_SOC',
  LIVE_HV_RANGE: 'LIVE_HV_RANGE',
  LIVE_HV_CURRENT_ENERGY: 'LIVE_HV_CURRENT_ENERGY',
  LIVE_HV_CHARGING_POWER: 'LIVE_HV_CHARGING_POWER',
  PROVIDER_HV_SOH: 'PROVIDER_HV_SOH',
  WORKSHOP_HV_SOH: 'WORKSHOP_HV_SOH',
  DOCUMENT_HV_SOH: 'DOCUMENT_HV_SOH',
  CHARGE_SESSION_CAPACITY: 'CHARGE_SESSION_CAPACITY',
  DISCHARGE_SESSION_CAPACITY: 'DISCHARGE_SESSION_CAPACITY',
  SESSION_MISSED: 'SESSION_MISSED',
} as const;

export type BatteryMeasurementType =
  (typeof BatteryMeasurementType)[keyof typeof BatteryMeasurementType];

export const BATTERY_MEASUREMENT_TYPES = Object.values(BatteryMeasurementType);

// ── Measurement quality ──────────────────────────────────────────────────────

export const BatteryMeasurementQuality = {
  VALID: 'VALID',
  VALID_PROXY: 'VALID_PROXY',
  SHADOW: 'SHADOW',
  CONTAMINATED_BY_WAKE: 'CONTAMINATED_BY_WAKE',
  CONTAMINATED_BY_CHARGING: 'CONTAMINATED_BY_CHARGING',
  CONTAMINATED_BY_LOAD: 'CONTAMINATED_BY_LOAD',
  CONTAMINATED_BY_ACTIVE_TRIP: 'CONTAMINATED_BY_ACTIVE_TRIP',
  INSUFFICIENT_CADENCE: 'INSUFFICIENT_CADENCE',
  INSUFFICIENT_COVERAGE: 'INSUFFICIENT_COVERAGE',
  TIMESTAMP_INCONSISTENT: 'TIMESTAMP_INCONSISTENT',
  STALE: 'STALE',
  MISSING_CONTEXT: 'MISSING_CONTEXT',
  MISSED: 'MISSED',
  UNSUPPORTED_PROFILE: 'UNSUPPORTED_PROFILE',
  PROVIDER_DELAY: 'PROVIDER_DELAY',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  NO_DATA: 'NO_DATA',
} as const;

export type BatteryMeasurementQuality =
  (typeof BatteryMeasurementQuality)[keyof typeof BatteryMeasurementQuality];

export const BATTERY_MEASUREMENT_QUALITIES = Object.values(
  BatteryMeasurementQuality,
);

/** Qualities that may feed evidence or assessment pipelines. */
export const BATTERY_EVIDENCE_CAPABLE_QUALITIES: readonly BatteryMeasurementQuality[] =
  [BatteryMeasurementQuality.VALID, BatteryMeasurementQuality.VALID_PROXY];

// ── Measurement session ──────────────────────────────────────────────────────

export const BatteryMeasurementSessionType = {
  LV_REST_WINDOW: 'LV_REST_WINDOW',
  LV_ICE_START: 'LV_ICE_START',
  HV_DIMO_RECHARGE_SEGMENT: 'HV_DIMO_RECHARGE_SEGMENT',
  HV_POLL_CHARGE_WINDOW: 'HV_POLL_CHARGE_WINDOW',
  HV_DISCHARGE_WINDOW: 'HV_DISCHARGE_WINDOW',
  ICE_START_PROXY: 'ICE_START_PROXY',
  PHEV_ICE_START: 'PHEV_ICE_START',
  EV_WAKE: 'EV_WAKE',
  HV_CHARGE: 'HV_CHARGE',
  WORKSHOP_TEST: 'WORKSHOP_TEST',
  DOCUMENT_MEASUREMENT: 'DOCUMENT_MEASUREMENT',
  MANUAL_CONFIRMED: 'MANUAL_CONFIRMED',
} as const;

export type BatteryMeasurementSessionType =
  (typeof BatteryMeasurementSessionType)[keyof typeof BatteryMeasurementSessionType];

export const BATTERY_MEASUREMENT_SESSION_TYPES = Object.values(
  BatteryMeasurementSessionType,
);

export const BatteryMeasurementSessionStatus = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  MISSED: 'MISSED',
  CANCELLED: 'CANCELLED',
  INVALID: 'INVALID',
} as const;

export type BatteryMeasurementSessionStatus =
  (typeof BatteryMeasurementSessionStatus)[keyof typeof BatteryMeasurementSessionStatus];

export const BATTERY_MEASUREMENT_SESSION_STATUSES = Object.values(
  BatteryMeasurementSessionStatus,
);

// ── LV rest window state machine (Prompt 30) ─────────────────────────────────

export const LvRestWindowState = {
  CANDIDATE: 'CANDIDATE',
  RESTING: 'RESTING',
  INVALIDATED: 'INVALIDATED',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
} as const;

export type LvRestWindowState =
  (typeof LvRestWindowState)[keyof typeof LvRestWindowState];

export const LV_REST_WINDOW_STATES = Object.values(LvRestWindowState);

export const LvRestWindowEventType = {
  TRIP_ENDED: 'TRIP_ENDED',
  REST_SNAPSHOT: 'REST_SNAPSHOT',
  WAKE_DETECTED: 'WAKE_DETECTED',
  CHARGING_DETECTED: 'CHARGING_DETECTED',
  NEW_TRIP_STARTED: 'NEW_TRIP_STARTED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  REST_WINDOW_EXPIRED: 'REST_WINDOW_EXPIRED',
} as const;

export type LvRestWindowEventType =
  (typeof LvRestWindowEventType)[keyof typeof LvRestWindowEventType];

export function mapLvRestWindowStateToSessionStatus(
  state: LvRestWindowState,
): BatteryMeasurementSessionStatus {
  switch (state) {
    case LvRestWindowState.CANDIDATE:
      return BatteryMeasurementSessionStatus.PLANNED;
    case LvRestWindowState.RESTING:
      return BatteryMeasurementSessionStatus.ACTIVE;
    case LvRestWindowState.INVALIDATED:
      return BatteryMeasurementSessionStatus.INVALID;
    case LvRestWindowState.COMPLETED:
      return BatteryMeasurementSessionStatus.COMPLETED;
    case LvRestWindowState.EXPIRED:
      return BatteryMeasurementSessionStatus.MISSED;
    default:
      return BatteryMeasurementSessionStatus.INVALID;
  }
}

export function buildLvRestWindowIdempotencyKey(
  vehicleId: string,
  anchorAt: Date,
): string {
  return `lv-rest:${vehicleId}:${anchorAt.getTime()}`;
}

/** Derives LV/HV scope from session type for persistence and indexing. */
export function resolveBatteryMeasurementSessionScope(
  type: BatteryMeasurementSessionType,
): BatteryMeasurementScope {
  switch (type) {
    case BatteryMeasurementSessionType.LV_REST_WINDOW:
    case BatteryMeasurementSessionType.LV_ICE_START:
    case BatteryMeasurementSessionType.ICE_START_PROXY:
    case BatteryMeasurementSessionType.PHEV_ICE_START:
    case BatteryMeasurementSessionType.WORKSHOP_TEST:
    case BatteryMeasurementSessionType.DOCUMENT_MEASUREMENT:
    case BatteryMeasurementSessionType.MANUAL_CONFIRMED:
      return BatteryMeasurementScope.LV;
    default:
      return BatteryMeasurementScope.HV;
  }
}

// ── Assessment ───────────────────────────────────────────────────────────────

export const BatteryAssessmentType = {
  LV_ESTIMATED_HEALTH: 'LV_ESTIMATED_HEALTH',
  HV_SOH_PROVIDER: 'HV_SOH_PROVIDER',
  HV_CAPACITY_SESSION: 'HV_CAPACITY_SESSION',
  HV_CAPACITY_SHADOW: 'HV_CAPACITY_SHADOW',
} as const;

export type BatteryAssessmentType =
  (typeof BatteryAssessmentType)[keyof typeof BatteryAssessmentType];

export const BATTERY_ASSESSMENT_TYPES = Object.values(BatteryAssessmentType);

export const BatteryAssessmentMaturity = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
} as const;

export type BatteryAssessmentMaturity =
  (typeof BatteryAssessmentMaturity)[keyof typeof BatteryAssessmentMaturity];

export const BATTERY_ASSESSMENT_MATURITIES = Object.values(
  BatteryAssessmentMaturity,
);

/** Maps legacy string `maturityConfidence` values to the V2 enum. */
export function normalizeBatteryAssessmentMaturity(
  input: unknown,
): BatteryAssessmentMaturity | null {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().toUpperCase().replace(/-/g, '_');
  if (normalized === 'INSUFFICIENT_DATA' || normalized === 'NONE') {
    return BatteryAssessmentMaturity.INSUFFICIENT_DATA;
  }
  if (
    (BATTERY_ASSESSMENT_MATURITIES as readonly string[]).includes(normalized)
  ) {
    return normalized as BatteryAssessmentMaturity;
  }
  return null;
}

// ── Capability preflight ─────────────────────────────────────────────────────

export const BatteryCapabilityStatus = {
  AVAILABLE: 'AVAILABLE',
  AVAILABLE_STALE: 'AVAILABLE_STALE',
  AVAILABLE_NULL: 'AVAILABLE_NULL',
  NOT_LISTED: 'NOT_LISTED',
  QUERY_ERROR: 'QUERY_ERROR',
  UNSUPPORTED: 'UNSUPPORTED',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type BatteryCapabilityStatus =
  (typeof BatteryCapabilityStatus)[keyof typeof BatteryCapabilityStatus];

export const BATTERY_CAPABILITY_STATUSES = Object.values(
  BatteryCapabilityStatus,
);

// ── Vehicle / battery profiles ───────────────────────────────────────────────

export const BatteryDriveProfile = {
  ICE: 'ICE',
  HEV: 'HEV',
  PHEV: 'PHEV',
  BEV: 'BEV',
  UNKNOWN: 'UNKNOWN',
} as const;

export type BatteryDriveProfile =
  (typeof BatteryDriveProfile)[keyof typeof BatteryDriveProfile];

export const BATTERY_DRIVE_PROFILES = Object.values(BatteryDriveProfile);

export const BatteryChemistry = {
  LEAD_ACID: 'LEAD_ACID',
  AGM: 'AGM',
  EFB: 'EFB',
  LITHIUM: 'LITHIUM',
  UNKNOWN: 'UNKNOWN',
} as const;

export type BatteryChemistry =
  (typeof BatteryChemistry)[keyof typeof BatteryChemistry];

export const BATTERY_CHEMISTRIES = Object.values(BatteryChemistry);

// ── Evidence strength (assessment-input priority tier) ───────────────────────

export const BatteryEvidenceStrength = {
  OVERRIDE: 'OVERRIDE',
  PRIMARY: 'PRIMARY',
  SUPPLEMENTARY: 'SUPPLEMENTARY',
  DIAGNOSTIC: 'DIAGNOSTIC',
  NONE: 'NONE',
} as const;

export type BatteryEvidenceStrength =
  (typeof BatteryEvidenceStrength)[keyof typeof BatteryEvidenceStrength];

export const BATTERY_EVIDENCE_STRENGTHS = Object.values(
  BatteryEvidenceStrength,
);

// ── HV capacity observation method ───────────────────────────────────────────

export const HvCapacityMethod = {
  SESSION_DELTA_ENERGY_SOC: 'SESSION_DELTA_ENERGY_SOC',
  SHADOW_ROLLING_MEDIAN: 'SHADOW_ROLLING_MEDIAN',
  PROVIDER_GROSS_CAPACITY: 'PROVIDER_GROSS_CAPACITY',
  LEGACY_PAIRWISE_POLL: 'LEGACY_PAIRWISE_POLL',
} as const;

export type HvCapacityMethod =
  (typeof HvCapacityMethod)[keyof typeof HvCapacityMethod];

export const HV_CAPACITY_METHODS = Object.values(HvCapacityMethod);

// ── Reference capacity ───────────────────────────────────────────────────────

export const ReferenceCapacityVerificationStatus = {
  VERIFIED: 'VERIFIED',
  UNVERIFIED: 'UNVERIFIED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  WEAK_SOURCE_ONLY: 'WEAK_SOURCE_ONLY',
} as const;

export type ReferenceCapacityVerificationStatus =
  (typeof ReferenceCapacityVerificationStatus)[keyof typeof ReferenceCapacityVerificationStatus];

export const REFERENCE_CAPACITY_VERIFICATION_STATUSES = Object.values(
  ReferenceCapacityVerificationStatus,
);

export const BatteryReferenceCapacitySource = {
  WORKSHOP_MEASUREMENT: 'WORKSHOP_MEASUREMENT',
  DOCUMENT_CONFIRMED: 'DOCUMENT_CONFIRMED',
  MANUAL_REPORT: 'MANUAL_REPORT',
  PROVIDER_GROSS_NOMINAL: 'PROVIDER_GROSS_NOMINAL',
  VEHICLE_MASTER: 'VEHICLE_MASTER',
  DIMO_NOMINAL_SIGNAL: 'DIMO_NOMINAL_SIGNAL',
} as const;

export type BatteryReferenceCapacitySource =
  (typeof BatteryReferenceCapacitySource)[keyof typeof BatteryReferenceCapacitySource];

export const BATTERY_REFERENCE_CAPACITY_SOURCES = Object.values(
  BatteryReferenceCapacitySource,
);

/** Sources that alone are not decision-capable for HV SOH-% publication. */
export const BATTERY_WEAK_REFERENCE_CAPACITY_SOURCES: readonly BatteryReferenceCapacitySource[] =
  [
    BatteryReferenceCapacitySource.VEHICLE_MASTER,
    BatteryReferenceCapacitySource.DIMO_NOMINAL_SIGNAL,
  ];

export const BatteryReferenceCapacityType = {
  GROSS_NOMINAL: 'GROSS_NOMINAL',
  USABLE_NET: 'USABLE_NET',
  WORKSHOP_MEASURED: 'WORKSHOP_MEASURED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type BatteryReferenceCapacityType =
  (typeof BatteryReferenceCapacityType)[keyof typeof BatteryReferenceCapacityType];

export const BATTERY_REFERENCE_CAPACITY_TYPES = Object.values(
  BatteryReferenceCapacityType,
);
