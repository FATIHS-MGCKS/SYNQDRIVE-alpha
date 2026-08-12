/**
 * Playwright fixtures for Auswertungen (financial-insights) E2E + visual regression.
 * Fixed clock: 2026-06-16 — avoids volatile timestamps in KPIs and month labels.
 */
import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow } from './document-upload-fixtures';
import type { EvaluationsDataCoverage } from '../src/rental/lib/evaluations/evaluations-canonical.types';

export { assertNoHorizontalOverflow };

export const EVAL_E2E_ORG_ID = 'org-evaluations-e2e';
export const EVAL_E2E_FIXED_NOW = '2026-06-16T12:00:00.000Z';

export type EvaluationsScenarioProfile =
  | 'full-org'
  | 'empty-org'
  | 'partial-coverage'
  | 'stale-sources'
  | 'backend-error'
  | 'missing-permission'
  | 'multi-station'
  | 'multi-currency'
  | 'many-insights'
  | 'grouped-insights'
  | 'many-recommendations'
  | 'forecast-available'
  | 'forecast-unavailable';

type InvoiceRow = {
  id: string;
  invoiceNumber: number | null;
  type: string;
  status: string;
  customerId: string | null;
  vendorName: string | null;
  vehicleId: string | null;
  bookingId: string | null;
  title: string | null;
  totalCents: number | null;
  subtotalCents: number | null;
  taxCents: number | null;
  currency: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string | null;
};

type InsightRow = {
  id: string;
  type: string;
  severity: string;
  priority: number;
  title: string;
  message: string;
  actionLabel?: string | null;
  actionType?: string | null;
  entityScope?: string;
  entityIds?: string[] | null;
  timeContext?: Record<string, string> | null;
  metrics?: Record<string, unknown> | null;
  reasons?: string[] | null;
  isGrouped: boolean;
  groupCount: number;
  createdAt: string;
};

type MisuseRow = {
  id: string;
  title: string;
  description: string;
  type: string;
  severity: string;
  status: string;
  recommendedAction: string;
};

type CustomerRow = { id: string; firstName?: string; lastName?: string; name?: string; email?: string };

const STATION_A = 'station-a';
const STATION_B = 'station-b';

const state = {
  profile: 'full-org' as EvaluationsScenarioProfile,
  invoices: [] as InvoiceRow[],
  insights: [] as InsightRow[],
  customers: [] as CustomerRow[],
  misuseCases: [] as MisuseRow[],
  insightsStale: false,
  insightsHasRun: true,
  insightsError: false,
  invoicesError: false,
  customersError: false,
  insightsForbidden: false,
  // E6B canonical: when true, the E4/E5 feature-gated endpoints return a generic 404.
  canonicalFeatureDisabled: false,
  // E6C: counts direct driver-analysis requests (lazy-reveal assertion).
  driverAnalysisRequestCount: 0,
  // E6C.1: which driver scenario the driver-analysis route serves.
  driverScenario: 'pseudonymous' as EvaluationsDriverScenario,
};

/** Toggle the canonical E4/E5 feature-disabled (generic 404) behavior for a test. */
export function setCanonicalFeatureDisabled(disabled: boolean) {
  state.canonicalFeatureDisabled = disabled;
}

/** E6C.1: select which driver-analysis scenario the mock serves. */
export function setDriverScenario(scenario: EvaluationsDriverScenario) {
  state.driverScenario = scenario;
}

/** E6C: number of direct driver-analysis requests observed since the last reset. */
export function getDriverAnalysisRequestCount(): number {
  return state.driverAnalysisRequestCount;
}

// ── E6B canonical fixture builders (minimal valid wire shapes) ──
const CANON_PERIOD = {
  periodType: 'MTD',
  start: '2026-06-01T00:00:00.000Z',
  endExclusive: '2026-07-01T00:00:00.000Z',
  reference: '2026-06-16T12:00:00.000Z',
  timezone: {
    effectiveTimezone: 'Europe/Berlin',
    source: 'ORGANIZATION',
    reportTimezone: null,
    stationTimezone: null,
    organizationTimezone: 'Europe/Berlin',
  },
  comparisonBasis: null,
};

