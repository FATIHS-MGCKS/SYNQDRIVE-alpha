import { createHash } from 'crypto';
import {
  NOTIFICATION_AUDIT_PROTECTED_FIELDS,
} from './notification-audit.constants';
import {
  sanitizeWorkflowAuditValue,
  scanWorkflowAuditPayloadForSecrets,
} from '@modules/workflows/audit/workflow-audit-sanitize.util';
import type { NotificationAuditStateSnapshot } from './notification-audit.types';

const PROTECTED = new Set(
  NOTIFICATION_AUDIT_PROTECTED_FIELDS.map((f) => f.toLowerCase()),
);

export function sanitizeNotificationAuditState(
  state?: NotificationAuditStateSnapshot | null,
): NotificationAuditStateSnapshot | null {
  if (!state) return null;
  const allowed: NotificationAuditStateSnapshot = {};
  if (state.status != null) allowed.status = state.status;
  if (state.severity != null) allowed.severity = state.severity;
  if (state.lifecycleGeneration != null) allowed.lifecycleGeneration = state.lifecycleGeneration;
  if (state.reopenCount != null) allowed.reopenCount = state.reopenCount;
  if (state.eventType != null) allowed.eventType = state.eventType;
  if (state.domain != null) allowed.domain = state.domain;
  if (state.channel != null) allowed.channel = state.channel;
  if (state.deliveryId != null) allowed.deliveryId = state.deliveryId;
  if (state.scope != null) allowed.scope = state.scope;
  return allowed;
}

export function sanitizeNotificationAuditClientMeta(
  meta?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!meta) return null;
  const sanitized = sanitizeWorkflowAuditValue(meta) as Record<string, unknown>;
  for (const key of Object.keys(sanitized)) {
    if (PROTECTED.has(key.toLowerCase())) {
      delete sanitized[key];
    }
  }
  return sanitized;
}

export function hashNotificationAuditPayload(input: {
  eventType: string;
  previousState: NotificationAuditStateSnapshot | null;
  nextState: NotificationAuditStateSnapshot | null;
  reasonCode?: string | null;
  correlationId?: string | null;
}): string {
  const canonical = JSON.stringify({
    eventType: input.eventType,
    previousState: input.previousState,
    nextState: input.nextState,
    reasonCode: input.reasonCode ?? null,
    correlationId: input.correlationId ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function scanNotificationAuditForSecrets(
  payload: Record<string, unknown>,
): string[] {
  return scanWorkflowAuditPayloadForSecrets(payload);
}

export function snapshotFromNotification(row: {
  status: string;
  severity: string;
  lifecycleGeneration?: number;
  reopenCount?: number;
  eventType?: string;
  domain?: string;
}): NotificationAuditStateSnapshot {
  return sanitizeNotificationAuditState({
    status: row.status,
    severity: row.severity,
    lifecycleGeneration: row.lifecycleGeneration,
    reopenCount: row.reopenCount,
    eventType: row.eventType,
    domain: row.domain,
  })!;
}
