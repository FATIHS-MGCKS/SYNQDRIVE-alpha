/** Redis SCAN pattern for durable successor handoff mailboxes. */
export const SUCCESSOR_HANDOFF_RECOVERY_KEY_PATTERN =
  'synqdrive:snapshot-wake:successor:*';

/** Hint count passed to Redis SCAN (not a hard upper bound). */
export const SUCCESSOR_HANDOFF_RECOVERY_SCAN_COUNT = 100;

/** Max successor keys examined per scheduler tick (bounded work). */
export const MAX_SUCCESSOR_HANDOFF_RECOVERY_PER_TICK = 50;

export type SuccessorHandoffRecoveryOutcome =
  | 'OK'
  | 'REARMED'
  | 'MISSING'
  | 'READ_ERROR'
  | 'QUEUE_FAILED';

/** Scheduler/carrier state preserved across ticks when a SCAN batch is partially processed. */
export type SuccessorHandoffRecoveryContinuation = {
  /** Next Redis SCAN cursor — assigned to Redis `nextCursor` when a batch is fetched. */
  scanCursor: string;
  /** Unprocessed tail of the current SCAN response (must not be discarded). */
  pendingBatchKeys: string[];
};

export const INITIAL_SUCCESSOR_HANDOFF_RECOVERY_CONTINUATION: SuccessorHandoffRecoveryContinuation =
  {
    scanCursor: '0',
    pendingBatchKeys: [],
  };

export type SuccessorHandoffRecoveryTickResult = {
  scanned: number;
  rearmed: number;
  errors: number;
  continuation: SuccessorHandoffRecoveryContinuation;
};
