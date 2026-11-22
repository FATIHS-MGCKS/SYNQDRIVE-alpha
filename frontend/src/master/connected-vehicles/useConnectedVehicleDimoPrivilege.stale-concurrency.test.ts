// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useConnectedVehicleDimoPrivilege } from './useConnectedVehicleDimoPrivilege';

const getStatus = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    organizations: {
      offboarding: {
        getDimoPrivilegeStatus: (...args: unknown[]) => getStatus(...args),
        recheckDimoPrivilege: vi.fn(),
        recordDimoOwnerHandoff: vi.fn(),
      },
    },
  },
}));

describe('useConnectedVehicleDimoPrivilege stale concurrency', () => {
  beforeEach(() => {
    getStatus.mockReset();
  });

  it('ignores stale GET when organization changes', async () => {
    let resolveFirst!: (v: unknown) => void;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    getStatus
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        organizationId: 'org-b',
        jobId: 'job-b',
        jobStatus: 'PREPARED',
        phase: null,
        lastVerifiedAt: null,
        providerCheckStatus: 'NOT_VERIFIED',
        finalizationState: null,
        detailCode: null,
        vehicles: [],
      });

    const { result, rerender, unmount } = renderHook(
      ({ orgId, vehicleId }) => useConnectedVehicleDimoPrivilege(orgId, vehicleId, true),
      { initialProps: { orgId: 'org-a', vehicleId: 'v1' } },
    );

    rerender({ orgId: 'org-b', vehicleId: 'v1' });
    await waitForHook(() => getStatus.mock.calls.length >= 2);

    await act(async () => {
      resolveFirst({
        organizationId: 'org-a',
        jobId: 'job-a',
        jobStatus: 'PREPARED',
        phase: null,
        lastVerifiedAt: null,
        providerCheckStatus: 'PRIVILEGE_STILL_ACTIVE',
        finalizationState: null,
        detailCode: null,
        vehicles: [],
      });
      await Promise.resolve();
    });

    await waitForHook(() => result.current.status?.organizationId === 'org-b');
    expect(result.current.status?.organizationId).toBe('org-b');
    unmount();
  });
});