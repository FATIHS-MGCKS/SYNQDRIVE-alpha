// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { act, createElement, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { writePersistedLocale } from '../../i18n/locales';
import {
  buildPermissionPreviewLines,
  resolveAuditActionLabel,
  resolveMembershipStatusLabel,
} from '../lib/rental-organization-users-roles-i18n';
import {
  buildCreateUserPayload,
  buildInviteUserPayload,
} from './users-roles/iam-member-payload';
import { CreateUserWizard } from './users-roles/CreateUserWizard';
import { PermissionPreview } from './users-roles/PermissionEditor';
import { UsersRolesTab } from './users-roles/UsersRolesTab';
import type { CreateUserFormState } from './users-roles/types';
import type { IamTeamListItemDto, OrganizationRoleDto } from '../../lib/api';
import { api } from '../../lib/api';

const P262_ENFORCE_CLEAN_EXACT = [
  'rental/components/users-roles/UsersRolesTab.tsx',
  'rental/components/users-roles/TeamTab.tsx',
  'rental/components/users-roles/TeamMemberDrawer.tsx',
  'rental/components/users-roles/CreateUserWizard.tsx',
  'rental/components/users-roles/PermissionEditor.tsx',
  'rental/components/users-roles/IamBadges.tsx',
  'rental/components/users-roles/iam-team.utils.ts',
  'rental/components/users-roles/iam-member-payload.ts',
  'rental/components/users-roles/useIamTeam.ts',
  'rental/components/UsersRolesTab.tsx',
  'rental/lib/rental-organization-users-roles-i18n.ts',
];

const RAW_DISPLAY_NAME = 'Provider User Name X7';
const RAW_EMAIL = 'user-x7@example.invalid';
const RAW_JOB_TITLE = 'Provider Job Title X7';
const RAW_CUSTOM_ROLE = 'Provider Custom Role X7';
const ORG_ID = 'org-p262';
const MEMBERSHIP_ID = 'mem-p262-x7';
const ROLE_ID = 'role-p262-x7';
const CREATE_PASSWORD = 'TempPassX7!';

const mutationCounters = {
  invite: 0,
  createUser: 0,
  resend: 0,
  suspend: 0,
  reset: 0,
  revoke: 0,
};

const apiCounters = {
  teamKpis: 0,
  teamList: 0,
  rolesList: 0,
  securityOverview: 0,
  teamMember: 0,
  roleDetail: 0,
  organizationRolesList: 0,
};

let canWrite = true;
let mountCount = 0;

const mockKpis = { activeUsers: 1, openInvites: 0, privilegedAccounts: 0, reviewRequired: 0 };

const mockTeamList: IamTeamListItemDto[] = [
  {
    kind: 'MEMBER',
    membershipId: MEMBERSHIP_ID,
    inviteId: null,
    userSummary: {
      userId: 'user-p262-x7',
      displayName: RAW_DISPLAY_NAME,
      email: RAW_EMAIL,
      avatarUrl: null,
      status: 'ACTIVE',
    },
    effectiveRoleLabel: RAW_CUSTOM_ROLE,
    effectiveRole: 'WORKER',
    riskClassification: 'LOW',
    stationScopeSummary: 'All stations',
    mfaState: 'ENABLED',
    activeSessionCount: 2,
    lastActivityAt: '2026-08-15T10:00:00.000Z',
    membershipStatus: 'ACTIVE',
    reviewState: 'NONE',
    requiresAction: false,
    reasonCodes: [],
  },
];

const mockOrgRole = {
  id: ROLE_ID,
  organizationId: ORG_ID,
  name: RAW_CUSTOM_ROLE,
  description: RAW_JOB_TITLE,
  systemKey: null,
  isSystemTemplate: false,
  isDefault: false,
  isActive: true,
  membershipRole: 'WORKER',
  permissions: { dashboard: { read: true, write: true, manage: false } },
  stationScopeDefault: null,
  defaultStationIds: [],
  fieldAgentAccessDefault: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
} satisfies OrganizationRoleDto;

