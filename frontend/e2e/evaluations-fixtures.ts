/**
 * Playwright fixtures for Auswertungen (Evaluations) responsive E2E.
 */
import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow } from './document-upload-fixtures';

export { assertNoHorizontalOverflow };

export const TEST_ORG_ID = 'org-evaluations-e2e';

export const mockUser = {
  id: 'user-evaluations-e2e',
  email: 'evaluations@synqdrive.eu',
  name: 'Evaluations E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: TEST_ORG_ID,
  organizationName: 'Evaluations E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    fleet: { read: true, write: true, manage: true },
    bookings: { read: true, write: true, manage: true },
    customers: { read: true, write: true, manage: true },
    invoices: { read: true, write: true, manage: true },
  },
};

const ts = '2026-07-24T10:00:00.000Z';

const period = {
  key: 'mtd',
  label: 'Juli 2026',
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-24T12:00:00.000Z',
  timezone: 'Europe/Berlin',
};

const comparisonPeriod = {
  key: 'mtd',
  label: 'Juni 2026',
  from: '2026-06-01T00:00:00.000Z',
  to: '2026-06-30T23:59:59.999Z',
  timezone: 'Europe/Berlin',
};

const appliedFilters = {
  period,
  comparisonPeriod,
  stationId: null,
  vehicleId: null,
  vehicleClassId: null,
  vehicleStatus: null,
  bookingStatus: null,
  customerSegment: null,
  currency: 'EUR',
  riskCategory: null,
  insightStatus: null,
  dataQualityStatus: null,
};

function envelope<T>(data: T | null, status = 'OK') {
  return { status, data, error: null, generatedAt: ts };
}

