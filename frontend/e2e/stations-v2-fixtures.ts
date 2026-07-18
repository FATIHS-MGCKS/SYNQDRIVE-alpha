/**
 * Playwright fixtures for Stations V2 E2E (rental stations module).
 */
import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow } from './document-upload-fixtures';
import {
  ST_ARCHIVED,
  ST_BERLIN,
  ST_KASSEL,
  STATIONS_V2_TEST_ORG_ID,
  VEH_KASSEL_1,
  buildManyWorkflowVehicles,
  stationActivityFixture,
  stationDtoFromSummary,
  stationFleetReadModelFixture,
  stationOperationsFixture,
  stationOrgSummariesFixture,
  stationSummaryFixture,
  stationTeamFixture,
  stationTimelineWithRuleWarning,
  workflowPreviewFixture,
  workflowVehicleRow,
} from '../src/rental/lib/stations-v2-test-fixtures';

export { assertNoHorizontalOverflow };

export const TEST_ORG_ID = STATIONS_V2_TEST_ORG_ID;

export type StationsV2E2EProfile =
  | 'default'
  | 'scoped'
  | 'partial-data'
  | 'list-error'
  | 'read-only'
  | 'fleet-many';

export const mockUser = {
  id: 'user-stations-v2-e2e',
  email: 'stations@synqdrive.eu',
  name: 'Stations E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: TEST_ORG_ID,
  organizationName: 'Stations V2 E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    stations: { read: true, write: true, manage: true },
    fleet: { read: true, write: true, manage: true },
    vehicles: { read: true, write: true, manage: true },
    bookings: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
  },
};

export const mockReadOnlyUser = {
  ...mockUser,
  permissions: {
    stations: { read: true, write: false, manage: false },
    fleet: { read: true, write: false, manage: false },
    vehicles: { read: true, write: false, manage: false },
    bookings: { read: true, write: false, manage: false },
    tasks: { read: true, write: false, manage: false },
  },
};

interface MockState {
  profile: StationsV2E2EProfile;
  summariesFetchCount: number;
  summariesFailureBudget: number;
  stations: Map<string, ReturnType<typeof stationDtoFromSummary>>;
  summaries: ReturnType<typeof stationOrgSummariesFixture>;
}

const state: MockState = {
  profile: 'default',
  summariesFetchCount: 0,
  summariesFailureBudget: 0,
  stations: new Map(),
  summaries: stationOrgSummariesFixture(),
};

function seedStations() {
  const kasselSummary = stationSummaryFixture({ stationId: ST_KASSEL });
  const berlinSummary = stationSummaryFixture({ stationId: ST_BERLIN });
  const archivedSummary = stationSummaryFixture({ stationId: ST_ARCHIVED });

  state.stations = new Map([
    [ST_KASSEL, stationDtoFromSummary(kasselSummary)],
    [ST_BERLIN, stationDtoFromSummary(berlinSummary)],
    [ST_ARCHIVED, stationDtoFromSummary(archivedSummary)],
  ]);

  state.summaries = stationOrgSummariesFixture({
    stationSummaries: [kasselSummary, berlinSummary],
  });
}

export function resetStationsV2MockState(profile: StationsV2E2EProfile = 'default') {
  state.profile = profile;
  state.summariesFetchCount = 0;
  state.summariesFailureBudget = profile === 'list-error' ? 2 : 0;
  seedStations();

  if (profile === 'scoped') {
    state.summaries = stationOrgSummariesFixture({
      scope: { applied: true, mode: 'SCOPED_STATIONS' },
      stationSummaries: [state.summaries.stationSummaries[0]],
      globalKpis: {
        ...state.summaries.globalKpis,
        stationCount: 1,
      },
    });
  }

  if (profile === 'partial-data') {
    const partialSummary = stationSummaryFixture({
      partialData: {
        complete: false,
        unknownMetricNames: ['pickupsToday'],
        reasons: [{ code: 'PARTIAL_KPI', message: 'Pickups incomplete' }],
      },
    });
    partialSummary.kpis.metrics.pickupsToday = { value: null, known: false, reasons: [] };
    state.summaries = stationOrgSummariesFixture({
      stationSummaries: [partialSummary, state.summaries.stationSummaries[1]],
      partialData: {
        complete: false,
        stationsWithPartialData: 1,
        unknownMetricNames: ['pickupsToday'],
        reasons: [{ code: 'PARTIAL_KPI', message: 'Pickups incomplete' }],
      },
    });
  }
}

