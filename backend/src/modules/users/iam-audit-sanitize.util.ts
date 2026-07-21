import { createHash } from 'crypto';
import { IAM_AUDIT_SENSITIVE_KEYS } from './iam-audit.constants';

const MASK = '[REDACTED]';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return IAM_AUDIT_SENSITIVE_KEYS.some((candidate) => normalized.includes(candidate));
}

function maskEmail(value: string): string {
  if (!EMAIL_RE.test(value)) return MASK;
  const [local, domain] = value.split('@');
  const visible = local.length <= 2 ? '*' : `${local[0]}***`;
  return `${visible}@${domain}`;
}

function sanitizePrimitive(value: unknown, key?: string): unknown {
  if (value == null) return value;
  if (key && isSensitiveKey(key)) return MASK;
  if (typeof value === 'string') {
    if (value.length >= 24 && /^[A-Za-z0-9+/_=-]+$/.test(value)) {
      return MASK;
    }
    if (EMAIL_RE.test(value)) {
      return maskEmail(value);
    }
    return value;
  }
  return value;
}

export function sanitizeIamAuditValue(value: unknown, parentKey?: string): unknown {
  const sanitized = sanitizePrimitive(value, parentKey);
  if (sanitized !== value) return sanitized;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeIamAuditValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeIamAuditValue(nested, key);
    }
    return result;
  }

  return value;
}

export function summarizeIamAuditValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const sanitized = sanitizeIamAuditValue(value);
    const json = JSON.stringify(sanitized);
    return json.length > 2_000 ? `${json.slice(0, 1_997)}...` : json;
  } catch {
    return null;
  }
}

export function hashIamAuditValue(value: unknown): string | null {
  const summary = summarizeIamAuditValue(value);
  if (!summary) return null;
  return createHash('sha256').update(summary).digest('hex');
}

export function scanIamAuditPayloadForSecrets(payload: unknown): string[] {
  const violations: string[] = [];

  const walk = (node: unknown, path: string) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (typeof node === 'object') {
      for (const [key, nested] of Object.entries(node as Record<string, unknown>)) {
        const nextPath = path ? `${path}.${key}` : key;
        if (isSensitiveKey(key)) {
          if (nested !== MASK && nested != null && nested !== '') {
            violations.push(nextPath);
          }
        }
        walk(nested, nextPath);
      }
      return;
    }
    if (typeof node === 'string' && path && isSensitiveKey(path)) {
      violations.push(path);
    }
  };

  walk(payload, '');
  return violations;
}
