
import { Icon } from './ui/Icon';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { VehicleData } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { StatInlineDetail, type PickupTileItem, type ReturnTileItem } from './StatInlineDetail';
import { useLanguage } from '../i18n/LanguageContext';
import { BusinessInsightsBox } from './BusinessInsightsBox';
import { ScheduleBox } from './ScheduleBox';
import { useRentalOrg } from '../RentalContext';
import { api, type Station } from '../../lib/api';
import { getStoredUser } from '../../lib/auth';
import { useHandover } from '../HandoverContext';
import {
  PageHeader,
  MetricCard,
  SkeletonMetricGrid,
  StatusChip,
} from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';
import {
  type FleetStatusTabKey,
  countFleetStatusTab,
} from '../lib/vehicle-status';

// V4.6.95 — Dashboard station filter is now wired end-to-end. The dropdown
// loads the org's real station catalogue (`api.stations.list`), the choice
// is persisted to `localStorage` so the dispatcher does not have to re-pick
// it on every reload, and the selected station name is propagated as a
// filter to the vehicle list, today's pickups/returns, the BusinessInsights
// box (vehicle-health alerts) and the ScheduleBox (lane chart). `null`
// represents the explicit "All Stations" choice.
const STATION_FILTER_STORAGE_KEY = 'synqdrive.dashboard.selectedStationId';

// V4.6.94 — Monthly KPI tiles (Umsatz / Gewinn / Ausgaben) above the
// "Insights from your Business" row. Mirrors the bucketing logic used by
// `FinancialInsightsView` so the dashboard never invents numbers: revenue =
// sum(totalCents) of OUTGOING invoices in the current month; expenses = same
// for INCOMING; profit = revenue − expenses. We bucket the previous month
// in the same loop so the tiles can show a deterministic month-over-month
// delta without re-walking the list.
const OUTGOING_INVOICE_TYPES = new Set(['OUTGOING_BOOKING', 'OUTGOING_MANUAL']);
const INCOMING_INVOICE_TYPES = new Set(['INCOMING_VENDOR', 'INCOMING_UPLOADED']);

type KpiTone = 'success' | 'critical' | 'brand' | 'info';

interface DashboardInvoice {
  id: string;
  type: string;
  totalCents: number | null;
  invoiceDate: string | null;
  createdAt: string | null;
}

