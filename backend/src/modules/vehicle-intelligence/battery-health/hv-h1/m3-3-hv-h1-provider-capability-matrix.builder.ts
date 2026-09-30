import { DEFAULT_CAPABILITY_STALE_THRESHOLD_MS } from '../capability-preflight/battery-capability-preflight.assess';
import { BatteryCapabilityStatus } from '../battery-v2-domain';
import {
  hvCapacityMethodsRequiringSignal,
  methodRequiresSignal,
} from '../hv-method-profile/hv-capacity-method-signal-requirements';
import type { HvCapacityMethod, HvMethodProfile } from '../hv-method-profile/hv-method-profile.types';
import { HV_H1_MAX_FUTURE_TIMESTAMP_SKEW_MS, M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1 } from './m3-3-hv-h1.constants';
import type {
  M3_3HvH1CapabilityMatrixPersistedRow,
  M3_3HvH1FreshnessClass,
  M3_3HvH1ProviderCapabilityMatrixRowV1,
  M3_3HvH1ProviderCapabilityMatrixV1,
  M3_3HvH1ProviderListingStatus,
  M3_3HvH1QualityClass,
  M3_3HvH1VehicleDataStatus,
} from './m3-3-hv-h1-provider-capability-matrix.types';

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function classifyHvH1ProviderListingStatus(
  status: BatteryCapabilityStatus,
): M3_3HvH1ProviderListingStatus {
  switch (status) {
    case BatteryCapabilityStatus.NOT_LISTED:
    case BatteryCapabilityStatus.UNAVAILABLE:
      return 'NOT_LISTED';
    case BatteryCapabilityStatus.QUERY_ERROR:
      return 'UNKNOWN';
    case BatteryCapabilityStatus.AVAILABLE:
    case BatteryCapabilityStatus.AVAILABLE_STALE:
    case BatteryCapabilityStatus.AVAILABLE_NULL:
    case BatteryCapabilityStatus.DEGRADED:
    default:
      return 'LISTED';
  }
}

export function classifyHvH1VehicleDataStatus(
  status: BatteryCapabilityStatus,
): M3_3HvH1VehicleDataStatus {
  switch (status) {
    case BatteryCapabilityStatus.AVAILABLE:
      return 'AVAILABLE_WITH_DATA';
    case BatteryCapabilityStatus.AVAILABLE_NULL:
      return 'LISTED_NO_VALUE';
    case BatteryCapabilityStatus.AVAILABLE_STALE:
      return 'STALE';
    case BatteryCapabilityStatus.DEGRADED:
      return 'DEGRADED';
    case BatteryCapabilityStatus.NOT_LISTED:
    case BatteryCapabilityStatus.UNAVAILABLE:
      return 'UNAVAILABLE';
    case BatteryCapabilityStatus.QUERY_ERROR:
    default:
      return 'UNKNOWN';
  }
}

export function classifyHvH1Freshness(input: {
  sourceTimestamp: Date | null;
  lastSeenAt: Date | null;
  checkedAt: Date;
  capabilityStatus: BatteryCapabilityStatus;
  evaluationAt: Date;
  staleThresholdMs?: number;
  maxFutureSkewMs?: number;
}): M3_3HvH1FreshnessClass {
  const threshold = input.staleThresholdMs ?? DEFAULT_CAPABILITY_STALE_THRESHOLD_MS;
  const maxFuture = input.maxFutureSkewMs ?? HV_H1_MAX_FUTURE_TIMESTAMP_SKEW_MS;
  const source = input.sourceTimestamp;
  const lastSeen = input.lastSeenAt ?? input.sourceTimestamp;

  if (source) {
    const skewMs = source.getTime() - input.evaluationAt.getTime();
    if (skewMs > maxFuture) return 'FUTURE_PROVIDER_TIMESTAMP';
    const age = input.evaluationAt.getTime() - source.getTime();
    if (age < 0) return 'FUTURE_PROVIDER_TIMESTAMP';
    if (age <= threshold) return 'FRESH_PROVIDER_TIMESTAMP';
    return 'STALE_PROVIDER_TIMESTAMP';
  }

  if (lastSeen) {
    const skewMs = lastSeen.getTime() - input.evaluationAt.getTime();
    if (skewMs > maxFuture) return 'FUTURE_PROVIDER_TIMESTAMP';
    const age = input.evaluationAt.getTime() - lastSeen.getTime();
    if (age < 0) return 'INVALID_PROVIDER_TIMESTAMP';
    if (age <= threshold) return 'COLLECTION_LAST_SEEN_ONLY';
    return 'STALE_PROVIDER_TIMESTAMP';
  }

  const checkAge = input.evaluationAt.getTime() - input.checkedAt.getTime();
  if (
    checkAge <= threshold &&
    input.capabilityStatus !== BatteryCapabilityStatus.NOT_LISTED &&
    input.capabilityStatus !== BatteryCapabilityStatus.QUERY_ERROR
  ) {
    return 'CAPABILITY_CHECK_RECENT';
  }

  return 'UNKNOWN';
}

