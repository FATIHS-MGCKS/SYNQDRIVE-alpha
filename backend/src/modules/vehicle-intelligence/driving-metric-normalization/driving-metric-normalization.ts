/**
 * Consolidated driving metric normalization (P44).
 *
 * Pure domain helpers — no UI, no Prisma. All load/behavior rates should flow
 * through these functions instead of ad-hoc division in services.
 */

import {
  DRIVING_METRIC_NORMALIZATION_CONFIG as CFG,
  DRIVING_METRIC_NORMALIZATION_VERSION,
} from './driving-metric-normalization.config';
import type {
  MetricReliability,
  NormalizationReasonCode,
  NormalizationStrategy,
  NormalizedMetric,
  TripNormalizationContext,
} from './driving-metric-normalization.types';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function withMeta<T extends NormalizationStrategy>(
  strategy: T,
  input: {
    value: number | null;
    reliability: MetricReliability;
    reasonCodes: NormalizationReasonCode[];
    rawNumerator: number;
    rawDenominator: number | null;
    capped: boolean;
  },
): NormalizedMetric<T> {
  return {
    strategy,
    value: input.value,
    reliability: input.reliability,
    reasonCodes: input.reasonCodes,
    rawNumerator: input.rawNumerator,
    rawDenominator: input.rawDenominator,
    capped: input.capped,
    normalizationVersion: DRIVING_METRIC_NORMALIZATION_VERSION,
  };
}

function applyCap(value: number, cap: number): { value: number; capped: boolean } {
  if (value > cap) {
    return { value: cap, capped: true };
  }
  return { value, capped: false };
}

function assessDistanceReliability(
  distanceKm: number,
): { reliability: MetricReliability; reasonCodes: NormalizationReasonCode[] } {
  const reasons: NormalizationReasonCode[] = [];
  if (distanceKm <= CFG.ZERO_DISTANCE_EPSILON_KM) {
    return { reliability: 'UNRELIABLE', reasonCodes: ['ZERO_DISTANCE'] };
  }
  if (distanceKm < CFG.MINIMUM_RELIABLE_TRIP_KM) {
    return { reliability: 'UNRELIABLE', reasonCodes: ['BELOW_MIN_DISTANCE'] };
  }
  if (distanceKm < CFG.LIMITED_TRIP_DISTANCE_KM) {
    reasons.push('SHORT_TRIP_DISTANCE');
    return { reliability: 'LIMITED', reasonCodes: reasons };
  }
  return { reliability: 'RELIABLE', reasonCodes: reasons };
}

function assessDurationReliability(
  durationHours: number | null,
): { reliability: MetricReliability; reasonCodes: NormalizationReasonCode[] } {
  const reasons: NormalizationReasonCode[] = [];
  if (durationHours == null || durationHours <= CFG.ZERO_DISTANCE_EPSILON_KM) {
    return { reliability: 'UNRELIABLE', reasonCodes: ['ZERO_DURATION'] };
  }
  if (durationHours < CFG.MIN_RELIABLE_DURATION_HOURS) {
    return { reliability: 'UNRELIABLE', reasonCodes: ['BELOW_MIN_DURATION'] };
  }
  if (durationHours < CFG.LIMITED_TRIP_DURATION_HOURS) {
    reasons.push('SHORT_TRIP_DURATION');
    return { reliability: 'LIMITED', reasonCodes: reasons };
  }
  return { reliability: 'RELIABLE', reasonCodes: reasons };
}

/** Events per 100 km with distance reliability gates and versioned cap. */
export function normalizeEventsPer100Km(
  count: number,
  context: TripNormalizationContext,
): NormalizedMetric<'EVENTS_PER_100KM'> {
  const safeCount = Math.max(0, count);
  const distanceAssessment = assessDistanceReliability(context.distanceKm);
  if (distanceAssessment.reliability === 'UNRELIABLE') {
    return withMeta('EVENTS_PER_100KM', {
      value: null,
      reliability: 'UNRELIABLE',
      reasonCodes: distanceAssessment.reasonCodes,
      rawNumerator: safeCount,
      rawDenominator: context.distanceKm,
      capped: false,
    });
  }

  const raw = (safeCount / context.distanceKm) * 100;
  const { value: cappedValue, capped } = applyCap(raw, CFG.CAPS.eventsPer100Km);
  const reasonCodes = [...distanceAssessment.reasonCodes];
  if (capped) reasonCodes.push('CAPPED');

  return withMeta('EVENTS_PER_100KM', {
    value: round2(cappedValue),
    reliability: distanceAssessment.reliability,
    reasonCodes,
    rawNumerator: safeCount,
    rawDenominator: context.distanceKm,
    capped,
  });
}