export function buildMockAnalyticsSummary() {
  return {
    organizationId: TEST_ORG_ID,
    generatedAt: ts,
    period,
    comparisonPeriod,
    appliedFilters,
    overallStatus: 'OK',
    executive: envelope({
      revenueMtdMinor: 500_000,
      expensesMtdMinor: 200_000,
      netMarginMinor: 300_000,
      openReceivablesMinor: 30_000,
      overdueReceivablesMinor: 5_000,
      activeBookings: 12,
      fleetUtilizationPercent: 72.5,
      criticalRisks: 1,
      currency: 'EUR',
    }),
    financial: envelope({
      revenueMtdMinor: 500_000,
      revenuePreviousMinor: 400_000,
      revenueDeltaPercent: 25,
      expensesMtdMinor: 200_000,
      expensesPreviousMinor: 180_000,
      expensesDeltaPercent: 11,
      netMarginMinor: 300_000,
      paidRevenueMtdMinor: 420_000,
      currency: 'EUR',
    }),
    receivables: envelope({
      openCount: 3,
      openAmountMinor: 30_000,
      overdueCount: 1,
      overdueAmountMinor: 5_000,
      currency: 'EUR',
    }),
    bookings: envelope({
      active: 8,
      pending: 4,
      completed: 120,
      revenueTodayMinor: 12_000,
      revenueMtdMinor: 500_000,
      revenuePreviousMinor: 400_000,
      revenueDeltaPercent: 25,
      currency: 'EUR',
    }),
    fleetUtilization: envelope({
      totalOperational: 10,
      rented: 6,
      available: 3,
      reserved: 1,
      utilizationPercent: 72.5,
      underutilizedVehicles: 2,
    }),
    vehicleAvailability: envelope({
      total: 10,
      available: 3,
      rented: 6,
      reserved: 1,
      maintenance: 1,
      blocked: 0,
      other: 0,
      readyPercent: 90,
    }),
    downtime: envelope({
      maintenanceVehicles: 2,
      blockedVehicles: 1,
      cleaningRequiredVehicles: 0,
      totalDowntimeVehicles: 3,
      downtimePercent: 5,
    }),
    costs: envelope({
      expensesMtdMinor: 200_000,
      expensesPreviousMinor: 180_000,
      expensesDeltaPercent: 11,
      fixedCostsMtdMinor: 80_000,
      variableCostsMtdMinor: 120_000,
      currency: 'EUR',
    }),
    costModel: envelope({
      calculationVersion: 'cost-model-v1',
      currency: 'EUR',
      period,
      totals: {
        actualExpensesMinor: 200_000,
        estimatedFixedCostsMinor: 80_000,
        recordedDamageCostsMinor: 10_000,
        recordedMaintenanceCostsMinor: 20_000,
        invoiceExpenseCount: 10,
        invoicesWithVehicleLinkCount: 8,
      },
      denominators: {
        vehicleCount: 10,
        completedBookings: 20,
        totalKmDriven: 1000,
        bookingsWithKm: 18,
        totalRentalDays: 60,
        bookingsWithRentalDays: 20,
        cancelledBookings: 1,
        noShowBookings: 0,
      },
      metrics: [
        {
          key: 'COST_BY_STATION',
          label: 'Kosten nach Station',
          formula: 'sum',
          dataSources: [],
          coverage: { numeratorCount: 8, denominatorCount: 10, percent: 80 },
          period,
          currency: 'EUR',
          status: 'ACTUAL',
          calculationVersion: 'cost-model-v1',
          valueMinor: 200_000,
          unit: 'EUR',
          breakdown: [
            { dimension: 'STATION', key: 's1', label: 'Berlin', valueMinor: 150_000, vehicleCount: 5 },
            { dimension: 'STATION', key: 's2', label: 'München', valueMinor: 50_000, vehicleCount: 3 },
          ],
        },
      ],
      dataGaps: [],
    }),
    utilizationModel: envelope({
      calculationVersion: 'utilization-v1',
      period,
      metrics: [
        {
          key: 'UTILIZATION',
          label: 'Auslastung',
          valuePercent: 72.5,
          valueMs: null,
          status: 'ACTUAL',
        },
      ],
    }),
    activeRisks: envelope({
      businessRiskGroups: 2,
      revenueLeakageGroups: 1,
      complianceInsightGroups: 0,
      criticalInsights: 1,
      criticalBookings: 0,
      estimatedExposureMinor: 20_000,
      exposureCurrency: 'EUR',
      orgWideRisks: 2,
      bookingScopedRisks: 1,
    }),
    affectedEntities: envelope({
      insightGroups: 3,
      events: 5,
      affectedVehicles: 2,
      affectedBookings: 1,
      affectedCustomers: 0,
      affectedStations: 1,
      uniqueEntities: 4,
      criticalBookings: 0,
      orgWideRisks: 1,
      bookingScopedRisks: 1,
    }),
    strengths: envelope({
      calculationVersion: 'strength-v1',
      rulesEvaluated: 10,
      strengths: [],
      rulesSuppressed: [],
      highlights: [],
      period,
      comparisonPeriod,
    }),
    weaknesses: envelope({
      calculationVersion: 'weakness-v1',
      rulesEvaluated: 12,
      weaknesses: [],
      rulesSuppressed: [],
      highlights: [],
      period,
      comparisonPeriod,
    }),
    driverAnalysis: envelope({
      calculationVersion: 'driver-v1',
      disclaimer: 'Korrelation ist nicht Kausalität.',
      strengthDrivers: [],
      weaknessDrivers: [],
      riskDrivers: [],
      analysesProduced: 0,
    }),
    dataQuality: envelope({
      calculationVersion: 'dq-v1',
      period,
      rollupStatus: 'GOOD',
      overallStatus: 'OK',
      sources: [
        {
          sourceKey: 'INVOICES',
          label: 'Rechnungen',
          period,
          integrationConnected: true,
          overallState: 'GOOD',
          dimensions: [],
          expectedRecordCount: 100,
          presentRecordCount: 100,
          coveragePercent: 100,
          lastSuccessfulUpdateAt: ts,
          knownErrors: [],
          affectedMetrics: [],
          recommendedRemediation: [],
        },
      ],
      metricBindings: [],
      crossCuttingIssues: [],
      thresholds: {
        completeness: { goodMinPercent: 95, limitedMinPercent: 70 },
        freshness: { goodMaxAgeHours: 24, staleMaxAgeHours: 72 },
      },
      insightsStale: false,
      insightsLastRunAt: ts,
      invoiceDataComplete: true,
      fleetDataComplete: true,
      partialSections: [],
      unavailableSections: [],
    }),
    lineage: envelope({
      calculationVersion: 'lineage-v1',
      calculatedAt: ts,
      metrics: [],
      sections: [],
      audience: 'STANDARD',
    }),
    insights: envelope({ hasRun: true, lastRunAt: ts, stale: false, error: null }),
    metadata: {
      generationDurationMs: 42,
      sectionCount: 18,
      okSections: 18,
      partialSections: 0,
      errorSections: 0,
      unavailableSections: 0,
    },
  };
}

