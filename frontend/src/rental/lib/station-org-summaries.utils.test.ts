import { describe, expect, it, vi } from 'vitest';
import {
  applyClientStationSummaryFilters,
  buildStationSummariesQueryParams,
  fetchAllStationOrgSummaries,
  getStationCardDisplayMetrics,
  mapSummaryToStation,
  summaryHasPickupEnabled,
} from './station-org-summaries.utils';
import { selectStationOrgKpis } from '../hooks/useStationOrgSummaries';
import type { StationOrgSummariesReadModel, StationSummaryReadModel } from '../../lib/api';

function operationsSummaryFixture(
  stationId = 'station-a',
): StationSummaryReadModel['operationsSummary'] {
  return {
    version: 1,
    stationId,
    evaluatedAt: '2026-07-18T12:00:00.000Z',
    tasks: {
      total: 3,
      categories: {
        stationLinked: { count: 0 },
        vehicleOnSite: { count: 2 },
        bookingPickupReturn: { count: 1 },
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
      configurationProblems: 0,
      operationalWarnings: 0,
      total: 0,
    },
  };
}

function summaryFixture(overrides: Partial<StationSummaryReadModel> = {}): StationSummaryReadModel {
  return {
    version: 2,
    stationId: 'station-a',
    organizationId: 'org-a',
    lastCalculatedAt: '2026-07-18T12:00:00.000Z',
    masterData: {
      id: 'station-a',
      organizationId: 'org-a',
      name: 'Berlin',
      code: 'BER',
      address: 'Street 1',
      addressLine2: null,
      city: 'Berlin',
      postalCode: '10178',
      country: 'DE',
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
    openingStatus: { status: 'OPEN', label: 'Open', reasons: [] },
    operationalCapabilities: {
      pickup: { kind: 'PICKUP_AVAILABLE', label: 'Pickup', available: true, reasons: [], nextOpeningWindow: null },
      return: { kind: 'RETURN_AVAILABLE', label: 'Return', available: true, reasons: [], nextOpeningWindow: null },
      afterHours: { status: 'NOT_AVAILABLE', label: 'Not available', reasons: [] },
      keybox: { status: 'NOT_APPLICABLE', label: 'N/A', reasons: [] },
    },
    kpis: {
      version: 1,
      stationId: 'station-a',
      evaluatedAt: '2026-07-18T12:00:00.000Z',
      timezone: 'Europe/Berlin',
      calendarDay: '2026-07-18',
      scope: { applied: false, mode: 'ALL_STATIONS', stationId: 'station-a' },
      metrics: {
        homeFleetCount: { value: 4, known: true, reasons: [] },
        currentOnSiteCount: { value: 2, known: true, reasons: [] },
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
        pickupsToday: { value: 2, known: true, reasons: [] },
        returnsToday: { value: 1, known: true, reasons: [] },
        overdueReturns: { value: 0, known: true, reasons: [] },
        incomingTransfers: { value: 0, known: true, reasons: [] },
        outgoingTransfers: { value: 0, known: true, reasons: [] },
        openOperationalTasks: { value: 3, known: true, reasons: [] },
        capacityStatus: { value: 'AVAILABLE', known: true, reasons: [] },
      },
      deprecatedAliases: { bookedVehicles: null },
    },
    operationsSummary: operationsSummaryFixture(),
    configurationProblems: [],
    operationalWarnings: [],
    partialData: { complete: true, unknownMetricNames: [], reasons: [] },
    scope: { applied: false, mode: 'ALL_STATIONS', stationId: 'station-a' },
    frontendRecomputation: false,
    ...overrides,
  };
}

describe('station-org-summaries.utils', () => {
  it('builds server query params from view filters', () => {
    expect(
      buildStationSummariesQueryParams(
        {
          status: 'ACTIVE',
          type: 'BRANCH',
          city: '',
          pickupOnly: false,
          returnOnly: false,
          problemsOnly: true,
          primaryOnly: true,
        },
        ' Berlin ',
      ),
    ).toEqual({
      pageSize: 100,
      status: 'ACTIVE',
      type: 'BRANCH',
      isPrimary: true,
      search: 'Berlin',
      hasConfigurationProblems: true,
    });
  });

  it('maps summary metrics without frontend recomputation', () => {
    const metrics = getStationCardDisplayMetrics(summaryFixture());
    expect(metrics.homeFleet).toBe(4);
    expect(metrics.onSite).toBe(2);
    expect(metrics.todayPickups).toBe(2);
    expect(metrics.todayReturns).toBe(1);
    expect(metrics.openingStatus).toBe('OPEN');
    expect(metrics.capacityStatus).toBe('AVAILABLE');
    expect(metrics.operationalWarningCount).toBe(0);
    expect(metrics.partialDataIncomplete).toBe(false);
  });

  it('returns em dash for unknown KPI metrics', () => {
    const summary = summaryFixture();
    summary.kpis.metrics.pickupsToday = { value: null, known: false, reasons: [] };
    expect(getStationCardDisplayMetrics(summary).todayPickups).toBe('—');
  });

  it('applies client-only city and pickup filters', () => {
    const berlin = summaryFixture();
    const munich = summaryFixture({
      stationId: 'station-b',
      masterData: { ...summaryFixture().masterData, id: 'station-b', city: 'Munich' },
      configurationProblems: [
        { code: 'STATION_OPERATIONS_PICKUP_DISABLED', message: 'Pickup disabled', severity: 'warning' },
      ],
    });

    const filtered = applyClientStationSummaryFilters([berlin, munich], {
      status: '',
      type: '',
      city: 'Berlin',
      pickupOnly: true,
      returnOnly: false,
      problemsOnly: false,
      primaryOnly: false,
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.stationId).toBe('station-a');
    expect(summaryHasPickupEnabled(berlin)).toBe(true);
    expect(summaryHasPickupEnabled(munich)).toBe(false);
  });

  it('fetches all summary pages', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        stationSummaries: [summaryFixture()],
        pagination: { page: 1, pageSize: 100, total: 2, totalPages: 2, hasMore: true },
      } as Partial<StationOrgSummariesReadModel>)
      .mockResolvedValueOnce({
        stationSummaries: [summaryFixture({ stationId: 'station-b' })],
        pagination: { page: 2, pageSize: 100, total: 2, totalPages: 2, hasMore: false },
      } as Partial<StationOrgSummariesReadModel>);

    const result = await fetchAllStationOrgSummaries('org-a', {}, fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result.stationSummaries).toHaveLength(2);
  });

  it('maps summary to station list row shape', () => {
    const station = mapSummaryToStation(summaryFixture());
    expect(station.id).toBe('station-a');
    expect(station.name).toBe('Berlin');
    expect(station.vehicleCount).toBe(4);
    expect(station.pickupEnabled).toBe(true);
  });

  it('uses server global KPIs without frontend recomputation', () => {
    const kpis = selectStationOrgKpis({
      globalKpis: {
        stationCount: 1,
        homeFleetCount: 4,
        currentOnSiteCount: 2,
        foreignVehiclesOnSiteCount: 0,
        expectedArrivalCount: 0,
        currentlyRentedHomeVehicles: 0,
        readyToRentOnSite: 1,
        blockedOrMaintenanceOnSite: 0,
        pickupsToday: 2,
        returnsToday: 1,
        overdueReturns: 0,
        incomingTransfers: 0,
        outgoingTransfers: 0,
        openOperationalTasks: 3,
        capacityStatusCounts: {
          UNKNOWN: 0,
          AVAILABLE: 1,
          NEAR_CAPACITY: 0,
          FULL: 0,
          OVER_CAPACITY: 0,
          PROJECTED_OVER_CAPACITY: 0,
        },
        partialMetricCount: 0,
      },
      warningCounts: {
        configurationProblems: 0,
        operationalWarnings: 0,
        total: 0,
        stationsWithConfigurationProblems: 1,
        stationsWithOperationalWarnings: 0,
      },
    } as never);

    expect(kpis.homeFleet).toBe(4);
    expect(kpis.onSite).toBe(2);
    expect(kpis.todayPickups).toBe(2);
    expect(kpis.operationalWarnings).toBe(0);
    expect(kpis.configurationProblems).toBe(1);
  });
});
