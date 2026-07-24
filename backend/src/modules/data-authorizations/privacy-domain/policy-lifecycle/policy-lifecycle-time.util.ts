/**
 * Server-side, timezone-safe temporal helpers for policy lifecycle.
 * All comparisons use UTC epoch milliseconds — validFrom/validUntil are stored as timestamptz.
 */

export function policyLifecycleNow(): Date {
  return new Date();
}

export function isPolicyPastValidUntil(
  validUntil: Date | null | undefined,
  now: Date = policyLifecycleNow(),
): boolean {
  if (!validUntil) return false;
  return validUntil.getTime() <= now.getTime();
}

export function isPolicyFutureValidFrom(
  validFrom: Date | null | undefined,
  now: Date = policyLifecycleNow(),
): boolean {
  if (!validFrom) return false;
  return validFrom.getTime() > now.getTime();
}

export function buildExpiryIdempotencyKey(parts: {
  entityKind: string;
  policyId: string;
  validUntil: Date;
}): string {
  return `policy-expiry:${parts.entityKind}:${parts.policyId}:${parts.validUntil.toISOString()}`;
}
