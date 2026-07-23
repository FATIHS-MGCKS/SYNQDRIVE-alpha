import { createHash } from 'crypto';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'dataSubjectReference',
  'email',
  'phone',
  'customerId',
  'vehicleId',
  'bookingId',
  'processorId',
]);

export function pseudonymizeResourceReference(
  organizationId: string,
  resourceType: string | null | undefined,
  resourceId: string | null | undefined,
): string | null {
  if (!resourceId?.trim()) return null;
  const payload = `${organizationId}|${resourceType ?? 'NONE'}|${resourceId.trim()}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export function pseudonymizeProcessorIdentity(identity: string | null | undefined): string | null {
  if (!identity?.trim()) return null;
  return createHash('sha256').update(identity.trim()).digest('hex').slice(0, 24);
}

export function hashPolicyChecksum(input: {
  policyId?: string | null;
  policyVersion?: number | null;
  policyFamilyId?: string | null;
}): string | null {
  if (!input.policyId) return null;
  const payload = `${input.policyFamilyId ?? ''}|${input.policyId}|v${input.policyVersion ?? 0}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export function sanitizeAuditPayload(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitizeAuditPayload);

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      out[key] = sanitizeAuditPayload(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}
