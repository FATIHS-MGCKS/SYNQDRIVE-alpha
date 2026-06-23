import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { api, type Station } from '../../../lib/api';
import { useFleetVehicles } from '../../FleetContext';
import { useHandover } from '../../HandoverContext';
import {
  useDashboardInsights,
  useVehicleHealthAlerts,
} from '../../DashboardInsightsContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import type { FleetStatusTabKey } from '../../lib/vehicle-status';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type { DashboardNotificationItem } from '../BusinessInsightsBox';
import {
  STATION_FILTER_STORAGE_KEY,
  type DashboardInvoice,
  type DashboardViewModel,
  type DashboardViewProps,
  type OperationalKpiTarget,
  type TodayBookingApiRow,
  type TodayTabKey,
  type DashboardTimeframe,
  type FleetBoardLane,
} from './dashboardTypes';
import {
  buildActionQueueEmptySummary,
  buildUnifiedActionQueue,
} from './actionQueueBuilder';
import {
  buildEnhancedStationHealth,
  computeFleetReadiness,
  computeVehicleTelemetryFreshness,
} from './controlSignalsBuilder';
import {
  buildFallbackStationSummary,
  buildStationCommandDetail,
  buildUnassignedFleetSummary,
  sortStationCommandSummaries,
} from './stationCommandBuilder';
import { buildFleetBoard } from './fleetStateBuilder';
import { buildBusinessPulseSnapshot } from './businessPulseBuilder';
import { deriveOperationalInsights } from './deriveOperationalInsights';
import { derivePredictiveOperationsInsights } from './derivePredictiveOperationsInsights';
import {
  getFocusNotReadyVehicles,
  persistOperatorFocusModePreference,
} from './dashboardFocusMode';
import { buildNowNextTimeline, buildTodayOperations } from './operationsBuilder';
import {
  buildControlCenterKpis,
  buildControlCenterStatus,
  buildFinanceKpis,
  buildFleetStateTabs,
  buildVehicleLookup,
  computeMonthlyKpis,
  countImportantEvents,
  countMaintenanceVehicles,
  countReadyToRent,
  countScopedCriticalInsights,
  deriveDataSyncStatus,
  filterFleetByStation,
  formatLastSyncLabel,
  mapPickupItems,
  mapReturnItems,
  normalizeBookingList,
  normalizeInvoiceList,
  resolveIntlLocale,
  syncStatusLabel,
  type ReadyToRentOptions,
} from './dashboardUtils';
import { buildDashboardDrilldown } from './dashboardDrilldownBuilder';
import type { DashboardDrilldownTarget } from './dashboardDrilldownTypes';
import { attachKpiTrustHints, buildDataTrustLayer } from './dataTrustBuilder';

