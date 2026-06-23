import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TireWearModelService, WearExplainability } from './tire-wear-model.service';
import { DrivingImpactService } from '../driving-impact/driving-impact.service';
import {
  TIRE_HEALTH_CONFIG,
  isStaggeredSetup,
  parseAiTireSpec,
  resolveArchetype,
  resolveReplacementThreshold,
  resolveReferenceNewTread,
} from './tire-health.config';
import {
  TireStatus,
  TireDisplayMode,
  TireConfidenceLevel,
  TireAlertCode,
  classifyTreadStatus,
  classifyRemainingKmStatus,
  classifyUnevenWear,
  classifySeasonStatus,
  classifyConfidenceLevel,
  confidenceLevelToLabel,
  confidenceLevelToScore,
  resolveDisplayMode,
  classifyMeasurementOverdue,
  classifyTireAgeYears,
  dotAgeYears,
  aggregateTireStatus,
  alertTypeToCode,
} from './tire-status';
import {
  TireHealthStatus,
  TireChangeType,
  TireEventType,
  TireSetupStatus,
} from '@prisma/client';

// ── Public interfaces ─────────────────────────────────────────────────────────

interface PerWheelEstimate {
  position: string;
  treadMm: number;
  wearPercent: number;
  remainingKm: number;
  healthStatus: string;
  initialTreadMm: number;
  lastMeasuredMm: number | null;
  lastMeasuredAt: string | null;
  confidenceScore: number;
  confidenceLabel: string;
  brand: string | null;
  tireModel: string | null;
  size: string | null;
  totalKm: number;
  cityKm: number;
  highwayKm: number;
  ruralKm: number;
}

export type TireActionState =
  | 'OBSERVE'
  | 'CHECK_SOON'
  | 'PLAN_SERVICE'
  | 'REPLACE';

export type PressureFreshness = 'fresh' | 'aging' | 'stale' | 'no_data';

export interface TirePressureContext {
  source: 'DIMO' | 'HM' | 'MIXED' | 'NONE';
  dimoFreshness: PressureFreshness;
  hmFreshness: PressureFreshness;
  overallStatus: 'OK' | 'ISSUE' | 'STALE' | 'UNKNOWN';
  warningHints: string[];
}

export interface TireReadContext {
  hmTirePressure?: import('../../high-mobility/high-mobility-signal-usage.service').HmTirePressureSignals | null;
}

export interface TireHealthSummary {
  overallPercent: number;
  overallRemainingKm: number;
  healthStatus: string;
  confidenceScore: number;
  confidenceLabel: string;
  worstTirePosition: string | null;
  worstTirePercent: number | null;
  activeSetupName: string | null;
  activeSetupId: string | null;
  tireSeason: string | null;
  installedAt: string | null;
  totalKmOnSet: number;
  wearRateMmPer1000km: number | null;
  alerts: TireAlert[];
  tireCondition: string;
  tireArchetype: string | null;
  tireSpecMatched: boolean;
  tireSpecConfidence: number | null;
  dataCompletenessConfidence: number | null;
  modelConfidence: number | null;
  referenceNewTreadSource: string | null;
  replacementThresholdSource: string | null;
  currentTreadSource: string | null;
  operationalReplacementMm: number | null;
  topWearDrivers: string[];
  actionState: TireActionState;
  actionReasons: string[];
  measurementState: 'measured' | 'estimated' | 'mixed';
  dataQualityWarnings: string[];
  pressureContext: TirePressureContext;
  latestMeasurementAt: string | null;

  // ── Canonical read model (single honest tire truth) ────────────────────────
  // These are the fields every consumer (Vehicle Detail Quick Box, Fleet
  // Condition, VehicleHealthStatus, alert detector) should read. They make the
  // measured-vs-estimated distinction explicit and never imply fake precision.
  overallStatus: TireStatus;
  displayMode: TireDisplayMode;
  confidence: TireConfidenceLevel;
  lowestTreadMm: number | null;
  lowestTreadPosition: string | null;
  measuredTreadMm: number | null;
  estimatedTreadMm: number | null;
  displayTreadMm: number | null;
  lastMeasurementAt: string | null;
  measurementAgeDays: number | null;
  estimatedRemainingKm: number | null;
  pressureStatus: TireStatus;
  seasonStatus: TireStatus;
  unevenWearStatus: TireStatus;
  recommendations: string[];

  /** Whether the vehicle has an ACTIVE tire setup (canonical data-quality flag). */
  hasActiveSet: boolean;
  /** Whether the vehicle has any tire setup records (active or stored). */
  hasSetups: boolean;
  /** Whether tread measurements exist for this vehicle. */
  hasMeasurements: boolean;
}

export interface TireHealthDetail {
  summary: TireHealthSummary;
  wheels: PerWheelEstimate[];
  usageSplit: { city: number; highway: number; rural: number };
  factors: Record<string, any>;
  explainability: WearExplainability | null;
  effectiveWearRate: { front: number; rear: number };
  rotationHistory: RotationHistoryEntry[];
  measurements: MeasurementEntry[];
  alerts: TireAlert[];
}

export interface TireAlert {
  type: string;
  /** Canonical, stable alert code consumers can switch on (see tire-status.ts). */
  code?: TireAlertCode;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  position?: string;
  value?: number;
}

export interface RotationHistoryEntry {
  id: string;
  date: string;
  odometerKm: number | null;
  changeType: string;
  rotationTemplate: string | null;
  notes: string | null;
  createdBy: string | null;
  moves: { tireId?: string; from: string | null; to: string }[];
}

export interface MeasurementEntry {
  id: string;
  date: string;
  odometerKm: number | null;
  source: string;
  workshopName: string | null;
  values: { position: string; mm: number }[];
}

