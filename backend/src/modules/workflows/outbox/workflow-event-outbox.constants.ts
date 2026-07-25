/** Default lease duration for outbox claim (ms). */
export const WORKFLOW_EVENT_OUTBOX_DEFAULT_LEASE_MS = 60_000;

/** Max lastErrorSummary length stored in DB. */
export const WORKFLOW_EVENT_OUTBOX_ERROR_SUMMARY_MAX = 500;

export function buildWorkflowOutboxIdempotencyKey(parts: string[]): string {
  return parts.filter(Boolean).join(':');
}

export function truncateOutboxErrorSummary(message: string): string {
  return message.slice(0, WORKFLOW_EVENT_OUTBOX_ERROR_SUMMARY_MAX);
}
