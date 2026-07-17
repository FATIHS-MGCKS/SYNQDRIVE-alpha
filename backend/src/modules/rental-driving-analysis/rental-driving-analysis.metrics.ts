import {
  normalizeAffectedTripShare,
  normalizeClustersPerTimeWindow,
  normalizeDistanceShare,
  normalizeEventsPer100Km,
  normalizeEventsPerDrivingHour,
  resolveTripDurationHours,
} from '../vehicle-intelligence/driving-metric-normalization/driving-metric-normalization';
import type {
  MetricReliability,
  NormalizedMetric,
  TripNormalizationContext,
} from '../vehicle-intelligence/driving-metric-normalization/driving-metric-normalization.types';
import type { AnalysisAssessability } from '../vehicle-intelligence/trips/trip-analysis-status';
import {
  RENTAL_DRIVING_METRICS_CONFIG as CFG,
  RENTAL_DRIVING_METRICS_VERSION,
} from './rental-driving-analysis.metrics.config';

export type RentalMetricLevel = 'low' | 'moderate' | 'elevated' | 'high';

export type RentalTripMetricInput = {
  tripId: string;
  distanceKm: number;
  startTime: Date;
  endTime: Date | null;
  durationMinutes: number | null;
  drivingEvents: number;
  harshBraking: number;
  harshAcceleration: number;
  abuseEvents: number;
  assessability: AnalysisAssessability;
  nativeEventCount: number;
  hfEventCount: number;
  estimatedProxyShare: number;
  vehicleStressScore: number | null;
};

