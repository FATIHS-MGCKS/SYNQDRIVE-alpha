// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForHook } from '../../test/renderHook';
import { LanguageProvider } from '../i18n/LanguageContext';
import { WhatsAppBusinessSettings } from './whatsapp/WhatsAppBusinessSettings';
import { VoiceAgentSettings } from './voice-assistant/VoiceAgentSettings';

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-standalone-test',
    loading: false,
    hasPermission: () => true,
    userRole: 'ADMIN',
  }),
}));

vi.mock('../../lib/api', () => ({
  api: {
    whatsapp: {
      getConfig: vi.fn().mockResolvedValue({
        isConnected: false,
        providerConfigured: false,
        isActive: false,
      }),
      updateConfig: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      simulateIncoming: vi.fn(),
    },
    voiceAssistant: {
      get: vi.fn().mockResolvedValue({
        id: 'assistant-1',
        status: 'INACTIVE',
        connectionStatus: 'DISCONNECTED',
        telephonyEnabled: false,
        name: 'Fleet Assistant',
      }),
      update: vi.fn(),
      readiness: vi.fn().mockResolvedValue({ ready: false, checks: [] }),
      voices: vi.fn().mockResolvedValue([]),
    },
  },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

describe('standalone communication settings routes reuse shared components', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem('synqdrive.locale', 'en');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders shared WhatsAppBusinessSettings surface', async () => {
    act(() => {
      root.render(
        createElement(LanguageProvider, null, createElement(WhatsAppBusinessSettings, { enabled: true })),
      );
    });
    await waitForHook(() =>
      container.querySelector('[data-testid="whatsapp-business-settings"]') !== null,
    );
    expect(container.querySelector('[data-testid="communication-settings-shell"]')).toBeNull();
  });

  it('renders shared VoiceAgentSettings surface', async () => {
    act(() => {
      root.render(
        createElement(LanguageProvider, null, createElement(VoiceAgentSettings, { enabled: true })),
      );
    });
    await waitForHook(() => container.querySelector('[data-testid="voice-agent-settings"]') !== null);
    expect(container.querySelector('[data-testid="communication-settings-shell"]')).toBeNull();
  });
});
