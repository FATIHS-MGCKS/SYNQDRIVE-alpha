import type {
  StationCapacityStatus,
  StationKpiMetric,
  StationKpiMetricName,
  StationOpeningStatus,
  StationOperationsOpeningWindow,
  StationOperationsReason,
  StationSummaryReadModel,
} from '../../lib/api';
import type { StatusTone } from '../../components/patterns';
import { capacityStatusTone, openingStatusTone } from './station-org-summaries.utils';
import { formatStationCount } from './stations-ui-format';

export type StationOverviewMetricValue = {
  display: string;
  known: boolean;
  numeric: number | null;
};

export type StationOverviewDeepLinkTarget = 'schedule' | 'fleet' | 'operations';

export interface StationOverviewVehicleSignal {
  id: string;
  message: string;
  tone: StatusTone;
  deepLink: StationOverviewDeepLinkTarget;
  count: number;
}

export interface StationOverviewDecisionModel {
  partialDataIncomplete: boolean;
  openingStatus: StationOpeningStatus | null;
  openingStatusLabel: string | null;
  openingTone: StatusTone;
  nextOpeningWindow: StationOperationsOpeningWindow | null;
  nextOpeningWindowLabel: string | null;
  capacityStatus: StationCapacityStatus | null;
  capacityKnown: boolean;
  capacityLabel: string | null;
  capacityTone: StatusTone;
  timezone: string;
  onSite: StationOverviewMetricValue;
  readyForRent: StationOverviewMetricValue;
  blockedOrMaintenance: StationOverviewMetricValue;
  pickupsToday: StationOverviewMetricValue;
  returnsToday: StationOverviewMetricValue;
  overdueReturns: StationOverviewMetricValue;
  expectedTransfers: StationOverviewMetricValue;
  configurationProblems: StationOperationsReason[];
  operationalWarnings: StationOperationsReason[];
  vehicleSignals: StationOverviewVehicleSignal[];
  hasOpenOperationalProblems: boolean;
  operationsQuiet: boolean;
}

function readKpiMetric(metric: StationKpiMetric<number>, locale: string): StationOverviewMetricValue {
  if (!metric.known || metric.value == null) {
    return { display: '—', known: false, numeric: null };
  }
  return {
    display: formatStationCount(metric.value, locale),
    known: true,
    numeric: metric.value,
  };
}

function readCapacityMetric(
  metric: StationKpiMetric<StationCapacityStatus>,
): { status: StationCapacityStatus | null; known: boolean } {
  if (!metric.known || metric.value == null) {
    return { status: null, known: false };
  }
  return { status: metric.value, known: true };
}

export function resolveNextOpeningWindow(
  summary: StationSummaryReadModel,
): StationOperationsOpeningWindow | null {
  const candidates = [
    summary.operationalCapabilities.pickup.nextOpeningWindow,
    summary.operationalCapabilities.return.nextOpeningWindow,
  ].filter((window): window is StationOperationsOpeningWindow => window != null);

  if (candidates.length === 0) return null;

  return [...candidates].sort(
    (left, right) => new Date(left.opensAt).getTime() - new Date(right.opensAt).getTime(),
  )[0] ?? null;
}

export function formatStationLocalWindow(
  window: StationOperationsOpeningWindow,
  timezone: string,
  locale: string,
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const opens = formatter.format(new Date(window.opensAt));
  const closes = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(window.closesAt));

  return `${opens} – ${closes}`;
}

