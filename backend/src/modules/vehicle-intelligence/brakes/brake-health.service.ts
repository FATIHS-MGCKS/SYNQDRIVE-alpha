import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DrivingImpactService,
  VehicleImpactForBrake,
} from '../driving-impact/driving-impact.service';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';
import { BrakeEvidenceService } from './brake-evidence.service';
import {
  aggregateBrakeCondition,
  alertCodeSeverity,
  alertTypeToCode,
  buildRemainingKmRange,
  classifyConfidenceLevel,
  classifyDtcSeverity,
  classifyEstimatedCondition,
  classifyFluidStatus,
  classifyMeasuredThickness,
  classifyDiscConditionLabel,
  evidenceSourceToDataBasis,
  isAlertableCondition,
  strongerDataBasis,
  type BrakeAlertCode,
  type BrakeCondition,
  type BrakeConfidenceLevel,
  type BrakeDataBasis,
} from './brake-status';

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
  if (score >= anchors[anchors.length - 1].score) {
    return anchors[anchors.length - 1].factor;
  }
  for (let i = 0; i < anchors.length - 1; i++) {
    if (score >= anchors[i].score && score <= anchors[i + 1].score) {
      const t = (score - anchors[i].score) / (anchors[i + 1].score - anchors[i].score);
      return anchors[i].factor + t * (anchors[i + 1].factor - anchors[i].factor);
    }
  }
  return 1.0;
}

