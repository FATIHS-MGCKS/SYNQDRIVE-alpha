import type { StationCapacityStatus } from './station-capacity-policy.contract';
import type { StationKpiMetricName } from './station-kpis.contract';
import type { StationSummaryReadModel } from './station-summary-read-model.contract';

export const STATION_ORG_SUMMARIES_VERSION = 1 as const;

export const STATION_ORG_SUMMARIES_DEFAULT_PAGE_SIZE = 20 as const;
export const STATION_ORG_SUMMARIES_MAX_PAGE_SIZE = 100 as const;
export const STATION_ORG_SUMMARIES_MAX_AGGREGATION_STATIONS = 500 as const;

export const StationOrgSummariesLimitCode = {
  PAGE_SIZE_CAPPED: 'STATION_ORG_SUMMARIES_PAGE_SIZE_CAPPED',
  AGGREGATION_STATION_CAP: 'STATION_ORG_SUMMARIES_AGGREGATION_STATION_CAP',
} as const;

export interface StationOrgSummariesQueryLimits {
  defaultPageSize: typeof STATION_ORG_SUMMARIES_DEFAULT_PAGE_SIZE;
  maxPageSize: typeof STATION_ORG_SUMMARIES_MAX_PAGE_SIZE;
  maxAggregationStations: typeof STATION_ORG_SUMMARIES_MAX_AGGREGATION_STATIONS;
  appliedPageSize: number;
  aggregationStationCapApplied: boolean;
  matchedStationCount: number;
  processedStationCount: number;
  codes: string[];
}

export interface StationOrgSummariesAppliedFilters {
  status: string | null;
  type: string | null;
  isPrimary: boolean | null;
  search: string | null;
  pickupCapabilityAvailable: boolean | null;
  returnCapabilityAvailable: boolean | null;
  hasConfigurationProblems: boolean | null;
}

export interface StationOrgSummariesPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface StationOrgGlobalKpis {
  stationCount: number;
  homeFleetCount: number;
  currentOnSiteCount: number;
  foreignVehiclesOnSiteCount: number;
  expectedArrivalCount: number;
  currentlyRentedHomeVehicles: number;
  readyToRentOnSite: number;
  notReadyOnSite: number;
  blockedOrMaintenanceOnSite: number;
  criticalOnSite: number;
  warningOnSite: number;
  telemetryOfflineOnSite: number;
  complianceBlockerOnSite: number;
  vehiclesWithHealthWarningsOnSite: number;
  pickupsToday: number;
  returnsToday: number;
  overdueReturns: number;
  incomingTransfers: number;
  outgoingTransfers: number;
  openOperationalTasks: number;
  capacityStatusCounts: Record<StationCapacityStatus, number>;
  partialMetricCount: number;
}

export interface StationOrgSummariesPartialData {
  complete: boolean;
  stationsWithPartialData: number;
  unknownMetricNames: StationKpiMetricName[];
  reasons: Array<{ code: string; message: string }>;
}

export interface StationOrgSummariesWarningCounts {
  configurationProblems: number;
  operationalWarnings: number;
  total: number;
  stationsWithConfigurationProblems: number;
  stationsWithOperationalWarnings: number;
}

export interface StationOrgSummariesReadModel {
  version: typeof STATION_ORG_SUMMARIES_VERSION;
  organizationId: string;
  evaluatedAt: string;
  lastCalculatedAt: string;
  scope: {
    applied: boolean;
    mode: 'ALL_STATIONS' | 'SCOPED_STATIONS';
  };
  limits: StationOrgSummariesQueryLimits;
  filters: StationOrgSummariesAppliedFilters;
  pagination: StationOrgSummariesPagination;
  stationSummaries: StationSummaryReadModel[];
  globalKpis: StationOrgGlobalKpis;
  partialData: StationOrgSummariesPartialData;
  warningCounts: StationOrgSummariesWarningCounts;
  frontendRecomputation: false;
}

export interface StationOrgSummariesContractMetadata {
  version: typeof STATION_ORG_SUMMARIES_VERSION;
  resolver: 'station-org-summaries.resolver';
  frontendRecomputation: false;
  limits: {
    defaultPageSize: typeof STATION_ORG_SUMMARIES_DEFAULT_PAGE_SIZE;
    maxPageSize: typeof STATION_ORG_SUMMARIES_MAX_PAGE_SIZE;
    maxAggregationStations: typeof STATION_ORG_SUMMARIES_MAX_AGGREGATION_STATIONS;
  };
}

export function getStationOrgSummariesContractMetadata(): StationOrgSummariesContractMetadata {
  return {
    version: STATION_ORG_SUMMARIES_VERSION,
    resolver: 'station-org-summaries.resolver',
    frontendRecomputation: false,
    limits: {
      defaultPageSize: STATION_ORG_SUMMARIES_DEFAULT_PAGE_SIZE,
      maxPageSize: STATION_ORG_SUMMARIES_MAX_PAGE_SIZE,
      maxAggregationStations: STATION_ORG_SUMMARIES_MAX_AGGREGATION_STATIONS,
    },
  };
}
