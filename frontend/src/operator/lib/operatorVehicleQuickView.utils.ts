import type { StatusTone } from '../../components/patterns';
import type { VehicleHealthResponse, RentalHealthModule, RentalHealthState } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import { derivePickupGate, deriveReturnGate } from './operatorData';
import type { TodayBookingApiRow } from '../../rental/components/dashboard/dashboardTypes';
import { VEHICLE_OPERATIONAL_STATUS } from '../../rental/lib/vehicle-operational-state';
import {
  isOperationalStatusUnreliable,
  resolveUnreliableOperationalStatusDisplay,
} from '../../rental/lib/vehicle-operational-unknown-display';
import { selectOperationalStatus } from '../../rental/lib/vehicle-operational-state';

export type OperatorVehicleFilter =
  | 'all'
  | 'ready'
  | 'blocked'
  | 'rented'
  | 'service'
  | 'open_work';

export type OperatorPrimaryStatus =
  | 'ready'
  | 'blocked'
  | 'rented'
  | 'in_service'
  | 'out_of_service'
  | 'review_required';

export type OperatorReleaseDecision = 'yes' | 'no' | 'review' | 'unavailable';

export interface OperatorVehicleStatusSnapshot {
  primaryStatus: OperatorPrimaryStatus;
  primaryLabel: string;
  primaryTone: StatusTone;
  releaseDecision: OperatorReleaseDecision;
  releaseLabel: string;
  releaseTone: StatusTone;
  contradictions: string[];
  healthAvailable: boolean;
}

export const OPERATOR_VEHICLE_FILTERS: { id: OperatorVehicleFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'ready', label: 'Bereit' },
  { id: 'blocked', label: 'Blockiert' },
  { id: 'rented', label: 'Unterwegs' },
  { id: 'service', label: 'Service' },
  { id: 'open_work', label: 'Aufgabe/Reinigung' },
];

export const PRIMARY_STATUS_LABELS: Record<OperatorPrimaryStatus, string> = {
  ready: 'Bereit',
  blocked: 'Blockiert',
  rented: 'Vermietet',
  in_service: 'In Service',
  out_of_service: 'Außer Betrieb',
  review_required: 'Prüfung erforderlich',
};

export const RELEASE_LABELS: Record<OperatorReleaseDecision, string> = {
  yes: 'Ja',
  no: 'Nein',
  review: 'Prüfung erforderlich',
  unavailable: 'Status nicht verfügbar',
};

export const RENTAL_HEALTH_STATE_LABELS: Record<RentalHealthState, string> = {
  good: 'Gut',
  warning: 'Warnung',
  critical: 'Kritisch',
  unknown: 'Unbekannt',
  n_a: 'N/A',
};

export const HEALTH_MODULE_LABELS: Record<keyof VehicleHealthResponse['modules'], string> = {
  battery: 'Batterie',
  tires: 'Reifen',
  brakes: 'Bremsen',
  error_codes: 'Fehlercodes',
  service_compliance: 'Service',
  complaints: 'Beschwerden',
  vehicle_alerts: 'Fahrzeugalerts',
};

export function isHealthKnownForVehicle(
  vehicleId: string,
  healthMap: Map<string, VehicleHealthResponse>,
  healthLoading: boolean,
  healthError: string | null,
): boolean {
  if (healthLoading) return false;
  if (healthError) return false;
  return healthMap.has(vehicleId);
}

/** Conservative contradiction detection — never infer block from module severity alone. */
export function detectOperatorStatusContradictions(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
): string[] {
  const issues: string[] = [];
  if (!health) return issues;

  if (vehicle.status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE && health.rental_blocked) {
    issues.push('Fahrzeugstatus „Verfügbar“, Rental Health meldet Block.');
  }
  if (vehicle.status === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED && !vehicle.activeBookingId && !vehicle.activeCustomerName) {
    issues.push('Status „Aktiv vermietet“ ohne aktive Buchungsreferenz.');
  }
  if (vehicle.status === VEHICLE_OPERATIONAL_STATUS.RESERVED && !vehicle.reservedBookingId && !vehicle.reservedCustomerName) {
    issues.push('Status „Reserviert“ ohne Reservierungsreferenz.');
  }
  if (vehicle.status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE && vehicle.maintenanceReasonCode === 'OPERATIONAL_BLOCK' && !health.rental_blocked) {
    issues.push('Operativer Wartungsblock ohne rental_blocked in Rental Health.');
  }

  return issues;
}

