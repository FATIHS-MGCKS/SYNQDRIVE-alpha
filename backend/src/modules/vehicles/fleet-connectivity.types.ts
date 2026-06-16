export type FleetConnectionStatus =
  | 'online'
  | 'standby'
  | 'offline'
  | 'not_connected';

export type FleetSignalAvailability = 'available' | 'missing' | 'unknown';

export type FleetReadinessLevel = 'good' | 'watch' | 'warning' | 'no_data';

export interface FleetConnectivityThresholds {
  onlineMaxMinutes: number;
  standbyMaxHours: number;
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
  readinessScore: number;
  readinessLevel: FleetReadinessLevel;
  signalCoveragePercent: number;
  signals: FleetConnectivitySignals;
  /** @deprecated Use maskedDeviceSerial — kept for transitional clients; value is masked. */
  deviceSerial: string | null;
  /** @deprecated Raw token IDs are never returned — always null. */
  dimoTokenId: null;
  /** @deprecated Use maskedSyntheticTokenId — always null. */
  syntheticTokenId: null;
  /** @deprecated Derive from connectionStatus === 'online'. */
  online: boolean;
}

export interface FleetConnectivitySummary {
  total: number;
  online: number;
  standby: number;
  offline: number;
  notConnected: number;
  connected: number;
  withTelemetry: number;
  withoutTelemetry: number;
  obdPluggedIn: number;
  obdUnplugged: number;
  obdNoData: number;
  jammingSnapshotDetected: number;
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
  thresholds: FleetConnectivityThresholds;
  summary: FleetConnectivitySummary;
  pagination: FleetConnectivityPagination;
  vehicles: FleetConnectivityVehicleDto[];
}
