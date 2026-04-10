import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
  TirePosition,
  TireHealthStatus,
  TireChangeType,
  TireEventType,
  TireSetupStatus,
  TireSeason,
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

  async getSummary(vehicleId: string): Promise<TireHealthSummary | null> {
    const setup = await this.getActiveSetup(vehicleId);
    if (!setup) return null;

    const wearAnalysis = await this.wearModel.computeWearAnalysis(vehicleId);
    if (!wearAnalysis) return this.buildEmptySummary(setup);

    const confidence = await this.computeConfidence(vehicleId, setup);
    const alerts = await this.detectAlerts(vehicleId, setup, wearAnalysis, confidence.score);

    const wheels = [
      { pos: 'FL', mm: wearAnalysis.frontLeftMm },
      { pos: 'FR', mm: wearAnalysis.frontRightMm },
      { pos: 'RL', mm: wearAnalysis.rearLeftMm },
      { pos: 'RR', mm: wearAnalysis.rearRightMm },
    ];
    const worst = wheels.reduce((w, c) => c.mm < w.mm ? c : w, wheels[0]);

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

    const healthStatus = this.classifyHealthStatus(setLevelPercent, worst.mm, setup.tireSeason);

    const effectiveWearRate = Math.max(
      wearAnalysis.effectiveWearRateKmPerMm.front,
      wearAnalysis.effectiveWearRateKmPerMm.rear,
      1,
    );
    const wearRateMmPer1000km = effectiveWearRate > 0 ? Math.round(1000 / effectiveWearRate * 100) / 100 : null;

    // Apply confidence safety discount to remaining km
    const confLabel = confidence.label.toLowerCase();
    const confDiscount = this.cfg.remainingKmConfidenceDiscount[confLabel] ?? 0.85;
    const adjustedRemainingKm = Math.round(wearAnalysis.estimatedRemainingKm * confDiscount);

    // Persist resolved fields to setup
    await this.prisma.vehicleTireSetup.update({
      where: { id: setup.id },
      data: {
        overallHealthPercent: setLevelPercent,
        overallRemainingKm: adjustedRemainingKm,
        healthStatus,
        confidenceScore: confidence.score,
        confidenceLabel: confidence.label,
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
    }).catch(e => this.logger.warn(`Setup update failed: ${e.message}`));

    return {
      overallPercent: setLevelPercent,
      overallRemainingKm: adjustedRemainingKm,
      healthStatus,
      confidenceScore: confidence.score,
      confidenceLabel: confidence.label,
      worstTirePosition: worst.pos,
      worstTirePercent: this.computeWheelPercentV2(
        worst.mm,
        worst.pos.startsWith('F') ? wearAnalysis.referenceNewTreadFront : wearAnalysis.referenceNewTreadRear,
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
      replacementThresholdSource: wearAnalysis.explainability.replacementThresholdSource,
      currentTreadSource: wearAnalysis.explainability.currentTreadSource,
      operationalReplacementMm: wearAnalysis.operationalReplacementMm,
      topWearDrivers: wearAnalysis.explainability.topWearDrivers,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GET DETAIL (Modal DTO)
  // ═══════════════════════════════════════════════════════════════════════════

  async getDetail(vehicleId: string): Promise<TireHealthDetail | null> {
    const setup = await this.getActiveSetup(vehicleId);
    if (!setup) return null;

    const wearAnalysis = await this.wearModel.computeWearAnalysis(vehicleId);
    const confidence = await this.computeConfidence(vehicleId, setup);
    const alerts = wearAnalysis
      ? await this.detectAlerts(vehicleId, setup, wearAnalysis, confidence.score)
      : [];

    const wheels = this.buildWheelEstimates(setup, wearAnalysis, confidence);
    const usageSplit = this.computeUsageSplit(setup);
    const rotationHistory = await this.getRotationHistory(vehicleId);
    const measurements = await this.getMeasurements(vehicleId, setup.id);

    const summary = await this.getSummary(vehicleId);

    return {
      summary: summary ?? this.buildEmptySummary(setup),
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
  //  ROTATION
  // ═══════════════════════════════════════════════════════════════════════════

  async rotateTires(vehicleId: string, template: string, odometerKm?: number, notes?: string, userId?: string) {
    const setup = await this.getActiveSetup(vehicleId);
    if (!setup) throw new BadRequestException('No active tire setup');

    const isStaggered = isStaggeredSetup(setup);
    if (isStaggered && !this.wearModel.isRotationAllowedForStaggered(template)) {
      throw new BadRequestException(`Rotation template "${template}" not allowed for staggered setups.`);
    }

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { organizationId: true } });
    const moveMap = this.getRotationMoves(template);
    const historyEntries: any[] = [];

    for (const [fromPos, toPos] of Object.entries(moveMap)) {
      historyEntries.push({
        organizationId: vehicle!.organizationId,
        vehicleId,
        tireSetId: setup.id,
        fromPosition: fromPos as TirePosition,
        toPosition: toPos as TirePosition,
        changedAt: new Date(),
        odometerKm: odometerKm ?? null,
        changeType: TireChangeType.ROTATE,
        rotationTemplate: template,
        notes: notes ?? null,
        createdBy: userId ?? null,
      });
    }

    await this.prisma.$transaction([
      ...historyEntries.map(entry => this.prisma.tirePositionHistory.create({ data: entry })),
      this.prisma.tireEvent.create({
        data: {
          organizationId: vehicle!.organizationId,
          vehicleId,
          tireSetId: setup.id,
          type: TireEventType.ROTATION,
          payload: { template, odometerKm, moves: moveMap },
          createdBy: userId ?? null,
        },
      }),
    ]);

    await this.recalculate(vehicleId);
    return { success: true, template, moves: moveMap, event: 'ROTATION' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TIRE CHANGE
  // ═══════════════════════════════════════════════════════════════════════════

  async changeTires(
    vehicleId: string,
    data: {
      scope: 'single' | 'axle' | 'full_set';
      positions?: string[];
      newSetup?: {
        brandModelFront?: string; brandModelRear?: string;
        frontDimension?: string; rearDimension?: string;
        tireSeason?: string; initialTreadDepthMm?: number;
        initialTreadFrontMm?: number; initialTreadRearMm?: number;
        name?: string;
        tireCondition?: string;
      };
      odometerKm?: number; notes?: string;
    },
    userId?: string,
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true, fuelType: true, driveType: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found');

    const currentSetup = await this.getActiveSetup(vehicleId);

    if (data.scope === 'full_set') {
      if (currentSetup) {
        await this.prisma.vehicleTireSetup.update({
          where: { id: currentSetup.id },
          data: { removedAt: new Date(), removedOdometerKm: data.odometerKm, status: TireSetupStatus.STORED },
        });
      }

      const regenPositional = this.wearModel.computePositionalRegenFactors(vehicle.fuelType ?? null, vehicle.driveType ?? null);
      const fd = data.newSetup?.frontDimension;
      const rd = data.newSetup?.rearDimension;
      const staggered = isStaggeredSetup({ frontDimension: fd, rearDimension: rd });
      const frontWidthMm = fd ? this.parseTireWidth(fd) : null;
      const rearWidthMm = rd ? this.parseTireWidth(rd) : null;

      const condition = data.newSetup?.tireCondition === 'NEW_INSTALLED' ? 'NEW_INSTALLED' as const
        : data.newSetup?.tireCondition === 'ALREADY_MOUNTED' ? 'ALREADY_MOUNTED' as const
        : 'UNKNOWN' as const;

      const newSetup = await this.prisma.vehicleTireSetup.create({
        data: {
          organizationId: vehicle.organizationId,
          vehicleId,
          name: data.newSetup?.name ?? null,
          brandModelFront: data.newSetup?.brandModelFront ?? null,
          brandModelRear: data.newSetup?.brandModelRear ?? null,
          frontDimension: fd ?? null,
          rearDimension: rd ?? null,
          tireSeason: (data.newSetup?.tireSeason as TireSeason) ?? 'ALL_SEASON',
          initialTreadDepthMm: data.newSetup?.initialTreadDepthMm ?? null,
          initialTreadFrontMm: data.newSetup?.initialTreadFrontMm ?? null,
          initialTreadRearMm: data.newSetup?.initialTreadRearMm ?? null,
          isStaggered: staggered,
          regenBrakingFactor: regenPositional.overall,
          regenBrakingFactorFront: regenPositional.front,
          regenBrakingFactorRear: regenPositional.rear,
          frontTireWidthMm: frontWidthMm,
          rearTireWidthMm: rearWidthMm,
          installedAt: new Date(),
          installedOdometerKm: data.odometerKm ?? null,
          status: TireSetupStatus.ACTIVE,
          createdBy: userId ?? null,
          tireCondition: condition,
        },
      });

      await this.prisma.tireEvent.create({
        data: {
          organizationId: vehicle.organizationId,
          vehicleId,
          tireSetId: newSetup.id,
          type: TireEventType.TIRE_CHANGE,
          payload: { scope: 'full_set', odometerKm: data.odometerKm, notes: data.notes, tireCondition: condition },
          createdBy: userId ?? null,
        },
      });

      return { success: true, newSetupId: newSetup.id, scope: 'full_set' };
    }

    return { success: true, scope: data.scope, message: 'Partial replacement recorded' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MEASUREMENT + CALIBRATION
  // ═══════════════════════════════════════════════════════════════════════════

  async addMeasurement(
    vehicleId: string,
    data: {
      frontLeftMm?: number; frontRightMm?: number;
      rearLeftMm?: number; rearRightMm?: number;
      odometerKm?: number; workshopName?: string; source?: string;
    },
    userId?: string,
  ) {
    const setup = await this.getActiveSetup(vehicleId);
    if (!setup) throw new BadRequestException('No active tire setup');

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { organizationId: true } });

    let resolvedOdometer = data.odometerKm ?? null;
    if (resolvedOdometer == null) {
      const latestState = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: { odometerKm: true },
      });
      resolvedOdometer = latestState?.odometerKm ?? null;
    }

    const measurement = await this.prisma.vehicleTireTreadMeasurement.create({
      data: {
        vehicleId,
        tireSetup: { connect: { id: setup.id } },
        frontLeftMm: data.frontLeftMm ?? null,
        frontRightMm: data.frontRightMm ?? null,
        rearLeftMm: data.rearLeftMm ?? null,
        rearRightMm: data.rearRightMm ?? null,
        odometerAtMeasurement: resolvedOdometer,
        source: data.source ?? 'manual',
        workshopName: data.workshopName ?? null,
        isCalibrationPoint: true,
        measuredAt: new Date(),
      },
    });

    const kFactors = await this.wearModel.calibrateFromMeasurement(setup.id, {
      frontLeftMm: data.frontLeftMm, frontRightMm: data.frontRightMm,
      rearLeftMm: data.rearLeftMm, rearRightMm: data.rearRightMm,
    });

    await this.prisma.tireEvent.create({
      data: {
        organizationId: vehicle!.organizationId,
        vehicleId,
        tireSetId: setup.id,
        type: TireEventType.MEASUREMENT,
        payload: {
          fl: data.frontLeftMm, fr: data.frontRightMm,
          rl: data.rearLeftMm, rr: data.rearRightMm,
          odometer: data.odometerKm, workshop: data.workshopName,
          source: data.source ?? 'manual', kFactors,
        },
        createdBy: userId ?? null,
      },
    });

    await this.recalculate(vehicleId);
    return { measurement, kFactors };
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

    const confLabel = confidence.label.toLowerCase();
    const confDiscount = this.cfg.remainingKmConfidenceDiscount[confLabel] ?? 0.85;
    const adjustedRemainingKm = Math.round(wearAnalysis.estimatedRemainingKm * confDiscount);

    await this.prisma.vehicleTireSetup.update({
      where: { id: setup.id },
      data: {
        overallHealthPercent: setLevelPercent,
        overallRemainingKm: adjustedRemainingKm,
        healthStatus,
        confidenceScore: confidence.score,
        confidenceLabel: confidence.label,
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
        confidenceScore: confidence.score,
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
      select: { odometerKm: true, tirePressureFl: true },
    });
    if (latestState?.odometerKm != null) { dataScore += 12; legacyScore += c.odometerConsistent; }
    if (latestState?.tirePressureFl != null) { dataScore += 5; legacyScore += c.tirePressureAvailable; }

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
    if (latestState?.tirePressureFl != null) modelScore += 10;
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
      if (w.mm <= operationalReplace) {
        alerts.push({ type: 'CRITICAL_TREAD', severity: 'critical', message: `${w.pos}: Tread at or below replace threshold (${w.mm.toFixed(1)} mm)`, position: w.pos, value: w.mm });
      } else if (w.mm <= operationalReplace + 0.3) {
        alerts.push({ type: 'LOW_TREAD', severity: 'warning', message: `${w.pos}: Tread approaching replace limit (${w.mm.toFixed(1)} mm)`, position: w.pos, value: w.mm });
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

    // Pressure alerts from explainability
    if (wearAnalysis.factors?.pressureFactorFront > 1.06 || wearAnalysis.factors?.pressureFactorRear > 1.06) {
      alerts.push({ type: 'PRESSURE_IMPACT', severity: 'warning', message: 'Tire pressure deviation detected — check and correct pressures' });
    }

    // Season mismatch alert
    if (wearAnalysis.factors?.seasonMismatchFactor > 1.02) {
      alerts.push({ type: 'SEASON_MISMATCH', severity: 'info', message: 'Tires may not match current seasonal conditions — consider a seasonal change' });
    }

    // No manual measurement warning for used tires
    if (setup.tireCondition === 'ALREADY_MOUNTED' && (!setup.measurements || setup.measurements.length === 0)) {
      alerts.push({ type: 'USED_TIRE_NO_MEASUREMENT', severity: 'warning', message: 'Used tires mounted without manual tread measurement — estimates may be inaccurate. Measure tread depth promptly.' });
    }

    return alerts;
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

  private computeUsageSplit(setup: any): { city: number; highway: number; rural: number } {
    const total = setup.totalKmOnSet || 1;
    return {
      city: Math.round(setup.cityKm / total * 100),
      highway: Math.round(setup.highwayKm / total * 100),
      rural: Math.round(setup.ruralKm / total * 100),
    };
  }

  private getRotationMoves(template: string): Record<string, string> {
    switch (template) {
      case 'front_to_rear': return { FRONT_LEFT: 'REAR_LEFT', FRONT_RIGHT: 'REAR_RIGHT', REAR_LEFT: 'FRONT_LEFT', REAR_RIGHT: 'FRONT_RIGHT' };
      case 'cross': return { FRONT_LEFT: 'REAR_RIGHT', FRONT_RIGHT: 'REAR_LEFT', REAR_LEFT: 'FRONT_RIGHT', REAR_RIGHT: 'FRONT_LEFT' };
      case 'side_swap': case 'side_swap_only': return { FRONT_LEFT: 'FRONT_RIGHT', FRONT_RIGHT: 'FRONT_LEFT', REAR_LEFT: 'REAR_RIGHT', REAR_RIGHT: 'REAR_LEFT' };
      case 'same_axle_swap': return { FRONT_LEFT: 'FRONT_RIGHT', FRONT_RIGHT: 'FRONT_LEFT', REAR_LEFT: 'REAR_RIGHT', REAR_RIGHT: 'REAR_LEFT' };
      case 'full_rotation': return { FRONT_LEFT: 'REAR_RIGHT', REAR_RIGHT: 'REAR_LEFT', REAR_LEFT: 'FRONT_RIGHT', FRONT_RIGHT: 'FRONT_LEFT' };
      default: return {};
    }
  }

  private parseTireWidth(dimension: string): number | null {
    const match = dimension.match(/^(\d{3})\//);
    if (match) return parseInt(match[1], 10);
    const numMatch = dimension.match(/(\d{3})/);
    if (numMatch) return parseInt(numMatch[1], 10);
    return null;
  }

  private buildEmptySummary(setup: any): TireHealthSummary {
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
      alerts: [{ type: 'LOW_CONFIDENCE', severity: 'info', message: 'New tire setup — no wear data yet. Measurement recommended.' }],
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
    };
  }
}
