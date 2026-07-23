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
  Delete,
  NotImplementedException,
  NotFoundException,
  Req,
  Header,
} from '@nestjs/common';
import { BatteryService } from './battery/battery.service';
import { TiresService } from './tires/tires.service';
import { TireHealthService } from './tires/tire-health.service';
import { TireTripUsageService } from './tires/tire-trip-usage.service';
import { TireLifecycleService } from './tires/tire-lifecycle.service';
import { BrakesService } from './brakes/brakes.service';
import { BrakeHealthService } from './brakes/brake-health.service';
import { BrakeRecalculationOrchestratorService } from './brakes/brake-recalculation-orchestrator.service';
import { BrakeLifecycleService } from './brakes/brake-lifecycle.service';
import { ServiceEventsService } from './service-events/service-events.service';
import { EnrichmentJobsService } from './enrichment-jobs/enrichment-jobs.service';
import { DtcService } from './dtc/dtc.service';
import { DtcKnowledgeService } from './dtc-knowledge/dtc-knowledge.service';
import { DtcVehicleContext } from './dtc-knowledge/dtc-knowledge.types';
import { TripsService } from './trips/trips.service';
import { TripBehaviorEnrichmentService } from './trips/trip-behavior-enrichment.service';
import { TripEnrichmentOrchestratorService } from './trips/trip-enrichment-orchestrator.service';
import { mapTripForVehicleApi } from './trips/trip-api.mapper';
import { isTripAnalysisInProgress } from './trips/trip-analysis-status';
import { TripReconciliationService } from './trips/reconciliation/trip-reconciliation.service';
import { EnergyEventsService } from './energy-events/energy-events.service';
import { TripAnalyticsCanonicalService } from './trips/trip-analytics-canonical.service';
import { TripDecisionSummaryService } from './trips/trip-decision-summary.service';
import { DriverScoreService } from './trips/driver-score.service';
import { DamagesService } from './damages/damages.service';
import {
  AddDamageImageDto,
  AnalyzeExteriorPhotosDto,
  CreateDamageDto,
  CreateDamageRepairTaskDto,
  MarkDamageRepairedDto,
  PlaceDamageOnVehicleDto,
  UpdateDamageDto,
} from './damages/dto';
import { BatteryHealthService } from './battery-health/battery-health.service';
import { HvBatteryHealthService } from './battery-health/hv-battery-health.service';
import { BatteryV2Service } from './battery-health/battery-v2.service';
import { presentLegacyCrankFeatures } from './battery-health/battery-crank-policy';
import { CanonicalBatteryHealthService } from './battery-health/canonical-battery-health.service';
import { BatteryEvidenceService } from './battery-health/battery-evidence.service';
import { LvRestShadowSummaryService } from './battery-health/lv-rest-window/lv-rest-shadow-summary.service';
import { LvStartProxyDiagnosticService } from './battery-health/lv-start-proxy/lv-start-proxy-diagnostic.service';
import { AiHealthCareAggregationService } from './health-summary/ai-health-care-aggregation.service';
import { VehicleHealthTabSummaryService } from './health-summary/vehicle-health-tab-summary.service';
import { DashboardWarningLightsService } from './dashboard-warning-lights/dashboard-warning-lights.service';
import { HmVehicleActivationService } from '../high-mobility/high-mobility-vehicle-activation.service';
import { HmSignalUsageService } from '../high-mobility/high-mobility-signal-usage.service';
import { ServiceComplianceService } from './service-compliance/service-compliance.service';
import { ComplianceTaskMaterializeService } from './service-compliance/compliance-task-materialize.service';
import { VehicleFileSummaryService } from './vehicle-file/vehicle-file-summary.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { PaginationParams } from '@shared/utils/pagination';
import {
  Prisma,
  TripAssignmentSubjectType,
  TireSetupStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Inject, forwardRef, Logger } from '@nestjs/common';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { AiTireSpecJobService } from '@modules/ai/vehicle-specs/ai-tire-spec-job.service';
import { TripEvidenceReadService } from '@modules/clickhouse/trip-evidence-read.service';
import { DeviceConnectionQueryService } from '@modules/dimo/device-connection-query.service';
import { RpmWebhookQueryService } from '@modules/dimo/rpm-webhook-query.service';
import { DrivingAssessmentDeviceQualityService } from './trips/driving-assessment-device-quality.service';
import { DrivingImpactService } from './driving-impact/driving-impact.service';
import { VehicleDrivingCapabilityLifecycleService } from './driving-capability/vehicle-driving-capability-lifecycle.service';
import { normalizeAiTireSpecResult, buildPersistedAiTireSpec, validateAiTireSpec } from './tires/ai-tire-spec-normalizer';
import { buildSetupBaselineFields } from './tires/tire-evidence-provenance';
import {
  CreateTireSetupDto,
  AddTireMeasurementDto,
  CalibrationMeasurementDto,
  TireHealthMeasurementDto,
  RotateTiresDto,
  ChangeTiresDto,
  ActivateStoredSetDto,
  StoreTireSetDto,
  RemoveTireSetDto,
  RetireTireDto,
  ApplyAiTireSpecDto,
  TireRecalculateDto,
  UpdateRecommendedPressureDto,
} from './tires/dto/tire-mutation.dto';
import {
  InitializeBrakeHealthDto,
  RecordBrakeServiceDto,
  CreateBrakeSpecDto,
  UpdateBrakeSpecDto,
  BrakeRecalculateDto,
} from './brakes/dto/brake-mutation.dto';
import { ValidateBrakeServiceScopePipe } from './brakes/brake-service-scope.validation';
import {
  CreateVehicleServiceEventDto,
  UpdateVehicleServiceEventDto,
} from './service-events/dto';
import { ServiceEventOrigin } from '@prisma/client';
import {
  buildUnifiedBehaviorEvents,
  DRIVING_EVENT_CATEGORY_MAP,
} from './trips/unified-behavior-read-model';
import { serializeUnifiedBehaviorEvent } from './trips/unified-behavior-event.dto';
import { resolveDriverFilterQuery } from './tenant/vehicle-intelligence-tenant.scope';
import { TripLocationEnforcementService } from '@modules/data-authorizations/trip-location-enforcement/trip-location-enforcement.service';
import {
  TRIP_LOCATION_DATA_CATEGORY,
  TRIP_LOCATION_PATH,
  TRIP_LOCATION_PURPOSE,
  TRIP_LOCATION_SERVICE_IDENTITY,
} from '@modules/data-authorizations/trip-location-enforcement/trip-location-enforcement.constants';
import { VehicleHealthEnforcementService } from '@modules/data-authorizations/vehicle-health-enforcement/vehicle-health-enforcement.service';
import {
  VEHICLE_HEALTH_DATA_CATEGORY,
  VEHICLE_HEALTH_PATH,
  VEHICLE_HEALTH_PURPOSE,
  VEHICLE_HEALTH_SERVICE_IDENTITY,
} from '@modules/data-authorizations/vehicle-health-enforcement/vehicle-health-enforcement.constants';
import {
  DRIVING_BEHAVIOR_DATA_CATEGORY,
  DRIVING_BEHAVIOR_PATH,
  DRIVING_BEHAVIOR_PURPOSE,
  DRIVING_BEHAVIOR_SERVICE_IDENTITY,
} from '@modules/data-authorizations/driving-behavior-enforcement/driving-behavior-enforcement.constants';
import { DrivingBehaviorEnforcementService } from '@modules/data-authorizations/driving-behavior-enforcement/driving-behavior-enforcement.service';