function effectiveInvoiceDate(inv: DashboardInvoice): Date | null {
  const iso = inv.invoiceDate || inv.createdAt;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface DashboardViewProps {
  onVehicleSelect?: (vehicle: VehicleData) => void;
  onItemHover?: (vehicleName: string | null) => void;
  /** Direct navigation to a vehicle id (used by Business Insights drill-in). */
  onOpenVehicleById?: (vehicleId: string) => void;
  /** Top-level view navigation triggered from inside dashboard widgets. */
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
  // V4.6.99 — Direkt-Navigation auf eine Booking-Detail-Seite. Wird vom
  // BK-Chip in den StatInlineDetail-Reserved/Active-Karten ausgelöst.
  // Implementor-Vertrag: setzt die App auf `currentView='bookings'` und
  // öffnet die Detail-Seite des angegebenen Bookings.
  onOpenBookingById?: (bookingId: string) => void;
}

function kpiToneToStatus(tone: KpiTone): StatusTone {
  if (tone === 'success') return 'success';
  if (tone === 'critical') return 'critical';
  if (tone === 'brand') return 'info';
  return 'info';
}

export function DashboardView({ onVehicleSelect, onItemHover, onOpenVehicleById, onOpenRentalView, onOpenBookingById }: DashboardViewProps) {
  const systemDark = useSyncExternalStore(
    (onStoreChange) => {
      const el = document.documentElement;
      const obs = new MutationObserver(onStoreChange);
      obs.observe(el, { attributes: true, attributeFilter: ['class'] });
      return () => obs.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
  const { t, locale } = useLanguage();
  const { fleetVehicles } = useFleetVehicles();
  const { orgId } = useRentalOrg();
  const { openHandover } = useHandover();

  // V4.6.68 — Today's pickups & returns from the real backend (was hardcoded
  // to empty arrays). Drives the Pick Up/Return Today KPI tiles, the
  // "Today's Activity" inline detail and the tab counters.
  const [todayPickupsApi, setTodayPickupsApi] = useState<any[]>([]);
  const [todayReturnsApi, setTodayReturnsApi] = useState<any[]>([]);

  // V4.6.94 — Monthly KPI tiles (Umsatz / Gewinn / Ausgaben). The list comes
  // from `/organizations/:orgId/invoices` (same source the
  // `FinancialInsightsView` uses) and is reduced into MTD + previous-month
  // buckets locally. Loading is non-blocking and fails silently — the tiles
  // simply render 0 / no-delta if the request errors out.
  const [invoicesApi, setInvoicesApi] = useState<DashboardInvoice[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setInvoicesApi([]);
      setInvoicesLoaded(true);
      return;
    }
    let cancelled = false;
    setInvoicesLoaded(false);
    api.invoices
      .list(orgId)
      .then((rows) => {
        if (cancelled) return;
        const arr = Array.isArray(rows) ? (rows as any[]) : ((rows as any)?.data ?? []);
        setInvoicesApi(arr as DashboardInvoice[]);
      })
      .catch(() => {
        if (cancelled) return;
        setInvoicesApi([]);
      })
      .finally(() => {
        if (!cancelled) setInvoicesLoaded(true);
      });
    return () => { cancelled = true; };
  }, [orgId]);

  // V4.6.75 — Shared loader so the dashboard refetches Pick-Up/Return data
  // after a handover has been confirmed from any entry point.
  const loadTodayBookings = useCallback(() => {
    if (!orgId) {
      setTodayPickupsApi([]);
      setTodayReturnsApi([]);
      return () => {};
    }
    let cancelled = false;
    Promise.all([
      api.bookings.todayPickups(orgId).catch(() => [] as any[]),
      api.bookings.todayReturns(orgId).catch(() => [] as any[]),
    ]).then(([pickups, returns]) => {
      if (cancelled) return;
      setTodayPickupsApi(Array.isArray(pickups) ? pickups : (pickups as any)?.data ?? []);
      setTodayReturnsApi(Array.isArray(returns) ? returns : (returns as any)?.data ?? []);
    });
    return () => { cancelled = true; };
  }, [orgId]);

  useEffect(() => {
    const dispose = loadTodayBookings();
    return dispose;
  }, [loadTodayBookings]);

  useEffect(() => {
    const onHandover = () => loadTodayBookings();
    window.addEventListener('handover:completed', onHandover as EventListener);
    return () => window.removeEventListener('handover:completed', onHandover as EventListener);
  }, [loadTodayBookings]);
  // V4.6.93 — The dashboard is now Business-only. The legacy `activeTab`
  // segmented control (Business / Finances) was retired together with the
  // entire Finances panel; everything finance-driven lives in the new
  // `Financial Insights` view under the Insights sidebar group.
  // V4.6.95 — `selectedStationName` is the user-facing filter. `null` ⇒
  // „All Stations" (no filter). It is hydrated from `localStorage` on first
  // render so the dispatcher's last choice survives a reload, and revoked
  // automatically if the persisted station no longer exists in the org's
  // station catalogue (e.g. it was renamed or deleted).
  const [selectedStationId, setSelectedStationId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STATION_FILTER_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [stationsApi, setStationsApi] = useState<Station[]>([]);
  const [isStationDropdownOpen, setIsStationDropdownOpen] = useState(false);
  const stationDropdownRef = useRef<HTMLDivElement | null>(null);
  const [fleetStatusTab, setFleetStatusTab] = useState<FleetStatusTabKey>('Available');
  const [todayTab, setTodayTab] = useState<'Pick Up Today' | 'Return Today'>('Pick Up Today');

  // V4.6.95 — Live station catalogue. Failure is silent — the dropdown then
  // collapses to just the „All Stations" option, which mirrors the pre-wiring
  // behaviour and avoids leaving the dispatcher stuck on a broken filter.
  useEffect(() => {
    if (!orgId) {
      setStationsApi([]);
      return;
    }
    let cancelled = false;
    api.stations
      .list(orgId)
      .then((rows) => {
        if (cancelled) return;
        const arr = Array.isArray(rows) ? rows : [];
        setStationsApi(arr);
      })
      .catch(() => {
        if (cancelled) return;
        setStationsApi([]);
      });
    return () => { cancelled = true; };
  }, [orgId]);

  // V4.6.95 — If the persisted station name no longer exists in the freshly
  // loaded catalogue, fall back to „All Stations" instead of silently
  // hiding every row (the previous filter is now meaningless).
  useEffect(() => {
    if (!selectedStationId) return;
    if (stationsApi.length === 0) return;
    const byId = stationsApi.some((s) => s.id === selectedStationId);
    if (byId) return;
    const byLegacyName = stationsApi.find((s) => s.name === selectedStationId);
    if (byLegacyName) {
      setSelectedStationId(byLegacyName.id);
      try { localStorage.setItem(STATION_FILTER_STORAGE_KEY, byLegacyName.id); } catch {}
      return;
    }
    setSelectedStationId(null);
    try { localStorage.removeItem(STATION_FILTER_STORAGE_KEY); } catch {}
  }, [stationsApi, selectedStationId]);

  const applyStationFilter = useCallback((stationId: string | null) => {
    setSelectedStationId(stationId);
    setIsStationDropdownOpen(false);
    try {
      if (stationId) localStorage.setItem(STATION_FILTER_STORAGE_KEY, stationId);
      else localStorage.removeItem(STATION_FILTER_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // V4.6.95 — Dismiss the dropdown when the user clicks outside or hits
  // Escape so it behaves like every other popover on the dashboard.
  useEffect(() => {
    if (!isStationDropdownOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!stationDropdownRef.current) return;
      if (!stationDropdownRef.current.contains(e.target as Node)) {
        setIsStationDropdownOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsStationDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [isStationDropdownOpen]);

  // V4.6.95 — Apply the station filter once at the top so every downstream
  // derivation (KPI tab counts, Available/Reserved/Active Rented lists,
  // pickup/return items, BusinessInsights & Schedule boxes) sees a
  // consistent slice of the fleet. Vehicles store the station as a name
  // string; falsy `selectedStationName` keeps the full fleet.
  const filteredFleetVehicles = useMemo(() => {
    if (!selectedStationId) return fleetVehicles;
    return fleetVehicles.filter(
      (v) =>
        v.stationId === selectedStationId ||
        v.homeStationId === selectedStationId ||
        v.currentStationId === selectedStationId,
    );
  }, [fleetVehicles, selectedStationId]);

  const selectedStationName = useMemo(() => {
    if (!selectedStationId) return null;
    return stationsApi.find((s) => s.id === selectedStationId)?.name ?? null;
  }, [selectedStationId, stationsApi]);

  // Compute warning indicators for stat boxes
  const availableVehicles = filteredFleetVehicles.filter(v => v.status === 'Available');
  const reservedVehicles = filteredFleetVehicles.filter(v => v.status === 'Reserved');
  const activeRentedVehicles = filteredFleetVehicles.filter(v => v.status === 'Active Rented');

  const availableNeedsCleaning = availableVehicles.filter(v => v.cleaningStatus !== 'Clean').length;
  const availableAlerts = availableVehicles.filter(v => !!v.alert).length;
  const reservedNeedsCleaning = reservedVehicles.filter(v => v.cleaningStatus !== 'Clean').length;
  const reservedAlerts = reservedVehicles.filter(v => !!v.alert).length;

  // V4.6.85 — Freikilometer-Überschreitung kommt jetzt direkt aus dem
  // Fleet-Read-Model. `activeKmIncluded` / `activeKmDriven` werden im
  // Backend aus `Booking.kmIncluded` und dem Delta zwischen Pickup- und
  // Live-Odometer berechnet (siehe `VehiclesService.mapToVehicleData`).
  // Buchungen ohne Allowance (null / <=0) gelten als unbegrenzt und
  // werden hier bewusst nicht mitgezählt.
  const activeRentedOverKm = activeRentedVehicles.filter((v) => {
    const included = typeof v.activeKmIncluded === 'number' ? v.activeKmIncluded : null;
    const driven = typeof v.activeKmDriven === 'number' ? v.activeKmDriven : null;
    if (included == null || included <= 0) return false;
    if (driven == null) return false;
    return driven > included;
  }).length;

  // Pick Up Today / Return Today — derived from the backend booking list.
  // Matches the shape that StatInlineDetail expects. Fleet lookups power
  // the cleaning / alert / error badges and enable vehicle-click navigation.
  // V4.6.95 — Lookup keeps the *unfiltered* fleet so we can still resolve
  // a vehicle when the row's station does not match the active filter
  // (filtering of the rows themselves happens in the `pickupItems` /
  // `returnItems` memos below).
  const vehicleLookup = useMemo(() => {
    const byLicense = new Map<string, VehicleData>();
    const byId = new Map<string, VehicleData>();
    fleetVehicles.forEach((v) => {
      byId.set(v.id, v);
      if (v.license) byLicense.set(v.license, v);
    });
    return { byId, byLicense };
  }, [fleetVehicles]);

  const formatApiTime = (iso: string | undefined): string => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString(locale === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  const pickupItems = useMemo(() => {
    const rows = selectedStationId
      ? todayPickupsApi.filter((p: any) => {
          const sid = p?.pickupStationId;
          return sid ? sid === selectedStationId : false;
        })
      : todayPickupsApi;
    return rows.map((p: any) => {
      const license = p.vehicleLicense || '';
      const v = license ? vehicleLookup.byLicense.get(license) : undefined;
      return {
        // V4.6.75 — expose bookingId + raw booking so Pickup-tile rows
        // can open the Übergabeprotokoll via HandoverProvider, and `done`
        // reflects the actual pickup protocol state.
        bookingId: String(p.id ?? ''),
        time: formatApiTime(p.startDate),
        vehicle: p.vehicleName || '',
        plate: license,
        customer: p.customerName || '',
        station: p.stationLabel || p.pickupStationName || p.station || '',
        done: !!p.pickupProtocol,
        vehicleId: v?.id || p.vehicleId || '',
        needsCleaning: v ? v.cleaningStatus !== 'Clean' : false,
        hasAlert: v ? !!v.alert : false,
        hasError: false,
        startDate: String(p.startDate ?? ''),
        endDate: String(p.endDate ?? ''),
        // V4.6.81 — Overdue-Flags kommen direkt aus BookingsService
        // (findPickupsDue erweitert um Lookback 7d + isOverdue-Flag).
        // Wir mappen sie unverändert weiter, damit Pickup-Tile und
        // Detailzeile denselben Zustand lesen wie der Insight-Detector.
        isOverdue: !!p.isOverdue,
        minutesOverdue: typeof p.minutesOverdue === 'number' ? p.minutesOverdue : 0,
      };
    });
  }, [todayPickupsApi, vehicleLookup, locale, selectedStationId]);
  const pickupNeedsCleaning = pickupItems.filter(p => p.needsCleaning).length;
  const pickupAlerts = pickupItems.filter(p => p.hasAlert).length;
  const pickupOverdueCount = pickupItems.filter(p => p.isOverdue && !p.done).length;

  const returnItems = useMemo(() => {
    const rows = selectedStationId
      ? todayReturnsApi.filter((r: any) => {
          const sid = r?.returnStationId;
          return sid ? sid === selectedStationId : false;
        })
      : todayReturnsApi;
    return rows.map((r: any) => {
      const license = r.vehicleLicense || '';
      const v = license ? vehicleLookup.byLicense.get(license) : undefined;
      return {
        bookingId: String(r.id ?? ''),
        time: formatApiTime(r.endDate),
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
        hasAlert: v ? !!v.alert : false,
        startDate: String(r.startDate ?? ''),
        endDate: String(r.endDate ?? ''),
        pickupOdometerKm: r.pickupProtocol?.odometerKm ?? null,
      };
    });
  }, [todayReturnsApi, vehicleLookup, locale, selectedStationId]);
  const returnErrors = returnItems.filter(r => r.hasError).length;
  const returnKmExceeded = returnItems.filter(r => r.kmExceeded).length;
  const returnOverdue = returnItems.filter(r => r.isOverdue && !r.done).length;
  const returnAlerts = returnItems.filter(r => r.hasAlert).length;

  // V4.6.75 — open the Übergabeprotokoll dialog from the Pick-Up / Return
  // Today tile rows. Seeds the dialog with the data the row already has so
  // the header renders instantly; the provider hydrates the rest.
  const handleConfirmPickup = useCallback((p: PickupTileItem) => {
    if (!p.bookingId) return;
    openHandover({
      bookingId: p.bookingId,
      kind: 'PICKUP',
      booking: {
        id: p.bookingId,
        vehicleId: p.vehicleId,
        vehicleName: p.vehicle,
        plate: p.plate,
        customerName: p.customer,
        startDate: p.startDate || '',
        endDate: p.endDate || '',
        pickupLocation: p.station,
      },
    });
  }, [openHandover]);

  const handleConfirmReturn = useCallback((r: ReturnTileItem) => {
    if (!r.bookingId) return;
    openHandover({
      bookingId: r.bookingId,
      kind: 'RETURN',
      booking: {
        id: r.bookingId,
        vehicleId: r.vehicleId,
        vehicleName: r.vehicle,
        plate: r.plate,
        customerName: r.customer,
        startDate: r.startDate || '',
        endDate: r.endDate || '',
        pickupLocation: r.station,
        pickupOdometerKm: r.pickupOdometerKm ?? null,
      },
    });
  }, [openHandover]);

  // V4.6.93 — Removed dead `stats` array (declared, never referenced) and
  // the entire Finances-tab data block (financeKPIs / upcomingMonthData /
  // topVehicles / revenueDetailData / costsDetailData / costsFixedMonthly /
  // VAT_RATE etc.). The Finances tab is gone; finance KPIs, daily breakdowns
  // and top-vehicle lists are now computed end-to-end from real
  // `/organizations/:orgId/invoices*` data inside `FinancialInsightsView`.

  const dashboardNotifications: {
    type: 'alert' | 'booking' | 'return' | 'maintenance' | 'feedback' | 'system';
    title: string;
    desc: string;
    time: string;
    unread: boolean;
  }[] = [];

  // V4.6.94 — MTD finance KPIs powering the three monthly tiles. Buckets are
  // computed in a single pass per render-of-`invoicesApi` so the tiles stay
  // cheap; deltas are only emitted when the previous month had a non-zero
  // baseline (avoids "+∞" / "+100 %" noise on freshly-onboarded orgs).
  const intlLocale = useMemo(() => {
    const lm: Record<string, string> = {
      en: 'en-US', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL',
      es: 'es-ES', it: 'it-IT', pl: 'pl-PL', cs: 'cs-CZ',
    };
    return lm[locale] || 'en-US';
  }, [locale]);

  const monthlyKpis = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    let mtdRevenue = 0;
    let mtdExpense = 0;
    let mtdRevenueCount = 0;
    let mtdExpenseCount = 0;
    let prevRevenue = 0;
    let prevExpense = 0;

    for (const inv of invoicesApi) {
      const d = effectiveInvoiceDate(inv);
      if (!d) continue;
      const cents = inv.totalCents ?? 0;
      const isOut = OUTGOING_INVOICE_TYPES.has(inv.type);
      const isIn = INCOMING_INVOICE_TYPES.has(inv.type);
      if (!isOut && !isIn) continue;
      if (d >= monthStart && d <= now) {
        if (isOut) { mtdRevenue += cents; mtdRevenueCount += 1; }
        else { mtdExpense += cents; mtdExpenseCount += 1; }
      } else if (d >= prevMonthStart && d <= prevMonthEnd) {
        if (isOut) prevRevenue += cents;
        else prevExpense += cents;
      }
    }

    const profitCents = mtdRevenue - mtdExpense;
    const prevProfitCents = prevRevenue - prevExpense;

    const deltaPct = (curr: number, prev: number): number | null => {
      if (prev <= 0) return null;
      return ((curr - prev) / prev) * 100;
    };
    const profitDeltaPct = (() => {
      if (prevProfitCents === 0) return null;
      return ((profitCents - prevProfitCents) / Math.abs(prevProfitCents)) * 100;
    })();

    return {
      revenueCents: mtdRevenue,
      expenseCents: mtdExpense,
      profitCents,
      revenueCount: mtdRevenueCount,
      expenseCount: mtdExpenseCount,
      revenueDeltaPct: deltaPct(mtdRevenue, prevRevenue),
      expenseDeltaPct: deltaPct(mtdExpense, prevExpense),
      profitDeltaPct,
      monthLabel: now.toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' }),
    };
  }, [invoicesApi, intlLocale]);

  const fmtMonthlyEUR = useCallback(
    (cents: number) =>
      new Intl.NumberFormat(intlLocale, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(cents / 100),
    [intlLocale],
  );

  const welcomeTitle = (() => {
    const u = getStoredUser();
    const fullName = (u?.name || '').trim();
    if (fullName) return t('dashboard.welcomeBack', { name: fullName });
    return t('dashboard.welcomeBackGeneric');
  })();

  const dateLabel = (() => {
    const lm: Record<string, string> = { en: 'en-US', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL', es: 'es-ES', it: 'it-IT', pl: 'pl-PL', cs: 'cs-CZ' };
    const loc = lm[locale] || 'en-US';
    return new Date().toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  })();

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <PageHeader
        title={welcomeTitle}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <StatusChip tone="neutral" className="capitalize whitespace-nowrap">
              {dateLabel}
            </StatusChip>
            <div className="relative" ref={stationDropdownRef}>
              <button
                type="button"
                onClick={() => setIsStationDropdownOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isStationDropdownOpen}
                className="sq-press flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border max-w-[260px]"
              >
                <Icon name="map-pin" className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {selectedStationName ?? t('dashboard.allStations')}
                </span>
                <Icon name="chevron-down" className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${isStationDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isStationDropdownOpen && (
                <div
                  role="listbox"
                  className="sq-overlay animate-fade-up absolute top-full mt-2 right-0 z-50 min-w-[240px] max-h-[60vh] overflow-auto p-1 rounded-xl"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedStationId === null}
                    onClick={() => applyStationFilter(null)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium rounded-lg transition-colors ${
                      selectedStationId === null
                        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="truncate">{t('dashboard.allStations')}</span>
                    <span className="shrink-0 text-[11px] tabular-nums opacity-70">
                      {fleetVehicles.length}
                    </span>
                  </button>
                  {stationsApi.length > 0 && (
                    <div className="my-1 mx-2 h-px bg-border/60" aria-hidden />
                  )}
                  {stationsApi.map((s) => {
                    const isActive = selectedStationId === s.id;
                    const count = fleetVehicles.filter(
                      (v) =>
                        v.stationId === s.id ||
                        v.homeStationId === s.id ||
                        v.currentStationId === s.id,
                    ).length;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => applyStationFilter(s.id)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium rounded-lg transition-colors ${
                          isActive
                            ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                            : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {isActive ? (
                            <Icon name="check" className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <span className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          )}
                          <span className="truncate">{s.name}</span>
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums opacity-70">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                  {stationsApi.length === 0 && (
                    <div className="px-3 py-2 text-[12px] text-muted-foreground">
                      {locale === 'de' ? 'Keine Standorte verfügbar' : 'No stations available'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        }
      />

      {/* V4.6.93 — Dashboard is Business-only. The legacy `activeTab === 'business'`
          / `'finances'` segmented control + conditional have been retired
          together with the Finances tab; everything finance-driven now lives in
          the dedicated `Financial Insights` view under the Insights sidebar
          group. */}
      <div className="flex gap-3">
        {/* ===== MAIN CONTENT ===== */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* V4.6.94 — Monthly KPI strip (Umsatz / Gewinn / Ausgaben). Sits
              above the "Insights from your Business" row so the operator
              sees the month's commercial pulse before drilling into ops
              signals. Visually a tier below the main dashboard cards
              (smaller padding, lighter typography) but matched in shape,
              radius and shadow via `sq-card`. The compact section header
              and the per-tile month subline make the MTD scope explicit so
              the values are never confused with daily totals. */}
          <div className="animate-fade-up">
            {/* V4.6.95 — the standalone „THIS MONTH · <month>" strip above the
                KPI tiles was removed: each tile already prints the month
                label in its subline (`MonthlyKpiTile`), so the header was
                redundant, sat asymmetrically left-aligned with no right-side
                counterpart, and ate vertical space without adding info. */}
            {!invoicesLoaded ? (
              <SkeletonMetricGrid count={4} />
            ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <MetricCard
                label={t('dashboard.revenue')}
                value={fmtMonthlyEUR(monthlyKpis.revenueCents)}
                hint={`${monthlyKpis.monthLabel} · ${t('dashboard.invoicesShort', { count: monthlyKpis.revenueCount })}`}
                icon={<Icon name="arrow-up-right" className="w-4 h-4" />}
                status={kpiToneToStatus('success')}
                trend={
                  monthlyKpis.revenueDeltaPct != null
                    ? {
                        label: `${monthlyKpis.revenueDeltaPct >= 0 ? '+' : ''}${monthlyKpis.revenueDeltaPct.toFixed(1)}%`,
                        direction: monthlyKpis.revenueDeltaPct >= 0 ? 'up' : 'down',
                      }
                    : undefined
                }
              />
              <MetricCard
                label={t('dashboard.fleetStatus')}
                value={String(filteredFleetVehicles.length)}
                hint={`${selectedStationName ?? t('dashboard.allStations')} · ${availableVehicles.length} ${t('dashboard.available')}`}
                icon={<Icon name="car" className="w-4 h-4" />}
                status={kpiToneToStatus('info')}
              />
              <MetricCard
                label={t('dashboard.profit')}
                value={fmtMonthlyEUR(monthlyKpis.profitCents)}
                hint={monthlyKpis.monthLabel}
                icon={<Icon name="wallet" className="w-4 h-4" />}
                status={kpiToneToStatus(monthlyKpis.profitCents >= 0 ? 'brand' : 'critical')}
                trend={
                  monthlyKpis.profitDeltaPct != null
                    ? {
                        label: `${monthlyKpis.profitDeltaPct >= 0 ? '+' : ''}${monthlyKpis.profitDeltaPct.toFixed(1)}%`,
                        direction: monthlyKpis.profitDeltaPct >= 0 ? 'up' : 'down',
                      }
                    : undefined
                }
              />
              <MetricCard
                label={t('dashboard.expenses')}
                value={fmtMonthlyEUR(monthlyKpis.expenseCents)}
                hint={`${monthlyKpis.monthLabel} · ${t('dashboard.invoicesShort', { count: monthlyKpis.expenseCount })}`}
                icon={<Icon name="arrow-down-left" className="w-4 h-4" />}
                status={kpiToneToStatus('critical')}
                trend={
                  monthlyKpis.expenseDeltaPct != null
                    ? {
                        label: `${monthlyKpis.expenseDeltaPct >= 0 ? '+' : ''}${monthlyKpis.expenseDeltaPct.toFixed(1)}%`,
                        direction: monthlyKpis.expenseDeltaPct >= 0 ? 'up' : 'down',
                        invert: true,
                      }
                    : undefined
                }
              />
            </div>
            )}
          </div>

          {/* Row 1: AI Business Insights (left) + Fleet Status (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Left: unified "Insights from your Business" — tabs for Business /
                Vehicle Alerts / Notifications. V4.6.89 — consolidates the old
                standalone Vehicle-Alerts and Notifications cards so the
                Dashboard shows one attention control tower instead of three
                competing surfaces with overlapping data. */}
            <BusinessInsightsBox
              isDarkMode={systemDark}
              onOpenVehicle={onOpenVehicleById}
              onOpenView={onOpenRentalView}
              notifications={dashboardNotifications}
              stationFilter={selectedStationId}
            />

            {/* Right: Fleet Status with tab switcher */}
            <div className="sq-card overflow-hidden animate-fade-up">
              <div className="p-4 pb-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="sq-tone-brand w-7 h-7 rounded-xl flex items-center justify-center">
                      <Icon name="car" className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-[12px] font-semibold tracking-[-0.005em] text-foreground">{t('dashboard.fleetStatus')}</h3>
                      <p className="text-[10.5px] text-muted-foreground">{t('dashboard.vehiclesTotal', { count: filteredFleetVehicles.length })}</p>
                    </div>
                  </div>
                </div>
                {/* V4.6.91 — Fleet-Status tab bar now mirrors the responsive
                    pattern of the „Insights from your Business" box above
                    (BusinessInsightsBox): explicit `w-full` container, per-button
                    `min-w-0 whitespace-nowrap`, truncating label span and
                    `shrink-0` count/warn pills. Keeps the 4 tabs on a single row
                    in the narrow left-column of the Row-1 `lg:grid-cols-2` grid
                    and on sub-lg viewports instead of stretching the bar
                    vertically. */}
                <div className="sq-tab-bar p-1 flex items-stretch w-full">
                  {([
                    { key: 'Available' as const, label: t('dashboard.available'), count: availableVehicles.length, tone: 'success' as const, warn: 0 },
                    { key: 'Reserved' as const, label: t('dashboard.reserved'), count: reservedVehicles.length, tone: 'warning' as const, warn: reservedVehicles.filter(v => v.reservedIsOverdue).length },
                    // V4.6.86 — `warn` exposes the previously-dead
                    // `activeRentedOverKm` counter. The Active-Rented tab now
                    // carries a compact amber pill when one or more rentals
                    // have exceeded the booking's km allowance, so the
                    // dispatcher sees the overage without opening each card.
                    { key: 'Active Rented' as const, label: t('dashboard.rented'), count: activeRentedVehicles.length, tone: 'brand' as const, warn: activeRentedOverKm },
                    { key: 'Maintenance' as const, label: t('dashboard.maintenanceTab'), count: countFleetStatusTab(filteredFleetVehicles, 'Maintenance'), tone: 'critical' as const, warn: 0 },
                  ]).map(tab => {
                    const isActive = fleetStatusTab === tab.key;
                    const toneCls = `sq-tone-${tab.tone}`;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setFleetStatusTab(tab.key)}
                        className={`flex-1 min-w-0 px-2 py-1.5 rounded-[calc(var(--radius-md)-2px)] text-[12px] font-semibold tracking-[-0.003em] whitespace-nowrap transition-all duration-200 flex items-center justify-center gap-1.5 ${
                          isActive
                            ? 'bg-card text-foreground shadow-[var(--shadow-1)] ring-1 ring-[color:color-mix(in_srgb,var(--brand)_12%,transparent)]'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <span className="truncate text-[11.5px]">{tab.label}</span>
                        {/* V4.6.95 — Count pill is now always tone-tinted
                            (success / warning / brand / critical) so the
                            tab bar reads as a colour-coded scoreboard at a
                            glance, instead of leaving inactive tabs with a
                            grey „naked" number. The active state additionally
                            ramps up to a stronger filled treatment so the
                            current selection stays unmistakable. */}
                        <span
                          className={`text-[11px] min-w-[20px] h-[19px] px-1.5 flex items-center justify-center rounded-full font-bold tabular-nums shrink-0 ${toneCls} ${
                            isActive
                              ? 'ring-1 ring-[color:color-mix(in_srgb,currentColor_35%,transparent)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                              : ''
                          }`}
                        >
                          {tab.count}
                        </span>
                        {tab.warn > 0 && (
                          <span
                            title={tab.key === 'Active Rented' ? `${tab.warn} über Km-Limit` : `${tab.warn} überfällig`}
                            className="text-[10px] min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full font-bold tabular-nums sq-tone-watch shrink-0"
                          >
                            {tab.warn}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-1 pb-1">
                <StatInlineDetail
                  activePopup={fleetStatusTab}
                  isDarkMode={systemDark}
                  onClose={() => {}}
                  onVehicleSelect={onVehicleSelect}
                  onItemHover={onItemHover}
                  pickupItems={pickupItems}
                  returnItems={returnItems}
                  pickupNeedsCleaning={pickupNeedsCleaning}
                  pickupAlerts={pickupAlerts}
                  returnErrors={returnErrors}
                  returnKmExceeded={returnKmExceeded}
                  returnOverdue={returnOverdue}
                  returnAlerts={returnAlerts}
                  borderColor="border-transparent"
                  hideHeader
                  onConfirmPickup={handleConfirmPickup}
                  onConfirmReturn={handleConfirmReturn}
                  onOpenBookingById={onOpenBookingById}
                  stations={stationsApi}
                />
              </div>
            </div>
          </div>

          {/* Row 2: Schedule (left) + Today's Activity (right). V4.6.94 —
              the dispatcher needs a forward-looking lane next to the
              today-only operational ledger so they can see currently active
              and upcoming rentals at a glance. The Schedule box mirrors the
              Gantt / lane-chart pattern from the design reference using the
              dashboard's own design tokens. The grid stays single-column on
              compact viewports so neither widget collapses. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ScheduleBox isDarkMode={systemDark} onOpenBookingById={onOpenBookingById} stationFilter={selectedStationId} />

            {/* Today's Activity with tab switcher */}
            <div className="sq-card overflow-hidden animate-fade-up">
              <div className="p-4 pb-0">
                {/* V4.6.95 — header now mirrors ScheduleBox: title on the left,
                    Pick Up / Return tab switcher on the right, both vertically
                    aligned on the same row so the two side-by-side cards share
                    a consistent visual rhythm. */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="sq-tone-warning w-7 h-7 rounded-xl flex items-center justify-center shrink-0">
                      <Icon name="clock" className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[12px] font-semibold tracking-[-0.005em] text-foreground">Today's Activity</h3>
                      <p className="text-[10.5px] text-muted-foreground truncate">{pickupItems.length + returnItems.length} scheduled</p>
                    </div>
                  </div>
                  <div className="sq-tab-bar p-1 flex items-stretch shrink-0">
                    {([
                      { key: 'Pick Up Today' as const, label: 'Pick Up', count: pickupItems.length, done: pickupItems.filter(p => p.done).length },
                      { key: 'Return Today' as const, label: 'Return', count: returnItems.length, done: returnItems.filter(r => r.done).length },
                    ]).map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setTodayTab(tab.key)}
                        className={`px-2 py-1 rounded-[calc(var(--radius-md)-2px)] text-[11.5px]! leading-[16.1px] font-semibold tracking-[-0.003em] whitespace-nowrap transition-all duration-200 flex items-center justify-center gap-1 ${
                          todayTab === tab.key
                            ? 'bg-card text-foreground shadow-[var(--shadow-1)] ring-1 ring-[color:color-mix(in_srgb,var(--brand)_12%,transparent)]'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tab.label}
                        <span className={`text-[10.5px] min-w-[20px] h-[16px] px-1 flex items-center justify-center rounded-full font-semibold tabular-nums shrink-0 ${
                          todayTab === tab.key
                            ? 'sq-tone-brand'
                            : 'bg-muted text-muted-foreground'
                        }`}>{tab.done}/{tab.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-1 pb-1">
                <StatInlineDetail
                  activePopup={todayTab}
                  isDarkMode={systemDark}
                  onClose={() => {}}
                  onVehicleSelect={onVehicleSelect}
                  onItemHover={onItemHover}
                  pickupItems={pickupItems}
                  returnItems={returnItems}
                  pickupNeedsCleaning={pickupNeedsCleaning}
                  pickupAlerts={pickupAlerts}
                  returnErrors={returnErrors}
                  returnKmExceeded={returnKmExceeded}
                  returnOverdue={returnOverdue}
                  returnAlerts={returnAlerts}
                  borderColor="border-transparent"
                  hideHeader
                  onConfirmPickup={handleConfirmPickup}
                  onConfirmReturn={handleConfirmReturn}
                  onOpenBookingById={onOpenBookingById}
                  stations={stationsApi}
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

