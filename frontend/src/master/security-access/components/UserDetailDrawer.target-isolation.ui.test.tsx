// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { AppThemeProvider } from '../../../context/AppThemeContext';
import { UserDetailDrawer } from './UserDetailDrawer';

const getUser = vi.fn();
const listUserSessions = vi.fn();
const resetUserMfa = vi.fn();
const revokeSession = vi.fn();
const revokeAllSessions = vi.fn();
const deleteUser = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: {
    admin: {
      securityAccess: {
        getUser: (...args: unknown[]) => getUser(...args),
        listUserSessions: (...args: unknown[]) => listUserSessions(...args),
        resetUserMfa: (...args: unknown[]) => resetUserMfa(...args),
        revokeSession: (...args: unknown[]) => revokeSession(...args),
        revokeAllSessions: (...args: unknown[]) => revokeAllSessions(...args),
      },
    },
    users: {
      delete: (...args: unknown[]) => deleteUser(...args),
    },
  },
  getErrorMessage: (_e: unknown, fb: string) => fb,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function userDetail(id: string, name: string) {
  return {
    id,
    name,
    email: `${id}@fixture.test`,
    createdAt: '2024-01-01T00:00:00Z',
    lastActive: '2024-06-01T00:00:00Z',
    accountState: 'ACTIVE',
    platformRole: null,
    role: 'Member',
    mfaState: 'ENABLED',
    attentionCodes: [],
    memberships: [],
    mfa: { enrolled: true, state: 'ENABLED', factorTypes: ['totp'], recoveryCodesRemaining: 3 },
    recentPrivilegedActivity: [],
  };
}

function Harness() {
  const [userId, setUserId] = useState<string | null>('user-a');
  return createElement(
    'div',
    null,
  createElement('button', { type: 'button', 'data-testid': 'go-b', onClick: () => setUserId('user-b') }, 'Go B'),
  createElement('button', { type: 'button', 'data-testid': 'close', onClick: () => setUserId(null) }, 'Close'),
  createElement(UserDetailDrawer, { userId, onClose: () => setUserId(null) }),
  );
}

function renderHarness() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
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
    resetUserMfa.mockReset();
    listUserSessions.mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clears already-loaded user A immediately when switching to user B', async () => {
    getUser.mockImplementation((id: string) =>
      id === 'user-a'
        ? Promise.resolve(userDetail('user-a', 'User Alpha'))
        : new Promise(() => {}),
    );

    const { container } = renderHarness();
    await vi.waitFor(() => container.textContent?.includes('User Alpha'));

    await act(async () => {
      container.querySelector('[data-testid="go-b"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('User Alpha');
    expect(container.textContent).not.toContain('user-a@fixture.test');
  });

  it('does not show user A sessions under user B after delayed load', async () => {
    getUser
      .mockResolvedValueOnce(userDetail('user-a', 'User Alpha'))
      .mockImplementation(
        (id: string) =>
          new Promise((resolve) => {
            setTimeout(() => resolve(userDetail(id, id === 'user-b' ? 'User Beta' : 'User Alpha')), 20);
          }),
      );

    listUserSessions.mockImplementation((uid: string) =>
      Promise.resolve(
        uid === 'user-a'
          ? [{ id: 's-a', device: 'Device A', browser: '', os: '', ipAddress: '1.1.1.1', current: false, createdAt: '', lastUsedAt: '' }]
          : [{ id: 's-b', device: 'Device B', browser: '', os: '', ipAddress: '2.2.2.2', current: false, createdAt: '', lastUsedAt: '' }],
      ),
    );

    const { container } = renderHarness();
    await vi.waitFor(() => container.textContent?.includes('User Alpha'));
    await vi.waitFor(() => container.textContent?.includes('Device A'));

    await act(async () => {
      container.querySelector('[data-testid="go-b"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Device A');
    await vi.waitFor(() => container.textContent?.includes('User Beta'));
    await vi.waitFor(() => container.textContent?.includes('Device B'));
  });

  it('ignores late user A response after close and reopen for user B', async () => {
    let resolveA!: (v: unknown) => void;
    getUser.mockImplementation((id: string) => {
      if (id === 'user-a') {
        return new Promise((resolve) => {
          resolveA = resolve;
        });
      }
      return Promise.resolve(userDetail('user-b', 'User Beta'));
    });

    const { container } = renderHarness();
    await act(async () => {
      container.querySelector('[data-testid="close"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector('[data-testid="go-b"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await vi.waitFor(() => container.textContent?.includes('User Beta'));
    await act(async () => {
      resolveA(userDetail('user-a', 'User Alpha'));
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain('User Alpha');
  });
});