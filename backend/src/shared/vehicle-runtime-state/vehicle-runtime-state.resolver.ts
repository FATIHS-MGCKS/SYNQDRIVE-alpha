import { CleaningStatus } from '@prisma/client';
import type { FleetOperationalStatusToken } from '@modules/vehicles/operational/fleet-operational-state.util';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import {
  VEHICLE_RUNTIME_STATE_VERSION,
  type VehicleRuntimeOperationalStatus,
  type VehicleRuntimeProjectionFlags,
  type VehicleRuntimeProjectionInput,
  type VehicleRuntimeProjectionOptions,
  type VehicleRuntimeRentalReadiness,
  type VehicleRuntimeTelemetryState,
} from './vehicle-runtime-state.contract';

export * from './vehicle-runtime-state.contract';

const MS_MINUTE = 60_000;
const MS_HOUR = 60 * MS_MINUTE;
const TELEMETRY_LIVE_MAX_MS = 15 * MS_MINUTE;
const DEFAULT_SOFT_OFFLINE_HOURS = 24;
const DEFAULT_HARD_OFFLINE_HOURS = 48;

function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function mapOperationalTokenToRuntimeStatus(
  token: FleetOperationalStatusToken,
): VehicleRuntimeOperationalStatus {
  switch (token) {
    case 'AVAILABLE':
      return 'available';
    case 'RESERVED':
      return 'reserved';
    case 'ACTIVE_RENTED':
      return 'active_rented';
    case 'MAINTENANCE':
      return 'maintenance';
    default:
      return 'unknown';
  }
}

export function deriveTelemetryConnectionState(
  telemetry: VehicleRuntimeProjectionInput['telemetry'],
  evaluatedAt: string,
  softOfflineHours: number = DEFAULT_SOFT_OFFLINE_HOURS,
  hardOfflineHours: number = DEFAULT_HARD_OFFLINE_HOURS,
): VehicleRuntimeTelemetryState {
  const nowMs = parseInstant(evaluatedAt);
  if (nowMs == null) return 'unknown';

  const timestampMs = parseInstant(telemetry?.lastSignalAt);
  const ageMs =
    telemetry?.signalAgeMs != null && Number.isFinite(telemetry.signalAgeMs)
      ? Math.max(0, telemetry.signalAgeMs)
      : timestampMs != null
        ? Math.max(0, nowMs - timestampMs)
        : null;

  if (ageMs == null) return 'unknown';
  if (ageMs < TELEMETRY_LIVE_MAX_MS) return 'live';

  const softMs = Math.max(0, softOfflineHours) * MS_HOUR;
  const hardMs = Math.max(softMs, hardOfflineHours * MS_HOUR);
  if (ageMs < softMs) return 'standby';
  if (ageMs < hardMs) return 'soft_offline';
  return 'offline';
}

function isCleaningReady(cleaningStatus: CleaningStatus): boolean {
  return cleaningStatus === CleaningStatus.CLEAN;
}

function isOperationalDataReliable(
  operational: NonNullable<VehicleRuntimeProjectionInput['operational']>,
): boolean {
  if (operational.dataQualityState === 'RELIABLE') return true;
  return operational.dataQualityState == null && operational.isReliable;
}

function isLegalComplianceBlockingText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('tüv') ||
    normalized.includes('tuv') ||
    normalized.includes('bokraft')
  );
}

function categoryFromBlockingReason(reason: string): string {
  if (isLegalComplianceBlockingText(reason)) return 'compliance';
  const normalized = reason.toLowerCase();
  if (normalized.includes('service') || normalized.includes('wartung')) return 'service';
  if (normalized.includes('reifen') || normalized.includes('tire')) return 'tires';
  if (normalized.includes('brems') || normalized.includes('brake')) return 'brakes';
  if (normalized.includes('dtc') || normalized.includes('fehlercode')) return 'dtc';
  if (normalized.includes('battery') || normalized.includes('batterie')) return 'battery';
  return 'rental';
}

function healthHasComplianceBlocker(health: VehicleHealth | null): boolean {
  if (!health) return false;

  if (health.rental_blocked) {
    for (const reason of health.blocking_reasons) {
      if (categoryFromBlockingReason(reason) === 'compliance') return true;
    }
  }

  const complianceModule = health.modules.service_compliance;
  if (
    complianceModule.state === 'critical' &&
    isLegalComplianceBlockingText(complianceModule.reason)
  ) {
    return true;
  }

  return false;
}