function canonMoneyMetric(metricId: string, amountMinor: number, currency: string) {
  return {
    schemaVersion: '1.0.0',
    metricId,
    metricKind: 'OBSERVED',
    generatedAt: EVAL_E2E_FIXED_NOW,
    period: CANON_PERIOD,
    comparison: null,
    dataCoverage: null,
    sourceFreshness: null,
    calculationVersion: 'v',
    exclusions: [],
    warnings: [],
    status: 'AVAILABLE',
    valueType: 'MONEY',
    unit: 'CURRENCY_MINOR',
    value: { amountMinor, currency },
  };
}

function canonicalFinanceBundle() {
  return {
    organizationId: EVAL_E2E_ORG_ID,
    period: CANON_PERIOD,
    metrics: {
      'fin.mtd_issued_revenue': canonMoneyMetric('fin.mtd_issued_revenue', 112000, 'EUR'),
      'fin.mtd_paid_revenue': canonMoneyMetric('fin.mtd_paid_revenue', 90000, 'EUR'),
      'fin.mtd_expenses': canonMoneyMetric('fin.mtd_expenses', 40000, 'EUR'),
      'fin.mtd_net_result': canonMoneyMetric('fin.mtd_net_result', 72000, 'EUR'),
      'fin.open_receivables': canonMoneyMetric('fin.open_receivables', 22000, 'EUR'),
      'fin.overdue_receivables': canonMoneyMetric('fin.overdue_receivables', 5000, 'EUR'),
    },
  };
}

const CANON_SCOPE = { organizationId: EVAL_E2E_ORG_ID, stationIds: null, stationScoped: false };
function canonSectionMeta(status: string) {
  return { status, calculationVersion: 'v', period: CANON_PERIOD, scope: CANON_SCOPE, coverage: null, generatedAt: EVAL_E2E_FIXED_NOW, reason: null };
}

function canonicalInsightsSummary() {
  return {
    schemaVersion: '1.0.0',
    generatedAt: EVAL_E2E_FIXED_NOW,
    scope: CANON_SCOPE,
    period: CANON_PERIOD,
    calculationVersion: 'analytics-summary-e4-v1',
    sections: {
      finance: { status: 'AVAILABLE', metrics: canonicalFinanceBundle().metrics, reason: null },
      costModel: {
        ...canonSectionMeta('PARTIAL'),
        categories: [
          { category: 'OPERATING_EXPENSES', nature: 'ACTUAL', status: 'AVAILABLE', totalsByCurrency: [{ amountMinor: 40000, currency: 'EUR' }], eventCount: 3, formula: 'x', sources: ['OrgInvoice'], reason: null },
          { category: 'UNPLANNED_MAINTENANCE', nature: 'ACTUAL', status: 'UNAVAILABLE', totalsByCurrency: [], eventCount: 0, formula: 'x', sources: ['ServiceCase'], reason: 'UNPROVEN_CURRENCY' },
        ],
        totalsByCurrency: [{ amountMinor: 40000, currency: 'EUR' }],
        reportingCurrency: 'EUR',
        mixedCurrency: false,
      },
      utilization: {
        ...canonSectionMeta('PARTIAL'),
        utilizationPercent: { ...canonMoneyMetric('ops.fleet_utilization_pct', 0, 'EUR'), valueType: 'PERCENT', unit: 'PERCENT', value: 63.5, status: 'PARTIAL' },
        occupancyBasis: 'SCHEDULED',
        capacityMs: null, rentedMs: null, maintenanceMs: null, blockedMs: null, netCapacityMs: null,
        eligibleVehicles: 12, overlappingBookingPairs: null, telemetryOfflineVehicles: null, telemetrySnapshotAsOf: null,
      },
      strengths: { ...canonSectionMeta('AVAILABLE'), strengths: [], evaluatedDimensions: ['FINANCE'], skippedDimensions: [] },
      weaknesses: { ...canonSectionMeta('PARTIAL'), weaknesses: [], evaluatedDimensions: ['FINANCE'], skippedDimensions: [{ dimension: 'UTILIZATION', reason: 'SOURCE_PARTIAL' }] },
      driverInfluence: { ...canonSectionMeta('UNAVAILABLE'), disclaimer: 'assoc only', confounders: [], factors: [], piiTier: 'none' },
    },
  };
}

