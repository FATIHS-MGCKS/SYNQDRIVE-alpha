// @vitest-environment happy-dom
import { act } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test/renderHook';
import * as admission from './master-identity-privileged-admission';
import { MASTER_IDENTITY_STEP_UP_ACTION } from './master-identity-privileged-admission';
import { useMasterIdentityPrivilegedMutations } from './useMasterIdentityPrivilegedMutations';

describe('useMasterIdentityPrivilegedMutations', () => {
  const baseOp = {
    kind: 'create' as const,
    action: MASTER_IDENTITY_STEP_UP_ACTION,
    dialogGeneration: 1,
    operationKey: 'op-key-1',
    onboardingMode: 'identity' as const,
    payload: { email: 'a@b.test', idempotencyKey: 'op-key-1' },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retains pending on STEP_UP_REQUIRED and retries with frozen op', async () => {
    const onSuccess = vi.fn();
    const executeSpy = vi
      .spyOn(admission, 'executeIdentityPrivilegedMutation')
      .mockRejectedValueOnce(new Error('[STEP_UP_REQUIRED] MFA'))
      .mockResolvedValueOnce({ user: { id: 'u1' } });

    const { result } = renderHook(() => useMasterIdentityPrivilegedMutations());

    await expect(
      result.current.runWithStepUp({
        op: baseOp,
        assertStillAdmitted: () => true,
        onSuccess,
      }),
    ).rejects.toThrow('STEP_UP_REQUIRED');

    expect(result.current.hasPending()).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ operationKey: 'op-key-1', payload: expect.objectContaining({ email: 'a@b.test' }) }),
    );

    await act(async () => {
      const retried = await result.current.retryPendingAfterStepUp();
      expect(retried).toBe(true);
    });

    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.hasPending()).toBe(false);
  });

  it('rejects stale admission before API call on retry', async () => {
    const executeSpy = vi
      .spyOn(admission, 'executeIdentityPrivilegedMutation')
      .mockRejectedValueOnce(new Error('[STEP_UP_REQUIRED] MFA'));

    const { result } = renderHook(() => useMasterIdentityPrivilegedMutations());
    let admit = true;
    const onSuccess = vi.fn();

    await expect(
      result.current.runWithStepUp({
        op: baseOp,
        assertStillAdmitted: () => admit,
        onSuccess,
      }),
    ).rejects.toThrow('STEP_UP_REQUIRED');

    admit = false;
    await expect(result.current.retryPendingAfterStepUp()).rejects.toThrow('IDENTITY_ADMISSION_STALE');
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.hasPending()).toBe(false);
  });
});