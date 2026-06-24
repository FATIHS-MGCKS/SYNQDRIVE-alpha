import type { StatusTone } from '../../../../components/patterns';
import {
  formatFleetDateTime,
  formatFuelPercentCeil,
} from '../../../../lib/formatVehicleDisplay';
import { resolveTelemetryFreshness } from '../../../lib/telemetryFreshness';
import type { VehicleData } from '../../../data/vehicles';
import type {
  ActionQueueItem,
  BusinessPulseSnapshot,
  ControlCenterKpi,
  DataFreshnessSummary,
  FleetBoardItem,
  FleetBoardLane,
  FleetBoardLaneSummary,
  FleetBoardModel,
  FleetBoardSeverity,
  FleetStateTab,
} from '../dashboardTypes';
import type {
  DashboardDrilldownContent,
  DashboardDrilldownGroup,
  DashboardDrilldownRow,
  DashboardDrilldownTarget,
} from '../dashboardDrilldownTypes';
import type {
  BusinessMetricId,
  BusinessPulseRow,
  BusinessPulseSlice,
  DashboardRuntimeModel,
  DashboardSlice,
  DashboardSliceId,
  DashboardSliceRow,
  VehicleRuntimeState,
} from './dashboardRuntimeTypes';

function sliceValue(slice: BusinessPulseSlice | undefined): number {
  return slice?.valueCents ?? 0;
}

function money(valueCents: number, fmtEUR: (cents: number) => string): string {
  return fmtEUR(valueCents);
}

function compactMetric(input: {
  id: string;
  label: string;
  value: string;
  hint?: string;
  available: boolean;
  emphasize?: boolean;
}) {
  return {
    id: input.id,
    label: input.label,
    value: input.value,
    hint: input.hint,
    available: input.available,
    emphasize: input.emphasize,
  };
}

export function buildRuntimeBusinessPulseSnapshot(input: {
  slices: Record<BusinessMetricId, BusinessPulseSlice>;
  locale: string;
  intlLocale: string;
  invoicesLoaded: boolean;
  invoicesError: boolean;
  stationScoped: boolean;
  fmtEUR: (cents: number) => string;
  labels: {
    revenue: string;
    profit: string;
    expenses: string;
    unpaid: string;
    lostRevenueRisk: string;
    invoicesShort: (count: number) => string;
    emptyTitle: string;
    emptySubtitle: string;
  };
}): BusinessPulseSnapshot {
  const deLocale = de(input.locale);
  const revenue = input.slices.revenue;
  const profit = input.slices.profit;
  const openReceivables = input.slices['open-receivables'];
  const overdueReceivables = input.slices['overdue-receivables'];
  const expenses = input.slices.expenses;
  const hasFinancialData =
    (revenue.count ?? 0) > 0 ||
    (expenses.count ?? 0) > 0 ||
    (openReceivables.count ?? 0) > 0 ||
    (overdueReceivables.count ?? 0) > 0;
  const monthLabel = new Date().toLocaleDateString(input.intlLocale, { month: 'long', year: 'numeric' });

  const metricItems = (rows: BusinessPulseRow[]) => rows.length;

  return {
    loading: !input.invoicesLoaded,
    error: input.invoicesError,
    stationScoped: input.stationScoped,
    monthLabel,
    hasFinancialData,
    primaryMetrics: [],
    secondaryMetrics: [],
    compact: {
      monthLabel,
      invoiceCount: metricItems(revenue.rows),
      revenue: compactMetric({
        id: 'revenue',
        label: input.labels.revenue,
        value: hasFinancialData ? money(sliceValue(revenue), input.fmtEUR) : deLocale ? 'Noch kein Umsatz' : 'No revenue yet',
        hint: hasFinancialData ? input.labels.invoicesShort(revenue.count ?? 0) : undefined,
        available: hasFinancialData,
      }),
      profit: compactMetric({
        id: 'profit',
        label: input.labels.profit,
        value: hasFinancialData ? money(sliceValue(profit), input.fmtEUR) : deLocale ? 'Nicht berechnet' : 'Not calculated',
        hint: hasFinancialData ? monthLabel : undefined,
        available: hasFinancialData,
      }),
      openReceivables: compactMetric({
        id: 'open-receivables',
        label: input.labels.unpaid,
        value: money(sliceValue(openReceivables), input.fmtEUR),
        hint: (openReceivables.count ?? 0) > 0 ? input.labels.invoicesShort(openReceivables.count ?? 0) : undefined,
        available: true,
      }),
      overdueReceivables: compactMetric({
        id: 'overdue-receivables',
        label: input.labels.lostRevenueRisk,
        value: money(sliceValue(overdueReceivables), input.fmtEUR),
        hint: (overdueReceivables.count ?? 0) > 0 ? input.labels.invoicesShort(overdueReceivables.count ?? 0) : undefined,
        available: true,
        emphasize: sliceValue(overdueReceivables) > 0,
      }),
      expenses:
        (expenses.count ?? 0) > 0
          ? compactMetric({
              id: 'expenses',
              label: input.labels.expenses,
              value: money(sliceValue(expenses), input.fmtEUR),
              hint: input.labels.invoicesShort(expenses.count ?? 0),
              available: true,
            })
          : null,
    },
    emptyTitle: input.labels.emptyTitle,
    emptySubtitle: input.labels.emptySubtitle,
  };
}

