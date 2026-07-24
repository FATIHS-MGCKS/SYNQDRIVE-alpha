import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DenySwitchMetricsService } from '../deny-switch/deny-switch.metrics';
import { EnforcementCoverageHealthService } from '../enforcement-coverage-registry/enforcement-coverage-health.service';
import { EnforcementCoverageRegistryMetricsService } from '../enforcement-coverage-registry/enforcement-coverage-registry.metrics';
import { DataAuthorizationAuditOutboxMetricsService } from '../privacy-domain/audit-log/data-authorization-audit-outbox.metrics';
import { DataAuthMetricsService } from './data-auth-metrics.service';

/**
 * Bridges in-process data-auth counters into Prometheus using delta sync.
 */
@Injectable()
export class DataAuthMetricsBridgeService implements OnModuleInit {
  private readonly logger = new Logger(DataAuthMetricsBridgeService.name);
  private readonly lastSnapshots = new Map<string, number>();

  constructor(
    private readonly metrics: DataAuthMetricsService,
    @Optional() private readonly auditOutboxMetrics?: DataAuthorizationAuditOutboxMetricsService,
    @Optional() private readonly denySwitchMetrics?: DenySwitchMetricsService,
    @Optional() private readonly coverageMetrics?: EnforcementCoverageRegistryMetricsService,
    @Optional() private readonly coverageHealth?: EnforcementCoverageHealthService,
  ) {}

  onModuleInit(): void {
    void this.syncInProcessMetrics();
  }

  @Cron('*/30 * * * * *')
  async syncInProcessMetrics(): Promise<void> {
    try {
      this.syncAuditOutboxSnapshot(this.auditOutboxMetrics?.snapshot() ?? {});
      this.syncDenySwitchSnapshot(this.denySwitchMetrics?.snapshot() ?? { counters: {} });
      this.syncCoverageSnapshot(this.coverageMetrics?.snapshot() ?? {});
      this.syncEnforcementDomainSnapshots(this.coverageHealth?.metricsSnapshot() ?? {});
    } catch (err) {
      this.logger.debug(
        `Data-auth metrics bridge sync skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private syncAuditOutboxSnapshot(snapshot: Record<string, number>): void {
    for (const [key, value] of Object.entries(snapshot)) {
      const [outcome, eventKind] = key.split(':');
      const delta = this.deltaFor(`audit:${key}`, value);
      if (delta <= 0) continue;
      if (outcome === 'retry') {
        this.metrics.recordAuditOutboxFailed(eventKind ?? 'UNKNOWN');
      } else if (outcome === 'dead_letter') {
        this.metrics.recordAuditDeadLetter(eventKind ?? 'UNKNOWN');
      }
    }
  }

  private syncDenySwitchSnapshot(snapshot: {
    counters?: Record<string, number>;
    propagationLatencyMs?: { sampleCount?: number };
  }): void {
    for (const [key, value] of Object.entries(snapshot.counters ?? {})) {
      const [outcome] = key.split(':');
      const delta = this.deltaFor(`deny:${key}`, value);
      if (delta <= 0 || !outcome) continue;
      for (let i = 0; i < delta; i++) {
        this.metrics.recordDenySwitchPropagation(outcome);
      }
    }

    const latencies = (snapshot as { propagationLatencyMs?: { p95?: number | null } })
      .propagationLatencyMs;
    if (latencies?.p95 != null) {
      this.metrics.observeDenySwitchPropagationLatencySeconds(latencies.p95 / 1000);
    }
  }

  private syncCoverageSnapshot(snapshot: Record<string, number>): void {
    for (const [key, value] of Object.entries(snapshot)) {
      const [, outcome] = key.split(':');
      const delta = this.deltaFor(`coverage:${key}`, value);
      if (delta <= 0) continue;
      if (outcome === 'error') {
        const [domain] = key.split(':');
        for (let i = 0; i < delta; i++) {
          this.metrics.recordEnforcementError(domain ?? 'unknown');
        }
      }
      if (outcome === 'unregistered_path') {
        const [domain] = key.split(':');
        for (let i = 0; i < delta; i++) {
          this.metrics.recordUnprotectedPath(domain ?? 'unknown');
        }
      }
    }
  }

  private syncEnforcementDomainSnapshots(
    snapshots: Record<string, Record<string, number>>,
  ): void {
    for (const [domain, counters] of Object.entries(snapshots)) {
      for (const [key, value] of Object.entries(counters)) {
        if (!key.includes('resolver_error') && !key.includes('enforcement_error')) continue;
        const delta = this.deltaFor(`domain:${domain}:${key}`, value);
        if (delta <= 0) continue;
        for (let i = 0; i < delta; i++) {
          this.metrics.recordEnforcementError(domain);
        }
      }
    }
  }

  private deltaFor(snapshotKey: string, current: number): number {
    const previous = this.lastSnapshots.get(snapshotKey) ?? 0;
    const delta = current - previous;
    this.lastSnapshots.set(snapshotKey, current);
    return delta > 0 ? delta : 0;
  }
}
