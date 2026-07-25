import type { StatusTone } from '../../components/patterns';
import type { VehicleHealthResponse, RentalHealthModule, RentalHealthState } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import { derivePickupGate, deriveReturnGate } from './operatorData';
import type { TodayBookingApiRow } from '../../rental/components/dashboard/dashboardTypes';
import {
  buildOperatorVehicleRuntimeState,
  runtimeContradictionMessages,
  runtimeHasOpenCleaningReason,
} from './operatorVehicleRuntime';
import type { VehicleRuntimeState } from '../../rental/components/dashboard/runtime/dashboardRuntimeTypes';

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
  runtime: VehicleRuntimeState;
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

function mapRuntimeToPrimaryStatus(runtime: VehicleRuntimeState): OperatorPrimaryStatus {
  if (runtime.operationalStatus === 'unknown') return 'review_required';
  if (runtime.isBlocked || runtime.rentalReadiness === 'blocked') return 'blocked';
  if (runtime.isMaintenance || runtime.operationalStatus === 'maintenance') {
    return runtime.blockLevel === 'hard_blocked' ? 'out_of_service' : 'in_service';
  }
  if (
    runtime.operationalStatus === 'active_rented' ||
    runtime.operationalStatus === 'reserved'
  ) {
    return 'rented';
  }
  if (runtime.isReadyToRent) return 'ready';
  return 'review_required';
}

function mapRuntimeToReleaseDecision(runtime: VehicleRuntimeState): OperatorReleaseDecision {
  if (runtime.operationalStatus === 'unknown') return 'unavailable';
  if (runtime.isBlocked) return 'no';
  if (runtime.isMaintenance) return 'no';
  if (runtime.operationalStatus === 'active_rented') return 'no';
  if (runtime.operationalStatus === 'reserved') return 'review';
  if (runtime.isReadyToRent) return 'yes';
  return 'review';
}

function releaseTone(decision: OperatorReleaseDecision): StatusTone {
  if (decision === 'yes') return 'success';
  if (decision === 'no') return 'critical';
  if (decision === 'unavailable') return 'neutral';
  return 'watch';
}

function primaryToneForStatus(status: OperatorPrimaryStatus, runtime: VehicleRuntimeState): StatusTone {
  if (status === 'ready') return 'success';
  if (status === 'blocked' || status === 'out_of_service') return 'critical';
  if (status === 'in_service') return 'watch';
  if (status === 'rented') return 'info';
  if (runtime.isWarning) return 'watch';
  return 'neutral';
}

export function deriveOperatorVehicleStatusSnapshot(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
  healthKnown: boolean,
): OperatorVehicleStatusSnapshot {
  const runtime = buildOperatorVehicleRuntimeState({
    vehicle,
    health: health ?? undefined,
    locale: 'de',
  });
  const contradictions = healthKnown ? runtimeContradictionMessages(runtime) : [];
  const primaryStatus = mapRuntimeToPrimaryStatus(runtime);
  const releaseDecision = healthKnown ? mapRuntimeToReleaseDecision(runtime) : 'unavailable';

  return {
    primaryStatus,
    primaryLabel: PRIMARY_STATUS_LABELS[primaryStatus],
    primaryTone: primaryToneForStatus(primaryStatus, runtime),
    releaseDecision,
    releaseLabel: RELEASE_LABELS[releaseDecision],
    releaseTone: releaseTone(releaseDecision),
    contradictions,
    healthAvailable: healthKnown,
    runtime,
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

  const runtime = buildOperatorVehicleRuntimeState({
    vehicle,
    health: health ?? undefined,
    locale: 'de',
  });

  if (filter === 'blocked') return runtime.isBlocked;
  if (filter === 'rented') {
    return (
      runtime.operationalStatus === 'active_rented' ||
      runtime.operationalStatus === 'reserved'
    );
  }
  if (filter === 'service') return runtime.isMaintenance;
  if (filter === 'open_work') {
    return openTaskCount > 0 || runtimeHasOpenCleaningReason(runtime);
  }
  if (filter === 'ready') {
    return healthKnown && runtime.isReadyToRent;
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
