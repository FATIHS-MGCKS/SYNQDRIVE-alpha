import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BatteryService } from './battery/battery.service';
import { TiresService } from './tires/tires.service';
import { TireHealthService } from './tires/tire-health.service';
import { BrakesService } from './brakes/brakes.service';
import { BrakeHealthService } from './brakes/brake-health.service';
import { ServiceEventsService } from './service-events/service-events.service';
import { EnrichmentJobsService } from './enrichment-jobs/enrichment-jobs.service';
import { DtcService } from './dtc/dtc.service';
import { TripsService } from './trips/trips.service';
import { TripBehaviorEnrichmentService } from './trips/trip-behavior-enrichment.service';
import { TripEnrichmentOrchestratorService } from './trips/trip-enrichment-orchestrator.service';
import { DamagesService } from './damages/damages.service';
import { BatteryHealthService } from './battery-health/battery-health.service';
import { HvBatteryHealthService } from './battery-health/hv-battery-health.service';
import { BatteryV2Service } from './battery-health/battery-v2.service';
import { HealthSummaryService } from './health-summary/health-summary.service';
import { AiHealthCareAggregationService } from './health-summary/ai-health-care-aggregation.service';
import { HmVehicleActivationService } from '../high-mobility/high-mobility-vehicle-activation.service';
import { HmSignalUsageService } from '../high-mobility/high-mobility-signal-usage.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PaginationParams } from '@shared/utils/pagination';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Inject, forwardRef, Logger } from '@nestjs/common';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { AiTireSpecJobService } from '@modules/dimo/ai-tire-spec-job.service';
import { normalizeAiTireSpecResult, buildPersistedAiTireSpec, validateAiTireSpec } from './tires/ai-tire-spec-normalizer';

@Controller('vehicles/:vehicleId')
@UseGuards(RolesGuard)
export class VehicleIntelligenceController {
  private readonly logger = new Logger(VehicleIntelligenceController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly batteryService: BatteryService,
    private readonly tiresService: TiresService,
    private readonly tireHealthService: TireHealthService,
    private readonly brakesService: BrakesService,
    private readonly brakeHealthService: BrakeHealthService,
    private readonly serviceEventsService: ServiceEventsService,
    private readonly enrichmentJobsService: EnrichmentJobsService,
    private readonly dtcService: DtcService,
    private readonly tripsService: TripsService,
    private readonly behaviorEnrichmentService: TripBehaviorEnrichmentService,
    private readonly enrichmentOrchestrator: TripEnrichmentOrchestratorService,
    private readonly damagesService: DamagesService,
    private readonly batteryHealthService: BatteryHealthService,
    private readonly hvBatteryHealthService: HvBatteryHealthService,
    private readonly batteryV2Service: BatteryV2Service,
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
    return this.tiresService.createSetup(vehicleId, body);
  }

  @Post('tires/:tireSetupId/measurements')
  async addTireMeasurement(
    @Param('tireSetupId') tireSetupId: string,
    @Body()
    body: Omit<
      Prisma.VehicleTireTreadMeasurementCreateInput,
      'tireSetup' | 'vehicleId'
    >,
  ) {
    return this.tiresService.addMeasurement(tireSetupId, body);
  }

  @Post('tires/:tireSetupId/calibration-measurement')
  async addCalibrationMeasurement(
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
    return this.tiresService.addCalibrationMeasurement(tireSetupId, body);
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
        where: { vehicleId, removedAt: null },
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
    return this.tireHealthService.getSummary(vehicleId);
  }