function de(locale: string): boolean {
  return locale === 'de';
}

function statusToneFromSlice(tone: DashboardSlice['tone']): StatusTone {
  if (tone === 'critical') return 'critical';
  if (tone === 'success') return 'success';
  if (tone === 'watch') return 'watch';
  return 'info';
}

function severityTone(severity: DashboardSliceRow['severity']): StatusTone {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'watch';
  if (severity === 'success') return 'success';
  if (severity === 'info') return 'info';
  return 'neutral';
}

function kpiDisplayValue(count: number | null, locale: string): string {
  if (count == null) return locale === 'de' ? '—' : 'No data';
  return String(count);
}

function kpiFromSlice(input: {
  id: ControlCenterKpi['id'];
  label: string;
  slice: DashboardSlice;
  hint?: string;
  zeroIsPositive?: boolean;
  countOverride?: number | null;
  toneOverride?: StatusTone;
  locale: string;
}): ControlCenterKpi {
  const numericValue = input.countOverride ?? input.slice.count;
  return {
    id: input.id,
    label: input.label,
    displayValue: kpiDisplayValue(numericValue, input.locale),
    numericValue,
    tone: input.toneOverride ?? statusToneFromSlice(input.slice.tone),
    hint: input.hint ?? input.slice.hint,
    zeroIsPositive: input.zeroIsPositive,
  };
}

export function buildRuntimeControlCenterKpis(input: {
  runtime: DashboardRuntimeModel;
  locale: string;
  insightsLoading: boolean;
  insightsError: boolean;
}): ControlCenterKpi[] {
  const slices = input.runtime.slices;
  const criticalCount = input.insightsLoading || input.insightsError ? null : slices['critical-alerts'].count;
  return [
    kpiFromSlice({
      id: 'ready-to-rent',
      label: input.locale === 'de' ? 'Bereit' : 'Ready to Rent',
      slice: slices['ready-to-rent'],
      locale: input.locale,
      toneOverride: (slices['ready-to-rent'].count ?? 0) > 0 ? 'success' : 'neutral',
    }),
    kpiFromSlice({
      id: 'active-rented',
      label: input.locale === 'de' ? 'Aktiv / Vermietet' : 'Active / Rented',
      slice: slices['active-rented'],
      locale: input.locale,
      toneOverride: (slices['active-rented'].count ?? 0) > 0 ? 'info' : 'neutral',
    }),
    kpiFromSlice({
      id: 'due-soon',
      label: input.locale === 'de' ? 'Fällig <60 Min' : 'Due <60 min',
      slice: slices['due-soon'],
      locale: input.locale,
      toneOverride: (slices['due-soon'].count ?? 0) > 0 ? 'watch' : 'neutral',
    }),
    kpiFromSlice({
      id: 'overdue-returns',
      label: input.locale === 'de' ? 'Überfällige Rückgaben' : 'Overdue Returns',
      slice: slices['overdue-returns'],
      locale: input.locale,
      toneOverride: (slices['overdue-returns'].count ?? 0) > 0 ? 'critical' : 'success',
      zeroIsPositive: true,
    }),
    kpiFromSlice({
      id: 'maintenance',
      label: input.locale === 'de' ? 'Wartung / Blockiert' : 'Blocked / Maintenance',
      slice: slices['blocked-maintenance'],
      locale: input.locale,
      toneOverride: (slices['blocked-maintenance'].count ?? 0) > 0 ? 'watch' : 'neutral',
    }),
    kpiFromSlice({
      id: 'critical-alerts',
      label: input.locale === 'de' ? 'Kritische Alerts' : 'Critical Alerts',
      slice: slices['critical-alerts'],
      countOverride: criticalCount,
      locale: input.locale,
      toneOverride: (criticalCount ?? 0) > 0 ? 'critical' : 'success',
      zeroIsPositive: true,
      hint:
        criticalCount === 0
          ? input.locale === 'de'
            ? 'Alles ruhig'
            : 'All clear'
          : undefined,
    }),
  ];
}

