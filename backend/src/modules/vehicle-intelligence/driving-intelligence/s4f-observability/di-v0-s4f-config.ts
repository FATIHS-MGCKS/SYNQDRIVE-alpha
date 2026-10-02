import { DI_V0_S4_LIMITS } from '../s4a-foundation/di-v0-s4a-contract';

/** Frozen drift horizon (seconds); matches S4E and contract v2 `driftHorizonSeconds`. */
export const DI_V0_S4F_DRIFT_HORIZON_SECONDS = DI_V0_S4_LIMITS.driftHorizonSeconds;

export const DI_V0_S4F_TUNING = {
  defaultWorkBatchLimit: 200,
  maxWorkBatchLimit: 500,
  defaultBeyondHorizonBatchLimit: 100,
  maxBeyondHorizonBatchLimit: 500,
} as const;
