import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DrivingImpactService, VehicleImpactForBrake } from '../driving-impact/driving-impact.service';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function lookupSteppedFactor(
  value: number,
  anchors: readonly { threshold: number; factor: number }[],
): number {
  for (const a of anchors) {
    if (value <= a.threshold) return a.factor;
  }
  return anchors[anchors.length - 1].factor;
}

function interpolateThermalFactor(
  score: number,
  anchors: readonly { score: number; factor: number }[],
): number {
  if (score <= anchors[0].score) return anchors[0].factor;
  if (score >= anchors[anchors.length - 1].score) return anchors[anchors.length - 1].factor;
  for (let i = 0; i < anchors.length - 1; i++) {
    if (score >= anchors[i].score && score <= anchors[i + 1].score) {
      const t = (score - anchors[i].score) / (anchors[i + 1].score - anchors[i].score);
      return anchors[i].factor + t * (anchors[i + 1].factor - anchors[i].factor);
    }
  }
  return 1.0;
}

// ── Public DTOs ───────────────────────────────────────────────────────────────

export interface BrakeHealthSummaryDto {
  isInitialized: boolean;
  status?: string;
  message?: string;
  actions?: { canAddBrakeService: boolean; canUseAiUpload: boolean };
  pads?: { healthPercent: number; estimatedLifetimeKm: number };
  discs?: { healthPercent: number; estimatedLifetimeKm: number };
  lastChangeAt?: string | null;
  confidence?: { score: number; label: string };
  hasAlert?: boolean;
}

export interface BrakeHealthDetailDto {
  summary: BrakeHealthSummaryDto;
  frontPads: AxleEstimate | null;
  rearPads: AxleEstimate | null;
  frontDiscs: AxleEstimate | null;
  rearDiscs: AxleEstimate | null;
  specs: any;
  history: any[];
  alerts: BrakeAlert[];
  factors: Record<string, number>;
  drivingImpactAvailable: boolean;
  distanceSinceAnchorKm: number | null;
  brakeBiasInfo: { front: number; rear: number; source: string } | null;
}

export interface AxleEstimate {
  anchorMm: number | null;
  estimatedMm: number | null;
  healthPct: number | null;
  remainingKm: number | null;
  wearRateMmPerKm: number | null;
  kFactor: number;
}

export interface BrakeAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  value?: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class BrakeHealthService {
  private readonly logger = new Logger(BrakeHealthService.name);
  private readonly cfg = BRAKE_HEALTH_CONFIG;

  constructor(
    private readonly prisma: PrismaService,
    private readonly drivingImpactService: DrivingImpactService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //  GET SUMMARY  (Quick Box DTO)
  // ═══════════════════════════════════════════════════════════════════════════

  async getSummary(vehicleId: string): Promise<BrakeHealthSummaryDto> {
    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });

    if (!current?.isInitialized) {
      return {
        isInitialized: false,
        status: 'awaiting_service_anchor',
        message: 'Tracking starts after documented brake service.',
        actions: { canAddBrakeService: true, canUseAiUpload: true },
      };
    }

    const padPct = current.padsHealthPct ?? 0;
    const discPct = current.discsHealthPct ?? 0;
    const minPct = Math.min(padPct, discPct);
    const status = minPct >= 60 ? 'healthy' : minPct >= 30 ? 'attention' : 'critical';

    return {
      isInitialized: true,
      status,
      pads: {
        healthPercent: Math.round(padPct),
        estimatedLifetimeKm: Math.round(current.padsRemainingKm ?? 0),
      },
      discs: {
        healthPercent: Math.round(discPct),
        estimatedLifetimeKm: Math.round(current.discsRemainingKm ?? 0),
      },
      lastChangeAt: current.anchorServiceDate?.toISOString() ?? null,
      confidence: {
        score: Math.round(current.confidenceScore ?? 0),
        label: current.confidenceLabel ?? 'Low',
      },
      hasAlert: current.hasAlert,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GET DETAIL  (Modal DTO)
  // ═══════════════════════════════════════════════════════════════════════════

  async getDetail(vehicleId: string): Promise<BrakeHealthDetailDto> {
    const summary = await this.getSummary(vehicleId);
    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });

