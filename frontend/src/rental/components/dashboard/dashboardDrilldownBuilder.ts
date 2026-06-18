import type { VehicleHealthAlert } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import {
  expensesInRange,
  issuedRevenueInRange,
  openOutgoingReceivables,
  overdueOutgoingReceivables,
  type InvoiceSlice,
} from '../../lib/financial-insights.logic';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type {
  ActionQueueItem,
  DashboardInvoice,
  DataFreshnessSummary,
  FleetBoardItem,
  FleetBoardLane,
  FleetBoardModel,
  NowNextTimelineModel,
  OperationalKpiTarget,
  StationHealthSummary,
} from './dashboardTypes';
import { getDuePickups, getOverdueReturns } from './dashboardFocusMode';
import { severityChipTone } from './fleetStateBuilder';
import { filterActionQueue } from './actionQueueBuilder';
import type {
  DashboardDrilldownContent,
  DashboardDrilldownRow,
  DashboardDrilldownTarget,
  StationDrilldownMetric,
} from './dashboardDrilldownTypes';

export interface DashboardDrilldownBuildInput {
  locale: string;
  selectedStationName: string | null;
  fleetBoard: FleetBoardModel;
  filteredFleetVehicles: VehicleData[];
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  actionQueue: ActionQueueItem[];
  actionQueueLoading: boolean;
  vehicleHealthAlerts: VehicleHealthAlert[];
  invoices: DashboardInvoice[];
  invoicesLoaded: boolean;
  invoicesError: boolean;
  nowNextTimeline: NowNextTimelineModel;
  stationHealth: StationHealthSummary[];
  dataFreshness: DataFreshnessSummary;
  filteredVehicleIds: Set<string>;
}

function de(locale: string): boolean {
  return locale === 'de';
}

function vehicleRows(items: FleetBoardItem[]): DashboardDrilldownRow[] {
  return items.map((item) => ({
    id: `vehicle-${item.vehicleId}`,
    title: item.license,
    subtitle: [item.makeModel, item.station].filter(Boolean).join(' · ') || undefined,
    meta: item.criticalHint || item.statusLabel,
    tone: severityChipTone(item.severity),
    cta: 'open-vehicle',
    vehicleId: item.vehicleId,
  }));
}

function pickupRows(items: PickupTileItem[], locale: string): DashboardDrilldownRow[] {
  const isDe = de(locale);
  return items.map((p) => ({
    id: `pickup-${p.bookingId ?? p.plate}`,
    title: p.plate || p.vehicle,
    subtitle: p.customer,
    meta: p.isOverdue
      ? isDe
        ? 'Überfällig'
        : 'Overdue'
      : `${p.time} · ${p.station}`,
    tone: p.isOverdue ? 'critical' : 'watch',
    cta: 'start-handover-pickup',
    vehicleId: p.vehicleId || undefined,
    bookingId: p.bookingId,
    pickupItem: p,
  }));
}

function returnRows(items: ReturnTileItem[], locale: string): DashboardDrilldownRow[] {
  const isDe = de(locale);
  return items.map((r) => ({
    id: `return-${r.bookingId ?? r.plate}`,
    title: r.plate || r.vehicle,
    subtitle: r.customer,
    meta: r.isOverdue
      ? isDe
        ? 'Überfällig'
        : 'Overdue'
      : `${r.time} · ${r.station}`,
    tone: r.isOverdue || r.hasError ? 'critical' : 'watch',
    cta: 'start-handover-return',
    vehicleId: r.vehicleId || undefined,
    bookingId: r.bookingId,
    returnItem: r,
  }));
}

