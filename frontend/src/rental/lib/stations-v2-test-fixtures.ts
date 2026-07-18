/**
 * Shared Stations V2 fixtures for Vitest and Playwright route mocks.
 */
import type {
  Station,
  StationActivityEntry,
  StationFleetReadModel,
  StationFleetVehicleRow,
  StationOperationsDto,
  StationOperationsTimelineEntry,
  StationOperationsTimelineReadModel,
  StationOrgSummariesReadModel,
  StationSummaryReadModel,
  StationTeamDto,
  StationVehicleWorkflowPreviewResult,
  StationVehicleWorkflowVehicleRow,
} from '../../lib/api';

export const STATIONS_V2_TEST_ORG_ID = 'org-stations-v2-e2e';

export const ST_KASSEL = 'st-v2-kassel';
export const ST_BERLIN = 'st-v2-berlin';
export const ST_ARCHIVED = 'st-v2-archived';

export const VEH_KASSEL_1 = 'veh-v2-kas-1';
export const VEH_KASSEL_2 = 'veh-v2-kas-2';

const NOW = '2026-07-18T12:00:00.000Z';

function metric<T>(value: T, known = true) {
  return { value, known, reasons: [] as Array<{ code: string; message: string }> };
}

function operationsSummary(stationId: string): StationSummaryReadModel['operationsSummary'] {
  return {
    version: 1,
    stationId,
    evaluatedAt: NOW,
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

export function stationSummaryFixture(
  overrides: Partial<StationSummaryReadModel> = {},
): StationSummaryReadModel {
  const stationId = overrides.stationId ?? ST_KASSEL;
  const name =
    overrides.masterData?.name ??
    (stationId === ST_BERLIN ? 'Berlin Mitte' : stationId === ST_ARCHIVED ? 'Hannover Alt' : 'Kassel Hauptbahnhof');

  return {
    version: 2,
    stationId,
    organizationId: STATIONS_V2_TEST_ORG_ID,
    lastCalculatedAt: NOW,
    masterData: {
      id: stationId,
      organizationId: STATIONS_V2_TEST_ORG_ID,
      name,
      code: stationId === ST_KASSEL ? 'KAS' : stationId === ST_BERLIN ? 'BER' : 'HAN',
      address: 'Hauptstrasse 1',
      addressLine2: null,
      city: stationId === ST_BERLIN ? 'Berlin' : stationId === ST_ARCHIVED ? 'Hannover' : 'Kassel',
      postalCode: stationId === ST_BERLIN ? '10178' : '34117',
      country: 'DE',
      phone: '+49 561 12345',
      email: 'kassel@synqdrive.eu',
      managerName: 'Max Mustermann',
      timezone: 'Europe/Berlin',
      capacity: 25,
      ...(overrides.masterData ?? {}),
    },
    lifecycle: {
      status: stationId === ST_ARCHIVED ? 'ARCHIVED' : 'ACTIVE',
      statusLabel: stationId === ST_ARCHIVED ? 'Archived' : 'Active',
      type: stationId === ST_KASSEL ? 'MAIN' : 'BRANCH',
      typeLabel: stationId === ST_KASSEL ? 'Main' : 'Branch',
      isPrimary: stationId === ST_KASSEL,
      archived: stationId === ST_ARCHIVED,
      archivedAt: stationId === ST_ARCHIVED ? NOW : null,
      ...(overrides.lifecycle ?? {}),
    },
    openingStatus: { status: 'OPEN', label: 'Geoeffnet', reasons: [] },
    operationalCapabilities: {
      pickup: {
        kind: 'PICKUP_AVAILABLE',
        label: 'Pickup',
        available: true,
        reasons: [],
        nextOpeningWindow: null,
      },
      return: {
        kind: 'RETURN_AVAILABLE',
        label: 'Return',
        available: true,
        reasons: [],
        nextOpeningWindow: null,
      },
      afterHours: { status: 'NOT_AVAILABLE', label: 'Nicht verfuegbar', reasons: [] },
      keybox: { status: 'NOT_APPLICABLE', label: 'N/A', reasons: [] },
    },
    kpis: {
      version: 1,
      stationId,
      evaluatedAt: NOW,
      timezone: 'Europe/Berlin',
      calendarDay: '2026-07-18',
      scope: { applied: false, mode: 'ALL_STATIONS', stationId },
      metrics: {
        homeFleetCount: metric(12),
        currentOnSiteCount: metric(8),
        foreignVehiclesOnSiteCount: metric(1),
        expectedArrivalCount: metric(2),
        currentlyRentedHomeVehicles: metric(3),
        readyToRentOnSite: metric(5),
        notReadyOnSite: metric(1),
        blockedOrMaintenanceOnSite: metric(0),
        criticalOnSite: metric(0),
        warningOnSite: metric(1),
        telemetryOfflineOnSite: metric(0),
        complianceBlockerOnSite: metric(0),
        vehiclesWithHealthWarningsOnSite: metric(1),
        pickupsToday: metric(4),
        returnsToday: metric(3),
        overdueReturns: metric(0),
        incomingTransfers: metric(1),
        outgoingTransfers: metric(1),
        openOperationalTasks: metric(3),
        capacityStatus: metric('AVAILABLE'),
      },
      deprecatedAliases: { bookedVehicles: null },
    },
    operationsSummary: operationsSummary(stationId),
    configurationProblems: [],
    operationalWarnings: [],
    partialData: { complete: true, unknownMetricNames: [], reasons: [] },
    scope: { applied: false, mode: 'ALL_STATIONS', stationId },
    frontendRecomputation: false,
    ...overrides,
  };
}

export function stationDtoFromSummary(summary: StationSummaryReadModel): Station {
  const md = summary.masterData;
  return {
    id: summary.stationId,
    name: md.name,
    code: md.code,
    status: summary.lifecycle.status,
    statusLabel: summary.lifecycle.statusLabel,
    type: summary.lifecycle.type,
    typeLabel: summary.lifecycle.typeLabel,
    isPrimary: summary.lifecycle.isPrimary,
    address: md.address,
    addressLine1: md.address,
    addressLine2: md.addressLine2,
    city: md.city,
    postalCode: md.postalCode,
    country: md.country,
    latitude: 51.3127,
    longitude: 9.4797,
    coordinatesSource: 'MAPBOX_RETRIEVE',
    coordinatesConfirmedAt: NOW,
    hasMissingCoordinates: false,
    geofenceCapability: {
      capabilityVersion: 1,
      status: 'CONFIGURED_ONLY',
      geofenceConfigured: true,
      automationActive: false,
      writesCurrentStationId: false,
      publishesConfirmedArrival: false,
      allowsAutomaticLocationDetectionClaim: false,
      reasons: [],
      uiHint: '',
    },
    timezone: md.timezone,
    radiusMeters: 100,
    geofenceRadiusMeters: 100,
    phone: md.phone,
    email: md.email,
    managerName: md.managerName,
    contactPerson: md.managerName,
    pickupEnabled: true,
    returnEnabled: true,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    capacity: md.capacity,
    openingHours: null,
    openingHoursContractVersion: 1,
    holidayRules: null,
    handoverInstructions: null,
    returnInstructions: null,
    notes: null,
    internalNotes: null,
    googlePlaceId: null,
    archivedAt: summary.lifecycle.archivedAt,
    vehicleCount: summary.kpis.metrics.homeFleetCount.value ?? 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

export function stationOrgSummariesFixture(
  overrides: Partial<StationOrgSummariesReadModel> = {},
): StationOrgSummariesReadModel {
  const kassel = stationSummaryFixture({ stationId: ST_KASSEL });
  const berlin = stationSummaryFixture({ stationId: ST_BERLIN });
  const summaries = overrides.stationSummaries ?? [kassel, berlin];

  return {
    version: 2,
    organizationId: STATIONS_V2_TEST_ORG_ID,
    evaluatedAt: NOW,
    lastCalculatedAt: NOW,
    scope: { applied: false, mode: 'ALL_STATIONS' },
    limits: {
      defaultPageSize: 100,
      maxPageSize: 200,
      maxAggregationStations: 500,
      appliedPageSize: 100,
      aggregationStationCapApplied: false,
      matchedStationCount: summaries.length,
      processedStationCount: summaries.length,
      codes: [],
    },
    filters: {
      status: null,
      type: null,
      isPrimary: null,
      search: null,
      pickupCapabilityAvailable: null,
      returnCapabilityAvailable: null,
      hasConfigurationProblems: null,
    },
    pagination: {
      page: 1,
      pageSize: 100,
      total: summaries.length,
      totalPages: 1,
      hasMore: false,
    },
    stationSummaries: summaries,
    globalKpis: {
      stationCount: summaries.length,
      homeFleetCount: 16,
      currentOnSiteCount: 10,
      foreignVehiclesOnSiteCount: 1,
      expectedArrivalCount: 2,
      currentlyRentedHomeVehicles: 4,
      readyToRentOnSite: 6,
      notReadyOnSite: 1,
      blockedOrMaintenanceOnSite: 0,
      criticalOnSite: 0,
      warningOnSite: 1,
      telemetryOfflineOnSite: 0,
      complianceBlockerOnSite: 0,
      vehiclesWithHealthWarningsOnSite: 1,
      pickupsToday: 6,
      returnsToday: 4,
      overdueReturns: 0,
      incomingTransfers: 1,
      outgoingTransfers: 1,
      openOperationalTasks: 5,
      capacityStatusCounts: {
        UNKNOWN: 0,
        AVAILABLE: summaries.length,
        NEAR_CAPACITY: 0,
        FULL: 0,
        OVER_CAPACITY: 0,
        PROJECTED_OVER_CAPACITY: 0,
      },
      partialMetricCount: 0,
    },
    partialData: {
      complete: true,
      stationsWithPartialData: 0,
      unknownMetricNames: [],
      reasons: [],
    },
    warningCounts: {
      configurationProblems: 0,
      operationalWarnings: 0,
      total: 0,
      stationsWithConfigurationProblems: 0,
      stationsWithOperationalWarnings: 0,
    },
    frontendRecomputation: false,
    ...overrides,
  };
}

export function stationFleetVehicleRow(
  overrides: Partial<StationFleetVehicleRow> = {},
): StationFleetVehicleRow {
  return {
    id: overrides.id ?? VEH_KASSEL_1,
    licensePlate: overrides.licensePlate ?? 'KS-ST 101',
    make: 'VW',
    model: 'Golf',
    vehicleName: null,
    runtimeState: 'AVAILABLE',
    runtimeStateLabel: 'Verfuegbar',
    homeStation: { id: ST_KASSEL, name: 'Kassel Hauptbahnhof', code: 'KAS' },
    currentStation: { id: ST_KASSEL, name: 'Kassel Hauptbahnhof', code: 'KAS' },
    expectedStation: null,
    positionSource: 'MANUAL',
    lastConfirmationAt: NOW,
    nextAction: { code: 'REVIEW_READY', label: 'Bereitschaft pruefen', deepLink: null },
    group: 'on_site',
    ...overrides,
  };
}

export function stationFleetReadModelFixture(
  overrides: Partial<StationFleetReadModel> = {},
): StationFleetReadModel {
  const onSite = [
    stationFleetVehicleRow(),
    stationFleetVehicleRow({
      id: VEH_KASSEL_2,
      licensePlate: 'KS-ST 202',
      runtimeState: 'RENTED',
      runtimeStateLabel: 'Vermietet',
      group: 'currently_rented',
    }),
  ];

  return {
    version: 1,
    stationId: ST_KASSEL,
    organizationId: STATIONS_V2_TEST_ORG_ID,
    evaluatedAt: NOW,
    search: null,
    groupFilter: null,
    groups: [
      { key: 'on_site', total: 1, vehicles: [onSite[0]], pagination: { page: 1, pageSize: 25, totalPages: 1 } },
      { key: 'currently_rented', total: 1, vehicles: [onSite[1]], pagination: { page: 1, pageSize: 25, totalPages: 1 } },
    ],
    scope: { applied: false, mode: 'ALL_STATIONS' },
    frontendRecomputation: false,
    ...overrides,
  };
}

export function stationTimelineEntryFixture(
  overrides: Partial<StationOperationsTimelineEntry> = {},
): StationOperationsTimelineEntry {
  return {
    id: 'tl-pickup-1',
    type: 'PICKUP',
    status: 'SCHEDULED',
    instantUtc: '2026-07-18T14:00:00.000Z',
    stationLocalTime: '16:00',
    stationLocalDate: '2026-07-18',
    references: {
      bookingId: 'bk-v2-1',
      vehicleId: VEH_KASSEL_1,
      transferId: null,
      taskId: null,
      bookingLabel: 'BK-V2-1',
      vehicleLabel: 'KS-ST 101',
    },
    actionRequired: false,
    ruleWarning: false,
    ruleWarningCodes: [],
    deepLink: '/rental?view=bookings',
    ...overrides,
  };
}

export function stationTimelineWithRuleWarning(): StationOperationsTimelineReadModel {
  return {
    version: 1,
    stationId: ST_KASSEL,
    organizationId: STATIONS_V2_TEST_ORG_ID,
    evaluatedAt: NOW,
    window: {
      fromUtc: '2026-07-18T00:00:00.000Z',
      toUtc: '2026-07-19T00:00:00.000Z',
      timezone: 'Europe/Berlin',
    },
    sortOrder: 'asc',
    pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
    entries: [
      stationTimelineEntryFixture(),
      stationTimelineEntryFixture({
        id: 'tl-return-warning',
        type: 'RETURN',
        status: 'SCHEDULED',
        instantUtc: '2026-07-18T18:00:00.000Z',
        stationLocalTime: '20:00',
        ruleWarning: true,
        ruleWarningCodes: ['AFTER_HOURS_RETURN_REQUIRES_OVERRIDE'],
        actionRequired: true,
      }),
    ],
    scope: { applied: false, mode: 'ALL_STATIONS' },
    frontendRecomputation: false,
  };
}

export function stationOperationsFixture(): StationOperationsDto {
  return {
    stationId: ST_KASSEL,
    organizationId: STATIONS_V2_TEST_ORG_ID,
    evaluatedAt: NOW,
    operationsVersion: 1,
    currentStationTime: {
      instantUtc: NOW,
      localDate: '2026-07-18',
      localTime: '14:00',
      timezone: 'Europe/Berlin',
      label: '18.07.2026 14:00',
    },
    openingStatus: { status: 'OPEN', label: 'Geoeffnet', reasons: [] },
    nextOpeningWindow: null,
    pickupCapability: {
      kind: 'PICKUP_AVAILABLE',
      label: 'Pickup',
      available: true,
      reasons: [],
      nextOpeningWindow: null,
    },
    returnCapability: {
      kind: 'RETURN_AVAILABLE',
      label: 'Return',
      available: true,
      reasons: [],
      nextOpeningWindow: null,
    },
    afterHoursCapability: { status: 'NOT_AVAILABLE', label: 'Nicht verfuegbar', reasons: [] },
    keyboxStatus: { status: 'NOT_APPLICABLE', label: 'N/A', reasons: [] },
    calendarException: { active: false, exception: null, label: 'Keine Ausnahme', reasons: [] },
    capacityStatus: {
      status: 'AVAILABLE',
      label: 'Kapazitaet verfuegbar',
      configuredCapacity: 25,
      currentOnSiteCount: 8,
      availablePhysicalSlots: 17,
      projectedOccupancy: null,
      reasons: [],
    },
    geofenceCapability: {
      status: 'CONFIGURED_ONLY',
      label: 'Geofence aktiv',
      geofenceConfigured: true,
      automationActive: false,
      writesCurrentStationId: false,
      publishesConfirmedArrival: false,
      allowsAutomaticLocationDetectionClaim: false,
      uiHint: '',
      reasons: [],
    },
    configurationProblems: [],
    operationalWarnings: [],
  };
}

export function stationTeamFixture(): StationTeamDto {
  return {
    wired: true,
    managerName: 'Max Mustermann',
    contactPerson: 'Max Mustermann',
    phone: '+49 561 12345',
    email: 'kassel@synqdrive.eu',
    staff: [
      {
        membershipId: 'mem-v2-1',
        userId: 'user-stations-v2-e2e',
        displayName: 'Stations E2E',
        name: 'Stations E2E',
        role: 'ORG_ADMIN',
        roleLabel: 'Org-Admin',
        scopeMode: 'THIS_STATION',
        scopeLabel: 'Diese Station',
        assignedStationCount: 1,
      },
    ],
    totalCount: 1,
  };
}

export function stationActivityFixture(): { entries: StationActivityEntry[]; filters: { actions: string[] } } {
  return {
    entries: [
      {
        id: 'act-v2-1',
        action: 'STATION_UPDATED',
        actionLabel: 'Station aktualisiert',
        description: 'Kapazitaet angepasst',
        changeSummary: 'Kapazitaet: 20 → 25',
        actor: { id: 'user-stations-v2-e2e', displayName: 'Stations E2E' },
        fromLabel: '20',
        toLabel: '25',
        createdAt: NOW,
      },
    ],
    filters: { actions: ['STATION_UPDATED', 'STATION_ACTIVATED'] },
  };
}

function stationRef(id: string, name: string, code: string, status = 'ACTIVE') {
  return { id, name, code, status };
}

export function workflowVehicleRow(
  overrides: Partial<StationVehicleWorkflowVehicleRow> = {},
): StationVehicleWorkflowVehicleRow {
  return {
    id: overrides.id ?? VEH_KASSEL_1,
    licensePlate: 'KS-ST 101',
    make: 'VW',
    model: 'Golf',
    vehicleName: null,
    rentalStatus: 'AVAILABLE',
    homeStation: stationRef(ST_BERLIN, 'Berlin Mitte', 'BER'),
    currentStation: stationRef(ST_BERLIN, 'Berlin Mitte', 'BER'),
    expectedStation: null,
    stationPositionVersion: 1,
    isRented: false,
    ...overrides,
  };
}

export function workflowPreviewFixture(): StationVehicleWorkflowPreviewResult {
  return {
    workflow: 'change_home',
    allowed: true,
    idempotent: false,
    command: 'change_home',
    vehicleId: VEH_KASSEL_1,
    licensePlate: 'KS-ST 101',
    vehicleLabel: 'VW Golf',
    rentalStatus: 'AVAILABLE',
    from: {
      homeStation: stationRef(ST_BERLIN, 'Berlin Mitte', 'BER'),
      currentStation: stationRef(ST_BERLIN, 'Berlin Mitte', 'BER'),
      expectedStation: null,
    },
    to: {
      homeStation: stationRef(ST_KASSEL, 'Kassel Hauptbahnhof', 'KAS'),
      currentStation: stationRef(ST_BERLIN, 'Berlin Mitte', 'BER'),
      expectedStation: null,
    },
    warnings: [],
    blockingReasons: [],
    concurrency: { stationPositionVersion: 1 },
    manualOverrideRequired: false,
  };
}

export function buildManyWorkflowVehicles(total: number): StationVehicleWorkflowVehicleRow[] {
  return Array.from({ length: total }, (_, index) =>
    workflowVehicleRow({
      id: `veh-v2-bulk-${index + 1}`,
      licensePlate: `KS-BK ${String(index + 1).padStart(3, '0')}`,
    }),
  );
}
