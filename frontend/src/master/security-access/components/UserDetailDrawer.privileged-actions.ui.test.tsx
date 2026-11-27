// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, translateKey } from '../../../i18n/LanguageContext';
import { AppThemeProvider } from '../../../context/AppThemeContext';
import { UserDetailDrawer } from './UserDetailDrawer';
import {
  clickButtonContaining,
  confirmOpenPrivilegeDialog,
  sessionFixtures,
  setControlledTextarea,
  userDetailFixture,
  waitForExpect,
} from './user-detail-drawer.ui-test-utils';

const getUser = vi.fn();
const listUserSessions = vi.fn();
const resetUserMfa = vi.fn();
const revokeSession = vi.fn();
const revokeAllSessions = vi.fn();
const deleteUser = vi.fn();
const onClose = vi.fn();
const onUserDeleted = vi.fn();

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

vi.mock('../../../lib/mfa', () => ({
  newIdempotencyKey: (prefix: string) => `${prefix}-idempotency-key`,
}));

let activeRoot: Root | null = null;
const MFA_REASON = 'Security incident 01';

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
      { type: 'button',
      'data-testid': 'close',
      onClick: () => setUserId(null) },
      'Close',
    ),
    createElement(UserDetailDrawer, {
      userId,
      onClose: () => {
        onClose();
        setUserId(null);
      },
      onUserDeleted,
    }),
  );
}

function renderHarness() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  activeRoot = root;
  act(() => {
    root.render(
      createElement(AppThemeProvider, null, createElement(LanguageProvider, null, createElement(Harness))),
    );
  });
  return { root };
}

