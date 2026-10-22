import {
  isDiV0MotionCoreShadowRunnable,
  parseDiV0MotionCoreShadowControlPlaneConfig,
  type DiV0MotionCoreShadowControlPlaneConfig,
} from './di-v0-motion-core-shadow-control-plane';

export const DI_V0_MOTION_CORE_SHADOW_ENV = {
  enabledSince: 'DI_V0_MOTION_CORE_SHADOW_ENABLED_SINCE',
  batchLimit: 'DI_V0_MOTION_CORE_SHADOW_BATCH_LIMIT',
} as const;

export const DI_V0_MOTION_CORE_SHADOW_TUNING = {
  schedulerIntervalMs: 90_000,
  defaultBatchLimit: 10,
  maxBatchLimit: 50,
  baseRetryDelayMs: 60_000,
  maxRetryDelayMs: 30 * 60_000,
  claimLeaseMs: 5 * 60_000,
  maxProcessingAttempts: 5,
  maxPayloadUncompressedBytes: 8 * 1024 * 1024,
} as const;

export interface DiV0MotionCoreShadowRuntimeConfig {
  controlPlane: DiV0MotionCoreShadowControlPlaneConfig;
  enabledSince: Date | null;
  batchLimit: number;
  schedulerIntervalMs: number;
}

export class DiV0MotionCoreShadowConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiV0MotionCoreShadowConfigError';
  }
}

export function parseDiV0MotionCoreShadowRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DiV0MotionCoreShadowRuntimeConfig {
  const controlPlane = parseDiV0MotionCoreShadowControlPlaneConfig(env);
  const sinceRaw = env[DI_V0_MOTION_CORE_SHADOW_ENV.enabledSince]?.trim();
  let enabledSince: Date | null = null;
  if (sinceRaw) {
    const parsed = new Date(sinceRaw);
    if (Number.isNaN(parsed.getTime())) {
      throw new DiV0MotionCoreShadowConfigError(
        `${DI_V0_MOTION_CORE_SHADOW_ENV.enabledSince} must be a valid ISO-8601 timestamp`,
      );
    }
    enabledSince = parsed;
  }
  if (isDiV0MotionCoreShadowRunnable(controlPlane) && !enabledSince) {
    throw new DiV0MotionCoreShadowConfigError(
      `${DI_V0_MOTION_CORE_SHADOW_ENV.enabledSince} is required when motion-core shadow flags are enabled`,
    );
  }

  const batchRaw = env[DI_V0_MOTION_CORE_SHADOW_ENV.batchLimit];
  const batchParsed = batchRaw
    ? Number.parseInt(batchRaw, 10)
    : DI_V0_MOTION_CORE_SHADOW_TUNING.defaultBatchLimit;
  const batchLimit = Math.min(
    Math.max(1, Number.isFinite(batchParsed) ? batchParsed : DI_V0_MOTION_CORE_SHADOW_TUNING.defaultBatchLimit),
    DI_V0_MOTION_CORE_SHADOW_TUNING.maxBatchLimit,
  );

  return {
    controlPlane,
    enabledSince,
    batchLimit,
    schedulerIntervalMs: DI_V0_MOTION_CORE_SHADOW_TUNING.schedulerIntervalMs,
  };
}

export function isDiV0MotionCoreShadowWorkerRunnable(config: DiV0MotionCoreShadowRuntimeConfig): boolean {
  return isDiV0MotionCoreShadowRunnable(config.controlPlane) && config.enabledSince != null;
}