export function useDashboardViewModel(_props: DashboardViewProps): DashboardViewModel {
  void _props;
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
  const { fleetVehicles, loading: fleetLoading, countdown: fleetCountdownSec, refresh: refreshFleet, healthMap } =
    useFleetVehicles();
  const { orgId } = useRentalOrg();
  const { openHandover } = useHandover();
  const {
    insights,
    response: insightsResponse,
    loading: insightsLoading,
    error: insightsError,
    refresh: refreshInsights,
  } = useDashboardInsights();

  const [todayPickupsApi, setTodayPickupsApi] = useState<TodayBookingApiRow[]>([]);
  const [todayReturnsApi, setTodayReturnsApi] = useState<TodayBookingApiRow[]>([]);
  const [todayBookingsLoaded, setTodayBookingsLoaded] = useState(false);
  const [todayBookingsError, setTodayBookingsError] = useState(false);

  const [invoicesApi, setInvoicesApi] = useState<DashboardInvoice[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [invoicesError, setInvoicesError] = useState(false);

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
  const [fleetBoardFilter, setFleetBoardFilter] = useState<FleetBoardLane>('all');
  const [todayTab, setTodayTab] = useState<TodayTabKey>('Pick Up Today');
  const [criticalOnly, setCriticalOnly] = useState(false);
  // Operator focus mode no longer has a header toggle; the dashboard now always
  // renders the clean standard layout. State + setter are kept for backward
  // compatibility (dependent surfaces / vm type) but are not auto-enabled, so a
  // previously persisted preference can never trap the user in focus mode.
  const [operatorFocusMode, setOperatorFocusModeState] = useState(false);
  const [drilldownTarget, setDrilldownTarget] = useState<DashboardDrilldownTarget | null>(null);

  const openDrilldown = useCallback((target: DashboardDrilldownTarget) => {
    setDrilldownTarget(target);
  }, []);

  const closeDrilldown = useCallback(() => {
    setDrilldownTarget(null);
  }, []);
  const [timeframe, setTimeframe] = useState<DashboardTimeframe>('today');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastManualSyncAt, setLastManualSyncAt] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    if (!orgId) {
      setInvoicesApi([]);
      setInvoicesLoaded(true);
      setInvoicesError(false);
      return;
    }
    setInvoicesLoaded(false);
    setInvoicesError(false);
    try {
      const rows = await api.invoices.list(orgId);
      setInvoicesApi(normalizeInvoiceList(rows));
    } catch {
      setInvoicesApi([]);
      setInvoicesError(true);
    } finally {
      setInvoicesLoaded(true);
    }
  }, [orgId]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const loadTodayBookings = useCallback(async () => {
    if (!orgId) {
      setTodayPickupsApi([]);
      setTodayReturnsApi([]);
      setTodayBookingsLoaded(true);
      setTodayBookingsError(false);
      return;
    }
    setTodayBookingsLoaded(false);
    setTodayBookingsError(false);
    try {
      const [pickupsResult, returnsResult] = await Promise.allSettled([
        api.bookings.todayPickups(orgId),
        api.bookings.todayReturns(orgId),
      ]);
      const pickups =
        pickupsResult.status === 'fulfilled' ? normalizeBookingList(pickupsResult.value) : [];
      const returns =
        returnsResult.status === 'fulfilled' ? normalizeBookingList(returnsResult.value) : [];
      setTodayPickupsApi(pickups);
      setTodayReturnsApi(returns);
      setTodayBookingsError(
        pickupsResult.status === 'rejected' && returnsResult.status === 'rejected',
      );
    } catch {
      setTodayPickupsApi([]);
      setTodayReturnsApi([]);
      setTodayBookingsError(true);
    } finally {
      setTodayBookingsLoaded(true);
    }
  }, [orgId]);

  useEffect(() => {
    void loadTodayBookings();
  }, [loadTodayBookings]);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshFleet(),
        refreshInsights(),
        loadTodayBookings(),
        loadInvoices(),
      ]);
      setLastManualSyncAt(new Date().toISOString());
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshFleet, refreshInsights, loadTodayBookings, loadInvoices]);

  useEffect(() => {
    const onHandover = () => {
      void loadTodayBookings();
    };
    window.addEventListener('handover:completed', onHandover as EventListener);
    return () => window.removeEventListener('handover:completed', onHandover as EventListener);
  }, [loadTodayBookings]);

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
        setStationsApi(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setStationsApi([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!selectedStationId) return;
    if (stationsApi.length === 0) return;
    const byId = stationsApi.some((s) => s.id === selectedStationId);
    if (byId) return;
    const byLegacyName = stationsApi.find((s) => s.name === selectedStationId);
    if (byLegacyName) {
      setSelectedStationId(byLegacyName.id);
      try {
        localStorage.setItem(STATION_FILTER_STORAGE_KEY, byLegacyName.id);
      } catch {
        /* ignore */
      }
      return;
    }
    setSelectedStationId(null);
    try {
      localStorage.removeItem(STATION_FILTER_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [stationsApi, selectedStationId]);

  const applyStationFilter = useCallback((stationId: string | null) => {
    setSelectedStationId(stationId);
    setIsStationDropdownOpen(false);
    try {
      if (stationId) localStorage.setItem(STATION_FILTER_STORAGE_KEY, stationId);
      else localStorage.removeItem(STATION_FILTER_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const setOperatorFocusMode = useCallback((enabled: boolean) => {
    setOperatorFocusModeState(enabled);
    persistOperatorFocusModePreference(enabled);
  }, []);

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

  const filteredFleetVehicles = useMemo(
    () => filterFleetByStation(fleetVehicles, selectedStationId),
    [fleetVehicles, selectedStationId],
  );

  const fleetById = useMemo(() => {
    const m = new Map<string, (typeof fleetVehicles)[0]>();
    for (const v of filteredFleetVehicles) m.set(v.id, v);
    return m;
  }, [filteredFleetVehicles]);

  const { alerts: vehicleHealthAlerts, loading: vehicleHealthLoading } =
    useVehicleHealthAlerts(filteredFleetVehicles);

  const { alerts: orgVehicleHealthAlerts } = useVehicleHealthAlerts(fleetVehicles);

  const orgReadyOptions = useMemo<ReadyToRentOptions>(() => {
    const blockedVehicleIds = new Set<string>();
    for (const v of fleetVehicles) {
      if (healthMap.get(v.id)?.rental_blocked) blockedVehicleIds.add(v.id);
    }
    const healthRiskVehicleIds = new Set(orgVehicleHealthAlerts.map((a) => a.vehicleId));
    return { blockedVehicleIds, healthRiskVehicleIds };
  }, [fleetVehicles, healthMap, orgVehicleHealthAlerts]);

  const healthRiskVehicleIds = useMemo(
    () => new Set(vehicleHealthAlerts.map((a) => a.vehicleId)),
    [vehicleHealthAlerts],
  );

  const blockedVehicleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const v of filteredFleetVehicles) {
      if (healthMap.get(v.id)?.rental_blocked) ids.add(v.id);
    }
    return ids;
  }, [filteredFleetVehicles, healthMap]);

  const readyOptions = useMemo<ReadyToRentOptions>(
    () => ({ blockedVehicleIds, healthRiskVehicleIds }),
    [blockedVehicleIds, healthRiskVehicleIds],
  );

  const focusNotReadyVehicles = useMemo(
    () => getFocusNotReadyVehicles(filteredFleetVehicles, readyOptions, locale),
    [filteredFleetVehicles, readyOptions, locale],
  );

  const selectedStationName = useMemo(() => {
    if (!selectedStationId) return null;
    return stationsApi.find((s) => s.id === selectedStationId)?.name ?? null;
  }, [selectedStationId, stationsApi]);

  const availableVehicles = useMemo(
    () => filteredFleetVehicles.filter((v) => v.status === 'Available'),
    [filteredFleetVehicles],
  );
  const reservedVehicles = useMemo(
    () => filteredFleetVehicles.filter((v) => v.status === 'Reserved'),
    [filteredFleetVehicles],
  );
  const activeRentedVehicles = useMemo(
    () => filteredFleetVehicles.filter((v) => v.status === 'Active Rented'),
    [filteredFleetVehicles],
  );

  const vehicleLookup = useMemo(() => buildVehicleLookup(fleetVehicles), [fleetVehicles]);

  const pickupItems = useMemo(
    () =>
      mapPickupItems(
        todayPickupsApi,
        vehicleLookup,
        locale,
        selectedStationId,
        healthRiskVehicleIds,
      ),
    [todayPickupsApi, vehicleLookup, locale, selectedStationId, healthRiskVehicleIds],
  );
  const returnItems = useMemo(
    () =>
      mapReturnItems(
        todayReturnsApi,
        vehicleLookup,
        locale,
        selectedStationId,
        healthRiskVehicleIds,
      ),
    [todayReturnsApi, vehicleLookup, locale, selectedStationId, healthRiskVehicleIds],
  );

  const pickupNeedsCleaning = pickupItems.filter((p) => p.needsCleaning).length;
  const pickupAlerts = pickupItems.filter((p) => p.hasAlert).length;
  const pickupOverdueCount = pickupItems.filter((p) => p.isOverdue && !p.done).length;
  const returnErrors = returnItems.filter((r) => r.hasError).length;
  const returnKmExceeded = returnItems.filter((r) => r.kmExceeded).length;
  const returnOverdue = returnItems.filter((r) => r.isOverdue && !r.done).length;
  const returnAlerts = returnItems.filter((r) => r.hasAlert).length;

  const operationsInput = useMemo(
    () => ({
      locale,
      timeframe,
      pickupItems,
      returnItems,
      fleetById,
      vehicleHealthAlerts,
    }),
    [locale, timeframe, pickupItems, returnItems, fleetById, vehicleHealthAlerts],
  );

  const nowNextTimeline = useMemo(
    () => buildNowNextTimeline(operationsInput),
    [operationsInput],
  );

  const todayOperations = useMemo(
    () => buildTodayOperations(operationsInput),
    [operationsInput],
  );

  const handleConfirmPickup = useCallback(
    (p: PickupTileItem) => {
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
    },
    [openHandover],
  );

  const handleConfirmReturn = useCallback(
    (r: ReturnTileItem) => {
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
    },
    [openHandover],
  );

  const intlLocale = useMemo(() => resolveIntlLocale(locale), [locale]);

  const fmtMonthlyEUR = useCallback(
    (cents: number) =>
      new Intl.NumberFormat(intlLocale, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(cents / 100),
    [intlLocale],
  );

  const filteredVehicleIds = useMemo(
    () => new Set(filteredFleetVehicles.map((v) => v.id)),
    [filteredFleetVehicles],
  );

  const monthlyKpis = useMemo(
    () => computeMonthlyKpis(invoicesApi, intlLocale, selectedStationId ? filteredVehicleIds : null),
    [invoicesApi, intlLocale, selectedStationId, filteredVehicleIds],
  );

  const activateKpiTarget = useCallback(
    (target: OperationalKpiTarget) => {
      switch (target) {
        case 'ready-to-rent':
          setFleetBoardFilter('ready');
          setFleetStatusTab('Available');
          break;
        case 'active-rented':
          setFleetBoardFilter('rented');
          setFleetStatusTab('Active Rented');
          break;
        case 'maintenance':
          setFleetBoardFilter('maintenance');
          setFleetStatusTab('Maintenance');
          break;
        case 'overdue-returns':
          setFleetBoardFilter('overdue');
          setTodayTab('Return Today');
          break;
        case 'due-soon':
          setFleetBoardFilter('due-soon');
          setTodayTab('Return Today');
          break;
        case 'critical-alerts':
          setFleetBoardFilter('critical');
          setCriticalOnly(true);
          break;
        default:
          break;
      }
      openDrilldown({ type: 'kpi', target });
    },
    [openDrilldown],
  );

  const dateLabel = useMemo(() => {
    return new Date().toLocaleDateString(intlLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [intlLocale]);

  const fleetBoard = useMemo(
    () =>
      buildFleetBoard({
        locale,
        vehicles: filteredFleetVehicles,
        healthMap,
        healthAlerts: vehicleHealthAlerts,
        filter: fleetBoardFilter,
      }),
    [locale, filteredFleetVehicles, healthMap, vehicleHealthAlerts, fleetBoardFilter],
  );

  const fleetStateTabs = useMemo(
    () =>
      buildFleetStateTabs(filteredFleetVehicles, availableVehicles, reservedVehicles, activeRentedVehicles, {
        available: t('dashboard.available'),
        reserved: t('dashboard.reserved'),
        rented: t('dashboard.rented'),
        maintenance: t('dashboard.maintenanceTab'),
      }),
    [
      filteredFleetVehicles,
      availableVehicles,
      reservedVehicles,
      activeRentedVehicles,
      t,
    ],
  );

  const financeKpis = useMemo(
    () =>
      buildFinanceKpis(monthlyKpis, fmtMonthlyEUR, {
        revenue: t('dashboard.revenue'),
        profit: t('dashboard.profit'),
        expenses: t('dashboard.expenses'),
        invoicesShort: (count) => t('dashboard.invoicesShort', { count }),
      }),
    [monthlyKpis, fmtMonthlyEUR, t],
  );

  const dashboardNotifications: DashboardNotificationItem[] = [];

  const dataFreshness = useMemo(
    () => ({
      fleetLoading,
      fleetCountdownSec,
      insightsLoading,
      insightsStale: insightsResponse?.stale ?? false,
      insightsGeneratedAt: insightsResponse?.generatedAt ?? null,
      insightsError,
      todayBookingsLoaded,
      todayBookingsError,
      invoicesLoaded,
      invoicesError,
    }),
    [
      fleetLoading,
      fleetCountdownSec,
      insightsLoading,
      insightsResponse?.stale,
      insightsResponse?.generatedAt,
      insightsError,
      todayBookingsLoaded,
      todayBookingsError,
      invoicesLoaded,
      invoicesError,
    ],
  );


  const actionQueueLoading = insightsLoading || vehicleHealthLoading || !todayBookingsLoaded;
  const actionQueueError = insightsError;

  const actionQueueEmptySummary = useMemo(
    () =>
      buildActionQueueEmptySummary({
        locale,
        readyToRentCount: countReadyToRent(availableVehicles, readyOptions),
        upcomingHandovers:
          pickupItems.filter((p) => !p.done).length + returnItems.filter((r) => !r.done).length,
        syncStatusLabel: syncStatusLabel(
          deriveDataSyncStatus(dataFreshness, !!orgId),
          locale,
        ),
      }),
    [
      locale,
      availableVehicles,
      readyOptions,
      pickupItems,
      returnItems,
      dataFreshness,
      orgId,
    ],
  );

  const stationHealth = useMemo(
    () =>
      sortStationCommandSummaries(
        buildEnhancedStationHealth({
          stations: stationsApi,
          fleetVehicles,
          healthAlerts: orgVehicleHealthAlerts,
          healthMap,
          todayPickups: todayPickupsApi,
          todayReturns: todayReturnsApi,
        }),
      ),
    [
      stationsApi,
      fleetVehicles,
      orgVehicleHealthAlerts,
      healthMap,
      todayPickupsApi,
      todayReturnsApi,
    ],
  );

  const unassignedFleet = useMemo(
    () => buildUnassignedFleetSummary(fleetVehicles),
    [fleetVehicles],
  );

  const vehicleTelemetryFreshness = useMemo(
    () =>
      computeVehicleTelemetryFreshness({
        vehicles: filteredFleetVehicles,
        dataFreshness,
        orgActive: !!orgId,
        locale,
        lastManualSyncAt,
      }),
    [filteredFleetVehicles, dataFreshness, orgId, locale, lastManualSyncAt],
  );

  const dataTrust = useMemo(
    () =>
      buildDataTrustLayer({
        locale,
        orgActive: !!orgId,
        fleetLoading,
        fleetVehicleCount: filteredFleetVehicles.length,
        fleetCountdownSec,
        telemetry: vehicleTelemetryFreshness,
        dataFreshness,
        todayBookingsError,
        invoicesError,
        lastManualSyncAt,
      }),
    [
      locale,
      orgId,
      fleetLoading,
      filteredFleetVehicles.length,
      fleetCountdownSec,
      vehicleTelemetryFreshness,
      dataFreshness,
      todayBookingsError,
      invoicesError,
      lastManualSyncAt,
    ],
  );

  const fleetReadiness = useMemo(
    () =>
      computeFleetReadiness({
        vehicles: filteredFleetVehicles,
        availableVehicles,
        healthMap,
        healthAlerts: vehicleHealthAlerts,
        pickupItems,
        returnItems,
        telemetry: vehicleTelemetryFreshness,
        locale,
        fleetLoading,
        readyOptions,
      }),
    [
      filteredFleetVehicles,
      availableVehicles,
      healthMap,
      vehicleHealthAlerts,
      pickupItems,
      returnItems,
      vehicleTelemetryFreshness,
      locale,
      fleetLoading,
      readyOptions,
    ],
  );

  const businessPulse = useMemo(
    () =>
      buildBusinessPulseSnapshot({
        locale,
        intlLocale,
        invoices: invoicesApi,
        invoicesLoaded,
        invoicesError,
        fleetLoaded: !fleetLoading,
        fleetTotal: filteredFleetVehicles.length,
        activeRentedCount: activeRentedVehicles.length,
        availableCount: availableVehicles.length,
        readyCount: countReadyToRent(availableVehicles, readyOptions),
        stationScoped: !!selectedStationId,
        fmtEUR: fmtMonthlyEUR,
        labels: {
          revenue: t('dashboard.revenue'),
          profit: t('dashboard.estimatedProfit'),
          expenses: t('dashboard.expenses'),
          unpaid: locale === 'de' ? 'Offene Forderungen' : 'Open receivables',
          utilization: t('dashboard.utilization'),
          revenuePerVehicle: locale === 'de' ? 'Umsatz / Fahrzeug' : 'Revenue / vehicle',
          lostRevenueRisk: locale === 'de' ? 'Überfällige Forderungen' : 'Overdue receivables',
          invoicesShort: (count) => t('dashboard.invoicesShort', { count }),
          noData: locale === 'de' ? 'Keine Daten' : 'No data',
          notEnoughBasis: locale === 'de' ? 'Keine belastbare Basis' : 'Not enough basis',
          emptyTitle: locale === 'de' ? 'Noch keine Finanzdaten' : 'No financial data yet',
          emptySubtitle:
            locale === 'de'
              ? 'Sobald Rechnungen vorliegen, erscheinen MTD-Kennzahlen hier.'
              : 'MTD metrics appear here once invoices are available.',
          stationNote:
            locale === 'de'
              ? 'Nur fahrzeugbezogene Rechnungen im Stations-Scope'
              : 'Vehicle-linked invoices in station scope only',
        },
        vehicleIds: selectedStationId ? filteredVehicleIds : null,
      }),
    [
      locale,
      intlLocale,
      invoicesApi,
      invoicesLoaded,
      invoicesError,
      fleetLoading,
      filteredFleetVehicles.length,
      activeRentedVehicles.length,
      availableVehicles,
      selectedStationId,
      fmtMonthlyEUR,
      t,
      filteredVehicleIds,
      readyOptions,
    ],
  );

  const derivedOperationalInsights = useMemo(
    () =>
      deriveOperationalInsights({
        locale,
        vehicles: filteredFleetVehicles,
        fleetById,
        pickupItems,
        returnItems,
        healthAlerts: vehicleHealthAlerts,
        healthMap,
        telemetry: vehicleTelemetryFreshness,
        fleetLoading,
        todayBookingsLoaded,
      }),
    [
      locale,
      filteredFleetVehicles,
      fleetById,
      pickupItems,
      returnItems,
      vehicleHealthAlerts,
      healthMap,
      vehicleTelemetryFreshness,
      fleetLoading,
      todayBookingsLoaded,
    ],
  );

  const predictiveOperationsInsights = useMemo(
    () =>
      derivePredictiveOperationsInsights({
        locale,
        stationFilter: selectedStationId,
        vehicles: filteredFleetVehicles,
        fleetById,
        stations: stationsApi,
        pickupItems,
        returnItems,
        todayPickups: todayPickupsApi,
        healthAlerts: vehicleHealthAlerts,
        healthMap,
        telemetry: vehicleTelemetryFreshness,
        readyOptions,
        insights,
        fleetLoading,
        todayBookingsLoaded,
      }),
    [
      locale,
      selectedStationId,
      filteredFleetVehicles,
      fleetById,
      stationsApi,
      pickupItems,
      returnItems,
      todayPickupsApi,
      vehicleHealthAlerts,
      healthMap,
      vehicleTelemetryFreshness,
      readyOptions,
      insights,
      fleetLoading,
      todayBookingsLoaded,
    ],
  );

  const actionQueue = useMemo(
    () =>
      buildUnifiedActionQueue({
        locale,
        stationFilter: selectedStationId,
        fleetById,
        insights,
        vehicleHealthAlerts,
        pickupItems,
        returnItems,
        notifications: dashboardNotifications,
        derivedInsights: derivedOperationalInsights,
        predictiveInsights: predictiveOperationsInsights,
        readyToRentCount: countReadyToRent(availableVehicles, readyOptions),
        syncStatusLabel: syncStatusLabel(deriveDataSyncStatus(dataFreshness, !!orgId), locale),
      }),
    [
      locale,
      selectedStationId,
      fleetById,
      insights,
      vehicleHealthAlerts,
      pickupItems,
      returnItems,
      derivedOperationalInsights,
      predictiveOperationsInsights,
      availableVehicles,
      readyOptions,
      dataFreshness,
      orgId,
      dashboardNotifications,
    ],
  );

  const stationCommandDetail = useMemo(() => {
    if (!selectedStationId) return null;

    const baseInput = {
      stationId: selectedStationId,
      fleetVehicles: filteredFleetVehicles,
      healthMap,
      healthAlerts: vehicleHealthAlerts,
      readyOptions,
      pickupItems,
      returnItems,
      nowNextTimeline,
      actionQueue,
    };

    const detail = buildStationCommandDetail({
      ...baseInput,
      stationHealth,
    });
    if (detail) return detail;

    return buildStationCommandDetail({
      ...baseInput,
      stationHealth: [
        buildFallbackStationSummary({
          stationId: selectedStationId,
          stationName: selectedStationName,
          fleetVehicles: filteredFleetVehicles,
          locale,
        }),
      ],
    });
  }, [
    selectedStationId,
    stationHealth,
    filteredFleetVehicles,
    healthMap,
    vehicleHealthAlerts,
    readyOptions,
    pickupItems,
    returnItems,
    nowNextTimeline,
    actionQueue,
    selectedStationName,
    locale,
  ]);

  const controlCenterKpis = useMemo(
    () =>
      attachKpiTrustHints(
        buildControlCenterKpis({
          locale,
          timeframe,
          todayBookingsLoaded,
          todayBookingsError,
          fleetLoaded: !fleetLoading,
          availableVehicles,
          activeRentedCount: activeRentedVehicles.length,
          maintenanceCount: countMaintenanceVehicles(filteredFleetVehicles),
          pickupItems,
          returnItems,
          overdueReturns: returnOverdue,
          criticalAlerts: insightsLoading
            ? null
            : countScopedCriticalInsights(insights, filteredVehicleIds, !!selectedStationId),
          insightsLoaded: !insightsLoading && !insightsError,
          readyOptions,
        }),
        dataTrust,
      ),
    [
      locale,
      timeframe,
      todayBookingsLoaded,
      todayBookingsError,
      fleetLoading,
      availableVehicles,
      activeRentedVehicles.length,
      filteredFleetVehicles,
      pickupItems,
      returnItems,
      returnOverdue,
      insightsLoading,
      insightsError,
      insights,
      filteredVehicleIds,
      selectedStationId,
      readyOptions,
      dataTrust,
    ],
  );

  const controlCenterStatus = useMemo(
    () =>
      buildControlCenterStatus({
        stationLabel: selectedStationName ?? t('dashboard.allStations'),
        vehicleCount: filteredFleetVehicles.length,
        importantEventCount: countImportantEvents({
          insights,
          pickupItems,
          returnItems,
          filteredVehicleIds,
          stationScoped: !!selectedStationId,
        }),
        lastSyncLabel: formatLastSyncLabel(
          insightsResponse?.generatedAt ?? null,
          lastManualSyncAt,
          locale,
        ),
        syncStatus: deriveDataSyncStatus(dataFreshness, !!orgId),
      }),
    [
      selectedStationName,
      t,
      filteredFleetVehicles.length,
      insights,
      pickupItems,
      returnItems,
      filteredVehicleIds,
      selectedStationId,
      insightsResponse?.generatedAt,
      lastManualSyncAt,
      locale,
      dataFreshness,
      orgId,
    ],
  );

  const drilldown = useMemo(() => {
    if (!drilldownTarget) return null;
    return buildDashboardDrilldown(
      {
        locale,
        selectedStationName,
        fleetBoard,
        filteredFleetVehicles,
        pickupItems,
        returnItems,
        actionQueue,
        actionQueueLoading,
        vehicleHealthAlerts,
        invoices: invoicesApi,
        invoicesLoaded,
        invoicesError,
        nowNextTimeline,
        stationHealth,
        dataFreshness,
        filteredVehicleIds,
      },
      drilldownTarget,
    );
  }, [
    drilldownTarget,
    locale,
    selectedStationName,
    fleetBoard,
    filteredFleetVehicles,
    pickupItems,
    returnItems,
    actionQueue,
    actionQueueLoading,
    vehicleHealthAlerts,
    invoicesApi,
    invoicesLoaded,
    invoicesError,
    nowNextTimeline,
    stationHealth,
    dataFreshness,
    filteredVehicleIds,
  ]);

  return {
    systemDark,
    locale,
    t,
    dateLabel,
    controlCenterStatus,
    controlCenterKpis,
    activateKpiTarget,
    drilldownTarget,
    drilldown,
    openDrilldown,
    closeDrilldown,
    criticalOnly,
    setCriticalOnly,
    operatorFocusMode,
    setOperatorFocusMode,
    focusNotReadyVehicles,
    timeframe,
    setTimeframe,
    isRefreshing,
    refreshAll,
    stations: stationsApi,
    selectedStationId,
    selectedStationName,
    isStationDropdownOpen,
    stationDropdownRef,
    setIsStationDropdownOpen,
    applyStationFilter,
    fleetVehicles,
    filteredFleetVehicles,
    availableVehicles,
    reservedVehicles,
    activeRentedVehicles,
    invoicesLoaded,
    invoicesError,
    monthlyKpis,
    fmtMonthlyEUR,
    financeKpis,
    fleetStatusTab,
    setFleetStatusTab,
    fleetStateTabs,
    fleetBoardFilter,
    setFleetBoardFilter,
    fleetBoard,
    todayTab,
    setTodayTab,
    pickupItems,
    returnItems,
    pickupNeedsCleaning,
    pickupAlerts,
    pickupOverdueCount,
    returnErrors,
    returnKmExceeded,
    returnOverdue,
    returnAlerts,
    handleConfirmPickup,
    handleConfirmReturn,
    dashboardNotifications,
    actionQueue,
    actionQueueLoading,
    actionQueueError,
    actionQueueEmptySummary,
    todayBookingsLoaded,
    todayBookingsError,
    nowNextTimeline,
    todayOperations,
    stationHealth,
    stationCommandDetail,
    unassignedFleet,
    dataFreshness,
    dataTrust,
    vehicleTelemetryFreshness,
    businessPulse,
    fleetReadiness,
  };
}