export function classifyHvH1Quality(input: {
  capabilityStatus: BatteryCapabilityStatus;
}): M3_3HvH1QualityClass {
  switch (input.capabilityStatus) {
    case BatteryCapabilityStatus.AVAILABLE:
      return 'CAPABILITY_USABLE';
    case BatteryCapabilityStatus.AVAILABLE_STALE:
      return 'CAPABILITY_STALE';
    case BatteryCapabilityStatus.AVAILABLE_NULL:
      return 'CAPABILITY_LISTED_NO_VALUE';
    case BatteryCapabilityStatus.NOT_LISTED:
    case BatteryCapabilityStatus.UNAVAILABLE:
      return 'NOT_LISTED';
    case BatteryCapabilityStatus.QUERY_ERROR:
    case BatteryCapabilityStatus.DEGRADED:
      return 'CAPABILITY_ERROR';
    default:
      return 'CONTEXT_ONLY';
  }
}

function methodsEligibleForSignal(
  signalKey: string,
  methodProfile: HvMethodProfile,
): HvCapacityMethod[] {
  const supported = new Set(methodProfile.supportedCapacityMethods);
  return hvCapacityMethodsRequiringSignal(signalKey).filter((method) => supported.has(method));
}

export function buildM3_3HvH1ProviderCapabilityMatrixV1(input: {
  organizationId: string;
  vehicleId: string;
  persistedRows: M3_3HvH1CapabilityMatrixPersistedRow[];
  methodProfile: HvMethodProfile;
  evaluationAt?: Date;
}): M3_3HvH1ProviderCapabilityMatrixV1 {
  const evaluationAt = input.evaluationAt ?? new Date();
  const rows: M3_3HvH1ProviderCapabilityMatrixRowV1[] = input.persistedRows.map((row) => {
    const checkedAt = parseDate(row.checkedAt) ?? evaluationAt;
    const sourceTimestamp = parseDate(row.sourceTimestamp);
    const lastSeenAt = parseDate(row.lastSeenAt);
    const providerListingStatus = classifyHvH1ProviderListingStatus(row.status);
    const vehicleDataStatus = classifyHvH1VehicleDataStatus(row.status);
    const freshnessClass = classifyHvH1Freshness({
      sourceTimestamp,
      lastSeenAt,
      checkedAt,
      capabilityStatus: row.status,
      evaluationAt,
    });
    const qualityClass = classifyHvH1Quality({ capabilityStatus: row.status });
    const methodEligibility = methodsEligibleForSignal(row.signalKey, input.methodProfile);

    return {
      contractVersion: M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: row.provider,
      signalKey: row.signalKey,
      capabilityStatus: row.status,
      checkedAt: checkedAt.toISOString(),
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
      sourceTimestamp: sourceTimestamp?.toISOString() ?? null,
      lastValue: row.lastValue ?? null,
      measurementType: row.measurementType ?? null,
      providerListingStatus,
      vehicleDataStatus,
      providerListed: providerListingStatus === 'LISTED',
      vehicleSignalListed: providerListingStatus === 'LISTED',
      lastProviderValuePresent: row.lastValue != null,
      lastProviderTimestampPresent: sourceTimestamp != null,
      currentStatus: row.status,
      methodEligibility,
      freshnessClass,
      qualityClass,
      capabilityStateSemantics: 'CURRENT_STATE_AT_QUERY',
    };
  });

  return {
    contractVersion: M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    evaluationAt: evaluationAt.toISOString(),
    temporalSemantics: 'CURRENT_STATE_AT_QUERY',
    rows,
  };
}

export { methodRequiresSignal, hvCapacityMethodsRequiringSignal };
