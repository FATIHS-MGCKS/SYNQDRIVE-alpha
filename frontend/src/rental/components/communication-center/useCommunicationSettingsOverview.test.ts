// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useCommunicationSettingsOverview } from './useCommunicationSettingsOverview';

vi.mock('../../../lib/api', () => ({
  api: {
    whatsapp: { getConfig: vi.fn() },
    voiceAssistant: { get: vi.fn() },
    sms: { getConfig: vi.fn() },
  },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

import { api } from '../../../lib/api';

const whatsAppAdmin = (module: string, action: string) =>
  module === 'communication' && (action === 'manage' || action === 'read');

const voiceAdmin = (module: string, action: string) =>
  module === 'voice-assistant' && action === 'write';

const fullSettingsAdmin = (module: string, action: string) =>
  (module === 'communication' && (action === 'manage' || action === 'read')) ||
  (module === 'voice-assistant' && action === 'write');

const whatsAppManageOnly = (module: string, action: string) =>
  module === 'communication' && action === 'manage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useCommunicationSettingsOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.whatsapp.getConfig).mockResolvedValue({
      isConnected: true,
      isActive: true,
      providerConfigured: true,
    } as never);
    vi.mocked(api.voiceAssistant.get).mockResolvedValue({
      status: 'ACTIVE',
      connectionStatus: 'CONNECTED',
      telephonyEnabled: true,
    } as never);
    vi.mocked(api.sms.getConfig).mockResolvedValue({
      organizationId: 'org-a',
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches only channels the user may administer on overview', async () => {
    const { result, unmount } = renderHook(() =>
      useCommunicationSettingsOverview({
        orgId: 'org-1',
        enabled: true,
        hasPermission: whatsAppManageOnly,
      }),
    );

    await waitForHook(() => result.current.loading === false);

    expect(api.whatsapp.getConfig).toHaveBeenCalledWith('org-1');
    expect(api.voiceAssistant.get).not.toHaveBeenCalled();
    expect(api.sms.getConfig).not.toHaveBeenCalled();
    expect(result.current.channels.map((c) => c.key)).toEqual(['whatsapp']);

    unmount();
  });

  it('does not fetch voice config for WhatsApp-only administrator', async () => {
    const { result, unmount } = renderHook(() =>
      useCommunicationSettingsOverview({
        orgId: 'org-1',
        enabled: true,
        hasPermission: whatsAppManageOnly,
      }),
    );

    await waitForHook(() => result.current.loading === false);
    expect(api.voiceAssistant.get).not.toHaveBeenCalled();
    expect(result.current.channels.some((c) => c.key === 'voice')).toBe(false);
    unmount();
  });

  it('ignores stale org A overview responses after switching to org B', async () => {
    const orgA = deferred({
      isConnected: true,
      isActive: true,
      providerConfigured: true,
    });
    const orgB = deferred({
      isConnected: false,
      isActive: false,
      providerConfigured: false,
    });

    vi.mocked(api.whatsapp.getConfig).mockImplementation((orgId: string) => {
      if (orgId === 'org-a') return orgA.promise as never;
      if (orgId === 'org-b') return orgB.promise as never;
      return Promise.reject(new Error('unknown org'));
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }) =>
        useCommunicationSettingsOverview({
          orgId,
          enabled: true,
          hasPermission: whatsAppAdmin,
        }),
      { initialProps: { orgId: 'org-a' } },
    );

    rerender({ orgId: 'org-b' });
    orgB.resolve({
      isConnected: false,
      isActive: false,
      providerConfigured: false,
    });
    await waitForHook(() => result.current.loading === false);
    expect(result.current.channels[0]?.status).toBe('NOT_CONFIGURED');

    orgA.resolve({
      isConnected: true,
      isActive: true,
      providerConfigured: true,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.channels[0]?.status).toBe('NOT_CONFIGURED');

    unmount();
  });

  it('fetches SMS status only when settings access and communication.read are both granted', async () => {
    const { result, unmount } = renderHook(() =>
      useCommunicationSettingsOverview({
        orgId: 'org-1',
        enabled: true,
        hasPermission: fullSettingsAdmin,
      }),
    );

    await waitForHook(() => result.current.loading === false);
    expect(api.sms.getConfig).toHaveBeenCalled();
    expect(result.current.channels.map((c) => c.key)).toEqual(['whatsapp', 'voice', 'sms']);
    unmount();
  });

  it('does not fetch voice for voice-only administrator without WhatsApp manage', async () => {
    const { result, unmount } = renderHook(() =>
      useCommunicationSettingsOverview({
        orgId: 'org-1',
        enabled: true,
        hasPermission: voiceAdmin,
      }),
    );

    await waitForHook(() => result.current.loading === false);
    expect(api.whatsapp.getConfig).not.toHaveBeenCalled();
    expect(api.voiceAssistant.get).toHaveBeenCalled();
    expect(result.current.channels.map((c) => c.key)).toEqual(['voice']);
    unmount();
  });
});
