import { Injectable, Logger } from '@nestjs/common';
import {
  isSyntheticPredictedGroundTruthLeak,
} from './tire-ground-truth.util';
import { PrismaService } from '@shared/database/prisma.service';
import {
  TIRE_HEALTH_CONFIG,
  isStaggeredSetup,
  parseAiTireSpec,
  resolveArchetype,
  resolveReferenceNewTread,
  resolveReplacementThreshold,
  resolveExpectedLifeKm,
  AiTireSpec,
  TireArchetype,
  TreadSource,
  NewTreadRefSource,
  ReplacementThresholdSource,
} from './tire-health.config';
import { DrivingImpactService, VehicleImpactForTire } from '../driving-impact/driving-impact.service';
import {
  buildTirePressureContext,
  extractDimoPerWheelTimestamps,
  extractDimoTpmsWarningFromPayload,
} from './tire-pressure-context.builder';
import type { TirePressureContext } from './tire-pressure-context.types';
import {
  resolveCapabilityGatedOdometerKm,
  resolveCapabilityGatedSpeedKmh,
} from './tire-dimo-context.builder';
import type { TireDimoContext } from './tire-dimo-context.types';
import {
  resolveAxleRecommendedPressureBar,
  resolveRecommendedTirePressure,
} from './tire-recommended-pressure';
import { TireSetupStatus, TireEvidenceSource } from '@prisma/client';

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface WearFactors {
  axleFactorFront: number;
  axleFactorRear: number;
  usageFactor: number;
  behaviorFactor: number;
  temperatureFactor: number;
  pressureFactorFront: number;
  pressureFactorRear: number;
  loadFactor: number;
  seasonMismatchFactor: number;
  interactionPenaltyFront: number;
  interactionPenaltyRear: number;
  regenBrakingFactorFront: number;
  regenBrakingFactorRear: number;
  kFactorFront: number;
  kFactorRear: number;
  isStaggered: boolean;
  staggeredLifeAdjustmentFront: number;
  staggeredLifeAdjustmentRear: number;
  regressionActive: boolean;
  regressionConfidence: number;
  calibrationCount: number;
  driveType: string | null;
  drivingImpactAvailable: boolean;
  tireArchetype: string;
  tireSpecMatched: boolean;
}

export interface WearExplainability {
  currentTreadSource: TreadSource;
  referenceNewTreadSource: NewTreadRefSource;
  replacementThresholdSource: ReplacementThresholdSource;
  tireSpecConfidence: number;
  tireArchetype: string;
  topWearDrivers: string[];
  pressureImpact: string;
  behaviorImpact: string;
  temperatureImpact: string;
  loadImpact: string;
  seasonMismatchImpact: string;
  possibleCauseHints: string[];
  pressureDataFreshness?: 'fresh' | 'aging' | 'stale' | 'no_data';
  pressureReadingsUsed?: number;
}

export interface TreadEstimate {
  frontLeftMm: number;
  frontRightMm: number;
  rearLeftMm: number;
  rearRightMm: number;
  frontPercent: number;
  rearPercent: number;
  overallPercent: number;
  estimatedRemainingKm: number;
  factors: WearFactors;
  explainability: WearExplainability;
  effectiveWearRateKmPerMm: { front: number; rear: number };
  referenceNewTreadFront: number;
  referenceNewTreadRear: number;
  operationalReplacementMm: number;
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  sampleCount: number;
  isUsable: boolean;
}

