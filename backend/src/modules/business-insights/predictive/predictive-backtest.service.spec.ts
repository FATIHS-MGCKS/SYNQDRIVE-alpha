import { PredictiveFeatureLoader } from './predictive-feature.loader';
import { PredictiveBacktestLoader } from './predictive-backtest.loader';
import { PredictiveBacktestRepository } from './predictive-backtest.repository';
import { PredictiveBacktestService } from './predictive-backtest.service';

describe('PredictiveBacktestService', () => {
  const featureLoader = {
    loadOrganizationTimezone: jest.fn(),
  } as unknown as jest.Mocked<PredictiveFeatureLoader>;

  const loader = {
    forecastHorizons: jest.fn(),
    riskHorizons: jest.fn(),
    loadOperationalSeries: jest.fn(),
    buildRiskRegressionFolds: jest.fn(),
    buildRiskClassificationFolds: jest.fn(),
    buildRecentForecastErrors: jest.fn(),
    buildDriftInputSignals: jest.fn(),
  } as unknown as jest.Mocked<PredictiveBacktestLoader>;

  const repository = {
    createRun: jest.fn(),
    completeRun: jest.fn(),
    upsertResult: jest.fn(),
    upsertModelRegistry: jest.fn(),
    saveDriftSnapshot: jest.fn(),
    getRegistryEntry: jest.fn(),
    updateRegistryStatus: jest.fn(),
    listResults: jest.fn(),
    listRegistry: jest.fn(),
    listDriftSnapshots: jest.fn(),
    getLatestBacktestRun: jest.fn(),
  } as unknown as jest.Mocked<PredictiveBacktestRepository>;

  const service = new PredictiveBacktestService(featureLoader, loader, repository);

  const demandSeries = Array.from({ length: 200 }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    value: 10 + (i % 7) * 2,
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    featureLoader.loadOrganizationTimezone.mockResolvedValue('Europe/Berlin');
    loader.forecastHorizons.mockReturnValue([7, 30]);
    loader.riskHorizons.mockReturnValue([30]);
    loader.loadOperationalSeries.mockResolvedValue(demandSeries);
    loader.buildRiskRegressionFolds.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        originDate: `2025-0${i + 1}-01`,
        predicted: 50_000,
        actual: 48_000,
        intervalLow: 40_000,
        intervalHigh: 60_000,
        baselinePredicted: 52_000,
      })),
    );
    loader.buildRiskClassificationFolds.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        originDate: `2025-0${i + 1}-01`,
        predictedProbability: i % 2 === 0 ? 0.7 : 0.3,
        actualPositive: i % 3 === 0,
      })),
    );
    repository.createRun.mockResolvedValue({
      id: 'run-bt-1',
      organizationId: 'org-a',
      modelFamily: 'ALL',
      featureSetVersion: 'feature-store-v1',
      asOfDate: '2026-02-04',
      status: 'PARTIAL',
      modelsEvaluated: 0,
      resultsWritten: 0,
      errorMessage: null,
      trigger: 'test',
      startedAt: new Date(),
      completedAt: null,
    });
    repository.upsertResult.mockResolvedValue({} as never);
    repository.upsertModelRegistry.mockResolvedValue({} as never);
    repository.completeRun.mockResolvedValue({} as never);
  });

  it('runs backtests for operational and risk models per org', async () => {
    const result = await service.runBacktests({
      organizationId: 'org-a',
      asOfDate: '2026-02-04',
      trigger: 'test',
    });
    expect(result.modelsEvaluated).toBeGreaterThan(0);
    expect(result.resultsWritten).toBeGreaterThan(0);
    expect(repository.upsertModelRegistry).toHaveBeenCalled();
    expect(loader.loadOperationalSeries).toHaveBeenCalledWith('org-a', 'DEMAND', '2026-02-04');
  });

  it('rejects approval when release gates not passed', async () => {
    repository.getRegistryEntry.mockResolvedValue({
      id: 'reg-1',
      organizationId: 'org-a',
      modelFamily: 'FORECAST',
      modelKey: 'DEMAND',
      modelVersion: 'demand-baseline-v1.0',
      featureSetVersion: 'feature-store-v1',
      scopeMode: 'ORG_SPECIFIC',
      scopeKey: 'fleet',
      horizonDays: 7,
      status: 'DRAFT',
      backtestMetrics: {},
      releaseGates: [{ passed: false }],
      lastBacktestAt: new Date(),
      lastDriftAt: null,
      approvedAt: null,
      disabledAt: null,
      fallbackModelVersion: null,
      driftSeverity: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.approveModel(
      'org-a',
      'DEMAND',
      'demand-baseline-v1.0',
      7,
    );
    expect(result.approved).toBe(false);
  });

  it('identifies approved models without critical drift', () => {
    expect(service.isModelApproved('APPROVED', 'STABLE')).toBe(true);
    expect(service.isModelApproved('APPROVED', 'CRITICAL')).toBe(false);
    expect(service.isModelApproved('DRAFT', 'STABLE')).toBe(false);
  });
});
