import type { BatteryCapabilityStatus, BatteryMeasurementType } from '../battery-v2-domain';
import type { HvCapacityMethod } from '../hv-method-profile/hv-method-profile.types';
import { M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1 } from './m3-3-hv-h1.constants';

export const M3_3_HV_H1_FRESHNESS_CLASSES = [
  'FRESH_PROVIDER_TIMESTAMP',
  'STALE_PROVIDER_TIMESTAMP',
  'FUTURE_PROVIDER_TIMESTAMP',
  'INVALID_PROVIDER_TIMESTAMP',
  'CAPABILITY_CHECK_RECENT',
  'COLLECTION_LAST_SEEN_ONLY',
  'UNKNOWN',
] as const;

export type M3_3HvH1FreshnessClass = (typeof M3_3_HV_H1_FRESHNESS_CLASSES)[number];

export const M3_3_HV_H1_PROVIDER_LISTING_STATUSES = [
  'LISTED',
  'NOT_LISTED',
  'UNKNOWN',
] as const;

export type M3_3HvH1ProviderListingStatus =
  (typeof M3_3_HV_H1_PROVIDER_LISTING_STATUSES)[number];

export const M3_3_HV_H1_VEHICLE_DATA_STATUSES = [
  'AVAILABLE_WITH_DATA',
  'LISTED_NO_VALUE',
  'STALE',
  'DEGRADED',
  'UNAVAILABLE',
  'UNKNOWN',
] as const;

export type M3_3HvH1VehicleDataStatus =
  (typeof M3_3_HV_H1_VEHICLE_DATA_STATUSES)[number];

export const M3_3_HV_H1_QUALITY_CLASSES = [
  'CAPABILITY_USABLE',
  'CAPABILITY_LISTED_NO_VALUE',
  'CAPABILITY_STALE',
  'CAPABILITY_ERROR',
  'NOT_LISTED',
  'CONTEXT_ONLY',
] as const;

export type M3_3HvH1QualityClass = (typeof M3_3_HV_H1_QUALITY_CLASSES)[number];

export interface M3_3HvH1CapabilityMatrixPersistedRow {
  signalKey: string;
  status: BatteryCapabilityStatus;
  provider: string | null;
  measurementType: BatteryMeasurementType | null;
  checkedAt: Date | string;
  lastSeenAt?: Date | string | null;
  sourceTimestamp?: Date | string | null;
  lastValue?: number | null;
}

export interface M3_3HvH1ProviderCapabilityMatrixRowV1 {
  contractVersion: typeof M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1;
  organizationId: string;
  vehicleId: string;
  provider: string | null;
  signalKey: string;
  capabilityStatus: BatteryCapabilityStatus;
  checkedAt: string;
  lastSeenAt: string | null;
  sourceTimestamp: string | null;
  lastValue: number | null;
  measurementType: string | null;
  providerListingStatus: M3_3HvH1ProviderListingStatus;
  vehicleDataStatus: M3_3HvH1VehicleDataStatus;
  /** LISTED only — not true for QUERY_ERROR / UNKNOWN listing. */
  providerListed: boolean;
  /** Has durable listed state including NULL value rows. */
  vehicleSignalListed: boolean;
  lastProviderValuePresent: boolean;
  lastProviderTimestampPresent: boolean;
  currentStatus: BatteryCapabilityStatus;
  methodEligibility: HvCapacityMethod[];
  freshnessClass: M3_3HvH1FreshnessClass;
  qualityClass: M3_3HvH1QualityClass;
  capabilityStateSemantics: 'CURRENT_STATE_AT_QUERY';
}

export interface M3_3HvH1ProviderCapabilityMatrixV1 {
  contractVersion: typeof M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1;
  organizationId: string;
  vehicleId: string;
  evaluationAt: string;
  temporalSemantics: 'CURRENT_STATE_AT_QUERY';
  rows: M3_3HvH1ProviderCapabilityMatrixRowV1[];
}
