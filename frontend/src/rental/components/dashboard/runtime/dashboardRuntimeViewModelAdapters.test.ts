import { describe, expect, it } from 'vitest';
import type { DashboardInsight } from '../../../DashboardInsightsContext';
import type { VehicleData } from '../../../data/vehicles';
import type { DashboardInvoice, DataFreshnessSummary } from '../dashboardTypes';
import { buildBusinessPulseSlices } from './businessPulseSliceBuilder';
import { buildDashboardRuntimeModel } from './dashboardSliceBuilder';
import {
  buildRuntimeBusinessPulseSnapshot,
  buildRuntimeControlCenterKpis,
  buildRuntimeDashboardDrilldown,
  buildRuntimeFleetBoard,
} from './dashboardRuntimeViewModelAdapters';

const NOW = new Date('2026-06-24T10:00:00.000Z');

function hoursAgoIso(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60_000).toISOString();
}

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS-FS 123',
    make: overrides.make ?? 'VW',
    model: overrides.model ?? 'Golf',
    year: overrides.year ?? 2024,
    station: overrides.station ?? 'Zentrale',
    stationId: overrides.stationId ?? 'st-1',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? 'Available',
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? hoursAgoIso(1),
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 10000,
    fuel: overrides.fuel ?? 72,
    battery: overrides.battery ?? 100,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 90,
    brakes: overrides.brakes ?? 90,
    tires: overrides.tires ?? 90,
    engineOil: overrides.engineOil ?? 90,
    isElectric: overrides.isElectric ?? false,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? null,
    isFresh: overrides.isFresh ?? false,
    onlineStatus: overrides.onlineStatus ?? 'STANDBY',
    leasingRate: overrides.leasingRate ?? '',
    insuranceCost: overrides.insuranceCost ?? '',
    taxCost: overrides.taxCost ?? '',
    totalMonthlyCost: overrides.totalMonthlyCost ?? '',
    ...overrides,
  };
}

function insight(overrides: Partial<DashboardInsight> = {}): DashboardInsight {
  return {
    id: overrides.id ?? 'insight-1',
    type: overrides.type ?? 'BATTERY_CRITICAL',
    severity: overrides.severity ?? 'CRITICAL',
    priority: overrides.priority ?? 100,
    title: overrides.title ?? 'Battery critical',
    message: overrides.message ?? 'Battery needs action',
    actionLabel: overrides.actionLabel ?? null,
    actionType: overrides.actionType ?? null,
    entityScope: overrides.entityScope ?? 'vehicle',
    entityIds: overrides.entityIds ?? ['v1'],
    timeContext: overrides.timeContext ?? null,
    metrics: overrides.metrics ?? null,
    reasons: overrides.reasons ?? null,
    isGrouped: overrides.isGrouped ?? false,
    groupCount: overrides.groupCount ?? 1,
    createdAt: overrides.createdAt ?? NOW.toISOString(),
    ...overrides,
  };
}

function invoice(overrides: Partial<DashboardInvoice> = {}): DashboardInvoice {
  return {
    id: overrides.id ?? 'inv-1',
    type: overrides.type ?? 'OUTGOING_BOOKING',
    status: overrides.status ?? 'OPEN',
    totalCents: overrides.totalCents ?? 10000,
    currency: overrides.currency ?? 'EUR',
    invoiceDate: overrides.invoiceDate ?? NOW.toISOString(),
    dueDate: overrides.dueDate ?? new Date(NOW.getTime() + 24 * 60 * 60_000).toISOString(),
    paidAt: overrides.paidAt ?? null,
    createdAt: overrides.createdAt ?? NOW.toISOString(),
    vehicleId: overrides.vehicleId ?? null,
    customerId: overrides.customerId ?? null,
  };
}

const dataFreshness: DataFreshnessSummary = {
  fleetLoading: false,
  fleetCountdownSec: 0,
  insightsLoading: false,
  insightsStale: false,
  insightsGeneratedAt: NOW.toISOString(),
  insightsError: false,
  todayBookingsLoaded: true,
  todayBookingsError: false,
  invoicesLoaded: true,
  invoicesError: false,
};

