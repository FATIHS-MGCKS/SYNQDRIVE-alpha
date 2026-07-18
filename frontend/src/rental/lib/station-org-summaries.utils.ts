import type {
  Station,
  StationOrgSummariesQueryParams,
  StationOrgSummariesReadModel,
  StationSummaryReadModel,
} from '../../lib/api';

export const STATION_ORG_SUMMARIES_PAGE_SIZE = 100;

export type StationSummariesViewFilters = {
  status: '' | Station['status'];
  type: '' | Station['type'];
  city: string;
  pickupOnly: boolean;
  returnOnly: boolean;
  problemsOnly: boolean;
  primaryOnly: boolean;
};

export interface StationCardDisplayMetrics {
  totalVehicles: number | '—';
  availableVehicles: number | '—';
  todayPickups: number | '—';
  todayReturns: number | '—';
  inServiceVehicles: number | '—';
  openTasks: number | '—';
  capacityUsagePercent: number | '—' | null;
}

export interface StationOrgSummariesLoaded {
  model: StationOrgSummariesReadModel;
  summaries: StationSummaryReadModel[];
  summariesById: Record<string, StationSummaryReadModel>;
  stations: Station[];
}

function readKnownMetric(
  summary: StationSummaryReadModel,
  metric: keyof StationSummaryReadModel['kpis']['metrics'],
): number | '—' {
  const entry = summary.kpis.metrics[metric];
  if (!entry.known || entry.value == null) return '—';
  return entry.value;
}

export function buildStationSummariesQueryParams(
  filters: StationSummariesViewFilters,
  search: string,
): StationOrgSummariesQueryParams {
  const trimmedSearch = search.trim();
  return {
    pageSize: STATION_ORG_SUMMARIES_PAGE_SIZE,
    status: filters.status || undefined,
    type: filters.type || undefined,
    isPrimary: filters.primaryOnly ? true : undefined,
    search: trimmedSearch || undefined,
    hasConfigurationProblems: filters.problemsOnly ? true : undefined,
  };
}

export function summaryHasPickupEnabled(summary: StationSummaryReadModel): boolean {
  return !summary.configurationProblems.some((problem) =>
    problem.code.includes('PICKUP_DISABLED'),
  );
}

export function summaryHasReturnEnabled(summary: StationSummaryReadModel): boolean {
  return !summary.configurationProblems.some((problem) =>
    problem.code.includes('RETURN_DISABLED'),
  );
}

export function mapSummaryToStation(summary: StationSummaryReadModel): Station {
  const { masterData, lifecycle } = summary;
  const homeFleet = summary.kpis.metrics.homeFleetCount;
  const vehicleCount = homeFleet.known && homeFleet.value != null ? homeFleet.value : 0;
  const hasMissingCoordinates = summary.configurationProblems.some((problem) =>
    problem.code.includes('COORDINATES'),
  );

  return {
    id: masterData.id,
    name: masterData.name,
    code: masterData.code,
    status: lifecycle.status,
    statusLabel: lifecycle.statusLabel,
    type: lifecycle.type,
    typeLabel: lifecycle.typeLabel,
    isPrimary: lifecycle.isPrimary,
    address: masterData.address,
    addressLine1: masterData.address,
    addressLine2: masterData.addressLine2,
    city: masterData.city,
    postalCode: masterData.postalCode,
    country: masterData.country,
    latitude: null,
    longitude: null,
    coordinatesSource: null,
    coordinatesConfirmedAt: null,
    hasMissingCoordinates,
    geofenceCapability: summary.configurationProblems.some((problem) =>
      problem.code.includes('GEOFENCE'),
    )
      ? 'NOT_CONFIGURED'
      : 'CONFIGURED_ONLY',
    timezone: masterData.timezone,
    radiusMeters: null,
    geofenceRadiusMeters: null,
    phone: masterData.phone,
    email: masterData.email,
    managerName: masterData.managerName,
    contactPerson: masterData.managerName,
    pickupEnabled: summaryHasPickupEnabled(summary),
    returnEnabled: summaryHasReturnEnabled(summary),
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    capacity: masterData.capacity,
    openingHours: null,
    openingHoursContractVersion: 2,
    holidayRules: null,
    handoverInstructions: null,
    returnInstructions: null,
    notes: null,
    internalNotes: null,
    googlePlaceId: null,
    archivedAt: lifecycle.archivedAt,
    vehicleCount,
    createdAt: summary.lastCalculatedAt,
    updatedAt: summary.lastCalculatedAt,
  };
}