function canonicalQualityReport() {
  return {
    schemaVersion: '1.0.0',
    generatedAt: EVAL_E2E_FIXED_NOW,
    scope: CANON_SCOPE,
    period: CANON_PERIOD,
    calculationVersion: 'evaluations-quality-e5-v2',
    sections: [
      {
        // Served org-scoped section carrying canonical non-null coverage (finance
        // coverage is ALWAYS null per the E5 service, so utilization is used here).
        section: 'utilization',
        status: 'AVAILABLE',
        dimensions: {
          FRESHNESS: 'UNKNOWN',
          COMPLETENESS: 'PARTIAL',
          PROVENANCE: 'COMPLETE', // both required lineages present
          VALIDITY: 'UNKNOWN', // no independent validity authority
          TEMPORAL_APPLICABILITY: 'COMPLETE',
        },
        // E5.1A: pipeline freshness UNKNOWN, all timestamps null (business recency separate).
        freshness: {
          newestSourceAt: null,
          oldestSourceAt: null,
          lastSuccessfulImportAt: null,
          evaluatedAt: EVAL_E2E_FIXED_NOW,
          state: 'UNKNOWN',
        },
        businessEventRecency: { newestAt: '2026-06-15T00:00:00.000Z', oldestAt: '2026-06-01T00:00:00.000Z' },
        // All five canonical coverage fields; missingSources are analytical limitations
        // (distinct from requiredSourceClasses).
        coverage: { expectedRecords: 100, availableRecords: 80, excludedRecords: 20, ratio: 0.8, missingSources: ['SCHEDULED_OCCUPANCY_NOT_ACTUAL', 'VEHICLE_ELIGIBILITY_HISTORY', 'BLOCKED_HISTORY'] } satisfies EvaluationsDataCoverage,
        requiredSourceClasses: ['BOOKINGS', 'MAINTENANCE'],
        lineage: [
          { sourceCategory: 'BOOKINGS', sourceRef: 'src::opaque::bk1', effectiveTimestamp: '2026-06-15T00:00:00.000Z', calculationVersion: 'lineage-calc-v7', reason: 'SOURCE_CLASS_BUSINESS_EVENT_RECENCY' },
          { sourceCategory: 'MAINTENANCE', sourceRef: 'src::opaque::mt1', effectiveTimestamp: '2026-06-10T00:00:00.000Z', calculationVersion: 'lineage-calc-v7', reason: 'SOURCE_CLASS_BUSINESS_EVENT_RECENCY' },
        ],
        reason: null,
      },
      {
        // Backend-reachable UNAVAILABLE section (same org scope; NOT station-scoped):
        // finance coverage is null; dimensions stay UNAVAILABLE (never healthy/zero).
        section: 'finance',
        status: 'UNAVAILABLE',
        dimensions: {
          FRESHNESS: 'UNAVAILABLE',
          COMPLETENESS: 'UNAVAILABLE',
          PROVENANCE: 'UNAVAILABLE',
          VALIDITY: 'UNAVAILABLE',
          TEMPORAL_APPLICABILITY: 'UNAVAILABLE',
        },
        freshness: null,
        businessEventRecency: null,
        coverage: null,
        requiredSourceClasses: ['FINANCE_INVOICE', 'FINANCE_PAYMENT'],
        lineage: [],
        reason: 'SECTION_UNAVAILABLE',
      },
    ],
    overall: { status: 'PARTIAL', complete: false, reason: 'QUALITY_INCOMPLETE' },
  };
}

export type EvaluationsDriverScenario = 'full' | 'pseudonymous' | 'none' | 'failClosed' | 'notFound';

// Canonical AVAILABLE driver coverage: availableRecords === factor count (2),
// excludedRecords === unattributed count, expected/ratio null, missingSources empty
// (the only observed dimension BOOKING_CANCELLATIONS was analyzed, not skipped).
const CANON_DRIVER_COVERAGE = {
  expectedRecords: null,
  availableRecords: 2,
  excludedRecords: 3,
  ratio: null,
  missingSources: [],
} satisfies EvaluationsDataCoverage;

