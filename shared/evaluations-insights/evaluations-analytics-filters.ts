/**
 * Unified analytics filter validation, URL serialization, and matching (Prompt 18/54).
 */
import type {
  EvaluationsAnalyticsAppliedFilters,
  EvaluationsAnalyticsFiltersQuery,
  EvaluationsAnalyticsPeriodBounds,
  EvaluationsFilterValidationError,
  ResolvedEvaluationsAnalyticsFilters,
} from './evaluations-analytics-filters.contract';
import type { InsightAnalyticsRow } from './insights-analytics.contract';
import {
  matchesInsightAnalyticsFilters,
  resolveInsightAnalyticsCategory,
} from './insights-analytics';
import { resolveAnalyticsPeriodWindows } from './evaluations-analytics-summary';
import type { EvaluationsAnalyticsPeriod } from './evaluations-analytics-summary.contract';

const MAX_CUSTOM_RANGE_DAYS = 366;
const SUPPORTED_CURRENCIES = new Set(['EUR', '€']);
const MS_PER_DAY = 86_400_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function validateEvaluationsAnalyticsFilters(
  query: EvaluationsAnalyticsFiltersQuery,
  options: { allowDataQualityOnInsights?: boolean } = {},
): EvaluationsFilterValidationError[] {
  const errors: EvaluationsFilterValidationError[] = [];

  if (query.bookingChannel) {
    errors.push({
      code: 'UNSUPPORTED_BOOKING_CHANNEL',
      field: 'bookingChannel',
      message:
        'bookingChannel is not persisted on bookings yet and cannot be used as an analytics filter.',
    });
  }

  if (query.currency && !SUPPORTED_CURRENCIES.has(query.currency.toUpperCase())) {
    errors.push({
      code: 'UNSUPPORTED_CURRENCY',
      field: 'currency',
      message: 'Only EUR currency filtering is supported for analytics summaries.',
    });
  }

  if (query.stationId && !isUuid(query.stationId)) {
    errors.push({ code: 'INVALID_STATION_ID', field: 'stationId', message: 'stationId must be a UUID.' });
  }
  if (query.vehicleId && !isUuid(query.vehicleId)) {
    errors.push({ code: 'INVALID_VEHICLE_ID', field: 'vehicleId', message: 'vehicleId must be a UUID.' });
  }
  if (query.vehicleClassId && !isUuid(query.vehicleClassId)) {
    errors.push({
      code: 'INVALID_VEHICLE_CLASS_ID',
      field: 'vehicleClassId',
      message: 'vehicleClassId must be a UUID.',
    });
  }

  const period = query.period ?? 'mtd';
  if (period === 'custom') {
    if (!query.from || !query.to) {
      errors.push({
        code: 'CUSTOM_PERIOD_BOUNDS_REQUIRED',
        field: 'from',
        message: 'Custom period requires both from and to ISO date parameters.',
      });
    } else {
      const from = new Date(query.from);
      const to = new Date(query.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        errors.push({
          code: 'INVALID_CUSTOM_PERIOD',
          field: 'from',
          message: 'from and to must be valid ISO timestamps.',
        });
      } else if (from.getTime() > to.getTime()) {
        errors.push({
          code: 'INVALID_PERIOD_ORDER',
          field: 'from',
          message: 'from must be before or equal to to.',
        });
      } else {
        const days = (to.getTime() - from.getTime()) / MS_PER_DAY;
        if (days > MAX_CUSTOM_RANGE_DAYS) {
          errors.push({
            code: 'PERIOD_TOO_LARGE',
            field: 'to',
            message: `Custom period may not exceed ${MAX_CUSTOM_RANGE_DAYS} days.`,
          });
        }
      }
    }
  } else if ((query.from || query.to) && (query.period ?? 'mtd') !== 'custom') {
    errors.push({
      code: 'PERIOD_BOUNDS_NOT_ALLOWED',
      field: 'from',
      message: 'from/to are only valid when period=custom.',
    });
  }

  if (
    query.dataQualityStatus &&
    !options.allowDataQualityOnInsights &&
    query.dataQualityStatus !== 'STALE'
  ) {
    // dataQualityStatus beyond STALE metadata is summary-section oriented
  }

  if (query.dataQualityStatus && ['OK', 'PARTIAL', 'UNAVAILABLE'].includes(query.dataQualityStatus)) {
    // Allowed on summary endpoint only — validated at controller layer via allowDataQualityOnInsights
  }

  return errors;
}

