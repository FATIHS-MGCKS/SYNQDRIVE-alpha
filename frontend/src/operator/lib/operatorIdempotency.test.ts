import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearScopedIdempotencyKey,
  createOperatorIdempotencyKey,
  getOrCreateScopedIdempotencyKey,
  operatorIdempotencyHeaders,
} from './operatorIdempotency';

describe('operatorIdempotency', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
    });
  });

  it('creates scoped keys with prefix', () => {
    const key = createOperatorIdempotencyKey('handover:pickup:bk-1');
    expect(key.startsWith('handover:pickup:bk-1:')).toBe(true);
  });

  it('reuses the same scoped key within a session', () => {
    const a = getOrCreateScopedIdempotencyKey('task:complete:t1');
    const b = getOrCreateScopedIdempotencyKey('task:complete:t1');
    expect(a).toBe(b);
  });

  it('clears scoped keys after successful mutation', () => {
    const scope = 'booking:no-show:bk-1';
    const first = getOrCreateScopedIdempotencyKey(scope);
    clearScopedIdempotencyKey(scope);
    const second = getOrCreateScopedIdempotencyKey(scope);
    expect(second).not.toBe(first);
  });

  it('builds Idempotency-Key headers', () => {
    const headers = operatorIdempotencyHeaders('handover:return:bk-2');
    expect(headers['Idempotency-Key']).toBeTruthy();
  });
});