/** Events per driving hour — requires trip duration context. */
export function normalizeEventsPerDrivingHour(
  count: number,
  context: TripNormalizationContext,
): NormalizedMetric<'EVENTS_PER_DRIVING_HOUR'> {
  const safeCount = Math.max(0, count);
  const durationAssessment = assessDurationReliability(context.durationHours);
  if (durationAssessment.reliability === 'UNRELIABLE') {
    return withMeta('EVENTS_PER_DRIVING_HOUR', {
      value: null,
      reliability: 'UNRELIABLE',
      reasonCodes: durationAssessment.reasonCodes,
      rawNumerator: safeCount,
      rawDenominator: context.durationHours,
      capped: false,
    });
  }

  const raw = safeCount / (context.durationHours as number);
  const { value: cappedValue, capped } = applyCap(raw, CFG.CAPS.eventsPerDrivingHour);
  const reasonCodes = [...durationAssessment.reasonCodes];
  if (capped) reasonCodes.push('CAPPED');

  return withMeta('EVENTS_PER_DRIVING_HOUR', {
    value: round2(cappedValue),
    reliability: durationAssessment.reliability,
    reasonCodes,
    rawNumerator: safeCount,
    rawDenominator: context.durationHours,
    capped,
  });
}

/** Share of trips affected (0–100) — vehicle/window level. */
export function normalizeAffectedTripShare(
  affectedTrips: number,
  totalTrips: number,
): NormalizedMetric<'AFFECTED_TRIP_SHARE'> {
  if (totalTrips <= 0) {
    return withMeta('AFFECTED_TRIP_SHARE', {
      value: null,
      reliability: 'UNRELIABLE',
      reasonCodes: ['ZERO_DENOMINATOR'],
      rawNumerator: Math.max(0, affectedTrips),
      rawDenominator: totalTrips,
      capped: false,
    });
  }

  const raw = (Math.max(0, affectedTrips) / totalTrips) * 100;
  const { value: cappedValue, capped } = applyCap(raw, CFG.CAPS.affectedTripSharePct);

  return withMeta('AFFECTED_TRIP_SHARE', {
    value: round2(cappedValue),
    reliability: 'RELIABLE',
    reasonCodes: capped ? ['CAPPED'] : [],
    rawNumerator: affectedTrips,
    rawDenominator: totalTrips,
    capped,
  });
}

/** Clusters per hour inside a fixed observation window. */
export function normalizeClustersPerTimeWindow(
  clusterCount: number,
  windowHours: number,
): NormalizedMetric<'CLUSTERS_PER_TIME_WINDOW'> {
  if (windowHours <= CFG.ZERO_DISTANCE_EPSILON_KM) {
    return withMeta('CLUSTERS_PER_TIME_WINDOW', {
      value: null,
      reliability: 'UNRELIABLE',
      reasonCodes: ['ZERO_DENOMINATOR'],
      rawNumerator: Math.max(0, clusterCount),
      rawDenominator: windowHours,
      capped: false,
    });
  }

  const raw = Math.max(0, clusterCount) / windowHours;
  const { value: cappedValue, capped } = applyCap(raw, CFG.CAPS.clustersPerHour);

  return withMeta('CLUSTERS_PER_TIME_WINDOW', {
    value: round2(cappedValue),
    reliability: 'RELIABLE',
    reasonCodes: capped ? ['CAPPED'] : [],
    rawNumerator: clusterCount,
    rawDenominator: windowHours,
    capped,
  });
}

/** Duration share (0–100) of a sub-interval within trip/window duration. */
export function normalizeDurationShare(
  durationS: number,
  totalDurationS: number,
): NormalizedMetric<'DURATION_SHARE'> {
  if (totalDurationS <= 0) {
    return withMeta('DURATION_SHARE', {
      value: null,
      reliability: 'UNRELIABLE',
      reasonCodes: ['ZERO_DENOMINATOR'],
      rawNumerator: Math.max(0, durationS),
      rawDenominator: totalDurationS,
      capped: false,
    });
  }

  const raw = (Math.max(0, durationS) / totalDurationS) * 100;
  const { value: cappedValue, capped } = applyCap(raw, CFG.CAPS.durationSharePct);

  return withMeta('DURATION_SHARE', {
    value: round2(cappedValue),
    reliability: 'RELIABLE',
    reasonCodes: capped ? ['CAPPED'] : [],
    rawNumerator: durationS,
    rawDenominator: totalDurationS,
    capped,
  });
}

/** Distance share (0–100) — route usage split, speeding exposure, etc. */
export function normalizeDistanceShare(
  distanceKm: number,
  totalDistanceKm: number,
): NormalizedMetric<'DISTANCE_SHARE'> {
  if (totalDistanceKm <= CFG.ZERO_DISTANCE_EPSILON_KM) {
    return withMeta('DISTANCE_SHARE', {
      value: null,
      reliability: 'UNRELIABLE',
      reasonCodes: ['ZERO_DISTANCE'],
      rawNumerator: Math.max(0, distanceKm),
      rawDenominator: totalDistanceKm,
      capped: false,
    });
  }

  const raw = (Math.max(0, distanceKm) / totalDistanceKm) * 100;
  const { value: cappedValue, capped } = applyCap(raw, CFG.CAPS.distanceSharePct);

  return withMeta('DISTANCE_SHARE', {
    value: round2(cappedValue),
    reliability: 'RELIABLE',
    reasonCodes: capped ? ['CAPPED'] : [],
    rawNumerator: distanceKm,
    rawDenominator: totalDistanceKm,
    capped,
  });
}

