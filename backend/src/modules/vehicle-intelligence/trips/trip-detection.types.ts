export const TRIP_TRACKING_TRIGGERS = {
  POSSIBLE_START: 'POSSIBLE_START',
  ACTIVE_TICK: 'ACTIVE_TICK',
  POSSIBLE_END_CHECK: 'POSSIBLE_END_CHECK',
  END_VALIDATION: 'END_VALIDATION',
  FINALIZE: 'FINALIZE',
} as const;

export type TripTrackingTrigger =
  (typeof TRIP_TRACKING_TRIGGERS)[keyof typeof TRIP_TRACKING_TRIGGERS];

export interface TripTrackingJobData {
  vehicleId: string;
  organizationId: string | null;
  dimoTokenId: number;
  trigger: TripTrackingTrigger;
  requestedAt: string;
}

export const START_DETECTION_MODES = {
  IGNITION_PRIMARY: 'IGNITION_PRIMARY',
  MOTION_PRIMARY: 'MOTION_PRIMARY',
  RPM_VALIDATED: 'RPM_VALIDATED',
  GPS_ODOMETER_FALLBACK: 'GPS_ODOMETER_FALLBACK',
  FREQUENCY_FALLBACK: 'FREQUENCY_FALLBACK',
  COMPOSITE_MULTI_SIGNAL: 'COMPOSITE_MULTI_SIGNAL',
  // Continuation trip created by a mid-trip gap split (vehicle was off for a
  // few minutes, then restarted). Used by both the live FSM (detected in
  // processActiveTick) and the retroactive reconciliation (IntraTripGap
  // repair scan). Complement to END_DETECTION_MODES.MID_TRIP_GAP_SPLIT.
  MID_TRIP_GAP_SPLIT: 'MID_TRIP_GAP_SPLIT',
} as const;

export type StartDetectionMode =
  (typeof START_DETECTION_MODES)[keyof typeof START_DETECTION_MODES];

export const END_DETECTION_MODES = {
  // ClickHouse segment end (ignition OFF / motion STOP) — first-instance assist; FSM/CUSUM fallback
  CLICKHOUSE_END_ASSIST: 'CLICKHOUSE_END_ASSIST',
  // Primary end evidence (no ignition-off required)
  CUSUM_VALIDATED: 'CUSUM_VALIDATED',           // Highest priority: CUSUM change-point detected
  FREQUENCY_DROP_TIMEOUT: 'FREQUENCY_DROP_TIMEOUT', // Signal frequency dropped to resting level
  NO_ACTIVITY_TIMEOUT: 'NO_ACTIVITY_TIMEOUT',   // No meaningful activity for extended period
  COMPOSITE_INACTIVITY: 'COMPOSITE_INACTIVITY', // Multiple inactivity signals composite
  // Secondary/bonus evidence
  IGNITION_OFF_CONFIRMED: 'IGNITION_OFF_CONFIRMED', // Ignition-off arrived AND signals confirm end
  IGNITION_OFF_GAP: 'IGNITION_OFF_GAP',         // Legacy: full inactivity + ignition off (kept for compat)
  // Mid-trip split: the vehicle stopped, sat idle (engine off) for a few
  // minutes, then was re-started. For providers where the ignition-off signal
  // never reaches us (DIMO drops the connection when the telematics unit
  // sleeps), a sustained silence while stationary is strong evidence the
  // previous trip actually ended and a new trip began. Complements
  // START_DETECTION_MODES.MID_TRIP_GAP_SPLIT on the new trip.
  MID_TRIP_GAP_SPLIT: 'MID_TRIP_GAP_SPLIT',
} as const;

export type EndDetectionMode =
  (typeof END_DETECTION_MODES)[keyof typeof END_DETECTION_MODES];

export interface SnapshotEvidenceSignals {
  isIgnitionOn: boolean | null;
  speedKmh: number | null;
  engineLoad: number | null;
  /** kW from powertrainTractionBatteryCurrentPower (W→kW). + = into battery, − = motoring */
  tractionBatteryPowerKw: number | null;
  latitude: number | null;
  longitude: number | null;
  odometerKm: number | null;
  fuelLevelAbsolute: number | null;
  evSoc: number | null;
}

export interface TripStartEvaluation {
  shouldStartTracking: boolean;
  reason?: string;
  startDetectionMode?: StartDetectionMode;
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceSummary?: Record<string, unknown>;
}

export interface WorkerLockResult {
  acquired: boolean;
  runToken: string;
}