    const specs = await this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    const history = await this.prisma.vehicleServiceEvent.findMany({
      where: { vehicleId, eventType: 'BRAKE_SERVICE' },
      orderBy: { eventDate: 'desc' },
      take: 30,
    });

    const impact = await this.drivingImpactService.getVehicleImpactForBrake(vehicleId);
    const alerts = current?.isInitialized ? this.computeAlerts(current) : [];

    const factors = current?.isInitialized
      ? await this.computeFactorsForDisplay(vehicleId, impact)
      : {};

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { brakeForceFrontPercent: true },
    });
    const biasFront = vehicle?.brakeForceFrontPercent != null
      ? vehicle.brakeForceFrontPercent / 100
      : this.cfg.brakeBias.defaultFront;

    return {
      summary,
      frontPads: current?.isInitialized ? this.toAxleEstimate(current.frontPadAnchorMm, current.frontPadEstimatedMm, current.frontPadHealthPct, current.frontPadRemainingKm, current.frontPadWearRateMmPerKm, current.frontPadKFactor) : null,
      rearPads: current?.isInitialized ? this.toAxleEstimate(current.rearPadAnchorMm, current.rearPadEstimatedMm, current.rearPadHealthPct, current.rearPadRemainingKm, current.rearPadWearRateMmPerKm, current.rearPadKFactor) : null,
      frontDiscs: current?.isInitialized ? this.toAxleEstimate(current.frontDiscAnchorMm, current.frontDiscEstimatedMm, current.frontDiscHealthPct, current.frontDiscRemainingKm, current.frontDiscWearRateMmPerKm, current.frontDiscKFactor) : null,
      rearDiscs: current?.isInitialized ? this.toAxleEstimate(current.rearDiscAnchorMm, current.rearDiscEstimatedMm, current.rearDiscHealthPct, current.rearDiscRemainingKm, current.rearDiscWearRateMmPerKm, current.rearDiscKFactor) : null,
      specs: specs[0] ?? null,
      history: history.map(e => ({
        id: e.id,
        date: e.eventDate.toISOString(),
        odometerKm: e.odometerKm,
        workshopName: e.workshopName,
        notes: e.notes,
        costCents: e.costCents,
      })),
      alerts,
      factors,
      drivingImpactAvailable: impact != null,
      distanceSinceAnchorKm: current?.distanceSinceAnchorKm ?? null,
      brakeBiasInfo: {
        front: Math.round(biasFront * 100),
        rear: Math.round((1 - biasFront) * 100),
        source: vehicle?.brakeForceFrontPercent != null ? 'Vehicle master data' : 'EBD fallback estimate',
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INITIALIZE FROM BRAKE SERVICE  (anchor creation)
  // ═══════════════════════════════════════════════════════════════════════════

  async initializeFromService(
    vehicleId: string,
    data: {
      serviceDate: string;
      odometerKm?: number;
      frontPadMm?: number;
      rearPadMm?: number;
      frontRotorWidthMm?: number;
      rearRotorWidthMm?: number;
    },
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true, fuelType: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found');

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });
    const odo = data.odometerKm ?? latestState?.odometerKm ?? null;
    const serviceDate = new Date(data.serviceDate);

    const specs = await this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const spec = specs[0];

    const frontPadAnchor = data.frontPadMm ?? spec?.frontPadThickness ?? null;
    const rearPadAnchor = data.rearPadMm ?? spec?.rearPadThickness ?? null;
    const frontDiscAnchor = data.frontRotorWidthMm ?? spec?.frontRotorWidth ?? null;
    const rearDiscAnchor = data.rearRotorWidthMm ?? spec?.rearRotorWidth ?? null;

    await this.prisma.brakeHealthCurrent.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        organizationId: vehicle.organizationId,
        isInitialized: true,
        anchorServiceDate: serviceDate,
        anchorOdometerKm: odo,
        frontPadAnchorMm: frontPadAnchor,
        rearPadAnchorMm: rearPadAnchor,
        frontPadEstimatedMm: frontPadAnchor,
        rearPadEstimatedMm: rearPadAnchor,
        frontPadHealthPct: 100,
        rearPadHealthPct: 100,
        frontDiscAnchorMm: frontDiscAnchor,
        rearDiscAnchorMm: rearDiscAnchor,
        frontDiscEstimatedMm: frontDiscAnchor,
        rearDiscEstimatedMm: rearDiscAnchor,
        frontDiscHealthPct: 100,
        rearDiscHealthPct: 100,
        padsHealthPct: 100,
        discsHealthPct: 100,
        distanceSinceAnchorKm: 0,
        modelVersion: this.cfg.MODEL_VERSION,
      },
      update: {
        isInitialized: true,
        anchorServiceDate: serviceDate,
        anchorOdometerKm: odo,
        frontPadAnchorMm: frontPadAnchor,
        rearPadAnchorMm: rearPadAnchor,
        frontPadEstimatedMm: frontPadAnchor,
        rearPadEstimatedMm: rearPadAnchor,
        frontPadHealthPct: 100,
        rearPadHealthPct: 100,
        frontDiscAnchorMm: frontDiscAnchor,
        rearDiscAnchorMm: rearDiscAnchor,
        frontDiscEstimatedMm: frontDiscAnchor,
        rearDiscEstimatedMm: rearDiscAnchor,
        frontDiscHealthPct: 100,
        rearDiscHealthPct: 100,
        padsHealthPct: 100,
        padsRemainingKm: null,
        discsHealthPct: 100,
        discsRemainingKm: null,
        distanceSinceAnchorKm: 0,
        frontPadKFactor: 1.0,
        rearPadKFactor: 1.0,
        frontDiscKFactor: 1.0,
        rearDiscKFactor: 1.0,
        calibrationCount: 0,
        hasAlert: false,
        modelVersion: this.cfg.MODEL_VERSION,
      },
    });

    if (odo != null) {
      await this.recalculate(vehicleId);
    }

    return { success: true, initialized: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RECALCULATE  (main wear computation)
  // ═══════════════════════════════════════════════════════════════════════════

  async recalculate(vehicleId: string) {
    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    if (!current?.isInitialized || current.anchorOdometerKm == null) return null;

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { fuelType: true, brakeForceFrontPercent: true },
    });

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });
    const currentOdo = latestState?.odometerKm ?? null;
    if (currentOdo == null) return null;

    const distanceSinceAnchor = Math.max(0, currentOdo - current.anchorOdometerKm);

    const impact = await this.drivingImpactService.getVehicleImpactForBrake(vehicleId);
    const fuelType = vehicle?.fuelType ?? 'GASOLINE';

    // Brake bias
    const brakeBiasFront = vehicle?.brakeForceFrontPercent != null
      ? vehicle.brakeForceFrontPercent / 100
      : this.cfg.brakeBias.defaultFront;
    const brakeBiasRear = 1 - brakeBiasFront;

    // ── PADS ──────────────────────────────────────────────────────────────

    const padUsage = this.computePadUsageFactor(impact);
    const padStopDensity = lookupSteppedFactor(impact?.stopDensity ?? 0, this.cfg.padStopDensityAnchors);
    const padHardBrake = lookupSteppedFactor(impact?.hardBrakePer100Km ?? 0, this.cfg.padHardBrakeAnchors);
    const padFullBraking = lookupSteppedFactor(impact?.fullBrakingPer100Km ?? 0, this.cfg.padFullBrakingAnchors);
    const padReku = this.cfg.padRekuFactors[fuelType] ?? 1.0;

    // Front pads
    const frontPadResult = this.computePadWear(
      current.frontPadAnchorMm, distanceSinceAnchor, brakeBiasFront,
      padUsage, padStopDensity, padHardBrake, padFullBraking, padReku,
      current.frontPadKFactor,
    );

    // Rear pads
    const rearPadResult = this.computePadWear(
      current.rearPadAnchorMm, distanceSinceAnchor, brakeBiasRear,
      padUsage, padStopDensity, padHardBrake, padFullBraking, padReku,
      current.rearPadKFactor,
    );

    // ── DISCS ─────────────────────────────────────────────────────────────

    const discUsage = this.computeDiscUsageFactor(impact);
    const discHighSpeed = lookupSteppedFactor((impact?.highSpeedBrakeShare ?? 0) * 100, this.cfg.discHighSpeedBrakeAnchors);
    const discHardBrake = lookupSteppedFactor(impact?.hardBrakePer100Km ?? 0, this.cfg.discHardBrakeAnchors);
    const discFullBraking = lookupSteppedFactor(impact?.fullBrakingPer100Km ?? 0, this.cfg.discFullBrakingAnchors);
    const discThermal = interpolateThermalFactor(impact?.thermalBrakeStressScore ?? 0, this.cfg.discThermalAnchors);
    const discReku = this.cfg.discRekuFactors[fuelType] ?? 1.0;

    // Front discs
    const frontDiscResult = this.computeDiscWear(
      current.frontDiscAnchorMm, distanceSinceAnchor, brakeBiasFront,
      discUsage, discHighSpeed, discHardBrake, discFullBraking, discThermal, discReku,
      current.frontDiscKFactor,
    );

    // Rear discs
    const rearDiscResult = this.computeDiscWear(
      current.rearDiscAnchorMm, distanceSinceAnchor, brakeBiasRear,
      discUsage, discHighSpeed, discHardBrake, discFullBraking, discThermal, discReku,
      current.rearDiscKFactor,
    );

    // ── Set-level health ──────────────────────────────────────────────────

    const padsPcts = [frontPadResult.healthPct, rearPadResult.healthPct].filter((v): v is number => v != null);
    const padsHealthPct = padsPcts.length > 0
      ? round2(this.cfg.setLevel.minWeight * Math.min(...padsPcts) + this.cfg.setLevel.avgWeight * (padsPcts.reduce((a, b) => a + b, 0) / padsPcts.length))
      : null;
    const padsRemainingKm = Math.min(frontPadResult.remainingKm ?? Infinity, rearPadResult.remainingKm ?? Infinity);

    const discsPcts = [frontDiscResult.healthPct, rearDiscResult.healthPct].filter((v): v is number => v != null);
    const discsHealthPct = discsPcts.length > 0
      ? round2(this.cfg.setLevel.minWeight * Math.min(...discsPcts) + this.cfg.setLevel.avgWeight * (discsPcts.reduce((a, b) => a + b, 0) / discsPcts.length))
      : null;
    const discsRemainingKm = Math.min(frontDiscResult.remainingKm ?? Infinity, rearDiscResult.remainingKm ?? Infinity);

    // ── Confidence ────────────────────────────────────────────────────────

    const confidence = this.computeConfidence(vehicleId, current, impact);

    // ── Alerts ────────────────────────────────────────────────────────────

    const updatedData = {
      distanceSinceAnchorKm: distanceSinceAnchor,
      frontPadEstimatedMm: frontPadResult.estimatedMm,
      frontPadHealthPct: frontPadResult.healthPct,
      frontPadRemainingKm: frontPadResult.remainingKm,
      frontPadWearRateMmPerKm: frontPadResult.wearRate,
      rearPadEstimatedMm: rearPadResult.estimatedMm,
      rearPadHealthPct: rearPadResult.healthPct,
      rearPadRemainingKm: rearPadResult.remainingKm,
      rearPadWearRateMmPerKm: rearPadResult.wearRate,
      frontDiscEstimatedMm: frontDiscResult.estimatedMm,
      frontDiscHealthPct: frontDiscResult.healthPct,
      frontDiscRemainingKm: frontDiscResult.remainingKm,
      frontDiscWearRateMmPerKm: frontDiscResult.wearRate,
      rearDiscEstimatedMm: rearDiscResult.estimatedMm,
      rearDiscHealthPct: rearDiscResult.healthPct,
      rearDiscRemainingKm: rearDiscResult.remainingKm,
      rearDiscWearRateMmPerKm: rearDiscResult.wearRate,
      padsHealthPct: padsHealthPct != null ? clamp(padsHealthPct, 0, 100) : null,
      padsRemainingKm: padsRemainingKm < Infinity ? Math.round(padsRemainingKm) : null,
      discsHealthPct: discsHealthPct != null ? clamp(discsHealthPct, 0, 100) : null,
      discsRemainingKm: discsRemainingKm < Infinity ? Math.round(discsRemainingKm) : null,
      confidenceScore: confidence.score,
      confidenceLabel: confidence.label,
      lastRecalculatedAt: new Date(),
    };

    const alerts = this.computeAlerts({ ...current, ...updatedData } as any);
    (updatedData as any).hasAlert = alerts.length > 0;

    await this.prisma.brakeHealthCurrent.update({
      where: { vehicleId },
      data: updatedData,
    });

    return { padsHealthPct, discsHealthPct, padsRemainingKm, discsRemainingKm, confidence, alertCount: alerts.length };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PAD WEAR MODEL  (spec §10)
  // ═══════════════════════════════════════════════════════════════════════════

  computePadWear(
    anchorMm: number | null,
    distanceKm: number,
    biasShare: number,
    usageFactor: number,
    stopDensityFactor: number,
    hardBrakeFactor: number,
    fullBrakingFactor: number,
    rekuFactor: number,
    kFactor: number,
  ): { estimatedMm: number | null; healthPct: number | null; remainingKm: number | null; wearRate: number | null } {
    if (anchorMm == null) return { estimatedMm: null, healthPct: null, remainingKm: null, wearRate: null };

    const usableMm = anchorMm - this.cfg.pad.criticalMm;
    if (usableMm <= 0) return { estimatedMm: anchorMm, healthPct: 0, remainingKm: 0, wearRate: null };

    const baseWearPerKm = usableMm / this.cfg.pad.baseLifeKm;

    const effectiveWearPerKm = baseWearPerKm
      * biasShare / this.cfg.brakeBias.defaultFront
      * usageFactor * stopDensityFactor * hardBrakeFactor * fullBrakingFactor
      * rekuFactor * kFactor;

    const wornMm = distanceKm * effectiveWearPerKm;
    const estimatedMm = clamp(anchorMm - wornMm, 0, anchorMm);
    const healthPct = clamp(((estimatedMm - this.cfg.pad.criticalMm) / usableMm) * 100, 0, 100);
    const remainingMm = estimatedMm - this.cfg.pad.criticalMm;
    const remainingKm = remainingMm > 0 && effectiveWearPerKm > 0
      ? Math.round(remainingMm / effectiveWearPerKm)
      : 0;

    return { estimatedMm: round2(estimatedMm), healthPct: round2(healthPct), remainingKm, wearRate: effectiveWearPerKm };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DISC WEAR MODEL  (spec §11)
  // ═══════════════════════════════════════════════════════════════════════════

  computeDiscWear(
    anchorMm: number | null,
    distanceKm: number,
    biasShare: number,
    usageFactor: number,
    highSpeedFactor: number,
    hardBrakeFactor: number,
    fullBrakingFactor: number,
    thermalFactor: number,
    rekuFactor: number,
    kFactor: number,
  ): { estimatedMm: number | null; healthPct: number | null; remainingKm: number | null; wearRate: number | null } {
    if (anchorMm == null) return { estimatedMm: null, healthPct: null, remainingKm: null, wearRate: null };

    const maxWear = this.cfg.disc.maxWearMm;
    const criticalMm = anchorMm - maxWear;
    const baseWearPerKm = maxWear / this.cfg.disc.baseLifeKm;

    const effectiveWearPerKm = baseWearPerKm
      * biasShare / this.cfg.brakeBias.defaultFront
      * usageFactor * highSpeedFactor * hardBrakeFactor * fullBrakingFactor
      * thermalFactor * rekuFactor * kFactor;

    const wornMm = distanceKm * effectiveWearPerKm;
    const estimatedMm = clamp(anchorMm - wornMm, criticalMm, anchorMm);
    const discWornTotal = anchorMm - estimatedMm;
    const healthPct = clamp(((maxWear - discWornTotal) / maxWear) * 100, 0, 100);
    const remainingMm = estimatedMm - criticalMm;
    const remainingKm = remainingMm > 0 && effectiveWearPerKm > 0
      ? Math.round(remainingMm / effectiveWearPerKm)
      : 0;

    return { estimatedMm: round2(estimatedMm), healthPct: round2(healthPct), remainingKm, wearRate: effectiveWearPerKm };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  USAGE / FACTOR HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  computePadUsageFactor(impact: VehicleImpactForBrake | null): number {
    if (!impact) return 1.0;
    const city = impact.citySharePct ?? 33;
    const highway = impact.highwaySharePct ?? 34;
    const country = impact.countryRoadSharePct ?? 33;
    const total = (city + highway + country) || 100;
    const f = this.cfg.padUsageFactors;
    return round2(
      (city / total) * f.city +
      (highway / total) * f.highway +
      (country / total) * f.countryRoad,
    );
  }

  computeDiscUsageFactor(impact: VehicleImpactForBrake | null): number {
    if (!impact) return 1.0;
    const city = impact.citySharePct ?? 33;
    const highway = impact.highwaySharePct ?? 34;
    const country = impact.countryRoadSharePct ?? 33;
    const total = (city + highway + country) || 100;
    const f = this.cfg.discUsageFactors;
    return round2(
      (city / total) * f.city +
      (highway / total) * f.highway +
      (country / total) * f.countryRoad,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CONFIDENCE  (spec §14)
  // ═══════════════════════════════════════════════════════════════════════════

  private computeConfidence(
    vehicleId: string,
    current: any,
    impact: VehicleImpactForBrake | null,
  ): { score: number; label: string } {
    const c = this.cfg.confidence;
    let score = 0;

    if (current.frontPadAnchorMm != null || current.rearPadAnchorMm != null) score += c.padAnchors;
    if (current.frontDiscAnchorMm != null || current.rearDiscAnchorMm != null) score += c.rotorAnchors;
    if (current.anchorServiceDate != null) score += c.serviceEvents;
    if (impact) score += c.drivingImpactData;
    if (impact?.brakingStressScore != null) score += c.brakingMetrics;
    if (impact?.stopDensity != null) score += c.usageData;
    if (current.anchorOdometerKm != null) score += c.odometerAvailable;
    if (current.calibrationCount >= (this.cfg.calibration.stabilizedThreshold ?? 4)) score += c.calibrationStabilized;

    score = clamp(score, 0, 100);
    let label: string;
    if (score >= this.cfg.confidenceThresholds.high) label = 'High';
    else if (score >= this.cfg.confidenceThresholds.medium) label = 'Medium';
    else label = 'Low';

    return { score, label };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ALERTS  (spec §16)
  // ═══════════════════════════════════════════════════════════════════════════

  private computeAlerts(current: any): BrakeAlert[] {
    const alerts: BrakeAlert[] = [];
    const a = this.cfg.alerts;

    for (const [label, mm] of [['Front pads', current.frontPadEstimatedMm], ['Rear pads', current.rearPadEstimatedMm]] as const) {
      if (mm != null && mm <= this.cfg.pad.criticalMm) {
        alerts.push({ type: 'PAD_CRITICAL', severity: 'critical', message: `${label}: critically low (${(mm as number).toFixed(1)} mm)`, value: mm as number });
      } else if (mm != null && mm <= this.cfg.pad.warningMm) {
        alerts.push({ type: 'PAD_WARNING', severity: 'warning', message: `${label}: approaching limit (${(mm as number).toFixed(1)} mm)`, value: mm as number });
      }
    }

    for (const [label, anchorMm, estimatedMm] of [
      ['Front discs', current.frontDiscAnchorMm, current.frontDiscEstimatedMm],
      ['Rear discs', current.rearDiscAnchorMm, current.rearDiscEstimatedMm],
    ] as const) {
      if (anchorMm != null && estimatedMm != null) {
        const critMm = (anchorMm as number) - this.cfg.disc.maxWearMm;
        const warnMm = (anchorMm as number) - this.cfg.disc.warningWearMm;
        if ((estimatedMm as number) <= critMm) {
          alerts.push({ type: 'DISC_CRITICAL', severity: 'critical', message: `${label}: critically worn`, value: estimatedMm as number });
        } else if ((estimatedMm as number) <= warnMm) {
          alerts.push({ type: 'DISC_WARNING', severity: 'warning', message: `${label}: approaching wear limit`, value: estimatedMm as number });
        }
      }
    }

    const minRemaining = Math.min(
      current.padsRemainingKm ?? Infinity,
      current.discsRemainingKm ?? Infinity,
    );
    if (minRemaining <= a.criticalRemainingKm) {
      alerts.push({ type: 'CRITICAL_REMAINING_KM', severity: 'critical', message: `Brake replacement imminent (${Math.round(minRemaining).toLocaleString()} km)`, value: minRemaining });
    } else if (minRemaining <= a.lowRemainingKm) {
      alerts.push({ type: 'LOW_REMAINING_KM', severity: 'warning', message: `Plan brake service soon (${Math.round(minRemaining).toLocaleString()} km)`, value: minRemaining });
    }

    if (current.confidenceScore != null && current.confidenceScore < a.lowConfidenceThreshold) {
      alerts.push({ type: 'LOW_CONFIDENCE', severity: 'info', message: 'Brake health estimate confidence is low — service data recommended' });
    }

    return alerts;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private toAxleEstimate(
    anchor: number | null, estimated: number | null, health: number | null,
    remaining: number | null, wearRate: number | null, kFactor: number,
  ): AxleEstimate {
    return {
      anchorMm: anchor, estimatedMm: estimated != null ? round2(estimated) : null,
      healthPct: health != null ? round2(health) : null,
      remainingKm: remaining != null ? Math.round(remaining) : null,
      wearRateMmPerKm: wearRate != null ? round2(wearRate * 1000) : null,
      kFactor: round2(kFactor),
    };
  }

  private async computeFactorsForDisplay(vehicleId: string, impact: VehicleImpactForBrake | null): Promise<Record<string, number>> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { fuelType: true, brakeForceFrontPercent: true },
    });
    const fuelType = vehicle?.fuelType ?? 'GASOLINE';
    return {
      padUsageFactor: this.computePadUsageFactor(impact),
      padStopDensityFactor: lookupSteppedFactor(impact?.stopDensity ?? 0, this.cfg.padStopDensityAnchors),
      padHardBrakeFactor: lookupSteppedFactor(impact?.hardBrakePer100Km ?? 0, this.cfg.padHardBrakeAnchors),
      padFullBrakingFactor: lookupSteppedFactor(impact?.fullBrakingPer100Km ?? 0, this.cfg.padFullBrakingAnchors),
      padRekuFactor: this.cfg.padRekuFactors[fuelType] ?? 1.0,
      discUsageFactor: this.computeDiscUsageFactor(impact),
      discHighSpeedFactor: lookupSteppedFactor((impact?.highSpeedBrakeShare ?? 0) * 100, this.cfg.discHighSpeedBrakeAnchors),
      discHardBrakeFactor: lookupSteppedFactor(impact?.hardBrakePer100Km ?? 0, this.cfg.discHardBrakeAnchors),
      discFullBrakingFactor: lookupSteppedFactor(impact?.fullBrakingPer100Km ?? 0, this.cfg.discFullBrakingAnchors),
      discThermalFactor: interpolateThermalFactor(impact?.thermalBrakeStressScore ?? 0, this.cfg.discThermalAnchors),
      discRekuFactor: this.cfg.discRekuFactors[fuelType] ?? 1.0,
      brakeBiasFront: vehicle?.brakeForceFrontPercent != null ? vehicle.brakeForceFrontPercent / 100 : this.cfg.brakeBias.defaultFront,
    };
  }
}
