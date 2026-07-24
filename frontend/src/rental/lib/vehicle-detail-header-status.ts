import type { StatusTone } from '../../components/patterns';
import type { VehicleData } from '../data/vehicles';
import type { useEffectiveHealth } from '../FleetContext';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import {
  mapCanonicalOperationalStatusToEditStatus,
  selectOperationalStatus,
  type VehicleOperationalEditStatus,
} from './vehicle-operational-state';

/** @deprecated Use VehicleOperationalEditStatus from vehicle-operational-state */
export type VehicleOperationalUiStatus = VehicleOperationalEditStatus;

export function deriveVehicleDetailHeaderEditStatus(
  vehicle: Pick<VehicleData, 'status' | 'operationalState' | 'maintenanceReasonCode'>,
): VehicleOperationalEditStatus {
  return mapCanonicalOperationalStatusToEditStatus(selectOperationalStatus(vehicle));
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
