import { createHash } from 'crypto';
import { WORKFLOW_AUDIT_SENSITIVE_KEYS } from './workflow-audit.constants';

const MASK = '[REDACTED]';
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/gi;
const PHONE_PATTERN = /(\+?\d[\d\s().-]{6,}\d)/g;
const DOCUMENT_NUMBER_PATTERN = /\b[A-Z]{1,3}[-\s]?\d{4,}[-\s]?[A-Z0-9]{2,}\b/gi;
const TOKEN_PATTERN = /\b(?:sk|pk|api|bearer)[-_a-z0-9]{8,}\b/gi;
const LONG_SECRET_PATTERN = /^[A-Za-z0-9+/_=-]{24,}$/;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return WORKFLOW_AUDIT_SENSITIVE_KEYS.some((candidate) => normalized.includes(candidate));
}

function maskEmail(value: string): string {
  return value.replace(EMAIL_PATTERN, (email) => {
    const [local, domain] = email.split('@');
    if (!domain) return MASK;
    const visible = local.length <= 1 ? '*' : `${local[0]}***`;
    return `${visible}@${domain}`;
  });
}

function maskPhone(value: string): string {
  return value.replace(PHONE_PATTERN, (phone) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return MASK;
    return `***${digits.slice(-4)}`;
  });
}

function maskCustomerName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return MASK;
  if (parts.length === 1) return `${parts[0]![0] ?? '*'}***`;
  return `${parts[0]![0] ?? '*'}*** ${parts[parts.length - 1]![0] ?? '*'}***`;
}

function truncateMessage(value: string, max = 120): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 3)}...`;
}

function scrubStringValue(value: string, parentKey?: string): string {
  let result = value;
  if (parentKey && /customername|customer_name|recipientname|recipient_name|fullname|full_name/i.test(parentKey)) {
    return maskCustomerName(result);
  }
  if (parentKey && /message|body|transcript|content|text/i.test(parentKey)) {
    return truncateMessage(maskEmail(maskPhone(result)));
  }
  result = result.replace(TOKEN_PATTERN, MASK);
  result = maskEmail(result);
  result = maskPhone(result);
  result = result.replace(DOCUMENT_NUMBER_PATTERN, MASK);
  if (LONG_SECRET_PATTERN.test(result)) return MASK;
  return result;
}

export function sanitizeWorkflowAuditValue(value: unknown, parentKey?: string): unknown {
  if (value == null) return value;
  if (parentKey && isSensitiveKey(parentKey)) return MASK;

  if (typeof value === 'string') {
    return scrubStringValue(value, parentKey);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeWorkflowAuditValue(item));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeWorkflowAuditValue(nested, key);
    }
    return result;
  }

  return value;
}

export function summarizeWorkflowError(error: unknown): string {
  if (error instanceof Error) {
    return scrubStringValue(error.message).slice(0, 500);
  }
  if (typeof error === 'string') {
    return scrubStringValue(error).slice(0, 500);
  }
  try {
    return scrubStringValue(JSON.stringify(sanitizeWorkflowAuditValue(error))).slice(0, 500);
  } catch {
    return 'Workflow error (summary unavailable)';
  }
}

export function summarizeWorkflowAuditPayload(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const sanitized = sanitizeWorkflowAuditValue(value);
    const json = JSON.stringify(sanitized);
    return json.length > 2_000 ? `${json.slice(0, 1_997)}...` : json;
  } catch {
    return null;
  }
}

export function hashWorkflowAuditPayload(value: unknown): string | null {
  const summary = summarizeWorkflowAuditPayload(value);
  if (!summary) return null;
  return createHash('sha256').update(summary).digest('hex');
}

export function scanWorkflowAuditPayloadForSecrets(payload: Record<string, unknown>): string[] {
  const violations: string[] = [];
  const walk = (value: unknown, path = ''): void => {
    if (value == null) return;
    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        const nextPath = path ? `${path}.${key}` : key;
        if (isSensitiveKey(key)) {
          if (nested !== MASK) violations.push(nextPath);
          continue;
        }
        walk(nested, nextPath);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (typeof value === 'string') {
      if (TOKEN_PATTERN.test(value) || LONG_SECRET_PATTERN.test(value)) {
        violations.push(path || '(root)');
      }
    }
  };
  walk(payload);
  return violations;
}

export function redactWorkflowRunPayload<T>(payload: T): T {
  return sanitizeWorkflowAuditValue(payload) as T;
}
