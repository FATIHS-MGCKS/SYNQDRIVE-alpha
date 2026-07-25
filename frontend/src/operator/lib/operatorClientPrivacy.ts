/**
 * Operator client privacy helpers — no durable local storage of sensitive evidence.
 */

const OPERATOR_SENSITIVE_STORAGE_PREFIX = 'synqdrive:operator:';

export const OPERATOR_EPHEMERAL_STORAGE_KEYS = [
  `${OPERATOR_SENSITIVE_STORAGE_PREFIX}handover-draft`,
  `${OPERATOR_SENSITIVE_STORAGE_PREFIX}signature`,
  `${OPERATOR_SENSITIVE_STORAGE_PREFIX}damage-photo`,
] as const;

export function assertNoOperatorSensitiveLocalStorage(): void {
  if (typeof window === 'undefined') return;
  for (const key of OPERATOR_EPHEMERAL_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      // Storage may be blocked in private mode — ignore.
    }
  }
}

export function purgeOperatorSensitiveSessionState<T extends Record<string, unknown>>(
  state: T,
  sensitiveKeys: (keyof T)[],
): T {
  const next = { ...state };
  for (const key of sensitiveKeys) {
    if (key in next) {
      (next as Record<string, unknown>)[key as string] = null;
    }
  }
  return next;
}

export function isOperatorSensitiveStorageKey(key: string): boolean {
  return key.startsWith(OPERATOR_SENSITIVE_STORAGE_PREFIX);
}
