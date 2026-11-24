// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, translateKey } from '../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY, type SupportedLocale } from '../../i18n/locales';
import { AppThemeProvider } from '../../context/AppThemeContext';
import { Sidebar } from './Sidebar';
import type { MasterView } from '../navigation/master-nav.types';

vi.mock('../../lib/auth', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/auth')>();
  return {
    ...mod,
    getStoredUser: vi.fn(() => ({
      id: 'u1',
      email: 'admin@test.io',
      name: 'Master Admin',
      platformRole: 'MASTER_ADMIN',
    })),
    isMasterAdmin: vi.fn(() => true),
    hasMasterBillingAccess: vi.fn(() => false),
    clearAuth: vi.fn(),
  };
});

vi.mock('../navigation/useMasterNavBadges', () => ({
  useMasterNavBadges: () => ({ 'support-count': 3 }),
  useMasterPlatformStatusLabel: () => 'operational',
}));

function renderSidebar(opts?: {
  currentView?: MasterView;
  isCollapsed?: boolean;
  locale?: SupportedLocale;
  onNavigate?: (view: MasterView) => void;
}) {
  if (opts?.locale) {
    localStorage.setItem(LOCALE_STORAGE_KEY, opts.locale);
  }
  const container = document.createElement('div');
  container.className = 'sidebar-test-root';
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function Harness() {
    const [collapsed, setCollapsed] = useState(opts?.isCollapsed ?? false);
    return createElement(Sidebar, {
      isDarkMode: false,
      currentView: opts?.currentView ?? 'dashboard',
      isCollapsed: collapsed,
      onToggleCollapse: () => setCollapsed((c) => !c),
      onNavigate: opts?.onNavigate ?? vi.fn(),
    });
  }

  act(() => {
    root.render(
      createElement(
        AppThemeProvider,
        null,
        createElement(LanguageProvider, null, createElement(Harness)),
      ),
    );
  });
  return { container, root };
}

async function renderBillingOnlySidebar(currentView: MasterView = 'billing') {
  const auth = await import('../../lib/auth');
  vi.mocked(auth.getStoredUser).mockReturnValue({
    id: 'b1',
    email: 'billing@test.io',
    name: 'Billing User',
    platformRole: 'master-billing',
  } as never);
  vi.mocked(auth.isMasterAdmin).mockReturnValue(false);
  vi.mocked(auth.hasMasterBillingAccess).mockReturnValue(true);
  return renderSidebar({ currentView });
}

describe('Master Sidebar V1 UI', () => {
  beforeEach(async () => {
    const auth = await import('../../lib/auth');
    vi.mocked(auth.getStoredUser).mockReturnValue({
      id: 'u1',
      email: 'admin@test.io',
      name: 'Master Admin',
      platformRole: 'MASTER_ADMIN',
    } as never);
    vi.mocked(auth.isMasterAdmin).mockReturnValue(true);
    vi.mocked(auth.hasMasterBillingAccess).mockReturnValue(false);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    vi.clearAllMocks();
  });

  describe.each(['de', 'en'] as const)('accessible chrome labels (%s)', (locale) => {
    it('uses localized desktop collapse toggle aria-label and updates on collapse', () => {
      const { container } = renderSidebar({ locale, isCollapsed: false });
      const desktop = container.querySelector('.hidden.lg\\:flex') as HTMLElement;
      const collapseBtn = desktop?.querySelector('.sq-sidebar-footer__toggle') as HTMLButtonElement;
      const collapseLabel = translateKey(locale, 'master.nav.collapseSidebar').text;
      const expandLabel = translateKey(locale, 'master.nav.expandSidebar').text;

      expect(collapseBtn?.getAttribute('aria-label')).toBe(collapseLabel);
      expect(collapseBtn?.getAttribute('aria-label')).not.toBe('master.nav.collapseSidebar');

      act(() => {
        collapseBtn?.click();
      });
      expect(collapseBtn?.getAttribute('aria-label')).toBe(expandLabel);
    });

    it('uses distinct aria-label on parent submenu chevron vs primary link', () => {
      const { container } = renderSidebar({ locale, currentView: 'high-mobility' });
      const desktop = container.querySelector('.hidden.lg\\:flex') as HTMLElement;
      const toggle = desktop?.querySelector(
        '[data-master-nav-parent-toggle="platform-integrations"]',
      ) as HTMLButtonElement;
      const toggleLabel = translateKey(locale, 'master.sidebar.toggleChildMenu').text;
      const linkLabel = translateKey(locale, 'master.nav.platformIntegrations').text;
      const parentRow = toggle?.closest('.flex.items-stretch') as HTMLElement;

      expect(toggle?.getAttribute('aria-label')).toBe(toggleLabel);
      expect(parentRow?.textContent).toContain(linkLabel);
      expect(toggle?.getAttribute('aria-label')).not.toBe(linkLabel);
    });

    it('uses localized mobile menu toggle aria-label and updates on open', () => {
      const { container } = renderSidebar({ locale });
      const mobileToggle = container.querySelector('.lg\\:hidden button[aria-controls]') as HTMLButtonElement;
      const openLabel = translateKey(locale, 'master.nav.mobileMenu').text;
      const closeLabel = translateKey(locale, 'master.nav.mobileMenuClose').text;

      expect(mobileToggle.getAttribute('aria-label')).toBe(openLabel);
      expect(mobileToggle.getAttribute('aria-label')).not.toBe('master.nav.mobileMenu');

      act(() => {
        mobileToggle.click();
      });
      expect(mobileToggle.getAttribute('aria-label')).toBe(closeLabel);
    });
  });

  it('renders dashboard for billing-only users (visibility SSOT)', async () => {
    const { container } = await renderBillingOnlySidebar('dashboard');
    expect(container.querySelector('[data-master-nav-view="dashboard"]')).toBeTruthy();
    expect(container.querySelector('[data-master-nav-view="billing"]')).toBeTruthy();
    expect(container.querySelector('[data-master-nav-view="organizations"]')).toBeFalsy();
    expect(container.querySelector('[data-master-nav-view="vsi-intelligence"]')).toBeFalsy();
    expect(container.querySelector('[data-master-nav-view="support"]')).toBeFalsy();
  });

  it('shows support badge when desktop sidebar is collapsed', () => {
    const { container } = renderSidebar({ isCollapsed: true });
    const supportBtn = container.querySelector('[data-master-nav-view="support"]');
    expect(supportBtn).toBeTruthy();
    expect(supportBtn?.textContent).toContain('3');
  });

  it('auto-expands integrations children on child route and allows manual collapse', () => {
    const { container } = renderSidebar({ currentView: 'high-mobility' });
    const desktop = container.querySelector('.hidden.lg\\:flex') as HTMLElement;
    expect(desktop?.querySelector('[data-master-nav-view="high-mobility"]')).toBeTruthy();

    const chevron = desktop?.querySelector(
      '[data-master-nav-parent-toggle="platform-integrations"]',
    ) as HTMLButtonElement;
    expect(chevron?.getAttribute('aria-expanded')).toBe('true');

    act(() => {
      chevron.click();
    });

    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    expect(desktop?.querySelector('[data-master-nav-view="high-mobility"]')).toBeFalsy();
  });

  it('toggles mobile navigation open and closed', () => {
    const { container } = renderSidebar();
    const toggle = container.querySelector('.lg\\:hidden button[aria-controls]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});