/** Max candidate events embedded in bounded DrivingEvidence context. */
export const SHADOW_DETECTOR_MAX_CONTEXT_CANDIDATES = 5;

/** Time window for native vs shadow candidate comparison (seconds). */
export const SHADOW_DETECTOR_NATIVE_COMPARE_WINDOW_SEC = 2;
export const SHADOW_ENGINE_DETECTOR_KEYS = [
  'cold_engine_load',
  'start_kickdown_proxy',
  'rev_in_idle',
  'sustained_high_load',
  'gear_stress',
] as const;

/** HF / chassis signal detectors (shadow-only in P35 framework). */
export const SHADOW_HF_SIGNAL_DETECTOR_KEYS = [
  'brake_intensity',
  'wheel_slip',
  'yaw_cornering',
  'ev_power_demand',
  'idling_segment',
] as const;

export const SHADOW_FRAMEWORK_DETECTOR_KEYS = [
  ...SHADOW_ENGINE_DETECTOR_KEYS,
  ...SHADOW_HF_SIGNAL_DETECTOR_KEYS,
] as const;
