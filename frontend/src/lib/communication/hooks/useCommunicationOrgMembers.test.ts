// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useCommunicationOrgMembers } from './useCommunicationOrgMembers';

const listByOrg = vi.fn();

vi.mock('../../api', () => ({
  api: {
    users: {
      listByOrg: (...args: unknown[]) => listByOrg(...args),
    },
  },
}));

describe('useCommunicationOrgMembers org race', () => {
  afterEach(() => {
    listByOrg.mockReset();
  });

  it('rejects stale Org A response after switch to Org B', async () => {
    let resolveA: (value: unknown) => void = () => undefined;
    const pendingA = new Promise((resolve) => {
      resolveA = resolve;
    });

    listByOrg.mockImplementation((orgId: string) => {
      if (orgId === 'org-a') return pendingA;
      return Promise.resolve([
        {
          id: 'user-b',
          displayName: 'Org B User',
          status: 'Active',
          membershipStatus: 'ACTIVE',
        },
      ]);
    });

    const { result, rerender } = renderHook(
      ({ orgId }) => useCommunicationOrgMembers(orgId),
      { initialProps: { orgId: 'org-a' as string | null } },
    );

    await act(async () => {
      void result.current.ensureLoaded();
    });

    rerender({ orgId: 'org-b' });
    expect(result.current.members).toEqual([]);

    await act(async () => {
      resolveA([
        {
          id: 'user-a',
          displayName: 'Org A User',
          status: 'Active',
          membershipStatus: 'ACTIVE',
        },
      ]);
      await pendingA;
    });

    expect(result.current.members).toEqual([]);
    expect(result.current.isLoaded).toBe(false);

    await act(async () => {
      await result.current.ensureLoaded();
    });

    await waitForHook(() =>
      result.current.members.length === 1
      && result.current.members[0]?.id === 'user-b',
    );
    expect(result.current.isLoaded).toBe(true);
  });

  it('ignores late Org A response after A→B→A with newer A request', async () => {
    let resolveA1: (value: unknown) => void = () => undefined;
    const pendingA1 = new Promise((resolve) => {
      resolveA1 = resolve;
    });
    let orgACalls = 0;

    listByOrg.mockImplementation((orgId: string) => {
      if (orgId === 'org-a') {
        orgACalls += 1;
        if (orgACalls === 1) return pendingA1;
        return Promise.resolve([
          {
            id: 'user-a2',
            displayName: 'Org A User 2',
            status: 'Active',
            membershipStatus: 'ACTIVE',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const { result, rerender } = renderHook(
      ({ orgId }) => useCommunicationOrgMembers(orgId),
      { initialProps: { orgId: 'org-a' as string | null } },
    );

    await act(async () => {
      void result.current.ensureLoaded();
    });

    rerender({ orgId: 'org-b' });
    rerender({ orgId: 'org-a' });

    await act(async () => {
      await result.current.ensureLoaded();
    });

    await waitForHook(() =>
      result.current.members.length === 1
      && result.current.members[0]?.id === 'user-a2',
    );

    await act(async () => {
      resolveA1([
        {
          id: 'user-a1',
          displayName: 'Org A User 1',
          status: 'Active',
          membershipStatus: 'ACTIVE',
        },
      ]);
      await pendingA1;
    });

    expect(result.current.members).toEqual([
      { id: 'user-a2', displayName: 'Org A User 2', isActive: true },
    ]);
  });

  it('maps 403 to permission_denied without retry loop', async () => {
    listByOrg.mockRejectedValue({ status: 403, message: 'API error 403' });

    const { result } = renderHook(() => useCommunicationOrgMembers('org-a'));

    await act(async () => {
      await result.current.ensureLoaded();
    });

    expect(result.current.loadError).toBe('permission_denied');
    expect(result.current.canLoadDirectory).toBe(false);
    expect(result.current.members).toEqual([]);
  });
});
