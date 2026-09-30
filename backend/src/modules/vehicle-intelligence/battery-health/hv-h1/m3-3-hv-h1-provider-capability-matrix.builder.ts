import { DEFAULT_CAPABILITY_STALE_THRESHOLD_MS } from '../capability-preflight/battery-capability-preflight.assess';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import { BatteryCapabilityStatus } from '../battery-v2-domain';
import {
  HV_CAPACITY_METHODS,
  type HvCapacityMethod,
  type HvMethodProfile,
} from '../hv-method-profile/hv-method-profile.types';
import type { HvMethodProfileCapabilityInput } from '../hv-method-profile/hv-method-profile.types';
import { M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1 } from './m3-3-hv-h1.constants';
import type {
  M3_3HvH1FreshnessClass,
  M3_3HvH1ProviderCapabilityMatrixRowV1,
  M3_3HvH1ProviderCapabilityMatrixV1,
  M3_3HvH1QualityClass,
} from './m3-3-hv-h1-provider-capability-matrix.types';

const METHOD_SIGNAL_REQUIREMENTS: Partial<Record<HvCapacityMethod, string[]>> = {
  M2_CURRENT_ENERGY_SOC: ['hv.soc', 'hv.current_energy'],
  M3_ADDED_ENERGY_DELTA_SOC: ['hv.soc', 'hv.added_energy', RECHARGE_SEGMENTS_SIGNAL_KEY],
  PROVIDER_HV_SOH: ['hv.provider_soh'],
  SESSION_CHARGE_CAPACITY: ['hv.soc', 'hv.current_energy'],
  GROSS_CAPACITY_REFERENCE: ['hv.gross_capacity'],
};

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function classifyHvH1Freshness(input: {
  sourceTimestamp: Date | null;
  lastSeenAt: Date | null;
  checkedAt: Date;
  capabilityStatus: BatteryCapabilityStatus;
  now: Date;
  staleThresholdMs?: number;
}): M3_3HvH1FreshnessClass {
  const threshold = input.staleThresholdMs ?? DEFAULT_CAPABILITY_STALE_THRESHOLD_MS;
  const source = input.sourceTimestamp;
  const lastSeen = input.lastSeenAt ?? input.sourceTimestamp;

  if (source) {
    const age = input.now.getTime() - source.getTime();
    if (age <= threshold) return 'FRESH_PROVIDER_TIMESTAMP';
    return 'STALE_PROVIDER_TIMESTAMP';
  }

  if (lastSeen) {
    const age = input.now.getTime() - lastSeen.getTime();
    if (age <= threshold) return 'COLLECTION_LAST_SEEN_ONLY';
    return 'STALE_PROVIDER_TIMESTAMP';
  }

  const checkAge = input.now.getTime() - input.checkedAt.getTime();
  if (checkAge <= threshold && input.capabilityStatus !== BatteryCapabilityStatus.NOT_LISTED) {
    return 'CAPABILITY_CHECK_RECENT';
  }

  return 'UNKNOWN';
}

export function classifyHvH1Quality(input: {
  capabilityStatus: BatteryCapabilityStatus;
  lastValue: number | null | undefined;
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
  return HV_CAPACITY_METHODS.filter((method) => {
    if (!supported.has(method)) return false;
    const reqs = METHOD_SIGNAL_REQUIREMENTS[method] ?? [];
    return reqs.includes(signalKey);
  });
}

function vehicleAvailable(row: HvMethodProfileCapabilityInput): boolean {
  return (
    row.status === BatteryCapabilityStatus.AVAILABLE ||
    row.status === BatteryCapabilityStatus.AVAILABLE_STALE ||
    row.status === BatteryCapabilityStatus.AVAILABLE_NULL
  );
}

function providerListed(row: HvMethodProfileCapabilityInput): boolean {
  return row.status !== BatteryCapabilityStatus.NOT_LISTED;
}

export function buildM3_3HvH1ProviderCapabilityMatrixV1(input: {
  organizationId: string;
  vehicleId: string;
  providerDefault?: string;
  capabilities: HvMethodProfileCapabilityInput[];
  methodProfile: HvMethodProfile;
  now?: Date;
}): M3_3HvH1ProviderCapabilityMatrixV1 {
  const now = input.now ?? new Date();
  const rows: M3_3HvH1ProviderCapabilityMatrixRowV1[] = input.capabilities.map((row) => {
    const checkedAt = parseDate(row.checkedAt) ?? now;
    const sourceTimestamp = parseDate(row.sourceTimestamp);
    const lastSeenAt = parseDate(row.lastSeenAt);
    const freshnessClass = classifyHvH1Freshness({
      sourceTimestamp,
      lastSeenAt,
      checkedAt,
      capabilityStatus: row.status,
      now,
    });
    const qualityClass = classifyHvH1Quality({
      capabilityStatus: row.status,
      lastValue: row.lastValue,
    });
    const methodEligibility = methodsEligibleForSignal(row.signalKey, input.methodProfile);

    return {
      contractVersion: M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: input.providerDefault ?? 'DIMO',
      signalKey: row.signalKey,
      capabilityStatus: row.status,
      checkedAt: checkedAt.toISOString(),
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
      sourceTimestamp: sourceTimestamp?.toISOString() ?? null,
      measurementType: null,
      providerListed: providerListed(row),
      vehicleAvailable: vehicleAvailable(row),
      lastProviderValuePresent: row.lastValue != null,
      lastProviderTimestampPresent: sourceTimestamp != null,
      currentStatus: row.status,
      methodEligibility,
      freshnessClass,
      qualityClass,
    };
  });

  return {
    contractVersion: M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    resolvedAt: now.toISOString(),
    rows,
  };
}
