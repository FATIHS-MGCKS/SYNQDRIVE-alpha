export type ClickHouseCircuitState = 'closed' | 'open' | 'half_open';

export type ClickHouseCircuitBreakerConfig = {
  failureThreshold: number;
  cooldownMs: number;
};

export type ClickHouseCircuitSnapshot = {
  state: ClickHouseCircuitState;
  consecutiveFailures: number;
  openedAt: string | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
};

const DEFAULT_CONFIG: ClickHouseCircuitBreakerConfig = {
  failureThreshold: 3,
  cooldownMs: 30_000,
};

/**
 * Lightweight in-process circuit breaker for ClickHouse analysis reads.
 * Complements periodic health pings — fast-fail while CH is known down.
 */
export class ClickHouseCircuitBreaker {
  private state: ClickHouseCircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt: Date | null = null;
  private lastFailureAt: Date | null = null;
  private lastSuccessAt: Date | null = null;

  constructor(private readonly config: ClickHouseCircuitBreakerConfig = DEFAULT_CONFIG) {}

  getSnapshot(now = Date.now()): ClickHouseCircuitSnapshot {
    this.maybeTransitionToHalfOpen(now);
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt?.toISOString() ?? null,
      lastFailureAt: this.lastFailureAt?.toISOString() ?? null,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
    };
  }

  canExecute(now = Date.now()): boolean {
    this.maybeTransitionToHalfOpen(now);
    return this.state !== 'open';
  }

  recordSuccess(now = Date.now()): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.lastSuccessAt = new Date(now);
  }

  recordFailure(now = Date.now()): void {
    this.consecutiveFailures += 1;
    this.lastFailureAt = new Date(now);

    if (this.state === 'half_open') {
      this.openCircuit(now);
      return;
    }

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.openCircuit(now);
    }
  }

  private openCircuit(now: number): void {
    this.state = 'open';
    this.openedAt = new Date(now);
  }

  private maybeTransitionToHalfOpen(now: number): void {
    if (this.state !== 'open' || !this.openedAt) return;
    if (now - this.openedAt.getTime() >= this.config.cooldownMs) {
      this.state = 'half_open';
    }
  }
}
