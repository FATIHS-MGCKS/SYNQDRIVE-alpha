import { Injectable } from '@nestjs/common';

export type NotificationEnforcementMetricOutcome =
  | 'allow'
  | 'deny'
  | 'shadow_would_deny'
  | 'skipped'
  | 'tenant_mismatch'
  | 'upstream_blocked'
  | 'revoked'
  | 'cache_hit';

@Injectable()
export class NotificationEnforcementMetricsService {
  private readonly counts = new Map<string, number>();

  record(input: {
    eventType: string;
    phase: 'ingest' | 'delivery' | 'deep_link' | 'revocation';
    outcome: NotificationEnforcementMetricOutcome;
  }): void {
    const key = `${input.phase}:${input.eventType}:${input.outcome}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  countFor(
    phase: string,
    eventType: string,
    outcome: NotificationEnforcementMetricOutcome,
  ): number {
    return this.counts.get(`${phase}:${eventType}:${outcome}`) ?? 0;
  }

  reset(): void {
    this.counts.clear();
  }
}
