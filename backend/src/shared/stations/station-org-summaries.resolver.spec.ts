import { StationOpeningStatus } from './station-operations.contract';
import { StationOperationalCapabilityKind } from './station-operational-capability.contract';
import {
  aggregateStationOrgGlobalKpis,
  aggregateStationOrgPartialData,
  aggregateStationOrgWarningCounts,
  applyStationOrgSummaryPostFilters,
  normalizeStationOrgSummariesPageSize,
  paginateStationSummaries,
  resolveStationOrgSummariesReadModel,
} from './station-org-summaries.resolver';
import {
  STATION_ORG_SUMMARIES_MAX_PAGE_SIZE,
  StationOrgSummariesLimitCode,
} from './station-org-summaries.contract';
import type { StationSummaryReadModel } from './station-summary-read-model.contract';

const ORG_ID = 'org-org-summaries';
const STATION_A = 'station-a';
const STATION_B = 'station-b';

function summaryFixture(
  stationId: string,
  overrides: {
    pickupAvailable?: boolean;
    returnAvailable?: boolean;
    configurationProblems?: number;
    operationalWarnings?: number;
    partial?: boolean;
    homeFleetCount?: number;
  } = {},
): StationSummaryReadModel {
  return {
    version: 2,
    stationId,
    organizationId: ORG_ID,
    lastCalculatedAt: '2026-07-18T12:00:00.000Z',
    masterData: {
      id: stationId,
      organizationId: ORG_ID,
      name: stationId,
      code: null,
      address: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: null,
      phone: null,
      email: null,
      managerName: null,
      timezone: 'Europe/Berlin',
      capacity: 10,
    },
    lifecycle: {
      status: 'ACTIVE',
      statusLabel: 'Active',
      type: 'BRANCH',
      typeLabel: 'Branch',
      isPrimary: false,
      archived: false,
      archivedAt: null,
    },
    openingStatus: {
      status: StationOpeningStatus.OPEN,
      label: 'Open',
      reasons: [],
    },
    operationalCapabilities: {
      pickup: {
        kind: StationOperationalCapabilityKind.PICKUP_AVAILABLE,
        label: 'Pickup',
        available: overrides.pickupAvailable ?? true,
        reasons: [],
        nextOpeningWindow: null,
      },
      return: {
        kind: StationOperationalCapabilityKind.RETURN_AVAILABLE,
        label: 'Return',
        available: overrides.returnAvailable ?? true,
        reasons: [],
        nextOpeningWindow: null,
      },
      afterHours: { status: 'NOT_AVAILABLE', label: 'Not available', reasons: [] },
      keybox: { status: 'NOT_APPLICABLE', label: 'Not applicable', reasons: [] },
    },
    kpis: {
      version: 2,
      stationId,
      evaluatedAt: '2026-07-18T12:00:00.000Z',
      timezone: 'Europe/Berlin',
      calendarDay: '2026-07-18',
      scope: { applied: false, mode: 'ALL_STATIONS', stationId },
      metrics: {
        homeFleetCount: {
          value: overrides.homeFleetCount ?? 2,
          known: true,
          reasons: [],
        },
        currentOnSiteCount: { value: 1, known: true, reasons: [] },
        foreignVehiclesOnSiteCount: { value: 0, known: true, reasons: [] },
        expectedArrivalCount: { value: 0, known: true, reasons: [] },
        currentlyRentedHomeVehicles: { value: 0, known: true, reasons: [] },
        readyToRentOnSite: { value: 1, known: true, reasons: [] },
        notReadyOnSite: { value: 0, known: true, reasons: [] },
        blockedOrMaintenanceOnSite: { value: 0, known: true, reasons: [] },
        criticalOnSite: { value: 0, known: true, reasons: [] },
        warningOnSite: { value: 0, known: true, reasons: [] },
        telemetryOfflineOnSite: { value: 0, known: true, reasons: [] },
        complianceBlockerOnSite: { value: 0, known: true, reasons: [] },
        vehiclesWithHealthWarningsOnSite: { value: 0, known: true, reasons: [] },
        pickupsToday: { value: 1, known: true, reasons: [] },
        returnsToday: { value: 0, known: true, reasons: [] },
        overdueReturns: { value: 0, known: true, reasons: [] },
        incomingTransfers: { value: 0, known: true, reasons: [] },
        outgoingTransfers: { value: 0, known: true, reasons: [] },
        openOperationalTasks: { value: 1, known: true, reasons: [] },
        capacityStatus: { value: 'AVAILABLE', known: true, reasons: [] },
      },
      deprecatedAliases: { bookedVehicles: null },
    },
    operationsSummary: {
      version: 1,
      stationId,
      evaluatedAt: '2026-07-18T12:00:00.000Z',
      tasks: {
        total: 1,
        categories: {
          stationLinked: { count: 0 },
          vehicleOnSite: { count: 1 },
          bookingPickupReturn: { count: 0 },
          overduePickupReturn: { count: 0 },
          transfer: { count: 0 },
        },
      },
      notifications: {
        total: 0,
        categories: {
          stationLinked: { count: 0 },
          vehicleOnSite: { count: 0 },
          bookingPickupReturn: { count: 0 },
          transfer: { count: 0 },
        },
      },
      operationalProblems: {
        configurationProblems: overrides.configurationProblems ?? 0,
        operationalWarnings: overrides.operationalWarnings ?? 0,
        total:
          (overrides.configurationProblems ?? 0) + (overrides.operationalWarnings ?? 0),
      },
    },
    configurationProblems: Array.from({ length: overrides.configurationProblems ?? 0 }).map(
      (_, index) => ({
        code: `PROBLEM_${index}`,
        message: 'problem',
        severity: 'warning' as const,
      }),
    ),
    operationalWarnings: Array.from({ length: overrides.operationalWarnings ?? 0 }).map(
      (_, index) => ({
        code: `WARN_${index}`,
        message: 'warn',
        severity: 'warning' as const,
      }),
    ),
    partialData: {
      complete: !overrides.partial,
      unknownMetricNames: overrides.partial ? ['pickupsToday'] : [],
      reasons: overrides.partial ? [{ code: 'MISSING', message: 'partial' }] : [],
    },
    scope: { applied: false, mode: 'ALL_STATIONS', stationId },
    frontendRecomputation: false,
  };
}

