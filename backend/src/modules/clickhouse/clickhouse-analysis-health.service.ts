import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickHouseService } from './clickhouse.service';
import type { ClickHouseAnalysisHealth } from './clickhouse-analysis-degradation.types';
import { isClickHouseReachableForAnalysis } from './clickhouse-analysis-degradation';

@Injectable()
export class ClickHouseAnalysisHealthService {
  private lastTimeoutAt: Date | null = null;

  constructor(
    private readonly clickHouse: ClickHouseService,
    private readonly config: ConfigService,
  ) {}

  markAnalysisTimeout(): void {
    this.lastTimeoutAt = new Date();
  }

  /**
   * Analysis-facing health snapshot — no Docker assumptions, env URL only.
   */
  getAnalysisHealth(now = Date.now()): ClickHouseAnalysisHealth {
    const status = this.clickHouse.getStatus();
    const circuit = this.clickHouse.getCircuitSnapshot(now);
    const timeoutWindowMs = this.analysisTimeoutWindowMs();
    const recentTimeout =
      this.lastTimeoutAt != null &&
      now - this.lastTimeoutAt.getTime() < timeoutWindowMs;

    let analysisStatus: ClickHouseAnalysisHealth['status'];
    if (!status.configured) {
      analysisStatus = 'disabled';
    } else if (!status.available) {
      analysisStatus = 'degraded';
    } else if (circuit.state === 'open') {
      analysisStatus = 'circuit_open';
    } else if (recentTimeout) {
      analysisStatus = 'timeout';
    } else if (status.status === 'schema_error') {
      analysisStatus = 'degraded';
    } else {
      analysisStatus = 'available';
    }

    return {
      status: analysisStatus,
      configured: status.configured,
      reachable: status.available && circuit.state !== 'open',
      circuitState: circuit.state,
      lastError: status.lastError ?? circuit.lastFailureAt,
      lastPingAt: status.lastPingAt,
    };
  }

  wasRecentlyRecovered(
    previous: ClickHouseAnalysisHealth,
    current: ClickHouseAnalysisHealth,
  ): boolean {
    return (
      !isClickHouseReachableForAnalysis(previous) &&
      isClickHouseReachableForAnalysis(current)
    );
  }

  private analysisTimeoutWindowMs(): number {
    const configured = Number(
      this.config.get<string>('CLICKHOUSE_ANALYSIS_TIMEOUT_WINDOW_MS') ?? 60_000,
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 60_000;
  }
}
