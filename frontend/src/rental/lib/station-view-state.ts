import type { Station, StationSummaryReadModel } from '../../lib/api';
import { resolveStationApiError, type StationApiErrorInfo } from './station-api-error';
import { getStationWarningsFromSummary } from './stationUtils';

/** Canonical blocking or overlay data states for station list/tab surfaces. */
export const StationViewStateKind = {
  LOADING: 'loading',
  EMPTY: 'empty',
  PERMISSION_DENIED: 'permission_denied',
  NOT_FOUND: 'not_found',
  API_ERROR: 'api_error',
  READY: 'ready',
} as const;

export type StationViewStateKind = (typeof StationViewStateKind)[keyof typeof StationViewStateKind];

export type StationContextBannerKind =
  | 'partial_data'
  | 'stale_data'
  | 'archived'
  | 'configuration_incomplete';

export type StationContextBanner = {
  kind: StationContextBannerKind;
  detail?: string;
  evaluatedAt?: string;
};

export type StationFetchResolution = {
  kind: StationViewStateKind;
  error?: StationApiErrorInfo;
  /** True when list/tab has zero items after a successful fetch. */
  isEmpty?: boolean;
};

export type StationPartialDataInfo = {
  complete: boolean;
  reasons: string[];
  unknownMetricNames: string[];
};

export const STATION_STALE_DATA_THRESHOLD_MS = 5 * 60 * 1000;

export function isStationDataStale(
  evaluatedAt: string | null | undefined,
  nowMs: number = Date.now(),
  thresholdMs: number = STATION_STALE_DATA_THRESHOLD_MS,
): boolean {
  if (!evaluatedAt) return false;
  const parsed = Date.parse(evaluatedAt);
  if (Number.isNaN(parsed)) return false;
  return nowMs - parsed > thresholdMs;
}

export function extractStationPartialData(
  partialData?: StationSummaryReadModel['partialData'] | null,
): StationPartialDataInfo | null {
  if (!partialData) return null;
  return {
    complete: partialData.complete,
    reasons: partialData.reasons?.map((reason) => reason.message).filter(Boolean) ?? [],
    unknownMetricNames: partialData.unknownMetricNames?.map(String) ?? [],
  };
}

export function isStationArchived(
  station?: Pick<Station, 'status'> | null,
  summary?: Pick<StationSummaryReadModel, 'lifecycle'> | null,
): boolean {
  return station?.status === 'ARCHIVED' || summary?.lifecycle.archived === true;
}

export function isStationConfigurationIncomplete(
  summary?: Pick<StationSummaryReadModel, 'configurationProblems'> | null,
  warningKeys?: string[],
): boolean {
  if ((summary?.configurationProblems?.length ?? 0) > 0) return true;
  return (warningKeys?.length ?? 0) > 0;
}

export function resolveStationFetchState(input: {
  loading: boolean;
  error: unknown | null;
  hasData: boolean;
  permissionDenied?: boolean;
  fallbackMessage: string;
}): StationFetchResolution {
  if (input.permissionDenied) {
    return { kind: StationViewStateKind.PERMISSION_DENIED };
  }
  if (input.loading && !input.hasData) {
    return { kind: StationViewStateKind.LOADING };
  }
  if (input.error && !input.hasData) {
    const apiError = resolveStationApiError(input.error, input.fallbackMessage);
    if (apiError.isNotFound) {
      return { kind: StationViewStateKind.NOT_FOUND, error: apiError };
    }
    if (apiError.isPermissionDenied) {
      return { kind: StationViewStateKind.PERMISSION_DENIED, error: apiError };
    }
    return { kind: StationViewStateKind.API_ERROR, error: apiError };
  }
  if (!input.loading && !input.error && !input.hasData) {
    return { kind: StationViewStateKind.EMPTY, isEmpty: true };
  }
  return { kind: StationViewStateKind.READY };
}

export function resolveStationTabFetchState(input: {
  loading: boolean;
  error: unknown | null;
  itemCount: number;
  fallbackMessage: string;
}): StationFetchResolution {
  const hasData = input.itemCount > 0;
  const base = resolveStationFetchState({
    loading: input.loading,
    error: input.error,
    hasData,
    fallbackMessage: input.fallbackMessage,
  });
  if (base.kind === StationViewStateKind.READY && !hasData && !input.loading && !input.error) {
    return { kind: StationViewStateKind.EMPTY, isEmpty: true };
  }
  return base;
}

export function resolveStationContextBanners(input: {
  station?: Pick<Station, 'status'> | null;
  summary?: StationSummaryReadModel | null;
  evaluatedAt?: string | null;
  partialData?: StationPartialDataInfo | null;
  nowMs?: number;
}): StationContextBanner[] {
  const banners: StationContextBanner[] = [];
  const warningKeys = input.summary ? getStationWarningsFromSummary(input.summary) : [];
  const partialData =
    input.partialData ?? extractStationPartialData(input.summary?.partialData);

  if (isStationArchived(input.station, input.summary)) {
    banners.push({ kind: 'archived' });
  }

  if (partialData && !partialData.complete) {
    const detail = [
      ...partialData.reasons,
      partialData.unknownMetricNames.length > 0
        ? partialData.unknownMetricNames.join(', ')
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    banners.push({ kind: 'partial_data', detail: detail || undefined });
  }

  const staleAt = input.evaluatedAt ?? input.summary?.lastCalculatedAt ?? null;
  if (isStationDataStale(staleAt, input.nowMs)) {
    banners.push({ kind: 'stale_data', evaluatedAt: staleAt ?? undefined });
  }

  if (isStationConfigurationIncomplete(input.summary, warningKeys)) {
    banners.push({ kind: 'configuration_incomplete' });
  }

  return banners;
}
