import { Injectable } from '@nestjs/common';
import {
  ApplicationHealthReport,
  DependencyStatus,
} from './dependency-health.types';
import { ApplicationHealthService } from './application-health.service';

@Injectable()
export class HealthService {
  constructor(private readonly applicationHealth: ApplicationHealthService) {}

  async checkApplicationHealth(): Promise<ApplicationHealthReport> {
    return this.applicationHealth.checkApplicationHealth();
  }

  /**
   * Readiness for load balancers — hard dependencies only.
   * Returns HTTP 503 when not ready (see HealthController).
   */
  async checkReadiness(): Promise<{
    status: 'ok' | 'degraded';
    ready: boolean;
    checks: Record<string, DependencyStatus>;
  }> {
    const report = await this.applicationHealth.checkApplicationHealth();
    const checks = this.toLegacyChecks(report);

    return {
      status: report.readiness.ready ? 'ok' : 'degraded',
      ready: report.readiness.ready,
      checks,
    };
  }

  private toLegacyChecks(
    report: ApplicationHealthReport,
  ): Record<string, DependencyStatus> {
    const mapProbe = (key: keyof ApplicationHealthReport['probes']): DependencyStatus => {
      const probe = report.probes[key];
      return {
        status: probe.status === 'ok' || probe.status === 'skipped' ? 'ok' : 'error',
        responseMs: probe.responseMs,
        ...(probe.error ? { error: probe.error } : {}),
        ...(probe.details ? { details: probe.details } : {}),
      };
    };

    return {
      postgres: mapProbe('postgres'),
      redis: mapProbe('redis'),
      clickhouse: mapProbe('clickhouse'),
      workers: mapProbe('workers'),
      queue: mapProbe('queue'),
      documentExtraction: mapProbe('documentExtraction'),
    };
  }
}
