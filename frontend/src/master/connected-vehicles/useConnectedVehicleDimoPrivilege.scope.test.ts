// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useConnectedVehicleDimoPrivilege } from './useConnectedVehicleDimoPrivilege';

const getStatus = vi.fn();
const recheck = vi.fn();
const handoff = vi.fn();
const idempotencyKeys: string[] = [];

vi.mock('../../lib/mfa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/mfa')>();
  return {
    ...actual,
    newIdempotencyKey: () => {
      const key = `dimo-owner-handoff:mock-${idempotencyKeys.length + 1}`;
      idempotencyKeys.push(key);
      return key;
    },
    isStepUpRequiredError: (err: unknown) =>
      err instanceof Error && err.message.includes('STEP_UP_REQUIRED'),
  };
});

vi.mock('../../lib/api', () => ({
  api: {
    organizations: {
      offboarding: {
        getDimoPrivilegeStatus: (...args: unknown[]) => getStatus(...args),
        recheckDimoPrivilege: (...args: unknown[]) => recheck(...args),
        recordDimoOwnerHandoff: (...args: unknown[]) => handoff(...args),
      },
    },
  },
}));

const statusDto = {
  organizationId: 'org-1',
  jobId: 'job',
  jobStatus: 'PREPARED',
  phase: null,
  lastVerifiedAt: null,
  providerCheckStatus: 'NOT_VERIFIED',
  finalizationState: null,
  detailCode: null,
  vehicles: [{ vehicleId: 'v-a', tokenId: 1, localConnectionStatus: null, consentStatus: null, stillPrivileged: null, verificationStatus: 'UNVERIFIED' }],
};

describe('useConnectedVehicleDimoPrivilege vehicle scope', () => {
  beforeEach(() => {
    getStatus.mockReset();
    recheck.mockReset();
    handoff.mockReset();
    idempotencyKeys.length = 0;
    getStatus.mockResolvedValue(statusDto);
  });

  it('issues a new handoff idempotency key when vehicle changes', async () => {
    const { result, rerender } = renderHook(
      ({ vehicleId }) => useConnectedVehicleDimoPrivilege('org-1', vehicleId, true),
      { initialProps: { vehicleId: 'v-a' } },
    );
    await waitForHook(() => !result.current.loading);

    const keyA1 = result.current.prepareHandoffIdempotency();
    const keyA2 = result.current.prepareHandoffIdempotency();
    expect(keyA1).toBe(keyA2);

    rerender({ vehicleId: 'v-b' });
    await waitForHook(() => result.current.prepareHandoffIdempotency() !== keyA1);
    expect(result.current.prepareHandoffIdempotency()).toBe('dimo-owner-handoff:mock-2');
  });

  it('preserves idempotency key for legitimate same-vehicle handoff retry', async () => {
    handoff
      .mockRejectedValueOnce(new Error('STEP_UP_REQUIRED'))
      .mockResolvedValueOnce({ idempotentReplay: false, handoffsRecorded: 1, handoff: {} });

    const { result } = renderHook(() => useConnectedVehicleDimoPrivilege('org-1', 'v-a', true));
    await waitForHook(() => !result.current.loading);

    const key = result.current.prepareHandoffIdempotency();
    await act(async () => {
      await result.current.runHandoff();
    });
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(handoff).toHaveBeenLastCalledWith(
      'org-1',
      expect.objectContaining({ idempotencyKey: key, vehicleIds: ['v-a'] }),
    );

    await act(async () => {
      await result.current.retryAfterMfa();
    });
    expect(handoff).toHaveBeenCalledTimes(2);
    expect(handoff).toHaveBeenLastCalledWith(
      'org-1',
      expect.objectContaining({ idempotencyKey: key, vehicleIds: ['v-a'] }),
    );
  });

  it('does not replay MFA handoff for a different vehicle', async () => {
    handoff.mockRejectedValueOnce(new Error('STEP_UP_REQUIRED'));

    const { result, rerender } = renderHook(
      ({ vehicleId }) => useConnectedVehicleDimoPrivilege('org-1', vehicleId, true),
      { initialProps: { vehicleId: 'v-a' } },
    );
    await waitForHook(() => !result.current.loading);

    result.current.prepareHandoffIdempotency();
    await act(async () => {
      await result.current.runHandoff();
    });
    expect(result.current.mfaRequired).toBe(true);

    rerender({ vehicleId: 'v-b' });
    await waitForHook(() => !result.current.mfaRequired);

    await act(async () => {
      await result.current.retryAfterMfa();
    });
    expect(handoff).toHaveBeenCalledTimes(1);
  });

  it('drops stale handoff success when vehicle changes during request', async () => {
    let resolveHandoff!: (v: unknown) => void;
    handoff.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveHandoff = resolve;
      }),
    );

    const { result, rerender } = renderHook(
      ({ vehicleId }) => useConnectedVehicleDimoPrivilege('org-1', vehicleId, true),
      { initialProps: { vehicleId: 'v-a' } },
    );
    await waitForHook(() => !result.current.loading);

    const key = result.current.prepareHandoffIdempotency();
    void result.current.runHandoff();
    rerender({ vehicleId: 'v-b' });

    await act(async () => {
      resolveHandoff({ idempotentReplay: false, handoffsRecorded: 1, handoff: { handoffId: 'h1', idempotencyKey: key } });
      await Promise.resolve();
    });

    await waitForHook(() => result.current.handoffResult === null);
  });
});