import type { BookingWorkflowFlag } from './workflow-action-adapter.types';

export const ALLOWED_BOOKING_WORKFLOW_FLAGS: readonly BookingWorkflowFlag[] = [
  'pickup_overdue',
  'manual_review',
  'complaint_escalated',
  'workflow_hold',
  'payment_attention',
] as const;

export const BOOKING_WORKFLOW_FLAG_SET = new Set<string>(ALLOWED_BOOKING_WORKFLOW_FLAGS);

export interface BookingWorkflowFlagRecord {
  setAt: string;
  workflowRunId: string;
  actionRunId: string;
  reason?: string;
}

export function readWorkflowFlags(extrasJson: unknown): Record<string, BookingWorkflowFlagRecord> {
  if (!extrasJson || typeof extrasJson !== 'object' || Array.isArray(extrasJson)) {
    return {};
  }
  const root = extrasJson as Record<string, unknown>;
  const flags = root.workflowFlags;
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return {};
  return flags as Record<string, BookingWorkflowFlagRecord>;
}

export function mergeWorkflowFlag(
  extrasJson: unknown,
  flag: BookingWorkflowFlag,
  record: BookingWorkflowFlagRecord,
): Record<string, unknown> {
  const base =
    extrasJson && typeof extrasJson === 'object' && !Array.isArray(extrasJson)
      ? { ...(extrasJson as Record<string, unknown>) }
      : Array.isArray(extrasJson)
        ? { extras: extrasJson }
        : {};

  const existingFlags = readWorkflowFlags(base);
  return {
    ...base,
    workflowFlags: {
      ...existingFlags,
      [flag]: record,
    },
  };
}
