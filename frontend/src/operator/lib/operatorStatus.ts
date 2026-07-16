import type { StatusTone } from '../../components/patterns';
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import {
  selectOperationalStatus,
  VEHICLE_OPERATIONAL_STATUS,
} from '../../rental/lib/vehicle-operational-state';
import { isOperationalStatusUnreliable } from '../../rental/lib/vehicle-operational-unknown-display';

export type OperatorStatusKind =
  | 'ready'
  | 'blocked'
  | 'pickup_due'
  | 'return_due'
  | 'cleaning'
  | 'damage'
  | 'task_open'
  | 'maintenance'
  | 'rented'
  | 'reserved';

export interface OperatorStatusBadge {
  kind: OperatorStatusKind;
  label: string;
  tone: StatusTone;
}

const STATUS_LABELS: Record<OperatorStatusKind, string> = {
  ready: 'Bereit',
  blocked: 'Blockiert',
  pickup_due: 'Abholung',
  return_due: 'Rückgabe',
  cleaning: 'Reinigung',
  damage: 'Schaden',
  task_open: 'Aufgabe offen',
  maintenance: 'Wartung',
  rented: 'Vermietet',
  reserved: 'Reserviert',
};

function badge(kind: OperatorStatusKind, tone: StatusTone, label?: string): OperatorStatusBadge {
  return { kind, label: label ?? STATUS_LABELS[kind], tone };
}

/** Derive display badges from canonical fleet + rental-health data only. */
export function deriveVehicleOperatorStatuses(
  vehicle: VehicleData,
  health?: VehicleHealthResponse | null,
  openTaskCount = 0,
): OperatorStatusBadge[] {
  const badges: OperatorStatusBadge[] = [];
  const operationalStatus = selectOperationalStatus(vehicle);
  const unreliable = isOperationalStatusUnreliable(vehicle);

  if (unreliable) {
    badges.push(badge('maintenance', 'neutral', 'Status nicht verfügbar'));
    return badges;
  }

  if (health?.rental_blocked) {
    badges.push(badge('blocked', 'critical'));
  }

  if (vehicle.cleaningStatus === 'Needs Cleaning') {
    badges.push(badge('cleaning', 'watch'));
  }

  if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE) {
    badges.push(badge('maintenance', 'watch'));
  } else if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED) {
    badges.push(badge('rented', 'info'));
  } else if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.RESERVED) {
    badges.push(badge('reserved', 'info'));
  }

  const modules = health?.modules;
  const hasDamageSignal =
    modules?.complaints?.state === 'critical' ||
    modules?.complaints?.state === 'warning' ||
    modules?.error_codes?.state === 'critical';

  if (hasDamageSignal) {
    badges.push(badge('damage', modules?.complaints?.state === 'critical' ? 'critical' : 'watch'));
  }

  if (openTaskCount > 0) {
    badges.push(
      badge(
        'task_open',
        'info',
        openTaskCount === 1 ? '1 Aufgabe' : `${openTaskCount} Aufgaben`,
      ),
    );
  }

  if (
    badges.length === 0 &&
    operationalStatus === VEHICLE_OPERATIONAL_STATUS.AVAILABLE &&
    !health?.rental_blocked &&
    vehicle.cleaningStatus === 'Clean'
  ) {
    badges.push(badge('ready', 'success'));
  }

  return badges;
}

export function pickupDueBadge(): OperatorStatusBadge {
  return badge('pickup_due', 'info');
}

export function returnDueBadge(): OperatorStatusBadge {
  return badge('return_due', 'info');
}
