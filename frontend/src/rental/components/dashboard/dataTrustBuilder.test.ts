import { describe, expect, it } from 'vitest';
import { attachKpiTrustHints, buildDataTrustLayer } from './dataTrustBuilder';
import { buildControlCenterKpis } from './dashboardUtils';
import type { VehicleTelemetryFreshness } from './controlSignalsBuilder';

const baseTelemetry: VehicleTelemetryFreshness = {
  totalInScope: 3,
  freshCount: 3,
  staleCount: 0,
  offlineCount: 0,
  unknownCount: 0,
  hasReliableTimestamps: true,
  syncStatus: 'live',
  lastRefreshLabel: 'Just now',
  telemetryUnavailable: false,
};

describe('buildDataTrustLayer', () => {
  it('marks booking domain as error when API fails', () => {
    const trust = buildDataTrustLayer({
      locale: 'en',
      orgActive: true,
      fleetLoading: false,
      fleetVehicleCount: 5,
      fleetCountdownSec: 30,
      telemetry: baseTelemetry,
      dataFreshness: {
        fleetLoading: false,
        fleetCountdownSec: 30,
        insightsLoading: false,
        insightsStale: false,
        insightsGeneratedAt: new Date().toISOString(),
        insightsError: false,
        todayBookingsLoaded: true,
        todayBookingsError: true,
        invoicesLoaded: true,
        invoicesError: false,
      },
      todayBookingsError: true,
      invoicesError: false,
      lastManualSyncAt: null,
    });

    const booking = trust.domains.find((d) => d.id === 'booking');
    expect(booking?.status).toBe('error');
    expect(booking?.computable).toBe(false);
    expect(trust.overallStatus).toBe('error');
  });

  it('reports telemetry unavailable without timestamps', () => {
    const trust = buildDataTrustLayer({
      locale: 'de',
      orgActive: true,
      fleetLoading: false,
      fleetVehicleCount: 2,
      fleetCountdownSec: 0,
      telemetry: {
        ...baseTelemetry,
        hasReliableTimestamps: false,
        telemetryUnavailable: true,
      },
      dataFreshness: {
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
      },
      todayBookingsError: false,
      invoicesError: false,
      lastManualSyncAt: null,
    });

    expect(trust.domains.find((d) => d.id === 'telemetry')?.status).toBe('unavailable');
    expect(trust.domains.find((d) => d.id === 'telemetry')?.timestampLabel).toContain('unbekannt');
  });

  it('attaches trust hints only when KPI basis is limited', () => {
    const trust = buildDataTrustLayer({
      locale: 'en',
      orgActive: true,
      fleetLoading: true,
      fleetVehicleCount: 0,
      fleetCountdownSec: 0,
      telemetry: baseTelemetry,
      dataFreshness: {
        fleetLoading: true,
        fleetCountdownSec: 0,
        insightsLoading: false,
        insightsStale: false,
        insightsGeneratedAt: new Date().toISOString(),
        insightsError: false,
        todayBookingsLoaded: false,
        todayBookingsError: false,
        invoicesLoaded: false,
        invoicesError: false,
      },
      todayBookingsError: false,
      invoicesError: false,
      lastManualSyncAt: null,
    });

    const kpis = attachKpiTrustHints(
      buildControlCenterKpis({
        locale: 'en',
        timeframe: 'today',
        todayBookingsLoaded: false,
        todayBookingsError: false,
        fleetLoaded: false,
        availableVehicles: [],
        activeRentedCount: 0,
        maintenanceCount: 0,
        pickupItems: [],
        returnItems: [],
        overdueReturns: 0,
        criticalAlerts: null,
        insightsLoaded: false,
      }),
      trust,
    );

    expect(kpis.find((k) => k.id === 'ready-to-rent')?.trustHint).toBe('partial-data');
    expect(kpis.find((k) => k.id === 'due-soon')?.trustHint).toBe('partial-data');
  });
});