  @Get('tires/detail')
  async getTireHealthDetail(@Param('vehicleId') vehicleId: string) {
    return this.tireHealthService.getDetail(vehicleId);
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
    return this.tireHealthService.rotateTires(
      vehicleId,
      body.template,
      body.odometerKm,
      body.notes,
    );
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
    },
  ) {
    return this.tireHealthService.changeTires(vehicleId, body);
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
    return this.tireHealthService.addMeasurement(vehicleId, body);
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

  // --- Brake Status (enhanced health summary) ---
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
      where: { vehicleId, startTime: { gte: ninetyDaysAgo } },
      // Fetch both the canonical HF counter (hardBrakingCount from HF enrichment)
      // and the legacy field (harshBrakeCount from route-based enrichment).
      // The canonical HF counter is preferred when the trip has been HF-enriched.
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
    // This ensures downstream health scoring always reads from the best available truth.
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
    },
  ) {
    return this.brakeHealthService.initializeFromService(vehicleId, body);
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
    return this.tripsService.findByVehicle(vehicleId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      driverName: driver,
    });
  }

  @Get('trips/stats')
  async getTripStats(@Param('vehicleId') vehicleId: string) {
    return this.tripsService.getStats(vehicleId);
  }

  @Get('trips/:tripId')
  async getTripById(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
  ) {
    return this.tripsService.findById(tripId);
  }

  @Get('trips/:tripId/route')
  async getTripRoute(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
  ) {
    return this.tripsService.getRouteForTrip(vehicleId, tripId);
  }

  /**
   * @deprecated LEGACY V1 manual trip sync.
   *
   * Uses the old ignition-based V1 detection algorithm (isIgnitionOn && speed > 0).
   * This is NOT the live V2 trip engine.  It exists only for admin back-fill or
   * historical debugging.  For live trip detection, the V2 state machine driven
   * by DimoSnapshotProcessor is used automatically.
   *
   * Results from this endpoint may differ from V2-detected trips and should NOT
   * be used as a substitute for the V2 live engine output.
   */
  @Post('trips/sync')
  async syncTrips(
    @Param('vehicleId') vehicleId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { dimoVehicle: true },
    });
    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (!tokenId) return { synced: 0, message: 'No DIMO connection' };
    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : now;
    const synced = await this.tripsService.syncTripsFromSegments(vehicleId, tokenId, fromDate, toDate);
    return {
      synced,
      warning: 'LEGACY V1 sync — uses ignition-based detection, not the live V2 engine.',
    };
  }

  @Post('trips/deduplicate')
  async deduplicateTrips(@Param('vehicleId') vehicleId: string) {
    const removed = await this.tripsService.deduplicateTrips(vehicleId);
    return { removed };
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

    return merged;
  }

  @Post('trips/:tripId/behavior-enrich')
  async enrichTripBehavior(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
  ) {
    // Canonical flow: same path as V2 auto and V1 sync.
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
    const snapshot = await this.batteryHealthService.getLatest(vehicleId);
    const v2 = await this.batteryV2Service.getV2Health(vehicleId);

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { lvBatteryVoltage: true, lastSeenAt: true },
    });

    const base = snapshot ?? (latestState?.lvBatteryVoltage != null
      ? {
          voltageV: latestState.lvBatteryVoltage,
          sohPercent: null,
          temperatureC: null,
          recordedAt: latestState.lastSeenAt,
          restingVoltage: null,
          crankingVoltage: null,
          chargingVoltage: null,
          source: 'telemetry',
        }
      : null);

    if (!base) return null;

    return {
      ...base,
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
    const latest = await this.batteryHealthService.getLatest(vehicleId);
    const trend7 = await this.batteryHealthService.getSohTrend(vehicleId, 7);
    const trend30 = await this.batteryHealthService.getSohTrend(vehicleId, 30);
    const specs = await this.batteryService.findByVehicle(vehicleId);
    const spec = specs[0] ?? null;

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { lvBatteryVoltage: true, lastSeenAt: true },
    });

    // V2 publication-aware data
    const v2 = await this.batteryV2Service.getV2Health(vehicleId);
    const pubState = v2?.publicationState ?? 'INITIAL_CALIBRATION';
    const publishedSoh = v2?.publishedSohPct ?? null;
    const maturityConf = v2?.maturityConfidence ?? 'none';

    const batteryEvents = await this.prisma.vehicleServiceEvent.findMany({
      where: { vehicleId, eventType: 'BATTERY_REPLACEMENT' },
      orderBy: { eventDate: 'desc' },
      take: 10,
    });

    const snapshots = await this.prisma.batteryHealthSnapshot.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: 20,
      select: { id: true, voltageV: true, sohPercent: true, temperatureC: true, recordedAt: true, restingVoltage: true },
    });

    // Prefer published SOH from V2 pipeline when available
    const soh = pubState !== 'INITIAL_CALIBRATION' ? (publishedSoh ?? latest?.sohPercent ?? null) : (latest?.sohPercent ?? null);
    const voltage = latest?.voltageV ?? latestState?.lvBatteryVoltage ?? null;
    const temp = latest?.temperatureC ?? null;
    const lastChecked = latest?.recordedAt ?? latestState?.lastSeenAt ?? null;

    let condition: 'good' | 'watch' | 'attention' | 'calibrating' = pubState === 'INITIAL_CALIBRATION' ? 'calibrating' : 'good';
    if (condition !== 'calibrating') {
      if (soh != null) {
        if (soh < 50) condition = 'attention';
        else if (soh < 70) condition = 'watch';
      } else if (voltage != null) {
        if (voltage < 11.5) condition = 'attention';
        else if (voltage < 12.0) condition = 'watch';
      }
    }

    let trendDirection: 'stable' | 'declining' | 'improving' | 'unknown' = 'unknown';
    if (trend30.length >= 3) {
      const first = trend30.slice(0, Math.ceil(trend30.length / 3));
      const last = trend30.slice(-Math.ceil(trend30.length / 3));
      const avgFirst = first.reduce((s: number, d: any) => s + (d.sohPercent ?? d.voltageV ?? 0), 0) / first.length;
      const avgLast = last.reduce((s: number, d: any) => s + (d.sohPercent ?? d.voltageV ?? 0), 0) / last.length;
      const delta = avgLast - avgFirst;
      if (Math.abs(delta) < 2) trendDirection = 'stable';
      else if (delta > 0) trendDirection = 'improving';
      else trendDirection = 'declining';
    }

    const watchpoints: string[] = [];
    if (soh != null && soh < 60) watchpoints.push('Battery SOH below 60% — consider battery testing');
    if (voltage != null && voltage < 12.0) watchpoints.push('Resting voltage below 12V — battery may struggle in cold weather');
    if (trendDirection === 'declining') watchpoints.push('Battery health trend is declining — monitor closely');
    if (temp != null && temp < 0) watchpoints.push('Sub-zero temperature detected — cold-weather battery stress expected');
    if (snapshots.length === 0) watchpoints.push('No battery health data available yet');

    const recommendations: string[] = [];
    if (condition === 'attention') recommendations.push('Schedule a professional battery test at next service');
    if (condition === 'watch') recommendations.push('Monitor battery voltage over the next few weeks');
    if (soh != null && soh < 40) recommendations.push('Battery replacement recommended in the near term');
    if (trendDirection === 'declining' && condition !== 'attention') recommendations.push('Track voltage trend — recheck in 2 weeks');
    if (watchpoints.length === 0 && condition === 'good') recommendations.push('Battery appears healthy — continue routine monitoring');

    return {
      currentState: {
        sohPercent: soh,
        publishedSohPct: publishedSoh,
        publicationState: pubState,
        maturityConfidence: maturityConf,
        voltageV: voltage != null ? Math.round(voltage * 100) / 100 : null,
        temperatureC: temp != null ? Math.round(temp * 10) / 10 : null,
        lastChecked: lastChecked?.toISOString() ?? null,
        restingVoltage: latest?.restingVoltage != null ? Math.round(latest.restingVoltage * 100) / 100 : null,
        crankingVoltage: latest?.crankingVoltage != null ? Math.round((latest as any).crankingVoltage * 100) / 100 : null,
        chargingVoltage: latest?.chargingVoltage != null ? Math.round((latest as any).chargingVoltage * 100) / 100 : null,
      },
      condition,
      trendDirection,
      specs: spec ? {
        batteryType: spec.batteryType,
        batteryAmpere: spec.batteryAmpere,
        batteryVolt: spec.batteryVolt,
        sourceType: spec.sourceType,
      } : null,
      trend7: trend7.map((d: any) => ({ date: d.recordedAt.toISOString(), soh: d.sohPercent, voltage: d.voltageV })),
      trend30: trend30.map((d: any) => ({ date: d.recordedAt.toISOString(), soh: d.sohPercent, voltage: d.voltageV })),
      history: [
        ...snapshots.map((s: any) => ({
          id: s.id, type: 'measurement' as const, date: s.recordedAt.toISOString(),
          soh: s.sohPercent, voltage: s.voltageV, temperature: s.temperatureC,
        })),
        ...batteryEvents.map((e: any) => ({
          id: e.id, type: 'service' as const, date: e.eventDate.toISOString(),
          notes: e.notes, workshopName: e.workshopName, odometerKm: e.odometerKm,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20),
      watchpoints,
      recommendations,
    };
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

    if (['SERVICE', 'OIL_CHANGE', 'BRAKE', 'BATTERY', 'TUV_REPORT', 'BOKRAFT_REPORT'].includes(docType)) {
      const typeMap: Record<string, string> = {
        SERVICE: 'FULL_SERVICE', OIL_CHANGE: 'OIL_CHANGE', BRAKE: 'BRAKE_SERVICE',
        BATTERY: 'BATTERY_REPLACEMENT', TUV_REPORT: 'TUV_INSPECTION', BOKRAFT_REPORT: 'BOKRAFT_INSPECTION',
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
      if (docType === 'BATTERY' && (d.sohPercent || d.voltageV)) {
        await this.batteryHealthService.recordSnapshot({
          vehicleId,
          voltageV: d.voltageV ? parseFloat(d.voltageV) : 12.0,
          ...(d.temperatureC ? { temperatureC: parseFloat(d.temperatureC) } : {}),
          ...(d.restingVoltage ? { restingVoltage: parseFloat(d.restingVoltage) } : {}),
        });
      }
    }

    if (docType === 'TIRE' && d.treadDepthMm) {
      const setups = await this.prisma.vehicleTireSetup.findMany({ where: { vehicleId, removedAt: null }, take: 1 });
      if (setups[0]) {
        await this.prisma.vehicleTireTreadMeasurement.create({
          data: {
            vehicleId, tireSetupId: setups[0].id, measuredAt: new Date(),
            frontLeftMm: d.treadDepthMm?.fl ? parseFloat(d.treadDepthMm.fl) : undefined,
            frontRightMm: d.treadDepthMm?.fr ? parseFloat(d.treadDepthMm.fr) : undefined,
            rearLeftMm: d.treadDepthMm?.rl ? parseFloat(d.treadDepthMm.rl) : undefined,
            rearRightMm: d.treadDepthMm?.rr ? parseFloat(d.treadDepthMm.rr) : undefined,
            odometerAtMeasurement: d.odometerKm ? parseFloat(d.odometerKm) : undefined,
            source: 'ai_upload',
          },
        });
      }
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

    return extraction;
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
    return this.hvBatteryHealthService.getHvBatteryStatus(vehicleId);
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
