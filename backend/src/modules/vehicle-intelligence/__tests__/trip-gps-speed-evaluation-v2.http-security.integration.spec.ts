import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '@shared/database/prisma.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { VehicleIntelligencePermissionGuard } from '../vehicle-intelligence-permission.guard';
import { VehicleIntelligenceController } from '../vehicle-intelligence.controller';
import { TripsService } from '../trips/trips.service';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import { DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENV } from '../driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-product-read.config';
import { DiV0TripSpeedQualityProductReadService } from '../driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-product-read.service';
import { DiV0TripSpeedQualityProjectionService } from '../driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-projection.service';
import { DiV0P2AutoProjectionV2Service } from '../driving-intelligence/trip-speed-quality/di-v0-p2-auto-projection-v2.service';
import { BatteryService } from '../battery/battery.service';
import { TiresService } from '../tires/tires.service';
import { TireHealthService } from '../tires/tire-health.service';
import { TireTripUsageService } from '../tires/tire-trip-usage.service';
import { TireLifecycleService } from '../tires/tire-lifecycle.service';
import { BrakesService } from '../brakes/brakes.service';
import { BrakeHealthService } from '../brakes/brake-health.service';
import { BrakeRecalculationOrchestratorService } from '../brakes/brake-recalculation-orchestrator.service';
import { BrakeLifecycleService } from '../brakes/brake-lifecycle.service';
import { ServiceEventsService } from '../service-events/service-events.service';
import { EnrichmentJobsService } from '../enrichment-jobs/enrichment-jobs.service';
import { DtcService } from '../dtc/dtc.service';
import { DtcKnowledgeService } from '../dtc-knowledge/dtc-knowledge.service';
import { TripAnalyticsCanonicalService } from '../trips/trip-analytics-canonical.service';
import { TripDecisionSummaryService } from '../trips/trip-decision-summary.service';
import { EnergyEventsService } from '../energy-events/energy-events.service';
import { DriverScoreService } from '../trips/driver-score.service';
import { TripBehaviorEnrichmentService } from '../trips/trip-behavior-enrichment.service';
import { TripEnrichmentOrchestratorService } from '../trips/trip-enrichment-orchestrator.service';
import { TripReconciliationService } from '../trips/reconciliation/trip-reconciliation.service';
import { DamagesService } from '../damages/damages.service';
import { BatteryHealthService } from '../battery-health/battery-health.service';
import { BatteryGroundTruthEmissionService } from '../battery-health/ground-truth/ground-truth-emission.service';
import { HvBatteryHealthService } from '../battery-health/hv-battery-health.service';
import { BatteryV2Service } from '../battery-health/battery-v2.service';
import { CanonicalBatteryHealthService } from '../battery-health/canonical-battery-health.service';
import { BatteryEvidenceService } from '../battery-health/battery-evidence.service';
import { LvRestShadowSummaryService } from '../battery-health/lv-rest-window/lv-rest-shadow-summary.service';
import { LvStartProxyDiagnosticService } from '../battery-health/lv-start-proxy/lv-start-proxy-diagnostic.service';
import { VehicleHealthTabSummaryService } from '../health-summary/vehicle-health-tab-summary.service';
import { AiHealthCareAggregationService } from '../health-summary/ai-health-care-aggregation.service';
import { DashboardWarningLightsService } from '../dashboard-warning-lights/dashboard-warning-lights.service';
import { HmVehicleActivationService } from '../../high-mobility/high-mobility-vehicle-activation.service';
import { HmSignalUsageService } from '../../high-mobility/high-mobility-signal-usage.service';
import { ServiceComplianceService } from '../service-compliance/service-compliance.service';
import { ComplianceTaskMaterializeService } from '../service-compliance/compliance-task-materialize.service';
import { VehicleFileSummaryService } from '../vehicle-file/vehicle-file-summary.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { AiTireSpecJobService } from '@modules/ai/vehicle-specs/ai-tire-spec-job.service';
import { DeviceConnectionQueryService } from '@modules/dimo/device-connection-query.service';
import { RpmWebhookQueryService } from '@modules/dimo/rpm-webhook-query.service';
import { TripEvidenceReadService } from '@modules/clickhouse/trip-evidence-read.service';
import { DrivingAssessmentDeviceQualityService } from '../trips/driving-assessment-device-quality.service';
import { DrivingImpactService } from '../driving-impact/driving-impact.service';
import { VehicleDrivingCapabilityLifecycleService } from '../driving-capability/vehicle-driving-capability-lifecycle.service';

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException('Missing authentication token');
    return true;
  }
}

