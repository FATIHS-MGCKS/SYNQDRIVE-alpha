import type { EventContextStatus } from './event-context-assessment.types';

/** Terminal assessments — stage may advance when every eligible event reached one of these. */
export const TERMINAL_EVENT_CONTEXT_STATUSES = new Set<EventContextStatus>([
  'SUCCESS',
  'LIMITED',
  'INSUFFICIENT_CADENCE',
  'PROVIDER_ERROR',
  'UNSUPPORTED',
]);

/** Legacy persisted statuses (pre-P26) mapped for read-time compatibility. */
const LEGACY_STATUS_MAP: Record<string, EventContextStatus> = {
  COMPLETED: 'SUCCESS',
  INSUFFICIENT_CONTEXT: 'INSUFFICIENT_CADENCE',
  FAILED: 'PROVIDER_ERROR',
  SKIPPED_NOT_APPLICABLE: 'UNSUPPORTED',
};

export function isTerminalEventContextStatus(status: unknown): status is EventContextStatus {
  return typeof status === 'string' && TERMINAL_EVENT_CONTEXT_STATUSES.has(status as EventContextStatus);
}

export function normalizeEventContextStatus(status: unknown): EventContextStatus | null {
  if (typeof status !== 'string') return null;
  if (TERMINAL_EVENT_CONTEXT_STATUSES.has(status as EventContextStatus)) {
    return status as EventContextStatus;
  }
  return LEGACY_STATUS_MAP[status] ?? null;
}

export function isContextAssessableStatus(status: EventContextStatus): boolean {
  return status === 'SUCCESS' || status === 'LIMITED';
}

export function isContextProviderFailureStatus(status: EventContextStatus): boolean {
  return status === 'PROVIDER_ERROR';
}
