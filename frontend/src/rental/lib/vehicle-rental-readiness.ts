import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import {
  isBackendOperationalDataQualityReliable,
  type RentalReadinessOperationalBlock,
} from '../components/dashboard/runtime/rentalReadiness';
import {
  selectOperationalStatus,
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';
import {
  hasHardRentalBlockingReasons,
  isRentalHealthCritical,
} from './vehicle-rental-health-blockers';
import { resolveTelemetryFreshness } from './telemetryFreshness';

export type CrossSurfaceRentalReadiness =
  | 'ready'
  | 'not_ready'
  | 'blocked'
  | 'active'
  | 'reserved'
  | 'maintenance'
  | 'unknown';

export interface CrossSurfaceRentalReadinessResult {
  readiness: CrossSurfaceRentalReadiness;
  /** Aligns with dashboard `isReadyToRent` and fleet `rentalDisplay.status === 'ready'`. */
  isReadyToRent: boolean;
  isHardBlocked: boolean;
  isCleaningBlocked: boolean;
  isTelemetryBlocked: boolean;
  isHealthWarningOnly: boolean;
}

function operationalBlockFromVehicle(vehicle: VehicleData): RentalReadinessOperationalBlock {
  return {
    canonicalStatus: selectOperationalStatus(vehicle),
    backendDataQualityState:
      vehicle.operationalState?.dataQualityState ?? vehicle.dataQualityState ?? null,
    isReliable: vehicle.operationalState?.isReliable ?? vehicle.isReliable ?? true,
  };
}

/**
 * Single cross-surface rental readiness resolver.
 * Warning health alone never blocks; service-only overdue never hard-blocks;
 * cleaning blocks readiness but not operational status; offline/no_signal blocks readiness.
 */
export function resolveCrossSurfaceRentalReadiness(
  vehicle: Pick<VehicleData, 'cleaningStatus' | 'healthStatus' | 'operationalState' | 'dataQualityState' | 'isReliable' | 'status' | 'bookingContext' | 'signalAgeMs' | 'lastSignal' | 'onlineStatus'>,
  options: {
    rentalHealth?: VehicleHealthResponse | null;
    now?: number;
  } = {},
): CrossSurfaceRentalReadinessResult {
  const rentalHealth = options.rentalHealth ?? null;
  const now = options.now ?? Date.now();
  const operationalStatus = selectOperationalStatus(vehicle);
  const operationalBlock = operationalBlockFromVehicle(vehicle as VehicleData);
  const isHardBlocked = hasHardRentalBlockingReasons(rentalHealth);
  const cleaningStatus = vehicle.cleaningStatus ?? 'Clean';
  const isCleaningBlocked = cleaningStatus !== 'Clean';
  const telemetry = resolveTelemetryFreshness(vehicle, { now });
  const isTelemetryBlocked = telemetry.isOffline || telemetry.isNoSignal;
  const isHealthWarningOnly =
    isRentalHealthCritical(vehicle, rentalHealth) === false &&
    (rentalHealth?.overall_state === 'warning' || vehicle.healthStatus === 'Warning');

  if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED) {
    return {
      readiness: 'active',
      isReadyToRent: false,
      isHardBlocked,
      isCleaningBlocked,
      isTelemetryBlocked,
      isHealthWarningOnly,
    };
  }

  if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.RESERVED) {
    return {
      readiness: 'reserved',
      isReadyToRent: false,
      isHardBlocked,
      isCleaningBlocked,
      isTelemetryBlocked,
      isHealthWarningOnly,
    };
  }

  if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE) {
    return {
      readiness: 'maintenance',
      isReadyToRent: false,
      isHardBlocked,
      isCleaningBlocked,
      isTelemetryBlocked,
      isHealthWarningOnly,
    };
  }

  if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.BLOCKED || isHardBlocked) {
    return {
      readiness: 'blocked',
      isReadyToRent: false,
      isHardBlocked: true,
      isCleaningBlocked,
      isTelemetryBlocked,
      isHealthWarningOnly,
    };
  }

  if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.UNKNOWN) {
    return {
      readiness: 'unknown',
      isReadyToRent: false,
      isHardBlocked,
      isCleaningBlocked,
      isTelemetryBlocked,
      isHealthWarningOnly,
    };
  }

  const dataReliable = isBackendOperationalDataQualityReliable(operationalBlock);
  const degradedUnknown =
    operationalBlock.backendDataQualityState === VEHICLE_DATA_QUALITY_STATE.DEGRADED &&
    !operationalBlock.isReliable;

  if (!dataReliable || degradedUnknown) {
    return {
      readiness: 'not_ready',
      isReadyToRent: false,
      isHardBlocked,
      isCleaningBlocked,
      isTelemetryBlocked,
      isHealthWarningOnly,
    };
  }

  if (isCleaningBlocked || isTelemetryBlocked) {
    return {
      readiness: 'not_ready',
      isReadyToRent: false,
      isHardBlocked,
      isCleaningBlocked,
      isTelemetryBlocked,
      isHealthWarningOnly,
    };
  }

  return {
    readiness: 'ready',
    isReadyToRent: true,
    isHardBlocked: false,
    isCleaningBlocked: false,
    isTelemetryBlocked: false,
    isHealthWarningOnly,
  };
}

export function crossSurfaceRentalReadinessToFleetAvailability(
  readiness: CrossSurfaceRentalReadiness,
): 'ready' | 'not_ready' | 'active' | 'reserved' | 'maintenance' | 'blocked' {
  switch (readiness) {
    case 'ready':
      return 'ready';
    case 'active':
      return 'active';
    case 'reserved':
      return 'reserved';
    case 'maintenance':
      return 'maintenance';
    case 'blocked':
      return 'blocked';
    case 'unknown':
    case 'not_ready':
    default:
      return 'not_ready';
  }
}
