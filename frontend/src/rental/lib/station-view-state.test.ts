import { describe, expect, it } from 'vitest';
import { resolveStationApiError } from './station-api-error';
import {
  isStationDataStale,
  resolveStationContextBanners,
  resolveStationFetchState,
  resolveStationTabFetchState,
  StationViewStateKind,
} from './station-view-state';

describe('resolveStationApiError', () => {
  it('detects not found from status', () => {
    const err = Object.assign(new Error('Station missing'), { status: 404 });
    const info = resolveStationApiError(err, 'fallback');
    expect(info.isNotFound).toBe(true);
    expect(info.isPermissionDenied).toBe(false);
  });

  it('detects permission denied from status', () => {
    const err = Object.assign(new Error('Forbidden'), { status: 403 });
    const info = resolveStationApiError(err, 'fallback');
    expect(info.isPermissionDenied).toBe(true);
  });
});

describe('resolveStationFetchState', () => {
  const fallback = 'Failed';

  it('returns loading when loading without data', () => {
    expect(
      resolveStationFetchState({ loading: true, error: null, hasData: false, fallbackMessage: fallback }).kind,
    ).toBe(StationViewStateKind.LOADING);
  });

  it('returns api_error instead of empty when request failed', () => {
    const result = resolveStationFetchState({
      loading: false,
      error: new Error('Network'),
      hasData: false,
      fallbackMessage: fallback,
    });
    expect(result.kind).toBe(StationViewStateKind.API_ERROR);
  });

  it('returns empty only after successful fetch with no items', () => {
    const result = resolveStationFetchState({
      loading: false,
      error: null,
      hasData: false,
      fallbackMessage: fallback,
    });
    expect(result.kind).toBe(StationViewStateKind.EMPTY);
  });

  it('returns not_found for 404 errors', () => {
    const err = Object.assign(new Error('not found'), { status: 404 });
    const result = resolveStationFetchState({
      loading: false,
      error: err,
      hasData: false,
      fallbackMessage: fallback,
    });
    expect(result.kind).toBe(StationViewStateKind.NOT_FOUND);
  });
});

describe('resolveStationTabFetchState', () => {
  it('does not treat API errors as empty lists', () => {
    const result = resolveStationTabFetchState({
      loading: false,
      error: new Error('boom'),
      itemCount: 0,
      fallbackMessage: 'tab failed',
    });
    expect(result.kind).toBe(StationViewStateKind.API_ERROR);
    expect(result.isEmpty).toBeUndefined();
  });
});

describe('resolveStationContextBanners', () => {
  it('includes partial, stale, archived, and configuration banners', () => {
    const now = Date.parse('2026-07-18T12:00:00.000Z');
    const banners = resolveStationContextBanners({
      station: { status: 'ARCHIVED' },
      summary: {
        lifecycle: { archived: true, status: 'ARCHIVED' },
        configurationProblems: [{ code: 'MISSING_COORDINATES', message: 'Coordinates missing', severity: 'warning' }],
        partialData: {
          complete: false,
          unknownMetricNames: ['homeFleetCount'],
          reasons: [{ code: 'PARTIAL', message: 'Some KPIs unavailable' }],
        },
        lastCalculatedAt: '2026-07-18T11:00:00.000Z',
      } as never,
      nowMs: now,
    });
    expect(banners.map((banner) => banner.kind)).toEqual([
      'archived',
      'partial_data',
      'stale_data',
      'configuration_incomplete',
    ]);
  });
});

describe('isStationDataStale', () => {
  it('flags data older than threshold as stale', () => {
    const now = Date.parse('2026-07-18T12:10:00.000Z');
    expect(isStationDataStale('2026-07-18T12:00:00.000Z', now)).toBe(true);
    expect(isStationDataStale('2026-07-18T12:09:00.000Z', now)).toBe(false);
  });
});
