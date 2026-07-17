/** Versioned rental-period metric policy (P62). */
export const RENTAL_DRIVING_METRICS_VERSION = 'rental-metrics-v1';

export const RENTAL_DRIVING_METRICS_CONFIG = {
  /** Rental-period gates — separate from per-trip P44 gates. */
  MIN_RENTAL_DISTANCE_KM: 20,
  LIMITED_RENTAL_DISTANCE_KM: 50,
  MIN_RENTAL_DURATION_HOURS: 0.25,
  LIMITED_RENTAL_DURATION_HOURS: 1,

  /** Strong event cluster: trip-level harsh density + minimum count. */
  CLUSTER_MIN_HARSH_EVENTS: 3,
  CLUSTER_HARSH_PER_100KM: 8,

  /** Repeated pattern across trips. */
  REPEATED_PATTERN_MIN_TRIPS: 2,

  /** Driver conduct — harsh events per 100 km (capped). */
  DRIVER_CONDUCT_PER_100KM: {
    low: 3,
    moderate: 8,
    elevated: 15,
  },

  /** Driver conduct — abuse events per 100 km. */
  ABUSE_PER_100KM: {
    low: 0.5,
    moderate: 1.5,
    elevated: 3,
  },

  /** Vehicle load — distance-weighted stress score bands. */
  VEHICLE_LOAD_STRESS: {
    low: 35,
    moderate: 50,
    elevated: 65,
    high: 75,
  },

  /** Rental-level output caps (robust against outliers). */
  CAPS: {
    eventsPer100Km: 150,
    eventsPerDrivingHour: 500,
    harshPer100Km: 120,
    abusePer100Km: 40,
    clustersPerHour: 80,
  },
} as const;
