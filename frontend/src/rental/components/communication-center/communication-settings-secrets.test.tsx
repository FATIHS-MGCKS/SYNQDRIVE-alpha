// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { SmsSettingsPanel } from './SmsSettingsPanel';

const SECRET = 'SUPER_SECRET_TOKEN_VALUE';

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-secret-test',
    loading: false,
    hasPermission: () => true,
    userRole: 'ADMIN',
  }),
}));

vi.mock('./useSmsSettings', () => ({
  useSmsSettings: () => ({
    config: {
      isConnected: false,
      isActive: false,
      credentialsConfigured: true,
      webhookConfigured: true,
      senderProfileConfigured: false,
      webhookEndpointConfigured: false,
      apiKey: SECRET,
      webhookSigningSecret: SECRET,
    },
    loading: false,
    error: null,
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not render stored secret values from backend fixtures', () => {
    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(SmsSettingsPanel)));
    });
    expect(container.textContent).not.toContain(SECRET);
    expect(container.innerHTML).not.toContain(SECRET);
  });
});
