import type { DiV0S4PipelineManifest } from '../s4a-foundation/di-v0-s4a-contract';
import type { DiV0S4ClaimResult, DiV0S4WorkItemRepository } from '../s4a-foundation/di-v0-s4a-work-item.repository';

export interface DiV0S4ExecutionContext {
  /** Fencing token for every holder transition the executor performs (T05/T06/T08/T09/T13). */
  lease: DiV0S4ClaimResult;
  pipelineManifest: DiV0S4PipelineManifest;
  repository: DiV0S4WorkItemRepository;
  /** Aborted on work budget, lost lease, kill or control-plane stop; the executor must stop writing. */
  signal: AbortSignal;
}

/**
 * `SETTLED`: the executor believes it committed a terminal holder transition (T06/T08/T09/T13).
 * S4B verifies durable terminal DB state via `readExecutionPostcondition` before accepting SETTLED.
 * `RELEASE`: the executor wants the lease returned through T07 (`EXECUTOR_RELEASED`).
 * A thrown error is released through T07 as `EXECUTOR_ERROR`.
 */
export type DiV0S4ExecutionOutcome = { kind: 'SETTLED' } | { kind: 'RELEASE' };

/** S4C implements this. S4B ships no implementation, so no work item can be claimed. */
export interface DiV0S4WorkItemExecutor {
  readonly executorId: string;
  isReady(): boolean;
  execute(context: DiV0S4ExecutionContext): Promise<DiV0S4ExecutionOutcome>;
}

const EXECUTOR_ID_PATTERN = /^[A-Z0-9_]{1,64}$/;

export class DiV0S4ExecutorRegistry {
  private executor: DiV0S4WorkItemExecutor | null = null;

  register(executor: DiV0S4WorkItemExecutor): void {
    if (!EXECUTOR_ID_PATTERN.test(executor.executorId)) {
      throw new Error('DI_V0_S4B_EXECUTOR:executorId must match ^[A-Z0-9_]{1,64}$');
    }
    if (this.executor) throw new Error('DI_V0_S4B_EXECUTOR:an executor is already registered');
    this.executor = executor;
  }

  /** The registered executor only when it reports ready; a throwing readiness probe counts as not ready. */
  readyExecutor(): DiV0S4WorkItemExecutor | null {
    const executor = this.executor;
    if (!executor) return null;
    try {
      return executor.isReady() === true ? executor : null;
    } catch {
      return null;
    }
  }
}