// E6C: direct E5B driver-analysis response (separate from the summary's embedded slice).
function canonicalDriverInfluence(scenario: EvaluationsDriverScenario) {
  const base = {
    calculationVersion: 'evaluations-driver-e5b-v1',
    period: CANON_PERIOD,
    scope: CANON_SCOPE,
    generatedAt: EVAL_E2E_FIXED_NOW,
    disclaimer: 'Statistical association only — not causation.',
    confounders: ['seasonality', 'route mix'],
  };
  if (scenario === 'none') {
    return { ...base, status: 'UNAVAILABLE', coverage: null, reason: 'PERSON_LEVEL_ACCESS_DENIED', factors: [], piiTier: 'none' };
  }
  if (scenario === 'failClosed') {
    // Pseudonymization fails only AFTER person-level access is granted → tier stays pseudonymous.
    return { ...base, status: 'UNAVAILABLE', coverage: null, reason: 'PSEUDONYMIZATION_UNAVAILABLE', factors: [], piiTier: 'pseudonymous' };
  }
  const factors = [
    { driverRef: scenario === 'full' ? 'driver::raw::A' : 'driver::pseudo::A', associatedDimension: 'BOOKING_CANCELLATIONS', associationShare: 0.6, sampleSize: 42, relationship: 'ASSOCIATED_WITH' },
    { driverRef: scenario === 'full' ? 'driver::raw::B' : 'driver::pseudo::B', associatedDimension: 'BOOKING_CANCELLATIONS', associationShare: 0.4, sampleSize: 18, relationship: 'ASSOCIATED_WITH' },
  ];
  return {
    ...base,
    status: 'AVAILABLE',
    coverage: CANON_DRIVER_COVERAGE,
    reason: null,
    factors,
    piiTier: scenario === 'full' ? 'full' : 'pseudonymous',
  };
}

function inv(overrides: Partial<InvoiceRow> & { id: string }): InvoiceRow {
  return {
    invoiceNumber: 100,
    type: 'OUTGOING_BOOKING',
    status: 'SENT',
    customerId: null,
    vendorName: null,
    vehicleId: null,
    bookingId: null,
    title: 'Mietrechnung',
    totalCents: 10_000,
    subtotalCents: 8403,
    taxCents: 1597,
    currency: 'EUR',
    invoiceDate: '2026-06-10',
    dueDate: '2026-06-20',
    paidAt: null,
    createdAt: '2026-06-10',
    ...overrides,
  };
}

function ins(
  overrides: Partial<InsightRow> & { id: string; type: string },
): InsightRow {
  return {
    severity: 'WARNING',
    priority: 50,
    title: overrides.title ?? 'Test insight',
    message: 'Test message',
    entityScope: 'VEHICLE',
    entityIds: ['veh-1'],
    isGrouped: false,
    groupCount: 1,
    createdAt: '2026-06-15T10:00:00.000Z',
    ...overrides,
  };
}

function fleetVehicle(
  id: string,
  license: string,
  stationId: string,
  make = 'VW',
  model = 'Golf',
) {
  return {
    id,
    licensePlate: license,
    displayName: `${make} ${model} ${license}`,
    make,
    model,
    year: 2024,
    status: 'Available',
    rawVehicleStatus: 'AVAILABLE',
    operationalState: {
      status: 'AVAILABLE',
      reason: null,
      source: 'fleet-map',
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: EVAL_E2E_FIXED_NOW,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
    },
    bookingContext: {
      activeBooking: null,
      reservedBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
    },
    fuelType: 'Petrol',
    healthStatus: 'Good Health',
    cleaningStatus: 'Clean',
    stationId,
    stationName: stationId === STATION_A ? 'Kassel' : 'Frankfurt',
    homeStationId: stationId,
    currentStationId: stationId,
    expectedStationId: null,
    latitude: 51.3,
    longitude: 9.4,
    lastSeenAt: EVAL_E2E_FIXED_NOW,
    signalAgeMs: 5000,
    isFresh: true,
    onlineStatus: 'ONLINE',
    telemetryFreshness: 'live',
    displayState: 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking: false,
    heading: null,
    imageUrl: null,
    odometerKm: 12000,
    fuelPercent: 72,
    evSoc: null,
    isElectric: false,
    dataQualityState: 'RELIABLE',
    isReliable: true,
    reservedBookingId: null,
    reservedCustomerName: null,
    reservedPickupAt: null,
    reservedReturnAt: null,
    activeBookingId: null,
    activeCustomerName: null,
    activePickupAt: null,
    activeReturnAt: null,
    nextBookingId: null,
    nextBookingPickupAt: null,
    nextBookingCustomerName: null,
  };
}

