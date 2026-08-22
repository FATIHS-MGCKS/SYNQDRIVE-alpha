// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useWhatsAppBusinessSettings } from './useWhatsAppBusinessSettings';

vi.mock('../../../lib/api', () => ({
  api: {
    whatsapp: {
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      simulateIncoming: vi.fn(),
    },
  },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

import { api } from '../../../lib/api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useWhatsAppBusinessSettings race safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores stale org A response after switching to org B', async () => {
    const orgA = deferred({ isConnected: true, providerConfigured: true, phoneNumber: 'Org A' });
    const orgB = deferred({ isConnected: false, providerConfigured: false, phoneNumber: 'Org B' });

    vi.mocked(api.whatsapp.getConfig).mockImplementation((orgId: string) => {
      if (orgId === 'org-a') return orgA.promise;
      if (orgId === 'org-b') return orgB.promise;
      return Promise.reject(new Error('unknown org'));
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }) => useWhatsAppBusinessSettings({ orgId, enabled: true }),
      { initialProps: { orgId: 'org-a' } },
    );

    rerender({ orgId: 'org-b' });
    orgB.resolve({ isConnected: false, providerConfigured: false, phoneNumber: 'Org B' } as never);

    await waitForHook(() => result.current.loading === false);
    expect(result.current.config?.phoneNumber).toBe('Org B');

    orgA.resolve({ isConnected: true, providerConfigured: true, phoneNumber: 'Org A' } as never);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.config?.phoneNumber).toBe('Org B');

    unmount();
  });
});
