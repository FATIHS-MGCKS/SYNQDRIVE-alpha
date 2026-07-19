import type { VehicleConnectivityRuntimeStateDto } from './connectivity/vehicle-connectivity-runtime-state.dto';
import type {
  FleetConnectivityKpiSummaryDto,
  FleetConnectivityListItemDto,
} from './fleet-connectivity-api.types';

export type FleetConnectionStatus =
  | 'online'
  | 'standby'
  | 'signal_delayed'
  | 'offline'
  | 'not_connected';

export type FleetSignalAvailability = 'available' | 'missing' | 'unknown';

export type FleetReadinessLevel = 'good' | 'watch' | 'warning' | 'no_data';

export type FleetDataCoverageState =
  | 'GOOD'
  | 'PARTIAL'
  | 'INSUFFICIENT'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type FleetDataCoverageReasonCode =
  | 'DATA_COVERAGE_PARTIAL'
  | 'DATA_COVERAGE_INSUFFICIENT'
  | 'SIGNAL_NOT_APPLICABLE'
  | 'TELEMETRY_STALE'
  | 'NO_TELEMETRY_SNAPSHOT'
  | 'CAPABILITY_UNKNOWN'
  | 'PROVIDER_CHANGED';

export interface FleetConnectivityThresholds {
  onlineMaxMinutes: number;
  standbyMaxHours: number;
  signalDelayedMaxHours: number;
}

export interface FleetConnectivitySignals {
  gps: FleetSignalAvailability;
  odometer: FleetSignalAvailability;
  speed: FleetSignalAvailability;
  fuel: FleetSignalAvailability;
  evSoc: FleetSignalAvailability;
  dtc: FleetSignalAvailability;
  obdPlug: FleetSignalAvailability;
  jamming: FleetSignalAvailability;
}

export interface FleetConnectivityJammingSnapshot {
  detectedAt: string | null;
  where: string | null;
  lastKnownAddress: string | null;
  /** Not a historical incident log — derived from latest telemetry snapshot only. */
  isSnapshotIndication: true;
}

export type DeviceConnectionStatus = 'plugged' | 'unplugged' | 'unknown';
export type DeviceConnectionSeverity = 'info' | 'warning' | 'critical';

/** Explicit DIMO webhook device connection evidence (distinct from snapshot obdIsPluggedIn / offline). */
export interface FleetDeviceConnectionDto {
  lastDeviceUnpluggedAt: string | null;
  lastDevicePluggedInAt: string | null;
  currentDeviceConnectionStatus: DeviceConnectionStatus;
  openUnpluggedEpisode: boolean;
  openUnpluggedSince: string | null;
  openUnpluggedDurationMs: number | null;
  severity: DeviceConnectionSeverity | null;
  rentalRelevant: boolean;
  duringActiveBooking: boolean;
  eventSource: 'dimo_webhook' | 'none';
}

export interface FleetConnectivityVehicleDto {
  vehicleId: string;
  vin: string;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  station: string | null;
  provider: string;
  connectionType: string;
  sourceType: string | null;
  connectionStatus: FleetConnectionStatus;
  /** Canonical telemetry freshness — same vocabulary as runtime state builder. */
  telemetryFreshness:
    | 'live'
    | 'standby'
    | 'signal_delayed'
    | 'offline'
    | 'no_signal';
  statusNote: string;
  lastSeenAt: string | null;
  lastSyncedAt: string | null;
  freshnessLabel: string;
  pairedAt: string | null;
  hasTelemetry: boolean;
  odometerKm: number | null;
  latitude: number | null;
  longitude: number | null;
  obdIsPluggedIn: boolean | null;
  jammingDetectedCount: number;
  jammingSnapshotNote: string | null;
  jammingIncidents: FleetConnectivityJammingSnapshot[];
  maskedDeviceSerial: string | null;
  maskedDimoTokenId: string | null;
  maskedSyntheticTokenId: string | null;
  /** @deprecated Use coverageState — transitional alias derived from coverage. */
  readinessScore: number;
  /** @deprecated Use coverageState — transitional alias derived from coverage. */
  readinessLevel: FleetReadinessLevel;
  /** @deprecated Use coveragePercent — transitional alias. */
  signalCoveragePercent: number;
  coverageState: FleetDataCoverageState;
  coveragePercent: number | null;
  expectedSignalCount: number;
  freshSignalCount: number;
  staleSignalCount: number;
  missingSignalCount: number;
  reasonCodes: FleetDataCoverageReasonCode[];
  signals: FleetConnectivitySignals;
  /** @deprecated Use maskedDeviceSerial — kept for transitional clients; value is masked. */
  deviceSerial: string | null;
  /** @deprecated Raw token IDs are never returned — always null. */
  dimoTokenId: null;
  /** @deprecated Use maskedSyntheticTokenId — always null. */
  syntheticTokenId: null;
  /** @deprecated Derive from connectionStatus === 'online'. */
  online: boolean;
  /** Explicit DIMO Vehicle Trigger OBD plug/unplug events — not snapshot/offline. */
  deviceConnection: FleetDeviceConnectionDto | null;
  /** Canonical connectivity runtime — single source of truth for all surfaces. */
  connectivityRuntime: VehicleConnectivityRuntimeStateDto;
}

export interface FleetConnectivitySummary {
  total: number;
  online: number;
  standby: number;
  signalDelayed: number;
  offline: number;
  notConnected: number;
  connected: number;
  withTelemetry: number;
  withoutTelemetry: number;
  obdPluggedIn: number;
  obdUnplugged: number;
  obdNoData: number;
  jammingSnapshotDetected: number;
  deviceUnpluggedOpenEpisodes: number;
  deviceUnpluggedDuringBooking: number;
  avgSignalCoverage: number | null;
  avgReadinessScore: number | null;
}

export interface FleetConnectivityPagination {
  page: number;
  limit: number;
  total: number;
  totalInOrganization: number;
}

export interface FleetConnectivityResponseDto {
  generatedAt: string;
  /** Canonical KPI summary for fleet connectivity UI. */
  summary: FleetConnectivityKpiSummaryDto;
  pagination: FleetConnectivityPagination;
  /** Canonical list contract — preferred for all UI consumers. */
  items: FleetConnectivityListItemDto[];
  /**
   * @deprecated Use `items` — full legacy rows retained for transitional API clients.
   */
  vehicles: FleetConnectivityVehicleDto[];
  /** @deprecated Threshold copy for legacy clients — UI must not derive operational state from this. */
  thresholds?: FleetConnectivityThresholds;
  /** @deprecated Legacy aggregate counts — use `summary` instead. */
  legacySummary?: FleetConnectivitySummary;
}
