import { FORECAST_HORIZONS_DAYS } from '@synq/evaluations-insights/predictive/evaluations-forecast.contract';
import { PredictiveFeatureLoader } from './predictive-feature.loader';
import { PredictiveForecastLoader } from './predictive-forecast.loader';
import { PredictiveForecastRepository } from './predictive-forecast.repository';
import { PredictiveForecastService } from './predictive-forecast.service';

describe('PredictiveForecastService', () => {
  const featureLoader = {
    loadOrganizationTimezone: jest.fn(),
  } as unknown as jest.Mocked<PredictiveFeatureLoader>;

  const forecastLoader = {
    loadSeriesForTarget: jest.fn(),
    targets: jest.fn(),
    horizons: jest.fn(),
  } as unknown as jest.Mocked<PredictiveForecastLoader>;

  const repository = {
    createRun: jest.fn(),
    completeRun: jest.fn(),
    upsertForecast: jest.fn(),
    listForecasts: jest.fn(),
    getLatestRun: jest.fn(),
  } as unknown as jest.Mocked<PredictiveForecastRepository>;

  const service = new PredictiveForecastService(
    featureLoader,
    forecastLoader,
    repository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    featureLoader.loadOrganizationTimezone.mockResolvedValue('Europe/Berlin');
    forecastLoader.targets.mockReturnValue(['DEMAND', 'REVENUE', 'UTILIZATION']);
    forecastLoader.horizons.mockReturnValue([...FORECAST_HORIZONS_DAYS]);
    repository.createRun.mockResolvedValue({
      id: 'run-1',
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

    const series = Array.from({ length: 120 }, (_, i) => {
      const dt = new Date(Date.UTC(2025, 9, 1 + i));
      return { date: dt.toISOString().slice(0, 10), value: 5 + (i % 7) };
    });
    forecastLoader.loadSeriesForTarget.mockResolvedValue(series);
  });

  it('writes forecasts for all targets and horizons with uncertainty intervals', async () => {
    const result = await service.runForecasts({
      organizationId: 'org-a',
      asOfDate: '2026-02-04',
      timezone: 'Europe/Berlin',
      trigger: 'test',
    });

    expect(result.forecastsWritten).toBe(12);
    expect(repository.upsertForecast).toHaveBeenCalledTimes(12);
    const firstUpsert = repository.upsertForecast.mock.calls[0][0];
    expect(firstUpsert.organization.connect?.id).toBe('org-a');
    expect(firstUpsert.intervalLow).toBeLessThanOrEqual(firstUpsert.pointEstimate);
    expect(firstUpsert.intervalHigh).toBeGreaterThanOrEqual(firstUpsert.pointEstimate);
    expect(repository.completeRun).toHaveBeenCalledWith('run-1', {
      status: 'COMPLETED',
      forecastsWritten: 12,
    });
  });

  it('scopes loader calls per organization', async () => {
    await service.runForecasts({
      organizationId: 'org-b',
      asOfDate: '2026-02-04',
      timezone: 'Europe/Berlin',
    });
    expect(forecastLoader.loadSeriesForTarget).toHaveBeenCalledWith(
      'org-b',
      expect.any(String),
      '2026-02-04',
      'fleet',
    );
    expect(repository.createRun.mock.calls[0][0]).toBe('org-b');
  });

  it('marks failed runs and rethrows', async () => {
    forecastLoader.loadSeriesForTarget.mockRejectedValueOnce(new Error('no snapshots'));
    await expect(
      service.runForecasts({
        organizationId: 'org-a',
        asOfDate: '2026-02-04',
        timezone: 'Europe/Berlin',
      }),
    ).rejects.toThrow('no snapshots');
    expect(repository.completeRun).toHaveBeenCalledWith('run-1', {
      status: 'FAILED',
      forecastsWritten: 0,
      errorMessage: 'no snapshots',
    });
  });
});
