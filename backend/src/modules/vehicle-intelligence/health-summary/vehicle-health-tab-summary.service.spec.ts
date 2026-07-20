import * as fs from 'fs';
import * as path from 'path';
import { VehicleHealthTabSummaryService } from './vehicle-health-tab-summary.service';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import type { DashboardWarningLightsResponse } from '../dashboard-warning-lights/dashboard-warning-lights.types';

function baseModule(state: VehicleHealth['modules']['battery']['state'] = 'good') {
  return {
    state,
    reason: `${state} reason`,
    last_updated_at: '2026-06-16T10:00:00.000Z',
    data_stale: false,
  };
}

function rentalHealth(overall: VehicleHealth['overall_state']): VehicleHealth {
  return {
    vehicle_id: 'veh-1',
    organization_id: 'org-1',
    overall_state: overall,
    rental_blocked: overall === 'critical',
    blocking_reasons: overall === 'critical' ? ['Battery critical'] : [],
    modules: {
      battery: baseModule(overall === 'critical' ? 'critical' : 'good'),
      tires: baseModule('good'),
      brakes: baseModule('good'),
      error_codes: baseModule('good'),
      service_compliance: baseModule('good'),
      complaints: baseModule('good'),
      vehicle_alerts: baseModule('good'),
    },
    generated_at: '2026-06-16T10:00:00.000Z',
  };
}

