import type { CleaningStatus, VehicleStatus } from '@prisma/client';
import type { FleetDataQualityState, FleetOperationalStatusToken } from '@modules/vehicles/operational/fleet-operational-state.util';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';

export const VEHICLE_RUNTIME_STATE_VERSION = 1 as const;

export type VehicleRuntimeOperationalStatus =
  | 'available'
  | 'reserved'
  | 'active_rented'
  | 'maintenance'
  | 'unavailable'
  | 'unknown';

export type VehicleRuntimeTelemetryState =
  | 'live'
  | 'standby'
  | 'soft_offline'
  | 'offline'
  | 'unknown';

export type VehicleRuntimeRentalReadiness = 'ready' | 'not_ready' | 'blocked';

export interface VehicleRuntimeTelemetrySnapshot {
  lastSignalAt: string | null;
  signalAgeMs: number | null;
}

export interface VehicleRuntimeOperationalSnapshot {
  token: FleetOperationalStatusToken;
  reason: string | null;
  dataQualityState: FleetDataQualityState;
  dataQualityReasons: string[];
  isReliable: boolean;
  maintenanceReason: string | null;
}

/**
 * Canonical per-vehicle runtime input for station KPI projection.
 * Must be assembled from the fleet operational engine + rental health —
 * never from raw `Vehicle.status` alone.
 */
export interface VehicleRuntimeProjectionInput {
  vehicleId: string;
  vehicleStatus: VehicleStatus;
  cleaningStatus: CleaningStatus;
  operational: VehicleRuntimeOperationalSnapshot | null;
  telemetry: VehicleRuntimeTelemetrySnapshot | null;
  health: VehicleHealth | null;
}

export interface VehicleRuntimeProjectionFlags {
  known: boolean;
  operationalStatus: VehicleRuntimeOperationalStatus;
  rentalReadiness: VehicleRuntimeRentalReadiness;
  telemetryState: VehicleRuntimeTelemetryState;
  isReadyForRenting: boolean;
  isNotReady: boolean;
  isBlockedOrMaintenance: boolean;
  isCritical: boolean;
  isWarning: boolean;
  isTelemetryOffline: boolean;
  hasComplianceBlocker: boolean;
  hasHealthWarning: boolean;
}

export interface VehicleRuntimeProjectionOptions {
  evaluatedAt: string;
  telemetrySoftOfflineHours?: number;
  telemetryHardOfflineHours?: number;
}
