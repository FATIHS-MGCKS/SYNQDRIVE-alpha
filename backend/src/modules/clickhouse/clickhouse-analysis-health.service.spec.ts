import { ConfigService } from '@nestjs/config';
import { ClickHouseAnalysisHealthService } from './clickhouse-analysis-health.service';
import { ClickHouseService } from './clickhouse.service';

function makeClickHouse(overrides: Partial<ClickHouseService> = {}) {
  return {
    getStatus: jest.fn().mockReturnValue({
      configured: true,
      available: true,
      status: 'available',
      lastError: null,
      lastPingAt: '2026-07-16T10:00:00.000Z',
    }),
    getCircuitSnapshot: jest.fn().mockReturnValue({
      state: 'closed',
      consecutiveFailures: 0,
      openedAt: null,
      lastFailureAt: null,
      lastSuccessAt: null,
    }),
    ...overrides,
  } as unknown as ClickHouseService;
}

describe('ClickHouseAnalysisHealthService', () => {
  it('reports available when configured and reachable', () => {
    const service = new ClickHouseAnalysisHealthService(
      makeClickHouse(),
      new ConfigService({ CLICKHOUSE_ANALYSIS_TIMEOUT_WINDOW_MS: '60000' }),
    );
    expect(service.getAnalysisHealth().status).toBe('available');
  });

  it('reports circuit_open when breaker is open', () => {
    const service = new ClickHouseAnalysisHealthService(
      makeClickHouse({
        getCircuitSnapshot: jest.fn().mockReturnValue({
          state: 'open',
          consecutiveFailures: 3,
          openedAt: '2026-07-16T10:00:00.000Z',
          lastFailureAt: '2026-07-16T10:00:00.000Z',
          lastSuccessAt: null,
        }),
      }),
      new ConfigService({}),
    );
    expect(service.getAnalysisHealth().status).toBe('circuit_open');
  });

  it('detects recovery transition', () => {
    const service = new ClickHouseAnalysisHealthService(
      makeClickHouse(),
      new ConfigService({}),
    );
    const before = {
      status: 'degraded' as const,
      configured: true,
      reachable: false,
      circuitState: 'closed' as const,
      lastError: 'down',
      lastPingAt: null,
    };
    const after = service.getAnalysisHealth();
    expect(service.wasRecentlyRecovered(before, after)).toBe(true);
  });
});
