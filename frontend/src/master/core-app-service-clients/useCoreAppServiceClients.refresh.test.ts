// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useCoreAppServiceClients, useCoreAppServiceOrgGrants } from './useCoreAppServiceClients';

vi.mock('../../lib/api', () => ({
  api: {
    admin: {
      coreAppServiceClients: {
        list: vi.fn(),
        listOrgGrants: vi.fn(),
      },
    },
  },
}));

import { api } from '../../lib/api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const emptyList = { contractVersion: 'core.app.service_client.admin.v1', items: [] };

describe('useCoreAppServiceClients refresh sync', () => {
  beforeEach(() => {
    vi.mocked(api.admin.coreAppServiceClients.list).mockReset();
    vi.mocked(api.admin.coreAppServiceClients.list).mockResolvedValue(emptyList);
  });

  it('throwOnFailure rejects on active list refresh failure', async () => {
    const { result, unmount } = renderHook(() => useCoreAppServiceClients());
    await waitForHook(() => result.current.loading === false);

    vi.mocked(api.admin.coreAppServiceClients.list).mockRejectedValueOnce(new Error('list down'));
    await act(async () => {
      await expect(result.current.refresh({ throwOnFailure: true })).rejects.toThrow('list down');
    });
    unmount();
  });

  it('stale list failure does not throw when throwOnFailure is set', async () => {
    const { result, unmount } = renderHook(() => useCoreAppServiceClients());
    await waitForHook(() => result.current.loading === false);

    const first = deferred<typeof emptyList>();
    const second = deferred<typeof emptyList>();
    let raceCall = 0;
    vi.mocked(api.admin.coreAppServiceClients.list).mockImplementation(() => {
      raceCall += 1;
      return raceCall === 1 ? first.promise : second.promise;
    });

    let staleRefresh!: Promise<void>;
    let freshRefresh!: Promise<void>;
    await act(async () => {
      staleRefresh = result.current.refresh({ throwOnFailure: true });
      freshRefresh = result.current.refresh({ throwOnFailure: true });
    });

    second.resolve(emptyList);
    await act(async () => {
      await freshRefresh;
    });

    first.reject(new Error('stale list error'));
    await act(async () => {
      await expect(staleRefresh).resolves.toBeUndefined();
    });
    expect(result.current.error).toBeNull();
    unmount();
  });
});

describe('useCoreAppServiceOrgGrants refresh sync', () => {
  beforeEach(() => {
    vi.mocked(api.admin.coreAppServiceClients.listOrgGrants).mockReset();
    vi.mocked(api.admin.coreAppServiceClients.listOrgGrants).mockResolvedValue({
      contractVersion: 'core.app.service_client.admin.v1',
      serviceClientId: 'a',
      items: [],
    });
  });

  it('throwOnFailure rejects when grants refresh fails for active client', async () => {
    const { result, unmount } = renderHook(() => useCoreAppServiceOrgGrants('client-a'));
    await waitForHook(() => result.current.loading === false);

    vi.mocked(api.admin.coreAppServiceClients.listOrgGrants).mockRejectedValueOnce(
      new Error('grants down'),
    );
    await expect(result.current.refresh({ throwOnFailure: true })).rejects.toThrow('grants down');
    unmount();
  });

  it('stale client-A grants error does not throw after switching to client-B', async () => {
    const clientA = deferred<{
      contractVersion: string;
      serviceClientId: string;
      items: [];
    }>();
    const clientB = deferred<{
      contractVersion: string;
      serviceClientId: string;
      items: [];
    }>();
    let call = 0;
    vi.mocked(api.admin.coreAppServiceClients.listOrgGrants).mockImplementation(() => {
      call += 1;
      return call === 1 ? clientA.promise : clientB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ clientId }: { clientId: string | null }) => useCoreAppServiceOrgGrants(clientId),
      { initialProps: { clientId: 'client-a' as string | null } },
    );

    await waitForHook(() => call >= 1);
    const staleRefresh = result.current.refresh({ throwOnFailure: true });

    rerender({ clientId: 'client-b' });
    await waitForHook(() => call >= 2);

    clientB.resolve({
      contractVersion: 'core.app.service_client.admin.v1',
      serviceClientId: 'client-b',
      items: [],
    });
    await waitForHook(() => result.current.loadedForClientId === 'client-b');

    clientA.reject(new Error('stale grants error'));
    await expect(staleRefresh).resolves.toBeUndefined();
    expect(result.current.loadedForClientId).toBe('client-b');
    unmount();
  });
});