import { Injectable } from '@nestjs/common';

export type TripLocationMetricOutcome =
  | 'allow'
  | 'deny'
  | 'shadow_would_deny'
  | 'skipped'
  | 'scope_mismatch'
  | 'resolver_error';

@Injectable()
export class TripLocationEnforcementMetricsService {
  private readonly counters = new Map<string, number>();

  record(labels: {
    path: string;
    action: string;
    dataCategory: string;
    outcome: TripLocationMetricOutcome;
  }): void {
    const key = `${labels.path}|${labels.action}|${labels.dataCategory}|${labels.outcome}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }

  countFor(path: string, action: string, dataCategory: string, outcome: TripLocationMetricOutcome): number {
    return this.counters.get(`${path}|${action}|${dataCategory}|${outcome}`) ?? 0;
  }

  reset(): void {
    this.counters.clear();
  }
}
