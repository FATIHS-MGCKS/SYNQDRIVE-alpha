import { StationCapacityStatus } from './station-capacity-policy.contract';
import {
  STATION_ORG_SUMMARIES_DEFAULT_PAGE_SIZE,
  STATION_ORG_SUMMARIES_MAX_AGGREGATION_STATIONS,
  STATION_ORG_SUMMARIES_MAX_PAGE_SIZE,
  STATION_ORG_SUMMARIES_VERSION,
  StationOrgSummariesLimitCode,
  type StationOrgGlobalKpis,
  type StationOrgSummariesAppliedFilters,
  type StationOrgSummariesPartialData,
  type StationOrgSummariesQueryLimits,
  type StationOrgSummariesReadModel,
  type StationOrgSummariesWarningCounts,
} from './station-org-summaries.contract';
import type { StationKpiMetricName } from './station-kpis.contract';
import type { StationSummaryReadModel } from './station-summary-read-model.contract';

export * from './station-org-summaries.contract';

const NUMERIC_KPI_METRICS = [
  'homeFleetCount',
  'currentOnSiteCount',
  'foreignVehiclesOnSiteCount',
  'expectedArrivalCount',
  'currentlyRentedHomeVehicles',
  'readyToRentOnSite',
  'blockedOrMaintenanceOnSite',
  'pickupsToday',
  'returnsToday',
  'overdueReturns',
  'incomingTransfers',
  'outgoingTransfers',
  'openOperationalTasks',
] as const;

type NumericKpiMetricName = (typeof NUMERIC_KPI_METRICS)[number];

function emptyCapacityStatusCounts(): Record<StationCapacityStatus, number> {
  return {
    [StationCapacityStatus.UNKNOWN]: 0,
    [StationCapacityStatus.AVAILABLE]: 0,
    [StationCapacityStatus.NEAR_CAPACITY]: 0,
    [StationCapacityStatus.FULL]: 0,
    [StationCapacityStatus.OVER_CAPACITY]: 0,
    [StationCapacityStatus.PROJECTED_OVER_CAPACITY]: 0,
  };
}

function sumKnownMetric(
  summaries: StationSummaryReadModel[],
  metricName: NumericKpiMetricName,
): number {
  return summaries.reduce((sum, summary) => {
    const metric = summary.kpis.metrics[metricName];
    if (!metric.known || metric.value == null) {
      return sum;
    }
    return sum + metric.value;
  }, 0);
}

export function aggregateStationOrgGlobalKpis(
  summaries: StationSummaryReadModel[],
): StationOrgGlobalKpis {
  const capacityStatusCounts = emptyCapacityStatusCounts();
  let partialMetricCount = 0;

  for (const summary of summaries) {
    const capacityMetric = summary.kpis.metrics.capacityStatus;
    if (capacityMetric.known && capacityMetric.value) {
      capacityStatusCounts[capacityMetric.value] += 1;
    } else {
      capacityStatusCounts[StationCapacityStatus.UNKNOWN] += 1;
    }

    partialMetricCount += summary.partialData.unknownMetricNames.length;
  }

  return {
    stationCount: summaries.length,
    homeFleetCount: sumKnownMetric(summaries, 'homeFleetCount'),
    currentOnSiteCount: sumKnownMetric(summaries, 'currentOnSiteCount'),
    foreignVehiclesOnSiteCount: sumKnownMetric(summaries, 'foreignVehiclesOnSiteCount'),
    expectedArrivalCount: sumKnownMetric(summaries, 'expectedArrivalCount'),
    currentlyRentedHomeVehicles: sumKnownMetric(summaries, 'currentlyRentedHomeVehicles'),
    readyToRentOnSite: sumKnownMetric(summaries, 'readyToRentOnSite'),
    blockedOrMaintenanceOnSite: sumKnownMetric(summaries, 'blockedOrMaintenanceOnSite'),
    pickupsToday: sumKnownMetric(summaries, 'pickupsToday'),
    returnsToday: sumKnownMetric(summaries, 'returnsToday'),
    overdueReturns: sumKnownMetric(summaries, 'overdueReturns'),
    incomingTransfers: sumKnownMetric(summaries, 'incomingTransfers'),
    outgoingTransfers: sumKnownMetric(summaries, 'outgoingTransfers'),
    openOperationalTasks: sumKnownMetric(summaries, 'openOperationalTasks'),
    capacityStatusCounts,
    partialMetricCount,
  };
}

export function aggregateStationOrgPartialData(
  summaries: StationSummaryReadModel[],
): StationOrgSummariesPartialData {
  const unknownMetricNames = new Set<StationKpiMetricName>();
  const reasonKeys = new Set<string>();
  const reasons: Array<{ code: string; message: string }> = [];
  let stationsWithPartialData = 0;

  for (const summary of summaries) {
    if (!summary.partialData.complete) {
      stationsWithPartialData += 1;
    }
    for (const metricName of summary.partialData.unknownMetricNames) {
      unknownMetricNames.add(metricName as StationKpiMetricName);
    }
    for (const reason of summary.partialData.reasons) {
      const key = `${reason.code}::${reason.message}`;
      if (!reasonKeys.has(key)) {
        reasonKeys.add(key);
        reasons.push(reason);
      }
    }
  }

  return {
    complete: stationsWithPartialData === 0,
    stationsWithPartialData,
    unknownMetricNames: [...unknownMetricNames],
    reasons,
  };
}