export function buildMockInsightAnalyticsSummary() {
  return {
    generatedAt: ts,
    hasRun: true,
    lastRunAt: ts,
    stale: false,
    error: null,
    counts: {
      totalVisible: 2,
      businessRisks: 1,
      revenueLeakage: 1,
      complianceRisks: 0,
      criticalInsights: 0,
      criticalBookings: 0,
      criticalBusinessRisks: 0,
      recommended: 0,
      bySeverity: { critical: 0, warning: 1, opportunity: 1, info: 0 },
      entities: {
        insightGroups: 2,
        events: 2,
        affectedVehicles: 1,
        affectedBookings: 0,
        affectedCustomers: 0,
        affectedStations: 0,
        uniqueEntities: 1,
        criticalBookings: 0,
        orgWideRisks: 1,
        bookingScopedRisks: 0,
      },
    },
    estimatedFinancialExposureMinor: 20_000,
    estimatedFinancialExposureCurrency: 'EUR',
    appliedFilters,
  };
}

const emptyInsightList = {
  data: [],
  meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
  appliedFilters,
};

export const mockOrgUsers = [
  {
    id: 'user-evaluations-e2e',
    email: 'evaluations@synqdrive.eu',
    firstName: 'Evaluations',
    lastName: 'E2E',
    role: 'ORG_ADMIN',
  },
  {
    id: 'user-fleet-manager',
    email: 'fleet@synqdrive.eu',
    firstName: 'Fleet',
    lastName: 'Manager',
    role: 'ORG_USER',
  },
];

export function buildMockRecommendations() {
  return [
    {
      id: 'rec-e2e-1',
      organizationId: TEST_ORG_ID,
      sourceType: 'DASHBOARD_INSIGHT',
      sourceId: 'insight-e2e-1',
      category: 'MAINTENANCE',
      title: 'Bremsen prüfen lassen',
      description: 'Erhöhter Verschleiß an Fahrzeug B-EV 1 erkannt.',
      rationale: 'Telemetrie zeigt beschleunigten Belagverschleiß über 14 Tage.',
      expectedBenefit: { amountMinor: 25_000, currency: 'EUR' },
      estimatedCost: { amountMinor: 8_000, currency: 'EUR' },
      expectedNetBenefit: { amountMinor: 17_000, currency: 'EUR' },
      confidence: 'HIGH',
      priority: 60,
      affectedEntities: [{ entityType: 'vehicle', entityId: 'veh-e2e-1', label: 'B-EV 1' }],
      ownerId: 'user-fleet-manager',
      dueAt: '2026-08-15T00:00:00.000Z',
      status: 'NEW',
      createdAt: ts,
      updatedAt: ts,
      calculationVersion: 'recommendation-v1',
    },
    {
      id: 'rec-e2e-2',
      organizationId: TEST_ORG_ID,
      sourceType: 'EVALUATIONS_RISK',
      sourceId: 'risk-e2e-1',
      category: 'COST_OPTIMIZATION',
      title: 'Leerstand Berlin reduzieren',
      description: 'Niedrige Auslastung an Station Berlin.',
      rationale: 'Utilization unter 45 % im Vergleichszeitraum.',
      expectedBenefit: { amountMinor: 40_000, currency: 'EUR' },
      estimatedCost: { amountMinor: 5_000, currency: 'EUR' },
      expectedNetBenefit: { amountMinor: 35_000, currency: 'EUR' },
      confidence: 'MEDIUM',
      priority: 35,
      affectedEntities: [{ entityType: 'station', entityId: 'st-berlin', label: 'Berlin' }],
      ownerId: null,
      dueAt: null,
      status: 'REVIEWED',
      createdAt: ts,
      updatedAt: ts,
      calculationVersion: 'recommendation-v1',
    },
  ];
}

