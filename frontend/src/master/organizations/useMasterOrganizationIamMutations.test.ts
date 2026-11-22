// @vitest-environment happy-dom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../test/renderHook';
import { useMasterOrganizationIamMutations } from './useMasterOrganizationIamMutations';

describe('useMasterOrganizationIamMutations', () => {
  it('retains pending on STEP_UP_REQUIRED and retries once after MFA', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('[STEP_UP_REQUIRED] MFA'))
      .mockResolvedValueOnce(undefined);
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useMasterOrganizationIamMutations());

    await expect(
      result.current.runWithStepUp(run, { onSuccess }),
    ).rejects.toThrow('STEP_UP_REQUIRED');

    expect(result.current.hasPending()).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      const retried = await result.current.retryPendingAfterStepUp();
      expect(retried).toBe(true);
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.hasPending()).toBe(false);
  });
});