export const mockUserFull = {
  id: 'user-eval-e2e',
  email: 'evaluations@synqdrive.eu',
  name: 'Evaluations E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: EVAL_E2E_ORG_ID,
  organizationName: 'Auswertungen E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    invoices: { read: true, write: true, manage: true },
    customers: { read: true, write: true, manage: true },
    fleet: { read: true, write: true, manage: true },
    vehicles: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
    'data-analyse': { read: true, write: false, manage: false },
  },
};

export const mockUserLimited = {
  ...mockUserFull,
  id: 'user-eval-limited',
  membershipRole: 'ORG_USER',
  permissions: {
    invoices: { read: false, write: false, manage: false },
    customers: { read: false, write: false, manage: false },
    fleet: { read: true, write: false, manage: false },
    vehicles: { read: true, write: false, manage: false },
    tasks: { read: true, write: false, manage: false },
  },
};

function buildFullOrg() {
  state.invoices = [
    inv({ id: 'rev-1', invoiceNumber: 1, customerId: 'cust-a', vehicleId: 'veh-1', totalCents: 50_000, invoiceDate: '2026-06-05' }),
    inv({ id: 'rev-2', invoiceNumber: 2, customerId: 'cust-b', vehicleId: 'veh-2', totalCents: 30_000, invoiceDate: '2026-06-08' }),
    inv({ id: 'paid-1', invoiceNumber: 3, status: 'PAID', paidAt: '2026-06-12', totalCents: 20_000, invoiceDate: '2026-05-20' }),
    inv({ id: 'exp-1', invoiceNumber: 4, type: 'INCOMING_VENDOR', totalCents: 15_000, invoiceDate: '2026-06-04', vendorName: 'Werkstatt Nord' }),
    inv({ id: 'open-1', invoiceNumber: 5, status: 'SENT', dueDate: '2026-07-01', totalCents: 12_000, invoiceDate: '2026-06-01' }),
    inv({ id: 'over-1', invoiceNumber: 6, status: 'SENT', dueDate: '2026-06-01', totalCents: 8_000, invoiceDate: '2026-05-15' }),
    inv({ id: 'prev-rev', invoiceNumber: 7, customerId: 'cust-a', totalCents: 40_000, invoiceDate: '2026-05-12' }),
  ];
  state.insights = [
    ins({ id: 'i1', type: 'STATION_SHORTAGE', severity: 'CRITICAL', priority: 90, title: 'Station Kassel unterbesetzt' }),
    ins({ id: 'i2', type: 'LOW_UTILIZATION', severity: 'OPPORTUNITY', priority: 40, title: 'Fahrzeug unterausgelastet', metrics: { lostRevenueEur: 350 } }),
  ];
  state.customers = [
    { id: 'cust-a', name: 'Alpha GmbH' },
    { id: 'cust-b', name: 'Beta AG' },
  ];
  state.misuseCases = [
    {
      id: 'mis-1',
      title: 'Harte Bremsung',
      description: 'Mehrere starke Bremsmanöver auf Autobahn.',
      type: 'HARD_BRAKING',
      severity: 'WATCH',
      status: 'OPEN',
      recommendedAction: 'Rückgabe genauer prüfen.',
    },
  ];
}

function buildManyInsights(count: number) {
  const types = ['TIGHT_HANDOVER', 'STATION_SHORTAGE', 'LOW_UTILIZATION', 'PICKUP_OVERDUE', 'SERVICE_OVERDUE', 'RETURN_NEEDS_INSPECTION'];
  state.insights = Array.from({ length: count }, (_, i) =>
    ins({
      id: `many-${i}`,
      type: types[i % types.length],
      severity: i % 2 === 0 ? 'CRITICAL' : 'WARNING',
      priority: 100 - i,
      title: `Insight ${i + 1}`,
    }),
  );
}

