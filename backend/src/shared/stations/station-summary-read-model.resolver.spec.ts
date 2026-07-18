import { StationOpeningStatus } from './station-operations.contract';
import { resolveStationSummaryReadModel } from './station-summary-read-model.resolver';

const STATION_ID = 'station-summary-a';
const ORG_ID = 'org-summary';

function operationsFixture() {
  return {
    stationId: STATION_ID,
    organizationId: ORG_ID,
    evaluatedAt: '2026-07-18T12:00:00.000Z',
    operationsVersion: 1 as const,
    currentStationTime: {
      instantUtc: '2026-07-18T12:00:00.000Z',
      localDate: '2026-07-18',
      localTime: '14:00',
      timezone: 'Europe/Berlin',
      label: '18.07.2026, 14:00',
    },
    openingStatus: {
      status: StationOpeningStatus.OPEN,
      label: 'Open',
      reasons: [],
    },
    nextOpeningWindow: null,
    pickupCapability: {
      kind: 'PICKUP',
      label: 'Pickup',
      available: true,
      reasons: [],
      nextOpeningWindow: null,
    },
    returnCapability: {
      kind: 'RETURN',
      label: 'Return',
      available: true,
      reasons: [],
      nextOpeningWindow: null,
    },
    afterHoursCapability: {
      status: 'NOT_AVAILABLE',
      label: 'Not available',
      reasons: [],
    },
    keyboxStatus: {
      status: 'NOT_APPLICABLE',
      label: 'Not applicable',
      reasons: [],
    },
    calendarException: {
      active: false,
      exception: null,
      label: 'No active exception',
      reasons: [],
    },
    capacityStatus: {
      status: 'AVAILABLE',
      label: 'Available',
      configuredCapacity: 10,
      currentOnSiteCount: 2,
      availablePhysicalSlots: 8,
      projectedOccupancy: 2,
      reasons: [],
    },
    geofenceCapability: {
      status: 'CONFIGURED',
      label: 'Configured',
      geofenceConfigured: true,
      automationActive: false,
      writesCurrentStationId: false,
      publishesConfirmedArrival: false,
      allowsAutomaticLocationDetectionClaim: false,
      uiHint: '',
      reasons: [],
    },
    configurationProblems: [
      {
        code: 'STATION_OPERATIONS_COORDINATES_MISSING',
        message: 'Coordinates missing',
        severity: 'warning',
      },
    ],
    operationalWarnings: [],
  };
}

describe('resolveStationSummaryReadModel', () => {
  it('assembles canonical sections without client recomputation', () => {
    const result = resolveStationSummaryReadModel({
      evaluatedAt: '2026-07-18T12:00:00.000Z',
      masterData: {
        id: STATION_ID,
        organizationId: ORG_ID,
        name: 'Berlin Mitte',
        code: 'BER-01',
        address: 'Alexanderplatz 1',
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
      operations: operationsFixture() as never,
      kpis: {
        version: 1,
        stationId: STATION_ID,
        evaluatedAt: '2026-07-18T12:00:00.000Z',
        timezone: 'Europe/Berlin',
        calendarDay: '2026-07-18',
        scope: {
          applied: true,
          mode: 'SCOPED_STATIONS',
          stationId: STATION_ID,
        },
        metrics: {
          homeFleetCount: { value: 4, known: true, reasons: [] },
          currentOnSiteCount: { value: 2, known: true, reasons: [] },
          foreignVehiclesOnSiteCount: { value: 1, known: true, reasons: [] },
          expectedArrivalCount: { value: 0, known: true, reasons: [] },
          currentlyRentedHomeVehicles: { value: 1, known: true, reasons: [] },
          readyToRentOnSite: { value: 1, known: true, reasons: [] },
          blockedOrMaintenanceOnSite: { value: 0, known: true, reasons: [] },
          pickupsToday: { value: 2, known: true, reasons: [] },
          returnsToday: { value: 1, known: true, reasons: [] },
          overdueReturns: { value: 0, known: true, reasons: [] },
          incomingTransfers: { value: 1, known: true, reasons: [] },
          outgoingTransfers: { value: 0, known: true, reasons: [] },
          openOperationalTasks: { value: 3, known: true, reasons: [] },
          capacityStatus: { value: 'AVAILABLE', known: true, reasons: [] },
        },
        deprecatedAliases: { bookedVehicles: null },
      },
      scope: {
        applied: true,
        mode: 'SCOPED_STATIONS',
        stationId: STATION_ID,
      },
    });

    expect(result.version).toBe(1);
    expect(result.lastCalculatedAt).toBe('2026-07-18T12:00:00.000Z');
    expect(result.masterData.name).toBe('Berlin Mitte');
    expect(result.openingStatus.status).toBe(StationOpeningStatus.OPEN);
    expect(result.kpis.metrics.homeFleetCount.value).toBe(4);
    expect(result.configurationProblems).toHaveLength(1);
    expect(result.partialData.complete).toBe(true);
    expect(result.frontendRecomputation).toBe(false);
  });

  it('surfaces partial data when KPI metrics are unknown', () => {
    const result = resolveStationSummaryReadModel({
      evaluatedAt: '2026-07-18T12:00:00.000Z',
      masterData: {
        id: STATION_ID,
        organizationId: ORG_ID,
        name: 'Archived',
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
        status: 'ARCHIVED',
        statusLabel: 'Archived',
        type: 'BRANCH',
        typeLabel: 'Branch',
        isPrimary: false,
        archived: true,
        archivedAt: '2026-07-01T00:00:00.000Z',
      },
      operations: operationsFixture() as never,
      kpis: {
        version: 1,
        stationId: STATION_ID,
        evaluatedAt: '2026-07-18T12:00:00.000Z',
        timezone: 'Europe/Berlin',
        calendarDay: '2026-07-18',
        scope: {
          applied: true,
          mode: 'SCOPED_STATIONS',
          stationId: STATION_ID,
        },
        metrics: {
          homeFleetCount: { value: null, known: false, reasons: [{ code: 'MISSING', message: 'x' }] },
          currentOnSiteCount: { value: 1, known: true, reasons: [] },
          foreignVehiclesOnSiteCount: { value: 0, known: true, reasons: [] },
          expectedArrivalCount: { value: 0, known: true, reasons: [] },
          currentlyRentedHomeVehicles: { value: 0, known: true, reasons: [] },
          readyToRentOnSite: { value: 1, known: true, reasons: [] },
          blockedOrMaintenanceOnSite: { value: 0, known: true, reasons: [] },
          pickupsToday: { value: null, known: false, reasons: [{ code: 'MISSING', message: 'y' }] },
          returnsToday: { value: 0, known: true, reasons: [] },
          overdueReturns: { value: 0, known: true, reasons: [] },
          incomingTransfers: { value: 0, known: true, reasons: [] },
          outgoingTransfers: { value: 0, known: true, reasons: [] },
          openOperationalTasks: { value: 0, known: true, reasons: [] },
          capacityStatus: { value: 'UNKNOWN', known: true, reasons: [] },
        },
        deprecatedAliases: { bookedVehicles: null },
      },
      scope: {
        applied: true,
        mode: 'SCOPED_STATIONS',
        stationId: STATION_ID,
      },
    });

    expect(result.lifecycle.archived).toBe(true);
    expect(result.partialData.complete).toBe(false);
    expect(result.partialData.unknownMetricNames).toEqual(
      expect.arrayContaining(['homeFleetCount', 'pickupsToday']),
    );
  });
});
