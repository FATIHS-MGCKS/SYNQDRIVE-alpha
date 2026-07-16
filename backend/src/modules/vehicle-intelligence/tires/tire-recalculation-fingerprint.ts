import { createHash } from 'crypto';
import { TireEvidenceSource } from '@prisma/client';
import { TIRE_HEALTH_CONFIG, parseAiTireSpec } from './tire-health.config';
import {
  TIRE_WEAR_MODEL_VERSION,
  TIRE_RECALCULATION_MODEL_VERSION,
  computeTireWearModelConfigHash,
} from './tire-wear-model-version';
import {
  classifySeasonStatus,
  classifyTireAgeYears,
  dotAgeYears,
} from './tire-status';
import type { VehicleImpactForTire } from '../driving-impact/driving-impact.service';

export {
  TIRE_WEAR_MODEL_VERSION,
  TIRE_RECALCULATION_MODEL_VERSION,
  computeTireWearModelConfigHash,
};

export type PressureFreshnessBucket = 'fresh' | 'aging' | 'stale' | 'no_data';

export interface TireRecalculationMeasurementInput {
  id: string;
  createdAt: string;
  measuredAt: string;
  source: string;
  evidenceSource: TireEvidenceSource | null;
  odometerAtMeasurement: number | null;
  frontLeftMm: number | null;
  frontRightMm: number | null;
  rearLeftMm: number | null;
  rearRightMm: number | null;
}

export interface TireRecalculationTireInput {
  id: string;
  currentPosition: string;
  dotCode: string | null;
  initialTreadDepthMm: number;
  estimatedTreadMm: number | null;
  initialTreadEvidenceSource: TireEvidenceSource | null;
}

export interface TireRecalculationRegressionPointInput {
  id: string;
  axle: string;
  distanceKm: number;
  actualTreadMm: number;
  predictedTreadMm: number;
  actualMeasurementId: string | null;
}

export interface TireRecalculationTemperatureTripInput {
  distanceKm: number | null;
  outsideTemperatureStartC: number | null;
}

export interface TireRecalculationInputContext {
  setupId: string;
  setupUpdatedAt: string;
  vehicle: {
    fuelType: string | null;
    driveType: string | null;
    curbWeightKg: number | null;
    frontWeightDistributionPct: number | null;
  };
  setup: {
    tireSeason: string;
    tireCondition: string | null;
    isStaggered: boolean;
    frontDimension: string | null;
    rearDimension: string | null;
    brandModelFront: string | null;
    brandModelRear: string | null;
    initialTreadDepthMm: number | null;
    initialTreadFrontMm: number | null;
    initialTreadRearMm: number | null;
    initialTreadEvidenceSource: TireEvidenceSource | null;
    baselineStatus: string | null;
    baselineConfidence: number | null;
    referenceNewTreadMm: number | null;
    operationalReplacementMm: number | null;
    expectedLifeKm: number | null;
    expectedLifeKmFront: number | null;
    expectedLifeKmRear: number | null;
    frontTireWidthMm: number | null;
    rearTireWidthMm: number | null;
    dotCodeFront: string | null;
    dotCodeRear: string | null;
    installedOdometerKm: number | null;
    odometerAnchorStatus: string | null;
    kFactorFront: number;
    kFactorRear: number;
    kFactorCalibrationCount: number;
    regenBrakingFactorFront: number | null;
    regenBrakingFactorRear: number | null;
    aiTireSpec: unknown;
  };
  ledgerAggregate: {
    totalKmOnSet: number;
    cityKm: number;
    highwayKm: number;
    ruralKm: number;
    harshAccelEvents: number;
    harshBrakeEvents: number;
    harshCornerEvents: number;
  };
  tires: TireRecalculationTireInput[];
  measurements: TireRecalculationMeasurementInput[];
  regressionPoints: TireRecalculationRegressionPointInput[];
  latestState: {
    odometerKm: number | null;
    tirePressureFl: number | null;
    tirePressureFr: number | null;
    tirePressureRl: number | null;
    tirePressureRr: number | null;
    speedKmh: number | null;
    pressureFreshness: PressureFreshnessBucket;
  };
  drivingImpact: VehicleImpactForTire | null;
  temperatureTrips: TireRecalculationTemperatureTripInput[];
  modelVersion?: string;
  asOf?: Date;
}

