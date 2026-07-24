import type { DataAuthorizationAuditEventKind } from '@prisma/client';

export const DATA_AUTHORIZATION_AUDIT_OUTBOX = {
  payloadVersion: 1,
  pollBatchSize: 50,
  maxAttempts: 8,
  backoffMs: 1_000,
  staleProcessingMs: 120_000,
} as const;

/** Retention windows (days) — operational enforcement via scheduled jobs (future). */
export const DATA_AUTHORIZATION_AUDIT_RETENTION_DAYS: Record<string, number> = {
  STANDARD: 90,
  EXTENDED: 365,
  LEGAL_HOLD: 0,
};

export const CRITICAL_DATA_CATEGORIES = new Set([
  'GPS_LOCATION',
  'CUSTOMER_DATA',
  'FINANCIAL_DATA',
  'HEALTH_SIGNALS',
  'DRIVING_BEHAVIOR',
]);

export const CRITICAL_DECISION_OUTCOMES = new Set(['DENY', 'SHADOW_WOULD_DENY']);

export const CRITICAL_LIFECYCLE_EVENTS = new Set([
  'ACTIVATED',
  'REVOKED',
  'SUSPENDED',
  'APPROVED',
  'REJECTED',
  'DPIA_REVIEW_DUE',
]);

export function buildAuditIdempotencyKey(parts: {
  eventKind: DataAuthorizationAuditEventKind;
  organizationId: string;
  correlationId: string;
  suffix?: string;
}): string {
  const suffix = parts.suffix ?? 'v1';
  return `data-auth-audit:${parts.organizationId}:${parts.eventKind}:${parts.correlationId}:${suffix}`;
}
