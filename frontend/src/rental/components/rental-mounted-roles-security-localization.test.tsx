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
  resolveAuditEventTitle,
  resolvePermissionModuleLabel,
} from '../lib/rental-organization-users-roles-i18n';
import { UsersRolesTab } from './users-roles/UsersRolesTab';
import { api } from '../../lib/api';

const P263_ENFORCE_CLEAN_EXACT = [
  'rental/components/users-roles/RolesAccessTab.tsx',
  'rental/components/users-roles/SecurityAuditTab.tsx',
];

const ORG_ID = 'org-p263';
const ROLE_ID = 'role-p263-x7';
const RAW_CUSTOM_ROLE = 'Provider Custom Role X7';
const RAW_CUSTOM_ROLE_DESC = 'Provider Custom Role Description X7';
const RAW_AUDIT_UNKNOWN = 'Backend Security Audit Event X7';
const RAW_ACTOR = 'Provider Actor X7';

const apiCounters = {
  teamKpis: 0,
  teamList: 0,
  rolesList: 0,
  securityOverview: 0,
  roleDetail: 0,
};

let mountCount = 0;

const mockRoleListItem = {
  id: ROLE_ID,
  name: RAW_CUSTOM_ROLE,
  description: RAW_CUSTOM_ROLE_DESC,
  membershipRole: 'WORKER',
  assignmentCount: 2,
  riskClassification: 'LOW' as const,
  roleVersion: '2026-08-01T00:00:00.000Z',
  lastChangedAt: '2026-08-01T00:00:00.000Z',
  isSystemTemplate: false,
  isDefault: false,
  followsLatest: true,
  pinned: true,
  isActive: true,
};

const mockRoleDetail = {
  ...mockRoleListItem,
  effectivePermissions: {
    dashboard: { read: true, write: true, manage: false },
    PROVIDER_PERMISSION_MODULE_X7: { read: true, write: false, manage: false },
  },
  overrides: {
    stationScopeDefault: null,
    defaultStationIds: [],
    fieldAgentAccessDefault: false,
  },
  impactPreview: {
    affectedMemberCount: 2,
    privilegedCapabilities: ['CAP_X7'],
    stationScopeImpact: 'All stations',
  },
  assignments: [],
};

const mockSecurityOverview = {
  mfaSummary: {
    ENABLED: 1,
    DISABLED: 0,
    REQUIRED: 0,
    ACTION_REQUIRED: 0,
    UNKNOWN: 0,
    NOT_SUPPORTED: 0,
  },
  activeSessions: 3,
  privilegedAccounts: 1,
  reviewRequired: 0,
  loginSecurityEvents: [],
  iamAudit: [
    {
      id: 'audit-known',
      auditAction: 'USER_INVITED',
      description: 'ignored when action known',
      createdAt: '2026-08-15T10:00:00.000Z',
      level: 'info',
    },
    {
      id: 'audit-unknown',
      auditAction: 'PROVIDER_AUDIT_ACTION_X7',
      description: RAW_AUDIT_UNKNOWN,
      createdAt: '2026-08-15T11:00:00.000Z',
      level: 'warning',
    },
  ],
  accessReviews: [],
  privilegedMembers: [
    {
      membershipId: 'mem-p263',
      userId: 'user-p263',
      displayName: RAW_ACTOR,
      email: 'actor@example.invalid',
      riskClassification: 'LOW' as const,
      mfaState: 'ENABLED' as const,
    },
  ],
};

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({
    hasPermission: () => true,
  }),
}));

