import { createHash } from 'node:crypto';
import type { OrganizationOffboardPrepareRequest } from './organization-offboarding.types';

export function fingerprintOffboardingPrepareRequest(
  input: OrganizationOffboardPrepareRequest,
): string {
  const canonical = JSON.stringify({
    idempotencyKey: input.idempotencyKey.trim(),
    note: input.note?.trim() ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}