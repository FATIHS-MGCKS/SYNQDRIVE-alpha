/**
 * Canonical Driving Intelligence signal mapping (P30).
 *
 * Maps documented DIMO provider signal samples to versioned canonical keys.
 * No detectors, no trip-detection usage — mapping only.
 */
export const CANONICAL_DRIVING_SIGNAL_MAPPING_VERSION = 'canonical-signal-v2';

export const CANONICAL_SIGNAL_PROVIDER_SOURCE = 'DIMO_TELEMETRY';

export type CanonicalDrivingSignalKey =
  | 'engine_rpm'
  | 'throttle_position'
  | 'engine_load'
  | 'engine_torque'
  | 'engine_torque_percent'
  | 'coolant_temperature'
  | 'engine_runtime'
  | 'exterior_temperature'
  | 'altitude'
  | 'heading'
  | 'ev_battery_power'
  | 'transmission_current_gear'
  | 'transmission_selected_gear'
  | 'transmission_temperature'
  | 'transmission_clutch_switch'
  | 'brake_pedal_pressed'
  | 'brake_pedal_position'
  | 'brake_pressure'
  | 'wheel_speed_front_left'
  | 'wheel_speed_front_right'
  | 'wheel_speed_rear_left'
  | 'wheel_speed_rear_right'
  | 'yaw_rate';

export type CanonicalSignalUnit =
  | 'rpm'
  | 'percent'
  | 'celsius'
  | 'second'
  | 'meter'
  | 'degree'
  | 'watt'
  | 'newton_meter'
  | 'gear_index'
  | 'boolean'
  | 'kph'
  | 'kpa'
  | 'degree_per_second';

/** Where the mapped value may be consumed downstream. */
export type CanonicalSignalUsageScope =
  | 'DRIVING_ANALYSIS'
  | 'POST_TRIP_ANALYSIS_CONTEXT';

export type DimoProviderSignalSample = {
  dimoSignalName: string;
  value: unknown;
  /** Provider-declared unit when present — never silently converted if unknown. */
  providerUnit?: string | null;
  /** When the measurement was observed on the vehicle (provider timestamp). */
  observedAt: string | Date;
  /** When SynqDrive received/ingested the sample — distinct from observedAt. */
  receivedAt?: string | Date | null;
};

export type CanonicalSignalMappingContext = {
  fuelType?: string | null;
  /** DIMO signal names with SUPPORTED capability from preflight / persisted probes. */
  supportedDimoSignals: ReadonlySet<string> | readonly string[];
  /** Fallback ingest/receive time for the batch when sample.receivedAt is absent. */
  batchReceivedAt?: Date;
  /** Reference time for staleness — defaults to batchReceivedAt or now. */
  referenceTime?: Date;
  /** When set, observations older than this vs referenceTime are STALE. */
  staleAfterMs?: number;
};

export type CanonicalDrivingSignalMappingSuccess = {
  status: 'SUPPORTED';
  canonicalKey: CanonicalDrivingSignalKey;
  dimoSignalName: string;
  value: number;
  unit: CanonicalSignalUnit;
  observedAt: Date;
  receivedAt: Date;
  providerUnit: string | null;
  usageScope: CanonicalSignalUsageScope;
  tripDetectionEligible: false;
  mappingVersion: string;
  providerSource: typeof CANONICAL_SIGNAL_PROVIDER_SOURCE;
};

export type CanonicalDrivingSignalMappingFailure = {
  status: 'UNSUPPORTED' | 'UNIT_UNKNOWN' | 'INVALID_VALUE' | 'NULL_SAMPLE' | 'STALE';
  canonicalKey?: CanonicalDrivingSignalKey | null;
  dimoSignalName: string;
  reason:
    | 'unknown_dimo_signal'
    | 'capability_not_supported'
    | 'powertrain_not_applicable'
    | 'provider_unit_unknown'
    | 'invalid_numeric_value'
    | 'provider_null_not_observation'
    | 'observation_stale'
    | 'post_trip_context_only';
  providerUnit?: string | null;
  usageScope?: CanonicalSignalUsageScope;
  observedAt?: Date | null;
  receivedAt?: Date | null;
  ageMs?: number | null;
  staleAfterMs?: number | null;
  tripDetectionEligible: false;
  mappingVersion: string;
};

export type CanonicalDrivingSignalMappingResult =
  | CanonicalDrivingSignalMappingSuccess
  | CanonicalDrivingSignalMappingFailure;