vi.mock('../../lib/api', () => ({
  api: {
    iam: {
      teamKpis: vi.fn(async () => {
        apiCounters.teamKpis += 1;
        return { activeUsers: 0, openInvites: 0, privilegedAccounts: 1, reviewRequired: 0 };
      }),
      teamList: vi.fn(async () => {
        apiCounters.teamList += 1;
        return [];
      }),
      rolesList: vi.fn(async () => {
        apiCounters.rolesList += 1;
        return [mockRoleListItem];
      }),
      securityOverview: vi.fn(async () => {
        apiCounters.securityOverview += 1;
        return mockSecurityOverview;
      }),
      roleDetail: vi.fn(async () => {
        apiCounters.roleDetail += 1;
        return mockRoleDetail;
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

describe('rental mounted roles & security localization (P2.2.63)', () => {
  beforeEach(() => {
    mountCount = 0;
    Object.keys(apiCounters).forEach((key) => {
      apiCounters[key as keyof typeof apiCounters] = 0;
    });
    writePersistedLocale('de');
    vi.clearAllMocks();
  });

  it('keeps P263 enforce-clean paths at zero scanner debt', () => {
    const p263Debt = inventory.findings.filter((finding) =>
      P263_ENFORCE_CLEAN_EXACT.includes(finding.file),
    );
    expect(p263Debt).toHaveLength(0);
  });

  it('keeps rental-organization-users-roles-i18n.ts presentation-only after P263 extensions', () => {
    const source = readFileSync(
      resolve(__dirname, '../lib/rental-organization-users-roles-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('resolveAuditEventTitle');
    expect(source).not.toContain('buildInviteUserPayload');
    expect(source).not.toContain('api.organizationRoles');
  });

  it('resolves known audit actions and preserves unknown raw descriptions', () => {
    expect(resolveAuditEventTitle('USER_INVITED', 'ignored', tFor('en'))).toBe('Invitation sent');
    expect(resolveAuditEventTitle('PROVIDER_AUDIT_ACTION_X7', RAW_AUDIT_UNKNOWN, tFor('en'))).toBe(
      RAW_AUDIT_UNKNOWN,
    );
    expect(resolveAuditEventTitle(null, RAW_AUDIT_UNKNOWN, tFor('de'))).toBe(RAW_AUDIT_UNKNOWN);
  });

  it('does not map unknown permission modules to known labels', () => {
    expect(resolvePermissionModuleLabel('PROVIDER_PERMISSION_MODULE_X7', tFor('en'))).toBe(
      'PROVIDER_PERMISSION_MODULE_X7',
    );
    expect(resolvePermissionModuleLabel('legal-documents-audit', tFor('en'))).toBe(
      en['iam.permission.module.legal-documents-audit'],
    );
  });

  it('localizes RolesAccessTab and SecurityAuditTab host copy in DE and EN', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(UsersRolesHarness)));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      clickButtonMatching(container, /Rollen & Zugriff|Roles & Access/i);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain(RAW_CUSTOM_ROLE);
    expect(container.textContent).toContain(de['iam.roles.meta.pinned']);
    expect(container.textContent).toContain(de['iam.roles.selectPrompt']);

    await act(async () => {
      clickButtonMatching(container, new RegExp(RAW_CUSTOM_ROLE));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain(RAW_CUSTOM_ROLE_DESC);
    expect(container.textContent).toContain('All stations');

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain(en['iam.roles.meta.pinned']);
    expect(container.textContent).toContain(RAW_CUSTOM_ROLE);
    expect(container.textContent).toContain(RAW_CUSTOM_ROLE_DESC);

    await act(async () => {
      clickButtonMatching(container, /Sicherheit & Audit|Security & Audit/i);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain(RAW_ACTOR);
    expect(container.textContent).toContain(en['iam.audit.USER_INVITED']);
    expect(container.textContent).toContain(RAW_AUDIT_UNKNOWN);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('preserves same-mount state across DE → EN → DE with zero locale business refetch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(UsersRolesHarness)));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mountCount).toBe(1);

    await act(async () => {
      clickButtonMatching(container, /Rollen & Zugriff|Roles & Access/i);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      clickButtonMatching(container, new RegExp(RAW_CUSTOM_ROLE));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      clickButtonMatching(container, /Erweiterte Berechtigungen|Advanced permissions/i);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const countersAfterState = { ...apiCounters };

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain(RAW_CUSTOM_ROLE);
    expect(container.textContent).toContain(RAW_CUSTOM_ROLE_DESC);
    expect(container.textContent).toContain(en['iam.permission.collapsible.title']);
    expect(apiCounters).toEqual(countersAfterState);

    await act(async () => {
      clickButtonMatching(container, /Sicherheit & Audit|Security & Audit/i);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain(RAW_ACTOR);
    expect(container.textContent).toContain(RAW_AUDIT_UNKNOWN);
    expect(container.textContent).toContain(en['iam.audit.USER_INVITED']);

    await act(async () => {
      (container.querySelector('[data-testid="locale-de"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain(RAW_ACTOR);
    expect(container.textContent).toContain(RAW_AUDIT_UNKNOWN);
    expect(container.textContent).toContain(de['iam.audit.USER_INVITED']);
    expect(apiCounters).toEqual(countersAfterState);
    expect(mountCount).toBe(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