function canonicalFuel(v: VehicleData): number | null {
  const preferred = v.isElectric ? v.evSoc ?? v.fuelPercent : v.fuelPercent ?? v.evSoc;
  return typeof preferred === 'number' && Number.isFinite(preferred) ? preferred : null;
}

function nextAppointment(v: VehicleData, locale: string): string | undefined {
  const intl = locale === 'de' ? 'de-DE' : 'en-US';
  if (v.status === 'Reserved' && v.reservedPickupAt) return formatFleetDateTime(v.reservedPickupAt, intl);
  if (v.status === 'Active Rented' && v.activeReturnAt) return formatFleetDateTime(v.activeReturnAt, intl);
  return undefined;
}

function laneFromRuntime(state: VehicleRuntimeState): Exclude<FleetBoardLane, 'all'> {
  if (state.bookingState === 'return_overdue') return 'overdue';
  if (state.bookingState === 'pickup_due_soon' || state.bookingState === 'return_due_soon') return 'due-soon';
  if (state.isMaintenance) return 'maintenance';
  if (state.warningReasons.some((reason) => reason.category === 'cleaning')) return 'cleaning';
  if (state.isBlocked) return 'blocked';
  if (state.isCritical) return 'critical';
  if (state.isWarning || state.blockLevel === 'soft_blocked') return 'attention';
  if (state.isReadyToRent) return 'ready';
  if (state.operationalStatus === 'active_rented') return 'rented';
  if (state.operationalStatus === 'reserved') return 'reserved';
  if (state.operationalStatus === 'available') return 'attention';
  return 'attention';
}

function severityFromRuntime(state: VehicleRuntimeState, lane: Exclude<FleetBoardLane, 'all'>): FleetBoardSeverity {
  if (state.isCritical || lane === 'critical' || lane === 'blocked') return 'critical';
  if (state.isWarning || state.blockLevel === 'soft_blocked' || lane === 'overdue' || lane === 'maintenance' || lane === 'attention') return 'warning';
  if (lane === 'due-soon' || lane === 'cleaning') return 'attention';
  if (lane === 'ready') return 'healthy';
  return 'info';
}

function laneLabel(lane: FleetBoardLane, locale: string): string {
  const labels: Record<FleetBoardLane, [string, string]> = {
    all: ['All', 'Alle'],
    critical: ['Critical', 'Kritisch'],
    blocked: ['Blocked', 'Blockiert'],
    overdue: ['Overdue', 'Überfällig'],
    'due-soon': ['Due soon', 'Bald fällig'],
    attention: ['Attention', 'Hinweise'],
    maintenance: ['Maintenance', 'Wartung'],
    cleaning: ['Cleaning', 'Reinigung'],
    ready: ['Ready', 'Bereit'],
    rented: ['Rented', 'Vermietet'],
    reserved: ['Reserved', 'Reserviert'],
  };
  return locale === 'de' ? labels[lane][1] : labels[lane][0];
}

const FLEET_BOARD_LANE_ORDER: FleetBoardLane[] = [
  'critical',
  'blocked',
  'overdue',
  'due-soon',
  'attention',
  'maintenance',
  'cleaning',
  'ready',
  'rented',
  'reserved',
  'all',
];