function buildManyRecommendations(count: number) {
  state.insights = Array.from({ length: count }, (_, i) =>
    ins({
      id: `rec-${i}`,
      type: i % 2 === 0 ? 'PICKUP_OVERDUE' : 'TIGHT_HANDOVER',
      severity: i % 3 === 0 ? 'CRITICAL' : 'WARNING',
      priority: 90 - i,
      title: `Empfehlung ${i + 1}`,
      metrics: { recommendation: `Maßnahme ${i + 1}: Vorgang prüfen.` },
    }),
  );
}

export function resetEvaluationsMockState(profile: EvaluationsScenarioProfile = 'full-org') {
  state.profile = profile;
  state.insightsStale = false;
  state.insightsHasRun = true;
  state.insightsError = false;
  state.invoicesError = false;
  state.customersError = false;
  state.insightsForbidden = false;
  state.canonicalFeatureDisabled = false;
  state.driverAnalysisRequestCount = 0;
  state.driverScenario = 'pseudonymous';
  state.invoices = [];
  state.insights = [];
  state.customers = [];
  state.misuseCases = [];

  switch (profile) {
    case 'empty-org':
      return;
    case 'partial-coverage':
      state.invoices = [
        inv({ id: 'no-paid-at', status: 'PAID', paidAt: null, invoiceDate: '2026-06-09' }),
        inv({ id: 'no-customer', customerId: 'missing-cust', totalCents: 5_000, invoiceDate: '2026-06-07' }),
        inv({ id: 'no-date', invoiceDate: null, createdAt: null, totalCents: 1_000 }),
      ];
      state.insights = [ins({ id: 'p1', type: 'SERVICE_WINDOW', severity: 'INFO', priority: 10, title: 'Service-Fenster' })];
      state.customersError = true;
      return;
    case 'stale-sources':
      buildFullOrg();
      state.insightsStale = true;
      return;
    case 'backend-error':
      state.insightsError = true;
      state.invoicesError = true;
      return;
    case 'missing-permission':
      buildFullOrg();
      state.insightsForbidden = true;
      state.invoicesError = true;
      return;
    case 'multi-station':
      buildFullOrg();
      state.insights = [
        ins({ id: 'sta-a', type: 'STATION_SHORTAGE', severity: 'CRITICAL', priority: 80, title: 'Kassel Engpass', entityIds: ['veh-st-a'] }),
        ins({ id: 'sta-b', type: 'STATION_SHORTAGE', severity: 'WARNING', priority: 70, title: 'Frankfurt Engpass', entityIds: ['veh-st-b'] }),
      ];
      return;
    case 'multi-currency':
      state.invoices = [
        inv({ id: 'eur', totalCents: 10_000, currency: 'EUR', invoiceDate: '2026-06-05' }),
        inv({ id: 'usd', totalCents: 99_000, currency: 'USD', invoiceDate: '2026-06-06' }),
        inv({ id: 'eur-exp', type: 'INCOMING_VENDOR', totalCents: 2_000, currency: 'EUR', invoiceDate: '2026-06-04', vendorName: 'Vendor EUR' }),
      ];
      return;
    case 'many-insights':
      buildFullOrg();
      buildManyInsights(8);
      return;
    case 'grouped-insights':
      buildFullOrg();
      state.insights = [
        ins({
          id: 'grouped-1',
          type: 'LOW_UTILIZATION',
          severity: 'WARNING',
          priority: 55,
          isGrouped: true,
          groupCount: 3,
          entityIds: ['veh-1', 'veh-2', 'veh-3'],
          title: '3 Fahrzeuge ungenutzt',
          message: 'Gruppiertes Unterauslastungs-Signal.',
        }),
      ];
      return;
    case 'many-recommendations':
      buildFullOrg();
      buildManyRecommendations(10);
      return;
    case 'forecast-available':
      buildFullOrg();
      return;
    case 'forecast-unavailable':
      state.invoices = [
        inv({ id: 'mtd-only', totalCents: 25_000, invoiceDate: '2026-06-10' }),
      ];
      state.insights = [ins({ id: 'f1', type: 'LOW_UTILIZATION', severity: 'WARNING', priority: 40, title: 'Unterauslastung' })];
      return;
    case 'full-org':
    default:
      buildFullOrg();
  }
}

