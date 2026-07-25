import type { WorkflowIdempotencyKeyParts } from './workflow-idempotency.types';

const KEY_SEP = ':';

/** Outbox ingest key — eventType + occurrence (no org prefix; org scoped by unique constraint). */
export function buildWorkflowOutboxOccurrenceKey(eventType: string, occurrenceId: string): string {
  return [eventType, occurrenceId].filter(Boolean).join(KEY_SEP);
}

/** One workflow run per org + version + business occurrence. */
export function buildWorkflowRunIdempotencyKey(parts: {
  organizationId: string;
  workflowVersionId: string;
  occurrenceId: string;
}): string {
  return [parts.organizationId, parts.workflowVersionId, parts.occurrenceId].join(KEY_SEP);
}

/**
 * Action idempotency key (target formula):
 * organizationId + workflowVersionId + actionStableId + occurrenceId
 */
export function buildWorkflowActionIdempotencyKey(parts: WorkflowIdempotencyKeyParts): string {
  if (!parts.actionStableId?.trim()) {
    throw new Error('actionStableId is required for action idempotency key');
  }
  return [
    parts.organizationId,
    parts.workflowVersionId,
    parts.actionStableId.trim(),
    parts.occurrenceId,
  ].join(KEY_SEP);
}

/** Provider adapters use the same stable action key (no PII). */
export function buildWorkflowProviderIdempotencyKey(parts: WorkflowIdempotencyKeyParts): string {
  return buildWorkflowActionIdempotencyKey(parts);
}

/** Timer schedule key — occurrence-based (timers already use this pattern). */
export function buildWorkflowTimerIdempotencyKey(occurrenceId: string): string {
  return `timer:${occurrenceId}`;
}

/** Force replay appends a non-colliding suffix while preserving audit trail. */
export function buildForceReplayOccurrenceId(
  baseOccurrenceId: string,
  replayToken: string,
): string {
  return `${baseOccurrenceId}${KEY_SEP}force${KEY_SEP}${replayToken}`;
}

/** Map legacy run keys to occurrenceId where possible (migration helper). */
export function parseLegacyRunIdempotencyKey(key: string): {
  kind: 'canonical' | 'legacy_event' | 'legacy_entity' | 'unknown';
  occurrenceId?: string;
} {
  const canonical = key.match(
    /^[0-9a-f-]{36}:[0-9a-f-]{36}:(.+)$/i,
  );
  if (canonical) {
    return { kind: 'canonical', occurrenceId: canonical[1] };
  }
  if (key.includes(':workflow:')) {
    const beforeWorkflow = key.split(':workflow:')[0];
    if (beforeWorkflow.match(/^[0-9a-f-]{36}$/i)) {
      return { kind: 'legacy_event', occurrenceId: `event:${beforeWorkflow}` };
    }
    return { kind: 'legacy_entity', occurrenceId: beforeWorkflow };
  }
  return { kind: 'unknown' };
}