export function buildRuntimeFleetBoard(input: {
  runtime: DashboardRuntimeModel;
  vehicles: VehicleData[];
  locale: string;
  filter: FleetBoardLane;
}): FleetBoardModel {
  const byVehicle = new Map(input.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const items: FleetBoardItem[] = input.runtime.vehicleStates
    .map((state) => {
      const vehicle = byVehicle.get(state.vehicleId);
      const lane = laneFromRuntime(state);
      const severity = severityFromRuntime(state, lane);
      const fuel = vehicle ? canonicalFuel(vehicle) : null;
      const freshness = vehicle ? resolveTelemetryFreshness(vehicle, { locale: input.locale }) : null;
      return {
        vehicleId: state.vehicleId,
        lane,
        severity,
        statusLabel: laneLabel(lane, input.locale),
        license: state.license || state.displayName,
        makeModel: vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(' ') || undefined : undefined,
        station: state.stationLabel ?? undefined,
        nextAppointment: vehicle ? nextAppointment(vehicle, input.locale) : undefined,
        fuelLabel: fuel != null && vehicle ? `${vehicle.isElectric ? 'SoC' : 'Fuel'} ${formatFuelPercentCeil(fuel)}` : null,
        fuelPercent: fuel,
        isElectric: !!vehicle?.isElectric,
        lastSeenLabel: null,
        telemetryLabel: freshness?.label ?? null,
        showTelemetryWarning: freshness?.shouldWarnUser ?? state.telemetryState === 'offline',
        criticalHint: state.criticalReasons[0]?.title ?? state.warningReasons[0]?.title,
        sortPriority:
          lane === 'critical' || lane === 'blocked'
            ? 1000
            : lane === 'overdue'
              ? 900
              : lane === 'due-soon'
                ? 700
                : lane === 'attention' || lane === 'maintenance'
                  ? 600
                  : lane === 'cleaning'
                    ? 500
                    : lane === 'rented'
                      ? 400
                      : lane === 'reserved'
                        ? 300
                        : 100,
        isOffline: state.telemetryState === 'offline',
        isStale: state.telemetryState === 'soft_offline',
      };
    })
    .sort((a, b) => {
      if (b.sortPriority !== a.sortPriority) return b.sortPriority - a.sortPriority;
      return a.license.localeCompare(b.license);
    });

  const laneCounts = new Map<Exclude<FleetBoardLane, 'all'>, number>();
  items.forEach((item) => laneCounts.set(item.lane, (laneCounts.get(item.lane) ?? 0) + 1));
  const lanes: FleetBoardLaneSummary[] = FLEET_BOARD_LANE_ORDER.filter((lane) => lane !== 'all').map((lane) => ({
    lane,
    label: laneLabel(lane, input.locale),
    count: laneCounts.get(lane as Exclude<FleetBoardLane, 'all'>) ?? 0,
    severity:
      lane === 'critical' || lane === 'blocked'
        ? 'critical'
        : lane === 'overdue' || lane === 'maintenance' || lane === 'attention'
          ? 'warning'
          : lane === 'due-soon' || lane === 'cleaning'
            ? 'attention'
            : lane === 'ready'
              ? 'healthy'
              : 'info',
  }));
  lanes.push({ lane: 'all', label: laneLabel('all', input.locale), count: items.length, severity: 'info' });

  return {
    items,
    lanes,
    filteredItems: input.filter === 'all' ? items : items.filter((item) => item.lane === input.filter),
  };
}

export function buildRuntimeFleetStateTabs(input: {
  runtime: DashboardRuntimeModel;
  labels: {
    available: string;
    reserved: string;
    rented: string;
    maintenance: string;
  };
}): FleetStateTab[] {
  const states = input.runtime.vehicleStates;
  return [
    {
      key: 'Available',
      label: input.labels.available,
      count: states.filter((state) => state.operationalStatus === 'available').length,
      tone: 'success',
      warn: states.filter((state) => state.operationalStatus === 'available' && !state.isReadyToRent).length,
    },
    {
      key: 'Reserved',
      label: input.labels.reserved,
      count: states.filter((state) => state.operationalStatus === 'reserved').length,
      tone: 'warning',
      warn: states.filter((state) => state.operationalStatus === 'reserved' && state.isWarning).length,
    },
    {
      key: 'Active Rented',
      label: input.labels.rented,
      count: input.runtime.slices['active-rented'].count ?? 0,
      tone: 'brand',
      warn: states.filter((state) => state.bookingState === 'return_overdue' || state.isWarning).length,
    },
    {
      key: 'Maintenance',
      label: input.labels.maintenance,
      count: input.runtime.slices['blocked-maintenance'].count ?? 0,
      tone: 'critical',
      warn: states.filter((state) => state.isCritical).length,
    },
  ];
}

function rowFromDashboardSliceRow(row: DashboardSliceRow): DashboardDrilldownRow {
  const reasonMeta = row.meta ?? row.reasons?.map((reason) => reason.title).filter(Boolean).join(' · ');
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    meta: reasonMeta || undefined,
    tone: severityTone(row.severity),
    cta: row.bookingId ? 'open-booking' : row.invoiceId ? 'open-invoice' : 'open-vehicle',
    ctaLabel: row.primaryActionLabel,
    vehicleId: row.vehicleId,
    bookingId: row.bookingId,
    invoiceId: row.invoiceId,
  };
}