export interface ConfidenceDimensions {
  score: number;
  label: string;
  tireSpecConfidence: number;
  dataCompletenessConfidence: number;
  modelConfidence: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class TireHealthService {
  private readonly logger = new Logger(TireHealthService.name);
  private readonly cfg = TIRE_HEALTH_CONFIG;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wearModel: TireWearModelService,
    private readonly drivingImpactService: DrivingImpactService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //  GET SUMMARY (Quick Box DTO)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Tire inventory / measurement flags for consumers that need data-quality
   * context when {@link getSummary} returns null (no active set).
   */
  async getTireDataQuality(vehicleId: string): Promise<
    Pick<TireHealthSummary, 'hasActiveSet' | 'hasSetups' | 'hasMeasurements'>
  > {
    const setup = await this.getActiveSetup(vehicleId);
    return this.resolveInventoryFlags(vehicleId, setup);
  }

  async getSummary(
    vehicleId: string,
    readContext: TireReadContext = {},
  ): Promise<TireHealthSummary | null> {
    const setup = await this.getActiveSetup(vehicleId);
    if (!setup) return null;

    const inventoryFlags = await this.resolveInventoryFlags(vehicleId, setup);
    const pressureContext = await this.resolvePressureContext(
      vehicleId,
      readContext.hmTirePressure ?? null,
    );
    const wearAnalysis = await this.wearModel.computeWearAnalysis(vehicleId);
    if (!wearAnalysis) return this.buildEmptySummary(setup, pressureContext, inventoryFlags);

    const baseConfidence = await this.computeConfidence(vehicleId, setup);
    const confidence = this.applyPressureConfidenceOverlay(
      baseConfidence,
      pressureContext,
    );
    const alerts = await this.detectAlerts(
      vehicleId,
      setup,
      wearAnalysis,
      this.resolveUnifiedConfidence(
        setup,
        this.resolveMeasurementState(wearAnalysis.explainability.currentTreadSource),
      ).score,
    );

    return this.buildSummaryPayload(
      setup,
      wearAnalysis,
      confidence,
      alerts,
      pressureContext,
      inventoryFlags,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GET DETAIL (Modal DTO)
  // ═══════════════════════════════════════════════════════════════════════════

  async getDetail(
    vehicleId: string,
    readContext: TireReadContext = {},
  ): Promise<TireHealthDetail | null> {
    const setup = await this.getActiveSetup(vehicleId);
    if (!setup) return null;

    const pressureContext = await this.resolvePressureContext(
      vehicleId,
      readContext.hmTirePressure ?? null,
    );
    const wearAnalysis = await this.wearModel.computeWearAnalysis(vehicleId);
    const baseConfidence = await this.computeConfidence(vehicleId, setup);
    const confidence = this.applyPressureConfidenceOverlay(
      baseConfidence,
      pressureContext,
    );
    const alerts = wearAnalysis
      ? await this.detectAlerts(
          vehicleId,
          setup,
          wearAnalysis,
          this.resolveUnifiedConfidence(
            setup,
            this.resolveMeasurementState(wearAnalysis.explainability.currentTreadSource),
          ).score,
        )
      : [];

    const wheels = this.buildWheelEstimates(setup, wearAnalysis, confidence);
    const usageSplit = this.computeUsageSplit(setup);
    const rotationHistory = await this.getRotationHistory(vehicleId);
    const measurements = await this.getMeasurements(vehicleId, setup.id);
    const inventoryFlags = await this.resolveInventoryFlags(vehicleId, setup);

    const summary = wearAnalysis
      ? this.buildSummaryPayload(
          setup,
          wearAnalysis,
          confidence,
          alerts,
          pressureContext,
          inventoryFlags,
        )
      : this.buildEmptySummary(setup, pressureContext, inventoryFlags);

    return {
      summary,
      wheels,
      usageSplit,
      factors: wearAnalysis?.factors ?? {},
      explainability: wearAnalysis?.explainability ?? null,
      effectiveWearRate: {
        front: wearAnalysis?.effectiveWearRateKmPerMm.front ?? 0,
        rear: wearAnalysis?.effectiveWearRateKmPerMm.rear ?? 0,
      },
      rotationHistory,
      measurements,
      alerts,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RECALCULATE
  // ═══════════════════════════════════════════════════════════════════════════

  async recalculate(vehicleId: string) {
    const setup = await this.getActiveSetup(vehicleId);
    if (!setup) return null;

    const wearAnalysis = await this.wearModel.computeWearAnalysis(vehicleId);
    if (!wearAnalysis) return null;

    const confidence = await this.computeConfidence(vehicleId, setup);
    const wheels = [
      { pos: 'FL', mm: wearAnalysis.frontLeftMm },
      { pos: 'FR', mm: wearAnalysis.frontRightMm },
      { pos: 'RL', mm: wearAnalysis.rearLeftMm },
      { pos: 'RR', mm: wearAnalysis.rearRightMm },
    ];
    const lowestTread = Math.min(...wheels.map(w => w.mm));

    const wheelPercents = wheels.map(w => {
      const isFront = w.pos.startsWith('F');
      return this.computeWheelPercentV2(
        w.mm,
        isFront ? wearAnalysis.referenceNewTreadFront : wearAnalysis.referenceNewTreadRear,
        wearAnalysis.operationalReplacementMm,
      );
    });
    const minPercent = Math.min(...wheelPercents);
    const avgPercent = wheelPercents.reduce((s, v) => s + v, 0) / wheelPercents.length;
    const setLevelPercent = Math.round(
      Math.max(0, Math.min(100,
        this.cfg.setLevelHealth.minWeight * minPercent +
        this.cfg.setLevelHealth.avgWeight * avgPercent,
      )),
    );

    const effectiveRate = Math.max(wearAnalysis.effectiveWearRateKmPerMm.front, wearAnalysis.effectiveWearRateKmPerMm.rear, 1);
    const wearRateMmPer1000km = effectiveRate > 0 ? Math.round(1000 / effectiveRate * 100) / 100 : null;

    const healthStatus = this.classifyHealthStatus(setLevelPercent, lowestTread, setup.tireSeason);

    const measurementState = this.resolveMeasurementState(
      wearAnalysis.explainability.currentTreadSource,
    );
    const unified = this.resolveUnifiedConfidence(setup, measurementState);
    const confDiscount =
      this.cfg.remainingKmConfidenceDiscount[unified.label.toLowerCase()] ?? 0.85;
    const adjustedRemainingKm = Math.round(wearAnalysis.estimatedRemainingKm * confDiscount);

    await this.prisma.vehicleTireSetup.update({
      where: { id: setup.id },
      data: {
        overallHealthPercent: setLevelPercent,
        overallRemainingKm: adjustedRemainingKm,
        healthStatus,
        confidenceScore: unified.score,
        confidenceLabel: unified.label,
        tireSpecConfidence: confidence.tireSpecConfidence,
        dataCompletenessConfidence: confidence.dataCompletenessConfidence,
        modelConfidence: confidence.modelConfidence,
        referenceNewTreadMm: wearAnalysis.referenceNewTreadFront,
        operationalReplacementMm: wearAnalysis.operationalReplacementMm,
        referenceNewTreadSource: wearAnalysis.explainability.referenceNewTreadSource,
        replacementThresholdSource: wearAnalysis.explainability.replacementThresholdSource,
        initialTreadSource: wearAnalysis.explainability.currentTreadSource,
        lastRecalculatedAt: new Date(),
        wearRateMmPer1000km,
      },
    });

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { organizationId: true } });
    const latestState = await this.prisma.vehicleLatestState.findUnique({ where: { vehicleId }, select: { odometerKm: true } });

    await this.prisma.tireHealthSnapshot.create({
      data: {
        organizationId: vehicle!.organizationId,
        vehicleId,
        tireSetId: setup.id,
        snapshotDate: new Date(),
        odometerKm: latestState?.odometerKm ?? null,
        estimatedTreadMm: lowestTread,
        estimatedWearPercent: 100 - setLevelPercent,
        estimatedRemainingKm: adjustedRemainingKm,
        citySharePercent: setup.totalKmOnSet > 0 ? Math.round(setup.cityKm / setup.totalKmOnSet * 100) : null,
        highwaySharePercent: setup.totalKmOnSet > 0 ? Math.round(setup.highwayKm / setup.totalKmOnSet * 100) : null,
        ruralSharePercent: setup.totalKmOnSet > 0 ? Math.round(setup.ruralKm / setup.totalKmOnSet * 100) : null,
        confidenceScore: unified.score,
        wearRateMmPer1000km,
      },
    });

    // ── Persist regression data points ──
    const currentOdo = latestState?.odometerKm ?? null;
    const installedOdo = setup.installedOdometerKm ?? null;
    if (currentOdo != null && installedOdo != null && currentOdo > installedOdo) {
      const distanceKm = currentOdo - installedOdo;
      const frontAvgPredicted = (wearAnalysis.frontLeftMm + wearAnalysis.frontRightMm) / 2;
      const rearAvgPredicted = (wearAnalysis.rearLeftMm + wearAnalysis.rearRightMm) / 2;
      const latestMeas = setup.measurements?.[0] ?? null;
      const measFrontVals = [latestMeas?.frontLeftMm, latestMeas?.frontRightMm].filter((v): v is number => v != null);
      const measRearVals = [latestMeas?.rearLeftMm, latestMeas?.rearRightMm].filter((v): v is number => v != null);
      const actualFrontAvg = measFrontVals.length > 0 ? measFrontVals.reduce((a, b) => a + b, 0) / measFrontVals.length : frontAvgPredicted;
      const actualRearAvg = measRearVals.length > 0 ? measRearVals.reduce((a, b) => a + b, 0) / measRearVals.length : rearAvgPredicted;

      const baseDataPoint = {
        organizationId: vehicle!.organizationId,
        vehicleId,
        tireSetId: setup.id,
        distanceKm,
        climateFactor: wearAnalysis.factors.temperatureFactor,
        roadSurfaceFactor: 1.0,
        roadTypeFactor: wearAnalysis.factors.usageFactor,
        drivingStyleFactor: wearAnalysis.factors.behaviorFactor,
        regenFactor: (wearAnalysis.factors.regenBrakingFactorFront + wearAnalysis.factors.regenBrakingFactorRear) / 2,
        curbWeightKg: null as number | null,
        tireSeason: setup.tireSeason,
      };

      await this.prisma.tireWearDataPoint.createMany({
        data: [
          {
            ...baseDataPoint,
            axle: 'front',
            predictedTreadMm: frontAvgPredicted,
            actualTreadMm: actualFrontAvg,
            initialTreadMm: wearAnalysis.referenceNewTreadFront,
            tireWidthMm: setup.frontTireWidthMm ?? null,
          },
          {
            ...baseDataPoint,
            axle: 'rear',
            predictedTreadMm: rearAvgPredicted,
            actualTreadMm: actualRearAvg,
            initialTreadMm: wearAnalysis.referenceNewTreadRear,
            tireWidthMm: setup.rearTireWidthMm ?? null,
          },
        ],
      }).catch((e) => this.logger.warn(`Failed to write wear data points: ${e.message}`));
    }

    await this.prisma.tireEvent.create({
      data: {
        organizationId: vehicle!.organizationId,
        vehicleId,
        tireSetId: setup.id,
        type: TireEventType.RECALCULATION,
        payload: { overallPercent: setLevelPercent, remainingKm: adjustedRemainingKm, confidence: confidence.score, healthStatus },
      },
    });

    return { overallPercent: setLevelPercent, remainingKm: adjustedRemainingKm, healthStatus, confidence };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ROTATION HISTORY
  // ═══════════════════════════════════════════════════════════════════════════

  async getRotationHistory(vehicleId: string): Promise<RotationHistoryEntry[]> {
    const events = await this.prisma.tireEvent.findMany({
      where: { vehicleId, type: { in: [TireEventType.ROTATION, TireEventType.TIRE_CHANGE, TireEventType.INSTALL] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const positionHistory = await this.prisma.tirePositionHistory.findMany({
      where: { vehicleId },
      orderBy: { changedAt: 'desc' },
      take: 100,
    });
    const grouped = new Map<string, typeof positionHistory>();
    for (const ph of positionHistory) {
      const key = ph.changedAt.toISOString();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(ph);
    }
    return events.map(ev => {
      const payload = (ev.payload as any) ?? {};
      return {
        id: ev.id,
        date: ev.createdAt.toISOString(),
        odometerKm: payload.odometerKm ?? null,
        changeType: ev.type,
        rotationTemplate: payload.template ?? null,
        notes: payload.notes ?? null,
        createdBy: ev.createdBy,
        moves: (grouped.get(ev.createdAt.toISOString()) ?? []).map(m => ({ tireId: m.tireId ?? undefined, from: m.fromPosition, to: m.toPosition })),
      };
    });
  }

  async updateTireUsageFromTrip(
    vehicleId: string,
    tripData: {
      distanceKm: number;
      cityPercent: number; highwayPercent: number; ruralPercent: number;
      harshBrakeCount: number; harshAccelCount: number; harshCornerCount: number;
    },
  ) {
    const setup = await this.getActiveSetup(vehicleId);
    if (!setup) return;
    const totalKm = tripData.distanceKm;
    await this.prisma.vehicleTireSetup.update({
      where: { id: setup.id },
      data: {
        totalKmOnSet: { increment: totalKm },
        cityKm: { increment: totalKm * (tripData.cityPercent / 100) },
        highwayKm: { increment: totalKm * (tripData.highwayPercent / 100) },
        ruralKm: { increment: totalKm * (tripData.ruralPercent / 100) },
        harshAccelEvents: { increment: tripData.harshAccelCount },
        harshBrakeEvents: { increment: tripData.harshBrakeCount },
        harshCornerEvents: { increment: tripData.harshCornerCount },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MULTI-DIMENSIONAL CONFIDENCE
  // ═══════════════════════════════════════════════════════════════════════════

  private async computeConfidence(vehicleId: string, setup: any): Promise<ConfidenceDimensions> {
    const c = this.cfg.confidence;
    let legacyScore = 0;
    let specScore = 0;
    let dataScore = 0;
    let modelScore = 0;

    // ── Tire spec confidence ─────────────────────────────────────────────
    const spec = parseAiTireSpec(setup.aiTireSpec);
    if (spec?.matchedBrand || spec?.matchedModel) {
      specScore += 30;
      legacyScore += c.aiTireSpecMatched;
    }
    if (spec?.confidenceScore != null) specScore += Math.round(spec.confidenceScore * 40);
    if (spec?.userConfirmedSpec) specScore += 30;
    specScore = Math.max(0, Math.min(100, specScore));

    // ── Data completeness confidence ─────────────────────────────────────
    if (setup.initialTreadDepthMm != null || setup.initialTreadFrontMm != null) { dataScore += 20; legacyScore += c.initialTreadExists; }
    if (setup.frontDimension) { dataScore += 10; legacyScore += c.tireSizeComplete; }
    if (setup.brandModelFront) { dataScore += 8; legacyScore += c.brandModelExists; }

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: {
        odometerKm: true,
        tirePressureFl: true,
        tirePressureFr: true,
        tirePressureRl: true,
        tirePressureRr: true,
        sourceTimestamp: true,
        providerFetchedAt: true,
        lastSeenAt: true,
      },
    });
    if (latestState?.odometerKm != null) { dataScore += 12; legacyScore += c.odometerConsistent; }
    const pressureValues = [
      latestState?.tirePressureFl,
      latestState?.tirePressureFr,
      latestState?.tirePressureRl,
      latestState?.tirePressureRr,
    ].filter((v): v is number => v != null);
    const pressureFreshness = this.resolveFreshness(
      latestState?.sourceTimestamp ??
        latestState?.providerFetchedAt ??
        latestState?.lastSeenAt ??
        null,
      pressureValues.length > 0,
    );
    if (pressureValues.length >= 2) {
      dataScore += 5;
      legacyScore += c.tirePressureAvailable;
    }
    if (pressureFreshness === 'stale') {
      dataScore -= 3;
      legacyScore -= 2;
    }
    if (pressureFreshness === 'no_data') {
      dataScore -= 5;
      legacyScore -= 3;
    }

    const impact = await this.drivingImpactService.getVehicleImpactForTire(vehicleId);
    if (impact) { dataScore += 10; legacyScore += c.usageSplitAvailable; }
    if (impact && (impact.longitudinalStressScore != null || impact.brakingStressScore != null)) {
      dataScore += 10; legacyScore += c.drivingImpactAvailable;
    }

    if (setup.totalKmOnSet >= 500) { dataScore += 5; legacyScore += c.atLeast500kmObserved; }
    if (setup.totalKmOnSet >= 2000) { dataScore += 5; legacyScore += c.atLeast2000kmObserved; }

    const measurementCount = setup.measurements?.length ?? 0;
    if (measurementCount >= 1) { dataScore += 8; legacyScore += c.atLeast1ManualMeasurement; }
    if (measurementCount >= 2) { dataScore += 7; legacyScore += c.atLeast2Measurements; }

    dataScore = Math.max(0, Math.min(100, dataScore));

    // ── Model confidence ─────────────────────────────────────────────────
    if (setup.kFactorCalibrationCount >= (this.cfg.calibration.stabilizedThreshold ?? 4)) {
      modelScore += 25; legacyScore += c.kFactorStabilized;
    }
    if (measurementCount >= 2) modelScore += 20;
    if (setup.totalKmOnSet >= 2000) modelScore += 15;
    if (impact) modelScore += 15;
    if (spec) modelScore += 15;
    if (pressureValues.length >= 2 && pressureFreshness !== 'stale') modelScore += 10;
    else if (pressureValues.length >= 2) modelScore += 4;
    modelScore = Math.max(0, Math.min(100, modelScore));

    legacyScore = Math.max(0, Math.min(100, legacyScore));

    let label: string;
    if (legacyScore >= this.cfg.confidenceThresholds.high) label = 'High';
    else if (legacyScore >= this.cfg.confidenceThresholds.medium) label = 'Medium';
    else label = 'Low';

    return {
      score: legacyScore,
      label,
      tireSpecConfidence: specScore,
      dataCompletenessConfidence: dataScore,
      modelConfidence: modelScore,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ALERTS
  // ═══════════════════════════════════════════════════════════════════════════

  private async detectAlerts(
    vehicleId: string,
    setup: any,
    wearAnalysis: any,
    confidenceScore: number,
  ): Promise<TireAlert[]> {
    const alerts: TireAlert[] = [];
    const a = this.cfg.alerts;
    const r = this.cfg.rotationReview;

    const operationalReplace = wearAnalysis.operationalReplacementMm ?? this.cfg.defaultReplaceThresholdMm;

    const wheels = [
      { pos: 'FL', mm: wearAnalysis.frontLeftMm },
      { pos: 'FR', mm: wearAnalysis.frontRightMm },
      { pos: 'RL', mm: wearAnalysis.rearLeftMm },
      { pos: 'RR', mm: wearAnalysis.rearRightMm },
    ];

    for (const w of wheels) {
      const treadStatus = classifyTreadStatus(w.mm, setup.tireSeason);
      if (treadStatus === 'CRITICAL') {
        alerts.push({
          type: 'CRITICAL_TREAD',
          severity: 'critical',
          message: `${w.pos}: Tread at or below legal minimum (${w.mm.toFixed(1)} mm)`,
          position: w.pos,
          value: w.mm,
        });
      } else if (treadStatus === 'WARNING') {
        alerts.push({
          type: 'LOW_TREAD',
          severity: 'warning',
          message: `${w.pos}: Tread low — plan replacement (${w.mm.toFixed(1)} mm)`,
          position: w.pos,
          value: w.mm,
        });
      } else if (w.mm <= operationalReplace + 0.3) {
        alerts.push({
          type: 'LOW_TREAD',
          severity: 'warning',
          message: `${w.pos}: Tread approaching operational limit (${w.mm.toFixed(1)} mm)`,
          position: w.pos,
          value: w.mm,
        });
      }
    }

    if (wearAnalysis.estimatedRemainingKm <= a.criticalRemainingKm) {
      alerts.push({ type: 'CRITICAL_REMAINING_KM', severity: 'critical', message: `Replacement imminent (${wearAnalysis.estimatedRemainingKm.toLocaleString()} km remaining)`, value: wearAnalysis.estimatedRemainingKm });
    } else if (wearAnalysis.estimatedRemainingKm <= a.lowRemainingKm) {
      alerts.push({ type: 'LOW_REMAINING_KM', severity: 'warning', message: `Plan replacement soon (${wearAnalysis.estimatedRemainingKm.toLocaleString()} km remaining)`, value: wearAnalysis.estimatedRemainingKm });
    }

    const sideDeltaFront = Math.abs(wearAnalysis.frontLeftMm - wearAnalysis.frontRightMm);
    const sideDeltaRear = Math.abs(wearAnalysis.rearLeftMm - wearAnalysis.rearRightMm);
    for (const [label, delta] of [['Front', sideDeltaFront], ['Rear', sideDeltaRear]] as const) {
      if (delta >= a.unevenWearCriticalMm) {
        alerts.push({ type: 'UNEVEN_WEAR_CRITICAL', severity: 'critical', message: `${label}: Critical side wear imbalance (${delta.toFixed(1)} mm)`, value: delta });
      } else if (delta >= a.unevenWearAttentionMm) {
        alerts.push({ type: 'UNEVEN_WEAR_ATTENTION', severity: 'warning', message: `${label}: Side wear imbalance detected (${delta.toFixed(1)} mm)`, value: delta });
      }
    }

    const frontAvg = (wearAnalysis.frontLeftMm + wearAnalysis.frontRightMm) / 2;
    const rearAvg = (wearAnalysis.rearLeftMm + wearAnalysis.rearRightMm) / 2;
    const axleDelta = Math.abs(frontAvg - rearAvg);

    const staggered = isStaggeredSetup(setup);

    if (!staggered) {
      const lastRotation = await this.prisma.tirePositionHistory.findFirst({
        where: { vehicleId, changeType: TireChangeType.ROTATE },
        orderBy: { changedAt: 'desc' },
      });
      const kmSinceLastRotation = lastRotation?.odometerKm != null
        ? (setup.totalKmOnSet - (lastRotation.odometerKm - (setup.installedOdometerKm ?? 0)))
        : setup.totalKmOnSet;

      if (kmSinceLastRotation >= r.overdueKm) {
        alerts.push({ type: 'ROTATION_OVERDUE', severity: 'warning', message: `Tire rotation overdue review (${Math.round(kmSinceLastRotation).toLocaleString()} km since last rotation)` });
      } else if (
        kmSinceLastRotation >= r.normalReviewKm &&
        axleDelta >= r.wearImbalanceThresholdMm
      ) {
        alerts.push({ type: 'ROTATION_RECOMMENDED', severity: 'info', message: `Rotation recommended: ${axleDelta.toFixed(1)} mm front/rear delta after ${Math.round(kmSinceLastRotation).toLocaleString()} km` });
      }

      if (axleDelta >= a.frontRearRotationDeltaMm) {
        alerts.push({ type: 'AXLE_WEAR_IMBALANCE', severity: 'warning', message: `Front/rear wear imbalance: ${axleDelta.toFixed(1)} mm difference`, value: axleDelta });
      }
    }

    if (confidenceScore < a.lowConfidenceThreshold) {
      alerts.push({ type: 'LOW_CONFIDENCE', severity: 'info', message: 'Estimate quality low — manual tread measurement recommended' });
    }

    // Pressure alerts from explainability (only when there is a real pressure feed)
    if (wearAnalysis.factors?.pressureFactorFront > 1.06 || wearAnalysis.factors?.pressureFactorRear > 1.06) {
      alerts.push({ type: 'PRESSURE_IMPACT', severity: 'warning', message: 'Tire pressure deviation detected — check and correct pressures' });
    }

    // ── Season suitability (calendar-based; weather can replace later) ────────
    const seasonResult = classifySeasonStatus(setup.tireSeason);
    if (seasonResult.mismatch && seasonResult.status === 'WARNING') {
      alerts.push({ type: 'SEASON_MISMATCH', severity: 'warning', message: 'Summer tires fitted during the winter season — reduced grip in cold, wet or snow. Switch to winter/all-season tires.' });
    } else if (seasonResult.mismatch && seasonResult.status === 'WATCH') {
      alerts.push({ type: 'SEASON_MISMATCH', severity: 'info', message: 'Winter tires fitted during summer — increased wear and longer braking distance. Consider switching to summer tires.' });
    }

    // ── Measurement overdue ───────────────────────────────────────────────────
    const latestMeas = setup.measurements?.[0] ?? null;
    const measAgeDays = latestMeas?.measuredAt
      ? Math.floor((Date.now() - new Date(latestMeas.measuredAt).getTime()) / 86400000)
      : null;
    if (classifyMeasurementOverdue(measAgeDays)) {
      alerts.push({ type: 'MEASUREMENT_OVERDUE', severity: 'warning', message: `No tread measurement in ${measAgeDays} days — re-measure to keep the estimate reliable.` });
    }

    // ── Tire age from DOT ─────────────────────────────────────────────────────
    const dotAges = [dotAgeYears(setup.dotCodeFront), dotAgeYears(setup.dotCodeRear)].filter(
      (v): v is number => v != null,
    );
    const maxAgeYears = dotAges.length > 0 ? Math.max(...dotAges) : null;
    const ageStatus = classifyTireAgeYears(maxAgeYears);
    if (ageStatus === 'WARNING') {
      alerts.push({ type: 'TIRE_AGE_WARNING', severity: 'warning', message: `Tires are ~${Math.round(maxAgeYears!)} years old (DOT) — rubber ageing means replacement is recommended regardless of tread.` });
    } else if (ageStatus === 'WATCH') {
      alerts.push({ type: 'TIRE_AGE_WARNING', severity: 'info', message: `Tires are ~${Math.round(maxAgeYears!)} years old (DOT) — inspect rubber condition periodically.` });
    }

    // No manual measurement warning for used tires
    if (setup.tireCondition === 'ALREADY_MOUNTED' && (!setup.measurements || setup.measurements.length === 0)) {
      alerts.push({ type: 'USED_TIRE_NO_MEASUREMENT', severity: 'warning', message: 'Used tires mounted without manual tread measurement — estimates may be inaccurate. Measure tread depth promptly.' });
    }

    // Stamp every alert with its canonical, stable code.
    for (const alert of alerts) {
      if (!alert.code) alert.code = alertTypeToCode(alert.type);
    }

    return alerts;
  }

  private buildSummaryPayload(
    setup: any,
    wearAnalysis: any,
    confidence: ConfidenceDimensions,
    alerts: TireAlert[],
    pressureContext: TirePressureContext,
    inventoryFlags: Pick<TireHealthSummary, 'hasActiveSet' | 'hasSetups' | 'hasMeasurements'>,
  ): TireHealthSummary {
    const wheels = [
      { pos: 'FL', mm: wearAnalysis.frontLeftMm },
      { pos: 'FR', mm: wearAnalysis.frontRightMm },
      { pos: 'RL', mm: wearAnalysis.rearLeftMm },
      { pos: 'RR', mm: wearAnalysis.rearRightMm },
    ];
    const worst = wheels.reduce((w, c) => (c.mm < w.mm ? c : w), wheels[0]);

    const wheelPercents = wheels.map((w) => {
      const isFront = w.pos.startsWith('F');
      return this.computeWheelPercentV2(
        w.mm,
        isFront
          ? wearAnalysis.referenceNewTreadFront
          : wearAnalysis.referenceNewTreadRear,
        wearAnalysis.operationalReplacementMm,
      );
    });
    const minPercent = Math.min(...wheelPercents);
    const avgPercent =
      wheelPercents.reduce((sum, value) => sum + value, 0) / wheelPercents.length;
    const setLevelPercent = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          this.cfg.setLevelHealth.minWeight * minPercent +
            this.cfg.setLevelHealth.avgWeight * avgPercent,
        ),
      ),
    );

    const healthStatus = this.classifyHealthStatus(
      setLevelPercent,
      worst.mm,
      setup.tireSeason,
    );
    const effectiveWearRate = Math.max(
      wearAnalysis.effectiveWearRateKmPerMm.front,
      wearAnalysis.effectiveWearRateKmPerMm.rear,
      1,
    );
    const wearRateMmPer1000km =
      effectiveWearRate > 0
        ? Math.round((1000 / effectiveWearRate) * 100) / 100
        : null;

    const latestMeasurement = setup.measurements?.[0] ?? null;
    const measurementState = this.resolveMeasurementState(
      wearAnalysis.explainability.currentTreadSource,
    );
    const unified = this.resolveUnifiedConfidence(setup, measurementState);
    const confDiscount =
      this.cfg.remainingKmConfidenceDiscount[unified.label.toLowerCase()] ?? 0.85;
    const adjustedRemainingKm = Math.round(
      wearAnalysis.estimatedRemainingKm * confDiscount,
    );

    const action = this.resolveActionState(
      adjustedRemainingKm,
      alerts,
      unified.score,
    );
    const dataQualityWarnings = this.resolveDataQualityWarnings({
      setup,
      confidenceScore: unified.score,
      measurementState,
      pressureContext,
      alerts,
    });

    const canonical = this.buildCanonicalReadModel({
      setup,
      wearAnalysis,
      worst,
      measurementState,
      latestMeasurement,
      adjustedRemainingKm,
      pressureContext,
    });

    return {
      overallPercent: setLevelPercent,
      overallRemainingKm: adjustedRemainingKm,
      healthStatus,
      confidenceScore: unified.score,
      confidenceLabel: unified.label,
      worstTirePosition: worst.pos,
      worstTirePercent: this.computeWheelPercentV2(
        worst.mm,
        worst.pos.startsWith('F')
          ? wearAnalysis.referenceNewTreadFront
          : wearAnalysis.referenceNewTreadRear,
        wearAnalysis.operationalReplacementMm,
      ),
      activeSetupName: setup.name ?? setup.brandModelFront ?? 'Active Set',
      activeSetupId: setup.id,
      tireSeason: setup.tireSeason,
      installedAt: setup.installedAt?.toISOString() ?? null,
      totalKmOnSet: setup.totalKmOnSet,
      wearRateMmPer1000km,
      alerts,
      tireCondition: setup.tireCondition ?? 'UNKNOWN',
      tireArchetype: wearAnalysis.factors.tireArchetype,
      tireSpecMatched: wearAnalysis.factors.tireSpecMatched,
      tireSpecConfidence: confidence.tireSpecConfidence,
      dataCompletenessConfidence: confidence.dataCompletenessConfidence,
      modelConfidence: confidence.modelConfidence,
      referenceNewTreadSource: wearAnalysis.explainability.referenceNewTreadSource,
      replacementThresholdSource:
        wearAnalysis.explainability.replacementThresholdSource,
      currentTreadSource: wearAnalysis.explainability.currentTreadSource,
      operationalReplacementMm: wearAnalysis.operationalReplacementMm,
      topWearDrivers: wearAnalysis.explainability.topWearDrivers,
      actionState: action.state,
      actionReasons: action.reasons,
      measurementState,
      dataQualityWarnings,
      pressureContext,
      latestMeasurementAt: latestMeasurement?.measuredAt?.toISOString() ?? null,
      ...canonical,
      ...inventoryFlags,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CANONICAL READ MODEL (single honest tire truth)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Derives the honest GOOD/WATCH/WARNING/CRITICAL read model from the wear
   * analysis. Measured and estimated values are kept separate and the display
   * mode / confidence make clear which one is shown. Status is aggregated from
   * tread, remaining-km, season, uneven-wear, pressure and tire age — CRITICAL
   * always wins, UNKNOWN signals are ignored.
   */
  private buildCanonicalReadModel(args: {
    setup: any;
    wearAnalysis: any;
    worst: { pos: string; mm: number };
    measurementState: 'measured' | 'estimated' | 'mixed';
    latestMeasurement: any | null;
    adjustedRemainingKm: number;
    pressureContext: TirePressureContext;
  }): {
    overallStatus: TireStatus;
    displayMode: TireDisplayMode;
    confidence: TireConfidenceLevel;
    lowestTreadMm: number | null;
    lowestTreadPosition: string | null;
    measuredTreadMm: number | null;
    estimatedTreadMm: number | null;
    displayTreadMm: number | null;
    lastMeasurementAt: string | null;
    measurementAgeDays: number | null;
    estimatedRemainingKm: number | null;
    pressureStatus: TireStatus;
    seasonStatus: TireStatus;
    unevenWearStatus: TireStatus;
    recommendations: string[];
  } {
    const { setup, wearAnalysis, worst, measurementState, latestMeasurement, adjustedRemainingKm, pressureContext } = args;

    const estimatedTreadMm = this.round1(worst.mm);
    const lowestTreadPosition = this.positionLabel(worst.pos);

    const measuredVals = latestMeasurement
      ? [latestMeasurement.frontLeftMm, latestMeasurement.frontRightMm, latestMeasurement.rearLeftMm, latestMeasurement.rearRightMm].filter(
          (v: any): v is number => v != null,
        )
      : [];
    const hasMeasurement = measuredVals.length > 0;
    const measuredTreadMm = hasMeasurement ? this.round1(Math.min(...measuredVals)) : null;

    const measurementAgeDays = latestMeasurement?.measuredAt
      ? Math.floor((Date.now() - new Date(latestMeasurement.measuredAt).getTime()) / 86400000)
      : null;

    const displayMode = resolveDisplayMode(measurementState, true);
    const displayTreadMm = displayMode === 'MEASURED' ? measuredTreadMm ?? estimatedTreadMm : estimatedTreadMm;
    const lowestTreadMm = displayTreadMm;

    const confidence = classifyConfidenceLevel({
      hasMeasurement,
      measurementAgeDays,
      kmSinceMeasurement: null,
      hasWearBaseline: true,
    });

    // ── Sub-statuses ──
    const treadStatus = classifyTreadStatus(lowestTreadMm, setup.tireSeason);
    const remainingKmStatus = classifyRemainingKmStatus(adjustedRemainingKm);
    const seasonResult = classifySeasonStatus(setup.tireSeason);
    const seasonStatus = seasonResult.status;

    const sideDeltaFront = Math.abs(wearAnalysis.frontLeftMm - wearAnalysis.frontRightMm);
    const sideDeltaRear = Math.abs(wearAnalysis.rearLeftMm - wearAnalysis.rearRightMm);
    const axleDelta = Math.abs(
      (wearAnalysis.frontLeftMm + wearAnalysis.frontRightMm) / 2 -
        (wearAnalysis.rearLeftMm + wearAnalysis.rearRightMm) / 2,
    );
    const unevenWearStatus = classifyUnevenWear(sideDeltaFront, sideDeltaRear, axleDelta);
    const pressureStatus = this.mapPressureStatus(pressureContext);

    const dotAges = [dotAgeYears(setup.dotCodeFront), dotAgeYears(setup.dotCodeRear)].filter(
      (v): v is number => v != null,
    );
    const maxAgeYears = dotAges.length > 0 ? Math.max(...dotAges) : null;
    const ageStatus = classifyTireAgeYears(maxAgeYears);

    const overallStatus = aggregateTireStatus(
      treadStatus,
      remainingKmStatus,
      seasonStatus,
      unevenWearStatus,
      pressureStatus,
      ageStatus,
    );

    const recommendations = this.buildRecommendations({
      treadStatus,
      remainingKmStatus,
      seasonResult,
      unevenWearStatus,
      pressureStatus,
      ageStatus,
      ageYears: maxAgeYears,
      confidence,
      hasMeasurement,
      measurementOverdue: classifyMeasurementOverdue(measurementAgeDays),
    });

    return {
      overallStatus,
      displayMode,
      confidence,
      lowestTreadMm,
      lowestTreadPosition,
      measuredTreadMm,
      estimatedTreadMm,
      displayTreadMm,
      lastMeasurementAt: latestMeasurement?.measuredAt?.toISOString() ?? null,
      measurementAgeDays,
      estimatedRemainingKm: adjustedRemainingKm,
      pressureStatus,
      seasonStatus,
      unevenWearStatus,
      recommendations,
    };
  }

  private buildRecommendations(args: {
    treadStatus: TireStatus;
    remainingKmStatus: TireStatus;
    seasonResult: { status: TireStatus; mismatch: boolean; expectedSeason: string };
    unevenWearStatus: TireStatus;
    pressureStatus: TireStatus;
    ageStatus: TireStatus;
    ageYears: number | null;
    confidence: TireConfidenceLevel;
    hasMeasurement: boolean;
    measurementOverdue: boolean;
  }): string[] {
    const recs: string[] = [];
    if (args.treadStatus === 'CRITICAL') {
      recs.push('Replace tires now — tread is at or below the legal minimum (1.6 mm).');
    } else if (args.treadStatus === 'WARNING' || args.remainingKmStatus === 'WARNING') {
      recs.push('Plan tire replacement soon.');
    } else if (args.treadStatus === 'WATCH') {
      recs.push('Monitor tread depth; replacement will be needed in the medium term.');
    }
    if (args.seasonResult.mismatch && args.seasonResult.status === 'WARNING') {
      recs.push('Fit winter or all-season tires for current conditions.');
    } else if (args.seasonResult.mismatch && args.seasonResult.status === 'WATCH') {
      recs.push('Switch to summer tires to reduce wear and improve braking.');
    }
    if (args.unevenWearStatus === 'WARNING') {
      recs.push('Check wheel alignment and tire pressure — significant uneven wear detected.');
    } else if (args.unevenWearStatus === 'WATCH') {
      recs.push('Rotate tires to even out front/rear wear.');
    }
    if (args.pressureStatus === 'WARNING') {
      recs.push('Correct tire pressure to the recommended values.');
    }
    if (args.ageStatus === 'WARNING') {
      recs.push(`Tires are ~${Math.round(args.ageYears ?? 0)} years old — replacement is recommended regardless of tread.`);
    }
    if (args.measurementOverdue) {
      recs.push('Re-measure tread depth — the last measurement is overdue.');
    }
    if (!args.hasMeasurement) {
      recs.push('Record a tread measurement to confirm the estimate.');
    } else if (args.confidence === 'LOW') {
      recs.push('Re-measure soon to improve confidence.');
    }
    if (recs.length === 0) recs.push('No tire action required.');
    return Array.from(new Set(recs)).slice(0, 5);
  }

  private mapPressureStatus(ctx: TirePressureContext): TireStatus {
    switch (ctx.overallStatus) {
      case 'ISSUE':
        return 'WARNING';
      case 'OK':
        return 'GOOD';
      case 'STALE':
      case 'UNKNOWN':
      default:
        return 'UNKNOWN';
    }
  }

  private positionLabel(pos: string): string {
    switch (pos) {
      case 'FL':
        return 'front left';
      case 'FR':
        return 'front right';
      case 'RL':
        return 'rear left';
      case 'RR':
        return 'rear right';
      default:
        return pos;
    }
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private resolveActionState(
    remainingKm: number,
    alerts: TireAlert[],
    confidenceScore: number,
  ): { state: TireActionState; reasons: string[] } {
    const criticalTypes = new Set([
      'CRITICAL_TREAD',
      'CRITICAL_REMAINING_KM',
      'UNEVEN_WEAR_CRITICAL',
    ]);
    const planTypes = new Set([
      'LOW_TREAD',
      'LOW_REMAINING_KM',
      'AXLE_WEAR_IMBALANCE',
      'PRESSURE_IMPACT',
      'ROTATION_OVERDUE',
    ]);
    const checkTypes = new Set([
      'ROTATION_RECOMMENDED',
      'LOW_CONFIDENCE',
      'USED_TIRE_NO_MEASUREMENT',
      'UNEVEN_WEAR_ATTENTION',
      'SEASON_MISMATCH',
    ]);

    const criticalMatches = alerts.filter((a) => criticalTypes.has(a.type));
    if (criticalMatches.length > 0) {
      return {
        state: 'REPLACE',
        reasons: criticalMatches.slice(0, 2).map((a) => a.message),
      };
    }

    const planMatches = alerts.filter((a) => planTypes.has(a.type));
    if (planMatches.length > 0 || remainingKm <= this.cfg.alerts.lowRemainingKm) {
      return {
        state: 'PLAN_SERVICE',
        reasons:
          planMatches.slice(0, 2).map((a) => a.message).length > 0
            ? planMatches.slice(0, 2).map((a) => a.message)
            : [`Remaining tire life nearing service window (${remainingKm.toLocaleString()} km)`],
      };
    }

    const checkMatches = alerts.filter((a) => checkTypes.has(a.type));
    if (checkMatches.length > 0 || confidenceScore < this.cfg.alerts.lowConfidenceThreshold) {
      return {
        state: 'CHECK_SOON',
        reasons: checkMatches.slice(0, 2).map((a) => a.message),
      };
    }

    return { state: 'OBSERVE', reasons: ['No urgent tire intervention required.'] };
  }

  private resolveMeasurementState(
    currentTreadSource: string | null | undefined,
  ): 'measured' | 'estimated' | 'mixed' {
    if (currentTreadSource === 'manual_measurement') return 'measured';
    if (currentTreadSource === 'calibration_projection') return 'mixed';
    return 'estimated';
  }

  private resolveDataQualityWarnings(args: {
    setup: any;
    confidenceScore: number;
    measurementState: 'measured' | 'estimated' | 'mixed';
    pressureContext: TirePressureContext;
    alerts: TireAlert[];
  }): string[] {
    const warnings: string[] = [];
    if (args.confidenceScore < this.cfg.alerts.lowConfidenceThreshold) {
      warnings.push('Low confidence: add workshop or manual measurements for stronger anchors.');
    }
    if (args.measurementState !== 'measured') {
      warnings.push('Current tread state is partially estimated.');
    }
    if (args.pressureContext.dimoFreshness === 'stale') {
      warnings.push('DIMO tire pressure data is stale.');
    }
    if (args.pressureContext.hmFreshness === 'stale') {
      warnings.push('HM tire pressure data is stale.');
    }
    if (
      args.setup.tireCondition === 'ALREADY_MOUNTED' &&
      (!args.setup.measurements || args.setup.measurements.length === 0)
    ) {
      warnings.push(
        'Used tires are mounted without a confirmed baseline measurement.',
      );
    }
    if (args.alerts.some((a) => a.type === 'LOW_CONFIDENCE')) {
      warnings.push('Model anchor quality is weak for long-horizon projection.');
    }
    return Array.from(new Set(warnings));
  }

  private async resolvePressureContext(
    vehicleId: string,
    hmTirePressure: any | null,
  ): Promise<TirePressureContext> {
    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: {
        tirePressureFl: true,
        tirePressureFr: true,
        tirePressureRl: true,
        tirePressureRr: true,
        providerFetchedAt: true,
        sourceTimestamp: true,
        lastSeenAt: true,
      },
    });

    const dimoValues = [
      latestState?.tirePressureFl,
      latestState?.tirePressureFr,
      latestState?.tirePressureRl,
      latestState?.tirePressureRr,
    ].filter((v): v is number => v != null);
    const dimoFreshness = this.resolveFreshness(
      latestState?.sourceTimestamp ??
        latestState?.providerFetchedAt ??
        latestState?.lastSeenAt ??
        null,
      dimoValues.length > 0,
    );

    const hmFreshnessRaw = String(
      hmTirePressure?.freshnessStatus ?? 'no_data',
    ).toLowerCase();
    const hmFreshness: PressureFreshness =
      hmFreshnessRaw === 'fresh'
        ? 'fresh'
        : hmFreshnessRaw === 'aging'
        ? 'aging'
        : hmFreshnessRaw === 'stale'
        ? 'stale'
        : 'no_data';

    const hmStatus = String(hmTirePressure?.overallStatus ?? 'UNKNOWN').toUpperCase();
    const warningHints: string[] = [];
    if (hmStatus === 'ISSUE' && hmFreshness !== 'no_data') {
      warningHints.push(
        'HM indicates current underinflation or pressure imbalance.',
      );
    }
    if (dimoFreshness === 'stale') {
      warningHints.push('DIMO pressure snapshot is stale for wear interpretation.');
    }
    if (dimoFreshness === 'no_data' && hmFreshness === 'no_data') {
      warningHints.push('No tire pressure feed available.');
    }

    let source: TirePressureContext['source'] = 'NONE';
    if (dimoValues.length > 0 && hmFreshness !== 'no_data') source = 'MIXED';
    else if (dimoValues.length > 0) source = 'DIMO';
    else if (hmFreshness !== 'no_data') source = 'HM';

    let overallStatus: TirePressureContext['overallStatus'] = 'UNKNOWN';
    if (hmStatus === 'ISSUE' && hmFreshness !== 'stale') overallStatus = 'ISSUE';
    else if (dimoFreshness === 'stale' && hmFreshness !== 'fresh') overallStatus = 'STALE';
    else if (source !== 'NONE') overallStatus = 'OK';

    return {
      source,
      dimoFreshness,
      hmFreshness,
      overallStatus,
      warningHints,
    };
  }

  private applyPressureConfidenceOverlay(
    confidence: ConfidenceDimensions,
    pressureContext: TirePressureContext,
  ): ConfidenceDimensions {
    let score = confidence.score;
    if (pressureContext.dimoFreshness === 'stale') score -= 4;
    if (pressureContext.dimoFreshness === 'no_data') score -= 6;
    if (pressureContext.hmFreshness === 'fresh' && pressureContext.overallStatus === 'ISSUE') {
      score -= 3;
    }
    if (pressureContext.hmFreshness === 'fresh' && pressureContext.dimoFreshness === 'no_data') {
      score += 2;
    }
    score = Math.max(0, Math.min(100, score));

    let label: string;
    if (score >= this.cfg.confidenceThresholds.high) label = 'High';
    else if (score >= this.cfg.confidenceThresholds.medium) label = 'Medium';
    else label = 'Low';

    return { ...confidence, score, label };
  }

  private resolveFreshness(
    timestamp: Date | null | undefined,
    hasData: boolean,
  ): PressureFreshness {
    if (!hasData) return 'no_data';
    if (!timestamp) return 'aging';
    const ageMs = Date.now() - timestamp.getTime();
    if (ageMs < 2 * 60 * 60 * 1000) return 'fresh';
    if (ageMs < 12 * 60 * 60 * 1000) return 'aging';
    return 'stale';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async getActiveSetup(vehicleId: string) {
    return this.prisma.vehicleTireSetup.findFirst({
      where: { vehicleId, removedAt: null, status: TireSetupStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      include: { measurements: { orderBy: { measuredAt: 'desc' }, take: 5 } },
    });
  }

  private async resolveInventoryFlags(
    vehicleId: string,
    activeSetup: { measurements?: unknown[] } | null,
  ): Promise<Pick<TireHealthSummary, 'hasActiveSet' | 'hasSetups' | 'hasMeasurements'>> {
    const [setupCount, measurementCount] = await Promise.all([
      this.prisma.vehicleTireSetup.count({ where: { vehicleId } }),
      this.prisma.vehicleTireTreadMeasurement.count({ where: { vehicleId } }),
    ]);
    const hasActiveSet = activeSetup != null;
    const hasSetups = setupCount > 0;
    const hasMeasurements =
      measurementCount > 0 || (activeSetup?.measurements?.length ?? 0) > 0;
    return { hasActiveSet, hasSetups, hasMeasurements };
  }

  /**
   * V2 wheel percent: uses resolved reference new tread and operational replacement threshold.
   */
  private computeWheelPercentV2(treadMm: number, referenceNewMm: number, operationalReplaceMm: number): number {
    const usable = referenceNewMm - operationalReplaceMm;
    const remaining = treadMm - operationalReplaceMm;
    return usable > 0 ? Math.max(0, Math.min(100, Math.round(remaining / usable * 100))) : 0;
  }

  /** Legacy wheel percent (kept for backward compat where needed). */
  private computeWheelPercent(treadMm: number, initialMm: number, tireSeason?: string | null): number {
    const season = tireSeason ?? 'ALL_SEASON';
    const replaceThreshold = this.cfg.replaceThresholds[season] ?? this.cfg.defaultReplaceThresholdMm;
    const usable = initialMm - replaceThreshold;
    const remaining = treadMm - replaceThreshold;
    return usable > 0 ? Math.max(0, Math.min(100, Math.round(remaining / usable * 100))) : 0;
  }

  private classifyHealthStatus(percent: number, lowestTreadMm?: number, tireSeason?: string | null): TireHealthStatus {
    const t = this.cfg.healthStatusThresholds;
    const season = tireSeason ?? 'ALL_SEASON';
    const replaceThreshold = this.cfg.replaceThresholds[season] ?? this.cfg.defaultReplaceThresholdMm;

    if (percent < t.poor || (lowestTreadMm != null && lowestTreadMm <= replaceThreshold)) return TireHealthStatus.REPLACE_NOW;
    if (percent < t.moderate) return TireHealthStatus.POOR;
    if (percent < t.good) return TireHealthStatus.MODERATE;
    if (percent < t.excellent) return TireHealthStatus.GOOD;
    return TireHealthStatus.EXCELLENT;
  }

  private buildWheelEstimates(setup: any, wearAnalysis: any, confidence: ConfidenceDimensions): PerWheelEstimate[] {
    const refFront = wearAnalysis?.referenceNewTreadFront ?? setup.initialTreadFrontMm ?? setup.initialTreadDepthMm ?? this.cfg.defaultInitialTreadFallbackMm;
    const refRear = wearAnalysis?.referenceNewTreadRear ?? setup.initialTreadRearMm ?? setup.initialTreadDepthMm ?? this.cfg.defaultInitialTreadFallbackMm;
    const operationalReplace = wearAnalysis?.operationalReplacementMm ?? this.cfg.defaultReplaceThresholdMm;
    const latestMeasurement = setup.measurements?.[0] ?? null;

    return [
      { pos: 'FL', mm: wearAnalysis?.frontLeftMm ?? refFront, initial: refFront, measuredMm: latestMeasurement?.frontLeftMm ?? null },
      { pos: 'FR', mm: wearAnalysis?.frontRightMm ?? refFront, initial: refFront, measuredMm: latestMeasurement?.frontRightMm ?? null },
      { pos: 'RL', mm: wearAnalysis?.rearLeftMm ?? refRear, initial: refRear, measuredMm: latestMeasurement?.rearLeftMm ?? null },
      { pos: 'RR', mm: wearAnalysis?.rearRightMm ?? refRear, initial: refRear, measuredMm: latestMeasurement?.rearRightMm ?? null },
    ].map(p => {
      const wearPercent = this.computeWheelPercentV2(p.mm, p.initial, operationalReplace);
      const isFront = p.pos.startsWith('F');
      const wearRate = isFront ? wearAnalysis?.effectiveWearRateKmPerMm.front : wearAnalysis?.effectiveWearRateKmPerMm.rear;
      const remainingMm = p.mm - operationalReplace;
      const remainingKm = remainingMm > 0 && wearRate ? Math.round(remainingMm * wearRate) : 0;

      return {
        position: p.pos,
        treadMm: Math.round(p.mm * 10) / 10,
        wearPercent,
        remainingKm,
        healthStatus: this.classifyHealthStatus(wearPercent, p.mm, setup.tireSeason),
        initialTreadMm: p.initial,
        lastMeasuredMm: p.measuredMm != null ? Math.round(p.measuredMm * 10) / 10 : null,
        lastMeasuredAt: latestMeasurement?.measuredAt?.toISOString() ?? null,
        confidenceScore: confidence.score,
        confidenceLabel: confidence.label,
        brand: isFront ? setup.brandModelFront : (setup.brandModelRear ?? setup.brandModelFront),
        tireModel: null,
        size: isFront ? setup.frontDimension : (setup.rearDimension ?? setup.frontDimension),
        totalKm: Math.round(setup.totalKmOnSet / 4),
        cityKm: Math.round(setup.cityKm / 4),
        highwayKm: Math.round(setup.highwayKm / 4),
        ruralKm: Math.round(setup.ruralKm / 4),
      };
    });
  }

  private async getMeasurements(vehicleId: string, setupId: string): Promise<MeasurementEntry[]> {
    const measurements = await this.prisma.vehicleTireTreadMeasurement.findMany({
      where: { vehicleId, tireSetupId: setupId },
      orderBy: { measuredAt: 'desc' },
      take: 20,
    });
    return measurements.map(m => ({
      id: m.id,
      date: m.measuredAt.toISOString(),
      odometerKm: m.odometerAtMeasurement,
      source: m.source,
      workshopName: m.workshopName,
      values: [
        ...(m.frontLeftMm != null ? [{ position: 'FL', mm: m.frontLeftMm }] : []),
        ...(m.frontRightMm != null ? [{ position: 'FR', mm: m.frontRightMm }] : []),
        ...(m.rearLeftMm != null ? [{ position: 'RL', mm: m.rearLeftMm }] : []),
        ...(m.rearRightMm != null ? [{ position: 'RR', mm: m.rearRightMm }] : []),
      ],
    }));
  }

  private resolveUnifiedConfidence(
    setup: any,
    measurementState: 'measured' | 'estimated' | 'mixed',
  ): { level: TireConfidenceLevel; label: string; score: number } {
    const latestMeasurement = setup.measurements?.[0] ?? null;
    const measuredVals = latestMeasurement
      ? [
          latestMeasurement.frontLeftMm,
          latestMeasurement.frontRightMm,
          latestMeasurement.rearLeftMm,
          latestMeasurement.rearRightMm,
        ].filter((v: any): v is number => v != null)
      : [];
    const level = classifyConfidenceLevel({
      hasMeasurement: measuredVals.length > 0,
      measurementAgeDays: latestMeasurement?.measuredAt
        ? Math.floor(
            (Date.now() - new Date(latestMeasurement.measuredAt).getTime()) / 86400000,
          )
        : null,
      kmSinceMeasurement: null,
      hasWearBaseline: true,
    });
    return {
      level,
      label: confidenceLevelToLabel(level),
      score: confidenceLevelToScore(level),
    };
  }

  private computeUsageSplit(setup: any): { city: number; highway: number; rural: number } {
    const total = setup.totalKmOnSet || 1;
    return {
      city: Math.round(setup.cityKm / total * 100),
      highway: Math.round(setup.highwayKm / total * 100),
      rural: Math.round(setup.ruralKm / total * 100),
    };
  }

  private parseTireWidth(dimension: string): number | null {
    const match = dimension.match(/^(\d{3})\//);
    if (match) return parseInt(match[1], 10);
    const numMatch = dimension.match(/(\d{3})/);
    if (numMatch) return parseInt(numMatch[1], 10);
    return null;
  }

  private buildEmptySummary(
    setup: any,
    pressureContext?: TirePressureContext,
    inventoryFlags: Pick<TireHealthSummary, 'hasActiveSet' | 'hasSetups' | 'hasMeasurements'> = {
      hasActiveSet: true,
      hasSetups: true,
      hasMeasurements: (setup.measurements?.length ?? 0) > 0,
    },
  ): TireHealthSummary {
    const resolvedPressure = pressureContext ?? {
      source: 'NONE' as const,
      dimoFreshness: 'no_data' as const,
      hmFreshness: 'no_data' as const,
      overallStatus: 'UNKNOWN' as const,
      warningHints: [],
    };

    const latestMeasurement = setup.measurements?.[0] ?? null;
    const measuredVals = latestMeasurement
      ? [latestMeasurement.frontLeftMm, latestMeasurement.frontRightMm, latestMeasurement.rearLeftMm, latestMeasurement.rearRightMm].filter(
          (v: any): v is number => v != null,
        )
      : [];
    const measuredTreadMm = measuredVals.length > 0 ? this.round1(Math.min(...measuredVals)) : null;
    const measurementAgeDays = latestMeasurement?.measuredAt
      ? Math.floor((Date.now() - new Date(latestMeasurement.measuredAt).getTime()) / 86400000)
      : null;

    // Without a wear baseline we cannot honestly assert tread health, but a
    // season mismatch or a live pressure issue is still a real, knowable fact.
    const seasonResult = classifySeasonStatus(setup.tireSeason);
    const pressureStatus = this.mapPressureStatus(resolvedPressure);
    const knownStatus = aggregateTireStatus(seasonResult.status, pressureStatus);
    const overallStatus: TireStatus = knownStatus === 'GOOD' ? 'UNKNOWN' : knownStatus;

    const recommendations: string[] = ['Record a tread measurement to establish a baseline.'];
    if (seasonResult.mismatch && seasonResult.status === 'WARNING') {
      recommendations.unshift('Fit winter or all-season tires for current conditions.');
    } else if (seasonResult.mismatch && seasonResult.status === 'WATCH') {
      recommendations.unshift('Switch to summer tires to reduce wear.');
    }

    return {
      overallPercent: 100,
      overallRemainingKm: setup.expectedLifeKm ?? 35000,
      healthStatus: 'EXCELLENT',
      confidenceScore: 10,
      confidenceLabel: 'Low',
      worstTirePosition: null,
      worstTirePercent: null,
      activeSetupName: setup.name ?? setup.brandModelFront ?? 'Active Set',
      activeSetupId: setup.id,
      tireSeason: setup.tireSeason,
      installedAt: setup.installedAt?.toISOString() ?? null,
      totalKmOnSet: 0,
      wearRateMmPer1000km: null,
      alerts: [{ type: 'LOW_CONFIDENCE', code: 'TIRE_LOW_CONFIDENCE', severity: 'info', message: 'New tire setup — no wear data yet. Measurement recommended.' }],
      tireCondition: setup.tireCondition ?? 'UNKNOWN',
      tireArchetype: null,
      tireSpecMatched: false,
      tireSpecConfidence: null,
      dataCompletenessConfidence: null,
      modelConfidence: null,
      referenceNewTreadSource: null,
      replacementThresholdSource: null,
      currentTreadSource: null,
      operationalReplacementMm: null,
      topWearDrivers: [],
      actionState: 'CHECK_SOON',
      actionReasons: ['No calibrated wear baseline yet. Record first tread measurement.'],
      measurementState: 'estimated',
      dataQualityWarnings: ['No tire wear baseline measurement available.'],
      pressureContext: resolvedPressure,
      latestMeasurementAt: latestMeasurement?.measuredAt?.toISOString() ?? null,

      // ── Canonical read model ──
      overallStatus,
      displayMode: measuredTreadMm != null ? 'MEASURED' : 'UNKNOWN',
      confidence: measuredTreadMm != null ? 'LOW' : 'UNKNOWN',
      lowestTreadMm: measuredTreadMm,
      lowestTreadPosition: null,
      measuredTreadMm,
      estimatedTreadMm: null,
      displayTreadMm: measuredTreadMm,
      lastMeasurementAt: latestMeasurement?.measuredAt?.toISOString() ?? null,
      measurementAgeDays,
      estimatedRemainingKm: null,
      pressureStatus,
      seasonStatus: seasonResult.status,
      unevenWearStatus: 'UNKNOWN',
      recommendations,
      ...inventoryFlags,
    };
  }
}
