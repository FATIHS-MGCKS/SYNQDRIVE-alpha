import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlatformOpsInfrastructureDto, PlatformOpsState } from './platform-ops.types';

@Injectable()
export class PlatformOpsInfrastructureService {
  private readonly logger = new Logger(PlatformOpsInfrastructureService.name);

  constructor(private readonly config: ConfigService) {}

  async getSummary(): Promise<PlatformOpsInfrastructureDto> {
    const generatedAt = new Date().toISOString();
    const prometheusUrl =
      this.config.get<string>('PROMETHEUS_INTERNAL_URL') ?? 'http://127.0.0.1:9090';

    const queries: Record<string, string> = {
      diskPercent:
        '100 * (1 - node_filesystem_avail_bytes{job="node",fstype!~"tmpfs|overlay",mountpoint="/"} / node_filesystem_size_bytes{job="node",fstype!~"tmpfs|overlay",mountpoint="/"})',
      memoryPercent:
        '100 * (1 - node_memory_MemAvailable_bytes{job="node"} / node_memory_MemTotal_bytes{job="node"})',
      cpuPercent:
        '100 * (1 - avg(rate(node_cpu_seconds_total{job="node",mode="idle"}[5m])))',
      load1: 'node_load1{job="node"}',
      uptime: 'time() - node_boot_time_seconds{job="node"}',
    };

    try {
      const results = await Promise.all(
        Object.entries(queries).map(async ([key, query]) => {
          const value = await this.prometheusInstantQuery(prometheusUrl, query);
          return [key, value] as const;
        }),
      );

      const map = Object.fromEntries(results) as Record<string, number | null>;
      const diskPercentUsed = map.diskPercent;
      const memoryPercentUsed = map.memoryPercent;
      const cpuPercentUsed = map.cpuPercent;
      const load1 = map.load1;
      const uptimeSeconds = map.uptime;

      const hasAny =
        diskPercentUsed != null ||
        memoryPercentUsed != null ||
        cpuPercentUsed != null ||
        load1 != null;

      if (!hasAny) {
        return this.unavailableSummary(generatedAt);
      }

      const riskLevel = this.computeRiskLevel(diskPercentUsed, memoryPercentUsed, cpuPercentUsed);
      const signals: PlatformOpsInfrastructureDto['signals'] = [];

      if (diskPercentUsed != null) {
        signals.push({
          id: 'disk',
          label: 'Festplatte',
          value: `${Math.round(diskPercentUsed)} % belegt`,
          state: diskPercentUsed >= 85 ? 'critical' : diskPercentUsed >= 70 ? 'degraded' : 'healthy',
        });
      }
      if (memoryPercentUsed != null) {
        signals.push({
          id: 'memory',
          label: 'Arbeitsspeicher',
          value: `${Math.round(memoryPercentUsed)} % belegt`,
          state: memoryPercentUsed >= 90 ? 'critical' : memoryPercentUsed >= 80 ? 'degraded' : 'healthy',
        });
      }
      if (cpuPercentUsed != null) {
        signals.push({
          id: 'cpu',
          label: 'CPU',
          value: `${Math.round(cpuPercentUsed)} % Auslastung`,
          state: cpuPercentUsed >= 90 ? 'critical' : cpuPercentUsed >= 75 ? 'degraded' : 'healthy',
        });
      }
      if (load1 != null) {
        signals.push({
          id: 'load',
          label: 'Load (1m)',
          value: load1.toFixed(2),
          state: load1 >= 8 ? 'degraded' : 'healthy',
        });
      }

      return {
        generatedAt,
        isStale: false,
        available: true,
        source: 'prometheus',
        diskPercentUsed,
        memoryPercentUsed,
        cpuPercentUsed,
        load1,
        uptimeSeconds,
        riskLevel,
        signals,
      };
    } catch (err: unknown) {
      this.logger.debug(`Infrastructure summary unavailable: ${(err as Error).message}`);
      return this.unavailableSummary(generatedAt);
    }
  }

  private unavailableSummary(generatedAt: string): PlatformOpsInfrastructureDto {
    return {
      generatedAt,
      isStale: false,
      available: false,
      source: 'none',
      diskPercentUsed: null,
      memoryPercentUsed: null,
      cpuPercentUsed: null,
      load1: null,
      uptimeSeconds: null,
      riskLevel: 'unknown',
      signals: [],
    };
  }

  private computeRiskLevel(
    disk: number | null,
    memory: number | null,
    cpu: number | null,
  ): PlatformOpsState {
    if ((disk ?? 0) >= 85 || (memory ?? 0) >= 90 || (cpu ?? 0) >= 90) return 'critical';
    if ((disk ?? 0) >= 70 || (memory ?? 0) >= 80 || (cpu ?? 0) >= 75) return 'degraded';
    if (disk == null && memory == null && cpu == null) return 'unknown';
    return 'healthy';
  }

  private async prometheusInstantQuery(
    baseUrl: string,
    query: string,
  ): Promise<number | null> {
    const url = `${baseUrl}/api/v1/query?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      status?: string;
      data?: { result?: Array<{ value?: [number, string] }> };
    };
    if (body.status !== 'success') return null;
    const value = body.data?.result?.[0]?.value?.[1];
    if (value == null) return null;
    const num = Number.parseFloat(value);
    return Number.isFinite(num) ? num : null;
  }
}
