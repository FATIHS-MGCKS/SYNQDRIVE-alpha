const IDEMPOTENCY_STORAGE_PREFIX = 'synqdrive:operator:idempotency:';

/** Create a stable idempotency key for operator completion mutations. */
export function createOperatorIdempotencyKey(scope: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${scope}:${random}`;
}

/** Reuse the same key for retries of one user action (e.g. double-tap). */
export function getOrCreateScopedIdempotencyKey(scope: string): string {
  const storageKey = `${IDEMPOTENCY_STORAGE_PREFIX}${scope}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = createOperatorIdempotencyKey(scope);
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return createOperatorIdempotencyKey(scope);
  }
}

export function clearScopedIdempotencyKey(scope: string): void {
  try {
    sessionStorage.removeItem(`${IDEMPOTENCY_STORAGE_PREFIX}${scope}`);
  } catch {
    // ignore storage failures
  }
}

export function operatorIdempotencyHeaders(scope: string): Record<string, string> {
  return { 'Idempotency-Key': getOrCreateScopedIdempotencyKey(scope) };
}