export async function installEvaluationsMocks(page: Page) {
  const recommendationState = buildMockRecommendations();
  const recommendationEvents: Record<string, unknown[]> = {
    'rec-e2e-1': [
      {
        id: 'evt-e2e-1',
        recommendationId: 'rec-e2e-1',
        organizationId: TEST_ORG_ID,
        eventType: 'CREATED',
        actorUserId: null,
        previousStatus: null,
        newStatus: 'NEW',
        metadata: null,
        createdAt: ts,
      },
    ],
    'rec-e2e-2': [
      {
        id: 'evt-e2e-2',
        recommendationId: 'rec-e2e-2',
        organizationId: TEST_ORG_ID,
        eventType: 'STATUS_CHANGED',
        actorUserId: 'user-evaluations-e2e',
        previousStatus: 'NEW',
        newStatus: 'REVIEWED',
        metadata: null,
        createdAt: ts,
      },
    ],
  };

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/evaluations/analytics/summary`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildMockAnalyticsSummary()),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/evaluations/insights/summary`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildMockInsightAnalyticsSummary()),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/evaluations/insights`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptyInsightList),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'st-berlin', name: 'Berlin' }]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/vehicles`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'veh-e2e-1',
              license: 'B-EV 1',
              licensePlate: 'B-EV 1',
              make: 'BMW',
              model: '320d',
            },
          ],
          meta: { total: 1 },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/invoices`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/customers`) && method === 'GET' && !url.includes('/customers/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/dashboard-insights`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/rental-health/fleet`) && method === 'GET') {
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
        body: JSON.stringify({ items: [], unreadCount: 0 }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/users`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockOrgUsers),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/evaluations/recommendations`) && method === 'GET') {
      const integrationsMatch = url.match(/\/recommendations\/([^/]+)\/integrations/);
      if (integrationsMatch) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              action: 'CREATE_TASK',
              mode: 'execute',
              state: 'AVAILABLE',
            },
            {
              action: 'OPEN_SERVICE_CASE',
              mode: 'execute',
              state: 'AVAILABLE',
              entity: { entityType: 'vehicle', entityId: 'veh-e2e-1', label: 'B-EV 1' },
            },
            {
              action: 'OPEN_VEHICLE',
              mode: 'navigate',
              state: 'AVAILABLE',
              entity: { entityType: 'vehicle', entityId: 'veh-e2e-1', label: 'B-EV 1' },
            },
          ]),
        });
      }

      const recMatch = url.match(/\/recommendations\/([^/?]+)(?:\/events)?/);
      if (recMatch && url.includes('/events')) {
        const recId = recMatch[1];
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(recommendationEvents[recId] ?? []),
        });
      }
      if (recMatch && !url.includes('/events')) {
        const recId = recMatch[1];
        const row = recommendationState.find((r) => r.id === recId);
        if (!row) {
          return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(row),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(recommendationState),
      });
    }

    if (
      url.includes(`/organizations/${TEST_ORG_ID}/evaluations/recommendations/`) &&
      url.includes('/integrations') &&
      method === 'POST'
    ) {
      const recId = url.match(/\/recommendations\/([^/]+)\/integrations/)?.[1];
      const body = route.request().postDataJSON() as { action?: string };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          action: body.action,
          taskId: 'task-e2e-from-rec',
          duplicate: false,
        }),
      });
    }

    if (
      url.includes(`/organizations/${TEST_ORG_ID}/evaluations/recommendations/`) &&
      url.includes('/status') &&
      method === 'POST'
    ) {
      const recId = url.match(/\/recommendations\/([^/]+)\/status/)?.[1];
      const body = route.request().postDataJSON() as { status?: string; reason?: string };
      const idx = recommendationState.findIndex((r) => r.id === recId);
      if (idx < 0 || !body.status) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      }
      const previous = recommendationState[idx];
      const updated = {
        ...previous,
        status: body.status,
        updatedAt: new Date().toISOString(),
      };
      recommendationState[idx] = updated;
      recommendationEvents[recId!] = [
        ...(recommendationEvents[recId!] ?? []),
        {
          id: `evt-${Date.now()}`,
          recommendationId: recId,
          organizationId: TEST_ORG_ID,
          eventType: 'STATUS_CHANGED',
          actorUserId: 'user-evaluations-e2e',
          previousStatus: previous.status,
          newStatus: body.status,
          metadata: body.reason ? { rejectionReason: body.reason } : null,
          createdAt: new Date().toISOString(),
        },
      ];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
    }

    if (
      url.includes(`/organizations/${TEST_ORG_ID}/evaluations/recommendations/`) &&
      method === 'PATCH'
    ) {
      const recId = url.match(/\/recommendations\/([^/]+)/)?.[1];
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const idx = recommendationState.findIndex((r) => r.id === recId);
      if (idx < 0) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      }
      const updated = {
        ...recommendationState[idx],
        ...body,
        updatedAt: new Date().toISOString(),
      };
      recommendationState[idx] = updated;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
    }

    return route.continue();
  });
}