@Controller('vehicles/:vehicleId')
@UseGuards(RolesGuard, VehicleOwnershipGuard)
export class VehicleIntelligenceController {
  private readonly logger = new Logger(VehicleIntelligenceController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly batteryService: BatteryService,
    private readonly tiresService: TiresService,
    private readonly tireHealthService: TireHealthService,
    private readonly tireTripUsageService: TireTripUsageService,
    private readonly tireLifecycleService: TireLifecycleService,
    private readonly brakesService: BrakesService,
    private readonly brakeHealthService: BrakeHealthService,
    private readonly brakeRecalcOrchestrator: BrakeRecalculationOrchestratorService,
    private readonly brakeLifecycleService: BrakeLifecycleService,
    private readonly serviceEventsService: ServiceEventsService,
    private readonly enrichmentJobsService: EnrichmentJobsService,
    private readonly dtcService: DtcService,
    private readonly dtcKnowledgeService: DtcKnowledgeService,
    private readonly tripsService: TripsService,
    private readonly tripAnalyticsCanonicalService: TripAnalyticsCanonicalService,
    private readonly tripDecisionSummaryService: TripDecisionSummaryService,
    private readonly energyEventsService: EnergyEventsService,
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
    private readonly lvRestShadowSummaryService: LvRestShadowSummaryService,
    private readonly lvStartProxyDiagnosticService: LvStartProxyDiagnosticService,
    private readonly vehicleHealthTabSummaryService: VehicleHealthTabSummaryService,
    private readonly aiHealthCareAggregationService: AiHealthCareAggregationService,
    private readonly dashboardWarningLightsService: DashboardWarningLightsService,
    private readonly hmVehicleActivationService: HmVehicleActivationService,
    private readonly hmSignalUsageService: HmSignalUsageService,
    private readonly serviceComplianceService: ServiceComplianceService,
    private readonly complianceTaskMaterialize: ComplianceTaskMaterializeService,
    private readonly vehicleFileSummaryService: VehicleFileSummaryService,
    @Inject(forwardRef(() => InvoicesService))
    private readonly invoicesService: InvoicesService,
    @Inject(forwardRef(() => AiTireSpecJobService))
    private readonly aiTireSpecJobService: AiTireSpecJobService,
    private readonly deviceConnectionQuery: DeviceConnectionQueryService,
    private readonly rpmWebhookQuery: RpmWebhookQueryService,
    private readonly tripEvidenceRead: TripEvidenceReadService,
    private readonly drivingAssessmentQuality: DrivingAssessmentDeviceQualityService,
    private readonly drivingImpactService: DrivingImpactService,
    private readonly capabilityLifecycle: VehicleDrivingCapabilityLifecycleService,
    private readonly tripLocationEnforcement: TripLocationEnforcementService,
    private readonly healthEnforcement: VehicleHealthEnforcementService,
    private readonly behaviorEnforcement: DrivingBehaviorEnforcementService,
  ) {}