export function deriveOperatorVehicleStatusSnapshot(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
  healthKnown: boolean,
): OperatorVehicleStatusSnapshot {
  const contradictions = healthKnown ? detectOperatorStatusContradictions(vehicle, health) : [];
  const unreliable = isOperationalStatusUnreliable(vehicle);
  const unreliableDisplay = resolveUnreliableOperationalStatusDisplay(vehicle, { locale: 'de' });

  if (unreliable) {
    return {
      primaryStatus: 'review_required',
      primaryLabel: unreliableDisplay?.badgeLabel ?? PRIMARY_STATUS_LABELS.review_required,
      primaryTone: 'neutral',
      releaseDecision: 'unavailable',
      releaseLabel: RELEASE_LABELS.unavailable,
      releaseTone: 'neutral',
      contradictions,
      healthAvailable: healthKnown,
    };
  }

  if (!healthKnown) {
    return {
      primaryStatus: 'review_required',
      primaryLabel: PRIMARY_STATUS_LABELS.review_required,
      primaryTone: 'watch',
      releaseDecision: 'unavailable',
      releaseLabel: RELEASE_LABELS.unavailable,
      releaseTone: 'watch',
      contradictions,
      healthAvailable: false,
    };
  }

  if (contradictions.length > 0) {
    return {
      primaryStatus: 'review_required',
      primaryLabel: PRIMARY_STATUS_LABELS.review_required,
      primaryTone: 'watch',
      releaseDecision: 'review',
      releaseLabel: RELEASE_LABELS.review,
      releaseTone: 'watch',
      contradictions,
      healthAvailable: true,
    };
  }

  if (health?.rental_blocked) {
    return {
      primaryStatus: 'blocked',
      primaryLabel: PRIMARY_STATUS_LABELS.blocked,
      primaryTone: 'critical',
      releaseDecision: 'no',
      releaseLabel: RELEASE_LABELS.no,
      releaseTone: 'critical',
      contradictions,
      healthAvailable: true,
    };
  }

  const operationalStatus = selectOperationalStatus(vehicle);

  if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE) {
    const outOfService = vehicle.maintenanceReasonCode === 'OPERATIONAL_BLOCK';
    return {
      primaryStatus: outOfService ? 'out_of_service' : 'in_service',
      primaryLabel: PRIMARY_STATUS_LABELS[outOfService ? 'out_of_service' : 'in_service'],
      primaryTone: outOfService ? 'critical' : 'watch',
      releaseDecision: 'no',
      releaseLabel: RELEASE_LABELS.no,
      releaseTone: 'critical',
      contradictions,
      healthAvailable: true,
    };
  }

  if (
    operationalStatus === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED ||
    operationalStatus === VEHICLE_OPERATIONAL_STATUS.RESERVED
  ) {
    return {
      primaryStatus: 'rented',
      primaryLabel: PRIMARY_STATUS_LABELS.rented,
      primaryTone: 'info',
      releaseDecision:
        operationalStatus === VEHICLE_OPERATIONAL_STATUS.RESERVED ? 'review' : 'no',
      releaseLabel:
        operationalStatus === VEHICLE_OPERATIONAL_STATUS.RESERVED
          ? RELEASE_LABELS.review
          : RELEASE_LABELS.no,
      releaseTone:
        operationalStatus === VEHICLE_OPERATIONAL_STATUS.RESERVED ? 'watch' : 'info',
      contradictions,
      healthAvailable: true,
    };
  }

  if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.AVAILABLE) {
    return {
      primaryStatus: 'ready',
      primaryLabel: PRIMARY_STATUS_LABELS.ready,
      primaryTone: 'success',
      releaseDecision: 'yes',
      releaseLabel: RELEASE_LABELS.yes,
      releaseTone: 'success',
      contradictions,
      healthAvailable: true,
    };
  }

  return {
    primaryStatus: 'review_required',
    primaryLabel: PRIMARY_STATUS_LABELS.review_required,
    primaryTone: 'watch',
    releaseDecision: 'review',
    releaseLabel: RELEASE_LABELS.review,
    releaseTone: 'watch',
    contradictions,
    healthAvailable: true,
  };
}

export function vehicleMatchesOperatorFilter(
  filter: OperatorVehicleFilter,
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
  healthKnown: boolean,
  openTaskCount: number,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'blocked') return Boolean(health?.rental_blocked);
  if (filter === 'rented') {
    const status = selectOperationalStatus(vehicle);
    return (
      status === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED ||
      status === VEHICLE_OPERATIONAL_STATUS.RESERVED
    );
  }
  if (filter === 'service') {
    return selectOperationalStatus(vehicle) === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE;
  }
  if (filter === 'open_work') {
    return openTaskCount > 0 || vehicle.cleaningStatus === 'Needs Cleaning';
  }
  if (filter === 'ready') {
    if (!healthKnown || health?.rental_blocked) return false;
    if (isOperationalStatusUnreliable(vehicle)) return false;
    if (selectOperationalStatus(vehicle) !== VEHICLE_OPERATIONAL_STATUS.AVAILABLE) return false;
    if (vehicle.cleaningStatus !== 'Clean') return false;
    return detectOperatorStatusContradictions(vehicle, health).length === 0;
  }
  return true;
}

export function moduleTone(state: RentalHealthState): StatusTone {
  if (state === 'critical') return 'critical';
  if (state === 'warning') return 'watch';
  if (state === 'good') return 'success';
  return 'info';
}

export function formatModuleRow(module: RentalHealthModule | undefined): {
  stateLabel: string;
  reason: string;
  tone: StatusTone;
  stale: boolean;
} {
  if (!module) {
    return { stateLabel: '—', reason: 'Keine Daten', tone: 'neutral', stale: false };
  }
  return {
    stateLabel: RENTAL_HEALTH_STATE_LABELS[module.state] ?? module.state,
    reason: module.reason || '—',
    tone: moduleTone(module.state),
    stale: module.data_stale,
  };
}

export function findVehiclePickupRow(
  vehicleId: string,
  pickups: TodayBookingApiRow[],
  healthMap: Map<string, VehicleHealthResponse>,
): { row: TodayBookingApiRow; gate: ReturnType<typeof derivePickupGate> } | null {
  const row = pickups.find((p) => String(p.vehicleId) === vehicleId && !p.pickupProtocol);
  if (!row) return null;
  return { row, gate: derivePickupGate(row, healthMap) };
}

export function findVehicleReturnRow(
  vehicleId: string,
  returns: TodayBookingApiRow[],
): { row: TodayBookingApiRow; gate: ReturnType<typeof deriveReturnGate> } | null {
  const row = returns.find((r) => String(r.vehicleId) === vehicleId && !r.returnProtocol);
  if (!row) return null;
  return { row, gate: deriveReturnGate(row) };
}

export function formatOperatorDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