export function getSummariesFetchCount() {
  return state.summariesFetchCount;
}

function summariesForProfile() {
  return state.summaries;
}

function patchStationInMocks(
  stationId: string,
  patch: {
    status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    statusLabel?: string;
    archived?: boolean;
    archivedAt?: string | null;
    isPrimary?: boolean;
    name?: string;
  },
) {
  const station = state.stations.get(stationId);
  if (station) {
    state.stations.set(stationId, {
      ...station,
      ...(patch.status ? { status: patch.status, statusLabel: patch.statusLabel ?? patch.status } : {}),
      ...(patch.archivedAt !== undefined ? { archivedAt: patch.archivedAt } : {}),
      ...(patch.isPrimary !== undefined ? { isPrimary: patch.isPrimary } : {}),
      ...(patch.name ? { name: patch.name } : {}),
    });
  }

  state.summaries = stationOrgSummariesFixture({
    ...state.summaries,
    stationSummaries: state.summaries.stationSummaries.map((summary) => {
      if (summary.stationId === stationId) {
        return {
          ...summary,
          masterData: patch.name
            ? { ...summary.masterData, name: patch.name }
            : summary.masterData,
          lifecycle: {
            ...summary.lifecycle,
            ...(patch.status
              ? {
                  status: patch.status,
                  statusLabel: patch.statusLabel ?? patch.status,
                }
              : {}),
            ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
            ...(patch.archivedAt !== undefined ? { archivedAt: patch.archivedAt } : {}),
            ...(patch.isPrimary !== undefined ? { isPrimary: patch.isPrimary } : {}),
          },
        };
      }

      if (patch.isPrimary === true) {
        return {
          ...summary,
          lifecycle: { ...summary.lifecycle, isPrimary: false },
        };
      }

      return summary;
    }),
  });
}

function stationListRows() {
  return [...state.stations.values()].filter((s) => s.status !== 'ARCHIVED');
}