function actionRows(items: ActionQueueItem[]): DashboardDrilldownRow[] {
  return items.map((item) => ({
    id: `action-${item.id}`,
    title: item.title,
    subtitle: item.entityLabel,
    meta: item.reason,
    tone: item.tone,
    cta:
      item.cta === 'start-handover-pickup'
        ? 'start-handover-pickup'
        : item.cta === 'start-handover-return'
          ? 'start-handover-return'
          : item.cta === 'open-vehicle'
            ? 'open-vehicle'
            : item.cta === 'open-booking'
              ? 'open-booking'
              : item.cta === 'open-stations'
                ? 'open-stations'
                : 'open-rental',
    vehicleId: item.vehicleId,
    bookingId: item.bookingId,
    pickupItem: item.pickupItem,
    returnItem: item.returnItem,
    actionItem: item,
  }));
}

function alertRowsFromHealth(
  alerts: VehicleHealthAlert[],
  locale: string,
): DashboardDrilldownRow[] {
  return alerts.map((a) => ({
    id: `health-${a.vehicleId}`,
    title: a.license || a.model || a.vehicleId,
    subtitle: a.primaryReason,
    meta: a.secondaryReasons.slice(0, 2).join(' · ') || undefined,
    tone: a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'watch' : 'info',
    cta: 'open-vehicle',
    vehicleId: a.vehicleId,
  }));
}

function timelineRows(timeline: NowNextTimelineModel): DashboardDrilldownRow[] {
  const flat = [
    ...timeline.lanes.now,
    ...timeline.lanes.next60,
    ...timeline.lanes['later-today'],
    ...timeline.lanes.tomorrow,
  ];
  return flat
    .filter((i) => !i.completed)
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((item) => ({
      id: `timeline-${item.id}`,
      title: item.vehicleLabel,
      subtitle: item.customer,
      meta: `${item.timeLabel} · ${item.type}`,
      tone: item.tone,
      cta:
        item.cta === 'start-pickup'
          ? 'start-handover-pickup'
          : item.cta === 'start-return'
            ? 'start-handover-return'
            : item.cta === 'open-booking'
              ? 'open-booking'
              : item.cta === 'open-vehicle'
                ? 'open-vehicle'
                : 'open-rental',
      vehicleId: item.vehicleId,
      bookingId: item.bookingId,
      pickupItem: item.pickupItem,
      returnItem: item.returnItem,
    }));
}

function invoiceRows(invoices: DashboardInvoice[], locale: string, fmt: (c: number) => string): DashboardDrilldownRow[] {
  return invoices.map((inv) => ({
    id: `invoice-${inv.id}`,
    title: inv.type.replace(/_/g, ' '),
    subtitle: inv.invoiceDate || inv.createdAt || undefined,
    meta: inv.totalCents != null ? fmt(inv.totalCents) : undefined,
    tone: inv.status === 'OVERDUE' ? 'critical' : 'info',
    cta: 'open-invoice',
    invoiceId: inv.id,
  }));
}

function vehiclesAtStation(vehicles: VehicleData[], stationId: string): VehicleData[] {
  return vehicles.filter(
    (v) =>
      v.stationId === stationId ||
      v.homeStationId === stationId ||
      v.currentStationId === stationId,
  );
}

