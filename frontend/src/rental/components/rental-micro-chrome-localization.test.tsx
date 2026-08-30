// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement, useEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { writePersistedLocale } from '../../i18n/locales';
import { AppErrorBoundary } from '../../components/AppErrorBoundary';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { AIAssistantView } from './AIAssistantView';
import { HomeAwayBadge } from './HomeAwayBadge';
import {
  EffectiveRulesListSkeleton,
  RentalRuleSourceBadge,
} from './shared/rental-requirements-ui';
import { api, streamChatMessage } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import type { Station } from '../../lib/api';

const P266_ENFORCE_CLEAN_EXACT = [
  'rental/components/OrganizationSwitcher.tsx',
  'rental/components/AIAssistantView.tsx',
  'rental/components/HomeAwayBadge.tsx',
  'rental/components/shared/rental-requirements-ui.tsx',
  'rental/App.tsx',
];

const ORG_ID = 'org-p266-x7';
const ORG_ID_ALT = 'org-p266-alt';
const RAW_ORG_NAME = 'Provider Organization X7';
const RAW_ORG_NAME_ALT = 'Provider Organization Alt X7';
const RAW_AI_MESSAGE = 'Provider AI Message X7';
const RAW_RULE_SOURCE_LABEL = 'Organization default';
const RAW_CRASH_ERROR = 'Backend Crash Error X7';

let switchOrganizationCalls = 0;
const apiCounters = { chatAgent: 0, chatHistory: 0 };
let mountCount = 0;

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: ORG_ID,
    orgName: RAW_ORG_NAME,
    availableOrganizations: [
      { organizationId: ORG_ID, organizationName: RAW_ORG_NAME, role: 'ADMIN' },
      { organizationId: ORG_ID_ALT, organizationName: RAW_ORG_NAME_ALT, role: 'WORKER' },
    ],
    switchingOrganization: false,
    switchOrganization: vi.fn(async () => {
      switchOrganizationCalls += 1;
    }),
  }),
}));

vi.mock('../../lib/api', () => ({
  api: {
    chat: {
      getAgent: vi.fn(async () => {
        apiCounters.chatAgent += 1;
        return { agent: { id: 'agent-p266' } };
      }),
      getHistory: vi.fn(async () => {
        apiCounters.chatHistory += 1;
        return [
          {
            id: 'msg-p266-x7',
            role: 'assistant',
            content: RAW_AI_MESSAGE,
            createdAt: '2026-08-30T12:00:00.000Z',
          },
        ];
      }),
    },
  },
  streamChatMessage: vi.fn(),
}));

function LocaleHarness({ children }: { children: ReactNode }) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      mountCount += 1;
    }
  }, []);
  const { locale, setLocale } = useLanguage();
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
    createElement('div', { 'data-testid': `active-locale-${locale}` }, children),
  );
}

