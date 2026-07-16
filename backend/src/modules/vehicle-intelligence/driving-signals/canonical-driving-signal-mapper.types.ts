/**
 * Canonical Driving Intelligence signal mapping (P30).
 *
 * Maps documented DIMO provider signal samples to versioned canonical keys.
 * No detectors, no trip-detection usage — mapping only.
 */
export const CANONICAL_DRIVING_SIGNAL_MAPPING_VERSION = 'canonical-signal-v1';

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
  | 'ev_battery_power';

export type CanonicalSignalUnit =
  | 'rpm'
  | 'percent'
  | 'celsius'
  | 'second'
  | 'meter'
  | 'degree'
  | 'watt'
  | 'newton_meter';

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
  status: 'UNSUPPORTED' | 'UNIT_UNKNOWN' | 'INVALID_VALUE';
  canonicalKey?: CanonicalDrivingSignalKey | null;
  dimoSignalName: string;
  reason:
    | 'unknown_dimo_signal'
    | 'capability_not_supported'
    | 'powertrain_not_applicable'
    | 'provider_unit_unknown'
    | 'invalid_numeric_value'
    | 'post_trip_context_only';
  providerUnit?: string | null;
  usageScope?: CanonicalSignalUsageScope;
  tripDetectionEligible: false;
  mappingVersion: string;
};

export type CanonicalDrivingSignalMappingResult =
  | CanonicalDrivingSignalMappingSuccess
  | CanonicalDrivingSignalMappingFailure;
