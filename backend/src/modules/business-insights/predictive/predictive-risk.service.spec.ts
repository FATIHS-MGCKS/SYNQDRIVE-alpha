import { PredictiveFeatureLoader } from './predictive-feature.loader';
import { PredictiveRiskLoader } from './predictive-risk.loader';
import { PredictiveRiskRepository } from './predictive-risk.repository';
import { PredictiveRiskService } from './predictive-risk.service';

describe('PredictiveRiskService', () => {
  const featureLoader = {
    loadOrganizationTimezone: jest.fn(),
  } as unknown as jest.Mocked<PredictiveFeatureLoader>;

  const riskLoader = {
    loadFleetInput: jest.fn(),
  } as unknown as jest.Mocked<PredictiveRiskLoader>;

  const repository = {
    createRun: jest.fn(),
    completeRun: jest.fn(),
    upsertForecast: jest.fn(),
    listForecasts: jest.fn(),
    getLatestRun: jest.fn(),
  } as unknown as jest.Mocked<PredictiveRiskRepository>;

  const service = new PredictiveRiskService(featureLoader, riskLoader, repository);

  const fleetInput = {
    organizationId: 'org-a',
    asOfDate: '2026-02-04',
    timezone: 'Europe/Berlin',
    horizonDays: 30 as const,
    fleetVehicleCount: 10,
    vehicles: Array.from({ length: 10 }, (_, i) => ({
      vehicleId: `v${i + 1}`,
      vehicleClassId: null,
      modelYear: 2020,
      odometerKm: 40_000,
      tireCondition: 'good' as const,
      brakeCondition: 'good' as const,
      batteryCondition: 'unknown' as const,
      activeSafetyDtcCount: 0,
      serviceOverdue: false,
      telemetryDataAvailable: false,
      hasHealthSignal: true,
    })),
    serviceCases: Array.from({ length: 12 }, (_, i) => ({
      id: `sc-${i}`,
      vehicleId: 'v1',
      category: 'REPAIR',
      openedAt: '2025-06-01T10:00:00.000Z',
      completedAt: '2025-06-02T10:00:00.000Z',
      actualCostCents: 20_000,
      downtimeStart: null,
      downtimeEnd: null,
      blocksRental: true,
      isUnplanned: true,
    })),
    maintenanceCostSeries: Array.from({ length: 100 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 9, 1 + i)).toISOString().slice(0, 10),
      value: 5000,
    })),
    downtimeMinutesSeries: Array.from({ length: 70 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 10, 1 + i)).toISOString().slice(0, 10),
      value: 40,
    })),
    scheduledCasesInHorizon: 1,
    scheduledDowntimeMinutesInHorizon: 120,
    healthCoveragePercent: 80,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    featureLoader.loadOrganizationTimezone.mockResolvedValue('Europe/Berlin');
    riskLoader.loadFleetInput.mockResolvedValue(fleetInput);
    repository.createRun.mockResolvedValue({
      id: 'run-risk-1',
      organizationId: 'org-a',
      featureSetVersion: 'feature-store-v1',
      asOfDate: '2026-02-04',
      status: 'PARTIAL',
      forecastsWritten: 0,
      errorMessage: null,
      trigger: 'test',
      startedAt: new Date(),
      completedAt: null,
    });
    repository.upsertForecast.mockResolvedValue({} as never);
    repository.completeRun.mockResolvedValue({} as never);
  });

  it('writes five risk forecasts per horizon with safety metadata', async () => {
    const result = await service.runForecasts({
      organizationId: 'org-a',
      asOfDate: '2026-02-04',
      horizons: [30],
      trigger: 'test',
    });
    expect(result.forecastsWritten).toBe(5);
    expect(repository.upsertForecast).toHaveBeenCalledTimes(5);
    const upsertArg = repository.upsertForecast.mock.calls[0][0];
    expect(upsertArg.safetyBoundaries).toBeDefined();
    expect(upsertArg.organization.connect?.id).toBe('org-a');
  });

  it('scopes risk loader to organization', async () => {
    await service.runForecasts({ organizationId: 'org-b', asOfDate: '2026-02-04', horizons: [30] });
    expect(riskLoader.loadFleetInput).toHaveBeenCalledWith(
      'org-b',
      '2026-02-04',
      'Europe/Berlin',
      30,
    );
  });
});
