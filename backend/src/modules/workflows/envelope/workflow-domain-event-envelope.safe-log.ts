const SECRET_KEY_PATTERN =
  /(api[_-]?key|secret|token|password|authorization|bearer|private[_-]?key|webhook[_-]?secret|credential)/i;

const PII_KEY_PATTERN =
  /^(email|e[-_]?mail|phone|mobile|name|firstName|lastName|fullName|address|street|customerName|recipientEmail|recipientPhone|iban|dateOfBirth|licenseNumber)$/i;

const DIRECT_PII_KEYS = new Set([
  'email',
  'phone',
  'phoneNumber',
  'firstName',
  'lastName',
  'fullName',
  'name',
  'address',
  'street',
  'iban',
  'dateOfBirth',
  'licenseNumber',
]);

export function containsMetadataSecrets(
  metadata: Record<string, unknown>,
  path = 'metadata',
): string | null {
  for (const [key, value] of Object.entries(metadata)) {
    const childPath = `${path}.${key}`;
    if (SECRET_KEY_PATTERN.test(key) && value != null && value !== '') {
      return childPath;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = containsMetadataSecrets(value as Record<string, unknown>, childPath);
      if (nested) return nested;
    }
  }
  return null;
}

function maskValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    return '[REDACTED:secret]';
  }
  if (PII_KEY_PATTERN.test(key) || DIRECT_PII_KEYS.has(key)) {
    if (typeof value === 'string' && value.length > 4) {
      return `[REDACTED:pii:${value.length}]`;
    }
    return '[REDACTED:pii]';
  }
  return value;
}

function deepSanitizeForLog(value: unknown, path = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item, i) => deepSanitizeForLog(item, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (SECRET_KEY_PATTERN.test(key)) {
        output[key] = '[REDACTED:secret]';
        continue;
      }
      if (PII_KEY_PATTERN.test(key)) {
        output[key] = maskValue(key, child);
        continue;
      }
      output[key] = deepSanitizeForLog(child, childPath);
    }
    return output;
  }
  return value;
}

import type { WorkflowDomainEventEnvelope } from './workflow-domain-event-envelope.types';

/**
 * Safe logging representation — masks PII and secrets.
 * Never log raw payloads in production without this helper.
 */
export function toSafeLogEnvelope(envelope: WorkflowDomainEventEnvelope): Record<string, unknown> {
  return {
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    eventVersion: envelope.eventVersion,
    organizationId: envelope.organizationId,
    occurredAt: envelope.occurredAt,
    receivedAt: envelope.receivedAt,
    entityType: envelope.entityType,
    entityId: envelope.entityId,
    correlationId: envelope.correlationId,
    causationId: envelope.causationId,
    source: envelope.source,
    schemaVersion: envelope.schemaVersion,
    legacySourceKey: envelope.legacySourceKey,
    payload: deepSanitizeForLog(envelope.payload),
    metadata: deepSanitizeForLog(envelope.metadata),
  };
}

export function toSafeLogString(envelope: WorkflowDomainEventEnvelope): string {
  return JSON.stringify(toSafeLogEnvelope(envelope));
}

/**
 * PII classification documentation helper.
 * Returns keys in payload/metadata classified as direct PII (should not appear).
 */
export function classifyPiiKeys(data: Record<string, unknown>): {
  direct: string[];
  indirect: string[];
} {
  const direct: string[] = [];
  const indirect: string[] = [];

  for (const key of Object.keys(data)) {
    if (DIRECT_PII_KEYS.has(key) || PII_KEY_PATTERN.test(key)) {
      direct.push(key);
    } else if (key === 'recipientRef' || key.endsWith('Ref')) {
      indirect.push(key);
    }
  }

  return { direct, indirect };
}
