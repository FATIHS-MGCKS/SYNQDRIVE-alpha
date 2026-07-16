/**
 * Driving Impact trip metric normalization (P44).
 *
 * Maps each persisted impact field to an explicit normalization strategy.
 */

import {
  metricValueOrZero,
  normalizeDistanceShare,
  normalizeEnergyPerKm,
  normalizeEventShare,
  normalizeEventsPer100Km,
  normalizeEventsPerDrivingHour,
  normalizeStopDensityPerKm,
  resolveTripDurationHours,
} from './driving-metric-normalization';
import { DRIVING_METRIC_NORMALIZATION_VERSION } from './driving-metric-normalization.config';
import type {
  NormalizedMetric,
  TripNormalizationContext,
} from './driving-metric-normalization.types';

export type DrivingImpactEventCounts = {
  hardAccel: number;
  extremeAccel: number;
  hardBrake: number;
  extremeBrake: number;
  fullBraking: number;
  kickdown: number;
  launchLike: number;
  brakesTotal: number;
  stopCount: number;
  highSpeedBrakeCount: number;
  totalBrakingRows: number;
};

export type DrivingImpactUsageSplitInput = {
  citySharePct: number | null;
  highwaySharePct: number | null;
  countryRoadSharePct: number | null;
};

export type DrivingImpactBrakeEnergyInput = {
  measuredEnergyTotal: number;
  proxyEnergyTotal: number;
};

export type DrivingImpactNormalizedTripMetrics = {
  normalizationVersion: string;
  context: TripNormalizationContext & {
    durationHours: number | null;
    distanceReliability: NormalizedMetric['reliability'];
  };
  eventsPer100Km: {
    hardAccel: NormalizedMetric<'EVENTS_PER_100KM'>;
    extremeAccel: NormalizedMetric<'EVENTS_PER_100KM'>;
    hardBrake: NormalizedMetric<'EVENTS_PER_100KM'>;
    extremeBrake: NormalizedMetric<'EVENTS_PER_100KM'>;
    fullBraking: NormalizedMetric<'EVENTS_PER_100KM'>;
    kickdown: NormalizedMetric<'EVENTS_PER_100KM'>;
    launchLike: NormalizedMetric<'EVENTS_PER_100KM'>;
    brakesTotal: NormalizedMetric<'EVENTS_PER_100KM'>;
    stopDensityPerKm: NormalizedMetric<'EVENTS_PER_100KM'>;
  };
  eventsPerDrivingHour: {
    hardBrake: NormalizedMetric<'EVENTS_PER_DRIVING_HOUR'>;
    kickdown: NormalizedMetric<'EVENTS_PER_DRIVING_HOUR'>;
  };
  shares: {
    citySharePct: NormalizedMetric<'DISTANCE_SHARE'> | null;
    highwaySharePct: NormalizedMetric<'DISTANCE_SHARE'> | null;
    countryRoadSharePct: NormalizedMetric<'DISTANCE_SHARE'> | null;
    highSpeedBrakeShare: NormalizedMetric<'EVENT_SHARE'>;
  };
  energyPerKm: {
    measured: NormalizedMetric<'ENERGY_PER_KM'>;
    proxy: NormalizedMetric<'ENERGY_PER_KM'>;
  };
  flat: {
    hardAccelPer100Km: number;
    extremeAccelPer100Km: number;
    hardBrakePer100Km: number;
    extremeBrakePer100Km: number;
    fullBrakingPer100Km: number;
    kickdownPer100Km: number;
    launchLikePer100Km: number;
    brakesPer100Km: number;
    stopDensity: number;
    highSpeedBrakeShare: number;
    meanBrakeEnergyPerKm: number;
    meanBrakeEnergyProxyPerKm: number;
  };
};

function optionalDistanceShare(pct: number | null): NormalizedMetric<'DISTANCE_SHARE'> | null {
  if (pct == null) return null;
  return normalizeDistanceShare(pct, 100);
}