export function resolvePeriodBounds(
  query: EvaluationsAnalyticsFiltersQuery,
  timezone: string,
  reference: Date = new Date(),
): { current: EvaluationsAnalyticsPeriodBounds; previous: EvaluationsAnalyticsPeriodBounds } {
  const comparison = query.comparison ?? 'auto';

  if (query.period === 'custom' && query.from && query.to) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const current: EvaluationsAnalyticsPeriodBounds = {
      key: 'custom',
      from: from.toISOString(),
      to: to.toISOString(),
      timezone,
    };
    const durationMs = to.getTime() - from.getTime();
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - durationMs);
    const previous: EvaluationsAnalyticsPeriodBounds = {
      key: 'custom',
      from: previousFrom.toISOString(),
      to: previousTo.toISOString(),
      timezone,
    };
    if (comparison === 'none') {
      return {
        current,
        previous: { key: 'custom', from: current.from, to: current.from, timezone },
      };
    }
    return { current, previous };
  }

  const period = (query.period ?? 'mtd') as EvaluationsAnalyticsPeriod;
  const windows = resolveAnalyticsPeriodWindows(period, timezone, reference);
  if (comparison === 'none') {
    return {
      current: { key: period, from: windows.current.from, to: windows.current.to, timezone },
      previous: { key: period, from: windows.current.from, to: windows.current.from, timezone },
    };
  }
  return {
    current: { key: period, from: windows.current.from, to: windows.current.to, timezone },
    previous: {
      key: period,
      from: windows.previous.from,
      to: windows.previous.to,
      timezone,
    },
  };
}

export function intersectVehicleIdSets(
  a: ReadonlySet<string> | null,
  b: ReadonlySet<string> | null,
): ReadonlySet<string> | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const out = new Set<string>();
  for (const id of a) {
    if (b.has(id)) out.add(id);
  }
  return out;
}

export function resolveVehicleScopeConstraint(
  resolved: ResolvedEvaluationsAnalyticsFilters,
): { mode: 'unrestricted' } | { mode: 'scoped'; vehicleIds: string[] } | { mode: 'empty' } {
  if (resolved.vehicleId) {
    return { mode: 'scoped', vehicleIds: [resolved.vehicleId] };
  }
  if (resolved.scopedVehicleIds !== null) {
    return resolved.scopedVehicleIds.size > 0
      ? { mode: 'scoped', vehicleIds: [...resolved.scopedVehicleIds] }
      : { mode: 'empty' };
  }
  if (resolved.stationVehicleIds !== null) {
    return resolved.stationVehicleIds.size > 0
      ? { mode: 'scoped', vehicleIds: [...resolved.stationVehicleIds] }
      : { mode: 'empty' };
  }
  return { mode: 'unrestricted' };
}

export function resolveStationBookingScope(
  resolved: ResolvedEvaluationsAnalyticsFilters,
): { mode: 'unrestricted' } | { mode: 'scoped'; stationIds: string[] } | { mode: 'empty' } {
  if (resolved.stationId) {
    return { mode: 'scoped', stationIds: [resolved.stationId] };
  }
  if (resolved.allowedStationIds != null) {
    return resolved.allowedStationIds.length > 0
      ? { mode: 'scoped', stationIds: [...resolved.allowedStationIds] }
      : { mode: 'empty' };
  }
  return { mode: 'unrestricted' };
}

export function serializeFiltersToSearchParams(
  filters: EvaluationsAnalyticsFiltersQuery,
): URLSearchParams {
  const params = new URLSearchParams();
  const entries: Array<[string, string | null | undefined]> = [
    ['period', filters.period ?? null],
    ['from', filters.from ?? null],
    ['to', filters.to ?? null],
    ['comparison', filters.comparison ?? null],
    ['stationId', filters.stationId ?? null],
    ['vehicleId', filters.vehicleId ?? null],
    ['vehicleClassId', filters.vehicleClassId ?? null],
    ['vehicleStatus', filters.vehicleStatus ?? null],
    ['bookingStatus', filters.bookingStatus ?? null],
    ['customerSegment', filters.customerSegment ?? null],
    ['currency', filters.currency ?? null],
    ['riskCategory', filters.riskCategory ?? null],
    ['insightStatus', filters.insightStatus ?? null],
    ['dataQualityStatus', filters.dataQualityStatus ?? null],
  ];
  for (const [key, value] of entries) {
    if (value != null && value !== '') params.set(key, value);
  }
  return params;
}