function buildKpiDrilldown(
  input: DashboardDrilldownBuildInput,
  target: OperationalKpiTarget,
): DashboardDrilldownContent {
  const isDe = de(input.locale);
  const scope = input.selectedStationName ?? (isDe ? 'Alle Stationen' : 'All stations');

  switch (target) {
    case 'ready-to-rent': {
      const items = input.fleetBoard.items.filter((i) => i.lane === 'ready');
      return {
        listKind: 'vehicles',
        title: isDe ? 'Bereit zur Vermietung' : 'Ready to rent',
        filterLabel: scope,
        description: isDe ? `${items.length} Fahrzeuge` : `${items.length} vehicles`,
        rows: vehicleRows(items),
        loading: input.dataFreshness.fleetLoading,
      };
    }
    case 'active-rented': {
      const items = input.fleetBoard.items.filter((i) => i.lane === 'rented');
      return {
        listKind: 'vehicles',
        title: isDe ? 'Aktiv vermietet' : 'Active rented',
        filterLabel: scope,
        rows: vehicleRows(items),
        loading: input.dataFreshness.fleetLoading,
      };
    }
    case 'maintenance': {
      const items = input.fleetBoard.items.filter(
        (i) => i.lane === 'maintenance' || i.lane === 'critical',
      );
      return {
        listKind: 'vehicles',
        title: isDe ? 'Wartung & blockiert' : 'Maintenance & blocked',
        filterLabel: scope,
        rows: vehicleRows(items),
        loading: input.dataFreshness.fleetLoading,
      };
    }
    case 'overdue-returns': {
      const rows = returnRows(getOverdueReturns(input.returnItems), input.locale);
      return {
        listKind: 'bookings',
        title: isDe ? 'Überfällige Returns' : 'Overdue returns',
        filterLabel: scope,
        rows,
        loading: !input.dataFreshness.todayBookingsLoaded,
        error: input.dataFreshness.todayBookingsLoaded ? undefined : isDe ? 'Buchungen laden…' : 'Loading bookings…',
      };
    }
    case 'due-soon': {
      const pickups = getDuePickups(input.pickupItems, 60);
      const timeline = timelineRows(input.nowNextTimeline).slice(0, 20);
      const bookingRows = pickupRows(pickups, input.locale);
      const combined = [...bookingRows, ...timeline.filter((t) => !bookingRows.some((b) => b.id === t.id))];
      return {
        listKind: 'timeline',
        title: isDe ? 'Fällig in Kürze' : 'Due soon',
        filterLabel: scope,
        description: isDe ? 'Pickups <60 Min. & Timeline' : 'Pickups <60 min & timeline',
        rows: combined,
        loading: !input.dataFreshness.todayBookingsLoaded,
      };
    }
    case 'critical-alerts': {
      const criticalQueue = filterActionQueue(input.actionQueue, 'critical');
      const healthCritical = input.vehicleHealthAlerts.filter((a) => a.severity === 'critical');
      const rows = [
        ...actionRows(criticalQueue),
        ...alertRowsFromHealth(
          healthCritical.filter((a) => !criticalQueue.some((q) => q.vehicleId === a.vehicleId)),
          input.locale,
        ),
      ];
      return {
        listKind: 'alerts',
        title: isDe ? 'Kritische Alerts' : 'Critical alerts',
        filterLabel: scope,
        rows,
        loading: input.actionQueueLoading,
        error: input.dataFreshness.insightsError
          ? isDe
            ? 'Insights teilweise nicht verfügbar'
            : 'Insights partially unavailable'
          : undefined,
      };
    }
    default:
      return {
        listKind: 'alerts',
        title: '—',
        filterLabel: scope,
        rows: [],
        loading: false,
      };
  }
}

function buildFleetLaneDrilldown(
  input: DashboardDrilldownBuildInput,
  lane: FleetBoardLane,
): DashboardDrilldownContent {
  const isDe = de(input.locale);
  const laneMeta = input.fleetBoard.lanes.find((l) => l.lane === lane);
  const items =
    lane === 'all' ? input.fleetBoard.items : input.fleetBoard.items.filter((i) => i.lane === lane);

  return {
    listKind: 'vehicles',
    title: laneMeta?.label ?? (isDe ? 'Flotte' : 'Fleet'),
    filterLabel: input.selectedStationName ?? (isDe ? 'Alle Stationen' : 'All stations'),
    description: `${items.length} ${isDe ? 'Fahrzeuge' : 'vehicles'}`,
    rows: vehicleRows(items),
    loading: input.dataFreshness.fleetLoading,
  };
}

function handoversAtStation(
  pickups: PickupTileItem[],
  returns: ReturnTileItem[],
  stationName: string,
): { pickups: PickupTileItem[]; returns: ReturnTileItem[] } {
  return {
    pickups: pickups.filter((p) => p.station === stationName),
    returns: returns.filter((r) => r.station === stationName),
  };
}

