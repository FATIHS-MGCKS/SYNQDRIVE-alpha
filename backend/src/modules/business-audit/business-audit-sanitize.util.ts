import { createHash } from 'crypto';
import { BUSINESS_AUDIT_SENSITIVE_KEYS } from './business-audit.constants';

const MASK = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BUSINESS_AUDIT_SENSITIVE_KEYS.some((candidate) => normalized.includes(candidate));
}

export function sanitizeBusinessAuditValue(value: unknown, parentKey?: string): unknown {
  if (value == null) return value;
  if (parentKey && isSensitiveKey(parentKey)) return MASK;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBusinessAuditValue(item));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeBusinessAuditValue(nested, key);
    }
    return result;
  }

  if (typeof value === 'string' && value.length >= 24 && /^[A-Za-z0-9+/_=-]+$/.test(value)) {
    return MASK;
  }

  return value;
}

export function summarizeBusinessAuditValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const sanitized = sanitizeBusinessAuditValue(value);
    const json = JSON.stringify(sanitized);
    return json.length > 2_000 ? `${json.slice(0, 1_997)}...` : json;
  } catch {
    return null;
  }
}

export function hashBusinessAuditValue(value: unknown): string | null {
  const summary = summarizeBusinessAuditValue(value);
  if (!summary) return null;
  return createHash('sha256').update(summary).digest('hex');
}

function collectSecretViolations(
  value: unknown,
  path = '',
  violations: string[] = [],
): string[] {
  if (value == null) return violations;

  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (isSensitiveKey(key)) {
        if (nested !== MASK) {
          violations.push(nextPath);
        }
        continue;
      }
      collectSecretViolations(nested, nextPath, violations);
    }
    return violations;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSecretViolations(item, `${path}[${index}]`, violations));
  }

  return violations;
}

export function scanBusinessAuditPayloadForSecrets(payload: Record<string, unknown>): string[] {
  return collectSecretViolations(payload);
}
