import { describe, expect, it } from 'vitest';
import type { StationSummaryReadModel } from '../../lib/api';
import {
  buildStationOverviewDecisionModel,
  formatStationLocalWindow,
  resolveNextOpeningWindow,
} from './station-overview-decision.utils';

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
    operationsSummary: {
      version: 1,
      stationId: 'station-a',
      evaluatedAt: '2026-07-18T12:00:00.000Z',
      tasks: {
        total: 0,
        categories: {
          stationLinked: { count: 0 },
          vehicleOnSite: { count: 0 },
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
        configurationProblems: 0,
        operationalWarnings: 0,
        total: 0,
      },
    },
    configurationProblems: [],
    operationalWarnings: [],
    partialData: { complete: true, unknownMetricNames: [], reasons: [] },
    scope: { applied: false, mode: 'ALL_STATIONS', stationId: 'station-a' },
    frontendRecomputation: false,
    ...overrides,
  };
}

describe('station-overview-decision.utils', () => {
  it('builds a healthy decision model from summary read model', () => {
    const model = buildStationOverviewDecisionModel(summaryFixture());
    expect(model).not.toBeNull();
    expect(model?.onSite).toEqual({ display: '2', known: true, numeric: 2 });
    expect(model?.readyForRent).toEqual({ display: '1', known: true, numeric: 1 });
    expect(model?.pickupsToday.numeric).toBe(2);
    expect(model?.openingStatus).toBe('OPEN');
    expect(model?.capacityStatus).toBe('AVAILABLE');
    expect(model?.operationsQuiet).toBe(false);
    expect(model?.hasOpenOperationalProblems).toBe(false);
  });

  it('returns null when summary is missing', () => {
    expect(buildStationOverviewDecisionModel(null)).toBeNull();
    expect(buildStationOverviewDecisionModel(undefined)).toBeNull();
  });

  it('shows em dash for unknown KPI metrics instead of zero', () => {
    const summary = summaryFixture();
    summary.kpis.metrics.overdueReturns = { value: null, known: false, reasons: [] };
    summary.kpis.metrics.pickupsToday = { value: null, known: false, reasons: [] };

    const model = buildStationOverviewDecisionModel(summary);
    expect(model?.overdueReturns).toEqual({ display: '—', known: false, numeric: null });
    expect(model?.pickupsToday).toEqual({ display: '—', known: false, numeric: null });
    expect(model?.partialDataIncomplete).toBe(false);
  });

  it('marks partial data when summary is incomplete', () => {
    const model = buildStationOverviewDecisionModel(
      summaryFixture({
        partialData: {
          complete: false,
          unknownMetricNames: ['pickupsToday'],
          reasons: [{ code: 'PARTIAL', message: 'Partial KPI load' }],
        },
      }),
    );
    expect(model?.partialDataIncomplete).toBe(true);
  });

  it('resolves the earliest next opening window across pickup and return', () => {
    const summary = summaryFixture({
      openingStatus: { status: 'CLOSED', label: 'Closed', reasons: [] },
      operationalCapabilities: {
        pickup: {
          kind: 'PICKUP_UNAVAILABLE',
          label: 'Pickup',
          available: false,
          reasons: [],
          nextOpeningWindow: {
            opensAt: '2026-07-18T14:00:00.000Z',
            closesAt: '2026-07-18T18:00:00.000Z',
          },
        },
        return: {
          kind: 'RETURN_UNAVAILABLE',
          label: 'Return',
          available: false,
          reasons: [],
          nextOpeningWindow: {
            opensAt: '2026-07-18T08:00:00.000Z',
            closesAt: '2026-07-18T12:00:00.000Z',
          },
        },
        afterHours: { status: 'NOT_AVAILABLE', label: 'Not available', reasons: [] },
        keybox: { status: 'NOT_APPLICABLE', label: 'N/A', reasons: [] },
      },
    });

    const next = resolveNextOpeningWindow(summary);
    expect(next?.opensAt).toBe('2026-07-18T08:00:00.000Z');

    const model = buildStationOverviewDecisionModel(summary, { locale: 'en-GB' });
    expect(model?.nextOpeningWindowLabel).toBeTruthy();
    expect(model?.openingStatus).toBe('CLOSED');
  });

  it('formats local opening windows in station timezone', () => {
    const label = formatStationLocalWindow(
      {
        opensAt: '2026-07-18T06:00:00.000Z',
        closesAt: '2026-07-18T14:00:00.000Z',
      },
      'Europe/Berlin',
      'de-DE',
    );
    expect(label).toMatch(/–/);
    expect(label.length).toBeGreaterThan(5);
  });

  it('separates configuration problems from operational warnings', () => {
    const model = buildStationOverviewDecisionModel(
      summaryFixture({
        configurationProblems: [
          { code: 'STATION_MISSING_OPENING_HOURS', message: 'Opening hours missing', severity: 'error' },
        ],
        operationalWarnings: [
          { code: 'STATION_OVERDUE_RETURNS', message: '2 overdue returns', severity: 'warning' },
        ],
      }),
    );

    expect(model?.configurationProblems).toHaveLength(1);
    expect(model?.operationalWarnings).toHaveLength(1);
    expect(model?.hasOpenOperationalProblems).toBe(true);
    expect(model?.vehicleSignals).toHaveLength(0);
  });

  it('derives vehicle signals only when no operational warnings are present', () => {
    const withSignals = buildStationOverviewDecisionModel(
      summaryFixture({
        kpis: {
          ...summaryFixture().kpis,
          metrics: {
            ...summaryFixture().kpis.metrics,
            blockedOrMaintenanceOnSite: { value: 2, known: true, reasons: [] },
            criticalOnSite: { value: 1, known: true, reasons: [] },
          },
        },
      }),
    );
    expect(withSignals?.vehicleSignals).toHaveLength(2);
    expect(withSignals?.vehicleSignals[0]?.count).toBe(2);

    const suppressed = buildStationOverviewDecisionModel(
      summaryFixture({
        operationalWarnings: [
          { code: 'STATION_FLEET_ATTENTION', message: 'Fleet needs attention', severity: 'warning' },
        ],
        kpis: {
          ...summaryFixture().kpis,
          metrics: {
            ...summaryFixture().kpis.metrics,
            blockedOrMaintenanceOnSite: { value: 2, known: true, reasons: [] },
          },
        },
      }),
    );
    expect(suppressed?.vehicleSignals).toHaveLength(0);
    expect(suppressed?.operationalWarnings).toHaveLength(1);
  });

  it('detects a quiet operations day when all today metrics are zero or unknown', () => {
    const quiet = buildStationOverviewDecisionModel(
      summaryFixture({
        kpis: {
          ...summaryFixture().kpis,
          metrics: {
            ...summaryFixture().kpis.metrics,
            pickupsToday: { value: 0, known: true, reasons: [] },
            returnsToday: { value: 0, known: true, reasons: [] },
            overdueReturns: { value: 0, known: true, reasons: [] },
            incomingTransfers: { value: 0, known: true, reasons: [] },
          },
        },
      }),
    );
    expect(quiet?.operationsQuiet).toBe(true);

    const busy = buildStationOverviewDecisionModel(
      summaryFixture({
        kpis: {
          ...summaryFixture().kpis,
          metrics: {
            ...summaryFixture().kpis.metrics,
            pickupsToday: { value: 0, known: true, reasons: [] },
            returnsToday: { value: 0, known: true, reasons: [] },
            overdueReturns: { value: 0, known: true, reasons: [] },
            incomingTransfers: { value: 1, known: true, reasons: [] },
          },
        },
      }),
    );
    expect(busy?.operationsQuiet).toBe(false);
  });

  it('still builds a model for archived stations', () => {
    const model = buildStationOverviewDecisionModel(
      summaryFixture({
        lifecycle: {
          ...summaryFixture().lifecycle,
          status: 'ARCHIVED',
          archived: true,
          archivedAt: '2026-07-01T00:00:00.000Z',
        },
      }),
    );
    expect(model?.onSite.known).toBe(true);
    expect(model?.partialDataIncomplete).toBe(false);
  });
});