export function parseFiltersFromSearchParams(
  params: URLSearchParams,
): EvaluationsAnalyticsFiltersQuery {
  const read = (key: string) => params.get(key) ?? undefined;
  return {
    period: (read('period') as EvaluationsAnalyticsFiltersQuery['period']) ?? undefined,
    from: read('from'),
    to: read('to'),
    comparison: read('comparison') as EvaluationsAnalyticsFiltersQuery['comparison'],
    stationId: read('stationId') ?? null,
    vehicleId: read('vehicleId') ?? null,
    vehicleClassId: read('vehicleClassId') ?? null,
    vehicleStatus: read('vehicleStatus') as EvaluationsAnalyticsFiltersQuery['vehicleStatus'],
    bookingStatus: read('bookingStatus') as EvaluationsAnalyticsFiltersQuery['bookingStatus'],
    customerSegment: read('customerSegment') as EvaluationsAnalyticsFiltersQuery['customerSegment'],
    currency: read('currency') ?? null,
    riskCategory: read('riskCategory') as EvaluationsAnalyticsFiltersQuery['riskCategory'],
    insightStatus: read('insightStatus') as EvaluationsAnalyticsFiltersQuery['insightStatus'],
    dataQualityStatus: read('dataQualityStatus') as EvaluationsAnalyticsFiltersQuery['dataQualityStatus'],
  };
}

export function toAppliedFilters(
  resolved: ResolvedEvaluationsAnalyticsFilters,
): EvaluationsAnalyticsAppliedFilters {
  return {
    period: resolved.period,
    comparisonPeriod: resolved.comparisonPeriod,
    stationId: resolved.stationId,
    vehicleId: resolved.vehicleId,
    vehicleClassId: resolved.vehicleClassId,
    vehicleStatus: resolved.vehicleStatus,
    bookingStatus: resolved.bookingStatus,
    customerSegment: resolved.customerSegment,
    currency: resolved.currency,
    riskCategory: resolved.riskCategory,
    insightStatus: resolved.insightStatus,
    dataQualityStatus: resolved.dataQualityStatus,
  };
}

export function matchesResolvedInsightFilters(
  insight: InsightAnalyticsRow,
  resolved: ResolvedEvaluationsAnalyticsFilters,
): boolean {
  if (
    !matchesInsightAnalyticsFilters(insight, {
      category: resolved.riskCategory ?? undefined,
      severity: resolved.insightStatus ?? undefined,
      stationId: resolved.stationId,
      stationVehicleIds: resolved.stationVehicleIds,
      allowedStationIds: resolved.allowedStationIds,
    })
  ) {
    return false;
  }

  if (resolved.scopedVehicleIds && resolved.scopedVehicleIds.size > 0) {
    const refs = insight.entityReferences ?? [];
    const ids = insight.entityIds ?? [];
    const vehicleIds = new Set<string>();
    for (const ref of refs) {
      if (ref.entityType === 'VEHICLE') vehicleIds.add(ref.entityId);
    }
    for (const id of ids) vehicleIds.add(id);
    const affectedVehicleId =
      typeof insight.metrics?.affectedVehicleId === 'string'
        ? insight.metrics.affectedVehicleId
        : null;
    if (affectedVehicleId) vehicleIds.add(affectedVehicleId);

    if (vehicleIds.size === 0) return false;
    for (const id of vehicleIds) {
      if (resolved.scopedVehicleIds.has(id)) return true;
    }
    return false;
  }

  if (resolved.vehicleId) {
    const ids = insight.entityIds ?? [];
    const refs = insight.entityReferences ?? [];
    const hasVehicle =
      ids.includes(resolved.vehicleId) ||
      refs.some((r) => r.entityType === 'VEHICLE' && r.entityId === resolved.vehicleId);
    if (!hasVehicle) return false;
  }

  return true;
}

export function matchesDataQualityInsightFilter(
  insightStale: boolean,
  dataQualityStatus: ResolvedEvaluationsAnalyticsFilters['dataQualityStatus'],
): boolean {
  if (!dataQualityStatus) return true;
  if (dataQualityStatus === 'STALE') return insightStale;
  return true;
}

export function matchesRiskCategoryInsight(
  insight: InsightAnalyticsRow,
  riskCategory: ResolvedEvaluationsAnalyticsFilters['riskCategory'],
): boolean {
  if (!riskCategory) return true;
  return resolveInsightAnalyticsCategory(insight) === riskCategory;
}
