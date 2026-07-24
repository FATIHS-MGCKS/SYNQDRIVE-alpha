import { Injectable } from '@nestjs/common';

export type EnforcementCoverageMetricOutcome =
  | 'evaluated'
  | 'enforced'
  | 'partial'
  | 'not_implemented'
  | 'error'
  | 'unregistered_path';

@Injectable()
export class EnforcementCoverageRegistryMetricsService {
  private readonly counters = new Map<string, number>();

  record(input: { domain: string; outcome: EnforcementCoverageMetricOutcome }): void {
    const key = `${input.domain}:${input.outcome}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }

  countFor(domain: string, outcome: EnforcementCoverageMetricOutcome): number {
    return this.counters.get(`${domain}:${outcome}`) ?? 0;
  }

  reset(): void {
    this.counters.clear();
  }
}