/** Event share (0–1 or 0–100 depending on caller) — e.g. high-speed brake share. */
export function normalizeEventShare(
  eventCount: number,
  totalEvents: number,
  asPct = true,
): NormalizedMetric<'EVENT_SHARE'> {
  if (totalEvents <= 0) {
    return withMeta('EVENT_SHARE', {
      value: eventCount > 0 ? null : asPct ? 0 : 0,
      reliability: eventCount > 0 ? 'UNRELIABLE' : 'RELIABLE',
      reasonCodes: eventCount > 0 ? ['ZERO_DENOMINATOR'] : ['NO_EVENTS'],
      rawNumerator: Math.max(0, eventCount),
      rawDenominator: totalEvents,
      capped: false,
    });
  }

  const raw = Math.max(0, eventCount) / totalEvents;
  const scaled = asPct ? raw * 100 : raw;
  const cap = asPct ? CFG.CAPS.eventSharePct : 1;
  const { value: cappedValue, capped } = applyCap(scaled, cap);

  return withMeta('EVENT_SHARE', {
    value: asPct ? round2(cappedValue) : round3(cappedValue),
    reliability: 'RELIABLE',
    reasonCodes: capped ? ['CAPPED'] : [],
    rawNumerator: eventCount,
    rawDenominator: totalEvents,
    capped,
  });
}

/** Stop density (stops per km) — distance-normalized, zero-distance safe. */
export function normalizeStopDensityPerKm(
  stopCount: number,
  context: TripNormalizationContext,
): NormalizedMetric<'EVENTS_PER_100KM'> {
  const distanceAssessment = assessDistanceReliability(context.distanceKm);
  if (distanceAssessment.reliability === 'UNRELIABLE') {
    return withMeta('EVENTS_PER_100KM', {
      value: null,
      reliability: 'UNRELIABLE',
      reasonCodes: distanceAssessment.reasonCodes,
      rawNumerator: Math.max(0, stopCount),
      rawDenominator: context.distanceKm,
      capped: false,
    });
  }

  const raw = Math.max(0, stopCount) / context.distanceKm;
  const { value: cappedValue, capped } = applyCap(raw, CFG.CAPS.stopDensityPerKm);
  const reasonCodes = [...distanceAssessment.reasonCodes];
  if (capped) reasonCodes.push('CAPPED');

  return withMeta('EVENTS_PER_100KM', {
    value: round2(cappedValue),
    reliability: distanceAssessment.reliability,
    reasonCodes,
    rawNumerator: stopCount,
    rawDenominator: context.distanceKm,
    capped,
  });
}

/** Kinetic energy dissipation per km (brake energy proxy). */
export function normalizeEnergyPerKm(
  totalEnergy: number,
  context: TripNormalizationContext,
): NormalizedMetric<'ENERGY_PER_KM'> {
  const distanceAssessment = assessDistanceReliability(context.distanceKm);
  if (distanceAssessment.reliability === 'UNRELIABLE' || totalEnergy <= 0) {
    return withMeta('ENERGY_PER_KM', {
      value: totalEnergy <= 0 ? 0 : null,
      reliability: totalEnergy <= 0 ? 'RELIABLE' : distanceAssessment.reliability,
      reasonCodes:
        totalEnergy <= 0
          ? ['NO_EVENTS']
          : distanceAssessment.reasonCodes,
      rawNumerator: Math.max(0, totalEnergy),
      rawDenominator: context.distanceKm,
      capped: false,
    });
  }

  const raw = totalEnergy / context.distanceKm;
  const { value: cappedValue, capped } = applyCap(raw, CFG.CAPS.meanBrakeEnergyPerKm);
  const reasonCodes = [...distanceAssessment.reasonCodes];
  if (capped) reasonCodes.push('CAPPED');

  return withMeta('ENERGY_PER_KM', {
    value: round2(cappedValue),
    reliability: distanceAssessment.reliability,
    reasonCodes,
    rawNumerator: totalEnergy,
    rawDenominator: context.distanceKm,
    capped,
  });
}

/** Resolve trip duration in hours from timestamps. */
export function resolveTripDurationHours(
  start: Date,
  end: Date | null | undefined,
): number | null {
  if (!end) return null;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms / 3_600_000;
}

/** Flat scalar for legacy score formulas — never inflates zero-distance. */
export function metricValueOrZero(metric: NormalizedMetric): number {
  return metric.value ?? 0;
}
