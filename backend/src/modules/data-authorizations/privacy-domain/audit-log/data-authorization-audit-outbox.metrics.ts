import { Injectable } from '@nestjs/common';
import type { DataAuthorizationAuditEventKind } from '@prisma/client';

type MetricOutcome = 'processed' | 'retry' | 'dead_letter' | 'duplicate';

@Injectable()
export class DataAuthorizationAuditOutboxMetricsService {
  private readonly counters = new Map<string, number>();

  record(outcome: MetricOutcome, eventKind: DataAuthorizationAuditEventKind): void {
    const key = `${outcome}:${eventKind}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }

  reset(): void {
    this.counters.clear();
  }
}
