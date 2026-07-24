import { Injectable } from '@nestjs/common';

export type ExternalAccessMetricOutcome =
  | 'allow'
  | 'deny'
  | 'shadow_would_deny'
  | 'tenant_mismatch'
  | 'category_denied'
  | 'revoked';

@Injectable()
export class ExternalAccessEnforcementMetricsService {
  private readonly counts = new Map<string, number>();

  record(input: {
    channel: string;
    action: string;
    outcome: ExternalAccessMetricOutcome;
  }): void {
    const key = `${input.channel}:${input.action}:${input.outcome}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  countFor(channel: string, action: string, outcome: ExternalAccessMetricOutcome): number {
    return this.counts.get(`${channel}:${action}:${outcome}`) ?? 0;
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counts.entries());
  }

  reset(): void {
    this.counts.clear();
  }
}