export interface WearAnalysisOptions {
  /** Historical replay instant — excludes measurements/trips after this time. */
  asOf?: Date;
  /** Pin a specific setup (replay); defaults to active setup. */
  tireSetupId?: string;
  /** Canonical pressure read model — when omitted, built from DIMO latest state only. */
  pressureContext?: TirePressureContext;
  /** Capability-gated DIMO tire context (ambient, odometer plausibility, TPMS). */
  dimoContext?: import('./tire-dimo-context.types').TireDimoContext | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function factorLabel(v: number): string {
  if (v <= 1.01) return 'neutral';
  if (v <= 1.06) return 'mild';
  if (v <= 1.12) return 'moderate';
  return 'significant';
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class TireWearModelService {
  private readonly logger = new Logger(TireWearModelService.name);
  private readonly cfg = TIRE_HEALTH_CONFIG;

  constructor(
    private readonly prisma: PrismaService,
    private readonly drivingImpactService: DrivingImpactService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //  AXLE FACTOR
  // ═══════════════════════════════════════════════════════════════════════════

  computeAxleFactor(
    axle: 'front' | 'rear',
    driveType: string | null,
    frontWeightDistPct: number | null,
  ): number {
    const dtKey = driveType?.toUpperCase() ?? 'default';
    const bias = this.cfg.drivetrainBias[dtKey] ?? this.cfg.drivetrainBias['default'];
    const drivetrainBias = axle === 'front' ? bias.front : bias.rear;

    const steeringBias = axle === 'front'
      ? this.cfg.steeringAxleBias.front
      : this.cfg.steeringAxleBias.rear;

    let dampedLoadFactor = 1.0;
    if (frontWeightDistPct != null && frontWeightDistPct > 0 && frontWeightDistPct < 100) {
      const frontRatio = frontWeightDistPct / 100;
      const rearRatio = 1 - frontRatio;
      const loadBias = axle === 'front'
        ? frontRatio / 0.50
        : rearRatio / 0.50;
      dampedLoadFactor = 1 + (loadBias - 1) * this.cfg.loadBiasDampingCoeff;
    }

    const raw = dampedLoadFactor * drivetrainBias * steeringBias;
    return round3(clamp(raw, this.cfg.factorCaps.axleMin, this.cfg.factorCaps.axleMax));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  USAGE FACTOR
  // ═══════════════════════════════════════════════════════════════════════════

  computeUsageFactor(impact: VehicleImpactForTire | null): number {
    if (!impact) return 1.0;
    const city = (impact.citySharePct ?? 33) / 100;
    const highway = (impact.highwaySharePct ?? 34) / 100;
    const country = (impact.countryRoadSharePct ?? 33) / 100;
    const total = city + highway + country || 1;

    const raw =
      (city / total) * this.cfg.usageFactors.city +
      (highway / total) * this.cfg.usageFactors.highway +
      (country / total) * this.cfg.usageFactors.countryRoad;

    return round3(clamp(raw, this.cfg.factorCaps.usageMin, this.cfg.factorCaps.usageMax));
  }

  computeUsageFactorFromPct(
    cityPct: number | null,
    highwayPct: number | null,
    countryPct: number | null,
  ): number {
    const city = (cityPct ?? 33) / 100;
    const highway = (highwayPct ?? 34) / 100;
    const country = (countryPct ?? 33) / 100;
    const total = city + highway + country || 1;

    const raw =
      (city / total) * this.cfg.usageFactors.city +
      (highway / total) * this.cfg.usageFactors.highway +
      (country / total) * this.cfg.usageFactors.countryRoad;

    return round3(clamp(raw, this.cfg.factorCaps.usageMin, this.cfg.factorCaps.usageMax));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BEHAVIOR FACTOR (modulated by aggressiveDrivingSensitivity)
  // ═══════════════════════════════════════════════════════════════════════════

  computeBehaviorFactor(impact: VehicleImpactForTire | null, spec: AiTireSpec | null = null): number {
    if (!impact) return 1.0;

    const w = this.cfg.behaviorFactorWeights;
    const longScore = impact.longitudinalStressScore ?? 0;
    const brakeScore = impact.brakingStressScore ?? 0;
    const stressScore = impact.drivingStressScore ?? 0;

    const weightedScore =
      w.longitudinal * longScore +
      w.braking * brakeScore +
      w.drivingStress * stressScore;

    let baseFactor = this.interpolateBehaviorFactor(weightedScore);

    // Modulate by tire-specific sensitivity: higher sensitivity amplifies the factor's departure from 1.0
    const sensitivity = spec?.aggressiveDrivingSensitivity;
    if (sensitivity != null && sensitivity >= 0 && sensitivity <= 2) {
      const departure = baseFactor - 1.0;
      baseFactor = 1.0 + departure * sensitivity;
    }

    return round3(clamp(baseFactor, this.cfg.factorCaps.behaviorMin, this.cfg.factorCaps.behaviorMax));
  }

  private interpolateBehaviorFactor(score: number): number {
    const anchors = this.cfg.behaviorScoreAnchors;
    if (score <= anchors[0].score) return anchors[0].factor;
    if (score >= anchors[anchors.length - 1].score) return anchors[anchors.length - 1].factor;

    for (let i = 0; i < anchors.length - 1; i++) {
      const lo = anchors[i];
      const hi = anchors[i + 1];
      if (score >= lo.score && score <= hi.score) {
        const t = (score - lo.score) / (hi.score - lo.score);
        return clamp(
          lo.factor + t * (hi.factor - lo.factor),
          this.cfg.factorCaps.behaviorMin,
          this.cfg.factorCaps.behaviorMax,
        );
      }
    }

    return 1.0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TEMPERATURE / HEAT STRESS FACTOR
  // ═══════════════════════════════════════════════════════════════════════════

  computeTemperatureFactor(avgTempC: number | null): number {
    if (avgTempC == null) return 1.0;
    const t = this.cfg.temperatureFactors;
    if (avgTempC < 0) return t.below0;
    if (avgTempC < 5) return t.from0to5;
    if (avgTempC <= 28) return t.from5to28;
    if (avgTempC <= 35) return t.from28to35;
    return t.above35;
  }

  computeWeightedTemperatureFactor(
    recentTrips: { outsideTemperatureStartC: number | null; distanceKm: number | null }[],
  ): number {
    if (recentTrips.length === 0) return 1.0;
    let totalDist = 0;
    let weightedSum = 0;
    for (const trip of recentTrips) {
      if (trip.outsideTemperatureStartC == null || !trip.distanceKm) continue;
      const f = this.computeTemperatureFactor(trip.outsideTemperatureStartC);
      weightedSum += f * trip.distanceKm;
      totalDist += trip.distanceKm;
    }
    return totalDist > 0 ? round3(weightedSum / totalDist) : 1.0;
  }

  /**
   * Heat stress model: combines ambient temperature, high-speed exposure,
   * underinflation contribution, and aggressive driving contribution.
   * Weighted by tire-specific heatSensitivity.
   */
  computeHeatStressFactor(
    baseTemperatureFactor: number,
    avgSpeedKmh: number | null,
    pressureFactor: number,
    behaviorFactor: number,
    spec: AiTireSpec | null,
    options?: { drivingImpactAvailable?: boolean },
  ): number {
    const hs = this.cfg.heatStress;

    const ambientComponent = baseTemperatureFactor - 1.0;
    const speedComponent = (avgSpeedKmh != null && avgSpeedKmh > hs.highSpeedThresholdKmh)
      ? hs.highSpeedExposureBonus * ((avgSpeedKmh - hs.highSpeedThresholdKmh) / 30)
      : 0;
    const pressureComponent = (pressureFactor - 1.0) * 0.5;
    const drivingComponent =
      options?.drivingImpactAvailable === true
        ? 0
        : (behaviorFactor - 1.0) * 0.3;

    const composite =
      hs.ambientWeight * ambientComponent +
      hs.speedWeight * speedComponent +
      hs.pressureWeight * pressureComponent +
      hs.drivingWeight * drivingComponent;

    let factor = 1.0 + composite;

    const heatSensitivity = spec?.heatSensitivity;
    if (heatSensitivity != null && heatSensitivity >= 0 && heatSensitivity <= 2) {
      const departure = factor - 1.0;
      factor = 1.0 + departure * heatSensitivity;
    }

    return round3(clamp(factor, this.cfg.factorCaps.temperatureMin, this.cfg.factorCaps.temperatureMax));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PRESSURE WEAR FACTOR
  // ═══════════════════════════════════════════════════════════════════════════

  computePressureFactor(
    axle: 'front' | 'rear',
    pressureLeft: number | null,
    pressureRight: number | null,
    recommendedBar: number | null,
    spec: AiTireSpec | null,
  ): number {
    const p = this.cfg.pressure;
    if (pressureLeft == null && pressureRight == null) return 1.0;
    if (recommendedBar == null || recommendedBar <= 0) return 1.0;

    const nominal = recommendedBar;

    const vals = [pressureLeft, pressureRight].filter((v): v is number => v != null);
    const avgPressure = vals.reduce((a, b) => a + b, 0) / vals.length;
    const deviation = Math.max(0, nominal - avgPressure);

    let stress = 0;
    stress += deviation * p.deviationPerBarPenalty;

    if (deviation >= p.underinflationThresholdBar) {
      stress += p.chronicUnderinflationPenalty;
    }
    if (deviation >= p.severeUnderinflationBar) {
      stress += p.severeEventPenalty;
    }

    if (vals.length === 2) {
      const sideImbalance = Math.abs(vals[0] - vals[1]);
      if (sideImbalance > p.axleImbalanceThresholdBar) {
        stress += p.sideImbalancePenalty;
      }
    }

    const sensitivity = spec?.underinflationSensitivity ?? 1.0;
    stress *= Math.max(0.5, Math.min(2.0, sensitivity));

    return round3(clamp(1.0 + stress, p.factorMin, p.factorMax));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LOAD FACTOR
  // ═══════════════════════════════════════════════════════════════════════════

  computeLoadFactor(
    curbWeightKg: number | null,
    driveType: string | null,
    spec: AiTireSpec | null,
  ): number {
    const l = this.cfg.load;
    if (curbWeightKg == null) return 1.0;

    const weightDelta = curbWeightKg - l.referenceWeightKg;
    let factor = 1.0 + (weightDelta / 1000) * l.weightPenaltyPerTon;

    if (driveType?.toUpperCase() === 'FWD') {
      factor += l.frontDrivenLoadBonus;
    }

    if (spec?.xl || spec?.reinforced) {
      factor *= l.xlReinforcedDiscount;
    }

    const payloadBias = spec?.payloadBias;
    if (payloadBias != null && payloadBias >= 0 && payloadBias <= 2) {
      const departure = factor - 1.0;
      factor = 1.0 + departure * payloadBias;
    }

    return round3(clamp(factor, l.factorMin, l.factorMax));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SEASON MISMATCH FACTOR
  // ═══════════════════════════════════════════════════════════════════════════

  computeSeasonMismatchFactor(
    tireSeason: string,
    avgTempC: number | null,
    highwaySharePct: number | null,
  ): number {
    const sm = this.cfg.seasonMismatch;
    if (avgTempC == null) return 1.0;

    const season = tireSeason.toUpperCase();

    if (season === 'WINTER' && avgTempC > sm.winterTireHotThresholdC) {
      return round3(Math.min(sm.winterTireHotPenalty, sm.factorMax));
    }

    if (season === 'ALL_SEASON' && avgTempC > sm.allSeasonHotThresholdC && (highwaySharePct ?? 0) > 50) {
      return round3(Math.min(sm.allSeasonHotHighwayPenalty, sm.factorMax));
    }

    if (season === 'SUMMER' && avgTempC < sm.summerTireColdThresholdC) {
      return round3(Math.min(sm.summerTireColdPenalty, sm.factorMax));
    }

    return 1.0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INTERACTION PENALTY
  // ═══════════════════════════════════════════════════════════════════════════

  computeInteractionPenalty(
    behaviorFactor: number,
    pressureFactor: number,
    temperatureFactor: number,
    seasonMismatchFactor: number,
    avgSpeedKmh: number | null,
  ): number {
    const ic = this.cfg.interaction;
    let penalty = 0;

    const behaviorElevated = behaviorFactor > ic.threshold;
    const pressureElevated = pressureFactor > ic.threshold;
    const tempElevated = temperatureFactor > ic.threshold;
    const mismatchActive = seasonMismatchFactor > 1.01;
    const highSpeed = (avgSpeedKmh ?? 0) > this.cfg.heatStress.highSpeedThresholdKmh;

    if (behaviorElevated && pressureElevated) penalty += ic.aggressivePlusUnderinflation;
    if (tempElevated && pressureElevated) penalty += ic.heatPlusUnderinflation;
    if (highSpeed && tempElevated && pressureElevated) penalty += ic.highSpeedPlusHeatPlusUnderinflation;
    if (mismatchActive && tempElevated) penalty += ic.seasonMismatchPlusHeat;

    return round3(clamp(1.0 + penalty, this.cfg.factorCaps.interactionMin, this.cfg.factorCaps.interactionMax));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  REGEN BRAKING
  // ═══════════════════════════════════════════════════════════════════════════

  computeRegenFactor(fuelType: string | null): number {
    if (!fuelType) return 1.0;
    const ft = fuelType.toUpperCase();
    if (ft.includes('ELECTRIC') || ft === 'EV' || ft === 'BEV') return 0.82;
    if (ft.includes('HYBRID') || ft === 'PHEV' || ft === 'HEV') return 0.9;
    return 1.0;
  }

  computePositionalRegenFactors(
    fuelType: string | null,
    driveType: string | null,
  ): { front: number; rear: number; overall: number } {
    if (!fuelType) return { front: 1.0, rear: 1.0, overall: 1.0 };

    const ft = fuelType.toUpperCase();
    const isEv = ft.includes('ELECTRIC') || ft === 'EV' || ft === 'BEV';
    const isHybrid = ft.includes('HYBRID') || ft === 'PHEV' || ft === 'HEV';
    if (!isEv && !isHybrid) return { front: 1.0, rear: 1.0, overall: 1.0 };

    const cfgRegen = isEv ? this.cfg.regenFactors.ev : this.cfg.regenFactors.hybrid;
    const dt = driveType?.toUpperCase() ?? 'default';
    const factors = cfgRegen[dt] ?? cfgRegen['default'];

    return { front: factors.front, rear: factors.rear, overall: (factors.front + factors.rear) / 2 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  STAGGERED SETUP
  // ═══════════════════════════════════════════════════════════════════════════

  computeStaggeredLifeAdjustment(tireWidthMm: number | null): number {
    if (tireWidthMm == null) return 1.0;
    const stag = this.cfg.staggered;
    const widthDelta = tireWidthMm - stag.referenceWidthMm;
    const adjustment = 1.0 - (widthDelta / 10) * stag.widthLifeAdjustmentPer10mm;
    return clamp(adjustment, stag.minLifeMultiplier, stag.maxLifeMultiplier);
  }

  isRotationAllowedForStaggered(template: string): boolean {
    return this.cfg.staggered.allowedRotationTemplates.includes(template);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  K-FACTOR CALIBRATION
  // ═══════════════════════════════════════════════════════════════════════════

  calibrateKFactor(
    currentK: number,
    anchorTreadMm: number,
    predictedCurrentMm: number,
    measuredCurrentMm: number,
    measurementCount: number,
  ): { newK: number; alpha: number } {
    const c = this.cfg.calibration;
    const predictedWear = anchorTreadMm - predictedCurrentMm;
    const actualWear = anchorTreadMm - measuredCurrentMm;

    if (predictedWear < c.minPredictedWearForCalibrationMm) {
      return { newK: currentK, alpha: 0 };
    }

    const targetK = actualWear / predictedWear;
    let alpha: number;
    if (measurementCount <= 1) alpha = c.alphaFirstMeasurement;
    else if (measurementCount <= c.fewMeasurementsThreshold) alpha = c.alphaFewMeasurements;
    else alpha = c.alphaStabilized;

    const newK = (1 - alpha) * currentK + alpha * targetK;
    return {
      newK: round3(clamp(newK, c.minK, c.maxK)),
      alpha,
    };
  }

  async calibrateFromMeasurement(
    setupId: string,
    measurement: {
      frontLeftMm?: number;
      frontRightMm?: number;
      rearLeftMm?: number;
      rearRightMm?: number;
    },
  ): Promise<{ kFactorFront: number; kFactorRear: number; calibrationCount: number }> {
    const setup = await this.prisma.vehicleTireSetup.findUniqueOrThrow({
      where: { id: setupId },
    });

    const initialFront = setup.initialTreadFrontMm ?? setup.initialTreadDepthMm ?? this.cfg.defaultInitialTreadFallbackMm;
    const initialRear = setup.initialTreadRearMm ?? setup.initialTreadDepthMm ?? this.cfg.defaultInitialTreadFallbackMm;

    const analysis = await this.computeWearAnalysis(setup.vehicleId);
    if (!analysis) {
      return { kFactorFront: setup.kFactorFront, kFactorRear: setup.kFactorRear, calibrationCount: setup.kFactorCalibrationCount };
    }

    const predictedFrontAvg = (analysis.frontLeftMm + analysis.frontRightMm) / 2;
    const predictedRearAvg = (analysis.rearLeftMm + analysis.rearRightMm) / 2;

    const frontVals = [measurement.frontLeftMm, measurement.frontRightMm].filter((v): v is number => v != null);
    const rearVals = [measurement.rearLeftMm, measurement.rearRightMm].filter((v): v is number => v != null);
    const actualFrontAvg = frontVals.length > 0 ? frontVals.reduce((a, b) => a + b, 0) / frontVals.length : null;
    const actualRearAvg = rearVals.length > 0 ? rearVals.reduce((a, b) => a + b, 0) / rearVals.length : null;

    const count = setup.kFactorCalibrationCount;
    let newKFront = setup.kFactorFront;
    let newKRear = setup.kFactorRear;

    if (actualFrontAvg != null) {
      const result = this.calibrateKFactor(setup.kFactorFront, initialFront, predictedFrontAvg, actualFrontAvg, count);
      newKFront = result.newK;
    }
    if (actualRearAvg != null) {
      const result = this.calibrateKFactor(setup.kFactorRear, initialRear, predictedRearAvg, actualRearAvg, count);
      newKRear = result.newK;
    }

    const newCount = count + 1;

    await this.prisma.vehicleTireSetup.update({
      where: { id: setupId },
      data: {
        kFactorFront: newKFront,
        kFactorRear: newKRear,
        kFactorCalibrationCount: newCount,
      },
    });

    return { kFactorFront: newKFront, kFactorRear: newKRear, calibrationCount: newCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  REGRESSION MODEL (with improved data hygiene)
  // ═══════════════════════════════════════════════════════════════════════════

  fitLinearRegression(dataPoints: { x: number; y: number }[]): RegressionResult {
    const n = dataPoints.length;
    if (n < 2) return { slope: 0, intercept: 0, rSquared: 0, sampleCount: n, isUsable: false };

    const filtered = this.removeOutliers(dataPoints);
    const fn = filtered.length;
    if (fn < 2) return { slope: 0, intercept: 0, rSquared: 0, sampleCount: fn, isUsable: false };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const p of filtered) { sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumX2 += p.x * p.x; }

    const denom = fn * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: 0, rSquared: 0, sampleCount: fn, isUsable: false };

    const slope = (fn * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / fn;

    const yMean = sumY / fn;
    let ssTot = 0, ssRes = 0;
    for (const p of filtered) { ssTot += (p.y - yMean) ** 2; ssRes += (p.y - (slope * p.x + intercept)) ** 2; }
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    const isUsable = fn >= this.cfg.regression.minDataPointsForRegression && rSquared >= 0.3 && slope < 0;
    return { slope: round3(slope * 100) / 100, intercept: round3(intercept), rSquared: round3(rSquared), sampleCount: fn, isUsable };
  }

  private removeOutliers(points: { x: number; y: number }[]): { x: number; y: number }[] {
    if (points.length < 4) return points;
    const ys = points.map(p => p.y);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const std = Math.sqrt(ys.reduce((s, v) => s + (v - mean) ** 2, 0) / ys.length);
    if (std < 0.01) return points;
    return points.filter(p => Math.abs(p.y - mean) <= this.cfg.regression.outlierStdDevThreshold * std);
  }

  /**
   * Improved regression data hygiene: filter out invalid segments before fitting.
   */
  private filterRegressionDataPoints(
    rawPoints: { distanceKm: number; actualTreadMm: number; predictedTreadMm: number; initialTreadMm: number }[],
  ): { x: number; y: number }[] {
    const reg = this.cfg.regression;
    const sorted = [...rawPoints].sort((a, b) => a.distanceKm - b.distanceKm);
    const result: { x: number; y: number }[] = [];
    let prevDist = -reg.minDistanceKmBetweenPoints;
    let prevTread = Infinity;

    for (const p of sorted) {
      if (p.distanceKm <= 0) continue;
      if (p.actualTreadMm <= 0 || p.actualTreadMm > p.initialTreadMm + 1) continue;
      if (isSyntheticPredictedGroundTruthLeak(p.actualTreadMm, p.predictedTreadMm)) continue;
      if (p.distanceKm - prevDist < reg.minDistanceKmBetweenPoints) continue;
      if (prevTread < Infinity && p.actualTreadMm - prevTread > reg.maxTreadJumpMm) continue;

      result.push({ x: p.distanceKm, y: p.actualTreadMm });
      prevDist = p.distanceKm;
      prevTread = p.actualTreadMm;
    }
    return result;
  }

  blendFormulaAndRegression(formulaWearMm: number, regressionWearMm: number | null, dataPointCount: number): number {
    if (regressionWearMm == null) return formulaWearMm;
    const reg = this.cfg.regression;
    if (dataPointCount < reg.regressionBlendStartPoints) return formulaWearMm;
    if (dataPointCount >= reg.regressionBlendFullPoints) return regressionWearMm;
    const progress = (dataPointCount - reg.regressionBlendStartPoints) / (reg.regressionBlendFullPoints - reg.regressionBlendStartPoints);
    return formulaWearMm * (1 - progress) + regressionWearMm * progress;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FULL WEAR ANALYSIS V2
  //
  //  effectiveWearRate = base × axle × usage × behavior × temperature
  //                      × pressure × load × seasonMismatch × regen
  //                      × k × interaction
  // ═══════════════════════════════════════════════════════════════════════════

  async computeWearAnalysis(
    vehicleId: string,
    options: WearAnalysisOptions = {},
  ): Promise<TreadEstimate | null> {
    const asOf = options.asOf;
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { fuelType: true, driveType: true, curbWeightKg: true, frontWeightDistributionPct: true },
    });

    const setup = options.tireSetupId
      ? await this.prisma.vehicleTireSetup.findFirst({
          where: { id: options.tireSetupId, vehicleId },
          include: {
            measurements: {
              where: asOf ? { measuredAt: { lte: asOf } } : undefined,
              orderBy: { measuredAt: 'desc' },
            },
          },
        })
      : await this.prisma.vehicleTireSetup.findFirst({
          where: { vehicleId, removedAt: null, status: TireSetupStatus.ACTIVE },
          orderBy: { createdAt: 'desc' },
          include: {
            measurements: {
              where: asOf ? { measuredAt: { lte: asOf } } : undefined,
              orderBy: { measuredAt: 'desc' },
            },
          },
        });

    if (!setup) return null;

    const dimoContext: TireDimoContext | null = options.dimoContext ?? null;

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: {
        odometerKm: true,
        tirePressureFl: true, tirePressureFr: true,
        tirePressureRl: true, tirePressureRr: true,
        speedKmh: true,
        providerSource: true,
        sourceTimestamp: true,
        providerFetchedAt: true,
        lastSeenAt: true,
        rawPayloadJson: true,
      },
    });

    // ── AI spec + archetype resolution ──────────────────────────────────────
    const spec = parseAiTireSpec(setup.aiTireSpec);
    const recommendedPressure = resolveRecommendedTirePressure(setup);
    const recommendedFront = resolveAxleRecommendedPressureBar(
      'front',
      recommendedPressure,
    );
    const recommendedRear = resolveAxleRecommendedPressureBar(
      'rear',
      recommendedPressure,
    );

    const pressureContext =
      options.pressureContext ??
      buildTirePressureContext({
        asOf,
        recommendedPressure,
        dimo: latestState
          ? {
              tirePressureFl: latestState.tirePressureFl,
              tirePressureFr: latestState.tirePressureFr,
              tirePressureRl: latestState.tirePressureRl,
              tirePressureRr: latestState.tirePressureRr,
              providerSource: latestState.providerSource,
              sourceTimestamp: latestState.sourceTimestamp,
              providerFetchedAt: latestState.providerFetchedAt,
              lastSeenAt: latestState.lastSeenAt,
              perWheelTimestamps: extractDimoPerWheelTimestamps(
                latestState.rawPayloadJson,
              ),
              tpmsWarning: extractDimoTpmsWarningFromPayload(
                latestState.rawPayloadJson,
              ),
            }
          : null,
      });
    const season = setup.tireSeason ?? 'ALL_SEASON';
    const archetype = resolveArchetype(spec, season);
    const tireSpecMatched = spec != null && (spec.matchedBrand != null || spec.matchedModel != null);

    // ── Reference new tread + replacement threshold (source priority) ───────
    const refNewTread = resolveReferenceNewTread(
      setup.initialTreadFrontMm, setup.initialTreadRearMm, setup.initialTreadDepthMm,
      spec, archetype, season,
    );
    const replThreshold = resolveReplacementThreshold(spec, archetype, season);
    const operationalReplacementMm = replThreshold.mm;

    const initialFront = refNewTread.front;
    const initialRear = refNewTread.rear;
    const isStaggered = isStaggeredSetup(setup);
    const currentOdometer = resolveCapabilityGatedOdometerKm(
      dimoContext,
      latestState?.odometerKm ?? null,
    );
    const gatedSpeedKmh = resolveCapabilityGatedSpeedKmh(
      dimoContext,
      latestState?.speedKmh ?? null,
    );

    // ── Regen factors ─────────────────────────────────────────────────────
    const regenPositional = this.computePositionalRegenFactors(vehicle?.fuelType ?? null, vehicle?.driveType ?? null);
    const regenFront = setup.regenBrakingFactorFront ?? regenPositional.front;
    const regenRear = setup.regenBrakingFactorRear ?? regenPositional.rear;

    // ── Staggered adjustments ─────────────────────────────────────────────
    const staggeredFrontAdj = isStaggered ? this.computeStaggeredLifeAdjustment(setup.frontTireWidthMm) : 1.0;
    const staggeredRearAdj = isStaggered ? this.computeStaggeredLifeAdjustment(setup.rearTireWidthMm) : 1.0;

    // ── Axle factor ───────────────────────────────────────────────────────
    const axleFactorFront = this.computeAxleFactor('front', vehicle?.driveType ?? null, vehicle?.frontWeightDistributionPct ?? null);
    const axleFactorRear = this.computeAxleFactor('rear', vehicle?.driveType ?? null, vehicle?.frontWeightDistributionPct ?? null);

    // ── Driving Impact Engine data ────────────────────────────────────────
    const impact = await this.drivingImpactService.getVehicleImpactForTire(vehicleId);
    const usageFactor = this.computeUsageFactor(impact);
    const behaviorFactor = this.computeBehaviorFactor(impact, spec);

    // ── Temperature factor (from recent trips) ────────────────────────────
    const ninetyDaysAgo = new Date(
      (asOf ?? new Date()).getTime() - 90 * 24 * 60 * 60 * 1000,
    );
    const recentTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        startTime: {
          gte: ninetyDaysAgo,
          ...(asOf ? { lte: asOf } : {}),
        },
      },
      select: { outsideTemperatureStartC: true, distanceKm: true },
      take: 200,
    });
    const baseTemperatureFactor = this.computeWeightedTemperatureFactor(recentTrips);

    const ambientAvgForSeason =
      dimoContext?.ambient.usable && dimoContext.ambient.weightedAvgTempC != null
        ? dimoContext.ambient.weightedAvgTempC
        : null;

    // ── Pressure factor (staleness + minimum readings aware) ────────────────
    const pressureReadings = [
      pressureContext.frontLeft,
      pressureContext.frontRight,
      pressureContext.rearLeft,
      pressureContext.rearRight,
    ].filter((v): v is number => v != null);
    const pressureFreshness = pressureContext.overallFreshness;
    const pressureInputsActive = pressureContext.wearEligibility.eligible;
    const pressureFactorFront = this.computePressureFactor(
      'front',
      pressureInputsActive ? (pressureContext.frontLeft ?? null) : null,
      pressureInputsActive ? (pressureContext.frontRight ?? null) : null,
      pressureInputsActive ? recommendedFront : null,
      spec,
    );
    const pressureFactorRear = this.computePressureFactor(
      'rear',
      pressureInputsActive ? (pressureContext.rearLeft ?? null) : null,
      pressureInputsActive ? (pressureContext.rearRight ?? null) : null,
      pressureInputsActive ? recommendedRear : null,
      spec,
    );

    // ── Heat stress factor (upgraded temperature) ─────────────────────────
    const avgPressureFactor = (pressureFactorFront + pressureFactorRear) / 2;
    const temperatureFactor = this.computeHeatStressFactor(
      baseTemperatureFactor,
      gatedSpeedKmh,
      avgPressureFactor,
      behaviorFactor,
      spec,
      { drivingImpactAvailable: impact != null },
    );

    // ── Load factor ───────────────────────────────────────────────────────
    const loadFactor = this.computeLoadFactor(vehicle?.curbWeightKg ?? null, vehicle?.driveType ?? null, spec);

    // ── Season mismatch ───────────────────────────────────────────────────
    const tripAvgTemp = recentTrips.length > 0
      ? recentTrips.filter(t => t.outsideTemperatureStartC != null).reduce((s, t) => s + (t.outsideTemperatureStartC ?? 0), 0) / Math.max(1, recentTrips.filter(t => t.outsideTemperatureStartC != null).length)
      : null;
    const avgTemp = ambientAvgForSeason ?? tripAvgTemp;
    const highwayPct = impact?.highwaySharePct ?? null;
    const seasonMismatchFactor = this.computeSeasonMismatchFactor(season, avgTemp, highwayPct);

    // ── Interaction penalty ───────────────────────────────────────────────
    const interactionPenalty = this.computeInteractionPenalty(
      behaviorFactor, avgPressureFactor, temperatureFactor, seasonMismatchFactor, gatedSpeedKmh,
    );

    // ── Model-aware expected life ─────────────────────────────────────────
    const resolvedLifeKm = resolveExpectedLifeKm(spec, archetype, season, setup.expectedLifeKm);
    const baseFrontLifeKm = (isStaggered && setup.expectedLifeKmFront ? setup.expectedLifeKmFront : resolvedLifeKm) * staggeredFrontAdj;
    const baseRearLifeKm = (isStaggered && setup.expectedLifeKmRear ? setup.expectedLifeKmRear : resolvedLifeKm) * staggeredRearAdj;

    const usableFront = initialFront - operationalReplacementMm;
    const usableRear = initialRear - operationalReplacementMm;
    if (usableFront <= 0 || usableRear <= 0) {
      this.logger.warn(`Invalid tread config for vehicle ${vehicleId}: initial=${initialFront}/${initialRear} replace=${operationalReplacementMm}`);
    }

    const baseWearMmPerKmFront = usableFront > 0 ? usableFront / baseFrontLifeKm : 0;
    const baseWearMmPerKmRear = usableRear > 0 ? usableRear / baseRearLifeKm : 0;

    // ── Composite effective wear (V2 formula) ───────────────────────────
    const effectiveWearFront = baseWearMmPerKmFront
      * axleFactorFront * usageFactor * behaviorFactor * temperatureFactor
      * pressureFactorFront * loadFactor * seasonMismatchFactor
      * setup.kFactorFront * regenFront * interactionPenalty;

    const effectiveWearRear = baseWearMmPerKmRear
      * axleFactorRear * usageFactor * behaviorFactor * temperatureFactor
      * pressureFactorRear * loadFactor * seasonMismatchFactor
      * setup.kFactorRear * regenRear * interactionPenalty;

    const effectiveWearRateFront = effectiveWearFront > 0 ? 1 / effectiveWearFront : 999999;
    const effectiveWearRateRear = effectiveWearRear > 0 ? 1 / effectiveWearRear : 999999;

    // ── Regression blend ──────────────────────────────────────────────────
    let regressionActive = false;
    let regressionConfidence = 0;
    let regressionWearRateFront: number | null = null;
    let regressionWearRateRear: number | null = null;
    let dataPointCount = 0;

    try {
      const dataPoints = await this.prisma.tireWearDataPoint.findMany({
        where: {
          vehicleId,
          tireSetId: setup.id,
          ...(asOf ? { createdAt: { lte: asOf } } : {}),
        },
        orderBy: { createdAt: 'asc' },
      });
      dataPointCount = dataPoints.length;

      if (dataPointCount >= this.cfg.regression.minDataPointsForRegression) {
        const frontRaw = dataPoints.filter(d => d.axle === 'front').map(d => ({
          distanceKm: d.distanceKm, actualTreadMm: d.actualTreadMm,
          predictedTreadMm: d.predictedTreadMm, initialTreadMm: d.initialTreadMm,
        }));
        const rearRaw = dataPoints.filter(d => d.axle === 'rear').map(d => ({
          distanceKm: d.distanceKm, actualTreadMm: d.actualTreadMm,
          predictedTreadMm: d.predictedTreadMm, initialTreadMm: d.initialTreadMm,
        }));

        const frontFiltered = this.filterRegressionDataPoints(frontRaw);
        const rearFiltered = this.filterRegressionDataPoints(rearRaw);

        const frontReg = this.fitLinearRegression(frontFiltered);
        const rearReg = this.fitLinearRegression(rearFiltered);

        if (frontReg.isUsable) { regressionWearRateFront = 1.0 / Math.abs(frontReg.slope); regressionActive = true; regressionConfidence = Math.max(regressionConfidence, frontReg.rSquared); }
        if (rearReg.isUsable) { regressionWearRateRear = 1.0 / Math.abs(rearReg.slope); regressionActive = true; regressionConfidence = Math.max(regressionConfidence, rearReg.rSquared); }
      }
    } catch (e) {
      this.logger.warn(`Regression data fetch failed: ${(e as Error).message}`);
    }

    // ── Compute estimated tread per wheel ─────────────────────────────────
    let fl: number, fr: number, rl: number, rr: number;
    let currentTreadSource: TreadSource = 'fallback_estimate';

    if (setup.measurements.length > 0) {
      const latest = setup.measurements[0];
      fl = latest.frontLeftMm ?? initialFront;
      fr = latest.frontRightMm ?? initialFront;
      rl = latest.rearLeftMm ?? initialRear;
      rr = latest.rearRightMm ?? initialRear;
      currentTreadSource = 'manual_measurement';

      if (latest.odometerAtMeasurement != null && currentOdometer != null) {
        const kmSince = currentOdometer - latest.odometerAtMeasurement;
        if (kmSince > 0) {
          currentTreadSource = 'calibration_projection';
          const finalFrontRate = regressionWearRateFront != null ? this.blendFormulaAndRegression(effectiveWearRateFront, regressionWearRateFront, dataPointCount) : effectiveWearRateFront;
          const finalRearRate = regressionWearRateRear != null ? this.blendFormulaAndRegression(effectiveWearRateRear, regressionWearRateRear, dataPointCount) : effectiveWearRateRear;
          const frontWearMm = kmSince / finalFrontRate;
          const rearWearMm = kmSince / finalRearRate;
          fl = Math.max(0, fl - frontWearMm);
          fr = Math.max(0, fr - frontWearMm);
          rl = Math.max(0, rl - rearWearMm);
          rr = Math.max(0, rr - rearWearMm);
        }
      }
    } else {
      fl = initialFront; fr = initialFront; rl = initialRear; rr = initialRear;
      const baselineEvidence = setup.initialTreadEvidenceSource as TireEvidenceSource | null | undefined;
      if (baselineEvidence === TireEvidenceSource.DEFAULT_ASSUMPTION) {
        currentTreadSource = 'fallback_estimate';
      } else {
        currentTreadSource = 'initial_manual_plus_wear';
      }
      if (setup.installedOdometerKm != null && currentOdometer != null) {
        const kmDriven = currentOdometer - setup.installedOdometerKm;
        if (kmDriven > 0) {
          const finalFrontRate = regressionWearRateFront != null ? this.blendFormulaAndRegression(effectiveWearRateFront, regressionWearRateFront, dataPointCount) : effectiveWearRateFront;
          const finalRearRate = regressionWearRateRear != null ? this.blendFormulaAndRegression(effectiveWearRateRear, regressionWearRateRear, dataPointCount) : effectiveWearRateRear;
          fl = Math.max(0, initialFront - kmDriven / finalFrontRate);
          fr = Math.max(0, initialFront - kmDriven / finalFrontRate);
          rl = Math.max(0, initialRear - kmDriven / finalRearRate);
          rr = Math.max(0, initialRear - kmDriven / finalRearRate);
        }
      }
    }

    // ── Health percent & remaining ────────────────────────────────────────
    const frontAvg = (fl + fr) / 2;
    const rearAvg = (rl + rr) / 2;

    const frontPercent = usableFront > 0
      ? Math.round(clamp((frontAvg - operationalReplacementMm) / usableFront * 100, 0, 100))
      : 0;
    const rearPercent = usableRear > 0
      ? Math.round(clamp((rearAvg - operationalReplacementMm) / usableRear * 100, 0, 100))
      : 0;
    const overallPercent = Math.round((frontPercent + rearPercent) / 2);

    const lowestTread = Math.min(fl, fr, rl, rr);
    const remainingMm = lowestTread - operationalReplacementMm;
    const estimatedRemainingKm = remainingMm > 0
      ? Math.round(remainingMm / Math.max(effectiveWearFront, effectiveWearRear, 0.0001))
      : 0;

    // ── Explainability ────────────────────────────────────────────────────
    const topDrivers: string[] = [];
    const driverEntries: [string, number][] = [
      ['behavior', behaviorFactor],
      ['pressure', avgPressureFactor],
      ['temperature', temperatureFactor],
      ['load', loadFactor],
      ['seasonMismatch', seasonMismatchFactor],
      ['interaction', interactionPenalty],
      ['usage', usageFactor],
    ];
    driverEntries.sort((a, b) => b[1] - a[1]);
    for (const [name, val] of driverEntries) {
      if (val > 1.02 && topDrivers.length < 3) topDrivers.push(name);
    }

    const hints: string[] = [...pressureContext.qualityWarnings];
    if (!pressureInputsActive) {
      hints.push('Pressure factor neutral — eligibility gates not met.');
    } else if (pressureFactorFront > 1.06 || pressureFactorRear > 1.06) {
      hints.push('Check tire pressures — underinflation detected');
    }
    if (behaviorFactor > 1.15) hints.push('Aggressive driving behavior is accelerating wear');
    if (seasonMismatchFactor > 1.02) hints.push('Tire season may not match current operating conditions');
    if (loadFactor > 1.06) hints.push('Vehicle weight above average for tire class');

    const explainability: WearExplainability = {
      currentTreadSource,
      referenceNewTreadSource: refNewTread.source,
      replacementThresholdSource: replThreshold.source,
      tireSpecConfidence: spec?.confidenceScore ?? 0,
      tireArchetype: archetype,
      topWearDrivers: topDrivers,
      pressureImpact: factorLabel(avgPressureFactor),
      behaviorImpact: factorLabel(behaviorFactor),
      temperatureImpact: factorLabel(temperatureFactor),
      loadImpact: factorLabel(loadFactor),
      seasonMismatchImpact: factorLabel(seasonMismatchFactor),
      possibleCauseHints: hints,
      pressureDataFreshness: pressureFreshness,
      pressureReadingsUsed: pressureInputsActive ? pressureReadings.length : 0,
    };

    return {
      frontLeftMm: round3(fl),
      frontRightMm: round3(fr),
      rearLeftMm: round3(rl),
      rearRightMm: round3(rr),
      frontPercent: clamp(frontPercent, 0, 100),
      rearPercent: clamp(rearPercent, 0, 100),
      overallPercent: clamp(overallPercent, 0, 100),
      estimatedRemainingKm,
      referenceNewTreadFront: round3(initialFront),
      referenceNewTreadRear: round3(initialRear),
      operationalReplacementMm: round3(operationalReplacementMm),
      factors: {
        axleFactorFront: round3(axleFactorFront),
        axleFactorRear: round3(axleFactorRear),
        usageFactor: round3(usageFactor),
        behaviorFactor: round3(behaviorFactor),
        temperatureFactor: round3(temperatureFactor),
        pressureFactorFront: round3(pressureFactorFront),
        pressureFactorRear: round3(pressureFactorRear),
        loadFactor: round3(loadFactor),
        seasonMismatchFactor: round3(seasonMismatchFactor),
        interactionPenaltyFront: round3(interactionPenalty),
        interactionPenaltyRear: round3(interactionPenalty),
        regenBrakingFactorFront: round3(regenFront),
        regenBrakingFactorRear: round3(regenRear),
        kFactorFront: round3(setup.kFactorFront),
        kFactorRear: round3(setup.kFactorRear),
        isStaggered,
        staggeredLifeAdjustmentFront: round3(staggeredFrontAdj),
        staggeredLifeAdjustmentRear: round3(staggeredRearAdj),
        regressionActive,
        regressionConfidence: round3(regressionConfidence),
        calibrationCount: setup.kFactorCalibrationCount,
        driveType: vehicle?.driveType ?? null,
        drivingImpactAvailable: impact != null,
        tireArchetype: archetype,
        tireSpecMatched,
      },
      explainability,
      effectiveWearRateKmPerMm: {
        front: Math.round(effectiveWearRateFront),
        rear: Math.round(effectiveWearRateRear),
      },
    };
  }
}