export async function navigateToEvaluationsView(page: Page) {
  const heading = page.getByRole('heading', { name: /^(Auswertungen|Insights)$/ });
  if (await heading.isVisible().catch(() => false)) return;

  const evaluationsLabel = /^(Auswertungen|Insights)$/;
  const viewport = page.viewportSize();

  if (viewport && viewport.width < 1024) {
    const menuButton = page.locator('div.lg\\:hidden.fixed.top-0.left-0.right-0 button').first();
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click();
    }
  } else {
    const financeHeader = page.getByRole('button', { name: /^(Finanzen|Finance)$/ });
    if (await financeHeader.isVisible().catch(() => false)) {
      const expanded = await financeHeader.getAttribute('aria-expanded');
      if (expanded === 'false') await financeHeader.click();
    }
  }

  await page.getByRole('button', { name: evaluationsLabel }).first().click({ timeout: 15000 });
  await heading.waitFor({ state: 'visible', timeout: 30000 });
}

export async function openEvaluationsPage(page: Page, options?: { theme?: 'light' | 'dark' }) {
  await page.addInitScript(
    ({ token, user, locale, theme }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
      if (theme) localStorage.setItem('synqdrive-theme-preference', theme);
    },
    {
      token: 'evaluations-e2e-token',
      user: mockUser,
      locale: 'de',
      theme: options?.theme,
    },
  );

  await installEvaluationsMocks(page);
  await page.goto('/rental', { waitUntil: 'load' });
  await navigateToEvaluationsView(page);
  await expect(page.getByTestId('evaluations-page')).toBeVisible();
}

export async function saveEvaluationsScreenshot(
  page: Page,
  name: string,
  testInfo: import('@playwright/test').TestInfo,
  options?: { copyToDocs?: string },
) {
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });

  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.join(process.cwd(), 'artifacts', 'evaluations');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${name}.png`), screenshot);

  if (options?.copyToDocs) {
    const docsDir = path.join(process.cwd(), '..', '..', 'docs', 'frontend', 'artifacts');
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, options.copyToDocs), screenshot);
  }
}