function healthHasCriticalSignal(health: VehicleHealth | null): boolean {
  if (!health) return false;
  if (health.overall_state === 'critical') return true;
  if (health.rental_blocked) {
    return health.blocking_reasons.some(
      (reason) => categoryFromBlockingReason(reason) !== 'service',
    );
  }
  return Object.values(health.modules).some((module) => module.state === 'critical');
}

function healthHasWarningSignal(health: VehicleHealth | null): boolean {
  if (!health) return false;
  if (health.overall_state === 'warning') return true;
  return Object.values(health.modules).some((module) => module.state === 'warning');
}

function deriveRentalReadiness(input: {
  operationalStatus: VehicleRuntimeOperationalStatus;
  operational: NonNullable<VehicleRuntimeProjectionInput['operational']>;
  cleaningStatus: CleaningStatus;
  telemetryState: VehicleRuntimeTelemetryState;
  health: VehicleHealth | null;
}): VehicleRuntimeRentalReadiness {
  if (
    input.operationalStatus === 'maintenance' ||
    input.operationalStatus === 'unavailable'
  ) {
    return 'blocked';
  }

  if (input.health?.rental_blocked) {
    const hasHardBlock = input.health.blocking_reasons.some(
      (reason) => categoryFromBlockingReason(reason) !== 'service',
    );
    if (hasHardBlock || input.health.blocking_reasons.length === 0) {
      return 'blocked';
    }
  }

  if (input.telemetryState === 'offline') {
    return 'blocked';
  }

  if (
    input.operationalStatus === 'available' &&
    input.operational.token === 'AVAILABLE' &&
    isOperationalDataReliable(input.operational) &&
    isCleaningReady(input.cleaningStatus)
  ) {
    return 'ready';
  }

  return 'not_ready';
}

export function projectVehicleRuntimeFlags(
  input: VehicleRuntimeProjectionInput,
  options: VehicleRuntimeProjectionOptions,
): VehicleRuntimeProjectionFlags {
  const operational = input.operational;
  if (!operational) {
    return {
      known: false,
      operationalStatus: 'unknown',
      rentalReadiness: 'not_ready',
      telemetryState: 'unknown',
      isReadyForRenting: false,
      isNotReady: false,
      isBlockedOrMaintenance: false,
      isCritical: false,
      isWarning: false,
      isTelemetryOffline: false,
      hasComplianceBlocker: false,
      hasHealthWarning: false,
    };
  }

  const operationalStatus = mapOperationalTokenToRuntimeStatus(operational.token);
  const telemetryState = deriveTelemetryConnectionState(
    input.telemetry,
    options.evaluatedAt,
    options.telemetrySoftOfflineHours,
    options.telemetryHardOfflineHours,
  );
  const rentalReadiness = deriveRentalReadiness({
    operationalStatus,
    operational,
    cleaningStatus: input.cleaningStatus,
    telemetryState,
    health: input.health,
  });

  const isBlockedOrMaintenance =
    rentalReadiness === 'blocked' ||
    operationalStatus === 'maintenance' ||
    operationalStatus === 'unavailable';

  const isReadyForRenting = rentalReadiness === 'ready';

  const isNotReady =
    !isBlockedOrMaintenance &&
    !isReadyForRenting &&
    (operationalStatus === 'available' ||
      operationalStatus === 'reserved' ||
      operationalStatus === 'active_rented' ||
      operationalStatus === 'unknown');

  const hasComplianceBlocker = healthHasComplianceBlocker(input.health);
  const isCritical =
    isBlockedOrMaintenance ||
    hasComplianceBlocker ||
  healthHasCriticalSignal(input.health) ||
    telemetryState === 'offline';

  const hasHealthWarning = healthHasWarningSignal(input.health);
  const isWarning =
    !isCritical &&
    !isBlockedOrMaintenance &&
    (hasHealthWarning ||
      telemetryState === 'soft_offline' ||
      !isCleaningReady(input.cleaningStatus));

  return {
    known: true,
    operationalStatus,
    rentalReadiness,
    telemetryState,
    isReadyForRenting,
    isNotReady,
    isBlockedOrMaintenance,
    isCritical,
    isWarning,
    isTelemetryOffline: telemetryState === 'offline',
    hasComplianceBlocker,
    hasHealthWarning,
  };
}

export function getVehicleRuntimeStateContractMetadata() {
  return {
    version: VEHICLE_RUNTIME_STATE_VERSION,
    resolver: 'vehicle-runtime-state.resolver',
    sourceOfTruth: 'fleet-operational-state + rental-health + telemetry',
  } as const;
}
