import { Injectable } from '@nestjs/common';

type BusinessAuditOutboxMetricOutcome =
  | 'processed'
  | 'retry'
  | 'dead_letter'
  | 'duplicate'
  | 'skipped';

@Injectable()
export class BusinessAuditOutboxMetricsService {
  private readonly counters = new Map<string, number>();

  record(outcome: BusinessAuditOutboxMetricOutcome, action: string): void {
    const key = `${outcome}:${action}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }
}
