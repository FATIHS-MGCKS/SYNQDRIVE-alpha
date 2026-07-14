export function computeInvoiceProcessRetryAt(
  attemptCount: number,
  baseBackoffMs: number,
): Date {
  const exponent = Math.max(0, attemptCount - 1);
  const delayMs = baseBackoffMs * Math.pow(2, exponent);
  const cappedMs = Math.min(delayMs, 6 * 60 * 60_000);
  return new Date(Date.now() + cappedMs);
}

export function buildProcessIdempotencyKey(
  processType: string,
  entityType: string,
  entityId: string,
  suffix?: string,
): string {
  const base = `${processType}:${entityType}:${entityId}`;
  return suffix ? `${base}:${suffix}` : base;
}
