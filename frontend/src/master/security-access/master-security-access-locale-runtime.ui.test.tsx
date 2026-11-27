// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, translateKey, useLanguage } from '../../i18n/LanguageContext';
import { AppThemeProvider } from '../../context/AppThemeContext';
import { SecurityUsersTab } from './tabs/SecurityUsersTab';
import { PrivilegeActionDialog } from './components/PrivilegeActionDialog';
import { useSecurityAccessPresentation } from './useSecurityAccessPresentation';
import { userDetailFixture, waitForExpect } from './components/user-detail-drawer.ui-test-utils';
import { LOCALE_STORAGE_KEY, type SupportedLocale } from '../../i18n/locales';

const listResult = {
  data: [
    {
      id: 'user-locale-1',
      name: 'Locale User',
      email: 'locale@fixture.test',
      role: 'Member',
      platformRole: null,
      accountState: 'ACTIVE',
      mfaState: 'ENABLED',
      attentionCodes: [],
      lastActive: '2024-06-01T00:00:00Z',
    },
  ],
  meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
};

vi.mock('./useSecurityAccess', () => ({
  useSecurityUsers: () => ({
    result: listResult,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let activeRoot: Root | null = null;

function MfaDialogLocaleProbe() {
  const { t } = useSecurityAccessPresentation();
  const detail = userDetailFixture('user-locale-1', 'Locale User');
  return createElement(PrivilegeActionDialog, {
    open: true,
    onOpenChange: () => {},
    title: t('master.securityAccess.userDetail.mfaReset.title'),
    description: t('master.securityAccess.userDetail.mfaReset.description'),
    category: 'high-risk',
    requireReason: true,
    minReasonLength: 10,
    confirmLabel: t('master.securityAccess.userDetail.mfaReset.confirm'),
    targetSummary: createElement(
      'div',
      null,
      createElement('p', null, detail.name),
      createElement('p', null, detail.email),
    ),
    onConfirm: () => {},
  });
}

function LocaleControls({ children }: { children: ReactNode }) {
  const { setLocale, locale } = useLanguage();
  return createElement(
    'div',
    { 'data-locale': locale },
    createElement('button', { type: 'button', 'data-testid': 'locale-de', onClick: () => setLocale('de') }, 'DE'),
    createElement('button', { type: 'button', 'data-testid': 'locale-en', onClick: () => setLocale('en') }, 'EN'),
    children,
  );
}

function renderWithLocale(node: ReactNode) {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  activeRoot = root;
  act(() => {
    root.render(
      createElement(
        AppThemeProvider,
        null,
        createElement(LanguageProvider, null, createElement(LocaleControls, null, node)),
      ),
    );
  });
}

function mfaEnabledLabel(loc: SupportedLocale) {
  return translateKey(loc, 'master.securityAccess.mfaState.ENABLED').text;
}

describe('Security Access locale runtime (USR-P1B)', () => {
  afterEach(() => {
    act(() => {
      activeRoot?.unmount();
    });
    activeRoot = null;
    document.body.innerHTML = '';
  });

  it('updates mounted users tab labels and MFA column when locale changes', async () => {
    renderWithLocale(createElement(SecurityUsersTab, { variant: 'users', onOpenUser: () => {} }));

    const identityEn = translateKey('en', 'master.securityAccess.users.columns.identity').text;
    const identityDe = translateKey('de', 'master.securityAccess.users.columns.identity').text;

    await waitForExpect(() => {
      expect(document.body.textContent).toContain(identityEn);
      expect(document.body.textContent).toContain(mfaEnabledLabel('en'));
    });

    act(() => {
      document.body.querySelector('[data-testid="locale-de"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitForExpect(() => {
      expect(document.body.textContent).toContain(identityDe);
      expect(document.body.textContent).toContain(mfaEnabledLabel('de'));
      expect(document.body.textContent).not.toContain(identityEn);
    });
  });

  it('updates open privilege dialog copy after locale switch', async () => {
    const titleEn = translateKey('en', 'master.securityAccess.userDetail.mfaReset.title').text;
    const titleDe = translateKey('de', 'master.securityAccess.userDetail.mfaReset.title').text;
    const reasonEn = translateKey('en', 'master.securityAccess.privilege.reasonLabel').text;
    const reasonDe = translateKey('de', 'master.securityAccess.privilege.reasonLabel').text;

    renderWithLocale(createElement(MfaDialogLocaleProbe));

    await waitForExpect(() => {
      expect(document.body.textContent).toContain(reasonEn);
      expect(document.body.textContent).toContain(titleEn);
    });

    act(() => {
      document.body.querySelector('[data-testid="locale-de"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitForExpect(
      () => {
        expect(document.body.textContent).toContain(reasonDe);
        expect(document.body.textContent).toContain(titleDe);
        expect(document.body.textContent).not.toContain(reasonEn);
      },
      10_000,
    );
  }, 20_000);
});