import type {
  WorkflowEventRejection,
  WorkflowEventRejectionReason,
} from './workflow-domain-event-envelope.types';

export function createWorkflowEventRejection(
  reason: WorkflowEventRejectionReason,
  message: string,
  options: {
    field?: string;
    deadLetter?: boolean;
    organizationId?: string;
    eventType?: string;
    eventId?: string;
    legacySourceKey?: string;
    rejectedAt?: Date;
  } = {},
): WorkflowEventRejection {
  return Object.freeze({
    reason,
    field: options.field,
    message,
    rejectedAt: (options.rejectedAt ?? new Date()).toISOString(),
    deadLetter: options.deadLetter ?? true,
    organizationId: options.organizationId,
    eventType: options.eventType,
    eventId: options.eventId,
    legacySourceKey: options.legacySourceKey,
  });
}

export function rejectionToDeadLetterPayload(
  rejection: WorkflowEventRejection,
  rawInput?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    kind: 'workflow_event_rejection',
    reason: rejection.reason,
    field: rejection.field,
    message: rejection.message,
    rejectedAt: rejection.rejectedAt,
    organizationId: rejection.organizationId,
    eventType: rejection.eventType,
    eventId: rejection.eventId,
    legacySourceKey: rejection.legacySourceKey,
    rawInputSummary: rawInput
      ? { keys: Object.keys(rawInput), eventType: rawInput.eventType }
      : undefined,
  };
}
