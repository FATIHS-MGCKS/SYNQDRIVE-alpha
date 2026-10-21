import type { DiV0S4ExecutorRegistry } from '../s4b-orchestration/di-v0-s4b-executor.port';
import type { DiV0S4fExecutorLivenessMetrics } from './di-v0-s4f-observability-contract';

/**
 * Honest executor liveness: replica-local registry only. No durable cross-replica presence authority exists.
 */
export function evaluateDiV0S4fExecutorLiveness(
  activePipelineCount: number,
  registry: DiV0S4ExecutorRegistry | null,
): DiV0S4fExecutorLivenessMetrics {
  const ready = registry?.readyExecutor() != null;
  if (!registry) {
    return {
      signal: 'NO_EXECUTOR_REGISTERED',
      localExecutorReady: false,
      activePipelineCount,
      globalExecutorLivenessAuthorityPresent: false,
    };
  }
  return {
    signal: 'LOCAL_REPLICA_REGISTRY_ONLY',
    localExecutorReady: ready,
    activePipelineCount,
    globalExecutorLivenessAuthorityPresent: false,
  };
}

/** Documented gap when global liveness is required for activation proofs. */
export const DI_GAP_S4F_GLOBAL_EXECUTOR_LIVENESS_001 = 'DI-GAP-S4F-GLOBAL-EXECUTOR-LIVENESS-001';
