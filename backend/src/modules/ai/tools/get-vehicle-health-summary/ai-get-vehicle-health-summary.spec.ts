import { MembershipRole } from '@prisma/client';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { DamagesService } from '@modules/vehicle-intelligence/damages/damages.service';
import { ServiceComplianceService } from '@modules/vehicle-intelligence/service-compliance/service-compliance.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { AiGetVehicleHealthSummaryTool } from './ai-get-vehicle-health-summary.tool';
import { buildAiExecutionContext } from '../../execution/ai-execution-context.builder';
import type { AiExecutionContext } from '../../execution/ai-execution-context.types';
import type { AiVehicleScopeResolver } from '../../execution/ai-execution-context.types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const STATION_ID = '33333333-3333-4333-8333-333333333333';

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

function buildContext(
  overrides: Partial<Parameters<typeof buildAiExecutionContext>[0]> = {},
): AiExecutionContext {
  return buildAiExecutionContext({
    organizationId: ORG_ID,
    userId: '44444444-4444-4444-8444-444444444444',
    membershipRole: MembershipRole.WORKER,
    membershipStatus: 'ACTIVE',
    permissions: {
      fleet: { read: true, write: false },
      'fleet-condition': { read: true, write: false },
      'ai-assistant': { read: true, write: false },
    },
    channel: 'fleet_chat',
    dataAccessPurpose: 'fleet_assistant_query',
    correlationId: 'corr-health-1',
    requestId: 'req-health-1',
    ...overrides,
  });
}

function makeModuleHealth(
  overrides: Partial<VehicleHealth['modules']['battery']> = {},
): VehicleHealth['modules']['battery'] {
  return {
    state: 'good',
    reason: 'OK',
    last_updated_at: minutesAgo(30).toISOString(),
    data_stale: false,
    pipeline_available: true,
    source: 'test',
    evidence_type: 'measured',
    ...overrides,
  };
}

function makeVehicleHealth(
  overrides: Partial<VehicleHealth> = {},
  modulePatches: Partial<VehicleHealth['modules']> = {},
): VehicleHealth {
  const { modules: _ignoredModules, ...restOverrides } = overrides;
  const modules: VehicleHealth['modules'] = {
    battery: makeModuleHealth(),
    tires: makeModuleHealth({ source: 'tires' }),
    brakes: makeModuleHealth({ source: 'brakes' }),
    error_codes: makeModuleHealth({
      state: 'good',
      reason: 'Keine aktiven Fehlercodes',
      source: 'dtc_poll',
    }),
    service_compliance: makeModuleHealth({ source: 'service_compliance' }),
    complaints: makeModuleHealth({
      state: 'good',
      reason: 'Keine aktiven technischen Beobachtungen',
      source: 'complaints',
      last_updated_at: null,
    }),
    vehicle_alerts: makeModuleHealth({ source: 'hm_oem' }),
    ...modulePatches,
  };

  return {
    vehicle_id: VEHICLE_ID,
    organization_id: ORG_ID,
    overall_state: 'good',
    availability: 'ready',
    rental_blocked: false,
    blocking_reasons: [],
    generated_at: new Date().toISOString(),
    ...restOverrides,
    modules,
  };
}

function makeVehicleRow() {
  return {
    id: VEHICLE_ID,
    organizationId: ORG_ID,
    licensePlate: 'WOB-L 7503',
    vehicleName: 'Fleet Tiguan',
    make: 'VW',
    model: 'Tiguan',
    year: 2021,
    lastTuvDate: minutesAgo(60 * 24 * 30),
    nextTuvDate: new Date(Date.now() + 180 * 24 * 3_600_000),
    lastBokraftDate: minutesAgo(60 * 24 * 30),
    nextBokraftDate: new Date(Date.now() + 180 * 24 * 3_600_000),
    lastServiceDate: minutesAgo(60 * 24 * 14),
    lastServiceOdometerKm: 50120,
  };
}

