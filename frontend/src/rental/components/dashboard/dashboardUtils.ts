import type { StatusTone } from '../../../components/patterns';
import type { VehicleData } from '../../data/vehicles';
import type { DashboardInsight } from '../../DashboardInsightsContext';
import { countFleetStatusTab } from '../../lib/vehicle-status';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type {
  ControlCenterKpi,
  ControlCenterStatus,
  DashboardInvoice,
  DashboardTimeframe,
  DataFreshnessSummary,
  DataSyncStatus,
  FinanceKpi,
  FleetStateTab,
  KpiTone,
  MonthlyKpiSnapshot,
  TodayBookingApiRow,
} from './dashboardTypes';
import { computeMonthlyKpisFromInvoices } from './businessPulseBuilder';

export const OUTGOING_INVOICE_TYPES = new Set(['OUTGOING_BOOKING', 'OUTGOING_MANUAL']);
export const INCOMING_INVOICE_TYPES = new Set(['INCOMING_VENDOR', 'INCOMING_UPLOADED']);

export function effectiveInvoiceDate(inv: DashboardInvoice): Date | null {
  const iso = inv.invoiceDate || inv.createdAt;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function kpiToneToStatus(tone: KpiTone): StatusTone {
  if (tone === 'success') return 'success';
  if (tone === 'critical') return 'critical';
  if (tone === 'brand') return 'info';
  return 'info';
}

export function resolveIntlLocale(locale: string): string {
  const lm: Record<string, string> = {
    en: 'en-US',
    de: 'de-DE',
    fr: 'fr-FR',
    nl: 'nl-NL',
    es: 'es-ES',
    it: 'it-IT',
    pl: 'pl-PL',
    cs: 'cs-CZ',
  };
  return lm[locale] || 'en-US';
}

export function formatApiTime(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(locale === 'de' ? 'de-DE' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

export function filterFleetByStation(
  vehicles: VehicleData[],
  stationId: string | null,
): VehicleData[] {
  if (!stationId) return vehicles;
  return vehicles.filter(
    (v) =>
      v.stationId === stationId ||
      v.homeStationId === stationId ||
      v.currentStationId === stationId,
  );
}

export function countVehiclesAtStation(vehicles: VehicleData[], stationId: string): number {
  return vehicles.filter(
    (v) =>
      v.stationId === stationId ||
      v.homeStationId === stationId ||
      v.currentStationId === stationId,
  ).length;
}

export function buildVehicleLookup(fleetVehicles: VehicleData[]) {
  const byLicense = new Map<string, VehicleData>();
  const byId = new Map<string, VehicleData>();
  fleetVehicles.forEach((v) => {
    byId.set(v.id, v);
    if (v.license) byLicense.set(v.license, v);
  });
  return { byId, byLicense };
}

export function mapPickupItems(
  rows: TodayBookingApiRow[],
  vehicleLookup: ReturnType<typeof buildVehicleLookup>,
  locale: string,
  stationId: string | null,
  healthRiskVehicleIds?: Set<string>,
): PickupTileItem[] {
  const filtered = stationId
    ? rows.filter((p) => (p.pickupStationId ? p.pickupStationId === stationId : false))
    : rows;

  return filtered.map((p) => {
    const license = p.vehicleLicense || '';
    const v = license ? vehicleLookup.byLicense.get(license) : undefined;
    return {
      bookingId: String(p.id ?? ''),
      time: formatApiTime(p.startDate, locale),
      vehicle: p.vehicleName || '',
      plate: license,
      customer: p.customerName || '',
      station: p.stationLabel || p.pickupStationName || p.station || '',
      done: !!p.pickupProtocol,
      vehicleId: v?.id || p.vehicleId || '',
      needsCleaning: v ? v.cleaningStatus !== 'Clean' : false,
      hasAlert: v ? healthRiskVehicleIds?.has(v.id) === true : false,
      hasError: false,
      startDate: String(p.startDate ?? ''),
      endDate: String(p.endDate ?? ''),
      isOverdue: !!p.isOverdue,
      minutesOverdue: typeof p.minutesOverdue === 'number' ? p.minutesOverdue : 0,
    };
  });
}

export function mapReturnItems(
  rows: TodayBookingApiRow[],
  vehicleLookup: ReturnType<typeof buildVehicleLookup>,
  locale: string,
  stationId: string | null,
  healthRiskVehicleIds?: Set<string>,
): ReturnTileItem[] {
  const filtered = stationId
    ? rows.filter((r) => (r.returnStationId ? r.returnStationId === stationId : false))
    : rows;

  return filtered.map((r) => {
    const license = r.vehicleLicense || '';
    const v = license ? vehicleLookup.byLicense.get(license) : undefined;
    const pickupProto = r.pickupProtocol as { odometerKm?: number | null } | undefined;
    return {
      bookingId: String(r.id ?? ''),
      time: formatApiTime(r.endDate, locale),
      vehicle: r.vehicleName || '',
      plate: license,
      customer: r.customerName || '',
      station: r.stationLabel || r.returnStationName || r.station || '',
      done: !!r.returnProtocol,
      vehicleId: v?.id || r.vehicleId || '',
      hasError: r.hasError === true,
      kmExceeded: r.kmExceeded === true,
      extraKm: typeof r.extraKm === 'number' ? r.extraKm : null,
      isOverdue: r.isOverdue === true,
      returnProtocolStatus: r.returnProtocolStatus ?? null,
      hasAlert: v ? healthRiskVehicleIds?.has(v.id) === true : false,
      startDate: String(r.startDate ?? ''),
      endDate: String(r.endDate ?? ''),
      pickupOdometerKm: pickupProto?.odometerKm ?? null,
    };
  });
}

export function computeMonthlyKpis(
  invoicesApi: DashboardInvoice[],
  intlLocale: string,
  vehicleIds: Set<string> | null = null,
): MonthlyKpiSnapshot {
  return computeMonthlyKpisFromInvoices(invoicesApi, intlLocale, vehicleIds);
}

export function countActiveRentedOverKm(vehicles: VehicleData[]): number {
  return vehicles.filter((v) => {
    const included = typeof v.activeKmIncluded === 'number' ? v.activeKmIncluded : null;
    const driven = typeof v.activeKmDriven === 'number' ? v.activeKmDriven : null;
    if (included == null || included <= 0) return false;
    if (driven == null) return false;
    return driven > included;
  }).length;
}

/**
 * @deprecated Deprecated: use dashboard runtime/slices instead. Must not be used for active Dashboard KPI/Drawer/Board/Business state.
 */
export function buildFleetStateTabs(
  filteredFleetVehicles: VehicleData[],
  availableVehicles: VehicleData[],
  reservedVehicles: VehicleData[],
  activeRentedVehicles: VehicleData[],
  labels: {
    available: string;
    reserved: string;
    rented: string;
    maintenance: string;
  },
): FleetStateTab[] {
  const activeRentedOverKm = countActiveRentedOverKm(activeRentedVehicles);
  return [
    {
      key: 'Available',
      label: labels.available,
      count: availableVehicles.length,
      tone: 'success',
      warn: 0,
    },
    {
      key: 'Reserved',
      label: labels.reserved,
      count: reservedVehicles.length,
      tone: 'warning',
      warn: reservedVehicles.filter((v) => v.reservedIsOverdue).length,
    },
    {
      key: 'Active Rented',
      label: labels.rented,
      count: activeRentedVehicles.length,
      tone: 'brand',
      warn: activeRentedOverKm,
    },
    {
      key: 'Maintenance',
      label: labels.maintenance,
      count: countFleetStatusTab(filteredFleetVehicles, 'Maintenance'),
      tone: 'critical',
      warn: 0,
    },
  ];
}

export function normalizeBookingList(raw: unknown): TodayBookingApiRow[] {
  if (Array.isArray(raw)) return raw as TodayBookingApiRow[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: TodayBookingApiRow[] }).data;
  }
  return [];
}

export function normalizeInvoiceList(raw: unknown): DashboardInvoice[] {
  if (Array.isArray(raw)) return raw as DashboardInvoice[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: DashboardInvoice[] }).data;
  }
  return [];
}