describe('dashboard runtime view-model adapters', () => {
  it('keeps ready KPI, drawer groups and board ready lane on the same runtime source', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'ready', license: 'READY' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
        vehicle({ id: 'health-risk', license: 'HEALTH' }),
        vehicle({ id: 'blocked', license: 'BLOCKED' }),
      ],
      healthRiskVehicleIds: new Set(['health-risk']),
      blockedVehicleIds: new Set(['blocked']),
      now: NOW,
    });
    const kpis = buildRuntimeControlCenterKpis({
      runtime,
      locale: 'en',
      insightsLoading: false,
      insightsError: false,
    });
    const fleetBoard = buildRuntimeFleetBoard({
      runtime,
      vehicles: runtime.vehicleStates.map((state) => vehicle({ id: state.vehicleId, license: state.license })),
      locale: 'en',
      filter: 'all',
    });
    const drilldown = buildRuntimeDashboardDrilldown({
      runtime,
      businessSlices: {},
      fleetBoard,
      actionQueue: [],
      actionQueueLoading: false,
      target: { type: 'kpi', target: 'ready-to-rent' },
      locale: 'en',
      selectedStationName: null,
      dataFreshness,
    });

    expect(kpis.find((kpi) => kpi.id === 'ready-to-rent')?.numericValue).toBe(1);
    expect(kpis.find((kpi) => kpi.id === 'ready-to-rent')?.hint).toBe('4 available · 3 not ready');
    expect(drilldown.rows).toHaveLength(1);
    expect(drilldown.groups?.find((group) => group.id === 'ready-now')?.count).toBe(1);
    expect(drilldown.groups?.find((group) => group.id === 'available-but-not-ready')?.count).toBe(3);
    expect(fleetBoard.lanes.find((lane) => lane.lane === 'ready')?.count).toBe(1);
  });

  it('shows a hard-blocked available vehicle as blocked, not maintenance', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'critical-available', license: 'CRIT', status: 'Available' })],
      insights: [
        insight({
          id: 'critical-insight',
          type: 'BATTERY_CRITICAL',
          severity: 'CRITICAL',
          title: 'Battery critical',
          entityIds: ['critical-available'],
        }),
      ],
      now: NOW,
    });
    const board = buildRuntimeFleetBoard({
      runtime,
      vehicles: [vehicle({ id: 'critical-available', license: 'CRIT', status: 'Available' })],
      locale: 'en',
      filter: 'all',
    });

    expect(runtime.vehicleStates[0]?.operationalStatus).toBe('available');
    expect(runtime.slices['blocked-maintenance'].count).toBe(1);
    expect(board.items[0]?.lane).toBe('blocked');
    expect(board.items[0]?.statusLabel).toBe('Blocked');
  });

  it('keeps warning-only available vehicles out of blocked-maintenance and in attention', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'warning-only', license: 'WARN', status: 'Available' })],
      insights: [
        insight({
          id: 'warning-insight',
          type: 'SERVICE_WINDOW',
          severity: 'WARNING',
          title: 'Service soon',
          entityIds: ['warning-only'],
        }),
      ],
      now: NOW,
    });
    const board = buildRuntimeFleetBoard({
      runtime,
      vehicles: [vehicle({ id: 'warning-only', license: 'WARN', status: 'Available' })],
      locale: 'en',
      filter: 'all',
    });

    expect(runtime.vehicleStates[0]?.isWarning).toBe(true);
    expect(runtime.vehicleStates[0]?.isBlocked).toBe(false);
    expect(runtime.slices['blocked-maintenance'].count).toBe(0);
    expect(board.items[0]?.lane).toBe('attention');
  });

  it('keeps business pulse drilldowns financial and separated from fleet status', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'en',
      now: NOW,
      invoices: [
        invoice({ id: 'open', status: 'OPEN', totalCents: 10000 }),
        invoice({
          id: 'overdue',
          status: 'OPEN',
          totalCents: 20000,
          dueDate: new Date(NOW.getTime() - 24 * 60 * 60_000).toISOString(),
        }),
        invoice({ id: 'paid', status: 'PAID', paidAt: NOW.toISOString(), totalCents: 30000 }),
        invoice({ id: 'expense', type: 'INCOMING_VENDOR', status: 'OPEN', totalCents: 5000 }),
      ],
    });
    const runtime = buildDashboardRuntimeModel({ locale: 'en', fleetVehicles: [], now: NOW });
    const snapshot = buildRuntimeBusinessPulseSnapshot({
      slices,
      locale: 'en',
      intlLocale: 'en-US',
      invoicesLoaded: true,
      invoicesError: false,
      stationScoped: false,
      fmtEUR: (cents) => `${cents}`,
      labels: {
        revenue: 'Revenue',
        profit: 'Profit',
        expenses: 'Expenses',
        unpaid: 'Open receivables',
        lostRevenueRisk: 'Overdue receivables',
        invoicesShort: (count) => `${count} invoices`,
        emptyTitle: 'No financial data',
        emptySubtitle: 'No financial data yet',
      },
    });
    const openDrawer = buildRuntimeDashboardDrilldown({
      runtime,
      businessSlices: slices,
      fleetBoard: { items: [], filteredItems: [], lanes: [] },
      actionQueue: [],
      actionQueueLoading: false,
      target: { type: 'business-metric', metricId: 'open-receivables' },
      locale: 'en',
      selectedStationName: null,
      dataFreshness,
    });
    const overdueDrawer = buildRuntimeDashboardDrilldown({
      runtime,
      businessSlices: slices,
      fleetBoard: { items: [], filteredItems: [], lanes: [] },
      actionQueue: [],
      actionQueueLoading: false,
      target: { type: 'business-metric', metricId: 'overdue-receivables' },
      locale: 'en',
      selectedStationName: null,
      dataFreshness,
    });

    expect(snapshot.compact.openReceivables.value).toBe('10000');
    expect(snapshot.compact.overdueReceivables.value).toBe('20000');
    expect(snapshot.compact.expenses?.value).toBe('5000');
    expect(openDrawer.rows.map((row) => row.invoiceId)).toEqual(['open']);
    expect(overdueDrawer.rows.map((row) => row.invoiceId)).toEqual(['overdue']);
    expect([...openDrawer.rows, ...overdueDrawer.rows].some((row) => /ready|blocked|maintenance/i.test(row.title))).toBe(false);
  });
});
