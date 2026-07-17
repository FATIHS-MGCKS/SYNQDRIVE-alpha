import { DRIVING_METRIC_NORMALIZATION_CONFIG } from '../vehicle-intelligence/driving-metric-normalization/driving-metric-normalization.config';

export const RENTAL_ROAD_DISTRIBUTION_VERSION = 'rental-road-distribution-v1';

/** Minimum trip distance to contribute route-share weighting. */
export const MIN_BURDENABLE_ROUTE_DISTANCE_KM =
  DRIVING_METRIC_NORMALIZATION_CONFIG.MINIMUM_RELIABLE_TRIP_KM;

export type RentalRoadDistributionTripInput = {
  tripId: string;
  distanceKm: number | null | undefined;
  citySharePercent?: number | null;
  highwaySharePercent?: number | null;
  countrySharePercent?: number | null;
};

export type RentalRoadDistributionResult = {
  version: typeof RENTAL_ROAD_DISTRIBUTION_VERSION;
  cityPercent: number | null;
  highwayPercent: number | null;
  countryRoadPercent: number | null;
  routeCoverage: {
    coveragePercent: number | null;
    burdenableDistanceKm: number;
    totalDistanceKm: number;
    burdenableTripCount: number;
    totalTripCount: number;
  };
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function roundDistanceKm(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round(clampPercent(value));
}

/** Trip has burdenable route shares from completed route enrichment. */
export function hasBurdenableRouteShares(trip: RentalRoadDistributionTripInput): boolean {
  const distanceKm = trip.distanceKm ?? 0;
  if (distanceKm < MIN_BURDENABLE_ROUTE_DISTANCE_KM) return false;
  return trip.citySharePercent != null && trip.highwaySharePercent != null;
}

function resolveTripShares(trip: RentalRoadDistributionTripInput): {
  city: number;
  highway: number;
  country: number;
} | null {
  if (!hasBurdenableRouteShares(trip)) return null;

  const city = clampPercent(trip.citySharePercent as number);
  const highway = clampPercent(trip.highwaySharePercent as number);
  const countryRaw =
    trip.countrySharePercent != null
      ? clampPercent(trip.countrySharePercent)
      : clampPercent(100 - city - highway);

  return { city, highway, country: countryRaw };
}

function normalizeShareTotal(input: {
  city: number;
  highway: number;
  country: number;
}): { city: number; highway: number; country: number } {
  const total = input.city + input.highway + input.country;
  if (total <= 0) {
    return { city: 0, highway: 0, country: 0 };
  }
  if (total >= 99.5 && total <= 100.5) {
    return {
      city: roundPercent(input.city),
      highway: roundPercent(input.highway),
      country: roundPercent(input.country),
    };
  }
  const scale = 100 / total;
  return {
    city: roundPercent(input.city * scale),
    highway: roundPercent(input.highway * scale),
    country: roundPercent(input.country * scale),
  };
}

/**
 * Distance-weighted rental road distribution (P63).
 * Trips without burdenable route data are excluded from share weighting.
 */
export function aggregateRentalRoadDistribution(
  trips: RentalRoadDistributionTripInput[],
): RentalRoadDistributionResult {
  const totalDistanceKm = roundDistanceKm(
    trips.reduce((sum, trip) => sum + Math.max(0, trip.distanceKm ?? 0), 0),
  );
  const burdenableTrips = trips
    .map((trip) => {
      const shares = resolveTripShares(trip);
      if (!shares) return null;
      return {
        tripId: trip.tripId,
        distanceKm: Math.max(0, trip.distanceKm ?? 0),
        shares,
      };
    })
    .filter((trip): trip is NonNullable<typeof trip> => trip != null);

  const burdenableDistanceKm = roundDistanceKm(
    burdenableTrips.reduce((sum, trip) => sum + trip.distanceKm, 0),
  );

  const routeCoveragePercent =
    totalDistanceKm > 0
      ? roundPercent((burdenableDistanceKm / totalDistanceKm) * 100)
      : null;

  if (burdenableTrips.length === 0 || burdenableDistanceKm <= 0) {
    return {
      version: RENTAL_ROAD_DISTRIBUTION_VERSION,
      cityPercent: null,
      highwayPercent: null,
      countryRoadPercent: null,
      routeCoverage: {
        coveragePercent: routeCoveragePercent,
        burdenableDistanceKm,
        totalDistanceKm,
        burdenableTripCount: burdenableTrips.length,
        totalTripCount: trips.length,
      },
    };
  }

  const weighted = burdenableTrips.reduce(
    (acc, trip) => {
      const weight = trip.distanceKm / burdenableDistanceKm;
      return {
        city: acc.city + trip.shares.city * weight,
        highway: acc.highway + trip.shares.highway * weight,
        country: acc.country + trip.shares.country * weight,
      };
    },
    { city: 0, highway: 0, country: 0 },
  );

  const normalized = normalizeShareTotal(weighted);

  return {
    version: RENTAL_ROAD_DISTRIBUTION_VERSION,
    cityPercent: normalized.city,
    highwayPercent: normalized.highway,
    countryRoadPercent: normalized.country,
    routeCoverage: {
      coveragePercent: routeCoveragePercent,
      burdenableDistanceKm,
      totalDistanceKm,
      burdenableTripCount: burdenableTrips.length,
      totalTripCount: trips.length,
    },
  };
}