function auth(user: Record<string, unknown> | null): [string, string] {
  return ['x-test-user', JSON.stringify(user)];
}

const orgA = 'org-a';
const orgB = 'org-b';
const vehOwned = 'veh-owned';
const vehForeign = 'veh-foreign';
const tripOwned = 'trip-owned';

const MEMBERSHIPS: Record<string, { role: string; status: string; permissions: unknown }> = {
  'fleet-reader|org-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { fleet: { read: true, write: false, manage: false } },
  },
  'no-fleet|org-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { dashboard: { read: true, write: false, manage: false } },
  },
};

describe('VehicleIntelligenceController — gps-speed-evaluation-v2 HTTP integration', () => {
  let app: INestApplication;
  let prisma: {
    organizationMembership: { findFirst: jest.Mock };
    vehicle: { findFirst: jest.Mock; findUnique: jest.Mock };
    vehicleTrip: { findFirst: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let tripsService: { findById: jest.Mock };
  let projectionService: {
    readCurrentOpsProjection: jest.Mock;
    projectForWorkItem: jest.Mock;
  };
  let p2AutoProjection: { runPass: jest.Mock };
  let productReadService: { readForTrip: jest.Mock };
  let realProductReadService: DiV0TripSpeedQualityProductReadService;
  let originalProductReadEnv: string | undefined;

  beforeAll(async () => {
    originalProductReadEnv = process.env[DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENV.enabled];
    process.env[DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENV.enabled] = 'true';

    prisma = {
      organizationMembership: {
        findFirst: jest.fn(async (args: { where: { userId: string; organizationId: string } }) => {
          const key = `${args.where.userId}|${args.where.organizationId}`;
          const row = MEMBERSHIPS[key];
          return row ? { role: row.role, permissions: row.permissions } : null;
        }),
      },
      vehicle: {
        findFirst: jest.fn(async (args: { where: { id: string; organizationId?: string } }) => {
          if (args.where.id === vehOwned && args.where.organizationId === orgA) return { id: vehOwned };
          if (args.where.id === vehForeign && args.where.organizationId === orgB) return { id: vehForeign };
          return null;
        }),
        findUnique: jest.fn(async (args: { where: { id: string } }) => {
          if (args.where.id === vehOwned) return { organizationId: orgA };
          if (args.where.id === vehForeign) return { organizationId: orgB };
          return null;
        }),
      },
      vehicleTrip: {
        findFirst: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    tripsService = {
      findById: jest.fn(async (_org: string, tripId: string) => {
        if (tripId === tripOwned) return { id: tripOwned, vehicleId: vehOwned };
        if (tripId === 'trip-wrong-vehicle') return { id: tripId, vehicleId: 'other-vehicle' };
        return null;
      }),
    };

    projectionService = {
      readCurrentOpsProjection: jest.fn().mockResolvedValue(null),
      projectForWorkItem: jest.fn(),
    };
    p2AutoProjection = { runPass: jest.fn() };

    realProductReadService = new DiV0TripSpeedQualityProductReadService(
      prisma as unknown as PrismaService,
      projectionService as unknown as DiV0TripSpeedQualityProjectionService,
    );
    productReadService = {
      readForTrip: jest.fn(async (...args: unknown[]) => realProductReadService.readForTrip(...(args as [string, string, string]))),
    };

    const stub = {};
    const moduleRef = await Test.createTestingModule({
      controllers: [VehicleIntelligenceController],
      providers: [
        Reflector,
        RolesGuard,
        VehicleOwnershipGuard,
        VehicleIntelligencePermissionGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: TripsService, useValue: tripsService },
        { provide: DiV0TripSpeedQualityProductReadService, useValue: productReadService },
        { provide: DiV0TripSpeedQualityProjectionService, useValue: projectionService },
        { provide: DiV0P2AutoProjectionV2Service, useValue: p2AutoProjection },
        { provide: BatteryService, useValue: stub },
        { provide: TiresService, useValue: stub },
        { provide: TireHealthService, useValue: stub },
        { provide: TireTripUsageService, useValue: stub },
        { provide: TireLifecycleService, useValue: stub },
        { provide: BrakesService, useValue: stub },
        { provide: BrakeHealthService, useValue: stub },
        { provide: BrakeRecalculationOrchestratorService, useValue: stub },
        { provide: BrakeLifecycleService, useValue: stub },
        { provide: ServiceEventsService, useValue: stub },
        { provide: EnrichmentJobsService, useValue: stub },
        { provide: DtcService, useValue: stub },
        { provide: DtcKnowledgeService, useValue: stub },
        { provide: TripAnalyticsCanonicalService, useValue: stub },
        { provide: TripDecisionSummaryService, useValue: stub },
        { provide: EnergyEventsService, useValue: stub },
        { provide: DriverScoreService, useValue: stub },
        { provide: TripBehaviorEnrichmentService, useValue: stub },
        { provide: TripEnrichmentOrchestratorService, useValue: stub },
        { provide: TripReconciliationService, useValue: stub },
        { provide: DamagesService, useValue: stub },
        { provide: BatteryHealthService, useValue: stub },
        { provide: BatteryGroundTruthEmissionService, useValue: stub },
        { provide: HvBatteryHealthService, useValue: stub },
        { provide: BatteryV2Service, useValue: stub },
        { provide: CanonicalBatteryHealthService, useValue: stub },
        { provide: BatteryEvidenceService, useValue: stub },
        { provide: LvRestShadowSummaryService, useValue: stub },
        { provide: LvStartProxyDiagnosticService, useValue: stub },
        { provide: VehicleHealthTabSummaryService, useValue: stub },
        { provide: AiHealthCareAggregationService, useValue: stub },
        { provide: DashboardWarningLightsService, useValue: stub },
        { provide: HmVehicleActivationService, useValue: stub },
        { provide: HmSignalUsageService, useValue: stub },
        { provide: ServiceComplianceService, useValue: stub },
        { provide: ComplianceTaskMaterializeService, useValue: stub },
        { provide: VehicleFileSummaryService, useValue: stub },
        { provide: InvoicesService, useValue: stub },
        { provide: AiTireSpecJobService, useValue: stub },
        { provide: DeviceConnectionQueryService, useValue: stub },
        { provide: RpmWebhookQueryService, useValue: stub },
        { provide: TripEvidenceReadService, useValue: stub },
        { provide: DrivingAssessmentDeviceQualityService, useValue: stub },
        { provide: DrivingImpactService, useValue: stub },
        { provide: VehicleDrivingCapabilityLifecycleService, useValue: stub },
        { provide: APP_GUARD, useClass: TestAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(
      (req: { headers: Record<string, string>; user?: unknown }, _res: unknown, next: () => void) => {
        const header = req.headers['x-test-user'];
        if (header && header !== 'null') req.user = JSON.parse(header);
        next();
      },
    );
    await app.init();
  });

  afterAll(async () => {
    if (originalProductReadEnv === undefined) {
      delete process.env[DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENV.enabled];
    } else {
      process.env[DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENV.enabled] = originalProductReadEnv;
    }
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    productReadService.readForTrip.mockImplementation(async (org, veh, trip) =>
      realProductReadService.readForTrip(org, veh, trip),
    );
    (prisma.vehicleTrip.findFirst as jest.Mock).mockResolvedValue({ id: tripOwned });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    projectionService.readCurrentOpsProjection.mockResolvedValue(null);
  });

  const fleetReader = { id: 'fleet-reader', platformRole: 'USER', organizationId: orgA };
  const noFleet = { id: 'no-fleet', platformRole: 'USER', organizationId: orgA };

  it('returns 404 when product read feature flag is OFF', async () => {
    process.env[DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENV.enabled] = 'false';
    await request(app.getHttpServer())
      .get(`/api/v1/vehicles/${vehOwned}/trips/${tripOwned}/gps-speed-evaluation-v2`)
      .set(...auth(fleetReader))
      .expect(404);
    process.env[DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENV.enabled] = 'true';
  });

  it('allows fleet.read and returns product read result', async () => {
    productReadService.readForTrip.mockResolvedValue({
      contractVersion: 'DI_V0_TRIP_GPS_SPEED_EVALUATION_PRODUCT_V1',
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      availability: 'READY',
      assessabilityLevel: 'FULL',
      limitedAssessability: false,
      coverage: null,
      speed: null,
      motion: null,
    });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/vehicles/${vehOwned}/trips/${tripOwned}/gps-speed-evaluation-v2`)
      .set(...auth(fleetReader))
      .expect(200);
    expect(res.body.qcPolicyVersion).toBe(DI_V0_SPEED_QC_POLICY_V2);
    expect(productReadService.readForTrip).toHaveBeenCalledWith(orgA, vehOwned, tripOwned);
  });

  it('denies user without fleet.read', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/vehicles/${vehOwned}/trips/${tripOwned}/gps-speed-evaluation-v2`)
      .set(...auth(noFleet))
      .expect(403);
  });

  it('returns 404 for foreign vehicle (tenant isolation)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/vehicles/${vehForeign}/trips/${tripOwned}/gps-speed-evaluation-v2`)
      .set(...auth(fleetReader))
      .expect(404);
  });

  it('returns 404 when trip belongs to another vehicle', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/vehicles/${vehOwned}/trips/trip-wrong-vehicle/gps-speed-evaluation-v2`)
      .set(...auth(fleetReader))
      .expect(404);
  });

  it('does not treat missing projection as V1 — only V2 policy requested', async () => {
    productReadService.readForTrip.mockImplementation(async (org, veh, trip) =>
      realProductReadService.readForTrip(org, veh, trip),
    );
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([{ id: 'wi-1', status: 'COMPLETED' }])
      .mockResolvedValueOnce([]);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/vehicles/${vehOwned}/trips/${tripOwned}/gps-speed-evaluation-v2`)
      .set(...auth(fleetReader))
      .expect(200);
    expect(res.body.availability).toBe('UNAVAILABLE');
    expect(projectionService.readCurrentOpsProjection).toHaveBeenCalledWith(
      orgA,
      tripOwned,
      DI_V0_SPEED_QC_POLICY_V2,
    );
  });

  it('GET path does not invoke projection write or P2 enqueue (real product read service)', async () => {
    productReadService.readForTrip.mockImplementation(async (org, veh, trip) =>
      realProductReadService.readForTrip(org, veh, trip),
    );
    await request(app.getHttpServer())
      .get(`/api/v1/vehicles/${vehOwned}/trips/${tripOwned}/gps-speed-evaluation-v2`)
      .set(...auth(fleetReader))
      .expect(200);
    expect(projectionService.readCurrentOpsProjection).toHaveBeenCalled();
    expect(projectionService.projectForWorkItem).not.toHaveBeenCalled();
    expect(p2AutoProjection.runPass).not.toHaveBeenCalled();
  });
});
