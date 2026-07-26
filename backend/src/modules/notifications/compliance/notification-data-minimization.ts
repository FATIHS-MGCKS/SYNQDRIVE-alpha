import { NOTIFICATION_BLOCKED_STORAGE_KEYS } from './notification-data-classification';

export type JsonRecord = Record<string, string | number | boolean | null>;

const ALLOWED_OCCURRENCE_METADATA_KEYS = new Set([
  'runId',
  'adapterId',
  'reason',
  'cleared',
  'bookedOut',
  'resolvedBy',
  'triggeringNotificationId',
  'recovery',
  'severityBefore',
]);

/**
 * Strip direct PII and secrets from template params before persistence.
 * Entity IDs remain in actionTarget for operational deep links.
 */
export function minimizeTemplateParams(
  params: JsonRecord | null | undefined,
): JsonRecord {
  if (!params || typeof params !== 'object') return {};
  const minimized: JsonRecord = {};
  for (const [key, value] of Object.entries(params)) {
    if (NOTIFICATION_BLOCKED_STORAGE_KEYS.has(key)) continue;
    if (value === undefined) continue;
    minimized[key] = value;
  }
  return minimized;
}

export function minimizeOccurrencePayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const minimized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_OCCURRENCE_METADATA_KEYS.has(key)) continue;
    if (NOTIFICATION_BLOCKED_STORAGE_KEYS.has(key)) continue;
    minimized[key] = value;
  }
  return minimized;
}

export function minimizeActionTarget(
  target: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!target || typeof target !== 'object') return {};
  const copy = { ...target };
  delete copy.customerEmail;
  delete copy.customerPhone;
  delete copy.customerName;
  return copy;
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Sanitize provider/outbox error text for logs and persistence. */
export function sanitizeDeliveryErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  let sanitized = message.replace(EMAIL_PATTERN, '[email]');
  if (sanitized.length > 500) {
    sanitized = `${sanitized.slice(0, 497)}...`;
  }
  return sanitized;
}

/** Metrics/log labels must never include free-text PII. */
export function toSafeMetricLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
}

export function anonymizeTemplateParams(
  params: JsonRecord | null | undefined,
): JsonRecord {
  const base = minimizeTemplateParams(params);
  const anonymized: JsonRecord = {};
  for (const key of Object.keys(base)) {
    anonymized[key] = null;
  }
  anonymized.redacted = true;
  return anonymized;
}
