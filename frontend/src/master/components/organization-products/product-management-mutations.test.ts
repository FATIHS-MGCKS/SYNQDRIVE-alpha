import { describe, expect, it, vi } from 'vitest';
import { applyMasterProductApiResult } from './product-management-mutations';

describe('applyMasterProductApiResult', () => {
  it('awaits success refresh before returning', async () => {
    const order: string[] = [];
    const onSuccess = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('refresh');
    });
    const setError = vi.fn();
    const ok = await applyMasterProductApiResult(200, undefined, onSuccess, setError);
    expect(ok).toBe(true);
    expect(order).toEqual(['refresh']);
    expect(setError).not.toHaveBeenCalled();
  });

  it('surfaces refresh failure after HTTP success', async () => {
    const setError = vi.fn();
    await expect(
      applyMasterProductApiResult(
        204,
        undefined,
        async () => {
          throw new Error('refresh failed');
        },
        setError,
      ),
    ).rejects.toThrow('refresh failed');
    expect(setError).toHaveBeenCalledWith('refresh failed');
  });

  it('maps 409 without running refresh', async () => {
    const onSuccess = vi.fn();
    const setError = vi.fn();
    const ok = await applyMasterProductApiResult(409, 'conflict', onSuccess, setError);
    expect(ok).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalled();
  });
});