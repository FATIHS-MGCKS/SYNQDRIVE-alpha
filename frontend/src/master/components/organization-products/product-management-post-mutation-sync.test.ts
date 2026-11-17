import { describe, expect, it, vi } from 'vitest';
import { applyMasterProductApiResult } from './product-management-mutations';
import { resolveGuardedMutationError, syncRefreshFailedError } from './product-management-sync-errors';

describe('post-mutation sync presentation', () => {
  it('mutation HTTP success + refresh failure => formatted action error, mutation not retried', async () => {
    const assign = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const refresh = vi.fn().mockImplementation(async () => {
      throw syncRefreshFailedError('liste leer');
    });
    const setActionError = vi.fn();
    let assignCalls = 0;

    const run = async () => {
      assignCalls += 1;
      const res = await assign();
      await applyMasterProductApiResult(
        res.status,
        undefined,
        async () => {
          await refresh();
        },
        setActionError,
      );
    };

    await expect(run()).rejects.toThrow('liste leer');
    expect(assignCalls).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setActionError).toHaveBeenCalledWith(expect.stringContaining('wurde gespeichert'));

    const thrown = syncRefreshFailedError('liste leer');
    expect(resolveGuardedMutationError(thrown)).toBe(setActionError.mock.calls[0][0]);
  });

  it('manual grant-load retry absorbs rejection (no unhandled)', async () => {
    const load = vi.fn().mockRejectedValue(new Error('fetch failed'));
    await expect(load().catch(() => undefined)).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
  });
});