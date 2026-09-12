/** RFRF feature flags — definitions only; no F2 runtime wiring to scheduling. */
export const RAW_FUEL_REFUEL_FALLBACK_ENABLED = false;
export const RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED = false;

export const RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT: string | null = null;

export const RFRF_DETECTION_VERSION = 'rfrf-v1';
export const RFRF_DETECTOR_VERSION = 'rfrf-detector-v0-stub';

export const RAW_REFUEL_CANDIDATE_SOURCE = 'SYNQDRIVE_RAW_FUEL_FALLBACK' as const;

/** Non-terminal lifecycle states eligible for semantic rediscovery. */
export const RAW_REFUEL_CANDIDATE_NON_TERMINAL_LIFECYCLE_STATES = [
  'INSUFFICIENT',
  'OBSERVED',
  'SETTLING',
  'READY_FOR_PERSIST',
] as const;

export const RAW_REFUEL_CANDIDATE_TERMINAL_LIFECYCLE_STATES = [
  'REJECTED',
  'PROMOTED',
] as const;

/** Max temporal distance for same physical rise rediscovery (conservative). */
export const RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS = 45 * 60 * 1000;

export const RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_LITERS = 0.5;
export const RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_PERCENT = 1.0;
export const RAW_REFUEL_CANDIDATE_POST_PLATEAU_TOLERANCE_LITERS = 1.0;

export const RAW_REFUEL_CANDIDATE_IDENTITY_RISE_BUCKET_MS = 5 * 60 * 1000;
