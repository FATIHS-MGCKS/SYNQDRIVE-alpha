// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useSmsSettings } from './useSmsSettings';

vi.mock('../../../lib/api', () => ({
  api: {
    sms: {
      getConfig: vi.fn(),
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

describe('useSmsSettings race safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores stale org A response after switching to org B', async () => {
    const orgA = deferred({
      organizationId: 'org-a',
      hasConfigRow: true,
      isConnected: true,
      isActive: true,
      credentialsConfigured: true,
      webhookSigningConfigured: true,
      senderProfileConfigured: true,
      webhookEndpointConfigured: true,
      lastWebhookAt: null,
      updatedAt: '2026-08-22T10:00:00.000Z',
    });
    const orgB = deferred({
      organizationId: 'org-b',
      hasConfigRow: false,
      isConnected: false,
      isActive: false,
      credentialsConfigured: false,
      webhookSigningConfigured: false,
      senderProfileConfigured: false,
      webhookEndpointConfigured: false,
      lastWebhookAt: null,
      updatedAt: null,
    });

    vi.mocked(api.sms.getConfig).mockImplementation((orgId: string) => {
      if (orgId === 'org-a') return orgA.promise;
      if (orgId === 'org-b') return orgB.promise;
      return Promise.reject(new Error('unknown org'));
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }) => useSmsSettings({ orgId, enabled: true }),
      { initialProps: { orgId: 'org-a' } },
    );

    rerender({ orgId: 'org-b' });
    orgB.resolve({
      organizationId: 'org-b',
      hasConfigRow: false,
      isConnected: false,
      isActive: false,
      credentialsConfigured: false,
      webhookSigningConfigured: false,
      senderProfileConfigured: false,
      webhookEndpointConfigured: false,
      lastWebhookAt: null,
      updatedAt: null,
    });
    await waitForHook(() => result.current.loading === false);

    expect(result.current.config?.organizationId).toBe('org-b');
    expect(result.current.config?.hasConfigRow).toBe(false);

    orgA.resolve({
      organizationId: 'org-a',
      hasConfigRow: true,
      isConnected: true,
      isActive: true,
      credentialsConfigured: true,
      webhookSigningConfigured: true,
      senderProfileConfigured: true,
      webhookEndpointConfigured: true,
      lastWebhookAt: null,
      updatedAt: '2026-08-22T10:00:00.000Z',
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.config?.organizationId).toBe('org-b');

    unmount();
  });
});
