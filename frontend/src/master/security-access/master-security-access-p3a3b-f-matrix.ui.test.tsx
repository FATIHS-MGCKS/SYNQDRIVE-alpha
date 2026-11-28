// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { AppThemeProvider } from '../../context/AppThemeContext';
import { CreateGlobalUserDialog } from './components/CreateGlobalUserDialog';
import { GlobalProfileEditPanel } from './components/GlobalProfileEditPanel';
import { api } from '../../lib/api';

const createUser = vi.fn();
const listOrgRoles = vi.fn();
const listOperational = vi.fn();
const updateUserProfile = vi.fn();
const getUser = vi.fn();

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock('../../lib/api', () => ({
  api: {
    admin: {
      securityAccess: {
        createUser: (...args: unknown[]) => createUser(...args),
        listOrgRoles: (...args: unknown[]) => listOrgRoles(...args),
        updateUserProfile: (...args: unknown[]) => updateUserProfile(...args),
        getUser: (...args: unknown[]) => getUser(...args),
      },
    },
    organizations: {
      listOperational: (...args: unknown[]) => listOperational(...args),
    },
  },
}));

function setInputValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function wrap(ui: React.ReactNode) {
  return createElement(
    AppThemeProvider,
    null,
    createElement(LanguageProvider, null, ui),
  );
}