export type RentalDrivingNormalizedMetrics = {
  version: typeof RENTAL_DRIVING_METRICS_VERSION;
  totals: {
    totalDistanceKm: number;
    totalDurationHours: number | null;
    tripCount: number;
    assessableTripCount: number;
  };
  drivingEvents: {
    totalCount: number;
    per100Km: NormalizedMetric<'EVENTS_PER_100KM'>;
    perDrivingHour: NormalizedMetric<'EVENTS_PER_DRIVING_HOUR'>;
    affectedTripShare: NormalizedMetric<'AFFECTED_TRIP_SHARE'>;
  };
  harshEvents: {
    totalCount: number;
    per100Km: NormalizedMetric<'EVENTS_PER_100KM'>;
    perDrivingHour: NormalizedMetric<'EVENTS_PER_DRIVING_HOUR'>;
    affectedTripShare: NormalizedMetric<'AFFECTED_TRIP_SHARE'>;
  };
  abuseEvents: {
    totalCount: number;
    per100Km: NormalizedMetric<'EVENTS_PER_100KM'>;
    perDrivingHour: NormalizedMetric<'EVENTS_PER_DRIVING_HOUR'>;
    affectedTripShare: NormalizedMetric<'AFFECTED_TRIP_SHARE'>;
  };
  strongEventClusters: {
    clusterCount: number;
    clustersPerHour: NormalizedMetric<'CLUSTERS_PER_TIME_WINDOW'>;
    affectedTripShare: NormalizedMetric<'AFFECTED_TRIP_SHARE'>;
  };
  repeatedPatterns: {
    patternTripCount: number;
    affectedTripShare: NormalizedMetric<'AFFECTED_TRIP_SHARE'>;
    repeatedHarshBrakingTrips: number;
    repeatedHarshAccelTrips: number;
  };
  evidenceShares: {
    assessableDistanceShare: NormalizedMetric<'DISTANCE_SHARE'>;
    nativeEvidenceShare: NormalizedMetric<'DISTANCE_SHARE'>;
    proxyShare: NormalizedMetric<'DISTANCE_SHARE'>;
  };
  vehicleLoad: {
    level: RentalMetricLevel;
    stressScore: number | null;
    reliability: MetricReliability;
    reasons: string[];
  };
  driverConduct: {
    level: RentalMetricLevel;
    harshPer100Km: number | null;
    abusePer100Km: number | null;
    reliability: MetricReliability;
    reasons: string[];
  };
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveDurationHours(trip: RentalTripMetricInput): number | null {
  if (trip.durationMinutes != null && trip.durationMinutes > 0) {
    return trip.durationMinutes / 60;
  }
  return resolveTripDurationHours(trip.startTime, trip.endTime);
}

function rentalContext(
  totalDistanceKm: number,
  totalDurationHours: number | null,
): TripNormalizationContext {
  return { distanceKm: totalDistanceKm, durationHours: totalDurationHours };
}

function assessRentalPeriodReliability(
  totalDistanceKm: number,
  totalDurationHours: number | null,
): { reliability: MetricReliability; reasons: string[] } {
  const reasons: string[] = [];
  if (totalDistanceKm < CFG.MIN_RENTAL_DISTANCE_KM) {
    return { reliability: 'UNRELIABLE', reasons: ['BELOW_MIN_RENTAL_DISTANCE'] };
  }
  if (totalDurationHours != null && totalDurationHours < CFG.MIN_RENTAL_DURATION_HOURS) {
    return { reliability: 'UNRELIABLE', reasons: ['BELOW_MIN_RENTAL_DURATION'] };
  }
  if (totalDistanceKm < CFG.LIMITED_RENTAL_DISTANCE_KM) {
    reasons.push('SHORT_RENTAL_DISTANCE');
  }
  if (
    totalDurationHours != null &&
    totalDurationHours < CFG.LIMITED_RENTAL_DURATION_HOURS
  ) {
    reasons.push('SHORT_RENTAL_DURATION');
  }
  return {
    reliability: reasons.length > 0 ? 'LIMITED' : 'RELIABLE',
    reasons,
  };
}

function applyRentalCap(
  metric: NormalizedMetric<'EVENTS_PER_100KM'>,
  cap: number,
): NormalizedMetric<'EVENTS_PER_100KM'> {
  if (metric.value == null || metric.value <= cap) return metric;
  return {
    ...metric,
    value: cap,
    capped: true,
    reasonCodes: [...metric.reasonCodes, 'CAPPED'],
  };
}

function isAssessableTrip(trip: RentalTripMetricInput): boolean {
  return trip.assessability === 'FULL' || trip.assessability === 'LIMITED';
}

function isTripWithDrivingEvents(trip: RentalTripMetricInput): boolean {
  return trip.drivingEvents > 0;
}

function isTripWithHarshEvents(trip: RentalTripMetricInput): boolean {
  return trip.harshBraking + trip.harshAcceleration > 0;
}

function isTripWithAbuse(trip: RentalTripMetricInput): boolean {
  return trip.abuseEvents > 0;
}

function isStrongEventCluster(trip: RentalTripMetricInput): boolean {
  if (trip.abuseEvents > 0) return true;
  const harshTotal = trip.harshBraking + trip.harshAcceleration;
  if (harshTotal < CFG.CLUSTER_MIN_HARSH_EVENTS) return false;
  const per100 = normalizeEventsPer100Km(harshTotal, {
    distanceKm: trip.distanceKm,
    durationHours: resolveDurationHours(trip),
  });
  return (per100.value ?? 0) >= CFG.CLUSTER_HARSH_PER_100KM;
}

function levelFromPer100Km(
  value: number | null,
  bands: { low: number; moderate: number; elevated: number },
): RentalMetricLevel {
  if (value == null) return 'low';
  if (value >= bands.elevated) return 'high';
  if (value >= bands.moderate) return 'elevated';
  if (value >= bands.low) return 'moderate';
  return 'low';
}

function levelFromStress(score: number | null): RentalMetricLevel {
  if (score == null) return 'low';
  if (score >= CFG.VEHICLE_LOAD_STRESS.high) return 'high';
  if (score >= CFG.VEHICLE_LOAD_STRESS.elevated) return 'elevated';
  if (score >= CFG.VEHICLE_LOAD_STRESS.moderate) return 'moderate';
  return 'low';
}

function distanceWeightedStress(trips: RentalTripMetricInput[]): number | null {
  const scored = trips.filter((t) => t.vehicleStressScore != null && t.distanceKm > 0);
  if (scored.length === 0) return null;
  const totalKm = scored.reduce((sum, t) => sum + t.distanceKm, 0);
  if (totalKm <= 0) return null;
  const weighted =
    scored.reduce((sum, t) => sum + (t.vehicleStressScore as number) * t.distanceKm, 0) /
    totalKm;
  return round2(weighted);
}

function mergeDriverConductLevel(
  harshLevel: RentalMetricLevel,
  abuseLevel: RentalMetricLevel,
): RentalMetricLevel {
  const rank: Record<RentalMetricLevel, number> = {
    low: 0,
    moderate: 1,
    elevated: 2,
    high: 3,
  };
  return rank[abuseLevel] >= rank[harshLevel] ? abuseLevel : harshLevel;
}

/**
 * Rental-period normalized metrics (P62).
 * Replaces absolute event thresholds with distance/duration-normalized rates.
 */
export function computeRentalDrivingMetrics(
  trips: RentalTripMetricInput[],
): RentalDrivingNormalizedMetrics {
  const totalDistanceKm = round2(trips.reduce((sum, t) => sum + Math.max(0, t.distanceKm), 0));
  const durationParts = trips
    .map((t) => resolveDurationHours(t))
    .filter((h): h is number => h != null && h > 0);
  const totalDurationHours =
    durationParts.length > 0 ? round2(durationParts.reduce((a, b) => a + b, 0)) : null;

  const periodContext = rentalContext(totalDistanceKm, totalDurationHours);
  const periodReliability = assessRentalPeriodReliability(totalDistanceKm, totalDurationHours);

  const drivingEventsTotal = trips.reduce((sum, t) => sum + t.drivingEvents, 0);
  const harshTotal = trips.reduce(
    (sum, t) => sum + t.harshBraking + t.harshAcceleration,
    0,
  );
  const abuseTotal = trips.reduce((sum, t) => sum + t.abuseEvents, 0);

  const drivingPer100Km = applyRentalCap(
    normalizeEventsPer100Km(drivingEventsTotal, periodContext),
    CFG.CAPS.eventsPer100Km,
  );
  const drivingPerHour = normalizeEventsPerDrivingHour(drivingEventsTotal, periodContext);
  const harshPer100Km = applyRentalCap(
    normalizeEventsPer100Km(harshTotal, periodContext),
    CFG.CAPS.harshPer100Km,
  );
  const harshPerHour = normalizeEventsPerDrivingHour(harshTotal, periodContext);
  const abusePer100Km = applyRentalCap(
    normalizeEventsPer100Km(abuseTotal, periodContext),
    CFG.CAPS.abusePer100Km,
  );
  const abusePerHour = normalizeEventsPerDrivingHour(abuseTotal, periodContext);

  const clusterTrips = trips.filter(isStrongEventCluster);
  const repeatedHarshBrakingTrips = trips.filter((t) => t.harshBraking >= 2).length;
  const repeatedHarshAccelTrips = trips.filter((t) => t.harshAcceleration >= 2).length;
  const patternTripCount = trips.filter(
    (t) =>
      isStrongEventCluster(t) ||
      t.harshBraking >= 2 ||
      t.harshAcceleration >= 2,
  ).length;

  const assessableDistanceKm = trips
    .filter(isAssessableTrip)
    .reduce((sum, t) => sum + Math.max(0, t.distanceKm), 0);
  const nativeDistanceKm = trips
    .filter((t) => t.nativeEventCount > 0)
    .reduce((sum, t) => sum + Math.max(0, t.distanceKm), 0);
  const proxyDistanceKm = trips
    .filter((t) => t.estimatedProxyShare >= 0.5)
    .reduce((sum, t) => sum + Math.max(0, t.distanceKm), 0);

  const vehicleStressScore = distanceWeightedStress(trips);
  const harshConductLevel = levelFromPer100Km(
    harshPer100Km.value,
    CFG.DRIVER_CONDUCT_PER_100KM,
  );
  const abuseConductLevel = levelFromPer100Km(abusePer100Km.value, CFG.ABUSE_PER_100KM);
  const driverConductLevel = mergeDriverConductLevel(harshConductLevel, abuseConductLevel);

  const driverReliability =
    periodReliability.reliability === 'UNRELIABLE' ||
    harshPer100Km.reliability === 'UNRELIABLE'
      ? 'UNRELIABLE'
      : periodReliability.reliability === 'LIMITED' ||
          harshPer100Km.reliability === 'LIMITED'
        ? 'LIMITED'
        : 'RELIABLE';

  return {
    version: RENTAL_DRIVING_METRICS_VERSION,
    totals: {
      totalDistanceKm,
      totalDurationHours,
      tripCount: trips.length,
      assessableTripCount: trips.filter(isAssessableTrip).length,
    },
    drivingEvents: {
      totalCount: drivingEventsTotal,
      per100Km: drivingPer100Km,
      perDrivingHour: drivingPerHour,
      affectedTripShare: normalizeAffectedTripShare(
        trips.filter(isTripWithDrivingEvents).length,
        trips.length,
      ),
    },
    harshEvents: {
      totalCount: harshTotal,
      per100Km: harshPer100Km,
      perDrivingHour: harshPerHour,
      affectedTripShare: normalizeAffectedTripShare(
        trips.filter(isTripWithHarshEvents).length,
        trips.length,
      ),
    },
    abuseEvents: {
      totalCount: abuseTotal,
      per100Km: abusePer100Km,
      perDrivingHour: abusePerHour,
      affectedTripShare: normalizeAffectedTripShare(
        trips.filter(isTripWithAbuse).length,
        trips.length,
      ),
    },
    strongEventClusters: {
      clusterCount: clusterTrips.length,
      clustersPerHour: normalizeClustersPerTimeWindow(
        clusterTrips.length,
        totalDurationHours ?? 0,
      ),
      affectedTripShare: normalizeAffectedTripShare(clusterTrips.length, trips.length),
    },
    repeatedPatterns: {
      patternTripCount,
      affectedTripShare: normalizeAffectedTripShare(patternTripCount, trips.length),
      repeatedHarshBrakingTrips,
      repeatedHarshAccelTrips,
    },
    evidenceShares: {
      assessableDistanceShare: normalizeDistanceShare(assessableDistanceKm, totalDistanceKm),
      nativeEvidenceShare: normalizeDistanceShare(nativeDistanceKm, totalDistanceKm),
      proxyShare: normalizeDistanceShare(proxyDistanceKm, totalDistanceKm),
    },
    vehicleLoad: {
      level: levelFromStress(vehicleStressScore),
      stressScore: vehicleStressScore,
      reliability: vehicleStressScore == null ? 'UNRELIABLE' : periodReliability.reliability,
      reasons: vehicleStressScore == null ? ['NO_STRESS_SCORE'] : periodReliability.reasons,
    },
    driverConduct: {
      level: driverConductLevel,
      harshPer100Km: harshPer100Km.value,
      abusePer100Km: abusePer100Km.value,
      reliability: driverReliability,
      reasons: [...periodReliability.reasons, ...harshPer100Km.reasonCodes],
    },
  };
}

export function buildRentalTripMetricInput(input: {
  tripId: string;
  distanceKm: number;
  startTime: Date;
  endTime?: Date | null;
  durationMinutes?: number | null;
  totalAccelerationEvents?: number | null;
  totalBrakingEvents?: number | null;
  hardBrakingEvents?: number | null;
  hardAccelerationEvents?: number | null;
  abuseEvents?: number | null;
  assessability: AnalysisAssessability;
  nativeEventCount?: number | null;
  hfEventCount?: number | null;
  estimatedProxyShare?: number | null;
  vehicleStressScore?: number | null;
}): RentalTripMetricInput {
  return {
    tripId: input.tripId,
    distanceKm: input.distanceKm,
    startTime: input.startTime,
    endTime: input.endTime ?? null,
    durationMinutes: input.durationMinutes ?? null,
    drivingEvents:
      (input.totalAccelerationEvents ?? 0) + (input.totalBrakingEvents ?? 0),
    harshBraking: input.hardBrakingEvents ?? 0,
    harshAcceleration: input.hardAccelerationEvents ?? 0,
    abuseEvents: input.abuseEvents ?? 0,
    assessability: input.assessability,
    nativeEventCount: input.nativeEventCount ?? 0,
    hfEventCount: input.hfEventCount ?? 0,
    estimatedProxyShare: input.estimatedProxyShare ?? 0,
    vehicleStressScore: input.vehicleStressScore ?? null,
  };
}

/** Map combined vehicle load + driver conduct to legacy overall stress level. */
export function resolveOverallLevelFromMetrics(metrics: RentalDrivingNormalizedMetrics): {
  level: 'low_stress' | 'moderate_stress' | 'elevated_stress' | 'high_stress';
  wearImpact: 'low' | 'medium' | 'medium_to_high' | 'high';
} {
  const loadRank: Record<RentalMetricLevel, number> = {
    low: 0,
    moderate: 1,
    elevated: 2,
    high: 3,
  };
  const combinedRank = Math.max(
    loadRank[metrics.vehicleLoad.level],
    loadRank[metrics.driverConduct.level],
  );

  const level =
    combinedRank >= 3
      ? 'high_stress'
      : combinedRank >= 2
        ? 'elevated_stress'
        : combinedRank >= 1
          ? 'moderate_stress'
          : 'low_stress';

  const wearImpact =
    metrics.vehicleLoad.level === 'high' || metrics.driverConduct.level === 'high'
      ? 'high'
      : metrics.vehicleLoad.level === 'elevated' ||
          metrics.driverConduct.level === 'elevated'
        ? 'medium_to_high'
        : metrics.vehicleLoad.level === 'moderate' ||
            metrics.driverConduct.level === 'moderate'
          ? 'medium'
          : 'low';

  return { level, wearImpact };
}
