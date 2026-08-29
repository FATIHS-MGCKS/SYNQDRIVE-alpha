// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { writePersistedLocale } from '../../i18n/locales';
import {
  buildCreateUserPayload,
  buildInviteUserPayload,
  resolveAuditActionLabel,
  resolveMembershipStatusLabel,
} from '../lib/rental-organization-users-roles-i18n';
import { TeamTab } from './users-roles/TeamTab';
import type { CreateUserFormState } from './users-roles/types';
import type { IamTeamListItemDto, OrganizationRoleDto } from '../../lib/api';

const P262_ENFORCE_CLEAN_EXACT = [
  'rental/components/users-roles/UsersRolesTab.tsx',
  'rental/components/users-roles/TeamTab.tsx',
  'rental/components/users-roles/TeamMemberDrawer.tsx',
  'rental/components/users-roles/CreateUserWizard.tsx',
  'rental/components/users-roles/IamBadges.tsx',
  'rental/components/users-roles/iam-team.utils.ts',
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

const mutationCounters = {
  invite: 0,
  createUser: 0,
  resend: 0,
  suspend: 0,
  reset: 0,
  revoke: 0,
  loadTeam: 0,
};

let canWrite = true;
let teamTabMountCount = 0;

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

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({
    hasPermission: () => canWrite,
  }),
}));

vi.mock('../../lib/api', () => ({
  api: {
    iam: {
      teamMember: vi.fn(async () => ({
        userId: 'user-p262-x7',
        membershipId: MEMBERSHIP_ID,
        userSummary: { displayName: RAW_DISPLAY_NAME, email: RAW_EMAIL },
        effectiveAccess: {
          effectiveRoleLabel: RAW_CUSTOM_ROLE,
          riskClassification: 'LOW',
          membershipVersion: 1,
          privilegedCapabilities: [],
          permissions: {},
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
      })),
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
      list: vi.fn(async () => [
        {
          id: ROLE_ID,
          name: RAW_CUSTOM_ROLE,
          description: RAW_JOB_TITLE,
          membershipRole: 'WORKER',
          isSystemTemplate: false,
          fieldAgentAccessDefault: false,
          permissions: null,
        },
      ]),
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
}

function MountProbe() {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      teamTabMountCount += 1;
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

function TeamTabHarness() {
  return createElement(
    'div',
    null,
    createElement(MountProbe),
    createElement(LocaleButtons),
    createElement(TeamTab, {
      orgId: ORG_ID,
      team: mockTeamList,
      kpis: { activeUsers: 1, openInvites: 0, privilegedAccounts: 0, reviewRequired: 0 },
      loading: false,
      error: null,
      onSearch: async () => {
        mutationCounters.loadTeam += 1;
      },
      onRefresh: async () => undefined,
      onOpenMember: async () => undefined,
    }),
  );
}

describe('rental member management localization (P2.2.62)', () => {
  beforeEach(() => {
    teamTabMountCount = 0;
    canWrite = true;
    Object.keys(mutationCounters).forEach((key) => {
      mutationCounters[key as keyof typeof mutationCounters] = 0;
    });
    writePersistedLocale('de');
  });

  it('keeps P262 enforce-clean paths at zero scanner debt', () => {
    const p262Debt = inventory.findings.filter((finding) =>
      P262_ENFORCE_CLEAN_EXACT.includes(finding.file),
    );
    expect(p262Debt).toHaveLength(0);
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
    const selectedRole = {
      id: ROLE_ID,
      organizationId: ORG_ID,
      name: RAW_CUSTOM_ROLE,
      description: RAW_JOB_TITLE,
      systemKey: null,
      isSystemTemplate: false,
      isDefault: false,
      isActive: true,
      membershipRole: 'WORKER',
      permissions: null,
      stationScopeDefault: null,
      defaultStationIds: [],
      fieldAgentAccessDefault: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    } satisfies OrganizationRoleDto;
    const input = {
      orgId: ORG_ID,
      form,
      selectedRole,
      stations: [],
      previewPermissions: null,
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
    const form = { ...makeForm(), accountMethod: 'password' as const, password: 'TempPassX7!' };
    const selectedRole = {
      id: ROLE_ID,
      organizationId: ORG_ID,
      name: RAW_CUSTOM_ROLE,
      description: RAW_JOB_TITLE,
      systemKey: null,
      membershipRole: 'WORKER',
      isSystemTemplate: false,
      isDefault: false,
      isActive: true,
      permissions: null,
      stationScopeDefault: null,
      defaultStationIds: [],
      fieldAgentAccessDefault: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    } satisfies OrganizationRoleDto;
    const input = {
      orgId: ORG_ID,
      form,
      selectedRole,
      stations: [],
      previewPermissions: null,
      password: form.password,
    };
    expect(buildCreateUserPayload(input)).toEqual(buildCreateUserPayload(input));
    expect(buildCreateUserPayload(input).role).toBe('WORKER');
  });

  it('preserves raw user data and search state across DE → EN → DE same mount', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(TeamTabHarness)));
    });

    expect(container.textContent).toContain(RAW_DISPLAY_NAME);
    expect(container.textContent).toContain(RAW_EMAIL);
    expect(container.textContent).toContain(RAW_CUSTOM_ROLE);
    expect(container.textContent).toContain('Aktive Benutzer');

    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      setControlledInputValue(searchInput, 'provider-search-x7');
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    const beforeMutations = { ...mutationCounters };

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain(RAW_DISPLAY_NAME);
    expect(container.textContent).toContain('Active users');
    expect((container.querySelector('input[type="search"]') as HTMLInputElement).value).toBe(
      'provider-search-x7',
    );

    await act(async () => {
      (container.querySelector('[data-testid="locale-de"]') as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain('Aktive Benutzer');
    expect(container.textContent).toContain(RAW_DISPLAY_NAME);
    expect((container.querySelector('input[type="search"]') as HTMLInputElement).value).toBe(
      'provider-search-x7',
    );
    expect(mutationCounters.invite).toBe(beforeMutations.invite);
    expect(mutationCounters.createUser).toBe(beforeMutations.createUser);
    expect(mutationCounters.resend).toBe(beforeMutations.resend);
    expect(mutationCounters.suspend).toBe(beforeMutations.suspend);
    expect(teamTabMountCount).toBe(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps invite button visibility stable across locales', async () => {
    canWrite = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(TeamTabHarness)));
    });

    expect(container.textContent).toMatch(/Benutzer einladen/);

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toMatch(/Invite user/);

    canWrite = false;
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(TeamTabHarness)));
    });
    expect(container.textContent).not.toMatch(/Invite user/);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
