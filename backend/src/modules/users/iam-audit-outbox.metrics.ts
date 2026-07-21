import { Injectable } from '@nestjs/common';

type IamAuditMetricOperation =
  | 'processed'
  | 'retry'
  | 'dead_letter'
  | 'skipped'
  | 'duplicate';

@Injectable()
export class IamAuditOutboxMetricsService {
  private readonly counters = new Map<string, number>();

  record(operation: IamAuditMetricOperation, eventType?: string) {
    const key = eventType ? `${operation}:${eventType}` : operation;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  snapshot() {
    return Object.fromEntries(this.counters.entries());
  }

  reset() {
    this.counters.clear();
  }
}
