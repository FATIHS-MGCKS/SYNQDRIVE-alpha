import type {
  Station,
  StationCapacityStatus,
  StationOpeningStatus,
  StationOrgSummariesQueryParams,
  StationOrgSummariesReadModel,
  StationSummaryReadModel,
} from '../../lib/api';
import type { StatusTone } from '../../components/patterns';

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

export const STATION_TYPES_EXPECTING_HOME_FLEET = new Set<Station['type']>(['MAIN', 'BRANCH']);

export interface StationCardDisplayMetrics {
  homeFleet: number | '—';
  onSite: number | '—';
  todayPickups: number | '—';
  todayReturns: number | '—';
  openingStatus: StationOpeningStatus | null;
  openingStatusLabel: string | null;
  capacityStatus: StationCapacityStatus | null;
  capacityKnown: boolean;
  operationalWarningCount: number;
  configurationProblemCount: number;
  partialDataIncomplete: boolean;
}

export function stationExpectsHomeFleet(summary: StationSummaryReadModel): boolean {
  if (summary.lifecycle.status !== 'ACTIVE') return false;
  if (!STATION_TYPES_EXPECTING_HOME_FLEET.has(summary.lifecycle.type)) return false;
  return summaryHasPickupEnabled(summary) || summaryHasReturnEnabled(summary);
}

export function openingStatusTone(status: StationOpeningStatus | null): StatusTone {
  if (status === 'OPEN') return 'success';
  if (status === 'CLOSED') return 'warning';
  return 'neutral';
}

export function capacityStatusTone(status: StationCapacityStatus | null): StatusTone {
  if (!status || status === 'UNKNOWN') return 'neutral';
  if (status === 'AVAILABLE') return 'success';
  if (status === 'NEAR_CAPACITY') return 'watch';
  if (status === 'FULL' || status === 'OVER_CAPACITY' || status === 'PROJECTED_OVER_CAPACITY') {
    return 'critical';
  }
  return 'neutral';
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
  return typeof entry.value === 'number' ? entry.value : '—';
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
    geofenceCapability: {
      capabilityVersion: 1,
      status: summary.configurationProblems.some((problem) => problem.code.includes('GEOFENCE'))
        ? 'NOT_CONFIGURED'
        : 'CONFIGURED_ONLY',
      geofenceConfigured: false,
      automationActive: false,
      writesCurrentStationId: false,
      publishesConfirmedArrival: false,
      allowsAutomaticLocationDetectionClaim: false,
      reasons: [],
      uiHint: '',
    },
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
      homeFleet: '—',
      onSite: '—',
      todayPickups: '—',
      todayReturns: '—',
      openingStatus: null,
      openingStatusLabel: null,
      capacityStatus: null,
      capacityKnown: false,
      operationalWarningCount: 0,
      configurationProblemCount: 0,
      partialDataIncomplete: false,
    };
  }

  const capacityMetric = summary.kpis.metrics.capacityStatus;

  return {
    homeFleet: readKnownMetric(summary, 'homeFleetCount'),
    onSite: readKnownMetric(summary, 'currentOnSiteCount'),
    todayPickups: readKnownMetric(summary, 'pickupsToday'),
    todayReturns: readKnownMetric(summary, 'returnsToday'),
    openingStatus: summary.openingStatus?.status ?? null,
    openingStatusLabel: summary.openingStatus?.label ?? null,
    capacityStatus: capacityMetric.known ? capacityMetric.value : null,
    capacityKnown: capacityMetric.known,
    operationalWarningCount: summary.operationalWarnings.length,
    configurationProblemCount: summary.configurationProblems.length,
    partialDataIncomplete: !summary.partialData.complete,
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