describe('station-org-summaries.resolver', () => {
  it('aggregates global KPIs from the same summary basis', () => {
    const summaries = [
      summaryFixture(STATION_A, { homeFleetCount: 3 }),
      summaryFixture(STATION_B, { homeFleetCount: 5 }),
    ];

    const globalKpis = aggregateStationOrgGlobalKpis(summaries);

    expect(globalKpis.stationCount).toBe(2);
    expect(globalKpis.homeFleetCount).toBe(8);
    expect(globalKpis.pickupsToday).toBe(2);
    expect(globalKpis.capacityStatusCounts.AVAILABLE).toBe(2);
  });

  it('aggregates warning and partial-data counts', () => {
    const summaries = [
      summaryFixture(STATION_A, { configurationProblems: 2, operationalWarnings: 1 }),
      summaryFixture(STATION_B, { partial: true }),
    ];

    expect(aggregateStationOrgWarningCounts(summaries)).toEqual({
      configurationProblems: 2,
      operationalWarnings: 1,
      total: 3,
      stationsWithConfigurationProblems: 1,
      stationsWithOperationalWarnings: 1,
    });

    expect(aggregateStationOrgPartialData(summaries)).toEqual(
      expect.objectContaining({
        complete: false,
        stationsWithPartialData: 1,
        unknownMetricNames: ['pickupsToday'],
      }),
    );
  });

  it('applies capability and configuration post-filters', () => {
    const summaries = [
      summaryFixture(STATION_A, { pickupAvailable: true, configurationProblems: 1 }),
      summaryFixture(STATION_B, { pickupAvailable: false, configurationProblems: 0 }),
    ];

    const filtered = applyStationOrgSummaryPostFilters(summaries, {
      pickupCapabilityAvailable: true,
      returnCapabilityAvailable: null,
      hasConfigurationProblems: true,
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.stationId).toBe(STATION_A);
  });

  it('caps page size transparently', () => {
    expect(normalizeStationOrgSummariesPageSize(250)).toEqual({
      pageSize: STATION_ORG_SUMMARIES_MAX_PAGE_SIZE,
      pageSizeCapped: true,
    });
  });

  it('paginates station summaries', () => {
    const summaries = [
      summaryFixture('s-1'),
      summaryFixture('s-2'),
      summaryFixture('s-3'),
    ];
    const page = paginateStationSummaries(summaries, 2, 2);

    expect(page.items).toHaveLength(1);
    expect(page.pagination).toEqual({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      hasMore: false,
    });
  });

  it('builds the org summaries read model envelope', () => {
    const result = resolveStationOrgSummariesReadModel({
      organizationId: ORG_ID,
      evaluatedAt: '2026-07-18T12:00:00.000Z',
      scope: { applied: false, mode: 'ALL_STATIONS' },
      filters: {
        status: null,
        type: null,
        isPrimary: null,
        search: null,
        pickupCapabilityAvailable: null,
        returnCapabilityAvailable: null,
        hasConfigurationProblems: null,
      },
      summaries: [summaryFixture(STATION_A), summaryFixture(STATION_B)],
      page: 1,
      pageSize: 20,
      matchedStationCount: 10,
      processedStationCount: 2,
      aggregationStationCapApplied: true,
      pageSizeCapped: false,
    });

    expect(result.stationSummaries).toHaveLength(2);
    expect(result.globalKpis.stationCount).toBe(2);
    expect(result.limits.matchedStationCount).toBe(10);
    expect(result.limits.processedStationCount).toBe(2);
    expect(result.limits.codes).toContain(StationOrgSummariesLimitCode.AGGREGATION_STATION_CAP);
    expect(result.frontendRecomputation).toBe(false);
  });
});
