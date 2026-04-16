import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { BatteryService } from './battery/battery.service';
import { TiresService } from './tires/tires.service';
import { TireHealthService } from './tires/tire-health.service';
import { TireLifecycleService } from './tires/tire-lifecycle.service';
import { BrakesService } from './brakes/brakes.service';
import { BrakeHealthService } from './brakes/brake-health.service';
import { BrakeLifecycleService } from './brakes/brake-lifecycle.service';
import { ServiceEventsService } from './service-events/service-events.service';
import { EnrichmentJobsService } from './enrichment-jobs/enrichment-jobs.service';
import { DtcService } from './dtc/dtc.service';
import { TripsService } from './trips/trips.service';
import { TripBehaviorEnrichmentService } from './trips/trip-behavior-enrichment.service';
import { TripEnrichmentOrchestratorService } from './trips/trip-enrichment-orchestrator.service';
import { TripReconciliationService } from './trips/reconciliation/trip-reconciliation.service';
import { TripAnalyticsCanonicalService } from './trips/trip-analytics-canonical.service';
import { DriverScoreService } from './trips/driver-score.service';
import { DamagesService } from './damages/damages.service';
import { BatteryHealthService } from './battery-health/battery-health.service';
import { HvBatteryHealthService } from './battery-health/hv-battery-health.service';
import { BatteryV2Service } from './battery-health/battery-v2.service';
import { CanonicalBatteryHealthService } from './battery-health/canonical-battery-health.service';
import { BatteryEvidenceService } from './battery-health/battery-evidence.service';
import { normalizeBatteryDocumentConfirm } from './battery-health/battery-document-confirmation.util';
import { HealthSummaryService } from './health-summary/health-summary.service';
import { AiHealthCareAggregationService } from './health-summary/ai-health-care-aggregation.service';
import { HmVehicleActivationService } from '../high-mobility/high-mobility-vehicle-activation.service';
import { HmSignalUsageService } from '../high-mobility/high-mobility-signal-usage.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { PaginationParams } from '@shared/utils/pagination';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  Prisma,
  TripAssignmentSubjectType,
  TireSetupStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Inject, forwardRef, Logger } from '@nestjs/common';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { AiTireSpecJobService } from '@modules/dimo/ai-tire-spec-job.service';
import { normalizeAiTireSpecResult, buildPersistedAiTireSpec, validateAiTireSpec } from './tires/ai-tire-spec-normalizer';

@Controller('vehicles/:vehicleId')
@UseGuards(RolesGuard, VehicleOwnershipGuard)
export class VehicleIntelligenceController {
  private readonly logger = new Logger(VehicleIntelligenceController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly batteryService: BatteryService,
    private readonly tiresService: TiresService,
    private readonly tireHealthService: TireHealthService,
    private readonly tireLifecycleService: TireLifecycleService,
    private readonly brakesService: BrakesService,
    private readonly brakeHealthService: BrakeHealthService,
    private readonly brakeLifecycleService: BrakeLifecycleService,
    private readonly serviceEventsService: ServiceEventsService,
    private readonly enrichmentJobsService: EnrichmentJobsService,
    private readonly dtcService: DtcService,
    private readonly tripsService: TripsService,
    private readonly tripAnalyticsCanonicalService: TripAnalyticsCanonicalService,
    private readonly driverScoreService: DriverScoreService,
    private readonly behaviorEnrichmentService: TripBehaviorEnrichmentService,
    private readonly enrichmentOrchestrator: TripEnrichmentOrchestratorService,
    private readonly tripReconciliation: TripReconciliationService,
    private readonly damagesService: DamagesService,
    private readonly batteryHealthService: BatteryHealthService,
    private readonly hvBatteryHealthService: HvBatteryHealthService,
    private readonly batteryV2Service: BatteryV2Service,
    private readonly canonicalBatteryHealthService: CanonicalBatteryHealthService,
    private readonly batteryEvidenceService: BatteryEvidenceService,
    private readonly healthSummaryService: HealthSummaryService,
    private readonly aiHealthCareAggregationService: AiHealthCareAggregationService,
    private readonly hmVehicleActivationService: HmVehicleActivationService,
    private readonly hmSignalUsageService: HmSignalUsageService,
    @Inject(forwardRef(() => InvoicesService))
    private readonly invoicesService: InvoicesService,
    @Inject(forwardRef(() => AiTireSpecJobService))
    private readonly aiTireSpecJobService: AiTireSpecJobService,
  ) {}

  // --- Composite Intelligence Endpoint ---
  @Get('intelligence')
  async getAllIntelligence(@Param('vehicleId') vehicleId: string) {
    const [battery, tires, brakes, serviceEvents, enrichmentJobs] =
      await Promise.all([
        this.batteryService.findByVehicle(vehicleId),
        this.tiresService.findSetupsByVehicle(vehicleId),
        this.brakesService.findByVehicle(vehicleId),
        this.serviceEventsService.findByVehicle(vehicleId, {
          page: 1,
          limit: 20,
        }),
        this.enrichmentJobsService.findByVehicle(vehicleId, {
          page: 1,
          limit: 20,
        }),
      ]);

    return {
      battery,
      tires,
      brakes,
      serviceEvents: serviceEvents.data,
      enrichmentJobs: enrichmentJobs.data,
    };
  }

  // --- Battery ---
  @Get('battery')
  async getBatterySpecs(@Param('vehicleId') vehicleId: string) {
    return this.batteryService.findByVehicle(vehicleId);
  }

  @Post('battery')
  async createBatterySpec(
    @Param('vehicleId') vehicleId: string,
    @Body() body: Omit<Prisma.VehicleBatterySpecCreateInput, 'vehicle'>,
  ) {
    return this.batteryService.create(vehicleId, body);
  }

  @Patch('battery/:id')
  async updateBatterySpec(
    @Param('id') id: string,
    @Body() body: Prisma.VehicleBatterySpecUpdateInput,
  ) {
    return this.batteryService.update(id, body);
  }

  // --- Tires ---
  @Get('tires')
  async getTireSetups(@Param('vehicleId') vehicleId: string) {
    return this.tiresService.findSetupsByVehicle(vehicleId);
  }

  @Get('tires/wear-analysis')
  async getTireWearAnalysis(@Param('vehicleId') vehicleId: string) {
    return this.tiresService.getWearAnalysis(vehicleId);
  }

  @Post('tires')
  async createTireSetup(
    @Param('vehicleId') vehicleId: string,
    @Body() body: Omit<Prisma.VehicleTireSetupCreateInput, 'vehicle'>,
  ) {
    return this.tireLifecycleService.installTireSet(vehicleId, {
      name: (body as any).name,
      brandModelFront: (body as any).brandModelFront,
      brandModelRear: (body as any).brandModelRear,
      frontDimension: (body as any).frontDimension,
      rearDimension: (body as any).rearDimension,
      tireSeason: (body as any).tireSeason,
      initialTreadDepthMm: (body as any).initialTreadDepthMm,
      initialTreadFrontMm: (body as any).initialTreadFrontMm,
      initialTreadRearMm: (body as any).initialTreadRearMm,
      tireCondition: (body as any).tireCondition,
      odometerKm: (body as any).installedOdometerKm,
      notes: (body as any).notes,
      archiveCurrent: false,
    });
  }

  @Post('tires/:tireSetupId/measurements')
  async addTireMeasurement(
    @Param('vehicleId') vehicleId: string,
    @Param('tireSetupId') tireSetupId: string,
    @Body()
    body: Omit<
      Prisma.VehicleTireTreadMeasurementCreateInput,
      'tireSetup' | 'vehicleId'
    >,
  ) {
    return this.tireLifecycleService.recordMeasurement({
      vehicleId,
      tireSetupId,
      frontLeftMm: (body as any).frontLeftMm,
      frontRightMm: (body as any).frontRightMm,
      rearLeftMm: (body as any).rearLeftMm,
      rearRightMm: (body as any).rearRightMm,
      odometerKm: (body as any).odometerAtMeasurement,
      measuredAt: (body as any).measuredAt,
      source: (body as any).source,
      workshopName: (body as any).workshopName,
      shouldCalibrate: true,
      triggerRecalculate: true,
    });
  }

  @Post('tires/:tireSetupId/calibration-measurement')
  async addCalibrationMeasurement(
    @Param('vehicleId') vehicleId: string,
    @Param('tireSetupId') tireSetupId: string,
    @Body() body: {
      frontLeftMm?: number;
      frontRightMm?: number;
      rearLeftMm?: number;
      rearRightMm?: number;
      odometerAtMeasurement?: number;
      source: string;
      workshopName?: string;
      measuredAt?: string;
    },
  ) {
    return this.tireLifecycleService.recordMeasurement({
      vehicleId,
      tireSetupId,
      frontLeftMm: body.frontLeftMm,
      frontRightMm: body.frontRightMm,
      rearLeftMm: body.rearLeftMm,
      rearRightMm: body.rearRightMm,
      odometerKm: body.odometerAtMeasurement,
      measuredAt: body.measuredAt,
      source: body.source ?? 'calibration',
      workshopName: body.workshopName,
      quality: 'mixed',
      shouldCalibrate: true,
      triggerRecalculate: true,
    });
  }

  @Post('tires/ai-spec/apply')
  async applyAiTireSpec(
    @Param('vehicleId') vehicleId: string,
    @Body() body: { jobId?: string; aiTireSpec?: Record<string, unknown> },
  ) {
    // Job-based flow (preferred): apply from a completed AiTireSpecJob
    if (body.jobId) {
      const result = await this.aiTireSpecJobService.applyResult(body.jobId, vehicleId);
      if (result.success) {
        try {
          await this.tireHealthService.recalculate(vehicleId);
          this.logger.log(`[AiTireSpec] Recalculated tire health for vehicle ${vehicleId}`);
        } catch (err: any) {
          this.logger.warn(`[AiTireSpec] Recalculation failed (non-blocking): ${err?.message}`);
        }
      }
      return result;
    }

    // Direct flow (legacy): normalize + persist raw aiTireSpec blob
    if (body.aiTireSpec) {
      const setup = await this.prisma.vehicleTireSetup.findFirst({
        where: { vehicleId, removedAt: null, status: TireSetupStatus.ACTIVE },
        orderBy: { createdAt: 'desc' },
      });
      if (!setup) return { success: false, message: 'No active tire setup found' };

      const normalized = normalizeAiTireSpecResult(body.aiTireSpec);
      const validation = validateAiTireSpec(normalized);
      if (!validation.hasStructuredData) {
        return { success: false, message: 'No structured tire spec data after normalization' };
      }

      const persisted = buildPersistedAiTireSpec(normalized, {
        jobId: null,
        confidenceScore: normalized.confidenceScore ?? null,
        completedAt: null,
        specSourceType: 'ai_agent',
      });

      await this.prisma.vehicleTireSetup.update({
        where: { id: setup.id },
        data: { aiTireSpec: persisted as any },
      });

      try {
        await this.tireHealthService.recalculate(vehicleId);
      } catch { /* recalculation best-effort */ }

      const appliedFields = Object.entries(normalized).filter(([, v]) => v != null).map(([k]) => k);
      return { success: true, setupId: setup.id, appliedFields };
    }

    return { success: false, message: 'Provide either jobId or aiTireSpec' };
  }