describe('P3A.3B F-matrix (UI)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    createUser.mockReset();
    listOrgRoles.mockReset();
    listOperational.mockReset();
    updateUserProfile.mockReset();
    getUser.mockReset();
    listOperational.mockResolvedValue({
      data: [{ id: 'org-1', companyName: 'Org One', orgStatus: 'ACTIVE' }],
    });
    listOrgRoles.mockResolvedValue({
      data: [{ id: 'role-1', name: 'Worker', organizationId: 'org-1' }],
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('F03 identity-only submit payload', async () => {
    createUser.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.test' },
      onboarding: {
        identityCreated: true,
        invitationPersisted: false,
        deliveryRequested: false,
        deliveryConfirmed: false,
        accountReadyForAuthentication: false,
      },
      idempotentReplay: false,
    });
    await act(async () => {
      root.render(
        wrap(
          createElement(CreateGlobalUserDialog, {
            open: true,
            onOpenChange: () => {},
            onListRefresh: () => {},
            onOpenCreatedUser: () => {},
          }),
        ),
      );
    });
    await act(async () => {
      setInputValue(document.querySelector('[data-testid="create-user-email"]') as HTMLInputElement, 'solo@example.test');
      setInputValue(document.querySelector('[data-testid="create-user-first-name"]') as HTMLInputElement, 'Solo');
      (document.querySelector('[data-testid="create-user-submit"]') as HTMLButtonElement)?.click();
    });
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'solo@example.test',
        idempotencyKey: expect.any(String),
      }),
    );
    expect(createUser.mock.calls[0][0].initialMembership).toBeUndefined();
  });

  it('F05 organization change clears stale role options', async () => {
    let roleResolve: (v: unknown) => void;
    listOrgRoles.mockReturnValue(
      new Promise((resolve) => {
        roleResolve = resolve;
      }),
    );
    await act(async () => {
      root.render(
        wrap(
          createElement(CreateGlobalUserDialog, {
            open: true,
            onOpenChange: () => {},
            onListRefresh: () => {},
            onOpenCreatedUser: () => {},
          }),
        ),
      );
    });
    const org = document.querySelector('[data-testid="create-user-organization"]') as HTMLSelectElement;
    await act(async () => {
      setInputValue(org, 'org-1');
    });
    const roleSelect = document.querySelector('[data-testid="create-user-org-role"]') as HTMLSelectElement;
    expect(roleSelect.disabled).toBe(true);
    await act(async () => {
      roleResolve!({ data: [{ id: 'role-1', name: 'Worker' }] });
      await Promise.resolve();
    });
    expect(roleSelect.disabled).toBe(false);
  });

  it('F09 ambiguous retry reuses payload and idempotency key', async () => {
    createUser.mockRejectedValueOnce(new Error('[NETWORK] transient failure'));
    createUser.mockResolvedValueOnce({
      user: { id: 'u2', email: 'retry@example.test' },
      onboarding: {
        identityCreated: true,
        invitationPersisted: false,
        deliveryRequested: false,
        deliveryConfirmed: false,
        accountReadyForAuthentication: false,
      },
      idempotentReplay: false,
    });
    await act(async () => {
      root.render(
        wrap(
          createElement(CreateGlobalUserDialog, {
            open: true,
            onOpenChange: () => {},
            onListRefresh: () => {},
            onOpenCreatedUser: () => {},
          }),
        ),
      );
    });
    await act(async () => {
      setInputValue(document.querySelector('[data-testid="create-user-email"]') as HTMLInputElement, 'retry@example.test');
      setInputValue(document.querySelector('[data-testid="create-user-first-name"]') as HTMLInputElement, 'Re');
      setInputValue(document.querySelector('[data-testid="create-user-last-name"]') as HTMLInputElement, 'Try');
      (document.querySelector('[data-testid="create-user-submit"]') as HTMLButtonElement)?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      const retry = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('same operation'),
      );
      retry?.click();
    });
    expect(createUser).toHaveBeenCalledTimes(2);
    const k0 = createUser.mock.calls[0][0].idempotencyKey;
    const k1 = createUser.mock.calls[1][0].idempotencyKey;
    expect(k0).toBe(k1);
    expect(createUser.mock.calls[0][0].email).toBe(createUser.mock.calls[1][0].email);
  });

  it('F07 operation conflict precedes generic 409', async () => {
    createUser.mockRejectedValueOnce(new Error('[OPERATION_IDEMPOTENCY_CONFLICT] bound'));
    await act(async () => {
      root.render(
        wrap(
          createElement(CreateGlobalUserDialog, {
            open: true,
            onOpenChange: () => {},
            onListRefresh: () => {},
            onOpenCreatedUser: () => {},
          }),
        ),
      );
    });
    await act(async () => {
      setInputValue(document.querySelector('[data-testid="create-user-email"]') as HTMLInputElement, 'x@y.z');
      setInputValue(document.querySelector('[data-testid="create-user-first-name"]') as HTMLInputElement, 'A');
      (document.querySelector('[data-testid="create-user-submit"]') as HTMLButtonElement)?.click();
    });
    await act(async () => Promise.resolve());
    expect(createUser).toHaveBeenCalledTimes(1);
    const email = document.querySelector('[data-testid="create-user-email"]') as HTMLInputElement;
    expect(email.disabled).toBe(true);
  });

  it('F16 profile PATCH sends changed fields only', async () => {
    updateUserProfile.mockResolvedValue({ user: { id: 'uid', email: 'x@y.z', name: 'Edited' } });
    getUser.mockResolvedValue({
      id: 'uid',
      globalProfile: {
        name: 'Edited',
        firstName: 'Edited',
        lastName: 'User',
        phone: null,
        mobile: null,
        address: null,
        language: 'en',
        timezone: 'Europe/Berlin',
        dateFormat: 'DD.MM.YYYY',
      },
    });
    const detail = {
      id: 'uid',
      globalProfile: {
        name: 'Before',
        firstName: 'Before',
        lastName: 'User',
        phone: null,
        mobile: null,
        address: null,
        language: 'en',
        timezone: 'Europe/Berlin',
        dateFormat: 'DD.MM.YYYY',
      },
    };
    await act(async () => {
      root.render(
        wrap(
          createElement(GlobalProfileEditPanel, {
            userId: 'uid',
            detail: detail as never,
            drawerGeneration: 1,
            onSaved: () => {},
            isMutationTargetCurrent: () => true,
          }),
        ),
      );
    });
    const first = document.querySelector('[data-testid="profile-first-name"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(first, 'Edited');
      (document.querySelector('[data-testid="profile-save"]') as HTMLButtonElement)?.click();
    });
    expect(updateUserProfile).toHaveBeenCalledWith(
      'uid',
      expect.objectContaining({ firstName: 'Edited', idempotencyKey: expect.any(String) }),
    );
    expect(updateUserProfile.mock.calls[0][1]).not.toHaveProperty('language');
  });
});