export function aggregateStationOrgWarningCounts(
  summaries: StationSummaryReadModel[],
): StationOrgSummariesWarningCounts {
  let configurationProblems = 0;
  let operationalWarnings = 0;
  let stationsWithConfigurationProblems = 0;
  let stationsWithOperationalWarnings = 0;

  for (const summary of summaries) {
    if (summary.configurationProblems.length > 0) {
      stationsWithConfigurationProblems += 1;
      configurationProblems += summary.configurationProblems.length;
    }
    if (summary.operationalWarnings.length > 0) {
      stationsWithOperationalWarnings += 1;
      operationalWarnings += summary.operationalWarnings.length;
    }
  }

  return {
    configurationProblems,
    operationalWarnings,
    total: configurationProblems + operationalWarnings,
    stationsWithConfigurationProblems,
    stationsWithOperationalWarnings,
  };
}

export function normalizeStationOrgSummariesPageSize(
  requestedPageSize: number | undefined,
): { pageSize: number; pageSizeCapped: boolean } {
  const fallback = STATION_ORG_SUMMARIES_DEFAULT_PAGE_SIZE;
  if (requestedPageSize == null || Number.isNaN(requestedPageSize)) {
    return { pageSize: fallback, pageSizeCapped: false };
  }

  if (requestedPageSize > STATION_ORG_SUMMARIES_MAX_PAGE_SIZE) {
    return { pageSize: STATION_ORG_SUMMARIES_MAX_PAGE_SIZE, pageSizeCapped: true };
  }

  if (requestedPageSize < 1) {
    return { pageSize: fallback, pageSizeCapped: false };
  }

  return { pageSize: requestedPageSize, pageSizeCapped: false };
}

export function buildStationOrgSummariesQueryLimits(input: {
  appliedPageSize: number;
  pageSizeCapped: boolean;
  matchedStationCount: number;
  processedStationCount: number;
  aggregationStationCapApplied: boolean;
}): StationOrgSummariesQueryLimits {
  const codes: string[] = [];
  if (input.pageSizeCapped) {
    codes.push(StationOrgSummariesLimitCode.PAGE_SIZE_CAPPED);
  }
  if (input.aggregationStationCapApplied) {
    codes.push(StationOrgSummariesLimitCode.AGGREGATION_STATION_CAP);
  }

  return {
    defaultPageSize: STATION_ORG_SUMMARIES_DEFAULT_PAGE_SIZE,
    maxPageSize: STATION_ORG_SUMMARIES_MAX_PAGE_SIZE,
    maxAggregationStations: STATION_ORG_SUMMARIES_MAX_AGGREGATION_STATIONS,
    appliedPageSize: input.appliedPageSize,
    aggregationStationCapApplied: input.aggregationStationCapApplied,
    matchedStationCount: input.matchedStationCount,
    processedStationCount: input.processedStationCount,
    codes,
  };
}

export function paginateStationSummaries<T>(
  items: T[],
  page: number,
  pageSize: number,
): {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
} {
  const safePage = page < 1 ? 1 : page;
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: items.slice(start, end),
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasMore: end < total,
    },
  };
}

export function applyStationOrgSummaryPostFilters(
  summaries: StationSummaryReadModel[],
  filters: Pick<
    StationOrgSummariesAppliedFilters,
    'pickupCapabilityAvailable' | 'returnCapabilityAvailable' | 'hasConfigurationProblems'
  >,
): StationSummaryReadModel[] {
  return summaries.filter((summary) => {
    if (
      filters.pickupCapabilityAvailable != null &&
      summary.operationalCapabilities.pickup.available !== filters.pickupCapabilityAvailable
    ) {
      return false;
    }
    if (
      filters.returnCapabilityAvailable != null &&
      summary.operationalCapabilities.return.available !== filters.returnCapabilityAvailable
    ) {
      return false;
    }
    if (filters.hasConfigurationProblems != null) {
      const hasProblems = summary.configurationProblems.length > 0;
      if (hasProblems !== filters.hasConfigurationProblems) {
        return false;
      }
    }
    return true;
  });
}

export interface StationOrgSummariesResolverInput {
  organizationId: string;
  evaluatedAt: string;
  scope: StationOrgSummariesReadModel['scope'];
  filters: StationOrgSummariesAppliedFilters;
  summaries: StationSummaryReadModel[];
  page: number;
  pageSize: number;
  matchedStationCount: number;
  processedStationCount: number;
  aggregationStationCapApplied: boolean;
  pageSizeCapped: boolean;
}

export function resolveStationOrgSummariesReadModel(
  input: StationOrgSummariesResolverInput,
): StationOrgSummariesReadModel {
  const filteredSummaries = applyStationOrgSummaryPostFilters(input.summaries, input.filters);
  const { items, pagination } = paginateStationSummaries(
    filteredSummaries,
    input.page,
    input.pageSize,
  );

  return {
    version: STATION_ORG_SUMMARIES_VERSION,
    organizationId: input.organizationId,
    evaluatedAt: input.evaluatedAt,
    lastCalculatedAt: input.evaluatedAt,
    scope: input.scope,
    limits: buildStationOrgSummariesQueryLimits({
      appliedPageSize: input.pageSize,
      pageSizeCapped: input.pageSizeCapped,
      matchedStationCount: input.matchedStationCount,
      processedStationCount: input.processedStationCount,
      aggregationStationCapApplied: input.aggregationStationCapApplied,
    }),
    filters: input.filters,
    pagination,
    stationSummaries: items,
    globalKpis: aggregateStationOrgGlobalKpis(filteredSummaries),
    partialData: aggregateStationOrgPartialData(filteredSummaries),
    warningCounts: aggregateStationOrgWarningCounts(filteredSummaries),
    frontendRecomputation: false,
  };
}
