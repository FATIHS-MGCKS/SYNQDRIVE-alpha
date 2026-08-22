// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { SmsSettingsPanel } from './SmsSettingsPanel';
import { CommunicationSettingsOverview } from './CommunicationSettingsOverview';

const SECRET = 'SUPER_SECRET_TOKEN_VALUE';

const mockUseRentalOrg = vi.fn();

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => mockUseRentalOrg(),
}));

vi.mock('./useSmsSettings', () => ({
  useSmsSettings: () => ({
    config: {
      organizationId: 'org-secret-test',
      hasConfigRow: true,
      isConnected: false,
      isActive: false,
      credentialsConfigured: true,
      webhookSigningConfigured: true,
      senderProfileConfigured: false,
      webhookEndpointConfigured: false,
      lastWebhookAt: null,
      updatedAt: '2026-08-22T10:00:00.000Z',
      apiKey: SECRET,
      webhookSigningSecret: SECRET,
      accessToken: SECRET,
    },
    loading: false,
    error: 'sent.dm API key SECRET_API_KEY invalid',
    reload: vi.fn(),
  }),
}));

vi.mock('./useCommunicationSettingsOverview', () => ({
  useCommunicationSettingsOverview: () => ({
    channels: [
      {
        key: 'sms',
        status: 'CONFIGURED',
        loading: false,
        error: 'sent.dm API key SECRET_API_KEY invalid',
      },
    ],
    loading: false,
    reload: vi.fn(),
  }),
}));

describe('communication settings secret safety', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem('synqdrive.locale', 'en');
    mockUseRentalOrg.mockReturnValue({
      orgId: 'org-secret-test',
      loading: false,
      hasPermission: () => true,
      userRole: 'ADMIN',
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not render stored secret values from SMS panel fixtures', () => {
    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(SmsSettingsPanel)));
    });
    expect(container.textContent).not.toContain(SECRET);
    expect(container.innerHTML).not.toContain(SECRET);
    expect(container.textContent).not.toContain('SECRET_API_KEY');
  });

  it('does not render raw provider error text in overview channel cards', () => {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(CommunicationSettingsOverview, { onNavigate: vi.fn() }),
        ),
      );
    });
    expect(container.textContent).not.toContain('SECRET_API_KEY');
    expect(container.textContent).toContain('Could not load settings');
  });
});
