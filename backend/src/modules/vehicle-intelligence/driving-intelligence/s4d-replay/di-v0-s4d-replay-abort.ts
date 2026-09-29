import type { DiV0S4ExecutionOutcome } from '../s4b-orchestration/di-v0-s4b-executor.port';

/** When aborted, S4D must not perform T06/T08/T13 — return RELEASE for S4B safe relinquish. */
export function s4dAbortReleaseOrContinue(signal: AbortSignal): DiV0S4ExecutionOutcome | null {
  if (signal.aborted) return { kind: 'RELEASE' };
  return null;
}

export function assertS4dNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('DI_V0_S4C_ABORTED');
}