  // --- Tire Health (enhanced) ---
  @Get('tires/summary')
  async getTireHealthSummary(@Param('vehicleId') vehicleId: string) {
    const hmTirePressure = await this.hmSignalUsageService
      .getTirePressureSignals(vehicleId)
      .catch(() => null);
    return this.tireHealthService.getSummary(vehicleId, { hmTirePressure });
  }

  @Get('tires/detail')
  async getTireHealthDetail(@Param('vehicleId') vehicleId: string) {
    const hmTirePressure = await this.hmSignalUsageService
      .getTirePressureSignals(vehicleId)
      .catch(() => null);
    return this.tireHealthService.getDetail(vehicleId, { hmTirePressure });
  }

  @Get('tires/rotation-history')
  async getTireRotationHistory(@Param('vehicleId') vehicleId: string) {
    return this.tireHealthService.getRotationHistory(vehicleId);
  }

  @Post('tires/rotate')
  async rotateTires(
    @Param('vehicleId') vehicleId: string,
    @Body() body: {
      template: string;
      odometerKm?: number;
      notes?: string;
    },
  ) {
    return this.tireLifecycleService.rotateTires(vehicleId, body);
  }

  @Post('tires/change')
  async changeTires(
    @Param('vehicleId') vehicleId: string,
    @Body() body: {
      scope: 'single' | 'axle' | 'full_set';
      positions?: string[];
      newSetup?: {
        brandModelFront?: string;
        brandModelRear?: string;
        frontDimension?: string;
        rearDimension?: string;
        tireSeason?: string;
        initialTreadDepthMm?: number;
        initialTreadFrontMm?: number;
        initialTreadRearMm?: number;
        name?: string;
      };
      odometerKm?: number;
      notes?: string;
      workshopName?: string;
    },
  ) {
    return this.tireLifecycleService.replaceTires({ vehicleId, ...body });
  }

  @Post('tires/activate-stored-set')
  async activateStoredTireSet(
    @Param('vehicleId') vehicleId: string,
    @Body() body: {
      storedSetupId?: string;
      odometerKm?: number;
      notes?: string;
    },
  ) {
    return this.tireLifecycleService.activateStoredSet({ vehicleId, ...body });
  }

  @Post('tires/measurement')
  async addTireHealthMeasurement(
    @Param('vehicleId') vehicleId: string,
    @Body() body: {
      frontLeftMm?: number;
      frontRightMm?: number;
      rearLeftMm?: number;
      rearRightMm?: number;
      odometerKm?: number;
      workshopName?: string;
      source?: string;
    },
  ) {
    return this.tireLifecycleService.recordMeasurement({
      vehicleId,
      frontLeftMm: body.frontLeftMm,
      frontRightMm: body.frontRightMm,
      rearLeftMm: body.rearLeftMm,
      rearRightMm: body.rearRightMm,
      odometerKm: body.odometerKm,
      workshopName: body.workshopName,
      source: body.source,
      shouldCalibrate: true,
      triggerRecalculate: true,
    });
  }

  @Post('tires/recalculate')
  async recalculateTireHealth(@Param('vehicleId') vehicleId: string) {
    return this.tireHealthService.recalculate(vehicleId);
  }

  // --- Brakes ---
  @Get('brakes')
  async getBrakeSpecs(@Param('vehicleId') vehicleId: string) {
    return this.brakesService.findByVehicle(vehicleId);
  }

  @Post('brakes')
  async createBrakeSpec(
    @Param('vehicleId') vehicleId: string,
    @Body() body: Omit<Prisma.VehicleBrakeReferenceSpecCreateInput, 'vehicle'>,
  ) {
    return this.brakesService.create(vehicleId, body);
  }

  @Patch('brakes/:id')
  async updateBrakeSpec(
    @Param('id') id: string,
    @Body() body: Prisma.VehicleBrakeReferenceSpecUpdateInput,
  ) {
    return this.brakesService.update(id, body);
  }