function stationVehicleIds(stationId: string, vehicles: VehicleData[]): Set<string> {
  return new Set(vehiclesAtStation(vehicles, stationId).map((v) => v.id));
}

function buildStationMetricDrilldown(
  input: DashboardDrilldownBuildInput,
  stationId: string,
  metric: StationDrilldownMetric,
): DashboardDrilldownContent {
  const isDe = de(input.locale);
  const station = input.stationHealth.find((s) => s.stationId === stationId);
  const stationName = station?.stationName ?? stationId;
  const ids = stationVehicleIds(stationId, input.filteredFleetVehicles);
  const boardItems = input.fleetBoard.items.filter((i) => ids.has(i.vehicleId));
  const { pickups: stationPickups, returns: stationReturns } = handoversAtStation(
    input.pickupItems,
    input.returnItems,
    stationName,
  );

  let rows: DashboardDrilldownRow[] = [];
  let listKind: DashboardDrilldownContent['listKind'] = 'vehicles';
  let title = stationName;

  if (metric === 'pickups') {
    listKind = 'bookings';
    title = `${stationName} · Pickups`;
    rows = pickupRows(stationPickups.filter((p) => !p.done), input.locale);
  } else if (metric === 'returns') {
    listKind = 'bookings';
    title = `${stationName} · Returns`;
    rows = returnRows(stationReturns.filter((r) => !r.done), input.locale);
  } else if (metric === 'overdue') {
    listKind = 'bookings';
    title = isDe ? `${stationName} · Überfällig` : `${stationName} · Overdue`;
    rows = [
      ...pickupRows(stationPickups.filter((p) => p.isOverdue && !p.done), input.locale),
      ...returnRows(getOverdueReturns(stationReturns), input.locale),
    ];
  } else if (metric === 'critical') {
    listKind = 'alerts';
    title = isDe ? `${stationName} · Kritisch` : `${stationName} · Critical`;
    rows = alertRowsFromHealth(
      input.vehicleHealthAlerts.filter((a) => a.severity === 'critical' && ids.has(a.vehicleId)),
      input.locale,
    );
  } else if (metric === 'due-today') {
    listKind = 'bookings';
    title = isDe ? `${stationName} · Heute fällig` : `${stationName} · Due today`;
    rows = [
      ...pickupRows(stationPickups.filter((p) => !p.done), input.locale),
      ...returnRows(stationReturns.filter((r) => !r.done), input.locale),
    ];
    return {
      listKind,
      title,
      filterLabel: stationName,
      rows,
      loading: !input.dataFreshness.todayBookingsLoaded,
    };
  } else {
    let filtered = boardItems;
    if (metric === 'ready') {
      filtered = boardItems.filter((i) => i.lane === 'ready');
    } else if (metric === 'rented') {
      filtered = boardItems.filter((i) => i.lane === 'rented');
    } else if (metric === 'blocked') {
      filtered = boardItems.filter((i) => i.lane === 'maintenance' || i.lane === 'critical');
    }
    rows = vehicleRows(filtered);
  }

  return {
    listKind,
    title,
    filterLabel: stationName,
    rows,
    loading: input.dataFreshness.fleetLoading,
  };
}

