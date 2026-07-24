import { Injectable } from '@nestjs/common';

export interface DenySwitchMetricLabels {
  outcome: 'local_apply' | 'propagation_received' | 'propagation_stale' | 'redis_publish_failed' | 'redis_subscribe_error' | 'reconciliation';
  scopeType?: string;
}

@Injectable()
export class DenySwitchMetricsService {
  private propagationLatenciesMs: number[] = [];
  private readonly counters = new Map<string, number>();

  recordPropagationLatency(latencyMs: number): void {
    this.propagationLatenciesMs.push(latencyMs);
    if (this.propagationLatenciesMs.length > 500) {
      this.propagationLatenciesMs = this.propagationLatenciesMs.slice(-500);
    }
  }

  increment(label: DenySwitchMetricLabels): void {
    const key = `${label.outcome}:${label.scopeType ?? 'all'}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  snapshot() {
    const latencies = [...this.propagationLatenciesMs].sort((a, b) => a - b);
    const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : null;
    const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : null;
    const max = latencies.length ? latencies[latencies.length - 1] : null;
    return {
      counters: Object.fromEntries(this.counters),
      propagationLatencyMs: { p50, p95, max, sampleCount: latencies.length },
      targetMaxLatencyMs: 2_000,
    };
  }
}
