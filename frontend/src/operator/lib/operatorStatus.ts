import type { StatusTone } from '../../components/patterns';
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import {
  buildOperatorVehicleRuntimeState,
  runtimeHasOpenCleaningReason,
  runtimeHealthAttentionReasons,
} from './operatorVehicleRuntime';

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

/** Derive display badges from canonical vehicle runtime state only. */
export function deriveVehicleOperatorStatuses(
  vehicle: VehicleData,
  health?: VehicleHealthResponse | null,
  openTaskCount = 0,
): OperatorStatusBadge[] {
  const runtime = buildOperatorVehicleRuntimeState({ vehicle, health, locale: 'de' });
  const badges: OperatorStatusBadge[] = [];

  if (runtime.operationalStatus === 'unknown') {
    badges.push(badge('maintenance', 'neutral', 'Status nicht verfügbar'));
    return badges;
  }

  if (runtime.isBlocked) {
    badges.push(badge('blocked', 'critical'));
  }

  if (runtimeHasOpenCleaningReason(runtime)) {
    badges.push(badge('cleaning', 'watch'));
  }

  if (runtime.isMaintenance) {
    badges.push(badge('maintenance', 'watch'));
  } else if (runtime.operationalStatus === 'active_rented') {
    badges.push(badge('rented', 'info'));
  } else if (runtime.operationalStatus === 'reserved') {
    badges.push(badge('reserved', 'info'));
  }

  const healthAttention = runtimeHealthAttentionReasons(runtime);
  if (healthAttention.length > 0) {
    const critical = healthAttention.some((reason) => reason.severity === 'critical');
    badges.push(badge('damage', critical ? 'critical' : 'watch'));
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

  if (runtime.isReadyToRent) {
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