function buildBusinessMetricDrilldown(
  input: DashboardDrilldownBuildInput,
  metricId: string,
): DashboardDrilldownContent {
  const isDe = de(input.locale);
  const scope = input.selectedStationName ?? (isDe ? 'Organisation' : 'Organization');
  const scoped = input.filteredVehicleIds.size
    ? input.invoices.filter((inv) => inv.vehicleId && input.filteredVehicleIds.has(inv.vehicleId))
    : input.invoices;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fmt = (cents: number) =>
    new Intl.NumberFormat(input.locale === 'de' ? 'de-DE' : 'en-US', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100);

  let rows: DashboardDrilldownRow[] = [];
  let title = metricId;

  if (metricId === 'unpaid' || metricId === 'lost-revenue-risk') {
    const list =
      metricId === 'lost-revenue-risk'
        ? overdueOutgoingReceivables(scoped as InvoiceSlice[], now)
        : openOutgoingReceivables(scoped as InvoiceSlice[], now);
    title =
      metricId === 'lost-revenue-risk'
        ? isDe
          ? 'Überfällige Forderungen'
          : 'Overdue receivables'
        : isDe
          ? 'Offene Forderungen'
          : 'Open receivables';
    rows = invoiceRows(list as DashboardInvoice[], input.locale, fmt);
  } else if (metricId === 'revenue' || metricId === 'profit' || metricId === 'revenue-per-vehicle') {
    title =
      metricId === 'profit'
        ? isDe
          ? 'Ergebnis (MTD)'
          : 'Profit (MTD)'
        : isDe
          ? 'Umsatz (MTD)'
          : 'Revenue (MTD)';
    rows = invoiceRows(issuedRevenueInRange(scoped as InvoiceSlice[], monthStart, now) as DashboardInvoice[], input.locale, fmt);
  } else if (metricId === 'utilization') {
    title = isDe ? 'Aktiv vermietet' : 'Active rented';
    const items = input.fleetBoard.items.filter((i) => i.lane === 'rented');
    return {
      listKind: 'vehicles',
      title,
      filterLabel: scope,
      rows: vehicleRows(items),
      loading: input.dataFreshness.fleetLoading,
    };
  } else if (metricId === 'expenses') {
    title = isDe ? 'Ausgaben (MTD)' : 'Expenses (MTD)';
    rows = invoiceRows(expensesInRange(scoped as InvoiceSlice[], monthStart, now) as DashboardInvoice[], input.locale, fmt);
  } else {
    title = isDe ? 'Finanzübersicht' : 'Financial overview';
    rows = invoiceRows(scoped.slice(0, 25), input.locale, fmt);
  }

  return {
    listKind: 'financial',
    title,
    filterLabel: scope,
    rows,
    loading: !input.invoicesLoaded,
    error: input.invoicesError
      ? isDe
        ? 'Rechnungen nicht verfügbar'
        : 'Invoices unavailable'
      : undefined,
    footerAction: 'open-finance',
  };
}

function buildActionItemDrilldown(
  input: DashboardDrilldownBuildInput,
  itemId: string,
): DashboardDrilldownContent {
  const isDe = de(input.locale);
  const item = input.actionQueue.find((i) => i.id === itemId);
  if (!item) {
    return {
      listKind: 'alerts',
      title: isDe ? 'Aktion' : 'Action',
      filterLabel: '—',
      rows: [],
      loading: false,
    };
  }

  const related = input.actionQueue
    .filter(
      (i) =>
        i.id !== item.id &&
        ((item.vehicleId && i.vehicleId === item.vehicleId) ||
          (item.bookingId && i.bookingId === item.bookingId)),
    )
    .slice(0, 5);

  return {
    listKind: 'alerts',
    title: item.title,
    filterLabel: input.selectedStationName ?? (isDe ? 'Alle Stationen' : 'All stations'),
    description: item.reason,
    rows: [...actionRows([item]), ...actionRows(related)],
    loading: input.actionQueueLoading,
  };
}

export function buildDashboardDrilldown(
  input: DashboardDrilldownBuildInput,
  target: DashboardDrilldownTarget,
): DashboardDrilldownContent {
  switch (target.type) {
    case 'kpi':
      return buildKpiDrilldown(input, target.target);
    case 'action-item':
      return buildActionItemDrilldown(input, target.itemId);
    case 'fleet-lane':
      return buildFleetLaneDrilldown(input, target.lane);
    case 'station-metric':
      return buildStationMetricDrilldown(input, target.stationId, target.metric);
    case 'business-metric':
      return buildBusinessMetricDrilldown(input, target.metricId);
    default:
      return {
        listKind: 'alerts',
        title: '—',
        filterLabel: '—',
        rows: [],
        loading: false,
      };
  }
}
