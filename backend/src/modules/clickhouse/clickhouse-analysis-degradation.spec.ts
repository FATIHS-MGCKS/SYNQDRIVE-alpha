import {
  canProceedAnalysisStage,
  resolveHfAssessabilityDegradation,
} from './clickhouse-analysis-degradation';
import type { ClickHouseAnalysisHealth } from './clickhouse-analysis-degradation.types';

function health(
  overrides: Partial<ClickHouseAnalysisHealth>,
): ClickHouseAnalysisHealth {
  return {
    status: 'available',
    configured: true,
    reachable: true,
    circuitState: 'closed',
    lastError: null,
    lastPingAt: null,
    ...overrides,
  };
}

describe('clickhouse-analysis-degradation', () => {
  it('returns null degradation when ClickHouse is reachable', () => {
    expect(resolveHfAssessabilityDegradation(health({}))).toBeNull();
  });

  it('maps circuit open to PROVIDER_ERROR', () => {
    const degradation = resolveHfAssessabilityDegradation(
      health({ status: 'circuit_open', reachable: false }),
    );
    expect(degradation?.assessabilityStatus).toBe('PROVIDER_ERROR');
    expect(degradation?.providerError).toBe(true);
  });

  it('maps disabled ClickHouse to INSUFFICIENT_DATA', () => {
    const degradation = resolveHfAssessabilityDegradation(
      health({ status: 'disabled', configured: false, reachable: false }),
    );
    expect(degradation?.assessabilityStatus).toBe('INSUFFICIENT_DATA');
    expect(degradation?.providerError).toBe(false);
  });

  it('allows native events and route stages when ClickHouse is down', () => {
    const degraded = health({ status: 'degraded', reachable: false });
    expect(canProceedAnalysisStage('NATIVE_EVENTS', degraded).proceed).toBe(true);
    expect(canProceedAnalysisStage('ROUTE', degraded).proceed).toBe(true);
    expect(canProceedAnalysisStage('ASSESSABILITY', degraded).proceed).toBe(true);
    expect(canProceedAnalysisStage('ASSESSABILITY', degraded).degradation).not.toBeNull();
  });
});
