import { Injectable } from '@nestjs/common';
import type { TelemetryIngestPath } from './telemetry-ingestion-enforcement.constants';

export type TelemetryIngestMetricOutcome =
  | 'allow'
  | 'deny'
  | 'shadow_would_deny'
  | 'ingestion_skipped'
  | 'scope_mismatch'
  | 'resolver_error';

export interface TelemetryIngestMetricLabels {
  path: TelemetryIngestPath | string;
  sourceSystem: string;
  dataCategory: string;
  outcome: TelemetryIngestMetricOutcome;
}

@Injectable()
export class TelemetryIngestionEnforcementMetricsService {
  private readonly counters = new Map<string, number>();

  record(labels: TelemetryIngestMetricLabels): void {
    const key = `${labels.path}|${labels.sourceSystem}|${labels.dataCategory}|${labels.outcome}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  /** Test/diagnostic helper — returns snapshot of in-process counters. */
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }

  countFor(
    path: string,
    sourceSystem: string,
    dataCategory: string,
    outcome: TelemetryIngestMetricOutcome,
  ): number {
    const key = `${path}|${sourceSystem}|${dataCategory}|${outcome}`;
    return this.counters.get(key) ?? 0;
  }

  reset(): void {
    this.counters.clear();
  }
}