describe('VehicleHealthTabSummaryService', () => {
  const rentalHealthSvc = { getVehicleHealth: jest.fn() };
  const prisma = {
    vehicle: { findUnique: jest.fn().mockResolvedValue({ dimoVehicle: null }) },
    vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const aiHealthCare = { getAiHealthCare: jest.fn().mockResolvedValue({ summaryText: 'ok' }) };
  const dashboardWarningLights = { getDashboardWarningLights: jest.fn() };
  const serviceCompliance = { evaluateCompliance: jest.fn() };
  const dtc = { getStats: jest.fn().mockResolvedValue({ lastChecked: new Date().toISOString() }) };
  const hm = { isHmHealthActive: jest.fn().mockResolvedValue(false) };

  const svc = new VehicleHealthTabSummaryService(
    rentalHealthSvc as any,
    prisma as any,
    aiHealthCare as any,
    dashboardWarningLights as any,
    serviceCompliance as any,
    dtc as any,
    hm as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-16T12:00:00.000Z'));

    dashboardWarningLights.getDashboardWarningLights.mockResolvedValue({
      vehicleId: 'veh-1',
      provider: 'NONE',
      connectionStatus: 'not_connected',
      supportStatus: 'not_connected',
      freshness: 'no_data',
      overallStatus: 'unknown',
      lights: [],
    } satisfies Partial<DashboardWarningLightsResponse>);

    prisma.vehicle.findUnique.mockResolvedValue({
      nextTuvDate: null,
      nextBokraftDate: null,
      lastTuvDate: null,
      lastBokraftDate: null,
    });

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
        title: 'No Tracking',
        description: 'No HM/OEM tracking',
        message: 'No HM/OEM tracking',
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('RentalHealth critical => summary critical', async () => {
    rentalHealthSvc.getVehicleHealth.mockResolvedValue(rentalHealth('critical'));
    const res = await svc.getSummary('org-1', 'veh-1');
    expect(res.overall.state).toBe('critical');
    expect(res.sourceStatus.rentalHealth).toBe('loaded');
  });

  it('RentalHealth warning => summary warning', async () => {
    const rh = rentalHealth('warning');
    rh.modules.tires = baseModule('warning');
    rentalHealthSvc.getVehicleHealth.mockResolvedValue(rh);
    const res = await svc.getSummary('org-1', 'veh-1');
    expect(res.overall.state).toBe('warning');
  });

  it('RentalHealth good => summary good', async () => {
    rentalHealthSvc.getVehicleHealth.mockResolvedValue(rentalHealth('good'));
    const res = await svc.getSummary('org-1', 'veh-1');
    expect(res.overall.state).toBe('good');
  });

  it('RentalHealth unknown => summary unknown', async () => {
    const rh = rentalHealth('unknown');
    rh.modules.battery = baseModule('unknown');
    rentalHealthSvc.getVehicleHealth.mockResolvedValue(rh);
    const res = await svc.getSummary('org-1', 'veh-1');
    expect(res.overall.state).toBe('unknown');
  });

  it('RentalHealth endpoint error => summary unknown + degradedDependency', async () => {
    rentalHealthSvc.getVehicleHealth.mockRejectedValue(new Error('boom'));
    const res = await svc.getSummary('org-1', 'veh-1');
    expect(res.overall.state).toBe('unknown');
    expect(res.overall.headline).toBe('Health status unavailable');
    expect(res.sourceStatus.rentalHealth).toBe('endpoint_error');
    expect(res.degradedDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'rental_health', status: 'endpoint_error' }),
      ]),
    );
    expect(res.dataQuality.level).toBe('unknown');
  });

  it('HM critical indicator does not override RentalHealth good overall', async () => {
    rentalHealthSvc.getVehicleHealth.mockResolvedValue(rentalHealth('good'));
    dashboardWarningLights.getDashboardWarningLights.mockResolvedValue({
      vehicleId: 'veh-1',
      provider: 'HIGH_MOBILITY',
      connectionStatus: 'connected',
      supportStatus: 'supported',
      freshness: 'fresh',
      overallStatus: 'critical',
      lights: [
        {
          key: 'engine_limp_mode',
          label: 'Limp mode',
          state: 'active',
          severity: 'critical',
          supported: true,
          observedAt: '2026-06-16T11:00:00.000Z',
          sourceSignal: 'engine.get.limp_mode',
          sourceTimestamp: '2026-06-16T11:00:00.000Z',
          reason: 'Limp mode active',
          action: 'Inspect',
          rentalImpact: 'block_rental',
        },
      ],
    });

    const res = await svc.getSummary('org-1', 'veh-1');
    expect(res.overall.state).toBe('good');
    expect(res.oemIndicators?.indicators.some((i) => i.key === 'engine_limp_mode')).toBe(true);
    expect(res.findings.some((f) => f.module === 'oem_hm')).toBe(true);
  });

  it('dataQuality high when rental loaded and few weak modules', async () => {
    rentalHealthSvc.getVehicleHealth.mockResolvedValue(rentalHealth('good'));
    const res = await svc.getSummary('org-1', 'veh-1');
    expect(res.dataQuality.level).toBe('high');
  });

  it('dataQuality low when many weak modules', async () => {
    const rh = rentalHealth('unknown');
    rh.modules.battery = baseModule('unknown');
    rh.modules.tires = baseModule('unknown');
    rh.modules.brakes = baseModule('unknown');
    rh.modules.error_codes = baseModule('unknown');
    rentalHealthSvc.getVehicleHealth.mockResolvedValue(rh);
    const res = await svc.getSummary('org-1', 'veh-1');
    expect(res.dataQuality.level).toBe('low');
  });

  it('next service shows No Tracking when HM/OEM missing', async () => {
    rentalHealthSvc.getVehicleHealth.mockResolvedValue(rentalHealth('good'));
    const res = await svc.getSummary('org-1', 'veh-1');
    expect(res.nextService?.displayLine).toBe('No Tracking');
    expect(res.moduleStates.service_compliance?.state).toBe('no_tracking');
    expect(res.moduleStates.service_compliance?.label).toBe('Next Service: No Tracking');
    expect(res.moduleStates.service_compliance?.nextService).toBeNull();
  });

  it('manufacturer interval metadata does not affect summary next service', async () => {
    rentalHealthSvc.getVehicleHealth.mockResolvedValue(rentalHealth('good'));
    serviceCompliance.evaluateCompliance.mockResolvedValueOnce({
      nextService: {
        trackingStatus: 'NO_TRACKING',
        source: null,
        distanceToNextServiceKm: null,
        timeToNextServiceDays: null,
        lastUpdatedAt: null,
        serviceSourceLabel: null,
        severity: 'INFO',
        blocksRental: false,
        title: 'No Tracking',
        description: 'No HM/OEM tracking',
        message: 'No HM/OEM tracking',
        hmDistanceFromOem: false,
        hmTimeFromOem: false,
        hmDerivedDueDate: null,
      },
      tuvBokraft: {
        tuvValidTill: '2027-01-01T00:00:00.000Z',
        tuvRemainingMonths: 6,
        tuvRemainingDays: 180,
        tuvOverdue: false,
        tuvLastDate: null,
        bokraftValidTill: null,
        bokraftRemainingMonths: null,
        bokraftRemainingDays: null,
        bokraftOverdue: false,
        bokraftLastDate: null,
      },
    });

    const res = await svc.getSummary('org-1', 'veh-1');
    expect(res.moduleStates.service_compliance?.nextService).toBeNull();
    expect(res.moduleStates.service_compliance?.label).toBe('Next Service: No Tracking');
    expect(res.moduleStates.service_compliance?.tuev?.state).toBe('good');
    expect(serviceCompliance.evaluateCompliance).toHaveBeenCalled();
  });

  it('next service shows days/km/both from HM/OEM', async () => {
    rentalHealthSvc.getVehicleHealth.mockResolvedValue(rentalHealth('good'));

    serviceCompliance.evaluateCompliance.mockResolvedValueOnce({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        distanceToNextServiceKm: 12000,
        timeToNextServiceDays: 90,
        lastUpdatedAt: '2026-06-16T10:00:00.000Z',
        serviceSourceLabel: 'HM',
        severity: 'GOOD',
        blocksRental: false,
        title: 'Next service',
        description: 'Tracked',
        message: 'Tracked',
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
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
    let res = await svc.getSummary('org-1', 'veh-1');
    expect(res.nextService?.displayLine).toBe('90 days / 12000 km');
    expect(res.moduleStates.service_compliance?.label).toBe('Next Service: 90 days / 12000 km');
    expect(res.moduleStates.service_compliance?.nextService).toEqual({
      source: 'hm_oem',
      daysRemaining: 90,
      kmRemaining: 12000,
    });

    serviceCompliance.evaluateCompliance.mockResolvedValueOnce({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        distanceToNextServiceKm: null,
        timeToNextServiceDays: 45,
        lastUpdatedAt: '2026-06-16T10:00:00.000Z',
        serviceSourceLabel: 'HM',
        severity: 'GOOD',
        blocksRental: false,
        title: 'Next service',
        description: 'Tracked',
        message: 'Tracked',
        hmDistanceFromOem: false,
        hmTimeFromOem: true,
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
    res = await svc.getSummary('org-1', 'veh-1');
    expect(res.nextService?.displayLine).toBe('45 days');
    expect(res.moduleStates.service_compliance?.nextService).toEqual({
      source: 'hm_oem',
      daysRemaining: 45,
    });

    serviceCompliance.evaluateCompliance.mockResolvedValueOnce({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        distanceToNextServiceKm: 8000,
        timeToNextServiceDays: null,
        lastUpdatedAt: '2026-06-16T10:00:00.000Z',
        serviceSourceLabel: 'HM',
        severity: 'GOOD',
        blocksRental: false,
        title: 'Next service',
        description: 'Tracked',
        message: 'Tracked',
        hmDistanceFromOem: true,
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
    res = await svc.getSummary('org-1', 'veh-1');
    expect(res.nextService?.displayLine).toBe('8000 km');
    expect(res.moduleStates.service_compliance?.nextService).toEqual({
      source: 'hm_oem',
      kmRemaining: 8000,
    });
  });

  describe('status regression (RentalHealthV1 truth)', () => {
    const moduleScenarios: Array<{
      name: string;
      module: keyof VehicleHealth['modules'];
      state: VehicleHealth['modules']['battery']['state'];
      expectedOverall: 'good' | 'warning' | 'critical' | 'unknown';
      expectedFindingModule?: string;
    }> = [
      { name: 'battery critical', module: 'battery', state: 'critical', expectedOverall: 'critical', expectedFindingModule: 'battery' },
      { name: 'tire warning', module: 'tires', state: 'warning', expectedOverall: 'warning', expectedFindingModule: 'tires' },
      { name: 'brake critical', module: 'brakes', state: 'critical', expectedOverall: 'critical', expectedFindingModule: 'brakes' },
      { name: 'error_codes critical', module: 'error_codes', state: 'critical', expectedOverall: 'critical', expectedFindingModule: 'error_codes' },
      { name: 'service_compliance warning', module: 'service_compliance', state: 'warning', expectedOverall: 'warning', expectedFindingModule: 'service_compliance' },
      { name: 'complaints critical', module: 'complaints', state: 'critical', expectedOverall: 'critical', expectedFindingModule: 'complaints' },
    ];

    it.each(moduleScenarios)(
      '$name => overall $expectedOverall + finding',
      async ({ module, state, expectedOverall, expectedFindingModule }) => {
        const rh = rentalHealth('good');
        rh.modules[module] = baseModule(state);
        rh.overall_state = state === 'critical' ? 'critical' : state === 'warning' ? 'warning' : 'good';
        rentalHealthSvc.getVehicleHealth.mockResolvedValue(rh);

        const res = await svc.getSummary('org-1', 'veh-1');
        expect(res.overall.state).toBe(expectedOverall);
        if (expectedFindingModule) {
          expect(res.findings.some((f) => f.module === expectedFindingModule)).toBe(true);
        }
      },
    );

    it('findings expose targetModalKey for UI navigation', async () => {
      const rh = rentalHealth('warning');
      rh.modules.battery = baseModule('warning');
      rh.modules.error_codes = baseModule('critical');
      rentalHealthSvc.getVehicleHealth.mockResolvedValue(rh);

      const res = await svc.getSummary('org-1', 'veh-1');
      const batteryFinding = res.findings.find((f) => f.module === 'battery');
      const dtcFinding = res.findings.find((f) => f.module === 'error_codes');
      expect(batteryFinding?.targetModalKey).toBe('battery');
      expect(dtcFinding?.targetModalKey).toBe('dtc');
    });

    it('uses stable source_finding_id from rental-health source_findings', async () => {
      const stableId = 'a'.repeat(64);
      const rh = rentalHealth('warning');
      rh.modules.tires = {
        ...baseModule('warning'),
        source_findings: [
          {
            finding_code: 'PRESSURE_WARNING',
            source_entity_type: 'rental_reason_code',
            source_entity_id: 'pressure_warning',
            source_finding_id: stableId,
            finding_occurrence_id: 'b'.repeat(64),
            occurrence_generation: 1,
            version: 'health-finding-identity-v1',
            first_observed_at: '2026-06-16T10:00:00.000Z',
            current_observed_at: '2026-06-16T10:00:00.000Z',
            severity: 'warning',
            reason: 'Reifendruck niedrig',
          },
        ],
      };
      rentalHealthSvc.getVehicleHealth.mockResolvedValue(rh);

      const res = await svc.getSummary('org-1', 'veh-1');
      const tireFinding = res.findings.find((f) => f.module === 'tires');
      expect(tireFinding?.id).toBe(stableId);
      expect(tireFinding?.sourceFindingId).toBe(stableId);
      expect(tireFinding?.findingCode).toBe('PRESSURE_WARNING');
    });

    it('DIMO stale reduces dataQuality below high', async () => {
      rentalHealthSvc.getVehicleHealth.mockResolvedValue(rentalHealth('good'));
      const staleDate = new Date('2026-06-01T00:00:00.000Z');
      prisma.vehicle.findUnique.mockResolvedValue({
        nextTuvDate: null,
        nextBokraftDate: null,
        lastTuvDate: null,
        lastBokraftDate: null,
        dimoVehicle: { tokenId: 'token-1' },
      });
      prisma.vehicleLatestState.findUnique.mockResolvedValue({ lastSeenAt: staleDate });

      const res = await svc.getSummary('org-1', 'veh-1');
      expect(res.sourceStatus.dimo).toBe('stale');
      expect(res.dataQuality.level).not.toBe('high');
      expect(res.dataQuality.reasons).toEqual(
        expect.arrayContaining([expect.stringMatching(/DIMO/i)]),
      );
    });

    it('HM no_data does not upgrade RentalHealth good to critical', async () => {
      rentalHealthSvc.getVehicleHealth.mockResolvedValue(rentalHealth('good'));
      dashboardWarningLights.getDashboardWarningLights.mockResolvedValue({
        vehicleId: 'veh-1',
        provider: 'NONE',
        connectionStatus: 'not_connected',
        supportStatus: 'not_connected',
        freshness: 'no_data',
        overallStatus: 'unknown',
        lights: [],
      });

      const res = await svc.getSummary('org-1', 'veh-1');
      expect(res.overall.state).toBe('good');
      expect(res.sourceStatus.highMobility).toBe('not_connected');
    });

    it('aiHealthCare failure sets degradedDependency without changing overall', async () => {
      rentalHealthSvc.getVehicleHealth.mockResolvedValue(rentalHealth('good'));
      aiHealthCare.getAiHealthCare.mockRejectedValue(new Error('ai down'));

      const res = await svc.getSummary('org-1', 'veh-1');
      expect(res.overall.state).toBe('good');
      expect(res.degradedDependencies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'ai_health_care', status: 'endpoint_error' }),
        ]),
      );
    });
  });
});

describe('VehicleIntelligenceController routes', () => {
  it('legacy GET health-summary route is removed', () => {
    const controllerPath = path.join(
      __dirname,
      '..',
      'vehicle-intelligence.controller.ts',
    );
    const src = fs.readFileSync(controllerPath, 'utf8');
    expect(src).not.toMatch(/@Get\('health-summary'\)/);
    expect(src).toMatch(/@Get\('health\/summary'\)/);
  });
});
