import type { StatusTone } from '../../components/patterns';
import type { VehicleData } from '../data/vehicles';
import type { useEffectiveHealth } from '../FleetContext';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import {
  selectOperationalStatus,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';

/** Editable operational states in the Vehicle Detail header dropdown. */
export type VehicleOperationalUiStatus = 'Available' | 'Manual Block' | 'Maintenance';

export function deriveVehicleDetailHeaderEditStatus(
  vehicle: Pick<VehicleData, 'status' | 'operationalState' | 'maintenanceReasonCode'>,
): VehicleOperationalUiStatus {
  const operational = selectOperationalStatus(vehicle);

  switch (operational) {
    case VEHICLE_OPERATIONAL_STATUS.MAINTENANCE:
      return 'Maintenance';
    case VEHICLE_OPERATIONAL_STATUS.BLOCKED:
      return 'Manual Block';
    case VEHICLE_OPERATIONAL_STATUS.UNKNOWN:
      // Fail-closed — never imply availability for unknown operational state.
      return 'Manual Block';
    case VEHICLE_OPERATIONAL_STATUS.AVAILABLE:
    case VEHICLE_OPERATIONAL_STATUS.RESERVED:
    case VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED:
    default:
      return 'Available';
  }
}

export function resolveVehicleDetailHeaderReadinessChip(
  vehicle: VehicleData,
  rentalHealth: ReturnType<typeof useEffectiveHealth>['health'],
  locale: string,
): {
  label: string;
  tone: StatusTone;
  supplement: string | null;
  supplementDetail: string | null;
  statusBadge: ReturnType<typeof resolveFleetVehicleDisplayState>['statusBadge'];
} {
  const display = resolveFleetVehicleDisplayState(vehicle, {
    rentalHealth,
    locale,
    compact: false,
  });
  const { statusBadge, bookingSupplement } = display;

  return {
    label: statusBadge.label,
    tone: statusBadge.tone,
    supplement:
      statusBadge.unreliableExplanation ??
      bookingSupplement?.short ??
      statusBadge.dataQualityHint,
    supplementDetail:
      statusBadge.unreliableExplanation ??
      bookingSupplement?.detail ??
      statusBadge.dataQualityHint,
    statusBadge,
  };
}