  @Get('driving-assessment-quality')
  async getDrivingAssessmentQuality(@Param('vehicleId') vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { hardwareType: true },
    });
    if (!vehicle) {
      throw new BadRequestException('Vehicle not found');
    }
    if (vehicle.hardwareType !== 'LTE_R1') {
      return { applicable: false, status: 'NORMAL' as const };
    }
    const status = await this.drivingAssessmentQuality.getVehicleQualityStatus(vehicleId);
    return {
      applicable: true,
      ...(status ?? {
        status: 'NORMAL' as const,
        degradedSince: null,
        recoveredAt: null,
        lastEvaluatedAt: null,
        activeObservationId: null,
        orgBaseline: null,
      }),
    };
  }

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
    @Body() body: CreateTireSetupDto,
  ) {
    return this.tireLifecycleService.installTireSet(vehicleId, {
      name: body.name,
      brandModelFront: body.brandModelFront,
      brandModelRear: body.brandModelRear,
      frontDimension: body.frontDimension,
      rearDimension: body.rearDimension,
      tireSeason: body.tireSeason,
      initialTreadDepthMm: body.initialTreadDepthMm,
      initialTreadFrontMm: body.initialTreadFrontMm,
      initialTreadRearMm: body.initialTreadRearMm,
      tireCondition: body.tireCondition,
      odometerKm: body.installedOdometerKm,
      manualConfirmOdometer: body.confirmOdometerKm,
      notes: body.notes,
      recommendedPressureFrontBar: body.recommendedPressureFrontBar,
      recommendedPressureRearBar: body.recommendedPressureRearBar,
      recommendedPressureLoadedFrontBar: body.recommendedPressureLoadedFrontBar,
      recommendedPressureLoadedRearBar: body.recommendedPressureLoadedRearBar,
      pressureSpecSource: body.pressureSpecSource,
      confirmPressureSpec: body.confirmPressureSpec,
      archiveCurrent: false,
    });
  }

  @Patch('tires/:tireSetupId/recommended-pressure')
  async updateRecommendedPressure(
    @Param('vehicleId') vehicleId: string,
    @Param('tireSetupId') tireSetupId: string,
    @Body() body: UpdateRecommendedPressureDto,
  ) {
    return this.tireLifecycleService.updateRecommendedPressure({
      vehicleId,
      tireSetupId,
      recommendedPressureFrontBar: body.recommendedPressureFrontBar,
      recommendedPressureRearBar: body.recommendedPressureRearBar,
      recommendedPressureLoadedFrontBar: body.recommendedPressureLoadedFrontBar,
      recommendedPressureLoadedRearBar: body.recommendedPressureLoadedRearBar,
      pressureSpecSource: body.pressureSpecSource,
      confirmPressureSpec: body.confirmPressureSpec,
    });
  }

  @Post('tires/:tireSetupId/measurements')
  async addTireMeasurement(
    @Param('vehicleId') vehicleId: string,
    @Param('tireSetupId') tireSetupId: string,
    @Body() body: AddTireMeasurementDto,
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
      source: body.source,
      workshopName: body.workshopName,
      shouldCalibrate: true,
      triggerRecalculate: true,
    });
  }

  @Post('tires/:tireSetupId/calibration-measurement')
  async addCalibrationMeasurement(
    @Param('vehicleId') vehicleId: string,
    @Param('tireSetupId') tireSetupId: string,
    @Body() body: CalibrationMeasurementDto,
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
    @Body() body: ApplyAiTireSpecDto,
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
        userConfirmedSpec: body.userConfirmedSpec ?? false,
      });

      await this.prisma.vehicleTireSetup.update({
        where: { id: setup.id },
        data: {
          aiTireSpec: persisted as any,
          ...buildSetupBaselineFields({
            aiTireSpec: persisted,
            userConfirmedSpec: persisted.userConfirmedSpec,
            treadMm: normalized.newTreadDepthMm,
            confirmedAt: persisted.userConfirmedSpec ? new Date() : null,
          }),
        },
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
  async getTireHealthSummary(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const allowed = await this.isHealthSignalsReadAllowed(
      organizationId,
      vehicleId,
      VEHICLE_HEALTH_PATH.TIRE_READ,
      VEHICLE_HEALTH_SERVICE_IDENTITY.TIRE_API,
    );
    if (!allowed) {
      return { accessDenied: true, overallPercent: null, healthStatus: 'unknown', alerts: [] };
    }
    const hmTirePressure = await this.hmSignalUsageService
      .getTirePressureSignals(vehicleId)
      .catch(() => null);
    return this.tireHealthService.getSummary(vehicleId, { hmTirePressure });
  }

  @Get('tires/detail')
  async getTireHealthDetail(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const allowed = await this.isHealthSignalsReadAllowed(
      organizationId,
      vehicleId,
      VEHICLE_HEALTH_PATH.TIRE_READ,
      VEHICLE_HEALTH_SERVICE_IDENTITY.TIRE_API,
    );
    if (!allowed) {
      return { accessDenied: true };
    }
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
    @Body() body: RotateTiresDto,
  ) {
    return this.tireLifecycleService.rotateTires(vehicleId, body);
  }

  @Post('tires/change')
  async changeTires(
    @Param('vehicleId') vehicleId: string,
    @Body() body: ChangeTiresDto,
  ) {
    return this.tireLifecycleService.replaceTires({
      vehicleId,
      ...body,
      manualConfirmOdometer: body.confirmOdometerKm,
    });
  }

  @Post('tires/activate-stored-set')
  async activateStoredTireSet(
    @Param('vehicleId') vehicleId: string,
    @Body() body: ActivateStoredSetDto,
  ) {
    return this.tireLifecycleService.activateStoredSet({
      vehicleId,
      ...body,
      manualConfirmOdometer: body.confirmOdometerKm,
    });
  }

  @Post('tires/store-set')
  async storeTireSet(
    @Param('vehicleId') vehicleId: string,
    @Body() body: StoreTireSetDto,
  ) {
    return this.tireLifecycleService.storeTireSet({
      vehicleId,
      ...body,
      manualConfirmOdometer: body.confirmOdometerKm,
    });
  }

  @Post('tires/remove-set')
  async removeTireSet(
    @Param('vehicleId') vehicleId: string,
    @Body() body: RemoveTireSetDto,
  ) {
    return this.tireLifecycleService.removeTireSet({
      vehicleId,
      ...body,
      manualConfirmOdometer: body.confirmOdometerKm,
    });
  }

  @Post('tires/retire')
  async retireTire(
    @Param('vehicleId') vehicleId: string,
    @Body() body: RetireTireDto,
  ) {
    return this.tireLifecycleService.retireTire({
      vehicleId,
      ...body,
      manualConfirmOdometer: body.confirmOdometerKm,
    });
  }

  @Post('tires/measurement')
  async addTireHealthMeasurement(
    @Param('vehicleId') vehicleId: string,
    @Body() body: TireHealthMeasurementDto,
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
  async recalculateTireHealth(
    @Param('vehicleId') vehicleId: string,
    @Body() body: TireRecalculateDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.tireHealthService.recalculate(vehicleId, {
      force: body.force,
      reason: body.reason,
      actorId: req.user?.id ?? null,
    });
  }

  // --- Brakes ---
  @Get('brakes')
  async getBrakeSpecs(@Param('vehicleId') vehicleId: string) {
    return this.brakesService.findByVehicle(vehicleId);
  }

  @Post('brakes')
  async createBrakeSpec(
    @Param('vehicleId') vehicleId: string,
    @Body() body: CreateBrakeSpecDto,
  ) {
    return this.brakesService.create(vehicleId, body);
  }

  @Patch('brakes/:id')
  async updateBrakeSpec(
    @Param('id') id: string,
    @Body() body: UpdateBrakeSpecDto,
  ) {
    return this.brakesService.update(id, body);
  }

  // --- Brake Status (legacy compat; canonical condition from brake-health summary) ---
  @Get('brake-status')
  async getBrakeStatus(@Param('vehicleId') vehicleId: string) {
    const canonical = await this.brakeHealthService.getSummary(vehicleId);
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
    switch (canonical.overallCondition) {
      case 'CRITICAL':
        condition = 'attention';
        break;
      case 'WARNING':
      case 'WATCH':
        condition = 'watch';
        break;
      case 'GOOD':
        condition = 'good';
        break;
      default:
        condition = canonical.isInitialized ? 'watch' : 'watch';
        break;
    }

    if (!canonical.isInitialized && canonical.stateClass === 'NO_BASELINE') {
      if (kmSinceService != null) {
        if (kmSinceService > kmAttentionThreshold) condition = 'attention';
        else if (kmSinceService > kmWatchThreshold) condition = 'watch';
      } else if (daysSinceService != null) {
        if (daysSinceService > 730) condition = 'attention';
        else if (daysSinceService > 365) condition = 'watch';
      } else if (!lastService && !spec) {
        condition = 'watch';
      }
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
      canonical: {
        overallCondition: canonical.overallCondition,
        dataBasis: canonical.dataBasis,
        stateClass: canonical.stateClass,
        confidenceLevel: canonical.confidenceLevel,
        openAlertCount: canonical.openAlerts?.length ?? 0,
        estimatedReplacementDueInKm: canonical.estimatedReplacementDueInKm,
      },
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
  async getBrakeHealthSummary(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const allowed = await this.isHealthSignalsReadAllowed(
      organizationId,
      vehicleId,
      VEHICLE_HEALTH_PATH.BRAKE_READ,
      VEHICLE_HEALTH_SERVICE_IDENTITY.BRAKE_API,
    );
    if (!allowed) {
      return { accessDenied: true };
    }
    return this.brakeHealthService.getSummary(vehicleId);
  }

  @Get('brake-health/detail')
  async getBrakeHealthDetail(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const allowed = await this.isHealthSignalsReadAllowed(
      organizationId,
      vehicleId,
      VEHICLE_HEALTH_PATH.BRAKE_READ,
      VEHICLE_HEALTH_SERVICE_IDENTITY.BRAKE_API,
    );
    if (!allowed) {
      return { accessDenied: true };
    }
    return this.brakeHealthService.getDetail(vehicleId);
  }

  @Post('brake-health/initialize')
  async initializeBrakeHealth(
    @Param('vehicleId') vehicleId: string,
    @Body(ValidateBrakeServiceScopePipe) body: InitializeBrakeHealthDto,
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
    @Body(ValidateBrakeServiceScopePipe) body: RecordBrakeServiceDto,
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
  async recalculateBrakeHealth(
    @Param('vehicleId') vehicleId: string,
    @Body() body: BrakeRecalculateDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const result = await this.brakeRecalcOrchestrator.enqueue({
      vehicleId,
      trigger: 'manual',
      force: body.force,
      reason: body.reason,
      actorId: req.user?.id ?? null,
    });
    if (result.executedInline) {
      return result.result;
    }
    return { queued: result.queued, jobId: result.jobId };
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
    @Body() body: CreateVehicleServiceEventDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.serviceEventsService.create(vehicleId, body, {
      userId: req.user?.id ?? null,
      origin: ServiceEventOrigin.MANUAL,
    });
  }

  @Patch('service-events/:id')
  async updateServiceEvent(
    @Param('vehicleId') vehicleId: string,
    @Param('id') id: string,
    @Body() body: UpdateVehicleServiceEventDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.serviceEventsService.update(vehicleId, id, body, {
      userId: req.user?.id ?? null,
    });
  }

  @Delete('service-events/:id')
  async deleteServiceEvent(
    @Param('vehicleId') vehicleId: string,
    @Param('id') id: string,
  ) {
    await this.serviceEventsService.remove(vehicleId, id);
    return { ok: true };
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
  async getDtcSummary(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const allowed = await this.isDtcReadAllowed(
      organizationId,
      vehicleId,
      VEHICLE_HEALTH_PATH.DTC_READ,
    );
    if (!allowed) {
      return this.healthEnforcement.emptyDtcSummary();
    }
    return this.dtcService.getSummary(vehicleId);
  }

  /**
   * Full detail payload for the DTC Detail Modal (3 sections).
   *
   * The base DTC logic (currentFaults / history / monitoring) runs UNCHANGED via
   * DtcService.getDetail. We then attach an AI-enriched `knowledge` object to
   * each active fault (enqueuing background enrichment for missing codes) and,
   * cheaply, to history rows that already have READY generic knowledge (no
   * enqueue). Enrichment failures never affect DTC display — the whole step is
   * wrapped in try/catch and degrades to no/partial knowledge.
   */
  @Get('dtc/detail')
  async getDtcDetail(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const readAllowed = await this.isDtcReadAllowed(
      organizationId,
      vehicleId,
      VEHICLE_HEALTH_PATH.DTC_READ,
    );
    if (!readAllowed) {
      return {
        currentFaults: { activeFaults: [], stale: true },
        history: [],
        monitoring: this.healthEnforcement.emptyDtcSummary(),
        accessDenied: true,
      };
    }

    const detail = await this.dtcService.getDetail(vehicleId);
    try {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { make: true, model: true, year: true, fuelType: true },
      });
      const ctx: DtcVehicleContext = {
        make: vehicle?.make ?? null,
        model: vehicle?.model ?? null,
        year: vehicle?.year ?? null,
        fuelType: vehicle?.fuelType ? String(vehicle.fuelType) : null,
      };
      const aiAuth = { organizationId, vehicleId };

      // Active faults → ensure enrichment + attach knowledge (enqueues missing).
      const activeFaults: Array<{ code: string; knowledge?: unknown }> =
        detail?.currentFaults?.activeFaults ?? [];
      await Promise.all(
        activeFaults.map(async (fault) => {
          fault.knowledge = await this.dtcKnowledgeService.getOrQueueForActiveFault(
            fault.code,
            ctx,
            'de',
            aiAuth,
          );
        }),
      );

      // History → attach existing READY generic knowledge only (never enqueue).
      const history: Array<{ code: string; knowledge?: unknown }> = detail?.history ?? [];
      if (history.length > 0) {
        const readyMap = await this.dtcKnowledgeService.getReadyGenericByCodes(
          history.map((h) => h.code),
        );
        for (const row of history) {
          const norm = this.dtcKnowledgeService.normalizeDtcCode(row.code);
          const k = norm ? readyMap.get(norm) : undefined;
          if (k) row.knowledge = k;
        }
      }
    } catch (err) {
      this.logger.warn(
        `DTC knowledge attach failed for vehicle ${vehicleId}: ${(err as Error).message}`,
      );
    }
    return detail;
  }

  /**
   * Internal/admin retry for a single DTC's knowledge enrichment. Auth +
   * vehicle-ownership are enforced by the controller-level guards. Re-queues
   * even FAILED rows and returns the refreshed knowledge DTO.
   */
  @Post('dtc/:code/knowledge/retry')
  async retryDtcKnowledge(
    @Param('vehicleId') vehicleId: string,
    @Param('code') code: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const normalized = this.dtcKnowledgeService.normalizeDtcCode(code);
    if (!normalized) {
      throw new BadRequestException(`Invalid DTC code: ${code}`);
    }
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { make: true, model: true, year: true, fuelType: true },
    });
    const ctx: DtcVehicleContext = {
      make: vehicle?.make ?? null,
      model: vehicle?.model ?? null,
      year: vehicle?.year ?? null,
      fuelType: vehicle?.fuelType ? String(vehicle.fuelType) : null,
    };
    const knowledge = await this.dtcKnowledgeService.retry(normalized, ctx, 'de', {
      organizationId,
      vehicleId,
    });
    return { code: normalized, knowledge };
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
  @Header('Cache-Control', 'no-store')
  @Get('trips')
  async getTrips(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('driver') driver?: string,
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const driverFilter = resolveDriverFilterQuery(driver);
    const trips = await this.tripsService.findByVehicle(organizationId, vehicleId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      ...driverFilter,
    });
    const hydratedTrips = await this.tripAnalyticsCanonicalService.hydrateTrips(
      organizationId,
      trips as any,
    );

    const mapped = hydratedTrips.map((trip) => mapTripForVehicleApi(trip as any));
    return this.attachTripDeviceConnectionFlags(vehicleId, mapped as any);
  }

  @Header('Cache-Control', 'no-store')
  @Get('trips/stats')
  async getTripStats(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    return this.tripAnalyticsCanonicalService.getVehicleStats(organizationId, vehicleId);
  }

  @Header('Cache-Control', 'no-store')
  @Get('driving-impact/rolling')
  async getDrivingImpactRolling(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const allowed = await this.behaviorEnforcement.isReadAllowed({
      organizationId,
      vehicleId,
      dataCategory: DRIVING_BEHAVIOR_DATA_CATEGORY.DRIVING_BEHAVIOR,
      purpose: DRIVING_BEHAVIOR_PURPOSE.FLEET_OPERATIONS,
      processingPath: DRIVING_BEHAVIOR_PATH.DRIVING_IMPACT_DERIVE,
      serviceIdentity: DRIVING_BEHAVIOR_SERVICE_IDENTITY.DRIVER_SCORE_API,
      correlationId: `driving-impact-read:${vehicleId}`,
    });
    if (!allowed) {
      return {
        accessDenied: true,
        rollingWindow: null,
        drivingStressScore: null,
        notDriverEvaluation: true,
      };
    }
    const [rollingWindow, current] = await Promise.all([
      this.drivingImpactService.getVehicleRollingWindow(vehicleId),
      this.drivingImpactService.getVehicleImpactForTire(vehicleId),
    ]);
    return {
      rollingWindow,
      drivingStressScore: current?.drivingStressScore ?? null,
      notDriverEvaluation: true,
    };
  }

  // ── Energy events (refuel / recharge) ────────────────────────────────
  // Backed by native DIMO RefuelDetector / RechargeDetector segments. These
  // endpoints are deliberately adjacent to `trips` so the frontend Trips-Tab
  // can mount a merged timeline without a second round-trip when possible.

  @Header('Cache-Control', 'no-store')
  @Get('energy-events')
  async getEnergyEvents(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const events = await this.energyEventsService.listEnergyEvents(vehicleId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    const allowed = await this.tripLocationEnforcement.isReadAllowed({
      organizationId,
      vehicleId,
      dataCategory: TRIP_LOCATION_DATA_CATEGORY.GPS_LOCATION,
      purpose: TRIP_LOCATION_PURPOSE.TRIPS,
      processingPath: TRIP_LOCATION_PATH.TRIP_ENERGY_READ,
      serviceIdentity: TRIP_LOCATION_SERVICE_IDENTITY.TRIPS_ENERGY_API,
      correlationId: `trip-energy:${vehicleId}`,
    });
    return this.tripLocationEnforcement.redactEnergyEvents(events, allowed);
  }

  @Post('energy-events/detect')
  async detectEnergyEvents(
    @Param('vehicleId') vehicleId: string,
    @Body() body: { from?: string; to?: string },
  ) {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.energyEventsService.detectEnergyEvents(vehicleId, {
      from: body.from ? new Date(body.from) : defaultFrom,
      to: body.to ? new Date(body.to) : now,
    });
  }

  @Header('Cache-Control', 'no-store')
  @Get('trips-timeline')
  async getTripsTimeline(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('driver') driver?: string,
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const driverFilter = resolveDriverFilterQuery(driver);

    const trips = await this.tripsService.findByVehicle(organizationId, vehicleId, {
      from: fromDate,
      to: toDate,
      ...driverFilter,
    });
    const hydratedTrips = await this.tripAnalyticsCanonicalService.hydrateTrips(
      organizationId,
      trips as any,
    );

    const mapped = hydratedTrips.map((trip) => mapTripForVehicleApi(trip as any));
    const withFlags = await this.attachTripDeviceConnectionFlags(
      vehicleId,
      mapped as any,
    );

    return this.energyEventsService.buildTripsTimeline(
      vehicleId,
      withFlags as any,
      { from: fromDate, to: toDate },
    );
  }

  @Get('trips/driver-score')
  async getDriverScore(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
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

    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const scoreReadAllowed = await this.behaviorEnforcement.isReadAllowed({
      organizationId,
      vehicleId,
      dataCategory: DRIVING_BEHAVIOR_DATA_CATEGORY.DRIVING_BEHAVIOR,
      purpose: DRIVING_BEHAVIOR_PURPOSE.DRIVER_PROFILING,
      processingPath: DRIVING_BEHAVIOR_PATH.DRIVER_SCORE_READ,
      serviceIdentity: DRIVING_BEHAVIOR_SERVICE_IDENTITY.DRIVER_SCORE_API,
      correlationId: `driver-score:${vehicleId}:${subjectId}`,
    });
    if (!scoreReadAllowed) {
      return this.behaviorEnforcement.emptyDriverScoreSummary(normalizedType, subjectId);
    }
    return this.driverScoreService.getScoreSummary(
      organizationId,
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
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const trip = await this.tripsService.findById(organizationId, tripId);
    if (!trip || trip.vehicleId !== vehicleId) return null;
    const hydratedTrip = await this.tripAnalyticsCanonicalService.hydrateTrip(
      organizationId,
      trip as any,
    );
    const tripAssessment = await this.tripAnalyticsCanonicalService.buildTripAssessmentForTrip(
      organizationId,
      trip as any,
      hydratedTrip.canonicalTripSummary,
    );

    const persistedSummary = await this.tripDecisionSummaryService.findByTrip(
      organizationId,
      tripId,
    );
    const tripDecisionSummary =
      persistedSummary ??
      (await this.tripDecisionSummaryService.buildSummary(organizationId, vehicleId, tripId));

    const mapped = mapTripForVehicleApi({
      ...(hydratedTrip as any),
      tripAssessment,
      tripDecisionSummary,
    });
    const [withFlags] = await this.attachTripDeviceConnectionFlags(vehicleId, [mapped as any]);

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { organizationId: true },
    });

    const clickhouseEvidence = vehicle
      ? await this.tripEvidenceRead.getTripClickHouseEvidence({
          orgId: vehicle.organizationId,
          vehicleId,
          tripId,
          startTime: trip.startTime,
          endTime: trip.endTime,
        })
      : undefined;

    return { ...withFlags, clickhouseEvidence };
  }

  @Get('trips/:tripId/route')
  async getTripRoute(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    return this.tripsService.getRouteForTrip(organizationId, vehicleId, tripId);
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
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const result = await this.tripsService.enrichTrip(organizationId, vehicleId, tripId);
    if (result) {
      try {
        await this.tireTripUsageService.processCanonicalTripFinalization(tripId, {
          trigger: 'manual_route_enrich',
        });
      } catch (err) {
        this.logger.warn(
          `Tire usage attribution after route enrich failed for trip ${tripId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return result;
  }

  @Get('trips/:tripId/behavior-events')
  async getTripBehaviorEvents(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
    @Query('category') category?: string,
  ) {
    // ── False-zero guard ─────────────────────────────────────────────────
    // If the trip hasn't been enriched yet, returning an empty events array
    // would be misinterpreted as "zero events". Return a pending status instead.
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        behaviorEnrichmentStatus: true,
        tripAnalysisStatus: true,
        tripStatus: true,
      },
    });
    const behaviorReady = trip?.behaviorEnrichmentStatus === 'COMPLETED';
    const analysisRunning =
      trip != null &&
      !behaviorReady &&
      (isTripAnalysisInProgress(trip.tripAnalysisStatus) ||
        trip.behaviorEnrichmentStatus === 'PENDING' ||
        trip.behaviorEnrichmentStatus === 'IN_PROGRESS');
    if (trip && analysisRunning) {
      return {
        status: 'pending',
        behaviorReady: false,
        analysisInProgress: true,
        tripAnalysisLabel: 'Analyse läuft noch',
        events: [],
      };
    }

    const behaviorWhere: any = { tripId, vehicleId };
    if (category) behaviorWhere.eventCategory = category;

    const behaviorEvents = await this.prisma.tripBehaviorEvent.findMany({
      where: behaviorWhere,
      orderBy: { startedAt: 'asc' },
    });

    const drivingWhere: any = { tripId, vehicleId };
    let skipDrivingEvents = false;
    if (category) {
      // Native DrivingEvents are restricted to the types that map to the
      // requested behaviour category. If no native type maps to it, native
      // events are skipped entirely (the list then shows HF events only).
      const allowedTypes = Object.entries(DRIVING_EVENT_CATEGORY_MAP)
        .filter(([, cat]) => cat === category)
        .map(([type]) => type);
      if (allowedTypes.length > 0) drivingWhere.eventType = { in: allowedTypes };
      else skipDrivingEvents = true;
    }

    const drivingEvents = skipDrivingEvents
      ? []
      : await this.prisma.drivingEvent.findMany({
          where: drivingWhere,
          orderBy: { recordedAt: 'asc' },
        });

    // ── Unified read-model (Phase 4) ─────────────────────────────────────────
    // Native DrivingEvents and HF-derived TripBehaviorEvents are merged into one
    // explainable list: provenance, confidence, native original name, and
    // abuse-relevance (so a native extreme-braking that feeds the abuse KPI is
    // visibly abuse-relevant). Native-preferred dedup runs inside the builder.
    const merged = buildUnifiedBehaviorEvents({
      behaviorEvents,
      drivingEvents,
      tripId,
    });

    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const allowed = await this.behaviorEnforcement.isReadAllowed({
      organizationId,
      vehicleId,
      dataCategory: DRIVING_BEHAVIOR_DATA_CATEGORY.DRIVING_BEHAVIOR,
      purpose: DRIVING_BEHAVIOR_PURPOSE.TECHNICAL_EVENT_DETECTION,
      processingPath: DRIVING_BEHAVIOR_PATH.BEHAVIOR_READ,
      serviceIdentity: DRIVING_BEHAVIOR_SERVICE_IDENTITY.BEHAVIOR_READ_API,
      correlationId: `trip-behavior:${tripId}`,
      tripId,
    });

    const redactedDriving = this.behaviorEnforcement.redactBehaviorEvents(
      drivingEvents,
      allowed,
    );
    const redactedMerged = buildUnifiedBehaviorEvents({
      behaviorEvents,
      drivingEvents: redactedDriving,
      tripId,
    });

    return {
      status: 'ready',
      behaviorReady: true,
      visibleEventCount: redactedMerged.length,
      events: redactedMerged.map(serializeUnifiedBehaviorEvent),
    };
  }

  @Get('trips/:tripId/device-connection-evidence')
  async getTripDeviceConnectionEvidence(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) {
      throw new BadRequestException('Vehicle not found');
    }
    return this.deviceConnectionQuery.getTripEvidence(
      vehicle.organizationId,
      vehicleId,
      tripId,
    );
  }

  @Get('trips/:tripId/rpm-candidates')
  async getTripRpmCandidates(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) {
      throw new BadRequestException('Vehicle not found');
    }
    return this.rpmWebhookQuery.getTripCandidates(
      vehicle.organizationId,
      vehicleId,
      tripId,
    );
  }

  @Post('trips/:tripId/behavior-enrich')
  async enrichTripBehavior(
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
  ) {
    // Canonical flow: V2 FSM auto-finalize, reconciliation repairs, and manual enrichment.
    // Status tracking, DimoPollLog, and DrivingImpact chaining all happen here.
    const { status, result, skipReason } = await this.enrichmentOrchestrator.runEnrichmentSync(
      tripId,
      vehicleId,
    );
    return {
      status,
      enrichmentStatus: status,
      ...(skipReason ? { skipReason } : {}),
      ...(result ?? {}),
      message: status === 'COMPLETED'
        ? `Enrichment completed: ${result?.totalEventsStored ?? 0} events`
        : status === 'SKIPPED_NO_HF_DATA'
          ? skipReason === 'CAPABILITY'
            ? 'Trip not enrichable: missing DIMO token / vehicle'
            : skipReason === 'INSUFFICIENT_POINTS'
              ? 'High-frequency data too sparse for this trip'
              : 'No high-frequency data available for this trip'
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
    @Body() body: CreateDamageDto,
  ) {
    return this.damagesService.create(vehicleId, body);
  }

  /**
   * Exterior photo damage analysis — contract only until a vision pipeline is wired.
   * Does NOT return fake suggestions. Frontend gates the flow behind
   * VITE_DAMAGE_AI_INTAKE_ENABLED.
   */
  @Post('damages/ai-analyze-exterior')
  analyzeExteriorPhotosForDamage(
    @Param('vehicleId') _vehicleId: string,
    @Body() _body: AnalyzeExteriorPhotosDto,
  ) {
    throw new NotImplementedException({
      code: 'DAMAGE_AI_ANALYZE_NOT_AVAILABLE',
      message:
        'Exterior photo damage analysis is not available yet. Use document-extraction DAMAGE uploads for report documents, or create damages manually.',
    });
  }

  @Patch('damages/:id')
  async updateDamage(
    @Param('vehicleId') vehicleId: string,
    @Param('id') id: string,
    @Body() body: UpdateDamageDto,
  ) {
    return this.damagesService.update(vehicleId, id, body);
  }

  @Patch('damages/:id/place')
  async placeDamageOnVehicle(
    @Param('vehicleId') vehicleId: string,
    @Param('id') id: string,
    @Body() body: PlaceDamageOnVehicleDto,
  ) {
    return this.damagesService.placeOnVehicle(vehicleId, id, body);
  }

  @Patch('damages/:id/repair')
  async markDamageRepaired(
    @Param('vehicleId') vehicleId: string,
    @Param('id') id: string,
    @Body() body: MarkDamageRepairedDto,
  ) {
    return this.damagesService.markRepaired(vehicleId, id, body);
  }

  @Post('damages/:id/repair-task')
  async createDamageRepairTask(
    @Param('vehicleId') vehicleId: string,
    @Param('id') id: string,
    @Body() body: CreateDamageRepairTaskDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.damagesService.createRepairTask(vehicleId, id, body, req.user?.id);
  }

  @Post('damages/:id/images')
  async addDamageImage(
    @Param('vehicleId') vehicleId: string,
    @Param('id') id: string,
    @Body() body: AddDamageImageDto,
  ) {
    return this.damagesService.addImage(vehicleId, id, body.imageData, body.caption, body.uploadedBy);
  }

  // --- Battery Health (12V) ---
  @Get('battery-health')
  async getBatteryHealth(@Param('vehicleId') vehicleId: string) {
    return this.batteryHealthService.findByVehicle(vehicleId);
  }

  @Get('battery-health/latest')
  async getLatestBatteryHealth(@Param('vehicleId') vehicleId: string) {
    const summary = await this.canonicalBatteryHealthService.getSummary(vehicleId);
    if (!summary) return null;

    const v2 = await this.batteryV2Service.getV2Health(vehicleId).catch(() => null);

    return {
      _compat: true,
      _canonical: 'Prefer battery-health-summary.canonical for new consumers.',
      canonical: summary.canonical,
      voltageV: summary.currentState?.voltageV ?? null,
      sohPercent: summary.currentState?.sohPercent ?? null,
      sohPercentSemantic: summary.currentState?.sohPercentSemantic ?? null,
      estimatedLvHealthScore: summary.currentState?.estimatedLvHealthScore ?? null,
      estimatedLvHealthScoreSemantic:
        summary.currentState?.estimatedLvHealthScoreSemantic ?? null,
      estimatedLvHealthScoreLabel:
        summary.currentState?.estimatedLvHealthScoreLabel ?? null,
      temperatureC: summary.currentState?.temperatureC ?? null,
      recordedAt: summary.currentState?.lastChecked ?? null,
      restingVoltage: summary.currentState?.restingVoltage ?? null,
      crankingVoltage: summary.currentState?.crankingVoltage ?? null,
      chargingVoltage: summary.currentState?.chargingVoltage ?? null,
      source: 'canonical',
      lv: summary.lv,
      hv: summary.hv,
      currentTelemetry: summary.currentTelemetry,
      v2: v2
        ? {
            estimatedSocPct: v2.estimatedSocPct,
            /** @deprecated Prefer estimatedLvHealthScore — LV behaviour score, not HV SOH */
            estimatedSohPct: v2.estimatedSohPct,
            estimatedLvHealthScore: v2.estimatedSohPct,
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
            crankFeatures: presentLegacyCrankFeatures({
              vPreCrank: v2.vPreCrank,
              vMinCrank: v2.vMinCrank,
              crankDrop: v2.crankDrop,
              vRecovery5s: v2.vRecovery5s,
              vRecovery30s: v2.vRecovery30s,
              crankAt: v2.crankAt,
              crankTripId: v2.crankTripId,
            }),
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

    const crankPresentation = v2
      ? presentLegacyCrankFeatures({
          vPreCrank: v2.vPreCrank,
          vMinCrank: v2.vMinCrank,
          crankDrop: v2.crankDrop,
          vRecovery5s: v2.vRecovery5s,
          vRecovery30s: v2.vRecovery30s,
          crankAt: v2.crankAt,
          crankTripId: v2.crankTripId,
        })
      : null;

    return {
      latestVoltage: latestState?.lvBatteryVoltage ?? null,
      estimatedSocPct: v2?.estimatedSocPct ?? null,
      /** @deprecated Prefer estimatedLvHealthScore — LV behaviour score, not HV SOH */
      estimatedSohPct: v2?.estimatedSohPct ?? null,
      estimatedLvHealthScore: v2?.estimatedSohPct ?? null,
      confidence: v2?.confidence ?? 'insufficient_data',
      badge: v2?.badge ?? 'unknown',
      scoredAt: v2?.scoredAt ?? null,
      dataAvailability: {
        hasRestData: v2?.vOff60m != null || v2?.vOff6h != null,
        hasCrankData: crankPresentation?.diagnosticCrankDrop != null,
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
      crank: crankPresentation
        ? {
            ...crankPresentation,
            vPreCrank: v2!.vPreCrank,
            vMinCrank: v2!.vMinCrank,
            vRecovery5s: v2!.vRecovery5s,
            vRecovery30s: v2!.vRecovery30s,
            crankAt: v2!.crankAt,
            tripId: v2!.crankTripId,
          }
        : null,
    };
  }

  /** Internal diagnostic API — LV REST shadow capture summary (no user-facing health impact). */
  @Get('battery-health/lv-rest-shadow-summary')
  async getLvRestShadowSummary(@Param('vehicleId') vehicleId: string) {
    return this.lvRestShadowSummaryService.getSummaryForVehicle(vehicleId);
  }

  /** Internal diagnostic API — LV start-proxy measurements (no operational health impact). */
  @Get('battery-health/lv-start-proxy-diagnostic')
  async getLvStartProxyDiagnostic(@Param('vehicleId') vehicleId: string) {
    return this.lvStartProxyDiagnosticService.getForVehicle(vehicleId);
  }

  @Get('battery-health/trend')
  async getBatteryHealthTrend(
    @Param('vehicleId') vehicleId: string,
    @Query('days') days?: string,
  ) {
    // Always pass radix 10: `parseInt("08")` etc. otherwise risks octal
    // interpretation on very old engines and sails past `strict` lint.
    const parsedDays = days ? parseInt(days, 10) : 30;
    const safeDays = Number.isFinite(parsedDays) && parsedDays > 0
      ? Math.min(parsedDays, 365)
      : 30;
    return this.batteryHealthService.getSohTrend(vehicleId, safeDays);
  }

  // --- Battery Health Summary ---
  @Get('battery-health-summary')
  async getBatteryHealthSummary(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const allowed = await this.isHealthSignalsReadAllowed(
      organizationId,
      vehicleId,
      VEHICLE_HEALTH_PATH.BATTERY_READ,
      VEHICLE_HEALTH_SERVICE_IDENTITY.BATTERY_API,
    );
    if (!allowed) {
      return { accessDenied: true };
    }
    return this.canonicalBatteryHealthService.getSummary(vehicleId);
  }

  @Get('battery-health-detail')
  async getBatteryHealthDetail(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const allowed = await this.isHealthSignalsReadAllowed(
      organizationId,
      vehicleId,
      VEHICLE_HEALTH_PATH.BATTERY_READ,
      VEHICLE_HEALTH_SERVICE_IDENTITY.BATTERY_API,
    );
    if (!allowed) {
      return { accessDenied: true };
    }
    return this.canonicalBatteryHealthService.getDetail(vehicleId);
  }

  // --- Vehicle file summary (Documents tab read model) ---
  @Get('file-summary')
  async getVehicleFileSummary(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const exportAllowed = await this.healthEnforcement.mayExport({
      organizationId,
      vehicleId,
      dataCategory: VEHICLE_HEALTH_DATA_CATEGORY.HEALTH_SIGNALS,
      purpose: VEHICLE_HEALTH_PURPOSE.VEHICLE_HEALTH,
      processingPath: VEHICLE_HEALTH_PATH.HEALTH_EXPORT,
      serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.HEALTH_EXPORT,
      correlationId: `health-export:${vehicleId}`,
    });
    if (!exportAllowed) {
      return {
        accessDenied: true,
        vehicleId,
        categories: [],
        healthDocumentsExcluded: true,
      };
    }
    return this.vehicleFileSummaryService.buildSummary(vehicleId);
  }

  // --- Service Info Status ---
  @Get('service-info-status')
  async getServiceInfoStatus(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const allowed = await this.isHealthSignalsReadAllowed(
      organizationId,
      vehicleId,
      VEHICLE_HEALTH_PATH.SERVICE_READ,
      VEHICLE_HEALTH_SERVICE_IDENTITY.SERVICE_API,
    );
    if (!allowed) {
      return { accessDenied: true };
    }
    return this.serviceComplianceService.buildServiceInfoStatus(vehicleId);
  }

  @Post('compliance-task-signals/:signalKey/materialize')
  async materializeComplianceTask(
    @Param('vehicleId') vehicleId: string,
    @Param('signalKey') signalKey: string,
    @Req() req: { user?: { organizationId?: string } },
  ) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.complianceTaskMaterialize.materializeSignal(orgId, vehicleId, decodeURIComponent(signalKey));
  }

  // --- Document Extraction ---
  // NOTE: all `document-extractions` routes (list / get / upload / confirm /
  // retry / delete-file) now live in DocumentExtractionModule
  // (DocumentExtractionController + DocumentExtractionService). The confirm/apply
  // logic was extracted into DocumentExtractionApplyService. Kept here only as a
  // pointer to avoid future duplicate route definitions.
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
    const summary = await this.canonicalBatteryHealthService.getSummary(vehicleId);
    if (!summary?.support?.hv) return null;

    const legacy = await this.hvBatteryHealthService
      .getHvBatteryStatus(vehicleId)
      .catch(() => null);

    const hv = summary.hv;
    const canonicalHv = summary.canonical?.hv ?? null;

    return {
      _compat: true,
      _canonical: 'Prefer battery-health-summary.canonical.hv for new consumers.',
      isEv: true,
      nominalCapacityKwh:
        canonicalHv?.referenceCapacity?.capacityKwh ??
        legacy?.nominalCapacityKwh ??
        hv?.telemetry?.grossCapacityKwh ??
        null,
      currentSocPercent: hv?.telemetry?.socPercent ?? legacy?.currentSocPercent ?? null,
      estimatedRangeKm: hv?.telemetry?.rangeKm ?? legacy?.estimatedRangeKm ?? null,
      sohPercent: hv?.sohPct ?? legacy?.sohPercent ?? null,
      publishedSohPercent: hv?.sohPct ?? legacy?.publishedSohPercent ?? null,
      sohMethod: hv?.method ?? legacy?.sohMethod ?? 'canonical',
      sohSourceType: hv?.sohSource ?? legacy?.sohSourceType ?? null,
      publicationState: hv?.publicationState ?? legacy?.publicationState ?? null,
      maturityConfidence: hv?.confidence ?? legacy?.maturityConfidence ?? null,
      snapshotCount: hv?.snapshotCount ?? legacy?.snapshotCount ?? 0,
      telemetry: hv?.telemetry ?? legacy?.telemetry ?? null,
      lastRecordedAt: hv?.freshness?.observedAt ?? legacy?.lastRecordedAt ?? null,
      canonical: canonicalHv,
      canonicalSummary: hv,
      currentTelemetry: summary.currentTelemetry ?? null,
      legacy: legacy ?? undefined,
    };
  }

  /** Canonical Health-tab summary — RentalHealthV1 is operational status truth. */
  @Get('health/summary')
  async getHealthTabSummary(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    const allowed = await this.isHealthSignalsReadAllowed(
      orgId,
      vehicleId,
      VEHICLE_HEALTH_PATH.HEALTH_SUMMARY_READ,
      VEHICLE_HEALTH_SERVICE_IDENTITY.HEALTH_API,
    );
    if (!allowed) {
      return { accessDenied: true };
    }
    return this.vehicleHealthTabSummaryService.getSummary(orgId, vehicleId);
  }

  // --- AI Health Care (aggregated with HM indicators) ---
  @Get('health/ai-health-care')
  async getAiHealthCare(@Param('vehicleId') vehicleId: string) {
    return this.aiHealthCareAggregationService.getAiHealthCare(vehicleId);
  }

  @Get('health/dashboard-warning-lights')
  async getDashboardWarningLights(@Param('vehicleId') vehicleId: string) {
    return this.dashboardWarningLightsService.getDashboardWarningLights(vehicleId);
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

  @Post('driving-capabilities/refresh-diagnostic')
  async refreshDrivingCapabilitiesDiagnostic(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { organizationId?: string },
  ) {
    const organizationId = req.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organization context required');
    }
    return this.capabilityLifecycle.refreshDiagnostic(organizationId, vehicleId);
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
  async hmHealthAppErrorCodesStatus(
    @Param('vehicleId') vehicleId: string,
    @Req() req: { user?: { organizationId?: string; platformRole?: string } },
  ) {
    const organizationId = await this.resolveOrganizationId(req, vehicleId);
    const dtcAllowed = await this.isDtcReadAllowed(
      organizationId,
      vehicleId,
      VEHICLE_HEALTH_PATH.DTC_READ,
    );
    const [dtcSummary, hmActive] = await Promise.all([
      dtcAllowed
        ? this.dtcService.getSummary(vehicleId).catch(() => null)
        : Promise.resolve(this.healthEnforcement.emptyDtcSummary()),
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

  /** Resolve tenant organization for vehicle-scoped trip/driving services. */
  private async resolveOrganizationId(
    req: { user?: { organizationId?: string; platformRole?: string } },
    vehicleId: string,
  ): Promise<string> {
    if (req.user?.platformRole !== 'MASTER_ADMIN' && req.user?.organizationId) {
      return req.user.organizationId;
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle?.organizationId) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle.organizationId;
  }

  private async isHealthSignalsReadAllowed(
    organizationId: string,
    vehicleId: string,
    processingPath: string,
    serviceIdentity: string,
  ): Promise<boolean> {
    return this.healthEnforcement.isReadAllowed({
      organizationId,
      vehicleId,
      dataCategory: VEHICLE_HEALTH_DATA_CATEGORY.HEALTH_SIGNALS,
      purpose: VEHICLE_HEALTH_PURPOSE.VEHICLE_HEALTH,
      processingPath,
      serviceIdentity,
      correlationId: `${processingPath}:${vehicleId}`,
    });
  }

  private async isDtcReadAllowed(
    organizationId: string,
    vehicleId: string,
    processingPath: string,
  ): Promise<boolean> {
    return this.healthEnforcement.isReadAllowed({
      organizationId,
      vehicleId,
      dataCategory: VEHICLE_HEALTH_DATA_CATEGORY.DTC_CODES,
      purpose: VEHICLE_HEALTH_PURPOSE.VEHICLE_HEALTH,
      processingPath,
      serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.DTC_API,
      correlationId: `${processingPath}:${vehicleId}`,
    });
  }

  /** Attach OBD plug/unplug flags for trip list, timeline, and detail surfaces. */
  private async attachTripDeviceConnectionFlags<
    T extends {
      id: string;
      startTime: Date | string;
      endTime?: Date | string | null;
      assignedBookingId?: string | null;
    },
  >(vehicleId: string, trips: T[]): Promise<T[]> {
    if (trips.length === 0) return trips;

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) return trips;

    const windows = trips.map((t) => ({
      id: t.id,
      startTime:
        t.startTime instanceof Date ? t.startTime : new Date(t.startTime),
      endTime: t.endTime
        ? t.endTime instanceof Date
          ? t.endTime
          : new Date(t.endTime)
        : null,
      assignedBookingId: t.assignedBookingId ?? null,
    }));

    const flagsMap = await this.deviceConnectionQuery.getDeviceConnectionFlagsForTrips(
      vehicle.organizationId,
      vehicleId,
      windows,
    );

    return trips.map((t) => ({
      ...t,
      ...(flagsMap.get(t.id) ?? {
        hasDeviceConnectionEvent: false,
        deviceUnpluggedCount: 0,
        devicePluggedInCount: 0,
        hasOpenDeviceUnplug: false,
        deviceConnectionRentalRelevant: false,
        deviceConnectionSeverity: null,
      }),
    }));
  }
}
