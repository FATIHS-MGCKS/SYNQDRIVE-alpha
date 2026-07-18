import { describe, expect, it } from 'vitest';
import {
  buildStationDetailSearch,
  normalizeStationDetailTab,
  parseStationDetailFromUrl,
  resolveVisibleStationDetailTabs,
  STATION_DETAIL_VIEW,
} from './station-detail-navigation';

describe('station-detail-navigation', () => {
  it('parses station detail deep links', () => {
    expect(
      parseStationDetailFromUrl(`?view=${STATION_DETAIL_VIEW}&stationId=st-1&stationTab=schedule`),
    ).toEqual({ stationId: 'st-1', tab: 'schedule' });
  });

  it('defaults invalid tabs to overview', () => {
    expect(
      parseStationDetailFromUrl(`?view=${STATION_DETAIL_VIEW}&stationId=st-1&stationTab=bookings`),
    ).toEqual({ stationId: 'st-1', tab: 'overview' });
  });

  it('builds search params for station detail', () => {
    expect(buildStationDetailSearch('st-2', 'operations', '?view=invoices')).toContain('stationId=st-2');
    expect(buildStationDetailSearch('st-2', 'operations', '?view=invoices')).toContain('stationTab=operations');
    expect(buildStationDetailSearch('st-2', 'operations', '?view=invoices')).toContain(`view=${STATION_DETAIL_VIEW}`);
  });

  it('resolves optional tabs from permissions and team wiring', () => {
    expect(
      resolveVisibleStationDetailTabs({ canViewActivity: false, teamWired: false }),
    ).toEqual(['overview', 'fleet', 'schedule', 'operations']);

    expect(
      resolveVisibleStationDetailTabs({ canViewActivity: true, teamWired: false }),
    ).toEqual(['overview', 'fleet', 'schedule', 'operations', 'activity']);
  });

  it('normalizes hidden tabs to the first visible tab', () => {
    const visible = resolveVisibleStationDetailTabs({ canViewActivity: false, teamWired: false });
    expect(normalizeStationDetailTab('activity', visible)).toBe('overview');
    expect(normalizeStationDetailTab('fleet', visible)).toBe('fleet');
  });
});
