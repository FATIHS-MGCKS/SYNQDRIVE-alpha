import { ClickHouseCircuitBreaker } from './clickhouse-circuit-breaker';

describe('ClickHouseCircuitBreaker', () => {
  it('opens after consecutive failures', () => {
    const breaker = new ClickHouseCircuitBreaker({ failureThreshold: 2, cooldownMs: 30_000 });
    breaker.recordFailure(1_000);
    expect(breaker.canExecute(1_000)).toBe(true);
    breaker.recordFailure(1_100);
    expect(breaker.getSnapshot(1_100).state).toBe('open');
    expect(breaker.canExecute(1_100)).toBe(false);
  });

  it('transitions to half_open after cooldown and closes on success', () => {
    const breaker = new ClickHouseCircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000 });
    breaker.recordFailure(0);
    expect(breaker.canExecute(500)).toBe(false);
    expect(breaker.canExecute(1_500)).toBe(true);
    expect(breaker.getSnapshot(1_500).state).toBe('half_open');
    breaker.recordSuccess(1_600);
    expect(breaker.getSnapshot(1_600).state).toBe('closed');
  });
});
