export type DurableRetirementOutcome =
  | 'RETIRED'
  | 'MISSING'
  | 'NEWER_FOUND'
  | 'READ_ERROR'
  | 'ACK_ERROR'
  | 'UNKNOWN_RETRY';

export const MAX_RETIREMENT_RECONCILE_ITERATIONS = 3;

export const UNKNOWN_CONTINUATION_RETRY_MS = 2000;
