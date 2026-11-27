// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { AppThemeProvider } from '../../../context/AppThemeContext';
import { UserDetailDrawer } from './UserDetailDrawer';
import {
  clickButtonContaining,
  confirmOpenPrivilegeDialog,
  sessionFixtures,
  userDetailFixture,
  waitForExpect,
} from './user-detail-drawer.ui-test-utils';

const getUser = vi.fn();
const listUserSessions = vi.fn();
const revokeAllSessions = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: {
    admin: {
      securityAccess: {
        getUser: (...args: unknown[]) => getUser(...args),
        listUserSessions: (...args: unknown[]) => listUserSessions(...args),
        resetUserMfa: vi.fn(),
        revokeSession: vi.fn(),
        revokeAllSessions: (...args: unknown[]) => revokeAllSessions(...args),
      },
    },
    users: { delete: vi.fn() },
  },
  getErrorMessage: (_e: unknown, fb: string) => fb,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let activeRoot: Root | null = null;

function Harness() {
  const [userId, setUserId] = useState<string | null>('user-a');
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', 'data-testid': 'go-a', onClick: () => setUserId('user-a') },
      'Go A',
    ),
    createElement(
      'button',
      { type: 'button', 'data-testid': 'go-b', onClick: () => setUserId('user-b') },
      'Go B',
    ),
    createElement(
      'button',
      { type: 'button', 'data-testid': 'close', onClick: () => setUserId(null) },
      'Close',
    ),
    createElement(UserDetailDrawer, { userId, onClose: () => setUserId(null) }),
  );
}

function renderHarness() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  activeRoot = root;
  act(() => {
    root.render(
      createElement(AppThemeProvider, null, createElement(LanguageProvider, null, createElement(Harness))),
    );
  });
  return { container, root };
}

describe('UserDetailDrawer target identity isolation', () => {
  beforeEach(() => {
    getUser.mockReset();
    listUserSessions.mockReset();
    listUserSessions.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => {
      activeRoot?.unmount();
    });
    activeRoot = null;
    document.body.innerHTML = '';
  });

  it('clears already-loaded user A immediately when switching to user B', async () => {
    getUser.mockImplementation((id: string) =>
      id === 'user-a'
        ? Promise.resolve(userDetailFixture('user-a', 'User Alpha'))
        : new Promise(() => {}),
    );

    renderHarness();
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('User Alpha');
    });

    await act(async () => {
      document.body.querySelector('[data-testid="go-b"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain('User Alpha');
    expect(document.body.textContent).not.toContain('user-a@fixture.test');
  });

  it('does not show user A sessions under user B after delayed load', async () => {
    getUser.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          setTimeout(() => resolve(userDetailFixture(id, id === 'user-b' ? 'User Beta' : 'User Alpha')), 20);
        }),
    );

    listUserSessions.mockImplementation((uid: string) => Promise.resolve(sessionFixtures(uid)));

    renderHarness();
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('User Alpha');
      expect(document.body.textContent).toContain('Other user-a');
    });

    await act(async () => {
      document.body.querySelector('[data-testid="go-b"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain('Other user-a');
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('User Beta');
      expect(document.body.textContent).toContain('Other user-b');
    });
  });

  it('ignores late user A response after close and reopen for user B', async () => {
    let resolveA!: (v: unknown) => void;
    getUser.mockImplementation((id: string) => {
      if (id === 'user-a') {
        return new Promise((resolve) => {
          resolveA = resolve;
        });
      }
      return Promise.resolve(userDetailFixture('user-b', 'User Beta'));
    });

    renderHarness();
    await act(async () => {
      document.body.querySelector('[data-testid="close"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      document.body.querySelector('[data-testid="go-b"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await waitForExpect(() => {
      expect(document.body.textContent).toContain('User Beta');
    });

    await act(async () => {
      resolveA(userDetailFixture('user-a', 'User Alpha'));
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain('User Alpha');
  });

  it('does not apply stale A->B->A generation session refresh after slow revoke-all for A', async () => {
    getUser.mockImplementation((id: string) => Promise.resolve(userDetailFixture(id, `Name ${id}`)));
    listUserSessions.mockImplementation((uid: string) => Promise.resolve(sessionFixtures(uid)));

    let resolveRevoke!: () => void;
    revokeAllSessions.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRevoke = () => resolve();
        }),
    );

    renderHarness();
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Name user-a');
    });

    clickButtonContaining('End all other sessions');
    confirmOpenPrivilegeDialog('End sessions');

    await act(async () => {
      document.body.querySelector('[data-testid="go-b"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Name user-b');
    });

    listUserSessions.mockClear();
    await act(async () => {
      resolveRevoke();
      await Promise.resolve();
    });

    expect(revokeAllSessions).toHaveBeenCalledWith('user-a');
    expect(listUserSessions).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Name user-b');
    expect(document.body.textContent).not.toContain('Name user-a');
  });
});