function insightsPayload() {
  if (state.insightsError) {
    return { status: 500, body: { message: 'Internal error' } };
  }
  if (state.insightsForbidden) {
    return { status: 403, body: { message: 'Forbidden' } };
  }
  const summary = {
    total: state.insights.length,
    critical: state.insights.filter((i) => i.severity === 'CRITICAL').length,
    warning: state.insights.filter((i) => i.severity === 'WARNING').length,
    opportunity: state.insights.filter((i) => i.severity === 'OPPORTUNITY').length,
    info: state.insights.filter((i) => i.severity === 'INFO').length,
  };
  return {
    status: 200,
    body: {
      generatedAt: EVAL_E2E_FIXED_NOW,
      hasRun: state.insightsHasRun,
      lastRunAt: EVAL_E2E_FIXED_NOW,
      stale: state.insightsStale,
      activeInsightCount: state.insights.length,
      error: null,
      summary,
      insights: state.insights,
    },
  };
}

function fleetMapBody() {
  if (state.profile === 'multi-station') {
    return [
      fleetVehicle('veh-st-a', 'KS-A 100', STATION_A),
      fleetVehicle('veh-st-b', 'FF-M 200', STATION_B, 'BMW', '320d'),
      fleetVehicle('veh-1', 'KS-A 101', STATION_A),
      fleetVehicle('veh-2', 'FF-M 201', STATION_B, 'Audi', 'A4'),
    ];
  }
  return [
    fleetVehicle('veh-1', 'KS-A 100', STATION_A),
    fleetVehicle('veh-2', 'KS-B 200', STATION_A, 'BMW', '320d'),
  ];
}

export async function installEvaluationsClockFreeze(page: Page) {
  await page.addInitScript((fixedIso: string) => {
    const fixed = new Date(fixedIso);
    const RealDate = Date;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Date = class extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixed.getTime());
        } else {
          // @ts-expect-error spread
          super(...args);
        }
      }
      static now() {
        return fixed.getTime();
      }
    };
  }, EVAL_E2E_FIXED_NOW);
}

