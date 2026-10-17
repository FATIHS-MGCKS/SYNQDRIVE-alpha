import type { DiV0S4ResearchControlPlaneConfig } from './di-v0-s4-research-control-plane';
import { isDiV0S4ResearchRoadMatchingConfigured } from './di-v0-s4-research-control-plane';

export const DI_V0_S4_RESEARCH_V2_ENV = {
  enabledSince: 'DI_V0_S4_RESEARCH_ENABLED_SINCE',
  batchLimit: 'DI_V0_S4_RESEARCH_BATCH_LIMIT',
  schedulerIntervalMs: 'DI_V0_S4_RESEARCH_SCHEDULER_INTERVAL_MS',
} as const;

export const DI_V0_S4_RESEARCH_V2_TUNING = {
  defaultBatchLimit: 5,
  maxBatchLimit: 20,
  defaultSchedulerIntervalMs: 120_000,
  /** Hard per-trip processing budget (scheduler interval may be longer). */
  maxProcessingMsPerTrip: 120_000,
  baseRetryDelayMs: 60_000,
  maxProcessingAttempts: 8,
} as const;

export interface DiV0S4ResearchV2RuntimeConfig {
  controlPlane: DiV0S4ResearchControlPlaneConfig;
  enabledSince: Date | null;
  batchLimit: number;
  schedulerIntervalMs: number;
}

export function parseDiV0S4ResearchV2RuntimeConfig(
  controlPlane: DiV0S4ResearchControlPlaneConfig,
  env: Readonly<Record<string, string | undefined>> = process.env,
): DiV0S4ResearchV2RuntimeConfig {
  const sinceRaw = env[DI_V0_S4_RESEARCH_V2_ENV.enabledSince]?.trim();
  let enabledSince: Date | null = null;
  if (sinceRaw) {
    const d = new Date(sinceRaw);
    if (!Number.isNaN(d.getTime())) enabledSince = d;
  }
  const batchRaw = env[DI_V0_S4_RESEARCH_V2_ENV.batchLimit];
  const batchParsed = batchRaw ? Number.parseInt(batchRaw, 10) : DI_V0_S4_RESEARCH_V2_TUNING.defaultBatchLimit;
  const batchLimit = Math.min(
    Math.max(1, Number.isFinite(batchParsed) ? batchParsed : DI_V0_S4_RESEARCH_V2_TUNING.defaultBatchLimit),
    DI_V0_S4_RESEARCH_V2_TUNING.maxBatchLimit,
  );
  const schedRaw = env[DI_V0_S4_RESEARCH_V2_ENV.schedulerIntervalMs];
  const schedParsed = schedRaw ? Number.parseInt(schedRaw, 10) : DI_V0_S4_RESEARCH_V2_TUNING.defaultSchedulerIntervalMs;
  const schedulerIntervalMs = Math.max(30_000, Number.isFinite(schedParsed) ? schedParsed : DI_V0_S4_RESEARCH_V2_TUNING.defaultSchedulerIntervalMs);
  return { controlPlane, enabledSince, batchLimit, schedulerIntervalMs };
}

export function isDiV0S4ResearchV2Runnable(config: DiV0S4ResearchV2RuntimeConfig): boolean {
  return isDiV0S4ResearchRoadMatchingConfigured(config.controlPlane) && config.enabledSince != null;
}