const mockMemberDetail = {
  userId: 'user-p262-x7',
  membershipId: MEMBERSHIP_ID,
  userSummary: { displayName: RAW_DISPLAY_NAME, email: RAW_EMAIL },
  effectiveAccess: {
    effectiveRoleLabel: RAW_CUSTOM_ROLE,
    riskClassification: 'LOW',
    membershipVersion: 1,
    privilegedCapabilities: [],
    permissions: { dashboard: { read: true, write: true, manage: false } },
  },
  mfaState: 'ENABLED',
  scope: { stationNames: [], stationScope: null, fieldAgentAccess: false },
  sessions: { items: [] },
  auditTimeline: [],
  requiresAction: false,
  reasonCodes: [],
  availableActions: {
    sendResetLink: { enabled: true, impactPreview: null },
    revokeSessions: { enabled: true, impactPreview: null },
    suspendMembership: { enabled: true, impactPreview: null, blockedReason: null },
  },
};

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({
    hasPermission: () => canWrite,
  }),
}));

vi.mock('../../lib/api', () => ({
  api: {
    iam: {
      teamKpis: vi.fn(async () => {
        apiCounters.teamKpis += 1;
        return mockKpis;
      }),
      teamList: vi.fn(async () => {
        apiCounters.teamList += 1;
        return mockTeamList;
      }),
      rolesList: vi.fn(async () => {
        apiCounters.rolesList += 1;
        return [{ id: ROLE_ID, name: RAW_CUSTOM_ROLE, membershipRole: 'WORKER' }];
      }),
      securityOverview: vi.fn(async () => {
        apiCounters.securityOverview += 1;
        return { privilegedAccounts: 0, mfaCoverage: 100, recentEvents: [] };
      }),
      teamMember: vi.fn(async () => {
        apiCounters.teamMember += 1;
        return mockMemberDetail;
      }),
      roleDetail: vi.fn(async () => {
        apiCounters.roleDetail += 1;
        return { id: ROLE_ID, name: RAW_CUSTOM_ROLE };
      }),
      sendResetLink: vi.fn(async () => {
        mutationCounters.reset += 1;
        return { queued: true };
      }),
      revokeAllSessions: vi.fn(async () => {
        mutationCounters.revoke += 1;
        return { revoked: true };
      }),
    },
    organizationInvites: {
      create: vi.fn(async () => {
        mutationCounters.invite += 1;
        return { id: 'invite-p262' };
      }),
      resend: vi.fn(async () => {
        mutationCounters.resend += 1;
        return { id: 'invite-p262' };
      }),
    },
    organizationRoles: {
      list: vi.fn(async () => {
        apiCounters.organizationRolesList += 1;
        return [mockOrgRole];
      }),
    },
    users: {
      createByOrg: vi.fn(async () => {
        mutationCounters.createUser += 1;
        return { id: 'user-new' };
      }),
      updateByOrg: vi.fn(async () => {
        mutationCounters.suspend += 1;
        return { id: 'user-p262-x7' };
      }),
    },
  },
}));

function tFor(locale: 'de' | 'en') {
  const dict = locale === 'de' ? de : en;
  return (key: keyof typeof en, vars?: Record<string, string | number>) => {
    let value = dict[key] ?? String(key);
    if (vars) {
      for (const [name, val] of Object.entries(vars)) {
        value = value.replace(`{${name}}`, String(val));
      }
    }
    return value;
  };
}

function makeForm(): CreateUserFormState {
  return {
    firstName: 'Provider',
    lastName: 'User X7',
    email: RAW_EMAIL,
    phone: '+49123456789',
    department: 'Ops',
    position: RAW_JOB_TITLE,
    organizationRoleId: ROLE_ID,
    stationMode: 'all',
    stationIds: [],
    fieldAgentAccess: true,
    accountMethod: 'invite',
    password: '',
  };
}

function setControlledInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function clickButtonMatching(container: HTMLElement, pattern: RegExp) {
  const buttons = Array.from(container.querySelectorAll('button'));
  const match = buttons.find((btn) => pattern.test(btn.textContent ?? ''));
  if (!match) {
    throw new Error(
      `Button matching ${pattern} not found. Available: ${buttons.map((b) => b.textContent?.trim()).join(' | ')}`,
    );
  }
  match.click();
}

async function waitForText(container: HTMLElement, pattern: RegExp) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (pattern.test(container.textContent ?? '')) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  throw new Error(`Timed out waiting for ${pattern}`);
}

