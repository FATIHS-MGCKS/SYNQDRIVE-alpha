import type { BatteryCapabilityStatus } from '../battery-v2-domain';
import type { HvCapacityMethod } from '../hv-method-profile/hv-method-profile.types';
import { M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1 } from './m3-3-hv-h1.constants';

export const M3_3_HV_H1_FRESHNESS_CLASSES = [
  'FRESH_PROVIDER_TIMESTAMP',
  'STALE_PROVIDER_TIMESTAMP',
  'CAPABILITY_CHECK_RECENT',
  'COLLECTION_LAST_SEEN_ONLY',
  'UNKNOWN',
] as const;

export type M3_3HvH1FreshnessClass = (typeof M3_3_HV_H1_FRESHNESS_CLASSES)[number];

export const M3_3_HV_H1_QUALITY_CLASSES = [
  'CAPABILITY_USABLE',
  'CAPABILITY_LISTED_NO_VALUE',
  'CAPABILITY_STALE',
  'CAPABILITY_ERROR',
  'NOT_LISTED',
  'METHOD_ELIGIBLE',
  'METHOD_INELIGIBLE',
  'CONTEXT_ONLY',
] as const;

export type M3_3HvH1QualityClass = (typeof M3_3_HV_H1_QUALITY_CLASSES)[number];

export interface M3_3HvH1ProviderCapabilityMatrixRowV1 {
  contractVersion: typeof M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1;
  organizationId: string;
  vehicleId: string;
  provider: string;
  signalKey: string;
  capabilityStatus: BatteryCapabilityStatus;
  checkedAt: string;
  lastSeenAt: string | null;
  sourceTimestamp: string | null;
  measurementType: string | null;
  providerListed: boolean;
  vehicleAvailable: boolean;
  lastProviderValuePresent: boolean;
  lastProviderTimestampPresent: boolean;
  currentStatus: BatteryCapabilityStatus;
  methodEligibility: HvCapacityMethod[];
  freshnessClass: M3_3HvH1FreshnessClass;
  qualityClass: M3_3HvH1QualityClass;
}

export interface M3_3HvH1ProviderCapabilityMatrixV1 {
  contractVersion: typeof M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1;
  organizationId: string;
  vehicleId: string;
  resolvedAt: string;
  rows: M3_3HvH1ProviderCapabilityMatrixRowV1[];
}