describe('AiGetVehicleHealthSummaryTool', () => {
  let prisma: { vehicle: { findFirst: jest.Mock }; orgDataAuthorization: { findFirst: jest.Mock } };
  let rentalHealth: { getVehicleHealth: jest.Mock };
  let serviceCompliance: { evaluateCompliance: jest.Mock };
  let damages: { getStats: jest.Mock };
  let tasks: { getTasksForVehicle: jest.Mock };
  let vehicleScopeResolver: AiVehicleScopeResolver;
  let tool: AiGetVehicleHealthSummaryTool;

  beforeEach(() => {
    prisma = {
      vehicle: { findFirst: jest.fn().mockResolvedValue(makeVehicleRow()) },
      orgDataAuthorization: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          expiresAt: null,
          revokedAt: null,
        }),
      },
    };
    rentalHealth = { getVehicleHealth: jest.fn() };
    serviceCompliance = { evaluateCompliance: jest.fn() };
    damages = { getStats: jest.fn().mockResolvedValue({
      total: 0,
      open: 0,
      inRepair: 0,
      repaired: 0,
      archived: 0,
      active: 0,
      blockingRental: 0,
      safetyCritical: 0,
      missingEvidence: 0,
      unplaced: 0,
      estimatedOpenCostCents: 0,
      oldestOpenDamageAt: null,
    }) };
    tasks = { getTasksForVehicle: jest.fn().mockResolvedValue({ data: [], meta: { limit: 50, nextCursor: null } }) };
    vehicleScopeResolver = {
      findVehicleInOrganization: jest.fn(async (vehicleId, organizationId) => {
        if (vehicleId !== VEHICLE_ID || organizationId !== ORG_ID) return null;
        return { id: VEHICLE_ID, organizationId: ORG_ID, currentStationId: STATION_ID };
      }),
    };
    tool = new AiGetVehicleHealthSummaryTool(
      prisma as never,
      rentalHealth as unknown as RentalHealthService,
      serviceCompliance as unknown as ServiceComplianceService,
      damages as unknown as DamagesService,
      tasks as unknown as TasksService,
      vehicleScopeResolver as never,
    );
  });

  it('returns fully unremarkable health summary', async () => {
    rentalHealth.getVehicleHealth.mockResolvedValue(makeVehicleHealth());
    serviceCompliance.evaluateCompliance.mockResolvedValue({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        distanceToNextServiceKm: 12000,
        timeToNextServiceDays: 120,
        lastUpdatedAt: minutesAgo(30).toISOString(),
        serviceSourceLabel: 'HM OEM',
        severity: 'GOOD',
        blocksRental: false,
        title: 'Nächster Service',
        description: 'Service in Ordnung',
        message: 'Service in Ordnung',
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: null,
      },
      tuvBokraft: {
        tuvValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        tuvRemainingMonths: 6,
        tuvRemainingDays: 180,
        tuvOverdue: false,
        tuvLastDate: minutesAgo(60 * 24 * 365).toISOString(),
        bokraftValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        bokraftRemainingMonths: 6,
        bokraftRemainingDays: 180,
        bokraftOverdue: false,
        bokraftLastDate: minutesAgo(60 * 24 * 365).toISOString(),
      },
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.errors).toHaveLength(0);
    expect(outcome.data?.overallStatus).toBe('good');
    expect(outcome.data?.rentalBlocked).toBe(false);
    expect(outcome.data?.domains.dtcs.warnings).toContain(
      'no_active_dtcs_does_not_imply_overall_health',
    );
    expect(outcome.allowLlmInference).toBe(true);
  });

  it('does not treat missing data as healthy when modules are unknown', async () => {
    rentalHealth.getVehicleHealth.mockResolvedValue(
      makeVehicleHealth(
        { overall_state: 'unknown' },
        {
          battery: makeModuleHealth({
            state: 'unknown',
            reason: 'Keine Batteriedaten',
            data_stale: true,
          }),
        },
      ),
    );
    serviceCompliance.evaluateCompliance.mockResolvedValue({
      nextService: {
        trackingStatus: 'NO_TRACKING',
        source: null,
        distanceToNextServiceKm: null,
        timeToNextServiceDays: null,
        lastUpdatedAt: null,
        serviceSourceLabel: null,
        severity: 'INFO',
        blocksRental: false,
        title: 'Kein Service-Tracking',
        description: 'Kein OEM-Service-Tracking',
        message: 'Kein OEM-Service-Tracking',
        hmDistanceFromOem: false,
        hmTimeFromOem: false,
        hmDerivedDueDate: null,
      },
      tuvBokraft: {
        tuvValidTill: null,
        tuvRemainingMonths: null,
        tuvRemainingDays: null,
        tuvOverdue: false,
        tuvLastDate: null,
        bokraftValidTill: null,
        bokraftRemainingMonths: null,
        bokraftRemainingDays: null,
        bokraftOverdue: false,
        bokraftLastDate: null,
      },
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data?.overallStatus).toBe('unknown');
    expect(outcome.data?.limitedData).toBe(true);
    expect(outcome.data?.domains.battery.availability).toBe('partial');
    expect(outcome.data?.domains.service.warnings).toContain('service_not_tracked');
  });

  it('reports critical DTC without implying overall health', async () => {
    rentalHealth.getVehicleHealth.mockResolvedValue(
      makeVehicleHealth(
        {
          overall_state: 'critical',
          rental_blocked: true,
          blocking_reasons: ['Fehlercodes: 1 aktive Fehlercodes — sicherheitsrelevant'],
        },
        {
          error_codes: makeModuleHealth({
            state: 'critical',
            reason: '1 aktive Fehlercodes — sicherheitsrelevant',
          }),
        },
      ),
    );
    serviceCompliance.evaluateCompliance.mockResolvedValue({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        severity: 'GOOD',
        blocksRental: false,
        title: 'Service',
        description: 'OK',
        message: 'OK',
        lastUpdatedAt: minutesAgo(2).toISOString(),
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: null,
      },
      tuvBokraft: {
        tuvValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        tuvRemainingDays: 180,
        tuvOverdue: false,
        tuvLastDate: minutesAgo(60 * 24 * 365).toISOString(),
        bokraftValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        bokraftRemainingDays: 180,
        bokraftOverdue: false,
        bokraftLastDate: minutesAgo(60 * 24 * 365).toISOString(),
      },
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data?.domains.dtcs.status).toBe('critical');
    expect(outcome.data?.domains.dtcs.blocker).toBe(true);
    expect(outcome.data?.overallStatus).toBe('critical');
    expect(outcome.data?.domains.dtcs.warnings).not.toContain(
      'no_active_dtcs_does_not_imply_overall_health',
    );
  });

  it('reports battery warning', async () => {
    rentalHealth.getVehicleHealth.mockResolvedValue(
      makeVehicleHealth(
        { overall_state: 'warning' },
        {
          battery: makeModuleHealth({
            state: 'warning',
            reason: 'Batteriezustand sollte geprüft werden',
            source: 'canonical_battery',
          }),
        },
      ),
    );
    serviceCompliance.evaluateCompliance.mockResolvedValue({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        severity: 'GOOD',
        blocksRental: false,
        title: 'Service',
        description: 'OK',
        message: 'OK',
        lastUpdatedAt: minutesAgo(2).toISOString(),
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: null,
      },
      tuvBokraft: {
        tuvValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        tuvRemainingDays: 180,
        tuvOverdue: false,
        tuvLastDate: minutesAgo(60 * 24 * 365).toISOString(),
        bokraftValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        bokraftRemainingDays: 180,
        bokraftOverdue: false,
        bokraftLastDate: minutesAgo(60 * 24 * 365).toISOString(),
      },
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
    expect(outcome.data?.domains.battery.status).toBe('warning');
    expect(outcome.data?.domains.battery.severity).toBe('warning');
  });

  it('marks stale tire measurement explicitly', async () => {
    rentalHealth.getVehicleHealth.mockResolvedValue(
      makeVehicleHealth(
        { overall_state: 'warning' },
        {
          tires: makeModuleHealth({
            state: 'warning',
            reason: 'Reifenmessung veraltet',
            data_stale: true,
            last_updated_at: hoursAgo(72).toISOString(),
          }),
        },
      ),
    );
    serviceCompliance.evaluateCompliance.mockResolvedValue({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        severity: 'GOOD',
        blocksRental: false,
        title: 'Service',
        description: 'OK',
        message: 'OK',
        lastUpdatedAt: minutesAgo(2).toISOString(),
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: null,
      },
      tuvBokraft: {
        tuvValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        tuvRemainingDays: 180,
        tuvOverdue: false,
        tuvLastDate: minutesAgo(60 * 24 * 365).toISOString(),
        bokraftValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        bokraftRemainingDays: 180,
        bokraftOverdue: false,
        bokraftLastDate: minutesAgo(60 * 24 * 365).toISOString(),
      },
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
    expect(outcome.data?.domains.tires.isHistorical).toBe(true);
    expect(outcome.data?.domains.tires.freshness).toBe('offline');
    expect(outcome.data?.domains.tires.availability).toBe('partial');
  });

  it('reports active technical observation as blocker', async () => {
    rentalHealth.getVehicleHealth.mockResolvedValue(
      makeVehicleHealth(
        {
          overall_state: 'critical',
          rental_blocked: true,
          blocking_reasons: ['Technische Beobachtung blockiert Vermietung'],
        },
        {
          complaints: makeModuleHealth({
            state: 'critical',
            reason: 'Offene technische Beobachtung blockiert Vermietung',
            last_updated_at: minutesAgo(10).toISOString(),
          }),
        },
      ),
    );
    serviceCompliance.evaluateCompliance.mockResolvedValue({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        severity: 'GOOD',
        blocksRental: false,
        title: 'Service',
        description: 'OK',
        message: 'OK',
        lastUpdatedAt: minutesAgo(2).toISOString(),
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: null,
      },
      tuvBokraft: {
        tuvValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        tuvRemainingDays: 180,
        tuvOverdue: false,
        tuvLastDate: minutesAgo(60 * 24 * 365).toISOString(),
        bokraftValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        bokraftRemainingDays: 180,
        bokraftOverdue: false,
        bokraftLastDate: minutesAgo(60 * 24 * 365).toISOString(),
      },
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
    expect(outcome.data?.domains.technicalObservations.blocker).toBe(true);
    expect(outcome.data?.readyToRentBlockers).toContain(
      'Technische Beobachtung blockiert Vermietung',
    );
  });

  it('reports overdue service', async () => {
    rentalHealth.getVehicleHealth.mockResolvedValue(
      makeVehicleHealth(
        {
          overall_state: 'critical',
          rental_blocked: true,
          blocking_reasons: ['Service überfällig'],
        },
        {
          service_compliance: makeModuleHealth({
            state: 'critical',
            reason: 'Service überfällig',
          }),
        },
      ),
    );
    serviceCompliance.evaluateCompliance.mockResolvedValue({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        severity: 'CRITICAL',
        blocksRental: true,
        title: 'Service überfällig',
        description: 'Service überfällig',
        message: 'Service überfällig',
        lastUpdatedAt: hoursAgo(30).toISOString(),
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: null,
      },
      tuvBokraft: {
        tuvValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        tuvRemainingDays: 180,
        tuvOverdue: false,
        tuvLastDate: minutesAgo(60 * 24 * 365).toISOString(),
        bokraftValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        bokraftRemainingDays: 180,
        bokraftOverdue: false,
        bokraftLastDate: minutesAgo(60 * 24 * 365).toISOString(),
      },
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
    expect(outcome.data?.domains.service.status).toBe('critical');
    expect(outcome.data?.domains.service.blocker).toBe(true);
  });

  it('reports no supported telemetry data as limited coverage', async () => {
    rentalHealth.getVehicleHealth.mockResolvedValue(
      makeVehicleHealth(
        {
          overall_state: 'unknown',
          availability: 'unavailable',
          rental_blocked: null,
        },
        {
          battery: makeModuleHealth({ state: 'n_a', reason: 'Nicht unterstützt' }),
          tires: makeModuleHealth({ state: 'n_a', reason: 'Nicht unterstützt' }),
          brakes: makeModuleHealth({ state: 'n_a', reason: 'Nicht unterstützt' }),
          error_codes: makeModuleHealth({ state: 'unknown', reason: 'Keine DTC-Daten' }),
          service_compliance: makeModuleHealth({
            state: 'unknown',
            reason: 'Keine Compliance-Daten',
          }),
          complaints: makeModuleHealth({ state: 'good', reason: 'Keine Beobachtungen' }),
          vehicle_alerts: makeModuleHealth({ state: 'n_a', reason: 'Nicht unterstützt' }),
        },
      ),
    );
    serviceCompliance.evaluateCompliance.mockResolvedValue({
      nextService: {
        trackingStatus: 'NO_TRACKING',
        source: null,
        severity: 'INFO',
        blocksRental: false,
        title: 'Kein Tracking',
        description: 'Kein OEM',
        message: 'Kein OEM',
        lastUpdatedAt: null,
        hmDistanceFromOem: false,
        hmTimeFromOem: false,
        hmDerivedDueDate: null,
      },
      tuvBokraft: {
        tuvValidTill: null,
        tuvRemainingMonths: null,
        tuvRemainingDays: null,
        tuvOverdue: false,
        tuvLastDate: null,
        bokraftValidTill: null,
        bokraftRemainingMonths: null,
        bokraftRemainingDays: null,
        bokraftOverdue: false,
        bokraftLastDate: null,
      },
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
    expect(outcome.data?.pipelineAvailability).toBe('unavailable');
    expect(outcome.data?.limitedData).toBe(true);
    expect(outcome.data?.domains.battery.status).toBe('n_a');
  });

  it('returns provider timeout as partial when rental health fails', async () => {
    rentalHealth.getVehicleHealth.mockRejectedValue(new Error('ETIMEDOUT timeout'));
    serviceCompliance.evaluateCompliance.mockResolvedValue({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        severity: 'GOOD',
        blocksRental: false,
        title: 'Service',
        description: 'OK',
        message: 'OK',
        lastUpdatedAt: minutesAgo(2).toISOString(),
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: null,
      },
      tuvBokraft: {
        tuvValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        tuvRemainingDays: 180,
        tuvOverdue: false,
        tuvLastDate: minutesAgo(60 * 24 * 365).toISOString(),
        bokraftValidTill: new Date(Date.now() + 180 * 24 * 3_600_000).toISOString(),
        bokraftRemainingDays: 180,
        bokraftOverdue: false,
        bokraftLastDate: minutesAgo(60 * 24 * 365).toISOString(),
      },
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
    expect(outcome.errors[0]?.code).toBe('timeout');
    expect(outcome.data).toBeNull();
  });

  it('blocks without fleet-condition permission', async () => {
    const outcome = await tool.execute(
      buildContext({
        permissions: {
          fleet: { read: true, write: false },
          'ai-assistant': { read: true, write: false },
        },
      }),
      { vehicleId: VEHICLE_ID },
    );

    expect(outcome.data).toBeNull();
    expect(outcome.errors[0]?.code).toBe('permission_denied');
  });
});
