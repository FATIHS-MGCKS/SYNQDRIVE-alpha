import type { RawRefuelNativeFallbackConvergenceEvaluation } from './raw-refuel-native-fallback-convergence.types';

export type RawRefuelPromotionApplyStatus =
  | 'SKIPPED_NOT_AUTHORIZED'
  | 'SKIPPED_NOT_READY'
  | 'SKIPPED_NO_ACTION'
  | 'SKIPPED_CONVERGED_NATIVE'
  | 'BLOCKED_CUTOVER'
  | 'BLOCKED_PROMOTION_TRUST'
  | 'FAIL_CLOSED'
  | 'ALREADY_PROMOTED'
  | 'CONVERGED_NATIVE'
  | 'PROMOTED';

export interface RawRefuelPromotionApplyResult {
  status: RawRefuelPromotionApplyStatus;
  evaluation: RawRefuelNativeFallbackConvergenceEvaluation | null;
  candidateId: string;
  fallbackVehicleEnergyEventId: string | null;
  convergedNativeEventId: string | null;
  detail: string;
}

export interface RawRefuelPromotionTransactionHooks {
  beforeVeeInsert?: () => void | Promise<void>;
  afterVeeInsertBeforeLifecycleUpdate?: () => void | Promise<void>;
}