export function getStationCardDisplayMetrics(
  summary: StationSummaryReadModel | undefined,
): StationCardDisplayMetrics {
  if (!summary) {
    return {
      totalVehicles: '—',
      availableVehicles: '—',
      todayPickups: '—',
      todayReturns: '—',
      inServiceVehicles: '—',
      openTasks: '—',
      capacityUsagePercent: null,
    };
  }

  const configuredCapacity = summary.masterData.capacity;
  const onSite = summary.kpis.metrics.currentOnSiteCount;
  const capacityUsagePercent =
    configuredCapacity != null &&
    configuredCapacity > 0 &&
    onSite.known &&
    onSite.value != null
      ? Math.round((onSite.value / configuredCapacity) * 100)
      : null;

  return {
    totalVehicles: readKnownMetric(summary, 'homeFleetCount'),
    availableVehicles: readKnownMetric(summary, 'readyToRentOnSite'),
    todayPickups: readKnownMetric(summary, 'pickupsToday'),
    todayReturns: readKnownMetric(summary, 'returnsToday'),
    inServiceVehicles: readKnownMetric(summary, 'blockedOrMaintenanceOnSite'),
    openTasks: readKnownMetric(summary, 'openOperationalTasks'),
    capacityUsagePercent,
  };
}

export function applyClientStationSummaryFilters(
  summaries: StationSummaryReadModel[],
  filters: StationSummariesViewFilters,
): StationSummaryReadModel[] {
  return summaries.filter((summary) => {
    if (filters.city && summary.masterData.city !== filters.city) return false;
    if (filters.pickupOnly && !summaryHasPickupEnabled(summary)) return false;
    if (filters.returnOnly && !summaryHasReturnEnabled(summary)) return false;
    return true;
  });
}

export function buildLoadedStationOrgSummaries(
  model: StationOrgSummariesReadModel,
  filters: StationSummariesViewFilters,
): StationOrgSummariesLoaded {
  const filteredSummaries = applyClientStationSummaryFilters(model.stationSummaries, filters);
  const summariesById = Object.fromEntries(
    filteredSummaries.map((summary) => [summary.stationId, summary]),
  ) as Record<string, StationSummaryReadModel>;

  return {
    model,
    summaries: filteredSummaries,
    summariesById,
    stations: filteredSummaries.map(mapSummaryToStation),
  };
}

export async function fetchAllStationOrgSummaries(
  orgId: string,
  params: StationOrgSummariesQueryParams,
  fetchPage: (
    page: number,
    pageSize: number,
  ) => Promise<StationOrgSummariesReadModel>,
): Promise<StationOrgSummariesReadModel> {
  const pageSize = params.pageSize ?? STATION_ORG_SUMMARIES_PAGE_SIZE;
  let page = 1;
  let merged: StationOrgSummariesReadModel | null = null;

  while (true) {
    const response = await fetchPage(page, pageSize);
    if (!merged) {
      merged = {
        ...response,
        stationSummaries: [...response.stationSummaries],
      };
    } else {
      merged = {
        ...response,
        stationSummaries: [...merged.stationSummaries, ...response.stationSummaries],
      };
    }

    if (!response.pagination.hasMore) {
      return merged;
    }
    page += 1;
  }
}
