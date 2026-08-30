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

const RAW_STATION_NAME = 'Provider Station X7';
const RAW_LICENSE = 'KS MX 2024';

function translateDict(
  dict: Record<string, string>,
  key: string,
  vars?: Record<string, string>,
): string {
  let text = dict[key] ?? key;
  if (vars) {
    Object.entries(vars).forEach(([name, value]) => {
      text = text.replace(`{${name}}`, value);
    });
  }
  return text;
}

const stationFixture = {
  id: 'station-p266',
  name: RAW_STATION_NAME,
  latitude: 52.52,
  longitude: 13.405,
  radiusMeters: 500,
} as Station;

const vehicleFixture: VehicleData = {
  id: 'vehicle-p266',
  license: RAW_LICENSE,
  lat: 52.521,
  lng: 13.406,
  stationId: stationFixture.id,
  station: stationFixture.name,
} as VehicleData;

function buildStationLookup(station: Station) {
  return {
    byId: new Map([[station.id, station]]),
    byName: new Map([[station.name, station]]),
  };
}

async function renderHomeAwayBadge(
  props: {
    v: VehicleData;
    stationLookup: ReturnType<typeof buildStationLookup> | null;
    compact?: boolean;
  },
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        LanguageProvider,
        null,
        createElement(LocaleHarness, {
          children: createElement(HomeAwayBadge, {
            v: props.v,
            stationLookup: props.stationLookup,
            isDarkMode: false,
            compact: props.compact ?? false,
          }),
        }),
      ),
    );
  });

  return { container, root };
}

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

  it('localizes HomeAwayBadge tooltips and labels across HOME, AWAY, and UNKNOWN without changing geofence semantics', async () => {
    const homeLookup = buildStationLookup(stationFixture);
    const { container: homeContainer, root: homeRoot } = await renderHomeAwayBadge({
      v: vehicleFixture,
      stationLookup: homeLookup,
      compact: true,
    });

    await ensureLocale(homeContainer, 'de');
    const homeBadge = homeContainer.querySelector('span[aria-label]') as HTMLSpanElement;
    const homeDetailDe = translateDict(de, 'fleet.geofence.tooltip.home', { stationName: RAW_STATION_NAME });
    expect(homeBadge.getAttribute('title')).toBe(
      `${de['fleet.geofence.state.home']} — ${homeDetailDe}`,
    );
    expect(homeBadge.getAttribute('aria-label')).toBe(
      translateDict(de, 'fleet.geofence.ariaLabel', { status: de['fleet.geofence.state.home'] }),
    );
    expect(homeBadge.className).toContain('bg-emerald-50');
    expect(homeDetailDe).toContain(RAW_STATION_NAME);

    await act(async () => {
      (homeContainer.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    const homeDetailEn = translateDict(en, 'fleet.geofence.tooltip.home', { stationName: RAW_STATION_NAME });
    expect(homeBadge.getAttribute('title')).toBe(
      `${en['fleet.geofence.state.home']} — ${homeDetailEn}`,
    );
    expect(homeBadge.getAttribute('aria-label')).toBe(
      translateDict(en, 'fleet.geofence.ariaLabel', { status: en['fleet.geofence.state.home'] }),
    );
    expect(homeBadge.getAttribute('title')).not.toContain('Umkreis');
    expect(homeDetailEn).toContain(RAW_STATION_NAME);

    await act(async () => {
      (homeContainer.querySelector('[data-testid="locale-de"]') as HTMLButtonElement).click();
    });
    expect(mountCount).toBe(1);
    await act(async () => {
      homeRoot.unmount();
    });
    homeContainer.remove();

    const awayVehicle = {
      ...vehicleFixture,
      lat: 53.0,
      lng: 14.0,
    } as VehicleData;
    const { container: awayContainer, root: awayRoot } = await renderHomeAwayBadge({
      v: awayVehicle,
      stationLookup: homeLookup,
      compact: false,
    });
    await ensureLocale(awayContainer, 'de');

    const awayBadge = awayContainer.querySelector('span[title]') as HTMLSpanElement;
    const awayDetailDe = translateDict(de, 'fleet.geofence.tooltip.away', { stationName: RAW_STATION_NAME });
    expect(awayBadge.textContent).toContain(de['fleet.geofence.state.away']);
    expect(awayBadge.getAttribute('title')).toBe(awayDetailDe);
    expect(awayBadge.className).toContain('bg-gray-100');

    await act(async () => {
      (awayContainer.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });
    expect(awayBadge.getAttribute('title')).toBe(
      translateDict(en, 'fleet.geofence.tooltip.away', { stationName: RAW_STATION_NAME }),
    );
    expect(awayBadge.textContent).toContain(en['fleet.geofence.state.away']);
    await act(async () => {
      awayRoot.unmount();
    });
    awayContainer.remove();

    const unknownCases = [
      {
        name: 'station-unresolved',
        stationLookup: null,
        vehicle: { ...vehicleFixture, station: RAW_STATION_NAME, stationId: 'missing-station' } as VehicleData,
        key: 'fleet.geofence.tooltip.stationUnresolved',
        vars: { stationName: RAW_STATION_NAME },
      },
      {
        name: 'missing-coordinates',
        stationLookup: buildStationLookup({
          ...stationFixture,
          latitude: null,
          longitude: null,
        } as Station),
        vehicle: vehicleFixture,
        key: 'fleet.geofence.tooltip.missingCoordinates',
        vars: { stationName: RAW_STATION_NAME },
      },
      {
        name: 'missing-radius',
        stationLookup: buildStationLookup({
          ...stationFixture,
          radiusMeters: null,
        } as Station),
        vehicle: vehicleFixture,
        key: 'fleet.geofence.tooltip.missingRadius',
        vars: { stationName: RAW_STATION_NAME },
      },
      {
        name: 'missing-gps',
        stationLookup: homeLookup,
        vehicle: { ...vehicleFixture, lat: undefined, lng: undefined } as VehicleData,
        key: 'fleet.geofence.tooltip.missingGps',
        vars: { license: RAW_LICENSE },
      },
      {
        name: 'generic-unknown',
        stationLookup: homeLookup,
        vehicle: { ...vehicleFixture, lat: Number.NaN, lng: Number.NaN } as VehicleData,
        key: 'fleet.geofence.tooltip.unknown',
        vars: { stationName: RAW_STATION_NAME },
      },
    ] as const;

    for (const unknownCase of unknownCases) {
      const { container, root } = await renderHomeAwayBadge({
        v: unknownCase.vehicle,
        stationLookup: unknownCase.stationLookup,
        compact: true,
      });
      await ensureLocale(container, 'de');

      const badge = container.querySelector('span[aria-label]') as HTMLSpanElement;
      const detailDe = translateDict(de, unknownCase.key, unknownCase.vars);
      expect(badge.getAttribute('title')).toContain(detailDe);
      expect(badge.className).toContain('bg-amber-50');

      await act(async () => {
        (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
      });

      const detailEn = translateDict(en, unknownCase.key, unknownCase.vars);
      expect(badge.getAttribute('title')).toContain(detailEn);
      expect(badge.getAttribute('title')).not.toMatch(/Umkreis|Koordinaten|Geofence-Status/);
      if ('stationName' in unknownCase.vars) {
        expect(badge.getAttribute('title')).toContain(RAW_STATION_NAME);
      }
      if ('license' in unknownCase.vars) {
        expect(badge.getAttribute('title')).toContain(RAW_LICENSE);
      }

      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
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