async function advanceWizard(container: HTMLElement, steps = 1) {
  for (let i = 0; i < steps; i += 1) {
    await act(async () => {
      const next = container.querySelector('[data-testid="wizard-next"]') as HTMLButtonElement | null;
      if (!next || next.disabled) {
        throw new Error(`Wizard next disabled at step ${i + 1}`);
      }
      next.click();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function advanceToWizardSubmit(container: HTMLElement) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const submit = container.querySelector('[data-testid="wizard-submit"]') as HTMLButtonElement | null;
    if (submit && !submit.disabled) {
      await act(async () => {
        submit.click();
        await new Promise((r) => setTimeout(r, 0));
      });
      return;
    }
    await advanceWizard(container, 1);
  }
  throw new Error(`Failed to reach wizard submit. Visible: ${container.textContent?.slice(0, 400)}`);
}

function fillPersonStep(container: HTMLElement) {
  const inputs = container.querySelectorAll('input');
  setControlledInputValue(inputs[0] as HTMLInputElement, 'Provider');
  setControlledInputValue(inputs[1] as HTMLInputElement, 'User X7');
  setControlledInputValue(inputs[2] as HTMLInputElement, RAW_EMAIL);
  setControlledInputValue(inputs[3] as HTMLInputElement, '+49123456789');
  setControlledInputValue(inputs[4] as HTMLInputElement, 'Ops');
  setControlledInputValue(inputs[5] as HTMLInputElement, RAW_JOB_TITLE);
}

async function fillPersonStepAsync(container: HTMLElement) {
  await act(async () => {
    fillPersonStep(container);
    await new Promise((r) => setTimeout(r, 0));
  });
}

function MountProbe() {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mountCount += 1;
      mounted.current = true;
    }
  }, []);
  return null;
}

function LocaleButtons() {
  const { setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', 'data-testid': 'locale-de', onClick: () => setLocale('de') },
      'DE',
    ),
    createElement(
      'button',
      { type: 'button', 'data-testid': 'locale-en', onClick: () => setLocale('en') },
      'EN',
    ),
  );
}

function UsersRolesHarness() {
  return createElement(
    'div',
    null,
    createElement(MountProbe),
    createElement(LocaleButtons),
    createElement(UsersRolesTab, { orgId: ORG_ID }),
  );
}

