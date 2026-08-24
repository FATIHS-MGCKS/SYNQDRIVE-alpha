import { describe, expect, it } from 'vitest';
import type { DataFreshnessSummary } from './dashboardTypes';
import {
  deriveDataSyncStatus,
  isDashboardSyncStatusPending,
  resolveDashboardSyncBadge,
} from './dashboardUtils';

function freshness(overrides: Partial<DataFreshnessSummary> = {}): DataFreshnessSummary {
  return {
    fleetLoading: false,
    fleetCountdownSec: 0,
    insightsLoading: false,
    insightsStale: false,
    insightsGeneratedAt: null,
    insightsError: false,
    todayBookingsLoaded: true,
    todayBookingsError: false,
    invoicesLoaded: true,
    invoicesError: false,
    ...overrides,
  };
}

describe('dashboard sync badge resolution', () => {
  it('stays pending while org context is loading', () => {
    expect(
      resolveDashboardSyncBadge(freshness(), { orgLoading: true, orgActive: true }),
    ).toEqual({ phase: 'loading' });
  });

  it('stays pending while fleet or bookings are unresolved', () => {
    expect(
      isDashboardSyncStatusPending(freshness({ fleetLoading: true }), {
        orgLoading: false,
        orgActive: true,
      }),
    ).toBe(true);
    expect(
      isDashboardSyncStatusPending(freshness({ todayBookingsLoaded: false }), {
        orgLoading: false,
        orgActive: true,
      }),
    ).toBe(true);
    expect(
      isDashboardSyncStatusPending(freshness({ invoicesLoaded: false }), {
        orgLoading: false,
        orgActive: true,
      }),
    ).toBe(true);
  });

  it('does not show resolved live while data is still loading', () => {
    const badge = resolveDashboardSyncBadge(freshness({ insightsLoading: true }), {
      orgLoading: false,
      orgActive: true,
    });
    expect(badge).toEqual({ phase: 'loading' });
    expect(deriveDataSyncStatus(freshness({ insightsLoading: true }), true)).toBe('partial');
  });

  it('resolves live once all sources are loaded', () => {
    expect(
      resolveDashboardSyncBadge(freshness(), { orgLoading: false, orgActive: true }),
    ).toEqual({ phase: 'resolved', status: 'live' });
  });

  it('resolves offline immediately on authoritative errors', () => {
    expect(
      resolveDashboardSyncBadge(freshness({ todayBookingsError: true }), {
        orgLoading: false,
        orgActive: true,
      }),
    ).toEqual({ phase: 'resolved', status: 'offline' });
  });

  it('resolves stale when insights are stale and loaded', () => {
    expect(
      resolveDashboardSyncBadge(freshness({ insightsStale: true }), {
        orgLoading: false,
        orgActive: true,
      }),
    ).toEqual({ phase: 'resolved', status: 'stale' });
  });

  it('resolves offline when org is inactive', () => {
    expect(
      resolveDashboardSyncBadge(freshness(), { orgLoading: false, orgActive: false }),
    ).toEqual({ phase: 'resolved', status: 'offline' });
  });
});
