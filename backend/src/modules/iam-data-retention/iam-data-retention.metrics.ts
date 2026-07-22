import { Injectable } from '@nestjs/common';

type IamRetentionMetricOperation =
  | 'run_started'
  | 'run_completed'
  | 'phase_completed'
  | 'phase_failed'
  | 'skipped_disabled';

@Injectable()
export class IamDataRetentionMetricsService {
  private readonly counters = new Map<string, number>();

  record(operation: IamRetentionMetricOperation, category?: string) {
    const key = category ? `${operation}:${category}` : operation;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  snapshot() {
    return Object.fromEntries(this.counters.entries());
  }

  reset() {
    this.counters.clear();
  }
}
