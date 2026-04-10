/**
 * Driving Impact Engine V1 — Centralized Configuration
 *
 * All tunable constants live here. Do NOT scatter thresholds or weights
 * across other files; change this file to tune the engine.
 *
 * Versioning: bump MODEL_VERSION whenever weights or reference maxes change
 * so that persisted rows remain traceable to the formula that produced them.
 */

export const DRIVING_IMPACT_CONFIG = {
  /** Bump this string whenever any formula weight or reference max changes. */
  MODEL_VERSION: 'v1.0.0',

  /** Rolling window used when computing VehicleDrivingImpactCurrent. */
  ROLLING_WINDOW_DAYS: 30,

  /**
   * Trips shorter than this are skipped for impact computation.
   * Very short trips produce unreliable per-100 km rates.
   */
  MINIMUM_RELIABLE_TRIP_KM: 2,

  /** Speed threshold above which a braking event is classified as "high speed". */
  HIGH_SPEED_BRAKE_THRESHOLD_KMH: 80,

  /** End-speed threshold below which a braking event counts as a "stop". */
  STOP_SPEED_THRESHOLD_KMH: 5,

  // ── Reference maxes — used in capLinear normalization to 0-100 ──────────

  /**
   * Raw weighted longitudinal stress at which the score reaches 100.
   * Represents very aggressive driving: ~10 hard accels + 2 extreme + 2 kickdowns per 100 km.
   */
  LONGITUDINAL_RAW_MAX: 20,

  /**
   * Raw weighted braking stress at which the score reaches 100.
   * Represents extremely hard braking patterns.
   */
  BRAKING_RAW_MAX: 30,

  /**
   * Stop density (stops per km) that corresponds to a fully saturated stop-go factor.
   * 3 stops/km = dense urban traffic.
   */
  STOP_DENSITY_REFERENCE: 3,

  /**
   * Brakes per 100 km that corresponds to fully saturated brake factor in stop-go score.
   * 30 braking events per 100 km is very heavy urban traffic.
   */
  BRAKES_PER_100_REFERENCE: 30,

  /**
   * Mean kinetic energy loss per braking event per km (m²/s²/km) reference max.
   * Approximates very aggressive combined highway + urban braking.
   */
  BRAKE_ENERGY_REFERENCE: 500,

  /**
   * P95 negative deceleration (m/s²) at which the p95 factor saturates.
   * 9 m/s² ≈ EXTREME threshold in hf-braking.ts.
   */
  P95_DECEL_REFERENCE: 9,

  /**
   * Full-braking events per 100 km at which the thermal factor saturates.
   * 5 full-braking events per 100 km = very aggressive.
   */
  FULL_BRAKING_PER_100_REFERENCE: 5,

  // ── Longitudinal stress weights ──────────────────────────────────────────

  LONGITUDINAL_WEIGHTS: {
    hardAccel: 1.0,
    extremeAccel: 1.8,
    kickdown: 1.2,
    launchLike: 2.0,
  },

  // ── Braking stress weights ───────────────────────────────────────────────

  BRAKING_WEIGHTS: {
    hardBrake: 1.0,
    extremeBrake: 1.8,
    fullBrake: 2.2,
    brakesPer100: 0.4,
    /** p95 decel is used raw (m/s²) then divided by P95_DECEL_REFERENCE inside scorer. */
    p95Decel: 0.8,
  },

  // ── Stop-Go score blend weights (must sum to 1.0) ───────────────────────

  STOP_GO_BLEND: {
    cityFactor: 0.40,
    stopFactor: 0.35,
    brakeFactor: 0.25,
  },

  // ── High-Speed score blend weights ───────────────────────────────────────

  HIGH_SPEED_BLEND: {
    highwayFactor: 0.50,
    highSpeedBrakeFactor: 0.50,
  },

  // ── Thermal Brake stress blend weights ───────────────────────────────────

  THERMAL_BLEND: {
    highSpeedBrakeShare: 0.30,
    fullBrakingFactor: 0.30,
    energyFactor: 0.25,
    p95Factor: 0.15,
  },

  // ── Driving Style Score composite weights (must sum to 1.0) ─────────────

  DRIVING_STYLE_WEIGHTS: {
    longitudinal: 0.30,
    braking: 0.35,
    stopGo: 0.20,
    highSpeed: 0.15,
  },
} as const;