function RentalShellErrorBoundaryHarness({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  return createElement(AppErrorBoundary, {
    title: t('rental.shell.errorBoundary.title'),
    description: t('rental.shell.errorBoundary.description'),
    children,
  });
}

function CrashFixture({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error(RAW_CRASH_ERROR);
  }
  return null;
}

async function ensureLocale(container: HTMLElement, locale: 'de' | 'en') {
  const active = container.querySelector(`[data-testid="active-locale-${locale}"]`);
  if (!active) {
    await act(async () => {
      (container.querySelector(`[data-testid="locale-${locale}"]`) as HTMLButtonElement).click();
    });
  }
}

const stationFixture = {
  id: 'station-p266',
  name: 'Provider Station X7',
  latitude: 52.52,
  longitude: 13.405,
  radiusMeters: 500,
} as Station;

const vehicleFixture: VehicleData = {
  id: 'vehicle-p266',
  license: 'B-XY 266',
  lat: 52.521,
  lng: 13.406,
  stationId: stationFixture.id,
  station: stationFixture.name,
} as VehicleData;

beforeEach(() => {
  mountCount = 0;
  switchOrganizationCalls = 0;
  apiCounters.chatAgent = 0;
  apiCounters.chatHistory = 0;
  localStorage.clear();
  writePersistedLocale('de');
  vi.mocked(streamChatMessage).mockReset();
});

describe('rental active micro-chrome localization (P2.2.66)', () => {
  it('keeps P266 enforce-clean scope at zero inventory findings', () => {
    const debt = inventory.findings.filter((f) => P266_ENFORCE_CLEAN_EXACT.includes(f.file));
    expect(debt).toHaveLength(0);
  });

  it('localizes OrganizationSwitcher chrome while preserving raw organization names', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LocaleHarness, {
            children: createElement(OrganizationSwitcher),
          }),
        ),
      );
    });

    await ensureLocale(container, 'de');

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    expect(trigger.textContent).toContain(RAW_ORG_NAME);

    await act(async () => {
      trigger.click();
    });

    const listbox = container.querySelector('[role="listbox"]') as HTMLElement;
    expect(listbox.getAttribute('aria-label')).toBe(de['organization.switcher.listAria']);
    expect(listbox.textContent).toContain(de['organization.switcher.activeLabel']);
    expect(listbox.textContent).toContain(RAW_ORG_NAME);
    expect(listbox.textContent).toContain(RAW_ORG_NAME_ALT);

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    expect(listbox.getAttribute('aria-label')).toBe(en['organization.switcher.listAria']);
    expect(listbox.textContent).toContain(en['organization.switcher.activeLabel']);
    expect(listbox.textContent).toContain(RAW_ORG_NAME);

    await act(async () => {
      (container.querySelector('[data-testid="locale-de"]') as HTMLButtonElement).click();
    });

    expect(switchOrganizationCalls).toBe(0);
    expect(mountCount).toBe(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('localizes AI assistant clear-conversation chrome and preserves raw conversation content', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LocaleHarness, {
            children: createElement(AIAssistantView, { isDarkMode: false }),
          }),
        ),
      );
    });

    await ensureLocale(container, 'de');
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain(RAW_AI_MESSAGE);

    const clearButtonDe = container.querySelector('button[title]') as HTMLButtonElement;
    const clearButtons = [...container.querySelectorAll('button[title]')].filter(
      (btn) => btn.getAttribute('title') === de['aiChat.clearConversation'],
    );
    expect(clearButtons.length).toBeGreaterThan(0);

    const historyCallsBefore = apiCounters.chatHistory;

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    const clearButtonsEn = [...container.querySelectorAll('button[title]')].filter(
      (btn) => btn.getAttribute('title') === en['aiChat.clearConversation'],
    );
    expect(clearButtonsEn.length).toBeGreaterThan(0);
    expect(container.textContent).toContain(RAW_AI_MESSAGE);
    expect(apiCounters.chatHistory).toBe(historyCallsBefore);
    expect(streamChatMessage).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('localizes HomeAwayBadge compact aria-label without changing machine tone', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const stationLookup = {
      byId: new Map([[stationFixture.id, stationFixture]]),
      byName: new Map([[stationFixture.name, stationFixture]]),
    };

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LocaleHarness, {
            children: createElement(HomeAwayBadge, {
              v: vehicleFixture,
              stationLookup,
              isDarkMode: false,
              compact: true,
            }),
          }),
        ),
      );
    });

    await ensureLocale(container, 'de');

    const badge = container.querySelector('span[aria-label]') as HTMLSpanElement;
    expect(badge.getAttribute('aria-label')).toBe(
      de['fleet.geofence.ariaLabel'].replace('{status}', 'Home'),
    );
    expect(badge.className).toContain('bg-emerald-50');

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    expect(badge.getAttribute('aria-label')).toBe(
      en['fleet.geofence.ariaLabel'].replace('{status}', 'Home'),
    );
    expect(badge.className).toContain('bg-emerald-50');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('localizes rental requirements chrome while preserving machine rule-source labels', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LocaleHarness, {
            children: createElement(
              'div',
              null,
              createElement(RentalRuleSourceBadge, {
                source: 'ORGANIZATION_DEFAULT',
              }),
              createElement(EffectiveRulesListSkeleton, { rows: 2 }),
            ),
          }),
        ),
      );
    });

    await ensureLocale(container, 'de');

    expect(container.textContent).toContain(RAW_RULE_SOURCE_LABEL);
    const chip = container.querySelector('[title]') as HTMLElement;
    expect(chip.getAttribute('title')).toBe(
      de['rentalRequirements.ruleSource.title'].replace('{label}', RAW_RULE_SOURCE_LABEL),
    );

    const skeleton = container.querySelector('[aria-busy="true"]') as HTMLElement;
    expect(skeleton.getAttribute('aria-label')).toBe(de['rentalRequirements.loadingEffectiveRules']);

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    expect(chip.getAttribute('title')).toBe(
      en['rentalRequirements.ruleSource.title'].replace('{label}', RAW_RULE_SOURCE_LABEL),
    );
    expect(skeleton.getAttribute('aria-label')).toBe(en['rentalRequirements.loadingEffectiveRules']);
    expect(container.textContent).toContain(RAW_RULE_SOURCE_LABEL);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('localizes rental shell crash boundary framing while preserving raw error message', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LocaleHarness, {
            children: createElement(RentalShellErrorBoundaryHarness, {
              children: createElement(CrashFixture, { shouldThrow: true }),
            }),
          }),
        ),
      );
    });

    await ensureLocale(container, 'de');

    expect(container.textContent).toContain(de['rental.shell.errorBoundary.title']);
    expect(container.textContent).toContain(de['rental.shell.errorBoundary.description']);
    expect(container.textContent).toContain(RAW_CRASH_ERROR);

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain(en['rental.shell.errorBoundary.title']);
    expect(container.textContent).toContain(en['rental.shell.errorBoundary.description']);
    expect(container.textContent).toContain(RAW_CRASH_ERROR);

    consoleError.mockRestore();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps rental/App.tsx wired to localized rental shell error boundary keys', () => {
    const source = readFileSync(
      resolve(__dirname, '../App.tsx'),
      'utf8',
    );
    expect(source).toContain("t('rental.shell.errorBoundary.title')");
    expect(source).toContain("t('rental.shell.errorBoundary.description')");
    expect(source).not.toContain('title="Rental view crashed"');
  });
});
