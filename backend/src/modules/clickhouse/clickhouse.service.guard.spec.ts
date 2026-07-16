import { ConfigService } from '@nestjs/config';
import { TripMetricsService } from '../observability/trip-metrics.service';
import { ClickHouseService } from './clickhouse.service';
import { ClickHouseQueryTimeoutError } from './clickhouse-query-guard';

function makeMetrics() {
  return {
    clickHouseConfigured: { set: jest.fn() },
    clickHouseAvailable: { set: jest.fn() },
    clickHouseSchemaStatus: { set: jest.fn() },
    clickHouseAnalysisGuard: { inc: jest.fn() },
  } as unknown as TripMetricsService;
}

describe('ClickHouseService guarded analysis queries', () => {
  function createService() {
    const config = new ConfigService({
      CLICKHOUSE_URL: 'http://localhost:8123',
      CLICKHOUSE_ANALYSIS_QUERY_TIMEOUT_MS: '20',
      CLICKHOUSE_CIRCUIT_FAILURE_THRESHOLD: '1',
      CLICKHOUSE_CIRCUIT_COOLDOWN_MS: '30000',
    });
    const metrics = makeMetrics();
    const service = new ClickHouseService(config, metrics);
    (service as any).configured = true;
    (service as any).available = true;
    (service as any).client = {
      query: jest.fn(),
      ping: jest.fn(),
      close: jest.fn(),
    };
    return { service, metrics };
  }

  it('returns result when query is reachable', async () => {
    const { service, metrics } = createService();
    const result = await service.runGuardedAnalysisQuery('test_scope', async () => 'ok');
    expect(result).toBe('ok');
    expect(metrics.clickHouseAnalysisGuard.inc).toHaveBeenCalledWith({
      outcome: 'reachable',
      scope: 'test_scope',
    });
  });

  it('returns null and records timeout when query is slow', async () => {
    const { service, metrics } = createService();
    const result = await service.runGuardedAnalysisQuery('slow_scope', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'late';
    });
    expect(result).toBeNull();
    expect(metrics.clickHouseAnalysisGuard.inc).toHaveBeenCalledWith({
      outcome: 'timeout',
      scope: 'slow_scope',
    });
  });

  it('returns null on query error and opens circuit', async () => {
    const { service, metrics } = createService();
    const result = await service.runGuardedAnalysisQuery('error_scope', async () => {
      throw new Error('connection refused');
    });
    expect(result).toBeNull();
    expect(metrics.clickHouseAnalysisGuard.inc).toHaveBeenCalledWith({
      outcome: 'error',
      scope: 'error_scope',
    });
    expect(service.getCircuitSnapshot().state).toBe('open');
  });

  it('returns null immediately when circuit is open', async () => {
    const { service } = createService();
    service.getCircuitSnapshot();
    (service as any).circuitBreaker.recordFailure();
    const fn = jest.fn(async () => 'should-not-run');
    const result = await service.runGuardedAnalysisQuery('blocked_scope', fn);
    expect(result).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('ClickHouseQueryTimeoutError', () => {
  it('has stable code', () => {
    expect(new ClickHouseQueryTimeoutError(10).code).toBe('CLICKHOUSE_QUERY_TIMEOUT');
  });
});
