import type { DiV0S4TransitionId } from './di-v0-s4a-contract';

export type DiV0S4RejectionCode =
  | 'ILLEGAL_SOURCE_STATE'
  | 'WORK_ITEM_NOT_FOUND'
  | 'DB_KILL_ACTIVE'
  | 'DB_KILL_ROW_MISSING'
  | 'DB_KILL_ROW_UNREADABLE'
  | 'DB_KILL_ROW_MALFORMED'
  | 'CONTROL_PLANE_DISABLED'
  | 'TENANT_SCOPE_INVALID'
  | 'TRIP_NOT_COMPLETED'
  | 'DUPLICATE_WORK_ITEM'
  | 'PIPELINE_MANIFEST_INVALID'
  | 'PIPELINE_VERSION_MISMATCH'
  | 'PIPELINE_VERSION_NOT_ACTIVE'
  | 'PIPELINE_VERSION_NOT_RETIRED'
  | 'NO_CLAIMABLE_WORK_ITEM'
  | 'LEASE_NOT_HELD'
  | 'LEASE_EXPIRED'
  | 'LEASE_STILL_VALID'
  | 'ATTEMPTS_EXHAUSTED'
  | 'ATTEMPTS_NOT_EXHAUSTED'
  | 'PIN_ALREADY_SET'
  | 'PIN_NOT_SET'
  | 'SNAPSHOT_SCOPE_INVALID'
  | 'SNAPSHOT_HASH_MISMATCH'
  | 'SNAPSHOT_INVALID'
  | 'CHANNEL_SET_NOT_RUNNABLE'
  | 'BOUNDARY_FINGERPRINT_CHANGED'
  | 'BOUNDARY_FINGERPRINT_UNCHANGED'
  | 'S2_EXECUTION_IDENTITY_MISMATCH'
  | 'S2_EXISTING_RUN_NOT_COMPLETED'
  | 'S2_INTERVALS_INVALID'
  | 'REASON_INVALID'
  | 'RUN_PURPOSE_FORBIDS_TRANSITION'
  | 'SUCCESSOR_INSERT_REJECTED'
  | 'NO_RETIRABLE_WORK_ITEM'
  | 'NO_EXHAUSTED_WORK_ITEM'
  | 'CONDITIONAL_UPDATE_LOST';

/**
 * A guarded S4 transition refused to write. The surrounding transaction is always rolled back,
 * so a rejection never leaves a partial authoritative write behind.
 */
export class DiV0S4TransitionRejectedError extends Error {
  constructor(
    readonly transitionId: DiV0S4TransitionId,
    readonly code: DiV0S4RejectionCode,
    readonly detail?: string,
  ) {
    super(`DI_V0_S4_REJECTED:${transitionId}:${code}${detail ? `:${detail}` : ''}`);
    this.name = 'DiV0S4TransitionRejectedError';
  }
}

export function isDiV0S4Rejection(
  error: unknown,
  code?: DiV0S4RejectionCode,
): error is DiV0S4TransitionRejectedError {
  return error instanceof DiV0S4TransitionRejectedError && (code === undefined || error.code === code);
}