  // --- Brake Status (legacy heuristic; deprecated) ---
  @Get('brake-status')
  async getBrakeStatus(@Param('vehicleId') vehicleId: string) {
    const specs = await this.brakesService.findByVehicle(vehicleId);
    const spec = specs[0] ?? null;

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { brakeForceFrontPercent: true, mileageKm: true, fuelType: true },
    });
    const isEv = vehicle?.fuelType === 'ELECTRIC' || vehicle?.fuelType === 'PLUGIN_HYBRID';

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { brakePadPercent: true, odometerKm: true, lastSeenAt: true },
    });

    const brakeEvents = await this.prisma.vehicleServiceEvent.findMany({
      where: { vehicleId, eventType: 'BRAKE_SERVICE' },
      orderBy: { eventDate: 'desc' },
      take: 20,
    });

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
    const recentTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        startTime: { gte: ninetyDaysAgo },
        // Only count trips where behavior enrichment is complete to avoid
        // false-zero harsh brake counts from not-yet-analyzed trips.
        behaviorEnrichmentStatus: 'COMPLETED',
      },
      select: {
        hardBrakingCount: true,
        harshBrakeCount: true,
        behaviorEnrichedAt: true,
        distanceKm: true,
      },
      take: 200,
    });

    const totalRecentKm = recentTrips.reduce((s, t) => s + (t.distanceKm ?? 0), 0);
    // Use canonical HF counter when available, otherwise fall back to legacy field.
    const totalHarshBrakes = recentTrips.reduce((s, t) => {
      if (t.behaviorEnrichedAt != null) return s + (t.hardBrakingCount ?? 0);
      return s + (t.harshBrakeCount ?? 0);
    }, 0);
    const harshBrakesPer100km = totalRecentKm > 10 ? Math.round(totalHarshBrakes / totalRecentKm * 100 * 10) / 10 : null;

    const padPercent = latestState?.brakePadPercent ?? null;
    const lastService = brakeEvents[0] ?? null;
    const lastServiceDate = lastService?.eventDate?.toISOString() ?? null;
    const lastServiceOdometer = lastService?.odometerKm ?? null;
    const currentOdometer = latestState?.odometerKm ?? vehicle?.mileageKm ?? null;
    const kmSinceService = (lastServiceOdometer != null && currentOdometer != null && currentOdometer > lastServiceOdometer)
      ? Math.round(currentOdometer - lastServiceOdometer)
      : null;

    let daysSinceService: number | null = null;
    if (lastService?.eventDate) {
      daysSinceService = Math.round((Date.now() - lastService.eventDate.getTime()) / 86400000);
    }

    // EV regenerative braking reduces mechanical pad wear ~60-70%, so thresholds are relaxed
    const padAttentionThreshold = isEv ? 10 : 20;
    const padWatchThreshold = isEv ? 25 : 40;
    const kmAttentionThreshold = isEv ? 120000 : 60000;
    const kmWatchThreshold = isEv ? 80000 : 40000;

    let condition: 'good' | 'watch' | 'attention' = 'good';
    if (padPercent != null) {
      if (padPercent < padAttentionThreshold) condition = 'attention';
      else if (padPercent < padWatchThreshold) condition = 'watch';
    } else if (kmSinceService != null) {
      if (kmSinceService > kmAttentionThreshold) condition = 'attention';
      else if (kmSinceService > kmWatchThreshold) condition = 'watch';
    } else if (daysSinceService != null) {
      if (daysSinceService > 730) condition = 'attention';
      else if (daysSinceService > 365) condition = 'watch';
    } else if (!lastService && !spec) {
      condition = 'watch';
    }

    if (harshBrakesPer100km != null && harshBrakesPer100km > 8 && condition === 'good') {
      condition = 'watch';
    }

    let brakingBehavior: string = 'unknown';
    if (harshBrakesPer100km != null) {
      if (harshBrakesPer100km <= 2) brakingBehavior = 'smooth';
      else if (harshBrakesPer100km <= 5) brakingBehavior = 'moderate';
      else if (harshBrakesPer100km <= 8) brakingBehavior = 'elevated';
      else brakingBehavior = 'aggressive';
    }

    const watchpoints: string[] = [];
    const recommendations: string[] = [];

    if (padPercent != null && padPercent < 20) {
      watchpoints.push(`Brake pad wear at ${Math.round(padPercent)}% — replacement recommended soon.`);
    } else if (padPercent != null && padPercent < 40) {
      watchpoints.push(`Brake pad wear at ${Math.round(padPercent)}% — monitor at next service.`);
    }

    if (kmSinceService != null && kmSinceService > 50000) {
      watchpoints.push(`${kmSinceService.toLocaleString()} km since last brake service — inspection recommended.`);
    }

    if (daysSinceService != null && daysSinceService > 365) {
      watchpoints.push(`Last brake service was over ${Math.round(daysSinceService / 30)} months ago.`);
    }

    if (brakingBehavior === 'aggressive') {
      watchpoints.push('Aggressive braking pattern detected — accelerated brake wear expected.');
    } else if (brakingBehavior === 'elevated') {
      watchpoints.push('Elevated harsh braking frequency — monitor brake condition.');
    }

    if (!lastService && !spec) {
      watchpoints.push('No brake data recorded — upload a brake service document or log a brake change.');
    }

    if (condition === 'good' && padPercent != null && padPercent >= 40) {
      recommendations.push('Brake system appears healthy — continue routine monitoring.');
    }
    if (condition === 'attention') {
      recommendations.push('Schedule a brake inspection at the next available service window.');
    }
    if (condition === 'watch') {
      recommendations.push('Plan a brake check within the next service cycle.');
    }
    if (brakingBehavior === 'aggressive' || brakingBehavior === 'elevated') {
      recommendations.push('Consider coaching drivers on smoother braking to reduce wear.');
    }
    if (isEv && condition === 'good') {
      recommendations.push('EV regenerative braking significantly reduces mechanical pad wear — extended service intervals expected.');
    }
    if (isEv && padPercent != null && padPercent > 60) {
      recommendations.push('EV brake pads showing expected low wear due to regenerative braking.');
    }
    if (!spec) {
      recommendations.push('Register brake specs to enable detailed wear tracking.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Maintain regular brake inspection intervals.');
    }

    let dataConfidence: 'low' | 'medium' | 'high' = 'low';
    if (padPercent != null && lastService) dataConfidence = 'high';
    else if (padPercent != null || lastService) dataConfidence = 'medium';

    return {
      _deprecated: true,
      _canonical: 'Use /brake-health/summary and /brake-health/detail for runtime truth.',
      hasSpecs: spec != null,
      isEv,
      regenBrakingNote: isEv ? 'Regenerative braking active — mechanical brake wear is significantly reduced.' : null,
      condition,
      padWearPercent: padPercent != null ? Math.round(padPercent) : null,
      brakeForceFrontPercent: vehicle?.brakeForceFrontPercent ?? null,
      kmSinceService,
      daysSinceService,
      lastServiceDate,
      lastServiceWorkshop: lastService?.workshopName ?? null,
      lastTelemetryAt: latestState?.lastSeenAt?.toISOString() ?? null,
      drivingImpact: {
        totalHarshBrakes90d: totalHarshBrakes,
        harshBrakesPer100km,
        totalKm90d: Math.round(totalRecentKm),
        brakingBehavior,
      },
      specs: spec ? {
        id: spec.id,
        frontRotorDiameter: spec.frontRotorDiameter,
        frontRotorWidth: spec.frontRotorWidth,
        frontPadThickness: spec.frontPadThickness,
        rearRotorDiameter: spec.rearRotorDiameter,
        rearRotorWidth: spec.rearRotorWidth,
        rearPadThickness: spec.rearPadThickness,
        sourceType: spec.sourceType,
      } : null,
      history: brakeEvents.map(e => ({
        id: e.id, date: e.eventDate.toISOString(),
        odometerKm: e.odometerKm, workshopName: e.workshopName,
        notes: e.notes, costCents: e.costCents,
      })),
      watchpoints,
      recommendations,
      dataConfidence,
    };
  }

  // --- Brake Health V2 ---
  @Get('brake-health/summary')
  async getBrakeHealthSummary(@Param('vehicleId') vehicleId: string) {
    return this.brakeHealthService.getSummary(vehicleId);
  }

  @Get('brake-health/detail')
  async getBrakeHealthDetail(@Param('vehicleId') vehicleId: string) {
    return this.brakeHealthService.getDetail(vehicleId);
  }

  @Post('brake-health/initialize')
  async initializeBrakeHealth(
    @Param('vehicleId') vehicleId: string,
    @Body() body: {
      serviceDate: string;
      odometerKm?: number;
      frontPadMm?: number;
      rearPadMm?: number;
      frontRotorWidthMm?: number;
      rearRotorWidthMm?: number;
      kind?: 'inspection_only' | 'pads_service' | 'discs_service' | 'brake_fluid_service' | 'full_brake_service';
      scope?: Array<'front_pads' | 'rear_pads' | 'front_discs' | 'rear_discs'>;
      workshopName?: string;
      notes?: string;
      source?: 'manual' | 'ai_document' | 'api';
    },
  ) {
    return this.brakeLifecycleService.recordService({
      vehicleId,
      serviceDate: body.serviceDate,
      odometerKm: body.odometerKm,
      workshopName: body.workshopName,
      notes: body.notes,
      source: body.source ?? 'manual',
      kind: body.kind,
      scope: body.scope,
      measured: {
        frontPadMm: body.frontPadMm,
        rearPadMm: body.rearPadMm,
        frontDiscMm: body.frontRotorWidthMm,
        rearDiscMm: body.rearRotorWidthMm,
      },
      initializeIfPossible: true,
    });
  }

  @Post('brake-health/service')
  async recordBrakeLifecycleService(
    @Param('vehicleId') vehicleId: string,
    @Body() body: {
      serviceDate: string;
      odometerKm?: number;
      workshopName?: string;
      notes?: string;
      source?: 'manual' | 'ai_document' | 'api';
      kind?: 'inspection_only' | 'pads_service' | 'discs_service' | 'brake_fluid_service' | 'full_brake_service';
      scope?: Array<'front_pads' | 'rear_pads' | 'front_discs' | 'rear_discs'>;
      measured?: {
        frontPadMm?: number;
        rearPadMm?: number;
        frontDiscMm?: number;
        rearDiscMm?: number;
      };
      initializeIfPossible?: boolean;
      documentUrl?: string;
    },
  ) {
    return this.brakeLifecycleService.recordService({
      vehicleId,
      serviceDate: body.serviceDate,
      odometerKm: body.odometerKm,
      workshopName: body.workshopName,
      notes: body.notes,
      source: body.source ?? 'manual',
      kind: body.kind,
      scope: body.scope,
      measured: body.measured,
      initializeIfPossible: body.initializeIfPossible,
      documentUrl: body.documentUrl,
    });
  }

  @Post('brake-health/recalculate')
  async recalculateBrakeHealth(@Param('vehicleId') vehicleId: string) {
    return this.brakeHealthService.recalculate(vehicleId);
  }

  // --- Trip Profile ---
  @Get('trip-profile')
  async getTripProfile(@Param('vehicleId') vehicleId: string) {
    const trips = await this.prisma.vehicleTrip.findMany({
      where: { vehicleId },
      select: {
        distanceKm: true,
        citySharePercent: true,
        highwaySharePercent: true,
        countrySharePercent: true,
        outsideTemperatureStartC: true,
      },
    });
    if (trips.length === 0) {
      return { totalTrips: 0, totalDistanceKm: 0, avgCity: null, avgHighway: null, avgCountry: null, avgTemp: null };
    }

    const withShares = trips.filter((t: any) => t.citySharePercent != null);
    const withTemp = trips.filter((t: any) => t.outsideTemperatureStartC != null);
    const totalDist = trips.reduce((s: number, t: any) => s + (t.distanceKm ?? 0), 0);

    const shareDist = withShares.reduce((s: number, t: any) => s + (t.distanceKm ?? 1), 0) || 1;
    const weightedCity = withShares.reduce((s: number, t: any) => s + (t.citySharePercent ?? 0) * (t.distanceKm ?? 1), 0);
    const weightedHwy = withShares.reduce((s: number, t: any) => s + (t.highwaySharePercent ?? 0) * (t.distanceKm ?? 1), 0);
    const weightedCountry = withShares.reduce((s: number, t: any) => s + (t.countrySharePercent ?? 0) * (t.distanceKm ?? 1), 0);

    return {
      totalTrips: trips.length,
      totalDistanceKm: Math.round(totalDist),
      avgCity: withShares.length > 0 ? Math.round(weightedCity / shareDist) : null,
      avgHighway: withShares.length > 0 ? Math.round(weightedHwy / shareDist) : null,
      avgCountry: withShares.length > 0 ? Math.round(weightedCountry / shareDist) : null,
      avgTemp: withTemp.length > 0 ? Math.round(withTemp.reduce((s: number, t: any) => s + (t.outsideTemperatureStartC ?? 0), 0) / withTemp.length * 10) / 10 : null,
    };
  }

  // --- Service Events ---
  @Get('service-events')
  async getServiceEvents(
    @Param('vehicleId') vehicleId: string,
    @Query() query: PaginationParams,
  ) {
    return this.serviceEventsService.findByVehicle(vehicleId, query);
  }

  @Post('service-events')
  async createServiceEvent(
    @Param('vehicleId') vehicleId: string,
    @Body() body: Omit<Prisma.VehicleServiceEventCreateInput, 'vehicle'>,
  ) {
    return this.serviceEventsService.create(vehicleId, body);
  }

  @Patch('service-events/:id')
  async updateServiceEvent(
    @Param('id') id: string,
    @Body() body: Prisma.VehicleServiceEventUpdateInput,
  ) {
    return this.serviceEventsService.update(id, body);
  }

  // --- Enrichment Jobs ---
  @Get('enrichment-jobs')
  async getEnrichmentJobs(
    @Param('vehicleId') vehicleId: string,
    @Query() query: PaginationParams,
  ) {
    return this.enrichmentJobsService.findByVehicle(vehicleId, query);
  }

  @Post('enrichment-jobs')
  async createEnrichmentJob(
    @Param('vehicleId') vehicleId: string,
    @Body() body: Omit<Prisma.VehicleEnrichmentJobCreateInput, 'vehicle'>,
  ) {
    return this.enrichmentJobsService.create(vehicleId, body);
  }

  // --- DTC (Error Codes) ---

  /** UI-ready freshness-aware summary for the Quick View box. */
  @Get('dtc/summary')
  async getDtcSummary(@Param('vehicleId') vehicleId: string) {
    return this.dtcService.getSummary(vehicleId);
  }

  /** Full detail payload for the DTC Detail Modal (3 sections). */
  @Get('dtc/detail')
  async getDtcDetail(@Param('vehicleId') vehicleId: string) {
    return this.dtcService.getDetail(vehicleId);
  }

  @Get('dtc')
  async getDtcEvents(@Param('vehicleId') vehicleId: string) {
    return this.dtcService.findByVehicle(vehicleId);
  }

  @Get('dtc/active')
  async getActiveDtc(@Param('vehicleId') vehicleId: string) {
    return this.dtcService.findActive(vehicleId);
  }

  @Get('dtc/stats')
  async getDtcStats(@Param('vehicleId') vehicleId: string) {
    return this.dtcService.getStats(vehicleId);
  }

  // --- Trips ---
  @Get('trips')
  async getTrips(
    @Param('vehicleId') vehicleId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('driver') driver?: string,
  ) {
    const trips = await this.tripsService.findByVehicle(vehicleId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      driverName: driver,
    });
    const hydratedTrips = await this.tripAnalyticsCanonicalService.hydrateTrips(trips as any);

    // ── Compute simple UI-facing readiness flags ─────────────────────────
    // Frontend only needs behaviorReady/detailsLimited — it should NOT need
    // to interpret behaviorEnrichmentStatus internally.
    return hydratedTrips.map((trip) => {
      const { behaviorEnrichmentStatus, behaviorEnrichmentError, behaviorEnrichmentAttempts, ...rest } = trip as any;
      return {
        ...rest,
        drivingScore:
          trip.canonicalTripSummary?.scores?.drivingStyleScore ??
          trip.drivingScore ??
          null,
        drivingStyleScore:
          trip.canonicalTripSummary?.scores?.drivingStyleScore ??
          null,
        safetyScore: trip.canonicalTripSummary?.scores?.safetyScore ?? null,
        scoreSource: trip.canonicalTripSummary?.scores?.scoreSource ?? 'derived',
        totalAccelerationEvents: trip.canonicalTripSummary?.events?.totalAccelerationEvents ?? 0,
        hardAccelerationEvents: trip.canonicalTripSummary?.events?.hardAccelerationEvents ?? 0,
        totalBrakingEvents: trip.canonicalTripSummary?.events?.totalBrakingEvents ?? 0,
        hardBrakingEvents: trip.canonicalTripSummary?.events?.hardBrakingEvents ?? 0,
        fullBrakingEvents: trip.canonicalTripSummary?.events?.fullBrakingEvents ?? 0,
        corneringEvents: trip.canonicalTripSummary?.events?.corneringEvents ?? 0,
        abuseEvents: trip.canonicalTripSummary?.events?.abuseEvents ?? 0,
        speedingEvents: trip.canonicalTripSummary?.events?.speedingEvents ?? 0,
        assignmentStatus: trip.canonicalTripSummary?.assignment?.assignmentStatus ?? null,
        assignmentSubjectType: trip.canonicalTripSummary?.assignment?.assignmentSubjectType ?? null,
        assignmentSubjectId: trip.canonicalTripSummary?.assignment?.assignmentSubjectId ?? null,
        assignedBookingId: trip.canonicalTripSummary?.assignment?.assignedBookingId ?? null,
        isPrivateTrip: trip.canonicalTripSummary?.assignment?.isPrivateTrip ?? false,
        scoreEligible: trip.canonicalTripSummary?.assignment?.scoreEligible ?? false,
        behaviorReady: behaviorEnrichmentStatus === 'COMPLETED',
        detailsLimited:
          !trip.endTime ||
          (trip as any).qualityStatus === 'LOW_DATA' ||
          (trip as any).qualityStatus === 'ANOMALY',
      };
    });
  }

  @Get('trips/stats')
  async getTripStats(@Param('vehicleId') vehicleId: string) {
    return this.tripAnalyticsCanonicalService.getVehicleStats(vehicleId);
  }

  @Get('trips/driver-score')
  async getDriverScore(
    @Param('vehicleId') vehicleId: string,
    @Query('subjectType') subjectType?: string,
    @Query('subjectId') subjectId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!subjectType || !subjectId) {
      throw new BadRequestException('subjectType and subjectId are required');
    }

    const normalizedType = String(subjectType).toUpperCase();
    if (!Object.values(TripAssignmentSubjectType).includes(normalizedType as TripAssignmentSubjectType)) {
      throw new BadRequestException('Invalid subjectType');
    }

    return this.driverScoreService.getScoreSummary(
      normalizedType as TripAssignmentSubjectType,
      subjectId,
      {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        vehicleId,
      },
    );
  }

  @Get('trips/:tripId')
  async getTripById(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
  ) {
    const trip = await this.tripsService.findById(tripId);
    // Verify the trip belongs to the requested vehicle (prevents cross-vehicle IDOR)
    if (!trip || trip.vehicleId !== vehicleId) return null;
    const hydratedTrip = await this.tripAnalyticsCanonicalService.hydrateTrip(trip as any);

    // ── Same readiness semantics as GET /trips list ──────────────────────
    // Strip internal enrichment status fields; surface simple flags only.
    const { behaviorEnrichmentStatus, behaviorEnrichmentError, behaviorEnrichmentAttempts, ...rest } = hydratedTrip as any;
    return {
      ...rest,
      drivingScore:
        hydratedTrip.canonicalTripSummary?.scores?.drivingStyleScore ??
        hydratedTrip.drivingScore ??
        null,
      drivingStyleScore: hydratedTrip.canonicalTripSummary?.scores?.drivingStyleScore ?? null,
      safetyScore: hydratedTrip.canonicalTripSummary?.scores?.safetyScore ?? null,
      scoreSource: hydratedTrip.canonicalTripSummary?.scores?.scoreSource ?? 'derived',
      totalAccelerationEvents: hydratedTrip.canonicalTripSummary?.events?.totalAccelerationEvents ?? 0,
      hardAccelerationEvents: hydratedTrip.canonicalTripSummary?.events?.hardAccelerationEvents ?? 0,
      totalBrakingEvents: hydratedTrip.canonicalTripSummary?.events?.totalBrakingEvents ?? 0,
      hardBrakingEvents: hydratedTrip.canonicalTripSummary?.events?.hardBrakingEvents ?? 0,
      fullBrakingEvents: hydratedTrip.canonicalTripSummary?.events?.fullBrakingEvents ?? 0,
      corneringEvents: hydratedTrip.canonicalTripSummary?.events?.corneringEvents ?? 0,
      abuseEvents: hydratedTrip.canonicalTripSummary?.events?.abuseEvents ?? 0,
      speedingEvents: hydratedTrip.canonicalTripSummary?.events?.speedingEvents ?? 0,
      assignmentStatus: hydratedTrip.canonicalTripSummary?.assignment?.assignmentStatus ?? null,
      assignmentSubjectType: hydratedTrip.canonicalTripSummary?.assignment?.assignmentSubjectType ?? null,
      assignmentSubjectId: hydratedTrip.canonicalTripSummary?.assignment?.assignmentSubjectId ?? null,
      assignedBookingId: hydratedTrip.canonicalTripSummary?.assignment?.assignedBookingId ?? null,
      isPrivateTrip: hydratedTrip.canonicalTripSummary?.assignment?.isPrivateTrip ?? false,
      scoreEligible: hydratedTrip.canonicalTripSummary?.assignment?.scoreEligible ?? false,
      behaviorReady: behaviorEnrichmentStatus === 'COMPLETED',
      detailsLimited:
        !hydratedTrip.endTime ||
        (hydratedTrip as any).qualityStatus === 'LOW_DATA' ||
        (hydratedTrip as any).qualityStatus === 'ANOMALY',
    };
  }

  @Get('trips/:tripId/route')
  async getTripRoute(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
  ) {
    return this.tripsService.getRouteForTrip(vehicleId, tripId);
  }

  /**
   * Triggers structured reconciliation for this vehicle.
   * Replaces the legacy V1 "Sync Trips" endpoint.
   *
   * Scans the last 12 hours by default, or a caller-provided time window for
   * historical repair/backfill. Manual reconciliation enables the DIMO
   * segment fallback so missed live windows can be reconstructed safely.
   */
  @Post('trips/reconcile')
  async reconcileTrips(
    @Param('vehicleId') vehicleId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    if (from && Number.isNaN(fromDate?.getTime())) {
      throw new BadRequestException('Invalid `from` timestamp');
    }
    if (to && Number.isNaN(toDate?.getTime())) {
      throw new BadRequestException('Invalid `to` timestamp');
    }
    if (fromDate && toDate && fromDate >= toDate) {
      throw new BadRequestException('`from` must be earlier than `to`');
    }

    const result = await this.tripReconciliation.triggerManualReconciliation(
      vehicleId,
      {
        from: fromDate,
        to: toDate,
        useDimoSegmentFallback: true,
      },
    );
    return {
      found: result.repairsProposed,
      applied: result.repairsApplied,
      windowFrom: result.windowFrom.toISOString(),
      windowTo: result.windowTo.toISOString(),
      usedDimoSegmentFallback: true,
      message:
        result.repairsApplied > 0
          ? `${result.repairsApplied} missing trip(s) repaired`
          : 'No missing trips detected',
    };
  }

  /**
   * Route-based enrichment: road type, speeding, temperature, basic perf metrics.
   *
   * This is complementary to HF behavior enrichment, NOT a replacement.
   * It writes city/highway/country distribution, speeding, and engine temp/avg
   * performance metrics.  It does NOT write behavior event counters (those come
   * from the HF enrichment pipeline via POST .../behavior-enrich).
   *
   * For canonical behavior metrics (acceleration, braking, abuse, stress scores)
   * use POST .../behavior-enrich instead.
   */
  @Post('trips/:tripId/enrich')
  async enrichTrip(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
  ) {
    const result = await this.tripsService.enrichTrip(vehicleId, tripId);
    if (result) {
      const trip = await this.prisma.vehicleTrip.findUnique({ where: { id: tripId } });
      if (trip?.distanceKm) {
        try {
          await this.tireHealthService.updateTireUsageFromTrip(vehicleId, {
            distanceKm: trip.distanceKm,
            cityPercent: result.citySharePercent,
            highwayPercent: result.highwaySharePercent,
            ruralPercent: result.countrySharePercent,
            harshBrakeCount: trip.harshBrakeCount ?? 0,
            harshAccelCount: trip.harshAccelCount ?? 0,
            harshCornerCount: trip.harshCornerCount ?? 0,
          });
        } catch { /* tire update is best-effort */ }
      }
    }
    return result;
  }

  @Get('trips/:tripId/behavior-events')
  async getTripBehaviorEvents(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
    @Query('category') category?: string,
  ) {
    // ── False-zero guard ─────────────────────────────────────────────────
    // If the trip hasn't been enriched yet, returning an empty events array
    // would be misinterpreted as "zero events". Return a pending status instead.
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { behaviorEnrichmentStatus: true },
    });
    if (trip && trip.behaviorEnrichmentStatus !== 'COMPLETED') {
      return {
        status: 'pending',
        behaviorReady: false,
        events: [],
      };
    }

    const behaviorWhere: any = { tripId, vehicleId };
    if (category) behaviorWhere.eventCategory = category;

    const behaviorEvents = await this.prisma.tripBehaviorEvent.findMany({
      where: behaviorWhere,
      orderBy: { startedAt: 'asc' },
    });

    const DRIVING_EVENT_CATEGORY_MAP: Record<string, string> = {
      HARSH_BRAKING: 'BRAKING',
      EXTREME_BRAKING: 'BRAKING',
      HARSH_ACCELERATION: 'ACCELERATION',
      HARSH_CORNERING: 'ACCELERATION',
      SPEEDING: 'ABUSE',
      IDLE_EXCESSIVE: 'ABUSE',
    };

    const DRIVING_EVENT_CLASSIFICATION_MAP: Record<string, string> = {
      HARSH_BRAKING: 'HARD',
      EXTREME_BRAKING: 'EXTREME',
      HARSH_ACCELERATION: 'HARD',
      HARSH_CORNERING: 'MODERATE',
      SPEEDING: 'WARNING',
      IDLE_EXCESSIVE: 'LIGHT',
    };

    const drivingWhere: any = { tripId, vehicleId };
    if (category) {
      const allowedTypes = Object.entries(DRIVING_EVENT_CATEGORY_MAP)
        .filter(([, cat]) => cat === category)
        .map(([type]) => type);
      if (allowedTypes.length > 0) drivingWhere.eventType = { in: allowedTypes };
      else return behaviorEvents;
    }

    const drivingEvents = await this.prisma.drivingEvent.findMany({
      where: drivingWhere,
      orderBy: { recordedAt: 'asc' },
    });

    const mappedDriving = drivingEvents.map((de) => {
      const meta = (de.metadataJson as any) ?? {};
      return {
        id: de.id,
        organizationId: de.organizationId,
        vehicleId: de.vehicleId,
        tripId: de.tripId ?? tripId,
        eventCategory: DRIVING_EVENT_CATEGORY_MAP[de.eventType] ?? 'ACCELERATION',
        eventType: de.eventType,
        classification: DRIVING_EVENT_CLASSIFICATION_MAP[de.eventType] ?? 'MODERATE',
        startedAt: de.recordedAt,
        endedAt: null,
        durationMs: de.durationMs,
        startSpeedKmh: de.speedKmh,
        endSpeedKmh: null,
        peakValue: de.deltaKmh ?? de.severity,
        peakValueUnit: de.deltaKmh != null ? 'km/h delta' : 'severity',
        peakG: de.deltaKmh != null ? Math.abs(de.deltaKmh / 3.6 / Math.max(0.5, (de.durationMs ?? 1000) / 1000)) / 9.81 : null,
        maxThrottlePos: meta.throttlePct ?? null,
        maxEngineRpm: meta.rpm ?? null,
        maxCoolantTemp: meta.coolantC ?? null,
        latitude: de.latitude,
        longitude: de.longitude,
        metadataJson: de.metadataJson,
        createdAt: de.createdAt,
        source: 'DRIVING_EVENT',
      };
    });

    const existingIds = new Set(behaviorEvents.map((e) => e.tripId + e.startedAt.toISOString()));
    const deduped = mappedDriving.filter((de) => {
      const key = de.tripId + new Date(de.startedAt).toISOString();
      return !existingIds.has(key);
    });

    const merged = [...behaviorEvents.map((e) => ({ ...e, latitude: null, longitude: null, source: 'BEHAVIOR_EVENT' })), ...deduped];
    merged.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    return {
      status: 'ready',
      behaviorReady: true,
      events: merged,
    };
  }

  @Post('trips/:tripId/behavior-enrich')
  async enrichTripBehavior(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
  ) {
    // Canonical flow: V2 FSM auto-finalize, reconciliation repairs, and manual enrichment.
    // Status tracking, DimoPollLog, and DrivingImpact chaining all happen here.
    const { status, result } = await this.enrichmentOrchestrator.runEnrichmentSync(
      tripId,
      vehicleId,
    );
    return {
      status,
      enrichmentStatus: status,
      ...(result ?? {}),
      message: status === 'COMPLETED'
        ? `Enrichment completed: ${result?.totalEventsStored ?? 0} events`
        : status === 'SKIPPED_NO_HF_DATA'
          ? 'No high-frequency data available for this trip'
          : 'Enrichment processed',
    };
  }

  // --- Damages ---
  @Get('damages')
  async getDamages(@Param('vehicleId') vehicleId: string) {
    return this.damagesService.findByVehicle(vehicleId);
  }

  @Get('damages/active')
  async getActiveDamages(@Param('vehicleId') vehicleId: string) {
    return this.damagesService.findActive(vehicleId);
  }

  @Get('damages/stats')
  async getDamageStats(@Param('vehicleId') vehicleId: string) {
    return this.damagesService.getStats(vehicleId);
  }

  @Post('damages')
  async createDamage(
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
  ) {
    return this.damagesService.create({ vehicleId, ...body });
  }

  @Patch('damages/:id/repair')
  async markDamageRepaired(@Param('id') id: string) {
    return this.damagesService.markRepaired(id);
  }

  @Post('damages/:id/images')
  async addDamageImage(
    @Param('id') id: string,
    @Body() body: { imageData: string; caption?: string },
  ) {
    return this.damagesService.addImage(id, body.imageData, body.caption);
  }

  // --- Battery Health (12V) ---
  @Get('battery-health')
  async getBatteryHealth(@Param('vehicleId') vehicleId: string) {
    return this.batteryHealthService.findByVehicle(vehicleId);
  }

  @Get('battery-health/latest')
  async getLatestBatteryHealth(@Param('vehicleId') vehicleId: string) {
    const [canonical, v2] = await Promise.all([
      this.canonicalBatteryHealthService.getSummary(vehicleId),
      this.batteryV2Service.getV2Health(vehicleId),
    ]);

    if (!canonical) return null;

    return {
      voltageV: canonical.currentState?.voltageV ?? null,
      sohPercent: canonical.currentState?.sohPercent ?? null,
      temperatureC: canonical.currentState?.temperatureC ?? null,
      recordedAt: canonical.currentState?.lastChecked ?? null,
      restingVoltage: canonical.currentState?.restingVoltage ?? null,
      crankingVoltage: canonical.currentState?.crankingVoltage ?? null,
      chargingVoltage: canonical.currentState?.chargingVoltage ?? null,
      source: 'canonical',
      lv: canonical.lv,
      hv: canonical.hv,
      currentTelemetry: canonical.currentTelemetry,
      v2: v2
        ? {
            estimatedSocPct: v2.estimatedSocPct,
            estimatedSohPct: v2.estimatedSohPct,
            confidence: v2.confidence,
            badge: v2.badge,
            scoredAt: v2.scoredAt,
            publishedSohPct: v2.publishedSohPct,
            publicationState: v2.publicationState,
            maturityConfidence: v2.maturityConfidence,
            signalConfidence: v2.signalConfidence ?? v2.confidence,
            restFeatures: {
              vOff60m: v2.vOff60m,
              vOff6h: v2.vOff6h,
              deltaVRest: v2.deltaVRest,
              restWindowStartedAt: v2.restWindowStartedAt,
              rest60mCapturedAt: v2.rest60mCapturedAt,
              rest6hCapturedAt: v2.rest6hCapturedAt,
            },
            crankFeatures: {
              vPreCrank: v2.vPreCrank,
              vMinCrank: v2.vMinCrank,
              crankDrop: v2.crankDrop,
              vRecovery5s: v2.vRecovery5s,
              vRecovery30s: v2.vRecovery30s,
              crankAt: v2.crankAt,
            },
          }
        : null,
    };
  }

  @Get('battery-health/v2')
  async getBatteryHealthV2(@Param('vehicleId') vehicleId: string) {
    const [v2, latestState] = await Promise.all([
      this.batteryV2Service.getV2Health(vehicleId),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: { lvBatteryVoltage: true, lastSeenAt: true },
      }),
    ]);

    return {
      latestVoltage: latestState?.lvBatteryVoltage ?? null,
      estimatedSocPct: v2?.estimatedSocPct ?? null,
      estimatedSohPct: v2?.estimatedSohPct ?? null,
      confidence: v2?.confidence ?? 'insufficient_data',
      badge: v2?.badge ?? 'unknown',
      scoredAt: v2?.scoredAt ?? null,
      dataAvailability: {
        hasRestData: v2?.vOff60m != null || v2?.vOff6h != null,
        hasCrankData: v2?.crankDrop != null,
        hasRecoveryData: v2?.vRecovery5s != null,
      },
      rest: v2
        ? {
            vOff60m: v2.vOff60m,
            vOff6h: v2.vOff6h,
            deltaVRest: v2.deltaVRest,
            restWindowStartedAt: v2.restWindowStartedAt,
            rest60mCapturedAt: v2.rest60mCapturedAt,
            rest6hCapturedAt: v2.rest6hCapturedAt,
          }
        : null,
      crank: v2
        ? {
            vPreCrank: v2.vPreCrank,
            vMinCrank: v2.vMinCrank,
            crankDrop: v2.crankDrop,
            vRecovery5s: v2.vRecovery5s,
            vRecovery30s: v2.vRecovery30s,
            crankAt: v2.crankAt,
            tripId: v2.crankTripId,
          }
        : null,
    };
  }

  @Get('battery-health/trend')
  async getBatteryHealthTrend(
    @Param('vehicleId') vehicleId: string,
    @Query('days') days?: string,
  ) {
    return this.batteryHealthService.getSohTrend(vehicleId, days ? parseInt(days) : 30);
  }

  // --- Battery Health Summary ---
  @Get('battery-health-summary')
  async getBatteryHealthSummary(@Param('vehicleId') vehicleId: string) {
    return this.canonicalBatteryHealthService.getSummary(vehicleId);
  }

  @Get('battery-health-detail')
  async getBatteryHealthDetail(@Param('vehicleId') vehicleId: string) {
    return this.canonicalBatteryHealthService.getDetail(vehicleId);
  }

  // --- Service Info Status ---
  @Get('service-info-status')
  async getServiceInfoStatus(@Param('vehicleId') vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        serviceIntervalManufacturerKm: true,
        serviceIntervalManufacturerMonths: true,
        lastServiceDate: true,
        lastServiceOdometerKm: true,
        nextServiceDueDate: true,
        lastTuvDate: true,
        nextTuvDate: true,
        lastBokraftDate: true,
        nextBokraftDate: true,
      },
    });

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });

    const serviceEvents = await this.prisma.vehicleServiceEvent.findMany({
      where: { vehicleId, eventType: { in: ['FULL_SERVICE', 'GENERAL_INSPECTION', 'OIL_CHANGE', 'REPAIR'] } },
      orderBy: { eventDate: 'desc' },
      take: 20,
    });

    const tuvEvents = await this.prisma.vehicleServiceEvent.findMany({
      where: { vehicleId, eventType: 'TUV_INSPECTION' },
      orderBy: { eventDate: 'desc' },
      take: 10,
    });

    const bokraftEvents = await this.prisma.vehicleServiceEvent.findMany({
      where: { vehicleId, eventType: 'BOKRAFT_INSPECTION' },
      orderBy: { eventDate: 'desc' },
      take: 10,
    });

    const latestServiceEvent = serviceEvents[0] ?? null;
    const lastServiceDate = latestServiceEvent?.eventDate ?? vehicle?.lastServiceDate ?? null;
    const lastServiceOdometer = latestServiceEvent?.odometerKm ?? vehicle?.lastServiceOdometerKm ?? null;
    const intervalKm = vehicle?.serviceIntervalManufacturerKm ?? null;
    const intervalMonths = vehicle?.serviceIntervalManufacturerMonths ?? null;
    const currentOdometer = latestState?.odometerKm ?? null;
    const hasServiceBaseline = lastServiceDate != null;

    let serviceRemainingPercent: number | null = null;
    let serviceRemainingKm: number | null = null;
    let serviceRemainingMonths: number | null = null;

    if (hasServiceBaseline) {
      const now = new Date();
      const monthsElapsed = (now.getFullYear() - new Date(lastServiceDate!).getFullYear()) * 12
        + (now.getMonth() - new Date(lastServiceDate!).getMonth());

      if (intervalMonths != null && intervalMonths > 0) {
        serviceRemainingMonths = Math.max(0, intervalMonths - monthsElapsed);
      }

      if (lastServiceOdometer != null && currentOdometer != null && intervalKm != null && intervalKm > 0) {
        const kmSince = Math.round(currentOdometer - lastServiceOdometer);
        serviceRemainingKm = Math.max(0, intervalKm - kmSince);
      }

      const pcts: number[] = [];
      if (intervalKm != null && intervalKm > 0 && serviceRemainingKm != null) {
        pcts.push(Math.max(0, Math.min(100, Math.round((serviceRemainingKm / intervalKm) * 100))));
      }
      if (intervalMonths != null && intervalMonths > 0 && serviceRemainingMonths != null) {
        pcts.push(Math.max(0, Math.min(100, Math.round((serviceRemainingMonths / intervalMonths) * 100))));
      }
      if (pcts.length > 0) serviceRemainingPercent = Math.min(...pcts);
    }

    const now = new Date();
    const tuvValidTill = vehicle?.nextTuvDate ?? null;
    const bokraftValidTill = vehicle?.nextBokraftDate ?? null;
    const tuvRemainingMonths = tuvValidTill ? Math.max(0, Math.round((tuvValidTill.getTime() - now.getTime()) / (30.44 * 24 * 60 * 60 * 1000))) : null;
    const bokraftRemainingMonths = bokraftValidTill ? Math.max(0, Math.round((bokraftValidTill.getTime() - now.getTime()) / (30.44 * 24 * 60 * 60 * 1000))) : null;

    const mapEvent = (e: any) => ({
      id: e.id, eventType: e.eventType, date: e.eventDate.toISOString(),
      odometerKm: e.odometerKm, workshopName: e.workshopName, notes: e.notes,
    });

    // HM override: check for active HM Health signals for service distance/time
    let hmServiceSource = false;
    let hmLastUpdatedAt: string | null = null;
    try {
      const hmActive = await this.hmSignalUsageService.isHmHealthActive(vehicleId);
      if (hmActive) {
        const hmService = await this.hmSignalUsageService.getServiceInfoSignals(vehicleId);
        if (hmService) {
          if (hmService.distanceToNextServiceKm != null) {
            serviceRemainingKm = hmService.distanceToNextServiceKm;
            hmServiceSource = true;
          }
          if (hmService.timeToNextServiceDays != null) {
            // Convert days to months for consistency
            serviceRemainingMonths = Math.round(hmService.timeToNextServiceDays / 30);
            hmServiceSource = true;
          }
          hmLastUpdatedAt = hmService.lastUpdatedAt;
          // Recalculate percent from HM values
          const pcts: number[] = [];
          if (intervalKm && intervalKm > 0 && serviceRemainingKm != null) {
            pcts.push(Math.max(0, Math.min(100, Math.round((serviceRemainingKm / intervalKm) * 100))));
          }
          if (intervalMonths && intervalMonths > 0 && serviceRemainingMonths != null) {
            pcts.push(Math.max(0, Math.min(100, Math.round((serviceRemainingMonths / intervalMonths) * 100))));
          }
          if (pcts.length > 0) serviceRemainingPercent = Math.min(...pcts);
        }
      }
    } catch {
      // Non-critical — HM service override is optional; fall through to manufacturer values
    }

    return {
      hasServiceBaseline,
      serviceRemainingPercent,
      serviceRemainingKm,
      serviceRemainingMonths,
      intervalKm,
      intervalMonths,
      lastServiceDate: lastServiceDate?.toISOString?.() ?? null,
      lastServiceOdometer,
      lastServiceWorkshop: latestServiceEvent?.workshopName ?? null,
      tuvValidTill: tuvValidTill?.toISOString() ?? null,
      tuvRemainingMonths,
      tuvLastDate: vehicle?.lastTuvDate?.toISOString() ?? null,
      bokraftValidTill: bokraftValidTill?.toISOString() ?? null,
      bokraftRemainingMonths,
      bokraftLastDate: vehicle?.lastBokraftDate?.toISOString() ?? null,
      serviceHistory: serviceEvents.map(mapEvent),
      tuvHistory: tuvEvents.map(mapEvent),
      bokraftHistory: bokraftEvents.map(mapEvent),
      hmServiceSource,
      hmLastUpdatedAt,
    };
  }

  // --- Document Extraction ---
  @Get('document-extractions')
  async getDocumentExtractions(@Param('vehicleId') vehicleId: string) {
    return this.prisma.vehicleDocumentExtraction.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Post('document-extractions')
  async createDocumentExtraction(
    @Param('vehicleId') vehicleId: string,
    @Body() body: { documentType: string; extractedData: any; sourceFileName?: string; sourceFileUrl?: string },
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { organizationId: true } });
    return this.prisma.vehicleDocumentExtraction.create({
      data: {
        vehicleId,
        organizationId: vehicle?.organizationId ?? null,
        documentType: body.documentType as any,
        extractedData: body.extractedData,
        sourceFileName: body.sourceFileName,
        sourceFileUrl: body.sourceFileUrl,
        status: 'PENDING',
      },
    });
  }

  @Post('document-extractions/:extractionId/confirm')
  async confirmDocumentExtraction(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
    @Body() body: { confirmedData: any },
  ) {
    const extraction = await this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: { confirmedData: body.confirmedData, status: 'CONFIRMED', appliedAt: new Date() },
    });

    const d = body.confirmedData;
    const docType = extraction.documentType;

    const toNum = (v: unknown): number | undefined => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim().length > 0) {
        const parsed = Number(v);
        if (Number.isFinite(parsed)) return parsed;
      }
      return undefined;
    };

    if (docType === 'BRAKE') {
      const serviceDateRaw =
        (typeof d?.eventDate === 'string' && d.eventDate) ||
        (typeof d?.serviceDate === 'string' && d.serviceDate) ||
        new Date().toISOString();
      const notes =
        (typeof d?.notes === 'string' && d.notes.trim()) ||
        (typeof d?.description === 'string' && d.description.trim()) ||
        undefined;
      const kind =
        d?.serviceKind === 'inspection_only' ||
        d?.serviceKind === 'pads_service' ||
        d?.serviceKind === 'discs_service' ||
        d?.serviceKind === 'brake_fluid_service' ||
        d?.serviceKind === 'full_brake_service'
          ? d.serviceKind
          : 'full_brake_service';
      const rawScope = Array.isArray(d?.scope)
        ? d.scope
        : Array.isArray(d?.serviceScope)
          ? d.serviceScope
          : typeof d?.scopeCsv === 'string'
            ? d.scopeCsv
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [];
      const scope = rawScope.filter(
        (s: unknown): s is 'front_pads' | 'rear_pads' | 'front_discs' | 'rear_discs' =>
          s === 'front_pads' || s === 'rear_pads' || s === 'front_discs' || s === 'rear_discs',
      );

      const lifecycle = await this.brakeLifecycleService.recordService({
        vehicleId,
        serviceDate: serviceDateRaw,
        odometerKm: toNum(d?.odometerKm),
        workshopName:
          (typeof d?.workshopName === 'string' && d.workshopName.trim()) || undefined,
        notes,
        source: 'ai_document',
        kind,
        scope,
        measured: {
          frontPadMm: toNum(d?.frontPadMm ?? d?.measured?.frontPadMm),
          rearPadMm: toNum(d?.rearPadMm ?? d?.measured?.rearPadMm),
          frontDiscMm: toNum(
            d?.frontDiscMm ?? d?.frontRotorWidthMm ?? d?.measured?.frontDiscMm,
          ),
          rearDiscMm: toNum(
            d?.rearDiscMm ?? d?.rearRotorWidthMm ?? d?.measured?.rearDiscMm,
          ),
        },
        initializeIfPossible: true,
        documentUrl: extraction.sourceFileUrl ?? undefined,
      });

      const updated = await this.prisma.vehicleDocumentExtraction.update({
        where: { id: extractionId },
        data: { serviceEventId: lifecycle.serviceEventId },
      });

      return {
        ...updated,
        applyResult: lifecycle,
      };
    }

    if (['SERVICE', 'OIL_CHANGE', 'TUV_REPORT', 'BOKRAFT_REPORT'].includes(docType)) {
      const typeMap: Record<string, string> = {
        SERVICE: 'FULL_SERVICE', OIL_CHANGE: 'OIL_CHANGE',
        TUV_REPORT: 'TUV_INSPECTION', BOKRAFT_REPORT: 'BOKRAFT_INSPECTION',
      };
      const eventType = typeMap[docType] ?? 'OTHER';
      const svcEvent = await this.prisma.vehicleServiceEvent.create({
        data: {
          vehicleId,
          eventType: eventType as any,
          eventDate: d.eventDate ? new Date(d.eventDate) : new Date(),
          odometerKm: d.odometerKm ? parseInt(d.odometerKm, 10) : undefined,
          workshopName: d.workshopName || undefined,
          notes: d.notes || d.description || undefined,
          costCents: d.costCents ? parseInt(d.costCents, 10) : undefined,
          documentUrl: extraction.sourceFileUrl,
        },
      });
      await this.prisma.vehicleDocumentExtraction.update({
        where: { id: extractionId },
        data: { serviceEventId: svcEvent.id },
      });

      if (docType === 'OIL_CHANGE' && d.eventDate) {
        await this.prisma.vehicle.update({
          where: { id: vehicleId },
          data: {
            lastOilChangeDate: new Date(d.eventDate),
            ...(d.odometerKm ? { lastOilChangeOdometerKm: parseInt(d.odometerKm, 10) } : {}),
          },
        });
      }
      if (docType === 'SERVICE' && d.eventDate) {
        await this.prisma.vehicle.update({
          where: { id: vehicleId },
          data: {
            lastServiceDate: new Date(d.eventDate),
            ...(d.odometerKm ? { lastServiceOdometerKm: parseInt(d.odometerKm, 10) } : {}),
          },
        });
      }
      if (docType === 'TUV_REPORT' && d.eventDate) {
        const tuvDate = new Date(d.eventDate);
        const nextTuv = new Date(tuvDate);
        nextTuv.setFullYear(nextTuv.getFullYear() + 2);
        await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { lastTuvDate: tuvDate, nextTuvDate: nextTuv } });
      }
      if (docType === 'BOKRAFT_REPORT' && d.eventDate) {
        const bkDate = new Date(d.eventDate);
        const nextBk = new Date(bkDate);
        nextBk.setFullYear(nextBk.getFullYear() + 1);
        await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { lastBokraftDate: bkDate, nextBokraftDate: nextBk } });
      }
    }

    if (docType === 'BATTERY') {
      const normalized = normalizeBatteryDocumentConfirm(
        d as Record<string, unknown>,
      );
      const observedAt = normalized.observedAt;
      const scope = normalized.scope;
      const isReplacement = normalized.isReplacement;

      let serviceEventId: string | null = null;
      if (isReplacement) {
        const svcEvent = await this.prisma.vehicleServiceEvent.create({
          data: {
            vehicleId,
            eventType: 'BATTERY_REPLACEMENT',
            eventDate: observedAt,
            odometerKm: normalized.odometerKm
              ? Math.round(normalized.odometerKm)
              : undefined,
            workshopName: d?.workshopName || undefined,
            notes: d?.notes || d?.description || undefined,
            costCents: d?.costCents ? parseInt(d.costCents, 10) : undefined,
            documentUrl: extraction.sourceFileUrl,
          },
        });
        serviceEventId = svcEvent.id;
        await this.prisma.vehicleDocumentExtraction.update({
          where: { id: extractionId },
          data: { serviceEventId: svcEvent.id },
        });
      }

      const sourceType = isReplacement
        ? BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT
        : BatteryEvidenceSourceType.DOCUMENT_CONFIRMED;

      const sohPercent = normalized.sohPercent;
      const voltageV = normalized.voltageV;
      const restingVoltage = normalized.restingVoltage;
      const crankingVoltage = normalized.crankingVoltage;
      const chargingVoltage = normalized.chargingVoltage;
      const temperatureC = normalized.temperatureC;

      await this.batteryEvidenceService.recordMany([
        {
          vehicleId,
          scope,
          sourceType,
          valueType: BatteryEvidenceValueType.SOH_PERCENT,
          numericValue: sohPercent,
          unit: 'percent',
          observedAt,
          provider: 'document_confirmed',
          confidence: 'document_confirmed',
          quality: isReplacement ? 'workshop_measurement' : 'document_confirmed',
          documentExtractionId: extraction.id,
          serviceEventId,
        },
        {
          vehicleId,
          scope: BatteryEvidenceScope.LV,
          sourceType,
          valueType: BatteryEvidenceValueType.VOLTAGE_V,
          numericValue: voltageV,
          unit: 'V',
          observedAt,
          provider: 'document_confirmed',
          confidence: 'document_confirmed',
          quality: isReplacement ? 'workshop_measurement' : 'document_confirmed',
          documentExtractionId: extraction.id,
          serviceEventId,
        },
        {
          vehicleId,
          scope: BatteryEvidenceScope.LV,
          sourceType,
          valueType: BatteryEvidenceValueType.RESTING_VOLTAGE_V,
          numericValue: restingVoltage,
          unit: 'V',
          observedAt,
          provider: 'document_confirmed',
          confidence: 'document_confirmed',
          quality: isReplacement ? 'workshop_measurement' : 'document_confirmed',
          documentExtractionId: extraction.id,
          serviceEventId,
        },
        {
          vehicleId,
          scope: BatteryEvidenceScope.LV,
          sourceType,
          valueType: BatteryEvidenceValueType.CRANKING_VOLTAGE_V,
          numericValue: crankingVoltage,
          unit: 'V',
          observedAt,
          provider: 'document_confirmed',
          confidence: 'document_confirmed',
          quality: isReplacement ? 'workshop_measurement' : 'document_confirmed',
          documentExtractionId: extraction.id,
          serviceEventId,
        },
        {
          vehicleId,
          scope: BatteryEvidenceScope.LV,
          sourceType,
          valueType: BatteryEvidenceValueType.CHARGING_VOLTAGE_V,
          numericValue: chargingVoltage,
          unit: 'V',
          observedAt,
          provider: 'document_confirmed',
          confidence: 'document_confirmed',
          quality: isReplacement ? 'workshop_measurement' : 'document_confirmed',
          documentExtractionId: extraction.id,
          serviceEventId,
        },
        {
          vehicleId,
          scope: BatteryEvidenceScope.LV,
          sourceType,
          valueType: BatteryEvidenceValueType.BATTERY_TEMPERATURE_C,
          numericValue: temperatureC,
          unit: 'celsius',
          observedAt,
          provider: 'document_confirmed',
          confidence: 'document_confirmed',
          quality: isReplacement ? 'workshop_measurement' : 'document_confirmed',
          documentExtractionId: extraction.id,
          serviceEventId,
        },
      ]);

      // Keep legacy LV history only when the document actually contains LV voltage evidence.
      if (
        scope === BatteryEvidenceScope.LV &&
        (voltageV != null ||
          restingVoltage != null ||
          crankingVoltage != null ||
          chargingVoltage != null)
      ) {
        const lvReferenceVoltage =
          voltageV ??
          restingVoltage ??
          crankingVoltage ??
          chargingVoltage;
        if (lvReferenceVoltage != null) {
          await this.batteryHealthService.recordSnapshot({
            vehicleId,
            voltageV: lvReferenceVoltage,
            temperatureC: temperatureC ?? undefined,
            restingVoltage: restingVoltage ?? undefined,
            crankingVoltage: crankingVoltage ?? undefined,
            chargingVoltage: chargingVoltage ?? undefined,
            observedAt,
            sourceType,
            provider: 'document_confirmed',
            quality: isReplacement ? 'workshop_measurement' : 'document_confirmed',
            documentExtractionId: extraction.id,
            serviceEventId: serviceEventId ?? undefined,
          });
        }
      }
    }

    if (docType === 'TIRE' && d.treadDepthMm) {
      await this.tireLifecycleService
        .recordMeasurement({
          vehicleId,
          frontLeftMm: d.treadDepthMm?.fl ? parseFloat(d.treadDepthMm.fl) : undefined,
          frontRightMm: d.treadDepthMm?.fr ? parseFloat(d.treadDepthMm.fr) : undefined,
          rearLeftMm: d.treadDepthMm?.rl ? parseFloat(d.treadDepthMm.rl) : undefined,
          rearRightMm: d.treadDepthMm?.rr ? parseFloat(d.treadDepthMm.rr) : undefined,
          odometerKm: d.odometerKm ? parseFloat(d.odometerKm) : undefined,
          source: 'ai_confirmed',
          linkedExtractionId: extraction.id,
          linkedDocumentUrl: extraction.sourceFileUrl ?? undefined,
          quality: 'measured',
          shouldCalibrate: true,
          triggerRecalculate: true,
        })
        .catch((err: any) => {
          this.logger.warn(`Tire extraction measurement failed: ${err?.message ?? 'unknown error'}`);
        });
    }

    if (docType === 'DAMAGE' || docType === 'ACCIDENT') {
      await this.prisma.vehicleDamage.create({
        data: {
          vehicleId,
          damageType: (d.damageType as any) || 'SCRATCH',
          description: d.description || `${docType} report`,
          severity: (d.severity as any) || 'MODERATE',
        },
      });
    }

    if (docType === 'INVOICE') {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { organizationId: true } });
      if (vehicle?.organizationId) {
        await this.invoicesService.create(vehicle.organizationId, {
          type: 'INCOMING_UPLOADED',
          vehicleId,
          title: d.title || d.invoiceTitle || 'Hochgeladene Rechnung',
          description: d.description || '',
          vendorName: d.vendorName || d.workshopName || '',
          totalCents: d.totalCents ? parseInt(d.totalCents, 10) : (d.costCents ? parseInt(d.costCents, 10) : 0),
          invoiceDate: d.invoiceDate || d.eventDate || new Date().toISOString(),
          dueDate: d.dueDate || undefined,
          imageUrl: extraction.sourceFileUrl || undefined,
          extractedData: d,
          status: 'SENT',
        }).catch(() => {});
      }
    }

    return this.prisma.vehicleDocumentExtraction.findUnique({
      where: { id: extractionId },
    });
  }

  // --- Oil Change Status ---
  @Get('oil-change-status')
  async getOilChangeStatus(@Param('vehicleId') vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        oilChangeIntervalKm: true,
        oilChangeIntervalMonths: true,
        lastOilChangeDate: true,
        lastOilChangeOdometerKm: true,
      },
    });

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });

    const oilEvents = await this.prisma.vehicleServiceEvent.findMany({
      where: { vehicleId, eventType: 'OIL_CHANGE' },
      orderBy: { eventDate: 'desc' },
      take: 20,
    });

    const latestEvent = oilEvents[0] ?? null;
    const baselineDate = latestEvent?.eventDate ?? vehicle?.lastOilChangeDate ?? null;
    const baselineOdometer = latestEvent?.odometerKm ?? vehicle?.lastOilChangeOdometerKm ?? null;
    const intervalKm = vehicle?.oilChangeIntervalKm ?? null;
    const intervalMonths = vehicle?.oilChangeIntervalMonths ?? null;
    const currentOdometer = latestState?.odometerKm ?? null;
    const hasBaseline = baselineDate != null;

    let remainingPercent: number | null = null;
    let kmSinceChange: number | null = null;
    let monthsSinceChange: number | null = null;

    if (hasBaseline) {
      const now = new Date();
      monthsSinceChange = (now.getFullYear() - new Date(baselineDate!).getFullYear()) * 12
        + (now.getMonth() - new Date(baselineDate!).getMonth());

      if (baselineOdometer != null && currentOdometer != null) {
        kmSinceChange = Math.round(currentOdometer - baselineOdometer);
      }

      const percentages: number[] = [];
      if (intervalKm != null && intervalKm > 0 && kmSinceChange != null) {
        percentages.push(Math.max(0, Math.min(100, Math.round((1 - kmSinceChange / intervalKm) * 100))));
      }
      if (intervalMonths != null && intervalMonths > 0 && monthsSinceChange != null) {
        percentages.push(Math.max(0, Math.min(100, Math.round((1 - monthsSinceChange / intervalMonths) * 100))));
      }
      if (percentages.length > 0) {
        remainingPercent = Math.min(...percentages);
      }
    }

    return {
      hasBaseline,
      remainingPercent,
      intervalKm,
      intervalMonths,
      lastChangeDate: baselineDate?.toISOString?.() ?? (baselineDate ? String(baselineDate) : null),
      lastChangeOdometerKm: baselineOdometer,
      lastChangeWorkshop: latestEvent?.workshopName ?? null,
      kmSinceChange,
      monthsSinceChange,
      currentOdometerKm: currentOdometer != null ? Math.round(currentOdometer) : null,
      history: oilEvents.map(e => ({
        id: e.id,
        date: e.eventDate.toISOString(),
        odometerKm: e.odometerKm,
        workshopName: e.workshopName,
        notes: e.notes,
      })),
    };
  }

  // --- HV Battery Health (EV) ---
  @Get('hv-battery-status')
  async getHvBatteryStatus(@Param('vehicleId') vehicleId: string) {
    const [summary, legacy] = await Promise.all([
      this.canonicalBatteryHealthService.getSummary(vehicleId),
      this.hvBatteryHealthService.getHvBatteryStatus(vehicleId),
    ]);
    if (!legacy) return null;
    return {
      ...legacy,
      canonical: summary?.hv ?? null,
      currentTelemetry: summary?.currentTelemetry ?? null,
    };
  }

  // --- AI Health Care Summary (legacy) ---
  @Get('health-summary')
  async getHealthSummary(@Param('vehicleId') vehicleId: string) {
    return this.healthSummaryService.getSummary(vehicleId);
  }

  // --- AI Health Care (aggregated with HM indicators) ---
  @Get('health/ai-health-care')
  async getAiHealthCare(@Param('vehicleId') vehicleId: string) {
    return this.aiHealthCareAggregationService.getAiHealthCare(vehicleId);
  }

  // ── High Mobility Vehicle Activation (Phase 3) ───────────────────────────────

  @Get('high-mobility-status')
  async getHmStatus(@Param('vehicleId') vehicleId: string) {
    return this.hmVehicleActivationService.getHmStatusForVehicle(vehicleId);
  }

  @Post('high-mobility/check-eligibility')
  async hmCheckEligibility(@Param('vehicleId') vehicleId: string) {
    return this.hmVehicleActivationService.checkEligibilityForVehicle(vehicleId);
  }

  @Post('high-mobility/activate-health')
  async hmActivateHealth(@Param('vehicleId') vehicleId: string) {
    return this.hmVehicleActivationService.activateHmHealth(vehicleId);
  }

  @Post('high-mobility/refresh-status')
  async hmRefreshStatus(@Param('vehicleId') vehicleId: string) {
    return this.hmVehicleActivationService.refreshHmStatus(vehicleId);
  }

  @Post('high-mobility/deactivate')
  async hmDeactivate(@Param('vehicleId') vehicleId: string) {
    return this.hmVehicleActivationService.deactivateHmHealth(vehicleId);
  }

  // ── HM Vehicle Health Signals ────────────────────────────────────────────────

  @Get('hm-vehicle-health')
  async getHmVehicleHealth(@Param('vehicleId') vehicleId: string) {
    const [hmActive, service, tirePressure, aiHealth] = await Promise.all([
      this.hmSignalUsageService.isHmHealthActive(vehicleId),
      this.hmSignalUsageService.getServiceInfoSignals(vehicleId),
      this.hmSignalUsageService.getTirePressureSignals(vehicleId),
      this.hmSignalUsageService.getAiHealthCareSignals(vehicleId),
    ]);
    return { hmActive, service, tirePressure, aiHealth };
  }

  @Post('hm-vehicle-health/refresh-service')
  async hmRefreshService(@Param('vehicleId') vehicleId: string) {
    await this.hmSignalUsageService.refreshSignalGroup(vehicleId, 'SERVICE');
    return { ok: true };
  }

  @Post('hm-vehicle-health/refresh-tire-pressure')
  async hmRefreshTirePressure(@Param('vehicleId') vehicleId: string) {
    await this.hmSignalUsageService.refreshSignalGroup(vehicleId, 'TIRE_PRESSURE');
    return { ok: true };
  }

  @Post('hm-vehicle-health/refresh-ai-health-care')
  async hmRefreshAiHealthCare(@Param('vehicleId') vehicleId: string) {
    await this.hmSignalUsageService.refreshSignalGroup(vehicleId, 'AI_HEALTH_CARE');
    return { ok: true };
  }

  // ── HM Health-APP explicit endpoint aliases (/hm-health-app/) ────────────────
  // These are the canonical new-style routes matching the spec.
  // They delegate to the same underlying logic as the legacy /high-mobility/ routes.

  @Get('hm-health-app/status')
  async getHmHealthAppStatus(@Param('vehicleId') vehicleId: string) {
    return this.hmVehicleActivationService.getHmStatusForVehicle(vehicleId);
  }

  @Post('hm-health-app/check-eligibility')
  async hmHealthAppCheckEligibility(@Param('vehicleId') vehicleId: string) {
    return this.hmVehicleActivationService.checkEligibilityForVehicle(vehicleId);
  }

  @Post('hm-health-app/activate')
  async hmHealthAppActivate(@Param('vehicleId') vehicleId: string) {
    return this.hmVehicleActivationService.activateHmHealth(vehicleId);
  }

  @Post('hm-health-app/refresh-status')
  async hmHealthAppRefreshStatus(@Param('vehicleId') vehicleId: string) {
    return this.hmVehicleActivationService.refreshHmStatus(vehicleId);
  }

  @Post('hm-health-app/deactivate')
  async hmHealthAppDeactivate(@Param('vehicleId') vehicleId: string) {
    return this.hmVehicleActivationService.deactivateHmHealth(vehicleId);
  }

  /**
   * POST /vehicles/:vehicleId/hm-health-app/request-direct-clearance
   * For VW Group (Audi, VW, Skoda, SEAT, CUPRA) and Porsche:
   * Skips the Eligibility API and submits a direct fleet clearance request.
   * Safe to call from the UI "Start Activation" button for these brands.
   */
  @Post('hm-health-app/request-direct-clearance')
  async hmHealthAppRequestDirectClearance(@Param('vehicleId') vehicleId: string) {
    return this.hmVehicleActivationService.requestDirectFleetClearance(vehicleId);
  }

  @Get('hm-health-app/service-info')
  async hmHealthAppServiceInfo(@Param('vehicleId') vehicleId: string) {
    const signals = await this.hmSignalUsageService.getServiceInfoSignals(vehicleId);
    return signals ?? { distanceToNextServiceKm: null, timeToNextServiceDays: null, lastUpdatedAt: null, hmVehicleId: null, freshnessStatus: 'no_data' };
  }

  @Get('hm-health-app/tire-pressure-display')
  async hmHealthAppTirePressureDisplay(@Param('vehicleId') vehicleId: string) {
    const signals = await this.hmSignalUsageService.getTirePressureSignals(vehicleId);
    return signals ?? { overallStatus: 'UNKNOWN', lastUpdatedAt: null, hmVehicleId: null, freshnessStatus: 'no_data' };
  }

  @Get('hm-health-app/ai-health-care')
  async hmHealthAppAiHealthCare(@Param('vehicleId') vehicleId: string) {
    const signals = await this.hmSignalUsageService.getAiHealthCareSignals(vehicleId);
    return signals ?? { hmVehicleId: null, lastUpdatedAt: null, freshnessStatus: 'no_data' };
  }

  @Get('hm-health-app/error-codes-status')
  async hmHealthAppErrorCodesStatus(@Param('vehicleId') vehicleId: string) {
    const [dtcSummary, hmActive] = await Promise.all([
      this.dtcService.getSummary(vehicleId).catch(() => null),
      this.hmSignalUsageService.isHmHealthActive(vehicleId),
    ]);
    return {
      hmHealthActive: hmActive,
      dtcSummary: dtcSummary ?? null,
      sourceDomain: hmActive ? 'HM_HEALTH_APP' : 'DIMO',
    };
  }

  // ── V3: Hardware type update ────────────────────────────────────────────────
  // PATCH /vehicles/:vehicleId/hardware-type
  // Admin-only: update the hardware type classification for a single vehicle.
  // Used both for the vehicle registration form and for one-time backfill.
  @Patch('hardware-type')
  async updateHardwareType(
    @Param('vehicleId') vehicleId: string,
    @Body() body: { hardwareType: 'LTE_R1' | 'SMART5' | 'UNKNOWN' },
  ) {
    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { hardwareType: body.hardwareType },
      select: { id: true, hardwareType: true },
    });
    return { vehicleId: updated.id, hardwareType: updated.hardwareType };
  }
}
