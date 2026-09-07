/**
 * Typed defer for BullMQ handoff retries. The handoff worker throws this when
 * canonical snapshot is not yet terminal, notBefore has not elapsed, or enqueue
 * is temporarily unavailable — allowing the CURRENT job to re-arm via BullMQ
 * backoff instead of self-coalescing a duplicate stable jobId.
 */
export class SnapshotWakeHandoffDeferError extends Error {
  readonly name = 'SnapshotWakeHandoffDeferError';

  constructor(
    readonly retryAfterMs: number,
    readonly reason: 'not_before' | 'canonical_active' | 'queue_failed' | 'enqueue_failed',
  ) {
    super(`snapshot_wake_handoff_defer:${reason}:${retryAfterMs}`);
  }
}

export function isSnapshotWakeHandoffDeferError(
  err: unknown,
): err is SnapshotWakeHandoffDeferError {
  return err instanceof SnapshotWakeHandoffDeferError;
}
