import { BatteryCapabilityStatus } from '../battery-v2-domain';
import { BatteryCapabilityPreflightStatus } from './battery-capability-preflight.types';

export const BatteryCapabilityRefreshTrigger = {
  DIMO_INTEGRATION: 'DIMO_INTEGRATION',
  PROVIDER_CHANGE: 'PROVIDER_CHANGE',
  VEHICLE_REGISTRATION: 'VEHICLE_REGISTRATION',
  PERIODIC: 'PERIODIC',
  SIGNAL_LOSS: 'SIGNAL_LOSS',
  MANUAL_ADMIN: 'MANUAL_ADMIN',
} as const;

export type BatteryCapabilityRefreshTrigger =
  (typeof BatteryCapabilityRefreshTrigger)[keyof typeof BatteryCapabilityRefreshTrigger];

export interface CapabilityLifecycleExistingState {
  status: BatteryCapabilityStatus;
  capabilityVersion: number;
  consecutiveLossCount: number;
  degradedAt: Date | null;
  lastValue: number | null;
}

export interface CapabilityLifecycleTransition {
  status: BatteryCapabilityStatus;
  capabilityVersion: number;
  consecutiveLossCount: number;
  degradedAt: Date | null;
  statusChanged: boolean;
  lifecycleReason: string;
}

export interface CapabilityLifecyclePolicy {
  lossThreshold: number;
  degradedGraceMs: number;
}

export const DEFAULT_CAPABILITY_LIFECYCLE_POLICY: CapabilityLifecyclePolicy = {
  lossThreshold: 3,
  degradedGraceMs: 24 * 60 * 60 * 1000,
};

const OPERATIONAL_STATUSES = new Set<BatteryCapabilityStatus>([
  BatteryCapabilityStatus.AVAILABLE,
  BatteryCapabilityStatus.AVAILABLE_STALE,
  BatteryCapabilityStatus.AVAILABLE_NULL,
  BatteryCapabilityStatus.DEGRADED,
]);

function isHealthyPreflight(
  preflightStatus: BatteryCapabilityPreflightStatus,
): boolean {
  return (
    preflightStatus === BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA ||
    preflightStatus === BatteryCapabilityPreflightStatus.STALE ||
    preflightStatus === BatteryCapabilityPreflightStatus.AVAILABLE_BUT_NULL
  );
}

function isSignalLossPreflight(
  preflightStatus: BatteryCapabilityPreflightStatus,
): boolean {
  return preflightStatus === BatteryCapabilityPreflightStatus.NOT_LISTED;
}

function wasOperational(existing: CapabilityLifecycleExistingState): boolean {
  if (OPERATIONAL_STATUSES.has(existing.status)) {
    return true;
  }
  return (
    existing.status === BatteryCapabilityStatus.UNAVAILABLE &&
    existing.lastValue != null
  );
}

function mapPreflightToBaseStatus(
  preflightStatus: BatteryCapabilityPreflightStatus,
): BatteryCapabilityStatus {
  switch (preflightStatus) {
    case BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA:
      return BatteryCapabilityStatus.AVAILABLE;
    case BatteryCapabilityPreflightStatus.AVAILABLE_BUT_NULL:
      return BatteryCapabilityStatus.AVAILABLE_NULL;
    case BatteryCapabilityPreflightStatus.STALE:
      return BatteryCapabilityStatus.AVAILABLE_STALE;
    case BatteryCapabilityPreflightStatus.NOT_LISTED:
      return BatteryCapabilityStatus.NOT_LISTED;
    case BatteryCapabilityPreflightStatus.QUERY_ERROR:
    default:
      return BatteryCapabilityStatus.QUERY_ERROR;
  }
}

