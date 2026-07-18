import { describe, expect, it } from 'vitest';
import { getStationWarningsFromSummary } from './stationUtils';
import type { StationSummaryReadModel } from '../../lib/api';

function operationsSummaryFixture(
  stationId = 's1',
): StationSummaryReadModel['operationsSummary'] {
  return {
    version: 1,
    stationId,
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
  };
}

function summary(overrides: Partial<StationSummaryReadModel> = {}): StationSummaryReadModel {
  return {
    version: 2,
    stationId: 's1',
    organizationId: 'org',
    lastCalculatedAt: '2026-07-18T12:00:00.000Z',
    masterData: {
      id: 's1',
      organizationId: 'org',
      name: 'Station',
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
      capacity: null,
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
      stationId: 's1',
      evaluatedAt: '2026-07-18T12:00:00.000Z',
      timezone: 'Europe/Berlin',
      calendarDay: '2026-07-18',
      scope: { applied: false, mode: 'ALL_STATIONS', stationId: 's1' },
      metrics: {
        homeFleetCount: { value: 0, known: true, reasons: [] },
        currentOnSiteCount: { value: 0, known: true, reasons: [] },
        foreignVehiclesOnSiteCount: { value: 0, known: true, reasons: [] },
        expectedArrivalCount: { value: 0, known: true, reasons: [] },
        currentlyRentedHomeVehicles: { value: 0, known: true, reasons: [] },
        readyToRentOnSite: { value: 0, known: true, reasons: [] },
        blockedOrMaintenanceOnSite: { value: 0, known: true, reasons: [] },
        pickupsToday: { value: 0, known: true, reasons: [] },
        returnsToday: { value: 0, known: true, reasons: [] },
        overdueReturns: { value: 0, known: true, reasons: [] },
        incomingTransfers: { value: 0, known: true, reasons: [] },
        outgoingTransfers: { value: 0, known: true, reasons: [] },
        openOperationalTasks: { value: 0, known: true, reasons: [] },
        capacityStatus: { value: 'UNKNOWN', known: true, reasons: [] },
      },
      deprecatedAliases: { bookedVehicles: null },
    },
    operationsSummary: operationsSummaryFixture(),
    configurationProblems: [],
    operationalWarnings: [],
    partialData: { complete: true, unknownMetricNames: [], reasons: [] },
    scope: { applied: false, mode: 'ALL_STATIONS', stationId: 's1' },
    frontendRecomputation: false,
    ...overrides,
  };
}

describe('getStationWarningsFromSummary', () => {
  it('maps configuration problems to warning keys', () => {
    const warnings = getStationWarningsFromSummary(
      summary({
        configurationProblems: [
          { code: 'STATION_OPERATIONS_COORDINATES_MISSING', message: 'x', severity: 'warning' },
          { code: 'STATION_OPERATIONS_OPENING_HOURS_MISSING', message: 'y', severity: 'warning' },
          { code: 'STATION_OPERATIONS_GEOFENCE_NOT_CONFIGURED', message: 'z', severity: 'warning' },
        ],
      }),
    );

    expect(warnings).toEqual(
      expect.arrayContaining(['missingCoordinates', 'missingOpeningHours', 'missingGeofence']),
    );
  });
});
