// @vitest-environment happy-dom
import { act } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test/renderHook';
import { useMasterOrganizationPatch } from './useMasterOrganizationPatch';

const updateMock = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    organizations: {
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

describe('useMasterOrganizationPatch', () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  it('retains pending intent on STEP_UP_REQUIRED and retries once after MFA', async () => {
    updateMock
      .mockRejectedValueOnce(new Error('[STEP_UP_REQUIRED] MFA'))
      .mockResolvedValueOnce({ id: 'org-1' });

    const { result } = renderHook(() => useMasterOrganizationPatch());
    const onSuccess = vi.fn();

    await expect(
      result.current.patchOrganization('org-1', { status: 'SUSPENDED' }, { onSuccess }),
    ).rejects.toThrow('STEP_UP_REQUIRED');

    expect(result.current.hasPending()).toBe(true);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      const retried = await result.current.retryPendingAfterStepUp();
      expect(retried).toBe(true);
    });

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.hasPending()).toBe(false);
  });

  it('blocks duplicate in-flight patch', async () => {
    let resolveFirst: (v: unknown) => void = () => undefined;
    updateMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { result } = renderHook(() => useMasterOrganizationPatch());

    let secondError: unknown;
    const first = result.current.patchOrganization('org-1', { status: 'ACTIVE' });
    await act(async () => {
      try {
        await result.current.patchOrganization('org-1', { status: 'ACTIVE' });
      } catch (e) {
        secondError = e;
      }
    });

    expect(secondError).toBeInstanceOf(Error);
    expect((secondError as Error).message).toBe('ORG_PATCH_IN_FLIGHT');

    resolveFirst({});
    await act(async () => {
      await first;
    });
  });

  it('clearPending drops retry', async () => {
    updateMock.mockRejectedValueOnce(new Error('[STEP_UP_REQUIRED] MFA'));
    const { result } = renderHook(() => useMasterOrganizationPatch());

    await expect(result.current.patchOrganization('org-1', { status: 'ACTIVE' })).rejects.toThrow();
    expect(result.current.hasPending()).toBe(true);

    act(() => result.current.clearPending());
    expect(result.current.hasPending()).toBe(false);

    await act(async () => {
      const retried = await result.current.retryPendingAfterStepUp();
      expect(retried).toBe(false);
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});