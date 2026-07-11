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
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import { buildDashboardNotificationsFromInsights } from './dashboardNotificationAdapter';
import type { DashboardNotificationItem } from './dashboardNotificationTypes';
import {
  dashboardStationIdToFilter,
  stationFilterToDashboardId,
} from '../../lib/fleet-station-filter';
import { useFleetMapStore } from '../../stores/useFleetMapStore';
import {
  type DashboardInvoice,
  type DashboardViewModel,
  type DashboardViewProps,
  type TodayBookingApiRow,
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
import { deriveOperationalInsights } from './deriveOperationalInsights';
import { derivePredictiveOperationsInsights } from './derivePredictiveOperationsInsights';
import {
  getFocusNotReadyVehiclesFromRuntime,
  persistOperatorFocusModePreference,
} from './dashboardFocusMode';
import { buildNowNextTimeline, buildTodayOperations } from './operationsBuilder';
import {
  buildControlCenterStatus,
  buildVehicleLookup,
  countImportantEvents,
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
import type { DashboardDrilldownTarget, StationDrilldownMetric } from './dashboardDrilldownTypes';
import { buildDataTrustLayer } from './dataTrustBuilder';
import {
  buildBusinessPulseSlices,
  buildDashboardRuntimeModel,
  type BusinessMetricId,
  type BusinessPulseSlice,
  type DashboardRuntimeModel,
  type DashboardSliceId,
} from './runtime';

const BUSINESS_METRIC_IDS: ReadonlySet<string> = new Set<BusinessMetricId>([
  'revenue',
  'profit',
  'expenses',
  'open-receivables',
  'overdue-receivables',
  'paid-invoices',
  'draft-invoices',
  'failed-payments',
]);

function sliceIdFromFleetLane(lane: FleetBoardLane): DashboardSliceId | null {
  if (lane === 'ready') return 'ready-to-rent';
  if (lane === 'rented') return 'active-rented';
  if (lane === 'due-soon') return 'due-soon';
  if (lane === 'overdue') return 'overdue-returns';
  if (lane === 'maintenance' || lane === 'blocked') return 'blocked-maintenance';
  if (lane === 'critical') return 'critical-alerts';
  return null;
}

function sliceIdFromStationMetric(metric: StationDrilldownMetric): DashboardSliceId | null {
  if (metric === 'ready') return 'ready-to-rent';
  if (metric === 'rented') return 'active-rented';
  if (metric === 'overdue') return 'overdue-returns';
  if (metric === 'blocked') return 'blocked-maintenance';
  if (metric === 'critical') return 'critical-alerts';
  if (metric === 'due-today' || metric === 'pickups' || metric === 'returns') return 'due-soon';
  return null;
}

function activeDashboardSliceIdFromTarget(target: DashboardDrilldownTarget | null): DashboardSliceId | null {
  if (!target) return null;
  if (target.type === 'kpi') return target.target;
  if (target.type === 'fleet-lane') return sliceIdFromFleetLane(target.lane);
  if (target.type === 'station-metric') return sliceIdFromStationMetric(target.metric);
  return null;
}

function activeBusinessMetricIdFromTarget(target: DashboardDrilldownTarget | null): BusinessMetricId | null {
  if (!target || target.type !== 'business-metric') return null;
  if (target.metricId === 'unpaid') return 'open-receivables';
  if (target.metricId === 'lost-revenue-risk') return 'overdue-receivables';
  return BUSINESS_METRIC_IDS.has(target.metricId) ? (target.metricId as BusinessMetricId) : null;
}

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

  const stationFilter = useFleetMapStore((state) => state.filters.stationId);
  const setStationFilter = useFleetMapStore((state) => state.setStationFilter);
  const selectedStationId = useMemo(
    () => stationFilterToDashboardId(stationFilter),
    [stationFilter],
  );
  const [stationsApi, setStationsApi] = useState<Station[]>([]);
  const [isStationDropdownOpen, setIsStationDropdownOpen] = useState(false);
  const stationDropdownRef = useRef<HTMLDivElement | null>(null);
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
  const [dashboardNow, setDashboardNow] = useState(() => new Date());

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
      const syncedAt = new Date();
      setDashboardNow(syncedAt);
      setLastManualSyncAt(syncedAt.toISOString());
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

  const applyStationFilter = useCallback((stationId: string | null) => {
    setStationFilter(dashboardStationIdToFilter(stationId));
    setIsStationDropdownOpen(false);
  }, [setStationFilter]);

  useEffect(() => {
    if (!selectedStationId) return;
    if (stationsApi.length === 0) return;
    const byId = stationsApi.some((s) => s.id === selectedStationId);
    if (byId) return;
    const byLegacyName = stationsApi.find((s) => s.name === selectedStationId);
    if (byLegacyName) {
      applyStationFilter(byLegacyName.id);
      return;
    }
    applyStationFilter(null);
  }, [stationsApi, selectedStationId, applyStationFilter]);

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

  const runtimeDueSoonMinutes = 60;

  const dashboardRuntime = useMemo<DashboardRuntimeModel>(
    () =>
      buildDashboardRuntimeModel({
        locale,
        fleetVehicles: filteredFleetVehicles,
        availableVehicles,
        reservedVehicles,
        activeRentedVehicles,
        pickupItems,
        returnItems,
        insights,
        blockedVehicleIds,
        healthRiskVehicleIds,
        healthMap,
        now: dashboardNow,
        dueSoonMinutes: runtimeDueSoonMinutes,
        telemetrySoftOfflineHours: 24,
        telemetryHardOfflineHours: 48,
      }),
    [
      locale,
      filteredFleetVehicles,
      availableVehicles,
      reservedVehicles,
      activeRentedVehicles,
      pickupItems,
      returnItems,
      insights,
      blockedVehicleIds,
      healthRiskVehicleIds,
      healthMap,
      dashboardNow,
      runtimeDueSoonMinutes,
    ],
  );

  const focusNotReadyVehicles = useMemo(
    () => getFocusNotReadyVehiclesFromRuntime(dashboardRuntime.vehicleStates, locale),
    [dashboardRuntime, locale],
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
      vehicleStates: dashboardRuntime.vehicleStates,
    }),
    [locale, timeframe, pickupItems, returnItems, fleetById, vehicleHealthAlerts, dashboardRuntime],
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

  const filteredVehicleIds = useMemo(
    () => new Set(filteredFleetVehicles.map((v) => v.id)),
    [filteredFleetVehicles],
  );

  const openSliceDrilldown = useCallback(
    (sliceId: DashboardSliceId) => {
      if (sliceId === 'critical-alerts') {
        setCriticalOnly(true);
      }
      openDrilldown({ type: 'kpi', target: sliceId });
    },
    [openDrilldown],
  );

  const openBusinessMetricDrilldown = useCallback(
    (metricId: BusinessMetricId) => {
      openDrilldown({ type: 'business-metric', metricId });
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

  const dashboardNotifications = useMemo<DashboardNotificationItem[]>(
    () =>
      buildDashboardNotificationsFromInsights(insights, {
        generatedAt: insightsResponse?.generatedAt ?? null,
        intlLocale,
      }),
    [insights, insightsResponse?.generatedAt, intlLocale],
  );

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
        readyToRentCount: dashboardRuntime.slices['ready-to-rent'].count ?? 0,
        upcomingHandovers:
          pickupItems.filter((p) => !p.done).length + returnItems.filter((r) => !r.done).length,
        syncStatusLabel: syncStatusLabel(
          deriveDataSyncStatus(dataFreshness, !!orgId),
          locale,
        ),
      }),
    [
      locale,
      dashboardRuntime,
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
        runtime: dashboardRuntime,
        }),
      ),
    [
      stationsApi,
      fleetVehicles,
      orgVehicleHealthAlerts,
      healthMap,
      todayPickupsApi,
      todayReturnsApi,
      dashboardRuntime,
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
        vehicleStates: dashboardRuntime.vehicleStates,
        dataFreshness,
        orgActive: !!orgId,
        locale,
        lastManualSyncAt,
      }),
    [filteredFleetVehicles, dashboardRuntime, dataFreshness, orgId, locale, lastManualSyncAt],
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
        healthMap,
        pickupItems,
        returnItems,
        telemetry: vehicleTelemetryFreshness,
        locale,
        fleetLoading,
        runtime: dashboardRuntime,
      }),
    [
      filteredFleetVehicles,
      healthMap,
      pickupItems,
      returnItems,
      vehicleTelemetryFreshness,
      locale,
      fleetLoading,
      dashboardRuntime,
    ],
  );

  const businessPulseSlices = useMemo<Record<BusinessMetricId, BusinessPulseSlice>>(
    () =>
      buildBusinessPulseSlices({
        invoices: invoicesApi,
        locale,
        now: dashboardNow,
      }),
    [invoicesApi, locale, dashboardNow],
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
        dashboardRuntime,
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
      dashboardRuntime,
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
        dashboardRuntime,
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
      dashboardRuntime,
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
        notifications: [],
        derivedInsights: derivedOperationalInsights,
        predictiveInsights: predictiveOperationsInsights,
        dashboardRuntime,
        readyToRentCount: dashboardRuntime.slices['ready-to-rent'].count ?? 0,
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
      dashboardRuntime,
      dataFreshness,
      orgId,
    ],
  );

  const stationCommandDetail = useMemo(() => {
    if (!selectedStationId) return null;

    const baseInput = {
      stationId: selectedStationId,
      fleetVehicles: filteredFleetVehicles,
      vehicleStates: dashboardRuntime.vehicleStates,
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
          vehicleStates: dashboardRuntime.vehicleStates,
          locale,
        }),
      ],
    });
  }, [
    selectedStationId,
    stationHealth,
    filteredFleetVehicles,
    dashboardRuntime,
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

  const activeDashboardSliceId = useMemo(
    () => activeDashboardSliceIdFromTarget(drilldownTarget),
    [drilldownTarget],
  );

  const activeBusinessMetricId = useMemo(
    () => activeBusinessMetricIdFromTarget(drilldownTarget),
    [drilldownTarget],
  );

  return {
    systemDark,
    locale,
    t,
    dateLabel,
    controlCenterStatus,
    openSliceDrilldown,
    openBusinessMetricDrilldown,
    drilldownTarget,
    openDrilldown,
    closeDrilldown,
    dashboardRuntime,
    dashboardSlices: dashboardRuntime.slices,
    vehicleRuntimeStates: dashboardRuntime.vehicleStates,
    businessPulseSlices,
    activeDashboardSliceId,
    activeBusinessMetricId,
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
    healthMap,
    availableVehicles,
    reservedVehicles,
    activeRentedVehicles,
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
    fleetReadiness,
  };
}