const CONFIDENCE_RANK: Record<BrakeConfidenceLevel, number> = {
  UNKNOWN: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

/** Worse (lower) of two confidence levels; UNKNOWN defers to a known level. */
function worstConfidence(a: BrakeConfidenceLevel, b: BrakeConfidenceLevel): BrakeConfidenceLevel {
  if (a === 'UNKNOWN') return b;
  if (b === 'UNKNOWN') return a;
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

function brakeAxleLabel(axle: 'FRONT' | 'REAR'): string {
  return axle === 'FRONT' ? 'Vorderachse' : 'Hinterachse';
}

export type BrakeStateClass = 'MEASURED' | 'ESTIMATED' | 'WARNING_ONLY' | 'NO_BASELINE';
export type BrakeLimitingComponent =
  | 'FRONT_PADS'
  | 'REAR_PADS'
  | 'FRONT_DISCS'
  | 'REAR_DISCS'
  | 'PADS_SET'
  | 'DISCS_SET'
  | null;
export type BrakeModelingSource =
  | 'trip_impacts'
  | 'trip_impacts_plus_rolling_gap'
  | 'rolling_gap_only'
  | 'none';

export interface BrakeModeledComponentsDto {
  frontPads: boolean;
  rearPads: boolean;
  frontDiscs: boolean;
  rearDiscs: boolean;
  hasAnyPads: boolean;
  hasAnyDiscs: boolean;
  hasAnyModeled: boolean;
}

export interface BrakeModelCoverageDto {
  distanceSinceAnchorKm: number | null;
  modeledDistanceKm: number | null;
  modeledTripCount: number;
  coverageRatio: number | null;
  hasGap: boolean;
  source: BrakeModelingSource;
}

export interface BrakeCanonicalAlertDto {
  code: BrakeAlertCode;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  axle?: 'FRONT' | 'REAR' | 'UNKNOWN';
}

export interface BrakeHealthSummaryDto {
  isInitialized: boolean;
  stateClass: BrakeStateClass;
  status?: string;
  message?: string;
  actions?: { canAddBrakeService: boolean; canUseAiUpload: boolean };
  pads?: { healthPercent: number; estimatedLifetimeKm: number | null };
  discs?: { healthPercent: number; estimatedLifetimeKm: number | null };
  limitingComponent?: BrakeLimitingComponent;
  remainingKm?: number | null;
  modeledComponents: BrakeModeledComponentsDto;
  modelCoverage: BrakeModelCoverageDto;
  lastChangeAt?: string | null;
  lastRecalculatedAt?: string | null;
  confidence?: { score: number; label: string };
  baselineWarnings: string[];
  provenanceWarnings: string[];
  hasAlert?: boolean;
  legacyHeuristic?: { available: boolean; note: string };

  // ── Canonical evidence-based read model ────────────────────────────────────
  // The honest condition every consumer reads. Estimates cap at WARNING; a
  // CRITICAL condition is only produced by a real safety signal.
  overallCondition: BrakeCondition;
  dataBasis: BrakeDataBasis;
  confidenceLevel: BrakeConfidenceLevel;
  frontAxleCondition: BrakeCondition;
  rearAxleCondition: BrakeCondition;
  frontDataBasis: BrakeDataBasis;
  rearDataBasis: BrakeDataBasis;
  frontConfidence: BrakeConfidenceLevel;
  rearConfidence: BrakeConfidenceLevel;
  estimatedFrontRemainingKmMin: number | null;
  estimatedFrontRemainingKmMax: number | null;
  estimatedRearRemainingKmMin: number | null;
  estimatedRearRemainingKmMax: number | null;
  nextInspectionRecommendedInKm: number | null;
  estimatedReplacementDueInKm: number | null;
  reasons: string[];
  recommendations: string[];
  openAlerts: BrakeCanonicalAlertDto[];
  lastMeasurementAt: string | null;
  lastMeasurementMileageKm: number | null;
  lastServiceAt: string | null;
  lastServiceMileageKm: number | null;
  updatedAt: string | null;
}

export type BrakeCanonicalReadModel = Pick<
  BrakeHealthSummaryDto,
  | 'overallCondition'
  | 'dataBasis'
  | 'confidenceLevel'
  | 'frontAxleCondition'
  | 'rearAxleCondition'
  | 'frontDataBasis'
  | 'rearDataBasis'
  | 'frontConfidence'
  | 'rearConfidence'
  | 'estimatedFrontRemainingKmMin'
  | 'estimatedFrontRemainingKmMax'
  | 'estimatedRearRemainingKmMin'
  | 'estimatedRearRemainingKmMax'
  | 'nextInspectionRecommendedInKm'
  | 'estimatedReplacementDueInKm'
  | 'reasons'
  | 'recommendations'
  | 'openAlerts'
  | 'lastMeasurementAt'
  | 'lastMeasurementMileageKm'
  | 'lastServiceAt'
  | 'lastServiceMileageKm'
  | 'updatedAt'
>;

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

type BrakeImpactLike = {
  citySharePct: number | null;
  highwaySharePct: number | null;
  countryRoadSharePct: number | null;
  hardBrakePer100Km: number | null;
  fullBrakingPer100Km: number | null;
  stopDensity: number | null;
  highSpeedBrakeShare: number | null;
  thermalBrakeStressScore: number | null;
};

@Injectable()
export class BrakeHealthService {
  private readonly cfg = BRAKE_HEALTH_CONFIG;

  constructor(
    private readonly prisma: PrismaService,
    private readonly drivingImpactService: DrivingImpactService,
    private readonly brakeEvidence: BrakeEvidenceService,
  ) {}

  async getSummary(vehicleId: string): Promise<BrakeHealthSummaryDto> {
    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    const modeledComponents = this.deriveModeledComponents(current);

    if (
      !current ||
      !current.isInitialized ||
      current.anchorOdometerKm == null ||
      !modeledComponents.hasAnyModeled
    ) {
      return this.buildNoBaselineSummary(vehicleId, current, modeledComponents);
    }

    const padPct = current.padsHealthPct != null ? round2(current.padsHealthPct) : null;
    const discPct = current.discsHealthPct != null ? round2(current.discsHealthPct) : null;
    const minPct = Math.min(padPct ?? 101, discPct ?? 101);
    const status = minPct >= 60 ? 'healthy' : minPct >= 30 ? 'attention' : 'critical';
    const stateClass = this.deriveStateClass(current, modeledComponents);
    const limitingComponent = this.deriveLimitingComponent(current);
    const baselineWarnings = this.readWarningArray(current?.baselineWarnings);
    const coverageWarnings = this.computeCoverageWarnings(
      current?.modelCoverageRatio,
      current?.distanceSinceAnchorKm,
      current?.modeledDistanceKm,
      current?.modeledTripCount ?? 0,
      (current?.modelingSource as BrakeModelingSource) ?? 'none',
    );
    const remainingKm = Math.min(
      current.padsRemainingKm ?? Number.POSITIVE_INFINITY,
      current.discsRemainingKm ?? Number.POSITIVE_INFINITY,
    );

    const canonical = await this.buildCanonicalReadModel(vehicleId, current, modeledComponents);

    return {
      isInitialized: true,
      stateClass,
      status,
      actions: { canAddBrakeService: true, canUseAiUpload: true },
      pads:
        padPct != null
          ? {
              healthPercent: Math.round(padPct),
              estimatedLifetimeKm:
                current.padsRemainingKm != null ? Math.round(current.padsRemainingKm) : null,
            }
          : undefined,
      discs:
        discPct != null
          ? {
              healthPercent: Math.round(discPct),
              estimatedLifetimeKm:
                current.discsRemainingKm != null ? Math.round(current.discsRemainingKm) : null,
            }
          : undefined,
      limitingComponent,
      remainingKm: Number.isFinite(remainingKm) ? Math.round(remainingKm) : null,
      modeledComponents,
      modelCoverage: {
        distanceSinceAnchorKm:
          current.distanceSinceAnchorKm != null ? round2(current.distanceSinceAnchorKm) : null,
        modeledDistanceKm:
          current.modeledDistanceKm != null ? round2(current.modeledDistanceKm) : null,
        modeledTripCount: current.modeledTripCount ?? 0,
        coverageRatio:
          current.modelCoverageRatio != null ? round2(current.modelCoverageRatio) : null,
        hasGap:
          (current.distanceSinceAnchorKm ?? 0) > 0 &&
          (current.modeledDistanceKm ?? 0) + 1 < (current.distanceSinceAnchorKm ?? 0),
        source: ((current.modelingSource as BrakeModelingSource) ?? 'none') as BrakeModelingSource,
      },
      lastChangeAt: current.anchorServiceDate?.toISOString() ?? null,
      lastRecalculatedAt: current.lastRecalculatedAt?.toISOString() ?? null,
      confidence: {
        score: Math.round(current.confidenceScore ?? 0),
        label: current.confidenceLabel ?? 'Low',
      },
      baselineWarnings,
      provenanceWarnings: coverageWarnings,
      hasAlert: current.hasAlert,
      legacyHeuristic: {
        available: false,
        note: 'Legacy brake-status is deprecated and not used as primary truth.',
      },
      ...canonical,
    };
  }

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
    const alerts =
      summary.stateClass === 'NO_BASELINE' || summary.stateClass === 'WARNING_ONLY' || !current
        ? []
        : this.computeAlerts(current);
    const factors =
      summary.stateClass === 'NO_BASELINE' || summary.stateClass === 'WARNING_ONLY'
        ? {}
        : await this.computeFactorsForDisplay(vehicleId, impact);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { brakeForceFrontPercent: true },
    });
    const biasFront =
      vehicle?.brakeForceFrontPercent != null
        ? vehicle.brakeForceFrontPercent / 100
        : this.cfg.brakeBias.defaultFront;

    return {
      summary,
      frontPads:
        current && summary.modeledComponents.frontPads
          ? this.toAxleEstimate(
              current.frontPadAnchorMm,
              current.frontPadEstimatedMm,
              current.frontPadHealthPct,
              current.frontPadRemainingKm,
              current.frontPadWearRateMmPerKm,
              current.frontPadKFactor,
            )
          : null,
      rearPads:
        current && summary.modeledComponents.rearPads
          ? this.toAxleEstimate(
              current.rearPadAnchorMm,
              current.rearPadEstimatedMm,
              current.rearPadHealthPct,
              current.rearPadRemainingKm,
              current.rearPadWearRateMmPerKm,
              current.rearPadKFactor,
            )
          : null,
      frontDiscs:
        current && summary.modeledComponents.frontDiscs
          ? this.toAxleEstimate(
              current.frontDiscAnchorMm,
              current.frontDiscEstimatedMm,
              current.frontDiscHealthPct,
              current.frontDiscRemainingKm,
              current.frontDiscWearRateMmPerKm,
              current.frontDiscKFactor,
            )
          : null,
      rearDiscs:
        current && summary.modeledComponents.rearDiscs
          ? this.toAxleEstimate(
              current.rearDiscAnchorMm,
              current.rearDiscEstimatedMm,
              current.rearDiscHealthPct,
              current.rearDiscRemainingKm,
              current.rearDiscWearRateMmPerKm,
              current.rearDiscKFactor,
            )
          : null,
      specs: specs[0] ?? null,
      history: history.map((e) => ({
        id: e.id,
        date: e.eventDate.toISOString(),
        odometerKm: e.odometerKm,
        workshopName: e.workshopName,
        notes: e.notes,
        costCents: e.costCents,
        serviceKind: e.brakeServiceKind,
        source: e.brakeServiceSource,
        scope: e.brakeServiceScope,
        lifecycleApplied: e.brakeLifecycleApplied,
        lifecycleNote: e.brakeLifecycleNote,
      })),
      alerts,
      factors,
      drivingImpactAvailable: impact != null,
      distanceSinceAnchorKm:
        current?.distanceSinceAnchorKm != null ? round2(current.distanceSinceAnchorKm) : null,
      brakeBiasInfo: {
        front: Math.round(biasFront * 100),
        rear: Math.round((1 - biasFront) * 100),
        source:
          vehicle?.brakeForceFrontPercent != null
            ? 'Vehicle master data'
            : 'EBD fallback estimate',
      },
    };
  }

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
      select: { organizationId: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found');

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });
    const odo = data.odometerKm ?? latestState?.odometerKm ?? null;
    const serviceDate = new Date(data.serviceDate);
    if (Number.isNaN(serviceDate.getTime())) {
      throw new BadRequestException('Invalid serviceDate');
    }

    const specs = await this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const spec = specs[0];

    const measured = {
      frontPadMm: this.normalizePositive(data.frontPadMm),
      rearPadMm: this.normalizePositive(data.rearPadMm),
      frontDiscMm: this.normalizePositive(data.frontRotorWidthMm),
      rearDiscMm: this.normalizePositive(data.rearRotorWidthMm),
    };

    const frontPadAnchor = measured.frontPadMm ?? this.normalizePositive(spec?.frontPadThickness);
    const rearPadAnchor = measured.rearPadMm ?? this.normalizePositive(spec?.rearPadThickness);
    const frontDiscAnchor =
      measured.frontDiscMm ?? this.normalizePositive(spec?.frontRotorWidth);
    const rearDiscAnchor = measured.rearDiscMm ?? this.normalizePositive(spec?.rearRotorWidth);

    const hasAnyAnchor =
      frontPadAnchor != null ||
      rearPadAnchor != null ||
      frontDiscAnchor != null ||
      rearDiscAnchor != null;
    const hasMeasuredAnchor =
      measured.frontPadMm != null ||
      measured.rearPadMm != null ||
      measured.frontDiscMm != null ||
      measured.rearDiscMm != null;

    const baselineWarnings: string[] = [];
    if (!hasAnyAnchor) {
      baselineWarnings.push(
        'No usable pad/disc thickness baseline found. Provide measured brake thickness values to initialize V2.',
      );
    }
    if (odo == null) {
      baselineWarnings.push(
        'No odometer anchor available. Provide service odometer to start modeled wear tracking.',
      );
    }
    if (hasAnyAnchor && !hasMeasuredAnchor) {
      baselineWarnings.push(
        'Using nominal reference-spec baseline (estimated). Add measured thickness at next inspection to improve confidence.',
      );
    }

    const canInitialize = hasAnyAnchor && odo != null;
    const stateClass: BrakeStateClass = canInitialize
      ? hasMeasuredAnchor
        ? 'MEASURED'
        : 'ESTIMATED'
      : 'NO_BASELINE';

    await this.prisma.brakeHealthCurrent.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        organizationId: vehicle.organizationId,
        isInitialized: canInitialize,
        anchorServiceDate: canInitialize ? serviceDate : null,
        anchorOdometerKm: canInitialize ? odo : null,
        frontPadAnchorMm: frontPadAnchor,
        rearPadAnchorMm: rearPadAnchor,
        frontPadEstimatedMm: frontPadAnchor,
        rearPadEstimatedMm: rearPadAnchor,
        frontPadHealthPct: canInitialize && frontPadAnchor != null ? 100 : null,
        rearPadHealthPct: canInitialize && rearPadAnchor != null ? 100 : null,
        frontDiscAnchorMm: frontDiscAnchor,
        rearDiscAnchorMm: rearDiscAnchor,
        frontDiscEstimatedMm: frontDiscAnchor,
        rearDiscEstimatedMm: rearDiscAnchor,
        frontDiscHealthPct: canInitialize && frontDiscAnchor != null ? 100 : null,
        rearDiscHealthPct: canInitialize && rearDiscAnchor != null ? 100 : null,
        padsHealthPct: canInitialize ? 100 : null,
        padsRemainingKm: null,
        discsHealthPct: canInitialize ? 100 : null,
        discsRemainingKm: null,
        distanceSinceAnchorKm: canInitialize ? 0 : null,
        stateClass: stateClass,
        anchorValidationStatus: canInitialize
          ? hasMeasuredAnchor
            ? 'measured_anchor'
            : 'spec_fallback_anchor'
          : 'invalid',
        modelCoverageRatio: canInitialize ? 0 : null,
        modeledDistanceKm: canInitialize ? 0 : null,
        modeledTripCount: 0,
        modelingSource: 'none',
        baselineWarnings: baselineWarnings,
        modelVersion: this.cfg.MODEL_VERSION,
      },
      update: {
        isInitialized: canInitialize,
        anchorServiceDate: canInitialize ? serviceDate : null,
        anchorOdometerKm: canInitialize ? odo : null,
        frontPadAnchorMm: frontPadAnchor,
        rearPadAnchorMm: rearPadAnchor,
        frontPadEstimatedMm: frontPadAnchor,
        rearPadEstimatedMm: rearPadAnchor,
        frontPadHealthPct: canInitialize && frontPadAnchor != null ? 100 : null,
        rearPadHealthPct: canInitialize && rearPadAnchor != null ? 100 : null,
        frontDiscAnchorMm: frontDiscAnchor,
        rearDiscAnchorMm: rearDiscAnchor,
        frontDiscEstimatedMm: frontDiscAnchor,
        rearDiscEstimatedMm: rearDiscAnchor,
        frontDiscHealthPct: canInitialize && frontDiscAnchor != null ? 100 : null,
        rearDiscHealthPct: canInitialize && rearDiscAnchor != null ? 100 : null,
        padsHealthPct: canInitialize ? 100 : null,
        padsRemainingKm: null,
        discsHealthPct: canInitialize ? 100 : null,
        discsRemainingKm: null,
        distanceSinceAnchorKm: canInitialize ? 0 : null,
        frontPadKFactor: 1.0,
        rearPadKFactor: 1.0,
        frontDiscKFactor: 1.0,
        rearDiscKFactor: 1.0,
        calibrationCount: 0,
        hasAlert: false,
        stateClass: stateClass,
        anchorValidationStatus: canInitialize
          ? hasMeasuredAnchor
            ? 'measured_anchor'
            : 'spec_fallback_anchor'
          : 'invalid',
        modelCoverageRatio: canInitialize ? 0 : null,
        modeledDistanceKm: canInitialize ? 0 : null,
        modeledTripCount: 0,
        modelingSource: 'none',
        baselineWarnings: baselineWarnings,
        lastRecalculatedAt: canInitialize ? new Date() : null,
        modelVersion: this.cfg.MODEL_VERSION,
      },
    });

    if (canInitialize) {
      await this.recalculate(vehicleId);
      return {
        success: true,
        initialized: true,
        stateClass,
        message: hasMeasuredAnchor
          ? 'Brake health baseline initialized from measured service data.'
          : 'Brake health baseline initialized from reference-spec fallback.',
      };
    }

    return {
      success: false,
      initialized: false,
      stateClass: 'NO_BASELINE',
      message:
        'Brake service history was recorded, but V2 wear tracking was not initialized due to missing baseline odometer and/or thickness anchors.',
      warnings: baselineWarnings,
    };
  }

  async recalculate(vehicleId: string) {
    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    if (!current?.isInitialized || current.anchorOdometerKm == null || !current.anchorServiceDate) {
      return null;
    }

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
    const fuelType = vehicle?.fuelType ?? 'GASOLINE';
    const brakeBiasFront =
      vehicle?.brakeForceFrontPercent != null
        ? vehicle.brakeForceFrontPercent / 100
        : this.cfg.brakeBias.defaultFront;
    const brakeBiasRear = 1 - brakeBiasFront;

    const tripImpacts = await this.prisma.tripDrivingImpact.findMany({
      where: {
        vehicleId,
        tripStartedAt: { gte: current.anchorServiceDate },
      },
      orderBy: { tripStartedAt: 'asc' },
      select: {
        tripId: true,
        distanceKm: true,
        citySharePct: true,
        highwaySharePct: true,
        countryRoadSharePct: true,
        hardBrakePer100Km: true,
        fullBrakingPer100Km: true,
        stopDensity: true,
        highSpeedBrakeShare: true,
        thermalBrakeStressScore: true,
      },
    });

    let modeledDistanceFromTrips = 0;
    let modeledTripCount = 0;

    let frontPadWorn = 0;
    let rearPadWorn = 0;
    let frontDiscWorn = 0;
    let rearDiscWorn = 0;

    for (const trip of tripImpacts) {
      const tripDistance = trip.distanceKm ?? 0;
      if (!(tripDistance > 0)) continue;
      modeledTripCount += 1;
      modeledDistanceFromTrips += tripDistance;

      const padUsage = this.computePadUsageFactor(trip);
      const padStopDensity = lookupSteppedFactor(
        trip.stopDensity ?? 0,
        this.cfg.padStopDensityAnchors,
      );
      const padHardBrake = lookupSteppedFactor(
        trip.hardBrakePer100Km ?? 0,
        this.cfg.padHardBrakeAnchors,
      );
      const padFullBraking = lookupSteppedFactor(
        trip.fullBrakingPer100Km ?? 0,
        this.cfg.padFullBrakingAnchors,
      );
      const padReku = this.cfg.padRekuFactors[fuelType] ?? 1.0;

      if (current.frontPadAnchorMm != null) {
        const rate = this.computePadRatePerKm(
          current.frontPadAnchorMm,
          brakeBiasFront,
          padUsage,
          padStopDensity,
          padHardBrake,
          padFullBraking,
          padReku,
          current.frontPadKFactor,
        );
        frontPadWorn += tripDistance * rate;
      }
      if (current.rearPadAnchorMm != null) {
        const rate = this.computePadRatePerKm(
          current.rearPadAnchorMm,
          brakeBiasRear,
          padUsage,
          padStopDensity,
          padHardBrake,
          padFullBraking,
          padReku,
          current.rearPadKFactor,
        );
        rearPadWorn += tripDistance * rate;
      }

      const discUsage = this.computeDiscUsageFactor(trip);
      const discHighSpeed = lookupSteppedFactor(
        (trip.highSpeedBrakeShare ?? 0) * 100,
        this.cfg.discHighSpeedBrakeAnchors,
      );
      const discHardBrake = lookupSteppedFactor(
        trip.hardBrakePer100Km ?? 0,
        this.cfg.discHardBrakeAnchors,
      );
      const discFullBraking = lookupSteppedFactor(
        trip.fullBrakingPer100Km ?? 0,
        this.cfg.discFullBrakingAnchors,
      );
      const discThermal = interpolateThermalFactor(
        trip.thermalBrakeStressScore ?? 0,
        this.cfg.discThermalAnchors,
      );
      const discReku = this.cfg.discRekuFactors[fuelType] ?? 1.0;

      if (current.frontDiscAnchorMm != null) {
        const rate = this.computeDiscRatePerKm(
          current.frontDiscAnchorMm,
          brakeBiasFront,
          discUsage,
          discHighSpeed,
          discHardBrake,
          discFullBraking,
          discThermal,
          discReku,
          current.frontDiscKFactor,
        );
        frontDiscWorn += tripDistance * rate;
      }
      if (current.rearDiscAnchorMm != null) {
        const rate = this.computeDiscRatePerKm(
          current.rearDiscAnchorMm,
          brakeBiasRear,
          discUsage,
          discHighSpeed,
          discHardBrake,
          discFullBraking,
          discThermal,
          discReku,
          current.rearDiscKFactor,
        );
        rearDiscWorn += tripDistance * rate;
      }
    }

    const uncoveredDistance = Math.max(0, distanceSinceAnchor - modeledDistanceFromTrips);
    const rollingImpact = await this.drivingImpactService.getVehicleImpactForBrake(vehicleId);
    let modelingSource: BrakeModelingSource = modeledDistanceFromTrips > 0 ? 'trip_impacts' : 'none';
    const baselineWarnings = this.readWarningArray(current.baselineWarnings);

    if (uncoveredDistance > 0 && rollingImpact) {
      const padUsage = this.computePadUsageFactor(rollingImpact);
      const padStopDensity = lookupSteppedFactor(
        rollingImpact.stopDensity ?? 0,
        this.cfg.padStopDensityAnchors,
      );
      const padHardBrake = lookupSteppedFactor(
        rollingImpact.hardBrakePer100Km ?? 0,
        this.cfg.padHardBrakeAnchors,
      );
      const padFullBraking = lookupSteppedFactor(
        rollingImpact.fullBrakingPer100Km ?? 0,
        this.cfg.padFullBrakingAnchors,
      );
      const padReku = this.cfg.padRekuFactors[fuelType] ?? 1.0;

      const discUsage = this.computeDiscUsageFactor(rollingImpact);
      const discHighSpeed = lookupSteppedFactor(
        (rollingImpact.highSpeedBrakeShare ?? 0) * 100,
        this.cfg.discHighSpeedBrakeAnchors,
      );
      const discHardBrake = lookupSteppedFactor(
        rollingImpact.hardBrakePer100Km ?? 0,
        this.cfg.discHardBrakeAnchors,
      );
      const discFullBraking = lookupSteppedFactor(
        rollingImpact.fullBrakingPer100Km ?? 0,
        this.cfg.discFullBrakingAnchors,
      );
      const discThermal = interpolateThermalFactor(
        rollingImpact.thermalBrakeStressScore ?? 0,
        this.cfg.discThermalAnchors,
      );
      const discReku = this.cfg.discRekuFactors[fuelType] ?? 1.0;

      if (current.frontPadAnchorMm != null) {
        frontPadWorn +=
          uncoveredDistance *
          this.computePadRatePerKm(
            current.frontPadAnchorMm,
            brakeBiasFront,
            padUsage,
            padStopDensity,
            padHardBrake,
            padFullBraking,
            padReku,
            current.frontPadKFactor,
          );
      }
      if (current.rearPadAnchorMm != null) {
        rearPadWorn +=
          uncoveredDistance *
          this.computePadRatePerKm(
            current.rearPadAnchorMm,
            brakeBiasRear,
            padUsage,
            padStopDensity,
            padHardBrake,
            padFullBraking,
            padReku,
            current.rearPadKFactor,
          );
      }
      if (current.frontDiscAnchorMm != null) {
        frontDiscWorn +=
          uncoveredDistance *
          this.computeDiscRatePerKm(
            current.frontDiscAnchorMm,
            brakeBiasFront,
            discUsage,
            discHighSpeed,
            discHardBrake,
            discFullBraking,
            discThermal,
            discReku,
            current.frontDiscKFactor,
          );
      }
      if (current.rearDiscAnchorMm != null) {
        rearDiscWorn +=
          uncoveredDistance *
          this.computeDiscRatePerKm(
            current.rearDiscAnchorMm,
            brakeBiasRear,
            discUsage,
            discHighSpeed,
            discHardBrake,
            discFullBraking,
            discThermal,
            discReku,
            current.rearDiscKFactor,
          );
      }
      modelingSource =
        modeledDistanceFromTrips > 0 ? 'trip_impacts_plus_rolling_gap' : 'rolling_gap_only';
    } else if (uncoveredDistance > 0 && !rollingImpact) {
      baselineWarnings.push(
        'Trip-impact coverage is incomplete and no rolling impact fallback is available for the uncovered distance.',
      );
    }

    const modeledDistance = modeledDistanceFromTrips;
    const coverageRatio =
      distanceSinceAnchor > 0 ? clamp(modeledDistance / distanceSinceAnchor, 0, 1) : 1;

    const frontPadResult = this.computePadFromWorn(
      current.frontPadAnchorMm,
      frontPadWorn,
      distanceSinceAnchor,
    );
    const rearPadResult = this.computePadFromWorn(
      current.rearPadAnchorMm,
      rearPadWorn,
      distanceSinceAnchor,
    );
    const frontDiscResult = this.computeDiscFromWorn(
      current.frontDiscAnchorMm,
      frontDiscWorn,
      distanceSinceAnchor,
    );
    const rearDiscResult = this.computeDiscFromWorn(
      current.rearDiscAnchorMm,
      rearDiscWorn,
      distanceSinceAnchor,
    );

    const padsPcts = [frontPadResult.healthPct, rearPadResult.healthPct].filter(
      (v): v is number => v != null,
    );
    const padsHealthPct =
      padsPcts.length > 0
        ? round2(
            this.cfg.setLevel.minWeight * Math.min(...padsPcts) +
              this.cfg.setLevel.avgWeight *
                (padsPcts.reduce((a, b) => a + b, 0) / padsPcts.length),
          )
        : null;
    const padsRemainingKm = Math.min(
      frontPadResult.remainingKm ?? Number.POSITIVE_INFINITY,
      rearPadResult.remainingKm ?? Number.POSITIVE_INFINITY,
    );

    const discsPcts = [frontDiscResult.healthPct, rearDiscResult.healthPct].filter(
      (v): v is number => v != null,
    );
    const discsHealthPct =
      discsPcts.length > 0
        ? round2(
            this.cfg.setLevel.minWeight * Math.min(...discsPcts) +
              this.cfg.setLevel.avgWeight *
                (discsPcts.reduce((a, b) => a + b, 0) / discsPcts.length),
          )
        : null;
    const discsRemainingKm = Math.min(
      frontDiscResult.remainingKm ?? Number.POSITIVE_INFINITY,
      rearDiscResult.remainingKm ?? Number.POSITIVE_INFINITY,
    );

    const confidence = this.computeConfidence(
      current,
      rollingImpact,
      coverageRatio,
      modeledTripCount,
      modelingSource,
    );

    const modeledComponents = this.deriveModeledComponents(current);
    const stateClass = this.deriveStateClass(
      {
        ...current,
        anchorValidationStatus:
          current.anchorValidationStatus ??
          (this.hasMeasuredAnchorStatus(current) ? 'measured_anchor' : 'spec_fallback_anchor'),
      },
      modeledComponents,
    );

    const updatedData = {
      distanceSinceAnchorKm: round2(distanceSinceAnchor),
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
      padsRemainingKm:
        padsRemainingKm < Number.POSITIVE_INFINITY ? Math.round(padsRemainingKm) : null,
      discsHealthPct: discsHealthPct != null ? clamp(discsHealthPct, 0, 100) : null,
      discsRemainingKm:
        discsRemainingKm < Number.POSITIVE_INFINITY ? Math.round(discsRemainingKm) : null,
      confidenceScore: confidence.score,
      confidenceLabel: confidence.label,
      stateClass,
      modelCoverageRatio: round2(coverageRatio),
      modeledDistanceKm: round2(modeledDistance),
      modeledTripCount,
      modelingSource,
      baselineWarnings,
      lastRecalculatedAt: new Date(),
    };

    const alerts = this.computeAlerts({ ...current, ...updatedData } as any);
    (updatedData as any).hasAlert = alerts.length > 0;

    await this.prisma.brakeHealthCurrent.update({
      where: { vehicleId },
      data: updatedData,
    });

    return {
      padsHealthPct,
      discsHealthPct,
      padsRemainingKm,
      discsRemainingKm,
      confidence,
      alertCount: alerts.length,
      modeledDistanceKm: round2(modeledDistance),
      coverageRatio: round2(coverageRatio),
    };
  }

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
  ): {
    estimatedMm: number | null;
    healthPct: number | null;
    remainingKm: number | null;
    wearRate: number | null;
  } {
    if (anchorMm == null) {
      return { estimatedMm: null, healthPct: null, remainingKm: null, wearRate: null };
    }

    const usableMm = anchorMm - this.cfg.pad.criticalMm;
    if (usableMm <= 0) {
      return { estimatedMm: anchorMm, healthPct: 0, remainingKm: 0, wearRate: null };
    }

    const baseWearPerKm = usableMm / this.cfg.pad.baseLifeKm;

    const effectiveWearPerKm =
      (baseWearPerKm * biasShare) / this.cfg.brakeBias.defaultFront *
      usageFactor *
      stopDensityFactor *
      hardBrakeFactor *
      fullBrakingFactor *
      rekuFactor *
      kFactor;

    const wornMm = distanceKm * effectiveWearPerKm;
    const estimatedMm = clamp(anchorMm - wornMm, 0, anchorMm);
    const healthPct = clamp(
      ((estimatedMm - this.cfg.pad.criticalMm) / usableMm) * 100,
      0,
      100,
    );
    const remainingMm = estimatedMm - this.cfg.pad.criticalMm;
    const remainingKm =
      remainingMm > 0 && effectiveWearPerKm > 0
        ? Math.round(remainingMm / effectiveWearPerKm)
        : 0;

    return {
      estimatedMm: round2(estimatedMm),
      healthPct: round2(healthPct),
      remainingKm,
      wearRate: effectiveWearPerKm,
    };
  }

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
  ): {
    estimatedMm: number | null;
    healthPct: number | null;
    remainingKm: number | null;
    wearRate: number | null;
  } {
    if (anchorMm == null) {
      return { estimatedMm: null, healthPct: null, remainingKm: null, wearRate: null };
    }

    const maxWear = this.cfg.disc.maxWearMm;
    const criticalMm = anchorMm - maxWear;
    const baseWearPerKm = maxWear / this.cfg.disc.baseLifeKm;

    const effectiveWearPerKm =
      (baseWearPerKm * biasShare) / this.cfg.brakeBias.defaultFront *
      usageFactor *
      highSpeedFactor *
      hardBrakeFactor *
      fullBrakingFactor *
      thermalFactor *
      rekuFactor *
      kFactor;

    const wornMm = distanceKm * effectiveWearPerKm;
    const estimatedMm = clamp(anchorMm - wornMm, criticalMm, anchorMm);
    const discWornTotal = anchorMm - estimatedMm;
    const healthPct = clamp(((maxWear - discWornTotal) / maxWear) * 100, 0, 100);
    const remainingMm = estimatedMm - criticalMm;
    const remainingKm =
      remainingMm > 0 && effectiveWearPerKm > 0
        ? Math.round(remainingMm / effectiveWearPerKm)
        : 0;

    return {
      estimatedMm: round2(estimatedMm),
      healthPct: round2(healthPct),
      remainingKm,
      wearRate: effectiveWearPerKm,
    };
  }

  computePadUsageFactor(impact: Pick<BrakeImpactLike, 'citySharePct' | 'highwaySharePct' | 'countryRoadSharePct'> | null): number {
    if (!impact) return 1.0;
    const city = impact.citySharePct ?? 33;
    const highway = impact.highwaySharePct ?? 34;
    const country = impact.countryRoadSharePct ?? 33;
    const total = city + highway + country || 100;
    const f = this.cfg.padUsageFactors;
    return round2(
      (city / total) * f.city +
        (highway / total) * f.highway +
        (country / total) * f.countryRoad,
    );
  }

  computeDiscUsageFactor(impact: Pick<BrakeImpactLike, 'citySharePct' | 'highwaySharePct' | 'countryRoadSharePct'> | null): number {
    if (!impact) return 1.0;
    const city = impact.citySharePct ?? 33;
    const highway = impact.highwaySharePct ?? 34;
    const country = impact.countryRoadSharePct ?? 33;
    const total = city + highway + country || 100;
    const f = this.cfg.discUsageFactors;
    return round2(
      (city / total) * f.city +
        (highway / total) * f.highway +
        (country / total) * f.countryRoad,
    );
  }

  private computePadRatePerKm(
    anchorMm: number,
    biasShare: number,
    usageFactor: number,
    stopDensityFactor: number,
    hardBrakeFactor: number,
    fullBrakingFactor: number,
    rekuFactor: number,
    kFactor: number,
  ): number {
    const usableMm = Math.max(0, anchorMm - this.cfg.pad.criticalMm);
    if (usableMm <= 0) return 0;
    const baseWearPerKm = usableMm / this.cfg.pad.baseLifeKm;
    return (
      (baseWearPerKm * biasShare) / this.cfg.brakeBias.defaultFront *
      usageFactor *
      stopDensityFactor *
      hardBrakeFactor *
      fullBrakingFactor *
      rekuFactor *
      kFactor
    );
  }

  private computeDiscRatePerKm(
    anchorMm: number,
    biasShare: number,
    usageFactor: number,
    highSpeedFactor: number,
    hardBrakeFactor: number,
    fullBrakingFactor: number,
    thermalFactor: number,
    rekuFactor: number,
    kFactor: number,
  ): number {
    const maxWear = this.cfg.disc.maxWearMm;
    const baseWearPerKm = maxWear / this.cfg.disc.baseLifeKm;
    return (
      (baseWearPerKm * biasShare) / this.cfg.brakeBias.defaultFront *
      usageFactor *
      highSpeedFactor *
      hardBrakeFactor *
      fullBrakingFactor *
      thermalFactor *
      rekuFactor *
      kFactor
    );
  }

  private computePadFromWorn(
    anchorMm: number | null,
    wornMm: number,
    distanceSinceAnchor: number,
  ): { estimatedMm: number | null; healthPct: number | null; remainingKm: number | null; wearRate: number | null } {
    if (anchorMm == null) {
      return { estimatedMm: null, healthPct: null, remainingKm: null, wearRate: null };
    }
    const usableMm = anchorMm - this.cfg.pad.criticalMm;
    if (usableMm <= 0) {
      return { estimatedMm: anchorMm, healthPct: 0, remainingKm: 0, wearRate: null };
    }
    const estimatedMm = clamp(anchorMm - wornMm, 0, anchorMm);
    const healthPct = clamp(
      ((estimatedMm - this.cfg.pad.criticalMm) / usableMm) * 100,
      0,
      100,
    );
    const wearRate = distanceSinceAnchor > 0 ? wornMm / distanceSinceAnchor : null;
    const remainingMm = estimatedMm - this.cfg.pad.criticalMm;
    const remainingKm =
      remainingMm > 0 && wearRate != null && wearRate > 0
        ? Math.round(remainingMm / wearRate)
        : 0;
    return {
      estimatedMm: round2(estimatedMm),
      healthPct: round2(healthPct),
      remainingKm,
      wearRate: wearRate != null ? round2(wearRate) : null,
    };
  }

  private computeDiscFromWorn(
    anchorMm: number | null,
    wornMm: number,
    distanceSinceAnchor: number,
  ): { estimatedMm: number | null; healthPct: number | null; remainingKm: number | null; wearRate: number | null } {
    if (anchorMm == null) {
      return { estimatedMm: null, healthPct: null, remainingKm: null, wearRate: null };
    }
    const maxWear = this.cfg.disc.maxWearMm;
    const criticalMm = anchorMm - maxWear;
    const estimatedMm = clamp(anchorMm - wornMm, criticalMm, anchorMm);
    const discWornTotal = anchorMm - estimatedMm;
    const healthPct = clamp(((maxWear - discWornTotal) / maxWear) * 100, 0, 100);
    const wearRate = distanceSinceAnchor > 0 ? wornMm / distanceSinceAnchor : null;
    const remainingMm = estimatedMm - criticalMm;
    const remainingKm =
      remainingMm > 0 && wearRate != null && wearRate > 0
        ? Math.round(remainingMm / wearRate)
        : 0;
    return {
      estimatedMm: round2(estimatedMm),
      healthPct: round2(healthPct),
      remainingKm,
      wearRate: wearRate != null ? round2(wearRate) : null,
    };
  }

  private computeConfidence(
    current: any,
    impact: VehicleImpactForBrake | null,
    coverageRatio: number,
    modeledTripCount: number,
    source: BrakeModelingSource,
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
    if (current.calibrationCount >= (this.cfg.calibration.stabilizedThreshold ?? 4)) {
      score += c.calibrationStabilized;
    }

    if (coverageRatio >= 0.85) score += 6;
    else if (coverageRatio >= 0.6) score += 2;
    else score -= 16;

    if (modeledTripCount === 0) score -= 8;
    if (source === 'trip_impacts_plus_rolling_gap') score -= 6;
    if (source === 'rolling_gap_only') score -= 12;

    score = clamp(score, 0, 100);
    let label: string;
    if (score >= this.cfg.confidenceThresholds.high) label = 'High';
    else if (score >= this.cfg.confidenceThresholds.medium) label = 'Medium';
    else label = 'Low';
    return { score, label };
  }

  private computeAlerts(current: any): BrakeAlert[] {
    const alerts: BrakeAlert[] = [];
    const a = this.cfg.alerts;

    for (const [label, mm] of [
      ['Front pads', current.frontPadEstimatedMm],
      ['Rear pads', current.rearPadEstimatedMm],
    ] as const) {
      if (mm != null && mm <= this.cfg.pad.criticalMm) {
        alerts.push({
          type: 'PAD_CRITICAL',
          severity: 'critical',
          message: `${label}: critically low (${(mm as number).toFixed(1)} mm)`,
          value: mm as number,
        });
      } else if (mm != null && mm <= this.cfg.pad.warningMm) {
        alerts.push({
          type: 'PAD_WARNING',
          severity: 'warning',
          message: `${label}: approaching limit (${(mm as number).toFixed(1)} mm)`,
          value: mm as number,
        });
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
          alerts.push({
            type: 'DISC_CRITICAL',
            severity: 'critical',
            message: `${label}: critically worn`,
            value: estimatedMm as number,
          });
        } else if ((estimatedMm as number) <= warnMm) {
          alerts.push({
            type: 'DISC_WARNING',
            severity: 'warning',
            message: `${label}: approaching wear limit`,
            value: estimatedMm as number,
          });
        }
      }
    }

    const minRemaining = Math.min(
      current.padsRemainingKm ?? Number.POSITIVE_INFINITY,
      current.discsRemainingKm ?? Number.POSITIVE_INFINITY,
    );
    if (minRemaining <= a.criticalRemainingKm) {
      alerts.push({
        type: 'CRITICAL_REMAINING_KM',
        severity: 'critical',
        message: `Brake replacement imminent (${Math.round(minRemaining).toLocaleString()} km)`,
        value: minRemaining,
      });
    } else if (minRemaining <= a.lowRemainingKm) {
      alerts.push({
        type: 'LOW_REMAINING_KM',
        severity: 'warning',
        message: `Plan brake service soon (${Math.round(minRemaining).toLocaleString()} km)`,
        value: minRemaining,
      });
    }

    if (current.modelCoverageRatio != null && current.modelCoverageRatio < 0.6) {
      alerts.push({
        type: 'COVERAGE_GAP',
        severity: 'info',
        message: 'Trip-impact coverage is partial. Remaining wear is partly estimated from fallback context.',
      });
    }

    if (current.confidenceScore != null && current.confidenceScore < a.lowConfidenceThreshold) {
      alerts.push({
        type: 'LOW_CONFIDENCE',
        severity: 'info',
        message: 'Brake health estimate confidence is low — measured service data recommended.',
      });
    }
    return alerts;
  }

  private normalizePositive(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value <= 0) return null;
    return round2(value);
  }

  private deriveModeledComponents(current: any): BrakeModeledComponentsDto {
    const frontPads = current?.frontPadAnchorMm != null;
    const rearPads = current?.rearPadAnchorMm != null;
    const frontDiscs = current?.frontDiscAnchorMm != null;
    const rearDiscs = current?.rearDiscAnchorMm != null;
    return {
      frontPads,
      rearPads,
      frontDiscs,
      rearDiscs,
      hasAnyPads: frontPads || rearPads,
      hasAnyDiscs: frontDiscs || rearDiscs,
      hasAnyModeled: frontPads || rearPads || frontDiscs || rearDiscs,
    };
  }

  private deriveStateClass(current: any, modeled: BrakeModeledComponentsDto): BrakeStateClass {
    if (!modeled.hasAnyModeled) return 'NO_BASELINE';
    if (!current?.isInitialized) return 'NO_BASELINE';
    const status = String(current.anchorValidationStatus ?? '').toLowerCase();
    if (status.includes('measured')) return 'MEASURED';
    return 'ESTIMATED';
  }

  private hasMeasuredAnchorStatus(current: any): boolean {
    const status = String(current?.anchorValidationStatus ?? '').toLowerCase();
    return status.includes('measured');
  }

  private deriveLimitingComponent(current: any): BrakeLimitingComponent {
    const components: Array<{ key: BrakeLimitingComponent; value: number | null | undefined }> = [
      { key: 'FRONT_PADS', value: current.frontPadHealthPct },
      { key: 'REAR_PADS', value: current.rearPadHealthPct },
      { key: 'FRONT_DISCS', value: current.frontDiscHealthPct },
      { key: 'REAR_DISCS', value: current.rearDiscHealthPct },
    ];
    const valid = components.filter(
      (c): c is { key: Exclude<BrakeLimitingComponent, null>; value: number } =>
        typeof c.value === 'number',
    );
    if (valid.length === 0) return null;
    valid.sort((a, b) => a.value - b.value);
    return valid[0].key;
  }

  private readWarningArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }

  private computeCoverageWarnings(
    coverageRatioRaw: number | null | undefined,
    distanceSinceAnchor: number | null | undefined,
    modeledDistance: number | null | undefined,
    modeledTripCount: number,
    source: BrakeModelingSource,
  ): string[] {
    const warnings: string[] = [];
    const coverageRatio =
      typeof coverageRatioRaw === 'number' && Number.isFinite(coverageRatioRaw)
        ? coverageRatioRaw
        : null;
    const dist = typeof distanceSinceAnchor === 'number' ? distanceSinceAnchor : null;
    const modeled = typeof modeledDistance === 'number' ? modeledDistance : null;
    if (dist != null && dist > 0 && modeled != null && modeled + 1 < dist) {
      const uncovered = Math.max(0, dist - modeled);
      warnings.push(
        `Coverage gap: ${Math.round(uncovered).toLocaleString()} km since anchor are not backed by trip impact rows.`,
      );
    }
    if (coverageRatio != null && coverageRatio < 0.6) {
      warnings.push(
        `Low trip-impact coverage (${Math.round(coverageRatio * 100)}%). Estimate confidence is reduced.`,
      );
    }
    if (modeledTripCount === 0) {
      warnings.push('No trip impact rows available since anchor.');
    }
    if (source === 'trip_impacts_plus_rolling_gap') {
      warnings.push('Uncovered distance is modeled using rolling fallback factors.');
    }
    if (source === 'rolling_gap_only') {
      warnings.push(
        'Only rolling fallback factors were available after anchor; no per-trip impacts were found.',
      );
    }
    return warnings;
  }

  private async buildNoBaselineSummary(
    vehicleId: string,
    current: any,
    modeledComponents: BrakeModeledComponentsDto,
  ): Promise<BrakeHealthSummaryDto> {
    const baselineWarnings = this.readWarningArray(current?.baselineWarnings);
    const canonical = await this.buildCanonicalReadModel(vehicleId, current, modeledComponents);
    const legacyState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { brakePadPercent: true, lastSeenAt: true },
    });
    const legacyPad = legacyState?.brakePadPercent;
    const hasLegacyWarning = legacyPad != null && legacyPad < 40;
    const stateClass: BrakeStateClass = hasLegacyWarning ? 'WARNING_ONLY' : 'NO_BASELINE';
    const msg =
      stateClass === 'WARNING_ONLY'
        ? 'No modeled brake baseline yet. Legacy telemetry indicates potential brake attention.'
        : 'Brake wear tracking awaits a valid brake service baseline with odometer and thickness anchor.';

    return {
      isInitialized: false,
      stateClass,
      status: stateClass === 'WARNING_ONLY' ? 'warning_only' : 'awaiting_baseline',
      message: msg,
      actions: { canAddBrakeService: true, canUseAiUpload: true },
      modeledComponents,
      modelCoverage: {
        distanceSinceAnchorKm: null,
        modeledDistanceKm: null,
        modeledTripCount: 0,
        coverageRatio: null,
        hasGap: false,
        source: 'none',
      },
      limitingComponent: null,
      remainingKm: null,
      lastChangeAt: null,
      lastRecalculatedAt: current?.lastRecalculatedAt?.toISOString() ?? null,
      confidence: { score: Math.round(current?.confidenceScore ?? 0), label: current?.confidenceLabel ?? 'Low' },
      baselineWarnings:
        baselineWarnings.length > 0
          ? baselineWarnings
          : ['No valid baseline anchor is available for V2 brake wear modeling.'],
      provenanceWarnings:
        stateClass === 'WARNING_ONLY'
          ? ['Legacy telemetry warning only; this is not a modeled brake wear estimate.']
          : [],
      hasAlert: hasLegacyWarning || current?.hasAlert === true,
      legacyHeuristic: {
        available: legacyPad != null,
        note:
          legacyPad != null
            ? `Legacy brakePadPercent=${Math.round(legacyPad)}% (supplement only, not modeled truth).`
            : 'No legacy brake telemetry available.',
      },
      ...canonical,
    };
  }

  /**
   * Build the canonical evidence-based read model on top of the V2 wear state.
   * This is the single honest brake truth every consumer reads. The modeled
   * estimate caps at WARNING; a CRITICAL condition is only produced by a real
   * safety signal (measured/documented critical thickness, brake DTC, fluid
   * critical, confirmed immediate-replacement).
   */
  private async buildCanonicalReadModel(
    vehicleId: string,
    current: any,
    modeledComponents: BrakeModeledComponentsDto,
  ): Promise<BrakeCanonicalReadModel> {
    const c = this.cfg;
    const initialized = !!current?.isInitialized && modeledComponents.hasAnyModeled;

    const anchorDate: Date | null = current?.anchorServiceDate ?? null;
    const anchorMs = anchorDate ? new Date(anchorDate).getTime() : 0;
    const measurementAgeDays = anchorDate
      ? Math.max(0, Math.floor((Date.now() - anchorMs) / 86400000))
      : null;
    const kmSinceAnchor =
      typeof current?.distanceSinceAnchorKm === 'number' ? current.distanceSinceAnchorKm : null;
    const score = typeof current?.confidenceScore === 'number' ? current.confidenceScore : null;

    const lastService = await this.prisma.vehicleServiceEvent.findFirst({
      where: { vehicleId, eventType: 'BRAKE_SERVICE' },
      orderBy: { eventDate: 'desc' },
      select: { eventDate: true, odometerKm: true },
    });

    const evidence = await this.brakeEvidence.listRecent(vehicleId, 40);
    // Ignore evidence captured before the current baseline anchor (a later
    // service may have replaced the worn component).
    const freshEvidence = evidence.filter((e) => {
      const t = e.measuredAt
        ? new Date(e.measuredAt).getTime()
        : new Date(e.createdAt).getTime();
      return t >= anchorMs;
    });

    const latestMeasurementForAxle = (axle: 'FRONT' | 'REAR') =>
      freshEvidence.find(
        (e) =>
          (e.axle === axle || e.axle === 'UNKNOWN') &&
          (e.measuredPadMm != null || e.measuredDiscMm != null),
      ) ?? null;
    const latestMeasurement =
      freshEvidence.find((e) => e.measuredPadMm != null || e.measuredDiscMm != null) ?? null;

    // ── Safety signals (system-level) ──
    let fluidCondition: BrakeCondition = 'UNKNOWN';
    let discDocCondition: BrakeCondition = 'UNKNOWN';
    let dtcCondition: BrakeCondition = 'UNKNOWN';
    let immediateReplacement = false;
    let safetyBasis: BrakeDataBasis = 'UNKNOWN';
    for (const e of freshEvidence) {
      let contributes = false;
      if (e.brakeFluidStatus) {
        fluidCondition = aggregateBrakeCondition(fluidCondition, classifyFluidStatus(e.brakeFluidStatus));
        contributes = true;
      }
      if (e.discCondition) {
        discDocCondition = aggregateBrakeCondition(discDocCondition, classifyDiscConditionLabel(e.discCondition));
        contributes = true;
      }
      if (e.dtcSeverity) {
        dtcCondition = aggregateBrakeCondition(dtcCondition, classifyDtcSeverity(e.dtcSeverity));
        contributes = true;
      }
      if (e.immediateReplacement === true) {
        immediateReplacement = true;
        contributes = true;
      }
      if (contributes) safetyBasis = strongerDataBasis(safetyBasis, evidenceSourceToDataBasis(e.source));
    }
    const systemSafety = aggregateBrakeCondition(
      fluidCondition,
      dtcCondition,
      immediateReplacement ? 'CRITICAL' : 'UNKNOWN',
    );

    // ── Per-axle estimated condition from the wear model ──
    const axleMin = (a: number | null | undefined, b: number | null | undefined): number | null => {
      const vals = [a, b].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      return vals.length ? Math.min(...vals) : null;
    };
    const frontHealth = initialized ? axleMin(current.frontPadHealthPct, current.frontDiscHealthPct) : null;
    const rearHealth = initialized ? axleMin(current.rearPadHealthPct, current.rearDiscHealthPct) : null;
    const frontRemaining = initialized ? axleMin(current.frontPadRemainingKm, current.frontDiscRemainingKm) : null;
    const rearRemaining = initialized ? axleMin(current.rearPadRemainingKm, current.rearDiscRemainingKm) : null;

    let frontCond: BrakeCondition = initialized
      ? classifyEstimatedCondition(frontHealth, frontRemaining)
      : 'UNKNOWN';
    let rearCond: BrakeCondition = initialized
      ? classifyEstimatedCondition(rearHealth, rearRemaining)
      : 'UNKNOWN';

    let frontBasis: BrakeDataBasis = initialized ? 'ESTIMATED' : 'UNKNOWN';
    let rearBasis: BrakeDataBasis = initialized ? 'ESTIMATED' : 'UNKNOWN';

    const frontMeas = latestMeasurementForAxle('FRONT');
    if (frontMeas?.measuredPadMm != null) {
      frontCond = aggregateBrakeCondition(
        frontCond,
        classifyMeasuredThickness(frontMeas.measuredPadMm, c.pad.criticalMm, c.pad.warningMm),
      );
      frontBasis = strongerDataBasis(frontBasis, evidenceSourceToDataBasis(frontMeas.source));
    }
    const rearMeas = latestMeasurementForAxle('REAR');
    if (rearMeas?.measuredPadMm != null) {
      rearCond = aggregateBrakeCondition(
        rearCond,
        classifyMeasuredThickness(rearMeas.measuredPadMm, c.pad.criticalMm, c.pad.warningMm),
      );
      rearBasis = strongerDataBasis(rearBasis, evidenceSourceToDataBasis(rearMeas.source));
    }

    // System safety signals apply to both axles.
    if (systemSafety !== 'UNKNOWN' || discDocCondition !== 'UNKNOWN') {
      frontCond = aggregateBrakeCondition(frontCond, systemSafety, discDocCondition);
      rearCond = aggregateBrakeCondition(rearCond, systemSafety, discDocCondition);
      frontBasis = strongerDataBasis(frontBasis, safetyBasis);
      rearBasis = strongerDataBasis(rearBasis, safetyBasis);
    }

    const frontConfidence = classifyConfidenceLevel({
      score,
      dataBasis: frontBasis,
      measurementAgeDays,
      kmSinceMeasurement: kmSinceAnchor,
    });
    const rearConfidence = classifyConfidenceLevel({
      score,
      dataBasis: rearBasis,
      measurementAgeDays,
      kmSinceMeasurement: kmSinceAnchor,
    });
    const overallConfidence = worstConfidence(frontConfidence, rearConfidence);

    const frontRange = buildRemainingKmRange(frontRemaining, frontConfidence);
    const rearRange = buildRemainingKmRange(rearRemaining, rearConfidence);

    const overallCondition = aggregateBrakeCondition(frontCond, rearCond);
    const overallBasis = strongerDataBasis(frontBasis, rearBasis);

    const minRemaining = axleMin(frontRemaining, rearRemaining);
    let nextInspectionRecommendedInKm: number | null = null;
    let estimatedReplacementDueInKm: number | null = null;
    if (minRemaining != null) {
      estimatedReplacementDueInKm = Math.round(minRemaining);
      nextInspectionRecommendedInKm = Math.max(
        0,
        Math.min(
          c.inspection.maxIntervalKm,
          Math.round(minRemaining - c.inspection.recommendedHeadroomKm),
        ),
      );
    }

    const inspectionOverdue =
      (kmSinceAnchor != null && kmSinceAnchor >= c.inspection.serviceOverdueKm) ||
      (lastService?.eventDate != null &&
        (Date.now() - new Date(lastService.eventDate).getTime()) / 86400000 >=
          c.inspection.serviceOverdueDays) ||
      (lastService == null &&
        initialized &&
        measurementAgeDays != null &&
        measurementAgeDays >= c.inspection.serviceOverdueDays);

    // ── reasons / recommendations / open alerts ──
    const reasons: string[] = [];
    const recommendations: string[] = [];
    const openAlerts: BrakeCanonicalAlertDto[] = [];
    const pushAlert = (
      code: BrakeAlertCode,
      message: string,
      axle?: 'FRONT' | 'REAR' | 'UNKNOWN',
    ) => {
      openAlerts.push({ code, severity: alertCodeSeverity(code), message, axle });
    };

    if (!initialized) {
      reasons.push('Keine belastbare Bremsen-Baseline (Messung/Service) hinterlegt');
      recommendations.push(
        'Bremsservice mit gemessenen Belag-/Scheibenstärken erfassen oder Werkstattbericht hochladen',
      );
    } else {
      reasons.push(
        overallBasis === 'MEASURED' || overallBasis === 'DOCUMENTED'
          ? 'Basis: gemessene/dokumentierte Bremswerte'
          : 'Basis: Schätzung aus Fahrprofil, Laufleistung und Bremsbias',
      );
      if (minRemaining == null) {
        reasons.push('Restnutzung nicht berechenbar — zu wenig Telemetrie/Modellabdeckung');
      }
    }

    for (const [axleKey, cond] of [
      ['FRONT', frontCond],
      ['REAR', rearCond],
    ] as const) {
      if (cond === 'CRITICAL') {
        pushAlert(
          'BRAKE_PAD_CRITICAL',
          `${brakeAxleLabel(axleKey)}: kritischer Bremszustand — sofortige Prüfung/Austausch`,
          axleKey,
        );
      } else if (cond === 'WARNING') {
        pushAlert(
          'BRAKE_PAD_WARNING',
          `${brakeAxleLabel(axleKey)}: Bremszustand WARNUNG — Austausch zeitnah einplanen`,
          axleKey,
        );
      }
    }
    if (fluidCondition === 'WARNING' || fluidCondition === 'CRITICAL') {
      pushAlert('BRAKE_FLUID_WARNING', 'Bremsflüssigkeit auffällig — prüfen/wechseln');
    }
    if (dtcCondition === 'WARNING' || dtcCondition === 'CRITICAL') {
      pushAlert('BRAKE_SYSTEM_DTC', 'Bremssystem-Fehlercode aktiv — Diagnose empfohlen');
    }
    if (inspectionOverdue) {
      pushAlert('BRAKE_INSPECTION_OVERDUE', 'Bremsenprüfung überfällig');
    }
    if (initialized && (overallConfidence === 'LOW' || overallConfidence === 'UNKNOWN')) {
      pushAlert('BRAKE_HEALTH_LOW_CONFIDENCE', 'Geringe Datenbasis — gemessene Bremswerte empfohlen');
    }

    if (overallCondition === 'CRITICAL') {
      recommendations.push('Bremsen umgehend in der Werkstatt prüfen/erneuern lassen');
    } else if (overallCondition === 'WARNING') {
      recommendations.push('Bremsenservice zeitnah einplanen');
    } else if (overallCondition === 'WATCH') {
      recommendations.push('Bremsen beobachten und beim nächsten Service messen lassen');
    }
    if (inspectionOverdue) recommendations.push('Bremsenprüfung nachholen');
    if (initialized && (overallConfidence === 'LOW' || overallConfidence === 'UNKNOWN')) {
      recommendations.push('Gemessene Belag-/Scheibenstärken erfassen, um die Schätzung zu verbessern');
    }

    return {
      overallCondition,
      dataBasis: overallBasis,
      confidenceLevel: overallConfidence,
      frontAxleCondition: frontCond,
      rearAxleCondition: rearCond,
      frontDataBasis: frontBasis,
      rearDataBasis: rearBasis,
      frontConfidence,
      rearConfidence,
      estimatedFrontRemainingKmMin: frontRange?.min ?? null,
      estimatedFrontRemainingKmMax: frontRange?.max ?? null,
      estimatedRearRemainingKmMin: rearRange?.min ?? null,
      estimatedRearRemainingKmMax: rearRange?.max ?? null,
      nextInspectionRecommendedInKm,
      estimatedReplacementDueInKm,
      reasons,
      recommendations,
      openAlerts,
      lastMeasurementAt: latestMeasurement?.measuredAt
        ? new Date(latestMeasurement.measuredAt).toISOString()
        : null,
      lastMeasurementMileageKm: latestMeasurement?.mileageAtMeasurementKm ?? null,
      lastServiceAt: lastService?.eventDate ? new Date(lastService.eventDate).toISOString() : null,
      lastServiceMileageKm: lastService?.odometerKm ?? null,
      updatedAt: current?.updatedAt ? new Date(current.updatedAt).toISOString() : null,
    };
  }

  private toAxleEstimate(
    anchor: number | null,
    estimated: number | null,
    health: number | null,
    remaining: number | null,
    wearRate: number | null,
    kFactor: number,
  ): AxleEstimate {
    return {
      anchorMm: anchor,
      estimatedMm: estimated != null ? round2(estimated) : null,
      healthPct: health != null ? round2(health) : null,
      remainingKm: remaining != null ? Math.round(remaining) : null,
      wearRateMmPerKm: wearRate != null ? round2(wearRate * 1000) : null,
      kFactor: round2(kFactor),
    };
  }

  private async computeFactorsForDisplay(
    vehicleId: string,
    impact: VehicleImpactForBrake | null,
  ): Promise<Record<string, number>> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { fuelType: true, brakeForceFrontPercent: true },
    });
    const fuelType = vehicle?.fuelType ?? 'GASOLINE';
    return {
      padUsageFactor: this.computePadUsageFactor(impact),
      padStopDensityFactor: lookupSteppedFactor(
        impact?.stopDensity ?? 0,
        this.cfg.padStopDensityAnchors,
      ),
      padHardBrakeFactor: lookupSteppedFactor(
        impact?.hardBrakePer100Km ?? 0,
        this.cfg.padHardBrakeAnchors,
      ),
      padFullBrakingFactor: lookupSteppedFactor(
        impact?.fullBrakingPer100Km ?? 0,
        this.cfg.padFullBrakingAnchors,
      ),
      padRekuFactor: this.cfg.padRekuFactors[fuelType] ?? 1.0,
      discUsageFactor: this.computeDiscUsageFactor(impact),
      discHighSpeedFactor: lookupSteppedFactor(
        (impact?.highSpeedBrakeShare ?? 0) * 100,
        this.cfg.discHighSpeedBrakeAnchors,
      ),
      discHardBrakeFactor: lookupSteppedFactor(
        impact?.hardBrakePer100Km ?? 0,
        this.cfg.discHardBrakeAnchors,
      ),
      discFullBrakingFactor: lookupSteppedFactor(
        impact?.fullBrakingPer100Km ?? 0,
        this.cfg.discFullBrakingAnchors,
      ),
      discThermalFactor: interpolateThermalFactor(
        impact?.thermalBrakeStressScore ?? 0,
        this.cfg.discThermalAnchors,
      ),
      discRekuFactor: this.cfg.discRekuFactors[fuelType] ?? 1.0,
      brakeBiasFront:
        vehicle?.brakeForceFrontPercent != null
          ? vehicle.brakeForceFrontPercent / 100
          : this.cfg.brakeBias.defaultFront,
    };
  }
}