export async function installStationsV2Mocks(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const user = state.profile === 'read-only' ? mockReadOnlyUser : mockUser;

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations/summaries`) && method === 'GET') {
      state.summariesFetchCount += 1;
      if (state.summariesFailureBudget > 0) {
        state.summariesFailureBudget -= 1;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Summaries unavailable (E2E)' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(summariesForProfile()),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations/summaries/contract`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: 2, frontendRecomputation: false }),
      });
    }

    if (url.includes('/archive-preview') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          canArchive: true,
          blockers: [],
          warnings: [{ code: 'VEHICLES_ON_SITE', message: '1 Fahrzeug vor Ort' }],
        }),
      });
    }

    if (url.includes('/restore-preview') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ canRestore: true, blockers: [], warnings: [] }),
      });
    }

    const stationIdMatch = url.match(
      new RegExp(`/organizations/${TEST_ORG_ID}/stations/([^/?]+)`),
    );
    const stationId = stationIdMatch?.[1];

    if (stationId && stationId !== 'summaries' && stationId !== 'stats' && !stationId.includes('vehicle')) {
      if (url.endsWith(`/stations/${stationId}`) && method === 'GET') {
        const station = state.stations.get(stationId);
        if (!station) {
          return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Not found"}' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(station) });
      }

      if (url.includes(`/stations/${stationId}/summary`) && method === 'GET') {
        const summary = state.summaries.stationSummaries.find((s) => s.stationId === stationId)
          ?? stationSummaryFixture({ stationId });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summary) });
      }

      if (url.includes(`/stations/${stationId}/fleet`) && method === 'GET') {
        const parsed = new URL(url);
        const pageNum = Number(parsed.searchParams.get('page') ?? '1');
        const pageSize = Number(parsed.searchParams.get('pageSize') ?? '10');
        const search = (parsed.searchParams.get('search') ?? '').trim().toLowerCase();

        const fleet = stationFleetReadModelFixture({ stationId });
        if (state.profile === 'fleet-many') {
          let all = buildManyWorkflowVehicles(512).map((v) => ({
            id: v.id,
            licensePlate: v.licensePlate,
            make: v.make,
            model: v.model,
            vehicleName: null,
            runtimeState: 'AVAILABLE',
            runtimeStateLabel: 'Verfuegbar',
            homeStation: { id: ST_KASSEL, name: 'Kassel Hauptbahnhof', code: 'KAS' },
            currentStation: { id: ST_KASSEL, name: 'Kassel Hauptbahnhof', code: 'KAS' },
            expectedStation: null,
            positionSource: 'MANUAL',
            lastConfirmationAt: new Date().toISOString(),
            nextAction: null,
            group: 'on_site' as const,
          }));

          if (search) {
            all = all.filter((v) => v.licensePlate?.toLowerCase().includes(search));
          }

          const total = all.length;
          const totalPages = Math.max(1, Math.ceil(total / pageSize));
          const start = (pageNum - 1) * pageSize;
          const slice = all.slice(start, start + pageSize);

          fleet.groups = [
            {
              key: 'on_site',
              total,
              vehicles: slice,
              pagination: { page: pageNum, pageSize, totalPages },
            },
          ];
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fleet) });
      }

      if (url.includes(`/stations/${stationId}/operations-timeline`) && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(stationTimelineWithRuleWarning()),
        });
      }

      if (url.includes(`/stations/${stationId}/operations`) && method === 'GET' && !url.includes('timeline')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(stationOperationsFixture()),
        });
      }

      if (url.includes(`/stations/${stationId}/team`) && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(stationTeamFixture()),
        });
      }

      if (url.includes(`/stations/${stationId}/activity`) && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(stationActivityFixture()),
        });
      }

      if (url.includes(`/stations/${stationId}/activate`) && method === 'POST') {
        patchStationInMocks(stationId, { status: 'ACTIVE', statusLabel: 'Active' });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ station: state.stations.get(stationId) }),
        });
      }

      if (url.includes(`/stations/${stationId}/deactivate`) && method === 'POST') {
        patchStationInMocks(stationId, { status: 'INACTIVE', statusLabel: 'Inactive' });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ station: state.stations.get(stationId) }),
        });
      }

      if (url.includes(`/stations/${stationId}/archive`) && method === 'POST') {
        const archivedAt = new Date().toISOString();
        patchStationInMocks(stationId, {
          status: 'ARCHIVED',
          statusLabel: 'Archived',
          archived: true,
          archivedAt,
        });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(state.stations.get(stationId)),
        });
      }

      if (url.includes(`/stations/${stationId}/restore`) && method === 'POST') {
        patchStationInMocks(stationId, {
          status: 'ACTIVE',
          statusLabel: 'Active',
          archived: false,
          archivedAt: null,
        });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(state.stations.get(stationId)),
        });
      }

      if (url.includes(`/stations/${stationId}/set-primary`) && method === 'POST') {
        patchStationInMocks(stationId, { isPrimary: true });
        for (const [id, row] of state.stations) {
          if (id !== stationId) {
            state.stations.set(id, { ...row, isPrimary: false });
          }
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ station: state.stations.get(stationId) }),
        });
      }

      if (url.includes(`/stations/${stationId}`) && method === 'PATCH') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const current = state.stations.get(stationId)!;
        const updated = { ...current, ...body, updatedAt: new Date().toISOString() };
        state.stations.set(stationId, updated);
        if (body.name) {
          patchStationInMocks(stationId, { name: String(body.name) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      }
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations`) && method === 'POST' && !url.includes('/stations/')) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const id = 'st-v2-new';
      const summary = stationSummaryFixture({
        stationId: id,
        masterData: {
          ...stationSummaryFixture().masterData,
          id,
          name: String(body.name ?? 'Neue Station'),
        },
      });
      const station = stationDtoFromSummary(summary);
      state.stations.set(id, station);
      state.summaries = stationOrgSummariesFixture({
        stationSummaries: [...state.summaries.stationSummaries, summary],
        globalKpis: {
          ...state.summaries.globalKpis,
          stationCount: state.summaries.stationSummaries.length + 1,
        },
      });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(station) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations/vehicle-workflows/vehicles`) && method === 'GET') {
      const parsed = new URL(url);
      const page = Number(parsed.searchParams.get('page') ?? '1');
      const pageSize = Number(parsed.searchParams.get('pageSize') ?? '25');
      const all = state.profile === 'fleet-many' ? buildManyWorkflowVehicles(512) : [workflowVehicleRow()];
      const start = (page - 1) * pageSize;
      const slice = all.slice(start, start + pageSize);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicles: slice,
          pagination: {
            page,
            pageSize,
            total: all.length,
            totalPages: Math.ceil(all.length / pageSize),
          },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations/vehicle-workflows/preview`) && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(workflowPreviewFixture()),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations/vehicles/change-home-station`) && method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations/vehicles/correct-current-station`) && method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations/transfers/plan`) && method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transferId: 'tr-v2-1' }) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations/booking-rules/evaluate`) && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          outcome: 'MANUAL_CONFIRMATION_REQUIRED',
          requiresOverride: true,
          ruleResults: [{ code: 'AFTER_HOURS_RETURN', severity: 'warning', message: 'After-hours return' }],
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations`) && method === 'GET' && !url.includes('/stations/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stationListRows()),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stationListRows()),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today/pickups`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today/returns`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/vehicles`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/tasks/summary`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: 0, open: 0, inProgress: 0, done: 0, overdue: 0, unassigned: 0 }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/tasks`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/notifications`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.includes('/counts')
            ? { totalActive: 0, unread: 0, critical: 0, warning: 0, info: 0, resolvedRecent: 0, byDomain: {} }
            : { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
        ),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/users`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: mockUser.id, name: mockUser.name, email: mockUser.email }]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/support/unread-count`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/activity-log`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }

    if (url.includes('/dashboard-insights') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          hasRun: true,
          stale: false,
          activeInsightCount: 0,
          error: null,
          insights: [],
          summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
        }),
      });
    }

    return route.continue();
  });
}

export async function navigateToStationsView(page: Page, options?: { locale?: string }) {
  const headingPattern = options?.locale === 'en' ? /^Stations$/ : /^Stationen$/;
  const heading = page.getByRole('heading', { name: headingPattern });
  if (await heading.isVisible().catch(() => false)) return;

  const stationsLabel = options?.locale === 'en' ? /^(Stations)$/ : /^(Stationen|Stations)$/;
  const viewport = page.viewportSize();

  if (viewport && viewport.width < 1024) {
    await page.locator('div.lg\\:hidden.fixed.top-0.left-0.right-0 button').first().click();
    await page.locator('div.lg\\:hidden.fixed.top-0').getByRole('button', { name: stationsLabel }).click();
  } else {
    const nav = page.getByRole('button', { name: stationsLabel });
    await nav.first().waitFor({ state: 'visible', timeout: 30_000 });
    await nav.first().click();
  }

  await heading.waitFor({ state: 'visible', timeout: 30_000 });
}

export async function openStationsV2Rental(
  page: Page,
  options?: {
    profile?: StationsV2E2EProfile;
    theme?: 'light' | 'dark';
    locale?: string;
    path?: string;
  },
) {
  resetStationsV2MockState(options?.profile ?? 'default');
  const user = options?.profile === 'read-only' ? mockReadOnlyUser : mockUser;

  await page.addInitScript(
    ({ token, user: initUser, locale, theme }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(initUser));
      localStorage.setItem('synqdrive.locale', locale);
      if (theme) localStorage.setItem('synqdrive-theme-preference', theme);
    },
    {
      token: 'stations-v2-e2e-token',
      user,
      locale: options?.locale ?? 'de',
      theme: options?.theme,
    },
  );

  await installStationsV2Mocks(page);
  await page.goto(options?.path ?? '/rental', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: /^(Dashboard|Übersicht)$/ })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined);
}

export async function openStationsListPage(
  page: Page,
  options?: { profile?: StationsV2E2EProfile; theme?: 'light' | 'dark'; locale?: string },
) {
  await openStationsV2Rental(page, options);
  await navigateToStationsView(page, { locale: options?.locale });
}

export async function openStationDetail(
  page: Page,
  stationName = 'Kassel Hauptbahnhof',
  tab?: 'overview' | 'fleet' | 'schedule' | 'operations' | 'team' | 'activity',
) {
  await page.getByText(stationName, { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: stationName })).toBeVisible({ timeout: 20_000 });

  if (tab && tab !== 'overview') {
    const tabLabels: Record<string, RegExp> = {
      fleet: /^Flotte$/,
      schedule: /^Zeitplan$/,
      operations: /^Betrieb & Regeln$/,
      team: /^Team$/,
      activity: /^Aktivität$/,
    };
    await page.getByRole('tab', { name: tabLabels[tab] }).click();
  }
}

export function stationCardByName(page: Page, name: string) {
  return page.locator('.surface-premium').filter({ hasText: name }).first();
}

export async function clickStationMenuAction(
  page: Page,
  stationName: string,
  actionName: string | RegExp,
) {
  await stationCardByName(page, stationName).getByLabel('Stationsaktionen').click();
  await page.getByRole('menu').getByRole('button', { name: actionName }).click();
}

resetStationsV2MockState();