function buildVehicleSignals(
  summary: StationSummaryReadModel,
  metrics: StationSummaryReadModel['kpis']['metrics'],
): StationOverviewVehicleSignal[] {
  if (summary.operationalWarnings.length > 0) return [];

  const signals: StationOverviewVehicleSignal[] = [];
  const pushCountSignal = (
    id: string,
    metric: StationKpiMetric<number>,
    messageKey: string,
    tone: StatusTone,
  ) => {
    if (!metric.known || metric.value == null || metric.value <= 0) return;
    signals.push({
      id,
      message: messageKey,
      tone,
      deepLink: 'fleet',
      count: metric.value,
    });
  };

  pushCountSignal(
    'blocked-maintenance',
    metrics.blockedOrMaintenanceOnSite,
    'blocked-maintenance',
    'watch',
  );
  pushCountSignal('critical-on-site', metrics.criticalOnSite, 'critical-on-site', 'critical');
  pushCountSignal(
    'health-warnings',
    metrics.vehiclesWithHealthWarningsOnSite,
    'health-warnings',
    'watch',
  );

  return signals;
}

export function buildStationOverviewDecisionModel(
  summary: StationSummaryReadModel | null | undefined,
  options?: { locale?: string },
): StationOverviewDecisionModel | null {
  if (!summary) return null;

  const locale = options?.locale ?? 'en';
  const timezone = summary.masterData.timezone || summary.kpis.timezone || 'Europe/Berlin';
  const metrics = summary.kpis.metrics;
  const capacity = readCapacityMetric(metrics.capacityStatus);
  const nextOpeningWindow = resolveNextOpeningWindow(summary);
  const vehicleSignals = buildVehicleSignals(summary, metrics);

  const configurationProblems = summary.configurationProblems;
  const operationalWarnings = summary.operationalWarnings;

  const onSite = readKpiMetric(metrics.currentOnSiteCount, locale);
  const readyForRent = readKpiMetric(metrics.readyToRentOnSite, locale);
  const blockedOrMaintenance = readKpiMetric(metrics.blockedOrMaintenanceOnSite, locale);
  const pickupsToday = readKpiMetric(metrics.pickupsToday, locale);
  const returnsToday = readKpiMetric(metrics.returnsToday, locale);
  const overdueReturns = readKpiMetric(metrics.overdueReturns, locale);
  const expectedTransfers = readKpiMetric(metrics.incomingTransfers, locale);

  const hasOpenOperationalProblems =
    configurationProblems.length > 0 ||
    operationalWarnings.length > 0 ||
    vehicleSignals.length > 0;

  const operationsQuiet =
    hasOpenOperationalProblems === false &&
    (!pickupsToday.known || pickupsToday.numeric === 0) &&
    (!returnsToday.known || returnsToday.numeric === 0) &&
    (!overdueReturns.known || overdueReturns.numeric === 0) &&
    (!expectedTransfers.known || expectedTransfers.numeric === 0);

  return {
    partialDataIncomplete: !summary.partialData.complete,
    openingStatus: summary.openingStatus?.status ?? null,
    openingStatusLabel: summary.openingStatus?.label ?? null,
    openingTone: openingStatusTone(summary.openingStatus?.status ?? null),
    nextOpeningWindow,
    nextOpeningWindowLabel: nextOpeningWindow
      ? formatStationLocalWindow(nextOpeningWindow, timezone, locale)
      : null,
    capacityStatus: capacity.status,
    capacityKnown: capacity.known,
    capacityLabel: capacity.known ? capacity.status : null,
    capacityTone: capacityStatusTone(capacity.status),
    timezone,
    onSite,
    readyForRent,
    blockedOrMaintenance,
    pickupsToday,
    returnsToday,
    overdueReturns,
    expectedTransfers,
    configurationProblems,
    operationalWarnings,
    vehicleSignals,
    hasOpenOperationalProblems,
    operationsQuiet,
  };
}

export function isOverviewMetricActionable(
  metric: StationOverviewMetricValue,
): metric is StationOverviewMetricValue & { numeric: number } {
  return metric.known && metric.numeric != null;
}

export const OVERVIEW_KPI_METRIC_NAMES = [
  'currentOnSiteCount',
  'readyToRentOnSite',
  'blockedOrMaintenanceOnSite',
  'pickupsToday',
  'returnsToday',
  'overdueReturns',
  'incomingTransfers',
] as const satisfies readonly StationKpiMetricName[];
