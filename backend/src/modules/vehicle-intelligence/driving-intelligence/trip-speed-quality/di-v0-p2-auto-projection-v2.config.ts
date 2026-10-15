import { DI_V0_SPEED_QC_POLICY_V2 } from '../speed-qc/di-v0-speed-qc-policy.version';
import type { DiV0P2AutoProjectionV2Bootstrap } from './di-v0-p2-auto-projection-v2.tokens';

export const DI_V0_P2_AUTO_PROJECTION_V2_ENV = {
  enabled: 'DI_V0_P2_AUTO_PROJECTION_V2_ENABLED',
  enabledSince: 'DI_V0_P2_AUTO_PROJECTION_V2_ENABLED_SINCE',
  batchLimit: 'DI_V0_P2_AUTO_PROJECTION_V2_BATCH_LIMIT',
} as const;

export const DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY = DI_V0_SPEED_QC_POLICY_V2;

export const DI_V0_P2_AUTO_PROJECTION_V2_TUNING = {
  schedulerIntervalMs: 60_000,
  defaultBatchLimit: 20,
  maxBatchLimit: 100,
  baseRetryDelayMs: 30_000,
  maxRetryDelayMs: 30 * 60_000,
  /** Bounded PROCESSING lease — expired rows become reclaimable. */
  claimLeaseMs: 5 * 60_000,
} as const;

export interface DiV0P2AutoProjectionV2Config {
  enabled: boolean;
  /** Required when enabled — only work items completed at or after this instant are discovered. */
  enabledSince: Date | null;
  batchLimit: number;
  schedulerIntervalMs: number;
  qcPolicyVersion: typeof DI_V0_SPEED_QC_POLICY_V2;
}

export class DiV0P2AutoProjectionV2ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiV0P2AutoProjectionV2ConfigError';
  }
}

function parseBool(value: string | undefined): boolean {
  if (value === undefined || value === '') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function parseDiV0P2AutoProjectionV2Config(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DiV0P2AutoProjectionV2Config {
  const enabled = parseBool(env[DI_V0_P2_AUTO_PROJECTION_V2_ENV.enabled]);
  const sinceRaw = env[DI_V0_P2_AUTO_PROJECTION_V2_ENV.enabledSince]?.trim();
  let enabledSince: Date | null = null;
  if (sinceRaw) {
    const parsed = new Date(sinceRaw);
    if (Number.isNaN(parsed.getTime())) {
      throw new DiV0P2AutoProjectionV2ConfigError(
        `${DI_V0_P2_AUTO_PROJECTION_V2_ENV.enabledSince} must be a valid ISO-8601 timestamp`,
      );
    }
    enabledSince = parsed;
  }
  if (enabled && !enabledSince) {
    throw new DiV0P2AutoProjectionV2ConfigError(
      `${DI_V0_P2_AUTO_PROJECTION_V2_ENV.enabledSince} is required when ${DI_V0_P2_AUTO_PROJECTION_V2_ENV.enabled}=true`,
    );
  }

  const batchRaw = env[DI_V0_P2_AUTO_PROJECTION_V2_ENV.batchLimit];
  const batchParsed = batchRaw ? Number.parseInt(batchRaw, 10) : DI_V0_P2_AUTO_PROJECTION_V2_TUNING.defaultBatchLimit;
  const batchLimit = Math.min(
    Math.max(1, Number.isFinite(batchParsed) ? batchParsed : DI_V0_P2_AUTO_PROJECTION_V2_TUNING.defaultBatchLimit),
    DI_V0_P2_AUTO_PROJECTION_V2_TUNING.maxBatchLimit,
  );

  return {
    enabled,
    enabledSince,
    batchLimit,
    schedulerIntervalMs: DI_V0_P2_AUTO_PROJECTION_V2_TUNING.schedulerIntervalMs,
    qcPolicyVersion: DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY,
  };
}

export function isDiV0P2AutoProjectionV2Configured(config: DiV0P2AutoProjectionV2Config): boolean {
  return config.enabled && config.enabledSince != null;
}

export function createDisabledDiV0P2AutoProjectionV2Config(): DiV0P2AutoProjectionV2Config {
  return {
    enabled: false,
    enabledSince: null,
    batchLimit: DI_V0_P2_AUTO_PROJECTION_V2_TUNING.defaultBatchLimit,
    schedulerIntervalMs: DI_V0_P2_AUTO_PROJECTION_V2_TUNING.schedulerIntervalMs,
    qcPolicyVersion: DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY,
  };
}

export function resolveDiV0P2AutoProjectionV2Bootstrap(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DiV0P2AutoProjectionV2Bootstrap {
  try {
    return { config: parseDiV0P2AutoProjectionV2Config(env), disabledReason: null };
  } catch (error) {
    const message =
      error instanceof DiV0P2AutoProjectionV2ConfigError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'invalid P2 auto projection V2 config';
    return { config: createDisabledDiV0P2AutoProjectionV2Config(), disabledReason: message };
  }
}
