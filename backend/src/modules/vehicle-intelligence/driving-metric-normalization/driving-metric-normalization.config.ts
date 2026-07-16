/**
 * Versioned caps and thresholds for driving metric normalization (P44).
 *
 * Bump NORMALIZATION_VERSION when strategy semantics or caps change.
 * Bump DRIVING_IMPACT_CONFIG.MODEL_VERSION when score weights change.
 */

export const DRIVING_METRIC_NORMALIZATION_VERSION = 'metric-norm-v1';

export const DRIVING_METRIC_NORMALIZATION_CONFIG = {
  /** Distance below this is treated as zero — no distance-based inflation. */
  ZERO_DISTANCE_EPSILON_KM: 0.001,

  /** Trips shorter than this are skipped for impact persistence (existing rule). */
  MINIMUM_RELIABLE_TRIP_KM: 2,

  /** Distance-based rates below this are LIMITED (still computed with caps). */
  LIMITED_TRIP_DISTANCE_KM: 8,

  /** Duration below this blocks per-hour normalization. */
  MIN_RELIABLE_DURATION_HOURS: 3 / 60,

  /** Duration below this marks per-hour rates as LIMITED. */
  LIMITED_TRIP_DURATION_HOURS: 15 / 60,

  /** Versioned output caps — prevent outlier trips from dominating scores. */
  CAPS: {
    eventsPer100Km: 200,
    eventsPerDrivingHour: 600,
    stopDensityPerKm: 12,
    meanBrakeEnergyPerKm: 2000,
    durationSharePct: 100,
    distanceSharePct: 100,
    eventSharePct: 100,
    clustersPerHour: 120,
    affectedTripSharePct: 100,
  },
} as const;
