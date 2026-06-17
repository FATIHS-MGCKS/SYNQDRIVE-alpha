export type DashboardWarningProvider = 'HIGH_MOBILITY' | 'DIMO' | 'NONE' | 'UNKNOWN';

export type DashboardConnectionStatus =
  | 'connected'
  | 'not_connected'
  | 'provider_error'
  | 'unknown';

export type DashboardSupportStatus =
  | 'supported'
  | 'not_supported'
  | 'unknown'
  | 'not_connected'
  | 'no_data';

export type DashboardFreshness =
  | 'fresh'
  | 'aging'
  | 'stale'
  | 'no_data'
  | 'error';

export type DashboardOverallStatus = 'good' | 'warning' | 'critical' | 'unknown';

export type DashboardWarningLightState =
  | 'active'
  | 'off_confirmed'
  | 'no_event_yet'
  | 'unsupported'
  | 'stale'
  | 'error';

export type DashboardWarningSeverity = 'info' | 'warning' | 'critical' | 'unknown';

export type DashboardRentalImpact =
  | 'none'
  | 'watch'
  | 'inspect_before_next_rental'
  | 'block_rental';

export interface DashboardWarningLight {
  key: string;
  label: string;
  state: DashboardWarningLightState;
  severity: DashboardWarningSeverity;
  supported: boolean | null;
  observedAt: string | null;
  sourceSignal: string | null;
  sourceTimestamp: string | null;
  rawValue?: unknown;
  reason: string;
  action: string;
  rentalImpact: DashboardRentalImpact;
}

export interface DashboardWarningLightsResponse {
  vehicleId: string;
  provider: DashboardWarningProvider;
  connectionStatus: DashboardConnectionStatus;
  supportStatus: DashboardSupportStatus;
  freshness: DashboardFreshness;
  overallStatus: DashboardOverallStatus;
  lastObservedAt: string | null;
  message: string;
  lights: DashboardWarningLight[];
  /** Reserved for RentalHealth vehicle_alerts — same canonical truth. */
  rentalHealthReady: boolean;
}

export interface HmSignalEntry {
  value: unknown;
  unit?: string | null;
  timestamp?: string | null;
}