describe('rental member management localization (P2.2.62)', () => {
  beforeEach(() => {
    mountCount = 0;
    canWrite = true;
    Object.keys(mutationCounters).forEach((key) => {
      mutationCounters[key as keyof typeof mutationCounters] = 0;
    });
    Object.keys(apiCounters).forEach((key) => {
      apiCounters[key as keyof typeof apiCounters] = 0;
    });
    writePersistedLocale('de');
    vi.clearAllMocks();
  });

  it('keeps P262 enforce-clean paths at zero scanner debt', () => {
    const p262Debt = inventory.findings.filter((finding) =>
      P262_ENFORCE_CLEAN_EXACT.includes(finding.file),
    );
    expect(p262Debt).toHaveLength(0);
  });

  it('keeps rental-organization-users-roles-i18n.ts presentation-only', () => {
    const source = readFileSync(
      resolve(__dirname, '../lib/rental-organization-users-roles-i18n.ts'),
      'utf8',
    );
    expect(source).not.toContain('buildInviteUserPayload');
    expect(source).not.toContain('buildCreateUserPayload');
    expect(source).toContain('resolvePermissionModuleLabel');
  });

  it('keeps iam-member-payload.ts as mutation payload builder', () => {
    const source = readFileSync(
      resolve(__dirname, './users-roles/iam-member-payload.ts'),
      'utf8',
    );
    expect(source).toContain('buildInviteUserPayload');
    expect(source).toContain('buildCreateUserPayload');
  });

  it('resolves built-in membership status labels in DE and EN', () => {
    expect(resolveMembershipStatusLabel('ACTIVE', tFor('de'))).toBe('Aktiv');
    expect(resolveMembershipStatusLabel('ACTIVE', tFor('en'))).toBe('Active');
    expect(resolveMembershipStatusLabel('PROVIDER_USER_STATUS_X7', tFor('en'))).toBe(
      'PROVIDER_USER_STATUS_X7',
    );
  });

  it('resolves audit action labels without inventing unknown machines', () => {
    expect(resolveAuditActionLabel('USER_INVITED', tFor('en'))).toBe('Invitation sent');
    expect(resolveAuditActionLabel('PROVIDER_ROLE_X7', tFor('en'))).toBeNull();
  });

  it('builds identical invite payloads regardless of presentation locale', () => {
    const form = makeForm();
    const input = {
      orgId: ORG_ID,
      form,
      selectedRole: mockOrgRole,
      stations: [],
      previewPermissions: mockOrgRole.permissions,
    };
    const dePayload = buildInviteUserPayload(input);
    const enPayload = buildInviteUserPayload(input);
    expect(dePayload).toEqual(enPayload);
    expect(dePayload.email).toBe(RAW_EMAIL);
    expect(dePayload.organizationRoleId).toBe(ROLE_ID);
    expect(dePayload.roleLabel).toBe(RAW_CUSTOM_ROLE);
    expect(dePayload.firstName).toBe('Provider');
    expect(dePayload.position).toBe(RAW_JOB_TITLE);
  });

  it('builds identical create-user payloads regardless of presentation locale', () => {
    const form = { ...makeForm(), accountMethod: 'password' as const, password: CREATE_PASSWORD };
    const input = {
      orgId: ORG_ID,
      form,
      selectedRole: mockOrgRole,
      stations: [],
      previewPermissions: mockOrgRole.permissions,
      password: form.password,
    };
    expect(buildCreateUserPayload(input)).toEqual(buildCreateUserPayload(input));
    expect(buildCreateUserPayload(input).role).toBe('WORKER');
  });

  it('localizes PermissionPreview lines across DE and EN without changing permission IDs', () => {
    const permissions = { dashboard: { read: true, write: true, manage: false } };
    const deLines = buildPermissionPreviewLines(permissions, tFor('de'));
    const enLines = buildPermissionPreviewLines(permissions, tFor('en'));
    expect(deLines[0]).toContain(de['nav.dashboard']);
    expect(enLines[0]).toContain(en['nav.dashboard']);
    expect(deLines[0]).not.toBe(enLines[0]);
    expect(buildPermissionPreviewLines(null, tFor('de'))[0]).toBe(
      de['iam.permission.preview.noAccess'],
    );
  });

  it('preserves true same-mount UsersRolesTab state across DE → EN → DE with zero locale refetch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(UsersRolesHarness)));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain(RAW_DISPLAY_NAME);
    expect(container.textContent).toContain('Aktive Benutzer');
    expect(mountCount).toBe(1);

    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      setControlledInputValue(searchInput, 'provider-search-x7');
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      clickButtonMatching(container, /Öffnen|Open/i);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      clickButtonMatching(container, /Benutzer einladen|Invite user/i);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const countersAfterUserActions = { ...apiCounters };
    const mutationsAfterUserActions = { ...mutationCounters };

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain('Active users');
    expect(container.textContent).toContain(RAW_DISPLAY_NAME);
    expect((container.querySelector('input[type="search"]') as HTMLInputElement).value).toBe(
      'provider-search-x7',
    );
    expect(container.textContent).toMatch(/Invite user|Benutzer einladen/);

    await act(async () => {
      (container.querySelector('[data-testid="locale-de"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain('Aktive Benutzer');
    expect(container.textContent).toContain(RAW_DISPLAY_NAME);
    expect((container.querySelector('input[type="search"]') as HTMLInputElement).value).toBe(
      'provider-search-x7',
    );
    expect(apiCounters).toEqual(countersAfterUserActions);
    expect(mutationCounters).toEqual(mutationsAfterUserActions);
    expect(mountCount).toBe(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('submits identical invite payloads from mounted CreateUserWizard in DE and EN', async () => {
    const capturedPayloads: unknown[] = [];

    for (const locale of ['de', 'en'] as const) {
      writePersistedLocale(locale);
      mutationCounters.invite = 0;
      vi.mocked(api.organizationInvites.create).mockClear();

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      const onDone = vi.fn();

      await act(async () => {
        root.render(
          createElement(
            LanguageProvider,
            null,
            createElement(CreateUserWizard, {
              orgId: ORG_ID,
              stations: [],
              inviteOnly: true,
              onClose: () => undefined,
              onDone,
              onError: () => undefined,
            }),
          ),
        );
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      await fillPersonStepAsync(container);
      await advanceWizard(container, 1);
      await waitForText(container, new RegExp(RAW_CUSTOM_ROLE));
      await act(async () => {
        clickButtonMatching(container, new RegExp(RAW_CUSTOM_ROLE));
        await new Promise((r) => setTimeout(r, 0));
      });
      await advanceToWizardSubmit(container);

      expect(mutationCounters.invite).toBe(1);
      expect(onDone).toHaveBeenCalled();
      const call = vi.mocked(api.organizationInvites.create).mock.calls[0];
      expect(call?.[0]).toBe(ORG_ID);
      expect(call?.[1]).toMatchObject({
        email: RAW_EMAIL,
        organizationRoleId: ROLE_ID,
        membershipRole: 'WORKER',
        roleLabel: RAW_CUSTOM_ROLE,
        firstName: 'Provider',
        lastName: 'User X7',
        position: RAW_JOB_TITLE,
        fieldAgentAccess: true,
      });
      capturedPayloads.push(call?.[1]);

      await act(async () => {
        root.unmount();
      });
      container.remove();
    }

    expect(capturedPayloads[0]).toEqual(capturedPayloads[1]);
  });

  it('submits identical create-user payloads from mounted CreateUserWizard in DE and EN', async () => {
    const capturedPayloads: unknown[] = [];

    for (const locale of ['de', 'en'] as const) {
      writePersistedLocale(locale);
      mutationCounters.createUser = 0;
      vi.mocked(api.users.createByOrg).mockClear();

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      const onDone = vi.fn();

      await act(async () => {
        root.render(
          createElement(
            LanguageProvider,
            null,
            createElement(CreateUserWizard, {
              orgId: ORG_ID,
              stations: [],
              onClose: () => undefined,
              onDone,
              onError: () => undefined,
            }),
          ),
        );
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      await fillPersonStepAsync(container);
      await advanceWizard(container, 1);
      await waitForText(container, new RegExp(RAW_CUSTOM_ROLE));
      await act(async () => {
        clickButtonMatching(container, new RegExp(RAW_CUSTOM_ROLE));
        await new Promise((r) => setTimeout(r, 0));
      });
      await advanceWizard(container, 2);
      await waitForText(container, /Passwort manuell|Set password manually/i);
      await act(async () => {
        clickButtonMatching(container, /Passwort manuell|Set password manually/i);
        await new Promise((r) => setTimeout(r, 0));
      });
      const passwordInput = container.querySelector('code')?.textContent ?? '';
      expect(passwordInput.length).toBeGreaterThan(6);
      await advanceToWizardSubmit(container);

      expect(mutationCounters.createUser).toBe(1);
      expect(onDone).toHaveBeenCalled();
      const call = vi.mocked(api.users.createByOrg).mock.calls[0];
      expect(call?.[0]).toBe(ORG_ID);
      expect(call?.[1]).toMatchObject({
        email: RAW_EMAIL,
        organizationRoleId: ROLE_ID,
        role: 'WORKER',
        roleLabel: RAW_CUSTOM_ROLE,
        firstName: 'Provider',
        lastName: 'User X7',
        position: RAW_JOB_TITLE,
        fieldAgentAccess: true,
      });
      capturedPayloads.push(call?.[1]);

      await act(async () => {
        root.unmount();
      });
      container.remove();
    }

    const [dePayload, enPayload] = capturedPayloads as Array<Record<string, unknown>>;
    const { password: dePassword, ...deRest } = dePayload;
    const { password: enPassword, ...enRest } = enPayload;
    expect(deRest).toEqual(enRest);
    expect(dePassword).toBeTruthy();
    expect(enPassword).toBeTruthy();
  });

  it('keeps invite button visibility stable across locales', async () => {
    canWrite = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(UsersRolesHarness)));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toMatch(/Benutzer einladen/);

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toMatch(/Invite user/);

    canWrite = false;
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(UsersRolesHarness)));
    });
    expect(container.textContent).not.toMatch(/Invite user/);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders localized PermissionPreview copy across locale switch on same mount', async () => {
    const permissions = { dashboard: { read: true, write: false, manage: false } };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function PreviewHarness() {
      return createElement(
        'div',
        null,
        createElement(LocaleButtons),
        createElement(PermissionPreview, { permissions }),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(PreviewHarness)));
    });

    expect(container.textContent).toContain(de['iam.permission.preview.read'].replace('{module}', de['nav.dashboard']));

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain(en['iam.permission.preview.read'].replace('{module}', en['nav.dashboard']));
    expect(container.textContent).not.toContain('Darf');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