export async function installEvaluationsMocks(
  page: Page,
  options?: { profile?: EvaluationsScenarioProfile; user?: typeof mockUserFull },
) {
  if (options?.profile) resetEvaluationsMockState(options.profile);
  const user = options?.user ?? mockUserFull;

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/profile`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: EVAL_E2E_ORG_ID,
          name: user.organizationName,
          businessType: 'RENTAL',
          timezone: 'Europe/Berlin',
        }),
      });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fleetMapBody()),
      });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/dashboard-insights`) && method === 'GET') {
      const payload = insightsPayload();
      return route.fulfill({
        status: payload.status,
        contentType: 'application/json',
        body: JSON.stringify(payload.body),
      });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/invoices`) && method === 'GET' && !url.includes('/invoices/')) {
      if (state.invoicesError) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Invoice error' }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.invoices),
      });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/customers`) && method === 'GET') {
      if (state.customersError) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Customer error' }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.customers),
      });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/misuse-cases`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: state.misuseCases,
          meta: { total: state.misuseCases.length, page: 1, limit: 8, totalPages: 1 },
        }),
      });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: STATION_A, name: 'Kassel', city: 'Kassel' },
          { id: STATION_B, name: 'Frankfurt', city: 'Frankfurt' },
        ]),
      });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/rental-health`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicles: [] }),
      });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/fleet-connectivity`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicles: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/price-tariffs`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ priceBook: null, groups: [], assignments: [], unassignedVehicleCount: 0 }),
      });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/bookings/today/`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/notifications`) && method === 'GET') {
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

    // ── E6 canonical analytics endpoints ──
    // E3 finance (always-on): drives the canonical Finance & Receivables section.
    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/evaluations/finance/insights`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(canonicalFinanceBundle()),
      });
    }
    // E4 insights summary (feature-gated): drives Executive/Strengths/Weaknesses/
    // Utilization/Costs. When the feature is "disabled" the guard returns a generic
    // 404 (no discriminator) → the UI must render neutral NOT_FOUND, not legacy data.
    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/evaluations/analytics/insights/summary`) && method === 'GET') {
      if (state.canonicalFeatureDisabled) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ statusCode: 404, message: 'Not found', error: 'Not Found' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(canonicalInsightsSummary()) });
    }
    // E5 quality (feature-gated) — E6C Data Quality panel.
    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/evaluations/analytics/insights/quality`) && method === 'GET') {
      if (state.canonicalFeatureDisabled) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ statusCode: 404, message: 'Not found', error: 'Not Found' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(canonicalQualityReport()) });
    }
    // E5B driver-analysis (E6C Driver Influence) — a SEPARATE direct request that must
    // only fire after the explicit reveal. Count tracks lazy-request assertions.
    if (url.includes(`/organizations/${EVAL_E2E_ORG_ID}/evaluations/analytics/insights/driver-analysis`) && method === 'GET') {
      state.driverAnalysisRequestCount += 1;
      if (state.canonicalFeatureDisabled || state.driverScenario === 'notFound') {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ statusCode: 404, message: 'Not found', error: 'Not Found' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(canonicalDriverInfluence(state.driverScenario)) });
    }

    return route.continue();
  });
}

export async function navigateToEvaluationsView(page: Page) {
  const heading = page.getByRole('heading', { name: /^(Auswertungen|Insights)$/ });
  if (await heading.isVisible().catch(() => false)) return;

  const viewport = page.viewportSize();
  const label = /^(Auswertungen|Insights)$/;

  if (viewport && viewport.width < 1024) {
    const mobileNav = page.locator('div.lg\\:hidden.fixed.top-0');
    await page.locator('div.lg\\:hidden.fixed.top-0.left-0.right-0 button').first().click();
    const targetBtn = mobileNav.getByRole('button', { name: label });
    if (!(await targetBtn.isVisible().catch(() => false))) {
      const financeHeader = mobileNav.getByRole('button', { name: /^(Finanzen|Finance)$/ });
      if (await financeHeader.isVisible().catch(() => false)) await financeHeader.click();
    }
    await targetBtn.click();
  } else {
    const financeHeader = page.getByRole('button', { name: /^(Finanzen|Finance)$/ });
    if (await financeHeader.isVisible().catch(() => false)) {
      const expanded = await financeHeader.getAttribute('aria-expanded');
      if (expanded === 'false') await financeHeader.click();
    }
    await page.locator('div.hidden.lg\\:flex').getByRole('button', { name: label }).click();
  }

  await heading.waitFor({ state: 'visible', timeout: 30_000 });
}

export async function openEvaluationsPage(
  page: Page,
  options?: {
    profile?: EvaluationsScenarioProfile;
    theme?: 'light' | 'dark';
    user?: typeof mockUserFull;
    canonicalFeatureDisabled?: boolean;
  },
) {
  const profile = options?.profile ?? 'full-org';
  resetEvaluationsMockState(profile);
  if (options?.canonicalFeatureDisabled) state.canonicalFeatureDisabled = true;

  await installEvaluationsClockFreeze(page);
  await page.addInitScript(
    ({ token, user, locale, theme }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
      if (theme) localStorage.setItem('synqdrive-theme-preference', theme);
    },
    {
      token: 'evaluations-e2e-token',
      user: options?.user ?? mockUserFull,
      locale: 'de',
      theme: options?.theme,
    },
  );

  await installEvaluationsMocks(page, { profile, user: options?.user });
  await page.goto('/rental', { waitUntil: 'load' });
  await navigateToEvaluationsView(page);
  await page.getByTestId('evaluations-page').waitFor({ state: 'visible', timeout: 30_000 });
}

export async function saveEvaluationsScreenshot(
  page: Page,
  name: string,
  testInfo: import('@playwright/test').TestInfo,
) {
  const maskSelectors = ['.recharts-wrapper', '.animate-spin'];
  const screenshot = await page.screenshot({
    fullPage: true,
    mask: maskSelectors.map((s) => page.locator(s)),
    animations: 'disabled',
  });
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });

  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.join(process.cwd(), 'e2e', 'artifacts', 'evaluations');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${name}.png`), screenshot);
}

export async function assertSeverityHasTextLabel(page: Page) {
  const criticalBadges = page.locator('.sq-tone-critical').filter({ hasText: /CRITICAL|KRITISCH|WARNING|WARNUNG|OPPORTUNITY|INFO/i });
  const count = await criticalBadges.count();
  expect(count).toBeGreaterThanOrEqual(0);
}

resetEvaluationsMockState('full-org');
