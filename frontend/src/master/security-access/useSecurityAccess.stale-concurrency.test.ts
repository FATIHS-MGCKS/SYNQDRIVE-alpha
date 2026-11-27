// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useSecurityUsers, useSecurityUserDetail } from './useSecurityAccess';

const listUsers = vi.fn();
const getUser = vi.fn();
const listUserSessions = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    admin: {
      securityAccess: {
        listUsers: (...args: unknown[]) => listUsers(...args),
        getUser: (...args: unknown[]) => getUser(...args),
        listUserSessions: (...args: unknown[]) => listUserSessions(...args),
      },
    },
  },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const loadError = (k: string) => `err-${k}`;

describe('useSecurityAccess stale concurrency (USR-P1B)', () => {
  beforeEach(() => {
    listUsers.mockReset();
    getUser.mockReset();
    listUserSessions.mockReset();
  });

  it('ignores stale listUsers response when query changes', async () => {
    let resolveFirst!: (v: unknown) => void;

    const pageB = {
      data: [{ id: 'u-b', name: 'B', email: 'b@example.com' }],
      meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
    };

    listUsers.mockImplementation((query: { search?: string }) => {
      if (query.search === 'a') {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(pageB);
    });

    const queryA = { page: 1, limit: 25, search: 'a' };
    const queryB = { page: 1, limit: 25, search: 'b' };

    const { result, rerender } = renderHook(
      ({ query }) => useSecurityUsers(query, true, loadError),
      { initialProps: { query: queryA } },
    );

    await act(async () => {
      rerender({ query: queryB });
      await Promise.resolve();
    });
    await waitForHook(() => listUsers.mock.calls.length >= 2);
    await waitForHook(() => result.current.result?.data?.[0]?.id === 'u-b');

    await act(async () => {
      resolveFirst({
        data: [{ id: 'u-a', name: 'A', email: 'a@example.com' }],
        meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
      });
      await Promise.resolve();
    });

    expect(result.current.result?.data?.[0]?.id).toBe('u-b');
  });

  it('does not show user A detail when switching to B during delayed fetch', async () => {
    let resolveA!: (v: unknown) => void;

    const detailB = {
      id: 'user-b',
      name: 'B',
      email: 'b@test.com',
      createdAt: '2020-01-01T00:00:00Z',
      memberships: [],
      mfa: { state: 'ENABLED' },
    };

    getUser.mockImplementation((userId: string) => {
      if (userId === 'user-a') {
        return new Promise((resolve) => {
          resolveA = resolve;
        });
      }
      return Promise.resolve(detailB);
    });

    listUserSessions.mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ userId }) => useSecurityUserDetail(userId, loadError),
      { initialProps: { userId: 'user-a' as string | null } },
    );

    await act(async () => {
      rerender({ userId: 'user-b' });
      await Promise.resolve();
    });
    await waitForHook(() => getUser.mock.calls.length >= 2);
    await waitForHook(() => result.current.detail?.id === 'user-b');

    await act(async () => {
      resolveA({
        id: 'user-a',
        name: 'A',
        email: 'a@test.com',
        createdAt: '2020-01-01T00:00:00Z',
        memberships: [],
        mfa: { state: 'ENABLED' },
      });
      await Promise.resolve();
    });

    expect(result.current.detail?.id).toBe('user-b');
  });

  it('sets sessionsError instead of implying empty sessions on failure', async () => {
    getUser.mockResolvedValue({
      id: 'u1',
      name: 'U',
      email: 'u@test.com',
      createdAt: '2020-01-01T00:00:00Z',
      memberships: [],
      mfa: { state: 'ENABLED' },
    });
    listUserSessions.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useSecurityUserDetail('u1', loadError));

    await waitForHook(() => result.current.sessionsError != null);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.sessionsError).toBe('err-users');
  });
});