function groupsFromSlice(slice: DashboardSlice): DashboardDrilldownGroup[] | undefined {
  const groups = slice.groups
    ?.filter((group) => group.count > 0)
    .map((group) => ({
      id: group.id,
      title: group.title,
      count: group.count,
      rows: group.rows.map(rowFromDashboardSliceRow),
    }));
  return groups && groups.length > 0 ? groups : undefined;
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

function kpiSliceId(target: string): DashboardSliceId {
  return target === 'maintenance' ? 'blocked-maintenance' : (target as DashboardSliceId);
}

export function buildRuntimeDashboardDrilldown(input: {
  runtime: DashboardRuntimeModel;
  businessSlices: Partial<Record<string, { title: string; rows: Array<{ id: string; title: string; subtitle?: string; severity: DashboardSliceRow['severity']; invoiceId?: string; vehicleId?: string; bookingId?: string }> }>>;
  fleetBoard: FleetBoardModel;
  actionQueue: ActionQueueItem[];
  actionQueueLoading: boolean;
  target: DashboardDrilldownTarget;
  locale: string;
  selectedStationName: string | null;
  dataFreshness: DataFreshnessSummary;
}): DashboardDrilldownContent {
  const scope = input.selectedStationName ?? (de(input.locale) ? 'Alle Stationen' : 'All stations');
  if (input.target.type === 'kpi') {
    const slice = input.runtime.slices[kpiSliceId(input.target.target)];
    return {
      listKind: input.target.target === 'due-soon' ? 'timeline' : input.target.target === 'critical-alerts' ? 'alerts' : 'vehicles',
      title: slice.title,
      filterLabel: scope,
      description: slice.hint,
      rows: slice.rows.map(rowFromDashboardSliceRow),
      groups: groupsFromSlice(slice),
      loading: input.dataFreshness.fleetLoading,
    };
  }
  if (input.target.type === 'fleet-lane') {
    const lane = input.target.lane;
    const items = lane === 'all'
      ? input.fleetBoard.items
      : input.fleetBoard.items.filter((item) => item.lane === lane);
    return {
      listKind: 'vehicles',
      title: laneLabel(lane, input.locale),
      filterLabel: scope,
      description: `${items.length} ${de(input.locale) ? 'Fahrzeuge' : 'vehicles'}`,
      rows: items.map((item) => ({
        id: `vehicle:${item.vehicleId}:fleet-lane:${lane}`,
        title: item.license,
        subtitle: [item.makeModel, item.station].filter(Boolean).join(' · ') || undefined,
        meta: item.criticalHint || item.statusLabel,
        tone: item.severity === 'critical' ? 'critical' : item.severity === 'warning' ? 'watch' : item.severity === 'healthy' ? 'success' : 'info',
        cta: 'open-vehicle',
        vehicleId: item.vehicleId,
      })),
      loading: input.dataFreshness.fleetLoading,
    };
  }
  if (input.target.type === 'business-metric') {
    const slice = input.businessSlices[input.target.metricId];
    return {
      listKind: 'financial',
      title: slice?.title ?? (de(input.locale) ? 'Finanzübersicht' : 'Financial overview'),
      filterLabel: scope,
      rows: (slice?.rows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        subtitle: row.subtitle,
        tone: severityTone(row.severity),
        cta: 'open-invoice',
        invoiceId: row.invoiceId,
        vehicleId: row.vehicleId,
        bookingId: row.bookingId,
      })),
      loading: false,
      footerAction: 'open-finance',
    };
  }
  if (input.target.type === 'action-item') {
    const itemId = input.target.itemId;
    const item = input.actionQueue.find((entry) => entry.id === itemId);
    const rows = item ? actionRows([item]) : [];
    return {
      listKind: 'alerts',
      title: item?.title ?? (de(input.locale) ? 'Aktion' : 'Action'),
      filterLabel: scope,
      rows,
      loading: input.actionQueueLoading,
    };
  }
  return {
    listKind: 'vehicles',
    title: scope,
    filterLabel: scope,
    rows: [],
    loading: false,
  };
}