/* ── Control Center header + operative KPIs ─────────────────────────── */

export interface ReadyToRentOptions {
  blockedVehicleIds?: Set<string>;
  healthRiskVehicleIds?: Set<string>;
}

/**
 * @deprecated Deprecated: use dashboard runtime/slices instead. Must not be used for active Dashboard KPI/Drawer/Board/Business state.
 */
export function countReadyToRent(
  availableVehicles: VehicleData[],
  options?: ReadyToRentOptions,
): number {
  return availableVehicles.filter((v) => {
    if (v.cleaningStatus !== 'Clean') return false;
    if (options?.blockedVehicleIds?.has(v.id)) return false;
    if (options?.healthRiskVehicleIds?.has(v.id)) return false;
    return true;
  }).length;
}

/**
 * @deprecated Deprecated: use dashboard runtime/slices instead. Must not be used for active Dashboard KPI/Drawer/Board/Business state.
 */
export function isVehicleReadyToRent(
  v: VehicleData,
  options?: ReadyToRentOptions,
): boolean {
  if (v.status !== 'Available') return false;
  if (v.cleaningStatus !== 'Clean') return false;
  if (options?.blockedVehicleIds?.has(v.id)) return false;
  if (options?.healthRiskVehicleIds?.has(v.id)) return false;
  return true;
}