describe('UserDetailDrawer privileged action target proofs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockImplementation((id: string) => Promise.resolve(userDetailFixture(id, `Display ${id}`)));
    listUserSessions.mockImplementation((uid: string) => Promise.resolve(sessionFixtures(uid)));
    resetUserMfa.mockResolvedValue(undefined);
    revokeSession.mockResolvedValue(undefined);
    revokeAllSessions.mockResolvedValue(undefined);
    deleteUser.mockResolvedValue(undefined);
    onClose.mockClear();
    onUserDeleted.mockClear();
  });

  afterEach(() => {
    act(() => {
      activeRoot?.unmount();
    });
    activeRoot = null;
    document.body.innerHTML = '';
  });

  it('revokes a single session for the confirmed user only', async () => {
    renderHarness();
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-a');
      expect(document.body.textContent).toContain('Other user-a');
    });

    clickButtonContaining(translateKey('en', 'master.securityAccess.own.endSession').text, {
      disabled: false,
      exact: true,
    });

    expect(revokeSession).toHaveBeenCalledTimes(1);
    expect(revokeSession).toHaveBeenCalledWith('user-a', 'user-a-other');
  });

  it('revokes all other sessions with exact user target', async () => {
    renderHarness();
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-a');
    });

    clickButtonContaining('End all other sessions');
    confirmOpenPrivilegeDialog(translateKey('en', 'master.securityAccess.userDetail.revokeAll.confirm').text);

    expect(revokeAllSessions).toHaveBeenCalledTimes(1);
    expect(revokeAllSessions).toHaveBeenCalledWith('user-a');
  });

  it('resets MFA with reason and idempotency for the displayed user', async () => {
    renderHarness();
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-a');
    });

    clickButtonContaining(translateKey('en', 'master.securityAccess.userDetail.resetMfa').text);
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('user-a@fixture.test');
    });

    setControlledTextarea('privilege-reason', MFA_REASON);
    confirmOpenPrivilegeDialog(translateKey('en', 'master.securityAccess.userDetail.mfaReset.confirm').text);

    await waitForExpect(() => {
      expect(resetUserMfa).toHaveBeenCalledTimes(1);
    });
    expect(resetUserMfa).toHaveBeenCalledWith('user-a', {
      reason: MFA_REASON,
      idempotencyKey: 'mfa-reset-idempotency-key',
    });
  });

  it('deletes the user when confirmation targets match', async () => {
    renderHarness();
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-a');
    });

    const deleteBtn = document.querySelector('[data-testid="user-detail-delete"]') as HTMLButtonElement;
    act(() => deleteBtn.click());

    setControlledTextarea('privilege-reason', MFA_REASON);
    confirmOpenPrivilegeDialog(translateKey('en', 'master.securityAccess.userDetail.delete.confirm').text);

    await waitForExpect(() => {
      expect(deleteUser).toHaveBeenCalledWith('user-a', MFA_REASON);
    });
    expect(onClose).toHaveBeenCalled();
    expect(onUserDeleted).toHaveBeenCalled();
  });

  it('does not authorize user B when MFA confirmation was opened for user A', async () => {
    renderHarness();
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-a');
    });

    clickButtonContaining(translateKey('en', 'master.securityAccess.userDetail.resetMfa').text);
    setControlledTextarea('privilege-reason', MFA_REASON);

    await act(async () => {
      document.body.querySelector('[data-testid="go-b"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-b');
    });

    expect(document.getElementById('privilege-reason')).toBeNull();
    expect(resetUserMfa).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Display user-b');
  });

  it('does not apply MFA reset completion to user B after confirm while pending on A', async () => {
    let resolveMfa!: () => void;
    resetUserMfa.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMfa = resolve;
        }),
    );

    renderHarness();
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-a');
    });

    clickButtonContaining(translateKey('en', 'master.securityAccess.userDetail.resetMfa').text);
    setControlledTextarea('privilege-reason', MFA_REASON);
    confirmOpenPrivilegeDialog(translateKey('en', 'master.securityAccess.userDetail.mfaReset.confirm').text);

    await act(async () => {
      document.body.querySelector('[data-testid="go-b"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-b');
    });

    getUser.mockClear();
    await act(async () => {
      resolveMfa();
      await Promise.resolve();
    });

    expect(resetUserMfa).toHaveBeenCalledWith('user-a', expect.any(Object));
    expect(getUser).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Display user-b');
  });

  it('does not close or refresh user B when a pending delete for user A completes after A->B switch', async () => {
    let resolveDelete!: () => void;
    deleteUser.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    renderHarness();
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-a');
    });

    act(() => (document.querySelector('[data-testid="user-detail-delete"]') as HTMLButtonElement).click());
    setControlledTextarea('privilege-reason', MFA_REASON);
    confirmOpenPrivilegeDialog(translateKey('en', 'master.securityAccess.userDetail.delete.confirm').text);

    await act(async () => {
      document.body.querySelector('[data-testid="go-b"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-b');
    });

    onClose.mockClear();
    getUser.mockClear();
    await act(async () => {
      resolveDelete();
      await Promise.resolve();
    });

    expect(deleteUser).toHaveBeenCalledWith('user-a', MFA_REASON);
    expect(onClose).not.toHaveBeenCalled();
    expect(onUserDeleted).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Display user-b');
  });

  it('blocks stale completion after A -> B -> A when generation changed', async () => {
    let resolveRevoke!: () => void;
    revokeAllSessions.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRevoke = resolve;
        }),
    );

    renderHarness();
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-a');
    });

    clickButtonContaining('End all other sessions');
    confirmOpenPrivilegeDialog(translateKey('en', 'master.securityAccess.userDetail.revokeAll.confirm').text);

    await act(async () => {
      document.body.querySelector('[data-testid="go-b"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      document.body.querySelector('[data-testid="go-a"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await waitForExpect(() => {
      expect(document.body.textContent).toContain('Display user-a');
    });

    listUserSessions.mockClear();
    await act(async () => {
      resolveRevoke();
      await Promise.resolve();
    });

    expect(revokeAllSessions).toHaveBeenCalledWith('user-a');
    expect(listUserSessions).not.toHaveBeenCalled();
  });

  it('isolates close and reopen: late A detail does not replace B after lifecycle reset', async () => {
    let resolveA!: (v: unknown) => void;
    getUser.mockImplementation((id: string) => {
      if (id === 'user-a') {
        return new Promise((resolve) => {
          resolveA = resolve;
        });
      }
      return Promise.resolve(userDetailFixture('user-b', 'Display user-b'));
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
      expect(document.body.textContent).toContain('Display user-b');
    });

    await act(async () => {
      resolveA(userDetailFixture('user-a', 'Display user-a'));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('Display user-b');
    expect(document.body.textContent).not.toContain('Display user-a');
  });
});