export interface TireRecalculationFingerprint {
  modelVersion: string;
  modelConfigHash: string;
  inputFingerprint: string;
  timePolicyBucket: string;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundPressure(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return round1(value);
}

function stableSortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortObject);
  }
  if (value != null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSortObject((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(stableSortObject(value));
}

/** Deterministic hash of the active tire-health config (thresholds, factors). */
export function computeTireHealthConfigHash(
  config: typeof TIRE_HEALTH_CONFIG = TIRE_HEALTH_CONFIG,
): string {
  return computeTireWearModelConfigHash(config);
}

/** Pressure freshness bucket — excludes raw provider timestamps from the hash. */
export function resolvePressureFreshnessBucket(
  timestamp: Date | null | undefined,
  hasData: boolean,
  asOf: Date = new Date(),
): PressureFreshnessBucket {
  if (!hasData) return 'no_data';
  if (!timestamp) return 'aging';
  const ageMs = asOf.getTime() - timestamp.getTime();
  if (ageMs < 2 * 60 * 60 * 1000) return 'fresh';
  if (ageMs < 12 * 60 * 60 * 1000) return 'aging';
  return 'stale';
}

/**
 * Controlled time buckets for alert-driving rules (season calendar, measurement
 * overdue, tire age). Uses explicit policy bands — never raw `now()` in the hash.
 */
export function computeTireRecalculationTimePolicyBucket(
  ctx: Pick<
    TireRecalculationInputContext,
    'setup' | 'measurements'
  >,
  asOf: Date = new Date(),
): string {
  const month = asOf.getUTCMonth() + 1;
  const season = classifySeasonStatus(ctx.setup.tireSeason, asOf);
  const latestMeas = ctx.measurements[0] ?? null;
  const measAgeDays = latestMeas
    ? Math.floor(
        (asOf.getTime() - new Date(latestMeas.measuredAt).getTime()) / 86_400_000,
      )
    : null;

  let measurementBand: string;
  if (measAgeDays == null) {
    measurementBand = 'never_measured';
  } else if (measAgeDays < TIRE_HEALTH_CONFIG.measurementFreshness.overdueDays) {
    measurementBand = 'current';
  } else if (measAgeDays < TIRE_HEALTH_CONFIG.measurementFreshness.staleDays) {
    measurementBand = 'overdue';
  } else {
    measurementBand = 'stale';
  }

  const dotAges = [
    dotAgeYears(ctx.setup.dotCodeFront, asOf),
    dotAgeYears(ctx.setup.dotCodeRear, asOf),
  ].filter((v): v is number => v != null);
  const maxAgeYears = dotAges.length > 0 ? Math.max(...dotAges) : null;
  const ageStatus = classifyTireAgeYears(maxAgeYears);
  const tireAgeBand =
    maxAgeYears == null
      ? 'unknown'
      : ageStatus === 'WARNING'
        ? 'replace_recommended'
        : ageStatus === 'WATCH'
          ? 'aging'
          : 'young';

  return `${month}:${season.expectedSeason}:${measurementBand}:${tireAgeBand}`;
}

function summarizeTemperatureContext(
  trips: TireRecalculationTemperatureTripInput[],
): { tripCount: number; weightedTempBucket: number | null } {
  let totalDist = 0;
  let weightedSum = 0;
  for (const trip of trips) {
    if (trip.outsideTemperatureStartC == null || !trip.distanceKm) continue;
    weightedSum += trip.outsideTemperatureStartC * trip.distanceKm;
    totalDist += trip.distanceKm;
  }
  return {
    tripCount: trips.length,
    weightedTempBucket:
      totalDist > 0 ? round1(weightedSum / totalDist) : null,
  };
}

function summarizeDrivingImpact(impact: VehicleImpactForTire | null) {
  if (!impact) return null;
  return {
    windowDays: impact.windowDays,
    distanceKmWindow: impact.distanceKmWindow != null ? round3(impact.distanceKmWindow) : null,
    citySharePct: impact.citySharePct != null ? round1(impact.citySharePct) : null,
    highwaySharePct: impact.highwaySharePct != null ? round1(impact.highwaySharePct) : null,
    countryRoadSharePct:
      impact.countryRoadSharePct != null ? round1(impact.countryRoadSharePct) : null,
    longitudinalStressScore:
      impact.longitudinalStressScore != null ? round1(impact.longitudinalStressScore) : null,
    brakingStressScore:
      impact.brakingStressScore != null ? round1(impact.brakingStressScore) : null,
    drivingStressScore:
      impact.drivingStressScore != null ? round1(impact.drivingStressScore) : null,
  };
}

function canonicalizeAiSpec(raw: unknown) {
  const spec = parseAiTireSpec(raw);
  if (!spec) return null;
  return stableSortObject(spec);
}

/** Build the canonical, sorted input payload hashed for deduplication. */
export function buildTireRecalculationInputPayload(
  ctx: TireRecalculationInputContext,
  asOf: Date = ctx.asOf ?? new Date(),
): Record<string, unknown> {
  const tires = [...ctx.tires]
    .sort((a, b) => a.currentPosition.localeCompare(b.currentPosition))
    .map((tire) => ({
      id: tire.id,
      position: tire.currentPosition,
      dotCode: tire.dotCode,
      initialTreadDepthMm: round1(tire.initialTreadDepthMm),
      estimatedTreadMm:
        tire.estimatedTreadMm != null ? round1(tire.estimatedTreadMm) : null,
      initialTreadEvidenceSource: tire.initialTreadEvidenceSource,
    }));

  const measurements = [...ctx.measurements]
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
    .map((m) => ({
      id: m.id,
      version: m.createdAt,
      measuredAt: m.measuredAt,
      source: m.source,
      evidenceSource: m.evidenceSource,
      odometerAtMeasurement:
        m.odometerAtMeasurement != null ? round3(m.odometerAtMeasurement) : null,
      frontLeftMm: m.frontLeftMm != null ? round1(m.frontLeftMm) : null,
      frontRightMm: m.frontRightMm != null ? round1(m.frontRightMm) : null,
      rearLeftMm: m.rearLeftMm != null ? round1(m.rearLeftMm) : null,
      rearRightMm: m.rearRightMm != null ? round1(m.rearRightMm) : null,
    }));

  const regressionPoints = [...ctx.regressionPoints]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => ({
      id: p.id,
      axle: p.axle,
      distanceKm: round3(p.distanceKm),
      actualTreadMm: round1(p.actualTreadMm),
      predictedTreadMm: round1(p.predictedTreadMm),
      actualMeasurementId: p.actualMeasurementId,
    }));

  return {
    setupId: ctx.setupId,
    setupRevision: ctx.setupUpdatedAt,
    vehicle: ctx.vehicle,
    setup: {
      ...ctx.setup,
      aiTireSpec: canonicalizeAiSpec(ctx.setup.aiTireSpec),
      initialTreadDepthMm:
        ctx.setup.initialTreadDepthMm != null
          ? round1(ctx.setup.initialTreadDepthMm)
          : null,
      initialTreadFrontMm:
        ctx.setup.initialTreadFrontMm != null
          ? round1(ctx.setup.initialTreadFrontMm)
          : null,
      initialTreadRearMm:
        ctx.setup.initialTreadRearMm != null
          ? round1(ctx.setup.initialTreadRearMm)
          : null,
      referenceNewTreadMm:
        ctx.setup.referenceNewTreadMm != null
          ? round1(ctx.setup.referenceNewTreadMm)
          : null,
      operationalReplacementMm:
        ctx.setup.operationalReplacementMm != null
          ? round1(ctx.setup.operationalReplacementMm)
          : null,
      kFactorFront: round3(ctx.setup.kFactorFront),
      kFactorRear: round3(ctx.setup.kFactorRear),
    },
    ledgerAggregate: {
      totalKmOnSet: round3(ctx.ledgerAggregate.totalKmOnSet),
      cityKm: round3(ctx.ledgerAggregate.cityKm),
      highwayKm: round3(ctx.ledgerAggregate.highwayKm),
      ruralKm: round3(ctx.ledgerAggregate.ruralKm),
      harshAccelEvents: ctx.ledgerAggregate.harshAccelEvents,
      harshBrakeEvents: ctx.ledgerAggregate.harshBrakeEvents,
      harshCornerEvents: ctx.ledgerAggregate.harshCornerEvents,
    },
    tires,
    measurements,
    regressionPoints,
    pressureContext: {
      odometerKm:
        ctx.latestState.odometerKm != null ? round3(ctx.latestState.odometerKm) : null,
      tirePressureFl: roundPressure(ctx.latestState.tirePressureFl),
      tirePressureFr: roundPressure(ctx.latestState.tirePressureFr),
      tirePressureRl: roundPressure(ctx.latestState.tirePressureRl),
      tirePressureRr: roundPressure(ctx.latestState.tirePressureRr),
      speedKmh:
        ctx.latestState.speedKmh != null ? round1(ctx.latestState.speedKmh) : null,
      freshness: ctx.latestState.pressureFreshness,
    },
    temperatureContext: summarizeTemperatureContext(ctx.temperatureTrips),
    drivingImpact: summarizeDrivingImpact(ctx.drivingImpact),
    timePolicyBucket: computeTireRecalculationTimePolicyBucket(ctx, asOf),
  };
}

export function computeTireRecalculationInputFingerprint(
  ctx: TireRecalculationInputContext,
  options?: {
    modelVersion?: string;
    modelConfigHash?: string;
    asOf?: Date;
  },
): TireRecalculationFingerprint {
  const modelVersion = options?.modelVersion ?? ctx.modelVersion ?? TIRE_RECALCULATION_MODEL_VERSION;
  const modelConfigHash = options?.modelConfigHash ?? computeTireHealthConfigHash();
  const asOf = options?.asOf ?? ctx.asOf ?? new Date();
  const payload = buildTireRecalculationInputPayload(ctx, asOf);
  const timePolicyBucket = String(payload.timePolicyBucket);
  const inputFingerprint = createHash('sha256')
    .update(
      canonicalJson({
        modelVersion,
        modelConfigHash,
        payload,
      }),
    )
    .digest('hex');

  return { modelVersion, modelConfigHash, inputFingerprint, timePolicyBucket };
}