/**
 * @deprecated Deprecated: use dashboard runtime/slices instead. Must not be used for active Dashboard KPI/Drawer/Board/Business state.
 */
export function countMaintenanceVehicles(vehicles: VehicleData[]): number {
  return vehicles.filter((v) => v.status === 'Maintenance').length;
}

export function parseEventTime(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Pickups (start) + returns (end) due within a minute window from now. */
export function countDueWithinMinutes(
  pickups: PickupTileItem[],
  returns: ReturnTileItem[],
  windowMinutes: number,
): number | null {
  const now = Date.now();
  const until = now + windowMinutes * 60_000;
  let parsed = 0;
  let count = 0;

  for (const p of pickups) {
    if (p.done) continue;
    const t = parseEventTime(p.startDate);
    if (t == null) continue;
    parsed += 1;
    if (t >= now && t <= until) count += 1;
  }
  for (const r of returns) {
    if (r.done) continue;
    const t = parseEventTime(r.endDate);
    if (t == null) continue;
    parsed += 1;
    if (t >= now && t <= until) count += 1;
  }

  const pending = pickups.filter((p) => !p.done).length + returns.filter((r) => !r.done).length;
  if (pending > 0 && parsed === 0) return null;
  return count;
}

export function countDueInTimeframe(
  pickups: PickupTileItem[],
  returns: ReturnTileItem[],
  timeframe: DashboardTimeframe,
): number | null {
  if (timeframe === 'today') {
    return countDueWithinMinutes(pickups, returns, 60);
  }
  return countDueWithinMinutes(pickups, returns, 24 * 60);
}

export function countScopedCriticalInsights(
  insights: DashboardInsight[],
  filteredVehicleIds: Set<string>,
  stationScoped: boolean,
): number {
  const critical = insights.filter((i) => i.severity === 'CRITICAL');
  if (!stationScoped) return critical.length;
  return critical.filter((i) => {
    const ids = i.entityIds ?? [];
    if (ids.length === 0) return true;
    return ids.some((id) => filteredVehicleIds.has(id));
  }).length;
}

export function countImportantEvents(input: {
  insights: DashboardInsight[];
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  filteredVehicleIds: Set<string>;
  stationScoped: boolean;
}): number {
  const scopedInsights = input.stationScoped
    ? input.insights.filter((i) => {
        if (i.severity !== 'CRITICAL' && i.severity !== 'WARNING') return false;
        const ids = i.entityIds ?? [];
        if (ids.length === 0) return true;
        return ids.some((id) => input.filteredVehicleIds.has(id));
      })
    : input.insights.filter((i) => i.severity === 'CRITICAL' || i.severity === 'WARNING');

  const overduePickups = input.pickupItems.filter((p) => p.isOverdue && !p.done).length;
  const overdueReturns = input.returnItems.filter((r) => r.isOverdue && !r.done).length;

  return scopedInsights.length + overduePickups + overdueReturns;
}

export function deriveDataSyncStatus(
  freshness: DataFreshnessSummary,
  orgActive: boolean,
): DataSyncStatus {
  if (!orgActive) return 'offline';
  if (freshness.insightsError || freshness.todayBookingsError) return 'offline';
  if (freshness.insightsStale) return 'stale';
  const loading =
    freshness.fleetLoading ||
    freshness.insightsLoading ||
    !freshness.todayBookingsLoaded ||
    !freshness.invoicesLoaded;
  if (loading) return 'partial';
  if (freshness.invoicesError) return 'partial';
  return 'live';
}

export function formatLastSyncLabel(
  insightsGeneratedAt: string | null,
  manualSyncAt: string | null,
  locale: string,
): string {
  const candidates = [manualSyncAt, insightsGeneratedAt]
    .map((iso) => (iso ? Date.parse(iso) : NaN))
    .filter((t) => Number.isFinite(t));
  if (candidates.length === 0) {
    return locale === 'de' ? 'Kein Sync' : 'No sync yet';
  }
  const latest = Math.max(...candidates);
  const diffMin = Math.round((Date.now() - latest) / 60_000);
  if (diffMin < 1) return locale === 'de' ? 'Gerade eben' : 'Just now';
  if (diffMin < 60) return locale === 'de' ? `vor ${diffMin} Min.` : `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  return locale === 'de' ? `vor ${h} Std.` : `${h}h ago`;
}

/**
 * @deprecated Deprecated: use dashboard runtime/slices instead. Must not be used for active Dashboard KPI/Drawer/Board/Business state.
 */
export function buildControlCenterKpis(input: {
  locale: string;
  timeframe: DashboardTimeframe;
  todayBookingsLoaded: boolean;
  todayBookingsError: boolean;
  fleetLoaded: boolean;
  availableVehicles: VehicleData[];
  activeRentedCount: number;
  maintenanceCount: number;
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  overdueReturns: number;
  criticalAlerts: number | null;
  insightsLoaded: boolean;
  readyOptions?: ReadyToRentOptions;
}): ControlCenterKpi[] {
  const noData = input.locale === 'de' ? '—' : 'No data';
  const ready =
    input.fleetLoaded ? countReadyToRent(input.availableVehicles, input.readyOptions) : null;
  const dueSoon = input.todayBookingsLoaded && !input.todayBookingsError
    ? countDueInTimeframe(input.pickupItems, input.returnItems, input.timeframe)
    : null;
  const dueLabel =
    input.timeframe === 'today'
      ? input.locale === 'de'
        ? 'Fällig <60 Min'
        : 'Due <60 min'
      : input.locale === 'de'
        ? 'Fällig <24h'
        : 'Due <24h';

  return [
    {
      id: 'ready-to-rent',
      label: input.locale === 'de' ? 'Bereit' : 'Ready to Rent',
      displayValue: ready == null ? noData : String(ready),
      numericValue: ready,
      tone: ready != null && ready > 0 ? 'success' : 'neutral',
      hint:
        input.availableVehicles.length > 0
          ? `${input.availableVehicles.length} ${input.locale === 'de' ? 'verfügbar' : 'available'}`
          : undefined,
    },
    {
      id: 'active-rented',
      label: input.locale === 'de' ? 'Aktiv / Vermietet' : 'Active / Rented',
      displayValue: input.fleetLoaded ? String(input.activeRentedCount) : noData,
      numericValue: input.fleetLoaded ? input.activeRentedCount : null,
      tone: input.activeRentedCount > 0 ? 'info' : 'neutral',
    },
    {
      id: 'due-soon',
      label: dueLabel,
      displayValue: dueSoon == null ? noData : String(dueSoon),
      numericValue: dueSoon,
      tone: dueSoon != null && dueSoon > 0 ? 'watch' : 'neutral',
    },
    {
      id: 'overdue-returns',
      label: input.locale === 'de' ? 'Überfällige Rückgaben' : 'Overdue Returns',
      displayValue:
        input.todayBookingsLoaded && !input.todayBookingsError
          ? String(input.overdueReturns)
          : noData,
      numericValue:
        input.todayBookingsLoaded && !input.todayBookingsError ? input.overdueReturns : null,
      tone: input.overdueReturns > 0 ? 'critical' : 'success',
      zeroIsPositive: true,
    },
    {
      id: 'maintenance',
      label: input.locale === 'de' ? 'Wartung / Blockiert' : 'Blocked / Maintenance',
      displayValue: input.fleetLoaded ? String(input.maintenanceCount) : noData,
      numericValue: input.fleetLoaded ? input.maintenanceCount : null,
      tone: input.maintenanceCount > 0 ? 'watch' : 'neutral',
    },
    {
      id: 'critical-alerts',
      label: input.locale === 'de' ? 'Kritische Alerts' : 'Critical Alerts',
      displayValue:
        !input.insightsLoaded || input.criticalAlerts == null
          ? noData
          : String(input.criticalAlerts),
      numericValue: input.insightsLoaded ? input.criticalAlerts : null,
      tone:
        input.criticalAlerts != null && input.criticalAlerts > 0
          ? 'critical'
          : 'success',
      zeroIsPositive: true,
      hint:
        input.criticalAlerts === 0 && input.insightsLoaded
          ? input.locale === 'de'
            ? 'Alles ruhig'
            : 'All clear'
          : undefined,
    },
  ];
}

export function buildFinanceKpis(
  monthlyKpis: MonthlyKpiSnapshot,
  fmtMonthlyEUR: (cents: number) => string,
  labels: {
    revenue: string;
    profit: string;
    expenses: string;
    invoicesShort: (count: number) => string;
  },
): FinanceKpi[] {
  return [
    {
      id: 'revenue',
      label: labels.revenue,
      value: fmtMonthlyEUR(monthlyKpis.revenueCents),
      hint: `${monthlyKpis.monthLabel} · ${labels.invoicesShort(monthlyKpis.revenueCount)}`,
      tone: 'success',
      trend:
        monthlyKpis.revenueDeltaPct != null
          ? {
              label: `${monthlyKpis.revenueDeltaPct >= 0 ? '+' : ''}${monthlyKpis.revenueDeltaPct.toFixed(1)}%`,
              direction: monthlyKpis.revenueDeltaPct >= 0 ? 'up' : 'down',
            }
          : undefined,
    },
    {
      id: 'profit',
      label: labels.profit,
      value: fmtMonthlyEUR(monthlyKpis.profitCents),
      hint: monthlyKpis.monthLabel,
      tone: monthlyKpis.profitCents >= 0 ? 'brand' : 'critical',
      trend:
        monthlyKpis.profitDeltaPct != null
          ? {
              label: `${monthlyKpis.profitDeltaPct >= 0 ? '+' : ''}${monthlyKpis.profitDeltaPct.toFixed(1)}%`,
              direction: monthlyKpis.profitDeltaPct >= 0 ? 'up' : 'down',
            }
          : undefined,
    },
    {
      id: 'expenses',
      label: labels.expenses,
      value: fmtMonthlyEUR(monthlyKpis.expenseCents),
      hint: `${monthlyKpis.monthLabel} · ${labels.invoicesShort(monthlyKpis.expenseCount)}`,
      tone: 'critical',
      trend:
        monthlyKpis.expenseDeltaPct != null
          ? {
              label: `${monthlyKpis.expenseDeltaPct >= 0 ? '+' : ''}${monthlyKpis.expenseDeltaPct.toFixed(1)}%`,
              direction: monthlyKpis.expenseDeltaPct >= 0 ? 'up' : 'down',
              invert: true,
            }
          : undefined,
    },
  ];
}

export function buildControlCenterStatus(input: {
  stationLabel: string;
  vehicleCount: number;
  importantEventCount: number;
  lastSyncLabel: string;
  syncStatus: DataSyncStatus;
}): ControlCenterStatus {
  return {
    stationLabel: input.stationLabel,
    vehicleCount: input.vehicleCount,
    importantEventCount: input.importantEventCount,
    lastSyncLabel: input.lastSyncLabel,
    syncStatus: input.syncStatus,
  };
}

export function syncStatusTone(status: DataSyncStatus): StatusTone {
  if (status === 'live') return 'success';
  if (status === 'stale') return 'watch';
  if (status === 'partial') return 'info';
  return 'critical';
}

export function syncStatusLabel(status: DataSyncStatus, locale: string): string {
  const map: Record<DataSyncStatus, { en: string; de: string }> = {
    live: { en: 'Live', de: 'Live' },
    partial: { en: 'Partial', de: 'Teilweise' },
    stale: { en: 'Delayed', de: 'Verzögert' },
    offline: { en: 'Offline', de: 'Offline' },
  };
  return locale === 'de' ? map[status].de : map[status].en;
}