export function applyCapabilityLifecycle(
  existing: CapabilityLifecycleExistingState | null,
  preflightStatus: BatteryCapabilityPreflightStatus,
  checkedAt: Date,
  policy: CapabilityLifecyclePolicy = DEFAULT_CAPABILITY_LIFECYCLE_POLICY,
): CapabilityLifecycleTransition {
  if (preflightStatus === BatteryCapabilityPreflightStatus.QUERY_ERROR) {
    return {
      status: BatteryCapabilityStatus.QUERY_ERROR,
      capabilityVersion: existing?.capabilityVersion ?? 1,
      consecutiveLossCount: existing?.consecutiveLossCount ?? 0,
      degradedAt: existing?.degradedAt ?? null,
      statusChanged: existing?.status !== BatteryCapabilityStatus.QUERY_ERROR,
      lifecycleReason: 'provider_query_error',
    };
  }

  if (!existing) {
    const status = mapPreflightToBaseStatus(preflightStatus);
    return {
      status,
      capabilityVersion: 1,
      consecutiveLossCount: 0,
      degradedAt: null,
      statusChanged: true,
      lifecycleReason: 'initial_preflight',
    };
  }

  if (isHealthyPreflight(preflightStatus)) {
    const recovered =
      existing.status === BatteryCapabilityStatus.DEGRADED ||
      existing.status === BatteryCapabilityStatus.UNAVAILABLE;
    const status = mapPreflightToBaseStatus(preflightStatus);
    const statusChanged = recovered || existing.status !== status;

    return {
      status,
      capabilityVersion: statusChanged
        ? existing.capabilityVersion + 1
        : existing.capabilityVersion,
      consecutiveLossCount: 0,
      degradedAt: null,
      statusChanged,
      lifecycleReason: recovered ? 'signal_recovered' : 'preflight_refresh',
    };
  }

  if (
    isSignalLossPreflight(preflightStatus) &&
    wasOperational(existing)
  ) {
    const nextLossCount = existing.consecutiveLossCount + 1;
    const graceExpired =
      existing.degradedAt != null &&
      checkedAt.getTime() - existing.degradedAt.getTime() >= policy.degradedGraceMs;
    const escalate =
      existing.status === BatteryCapabilityStatus.DEGRADED &&
      (nextLossCount >= policy.lossThreshold || graceExpired);

    if (escalate) {
      return {
        status: BatteryCapabilityStatus.UNAVAILABLE,
        capabilityVersion: existing.capabilityVersion + 1,
        consecutiveLossCount: nextLossCount,
        degradedAt: existing.degradedAt,
        statusChanged: existing.status !== BatteryCapabilityStatus.UNAVAILABLE,
        lifecycleReason: graceExpired
          ? 'signal_loss_grace_expired'
          : 'signal_loss_threshold',
      };
    }

    const enteringDegraded = existing.status !== BatteryCapabilityStatus.DEGRADED;
    return {
      status: BatteryCapabilityStatus.DEGRADED,
      capabilityVersion: enteringDegraded
        ? existing.capabilityVersion + 1
        : existing.capabilityVersion,
      consecutiveLossCount: nextLossCount,
      degradedAt: existing.degradedAt ?? checkedAt,
      statusChanged:
        enteringDegraded || existing.consecutiveLossCount !== nextLossCount,
      lifecycleReason: enteringDegraded ? 'signal_loss_degraded' : 'signal_loss_persisting',
    };
  }

  const status = mapPreflightToBaseStatus(preflightStatus);
  const statusChanged = existing.status !== status;
  return {
    status,
    capabilityVersion: statusChanged
      ? existing.capabilityVersion + 1
      : existing.capabilityVersion,
    consecutiveLossCount: existing.consecutiveLossCount,
    degradedAt: existing.degradedAt,
    statusChanged,
    lifecycleReason: 'preflight_refresh',
  };
}

export function isCapabilityMeasurementEnabled(
  status: BatteryCapabilityStatus,
): boolean {
  return (
    status === BatteryCapabilityStatus.AVAILABLE ||
    status === BatteryCapabilityStatus.AVAILABLE_STALE ||
    status === BatteryCapabilityStatus.AVAILABLE_NULL
  );
}
