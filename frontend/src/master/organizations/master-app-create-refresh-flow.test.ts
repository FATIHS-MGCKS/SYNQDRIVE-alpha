import { describe, expect, it, vi } from 'vitest';
import { classifyCreateOrgRefreshOutcome } from './organizations-operational-create-outcome';

/**
 * Mirrors handleAddOrg post-create branch when refreshOperationalList uses refreshStrict.
 */
async function simulateCreateWithOperationalRefresh(input: {
  create: () => Promise<void>;
  refreshOperationalList: () => Promise<void>;
}): Promise<{ created: boolean; refreshOutcome: 'complete' | 'partial' }> {
  await input.create();
  let refreshError: string | null = null;
  try {
    await input.refreshOperationalList();
  } catch (e) {
    refreshError = e instanceof Error ? e.message : 'refresh failed';
  }
  return {
    created: true,
    refreshOutcome: classifyCreateOrgRefreshOutcome(refreshError),
  };
}

describe('master create + operational refresh flow', () => {
  it('create succeeds + refresh succeeds => complete', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const refreshOperationalList = vi.fn().mockResolvedValue(undefined);

    const result = await simulateCreateWithOperationalRefresh({ create, refreshOperationalList });

    expect(create).toHaveBeenCalledTimes(1);
    expect(refreshOperationalList).toHaveBeenCalledTimes(1);
    expect(result.refreshOutcome).toBe('complete');
  });

  it('create succeeds + refresh fails => partial (warning path)', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const refreshOperationalList = vi.fn().mockRejectedValue(new Error('list unavailable'));

    const result = await simulateCreateWithOperationalRefresh({ create, refreshOperationalList });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.refreshOutcome).toBe('partial');
  });

  it('create fails => no refresh, no success', async () => {
    const create = vi.fn().mockRejectedValue(new Error('validation'));
    const refreshOperationalList = vi.fn();

    await expect(
      simulateCreateWithOperationalRefresh({ create, refreshOperationalList }),
    ).rejects.toThrow('validation');

    expect(refreshOperationalList).not.toHaveBeenCalled();
  });
});