export function buildDrivingImpactNormalizedTripMetrics(input: {
  distanceKm: number;
  tripStartedAt: Date;
  tripEndedAt: Date | null;
  counts: DrivingImpactEventCounts;
  usageSplit: DrivingImpactUsageSplitInput;
  brakeEnergy: DrivingImpactBrakeEnergyInput;
}): DrivingImpactNormalizedTripMetrics {
  const durationHours = resolveTripDurationHours(input.tripStartedAt, input.tripEndedAt);
  const context: TripNormalizationContext = {
    distanceKm: input.distanceKm,
    durationHours,
  };

  const hardAccel = normalizeEventsPer100Km(input.counts.hardAccel, context);
  const extremeAccel = normalizeEventsPer100Km(input.counts.extremeAccel, context);
  const hardBrake = normalizeEventsPer100Km(input.counts.hardBrake, context);
  const extremeBrake = normalizeEventsPer100Km(input.counts.extremeBrake, context);
  const fullBraking = normalizeEventsPer100Km(input.counts.fullBraking, context);
  const kickdown = normalizeEventsPer100Km(input.counts.kickdown, context);
  const launchLike = normalizeEventsPer100Km(input.counts.launchLike, context);
  const brakesTotal = normalizeEventsPer100Km(input.counts.brakesTotal, context);
  const stopDensityPerKm = normalizeStopDensityPerKm(input.counts.stopCount, context);

  const hardBrakePerHour = normalizeEventsPerDrivingHour(input.counts.hardBrake, context);
  const kickdownPerHour = normalizeEventsPerDrivingHour(input.counts.kickdown, context);

  const highSpeedBrakeShare = normalizeEventShare(
    input.counts.highSpeedBrakeCount,
    input.counts.totalBrakingRows,
    false,
  );

  const measuredEnergy = normalizeEnergyPerKm(input.brakeEnergy.measuredEnergyTotal, context);
  const proxyEnergy = normalizeEnergyPerKm(input.brakeEnergy.proxyEnergyTotal, context);

  return {
    normalizationVersion: DRIVING_METRIC_NORMALIZATION_VERSION,
    context: {
      ...context,
      distanceReliability: hardAccel.reliability,
    },
    eventsPer100Km: {
      hardAccel,
      extremeAccel,
      hardBrake,
      extremeBrake,
      fullBraking,
      kickdown,
      launchLike,
      brakesTotal,
      stopDensityPerKm,
    },
    eventsPerDrivingHour: {
      hardBrake: hardBrakePerHour,
      kickdown: kickdownPerHour,
    },
    shares: {
      citySharePct: optionalDistanceShare(input.usageSplit.citySharePct),
      highwaySharePct: optionalDistanceShare(input.usageSplit.highwaySharePct),
      countryRoadSharePct: optionalDistanceShare(input.usageSplit.countryRoadSharePct),
      highSpeedBrakeShare,
    },
    energyPerKm: {
      measured: measuredEnergy,
      proxy: proxyEnergy,
    },
    flat: {
      hardAccelPer100Km: metricValueOrZero(hardAccel),
      extremeAccelPer100Km: metricValueOrZero(extremeAccel),
      hardBrakePer100Km: metricValueOrZero(hardBrake),
      extremeBrakePer100Km: metricValueOrZero(extremeBrake),
      fullBrakingPer100Km: metricValueOrZero(fullBraking),
      kickdownPer100Km: metricValueOrZero(kickdown),
      launchLikePer100Km: metricValueOrZero(launchLike),
      brakesPer100Km: metricValueOrZero(brakesTotal),
      stopDensity: metricValueOrZero(stopDensityPerKm),
      highSpeedBrakeShare: metricValueOrZero(highSpeedBrakeShare),
      meanBrakeEnergyPerKm: metricValueOrZero(measuredEnergy),
      meanBrakeEnergyProxyPerKm: metricValueOrZero(proxyEnergy),
    },
  };
}
