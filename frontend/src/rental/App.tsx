
import { Icon } from './components/ui/Icon';
import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../components/patterns/chrome-tab-bar';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAppTheme } from '../context/AppThemeContext';
import { EmptyState } from '../components/patterns';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { TripsView } from './components/TripsView';
import { DashboardView } from './components/DashboardView';
import { BookingsView } from './components/BookingsView';
import { FinancialInsightsView } from './components/FinancialInsightsView';
import { HealthErrorsView } from './components/HealthErrorsView';
import { FleetHubView, type FleetHealthServiceNavState, type FleetTab, type FleetTabInput } from './components/FleetHubView';
import {
  applyFleetHealthServiceNavToUrl,
  fleetSubTabFromServiceCenterNav,
  normalizeFleetHealthServiceNavState,
  normalizeFleetHealthServiceTab,
  normalizeFleetTab,
  parseFleetHealthServiceNavFromSearch,
  persistFleetHealthServiceNav,
  readPersistedFleetHealthServiceNav,
} from './components/fleet-health-service/fleet-health-service.types';
import { DamagesView } from './components/DamagesView';
import { DocumentsView } from './components/DocumentsView';
import { CustomersView } from './components/CustomersView';
import { SettingsView } from './components/SettingsView';
import {
  isLegacyFleetConnectionSettingsTab,
  LEGACY_SETTINGS_TAB_FLEET_CONNECTION,
  type SettingsTab,
  type SettingsTabInput,
} from './components/settings/settingsTypes';
import { useStationsV2FeatureFlags } from './hooks/useStationsV2FeatureFlags';
import { StationsView } from './components/stations/StationsView';
import { StationDetailView } from './components/stations/StationDetailView';
import { NewBookingView } from './components/NewBookingView';
import { FinanceView } from './components/FinanceView';
import { FinesView } from './components/FinesView';
import type { FinanceTab } from './components/finance-navigation';
import {
  parseFinanceViewFromUrl,
  stripLegacyBillingCustomerPaymentsParams,
} from './components/finance-navigation';
import { TasksView } from './components/TasksView';
import { VendorDetailView } from './components/VendorDetailView';
import { CustomerDetailView } from './components/CustomerDetailView';
import { VehicleBookingsView } from './components/VehicleBookingsView';
import { VehicleTasksView } from './components/VehicleTasksView';
import { VehicleData } from './data/vehicles';
import { deriveVehicleDetailHeaderEditStatus } from './lib/vehicle-detail-header-status';
import type { VehicleOperationalUiStatus } from './lib/vehicle-detail-header-status';
import {
  classifyVehicleCleaningStatusMutationError,
  deriveVehicleDetailHeaderCleaningStatus,
  mutateVehicleCleaningStatus,
  resolveCleaningStatusMutationSideEffects,
  shouldWarnBeforeCleaningStatusChange,
  type VehicleCleaningUiStatus,
} from './lib/vehicle-cleaning-status-mutation';
import {
  classifyVehicleOperationalStatusMutationError,
  mutateVehicleOperationalStatus,
  shouldWarnBeforeVehicleOperationalStatusChange,
  vehicleOperationalStatusMutationSuccessMessage,
} from './lib/vehicle-operational-status-mutation';
import {
  invalidateVehicleOperationalAfterBookingChange,
  invalidateVehicleOperationalState,
} from './lib/vehicle-operational-query';
import { RentalProvider, useRentalOrg } from './RentalContext';
import { FleetProvider, useFleetVehicles } from './FleetContext';
import { useFleetMapStore } from './stores/useFleetMapStore';
import { DashboardInsightsProvider } from './DashboardInsightsContext';
import { HandoverProvider } from './HandoverContext';
import { Toaster } from 'sonner';
import { useLiveVehicleTelemetry } from './hooks/useLiveVehicleTelemetry';
import { useDocumentVisible, useNetworkOnline } from './hooks/useBrowserTabSignals';
import { resolveVehicleDetailPollingGates } from './lib/vehicle-detail-polling-policy';
import { useVehicleDetailPollingStore } from './stores/useVehicleDetailPollingStore';
import { LanguageProvider } from './i18n/LanguageContext';
import { DocumentUploadView } from './components/DocumentUploadView';
import { pushDocumentIntakeEntry, type DocumentIntakeEntryState } from './lib/document-intake-entry';
import { AIAssistantView } from './components/AIAssistantView';
import { SupportView } from './components/SupportView';
import { HelpCenterView } from './components/HelpCenterView';
import { DataAnalyseView } from './components/DataAnalyseView';
import { WorkflowAutomationView } from './components/WorkflowAutomationView';
import { WhatsAppBusinessView } from './components/WhatsAppBusinessView';
import { PartsAccessoriesView } from './components/PartsAccessoriesView';
import { InsurancesView } from './components/InsurancesView';
import { VoiceAssistantView } from './components/VoiceAssistantView';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { AppShell } from '../components/shell';
import {
  VehicleDetailHeader,
  VehicleOverviewTab,
  VehicleRequirementsTab,
  createVehicleOverviewNavigator,
  useVehicleOverviewSummary,
} from './components/vehicle-detail';
import type { ServiceCenterNavState } from './lib/service-center-navigation';
import {
  RentalEntityNavigationProvider,
  type RentalEntityNavigationValue,
} from './context/RentalEntityNavigationContext';
import type { VehicleDetailTab } from './lib/vehicle-overview.types';
import {
  applyVehicleDetailToUrl,
  clearVehicleDetailFromUrl,
  parseVehicleDetailFromUrl,
  VEHICLE_DETAIL_VIEWS,
} from './lib/vehicle-detail-navigation';

// Views that render the vehicle detail header (incl. <VehicleConnectionBadge>).
// The live-telemetry binder must cover the same set so the Online/Offline +
// Last-Signal indicator stays populated across tabs — not just Overview.
// Keep in sync with `VEHICLE_DETAIL_TAB_KEYS` in vehicle-overview-navigation.ts.

function VehicleLiveTelemetryBinder({
  vehicleId,
  orgId,
  isOverviewTab,
  canReadFleet,
}: {
  vehicleId: string | null;
  orgId: string;
  isOverviewTab: boolean;
  canReadFleet: boolean;
}) {
  const isDocumentVisible = useDocumentVisible();
  const isOnline = useNetworkOnline();
  const isOverviewMapVisible = useVehicleDetailPollingStore((s) => s.overviewMapVisible);
  const accessBlockReason = useVehicleDetailPollingStore((s) => s.telemetryAccessBlock);

  const gates = useMemo(
    () =>
      resolveVehicleDetailPollingGates({
        vehicleId,
        orgId,
        isVehicleDetailOpen: Boolean(vehicleId),
        isOverviewTab,
        isOverviewMapVisible,
        isDocumentVisible,
        isOnline,
        canReadFleet,
        accessBlockReason,
      }),
    [
      vehicleId,
      orgId,
      isOverviewTab,
      isOverviewMapVisible,
      isDocumentVisible,
      isOnline,
      canReadFleet,
      accessBlockReason,
    ],
  );

  useLiveVehicleTelemetry({ vehicleId, orgId, gates });
  return null;
}

type RentalSettingsTab = SettingsTab;

const RENTAL_SETTINGS_TAB_KEY = 'synqdrive_rental_settings_tab';
const RENTAL_SETTINGS_VIEW_KEY = 'synqdrive_rental_on_settings';
const RENTAL_FLEET_CONNECTIVITY_REDIRECT_KEY = 'synqdrive_rental_redirect_fleet_connectivity';
const RENTAL_FLEET_TAB_KEY = 'synqdrive_rental_fleet_tab';

function readPersistedFleetTab(): FleetTab {
  try {
    const raw = sessionStorage.getItem(RENTAL_FLEET_TAB_KEY);
    if (raw) return normalizeFleetTab(raw).tab;
  } catch {
    /* ignore */
  }
  return 'status';
}

function readPersistedSettingsTab(): RentalSettingsTab {
  try {
    const raw = sessionStorage.getItem(RENTAL_SETTINGS_TAB_KEY);
    if (isLegacyFleetConnectionSettingsTab(raw)) {
      sessionStorage.setItem(RENTAL_SETTINGS_TAB_KEY, 'company');
      sessionStorage.setItem(RENTAL_FLEET_CONNECTIVITY_REDIRECT_KEY, '1');
      return 'company';
    }
    const valid: RentalSettingsTab[] = [
      'account',
      'company',
      'users',
      'billing',
      'data-authorization',
      'legal-documents',
      'email-versand',
      'rental-rules',
    ];
    if (raw && valid.includes(raw as RentalSettingsTab)) return raw as RentalSettingsTab;
  } catch {
    /* ignore */
  }
  return 'company';
}

function consumeFleetConnectivityRedirectFlag(): boolean {
  try {
    if (sessionStorage.getItem(RENTAL_FLEET_CONNECTIVITY_REDIRECT_KEY) === '1') {
      sessionStorage.removeItem(RENTAL_FLEET_CONNECTIVITY_REDIRECT_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function readPersistedSettingsView(): boolean {
  try {
    return sessionStorage.getItem(RENTAL_SETTINGS_VIEW_KEY) === '1';
  } catch {
    return false;
  }
}

function RentalAppContent() {
  const { orgId, hasPermission } = useRentalOrg();
  const { fleetVehicles, loading: fleetLoading, refresh: refreshFleetVehicles } = useFleetVehicles();
  const fleetLastFetchedAt = useFleetMapStore((state) => state.lastFetchedAt);
  const fleetFetchError = useFleetMapStore((state) => state.error);
  const { uiEnabled: stationsUiEnabled, loading: stationsFlagsLoading } = useStationsV2FeatureFlags();

  useEffect(() => {
    if (!orgId) return;
    const loadUnread = async () => {
      try {
        const res = await api.support.unreadCountByOrg(orgId);
        setSupportUnreadCount(res.count ?? 0);
      } catch {
        /* optional endpoint */
      }
    };
    void loadUnread();
    const id = window.setInterval(() => void loadUnread(), 60_000);
    return () => window.clearInterval(id);
  }, [orgId]);
  const { isDarkMode } = useAppTheme();
  const [cleaningStatus, setCleaningStatus] = useState<VehicleCleaningUiStatus>('Clean');
  const [vehicleStatus, setVehicleStatus] = useState<VehicleOperationalUiStatus>('Available');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isCleaningDropdownOpen, setIsCleaningDropdownOpen] = useState(false);
  const [autoOpenNewTask, setAutoOpenNewTask] = useState(false);
  const [currentView, setCurrentView] = useState<'overview' | 'trips' | 'dashboard' | 'bookings' | 'health-errors' | 'fleet' | 'damages' | 'documents' | 'customers' | 'customer-detail' | 'tasks' | 'vendor-detail' | 'invoices' | 'fines' | 'price-tariffs' | 'customer-payments' | 'financial-insights' | 'settings' | 'new-booking' | 'stations' | 'station-detail' | 'vehicle-bookings' | 'vehicle-tasks' | 'vehicle-requirements' | 'document-upload' | 'ai-assistant' | 'support' | 'help-center' | 'data-analyse' | 'workflow-automation' | 'whatsapp-business' | 'parts-accessories' | 'insurances' | 'ai-voice-assistant'>(() => {
    if (typeof window !== 'undefined') {
      const vehicleDetail = parseVehicleDetailFromUrl(window.location.search);
      // Defer deep-link tab until fleet resolves the vehicle — avoids mounting tab views without vehicleId.
      if (vehicleDetail) return 'overview';
      const financeView = parseFinanceViewFromUrl(window.location.search);
      if (financeView) return financeView;
    }
    return readPersistedSettingsView() ? 'settings' : 'dashboard';
  });
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [detailStation, setDetailStation] = useState<import('../lib/api').Station | null>(null);
  const [detailVendorId, setDetailVendorId] = useState<string | null>(null);
  // V4.6.99 — Pending Booking-Detail-Id für die Cross-View-Navigation
  // (Dashboard → BookingsView → Detail-Seite). Wird gesetzt, wenn ein
  // BK-Chip in einer StatInlineDetail-Karte geklickt wird; BookingsView
  // konsumiert das Feld in einem useEffect und setzt anschliessend
  // `setPendingBookingDetailId(null)` über den Reset-Callback zurück.
  const [pendingBookingDetailId, setPendingBookingDetailId] = useState<string | null>(null);
  const [pendingInvoiceDetailId, setPendingInvoiceDetailId] = useState<string | null>(null);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const [helpCenterAttempted, setHelpCenterAttempted] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('support_help_center_attempted') === '1',
  );

  useEffect(() => {
    if (currentView !== 'support' || !helpCenterAttempted) return;
    try {
      sessionStorage.removeItem('support_help_center_attempted');
    } catch {
      /* ignore */
    }
  }, [currentView, helpCenterAttempted]);
  const [settingsTab, setSettingsTab] = useState<RentalSettingsTab>(readPersistedSettingsTab);
  const [fleetTab, setFleetTab] = useState<FleetTab>(readPersistedFleetTab);
  const openFleetConnectivity = useCallback(() => {
    setCurrentView('fleet');
    setFleetTab('connectivity');
    try {
      sessionStorage.removeItem(RENTAL_SETTINGS_VIEW_KEY);
      sessionStorage.setItem(RENTAL_SETTINGS_TAB_KEY, 'company');
    } catch {
      /* ignore */
    }
  }, []);

  const applySettingsTab = useCallback(
    (tab: SettingsTabInput) => {
      if (tab === LEGACY_SETTINGS_TAB_FLEET_CONNECTION) {
        openFleetConnectivity();
        return;
      }
      setSettingsTab(tab);
    },
    [openFleetConnectivity],
  );

  useEffect(() => {
    if (!consumeFleetConnectivityRedirectFlag()) return;
    openFleetConnectivity();
  }, [openFleetConnectivity]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cleanedSearch = stripLegacyBillingCustomerPaymentsParams(window.location.search);
    if (cleanedSearch !== window.location.search) {
      const nextUrl = `${window.location.pathname}${cleanedSearch}`;
      window.history.replaceState(null, '', nextUrl);
      try {
        sessionStorage.removeItem(RENTAL_SETTINGS_VIEW_KEY);
      } catch {
        /* ignore */
      }
    }
  }, []);
  const [fleetHealthServiceNav, setFleetHealthServiceNav] =
    useState<FleetHealthServiceNavState>(() => {
      const fromUrl =
        typeof window !== 'undefined'
          ? parseFleetHealthServiceNavFromSearch(window.location.search)
          : null;
      return fromUrl ?? readPersistedFleetHealthServiceNav();
    });
  const [serviceCenterNav, setServiceCenterNav] = useState<ServiceCenterNavState | null>(null);
  const [financeTab, setFinanceTab] = useState<FinanceTab>(() => {
    const financeView = typeof window !== 'undefined' ? parseFinanceViewFromUrl(window.location.search) : null;
    return financeView ?? 'invoices';
  });
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleData | null>(null);
  // Poll live telemetry on every vehicle-detail tab that shows the header badge
  // (Overview, Trips, Health, Damages, Documents, Bookings, Task List). Before
  // this gate was limited to `overview`, causing `VehicleConnectionBadge` to
  // render "Last Signal —" on every other tab because the hook's cleanup
  // resets the store when vehicleId becomes null.
  const liveTelemetryVehicleId =
    selectedVehicle?.id && VEHICLE_DETAIL_VIEWS.has(currentView)
      ? selectedVehicle.id
      : null;
  const showVehicleDetailChrome = VEHICLE_DETAIL_VIEWS.has(currentView);
  const [activeBookingRef, setActiveBookingRef] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [highlightedVehicleTaskId, setHighlightedVehicleTaskId] = useState<string | null>(null);
  const [vehicleTasksRefreshToken, setVehicleTasksRefreshToken] = useState(0);
  const [cleaningStatusBusy, setCleaningStatusBusy] = useState(false);
  const [vehicleStatusBusy, setVehicleStatusBusy] = useState(false);
  const canEditVehicleOperationalStatus = hasPermission('fleet', 'write');
  const canEditCleaningStatus = hasPermission('fleet', 'write');
  const canReadFleetTelemetry = hasPermission('fleet', 'read');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const overviewSummaryEnabled = currentView === 'overview' && Boolean(selectedVehicle?.id);
  const { summary: vehicleOverviewSummary } = useVehicleOverviewSummary({
    orgId,
    vehicle: selectedVehicle,
    tasksRefreshToken: vehicleTasksRefreshToken,
    enabled: overviewSummaryEnabled,
  });

  const navigateVehicleOverview = useMemo(
    () =>
      createVehicleOverviewNavigator({
        setCurrentView: (view) => {
          if (selectedVehicle) {
            openVehicleDetailRef.current(selectedVehicle, view);
          } else {
            setCurrentView(view);
          }
        },
        setHighlightedVehicleTaskId,
        setPendingBookingDetailId,
      }),
    [selectedVehicle, setHighlightedVehicleTaskId, setPendingBookingDetailId],
  );

  const skipVehicleDetailUrlSync = useRef(false);
  const didInitialVehicleDetailUrlSync = useRef(false);
  const urlVehicleResolvedRef = useRef(
    typeof window === 'undefined' ? true : !parseVehicleDetailFromUrl(window.location.search),
  );
  const openVehicleDetailRef = useRef(
    (_vehicle: VehicleData, _tab: VehicleDetailTab = 'overview') => {},
  );

  const openVehicleDetail = useCallback(
    (vehicle: VehicleData, tab: VehicleDetailTab = 'overview') => {
      setSelectedVehicle(vehicle);
      setVehicleStatus(deriveVehicleDetailHeaderEditStatus(vehicle));
      setCleaningStatus(deriveVehicleDetailHeaderCleaningStatus(vehicle));
      setCurrentStation(vehicle.station);
      setCurrentView(tab);

      if (skipVehicleDetailUrlSync.current) {
        skipVehicleDetailUrlSync.current = false;
        return;
      }
      if (!didInitialVehicleDetailUrlSync.current) {
        didInitialVehicleDetailUrlSync.current = true;
        applyVehicleDetailToUrl({ vehicleId: vehicle.id, tab }, { replace: true });
        return;
      }
      applyVehicleDetailToUrl({ vehicleId: vehicle.id, tab });
    },
    [],
  );
  openVehicleDetailRef.current = openVehicleDetail;

  const resolveVehicleDetailFromUrl = useCallback(() => {
    const fromUrl = parseVehicleDetailFromUrl(window.location.search);
    if (!fromUrl) {
      urlVehicleResolvedRef.current = true;
      return;
    }

    if (!orgId) return;

    if (!canReadFleetTelemetry) {
      toast.error('Keine Berechtigung', {
        description: 'Zum Öffnen von Fahrzeugdetails ist Fleet-Leserecht erforderlich.',
      });
      clearVehicleDetailFromUrl({ replace: true });
      setCurrentView('fleet');
      setFleetTab('status');
      urlVehicleResolvedRef.current = true;
      return;
    }

    if (fleetLoading || (!fleetLastFetchedAt && !fleetFetchError)) return;

    if (fleetFetchError) {
      toast.info('Fahrzeug konnte nicht geöffnet werden.');
      clearVehicleDetailFromUrl({ replace: true });
      setCurrentView('fleet');
      setFleetTab('status');
      urlVehicleResolvedRef.current = true;
      return;
    }

    const match = fleetVehicles.find((vehicle) => vehicle.id === fromUrl.vehicleId);
    if (match) {
      skipVehicleDetailUrlSync.current = true;
      setSelectedVehicle(match);
      setVehicleStatus(deriveVehicleDetailHeaderEditStatus(match));
      setCleaningStatus(deriveVehicleDetailHeaderCleaningStatus(match));
      setCurrentStation(match.station);
      setCurrentView(fromUrl.tab);
      urlVehicleResolvedRef.current = true;
      return;
    }

    toast.info('Fahrzeug konnte nicht geöffnet werden.');
    clearVehicleDetailFromUrl({ replace: true });
    setCurrentView('fleet');
    setFleetTab('status');
    urlVehicleResolvedRef.current = true;
  }, [canReadFleetTelemetry, fleetFetchError, fleetLastFetchedAt, fleetLoading, fleetVehicles, orgId]);
  
  useEffect(() => {
    resolveVehicleDetailFromUrl();
  }, [resolveVehicleDetailFromUrl]);

  useEffect(() => {
    const fromUrl = parseVehicleDetailFromUrl(window.location.search);
    if (fromUrl?.vehicleId) return;
    if (!urlVehicleResolvedRef.current) return;
    if (
      !fleetLoading &&
      fleetLastFetchedAt &&
      fleetVehicles.length > 0 &&
      !selectedVehicle
    ) {
      setSelectedVehicle(fleetVehicles[0]);
    }
  }, [fleetLastFetchedAt, fleetLoading, fleetVehicles, selectedVehicle]);

  useEffect(() => {
    if (!selectedVehicle?.id) return;
    const fresh = fleetVehicles.find((v) => v.id === selectedVehicle.id);
    if (!fresh) return;
    if (
      fresh.status === selectedVehicle.status &&
      fresh.cleaningStatus === selectedVehicle.cleaningStatus
    ) {
      return;
    }
    setSelectedVehicle((prev) => (prev ? { ...prev, ...fresh } : prev));
    if (!vehicleStatusBusy) {
      setVehicleStatus(deriveVehicleDetailHeaderEditStatus(fresh));
    }
    if (!cleaningStatusBusy) {
      setCleaningStatus(deriveVehicleDetailHeaderCleaningStatus(fresh));
    }
  }, [
    cleaningStatusBusy,
    fleetVehicles,
    selectedVehicle?.id,
    selectedVehicle?.status,
    selectedVehicle?.cleaningStatus,
    vehicleStatusBusy,
  ]);

  // Shared new customers (created in NewBookingView, shown in CustomersView)
  const [newlyCreatedCustomers, setNewlyCreatedCustomers] = useState<any[]>([]);
  const [newBookingPrefill, setNewBookingPrefill] = useState<{
    customerId: string;
    returnView: 'customer-detail' | 'bookings';
  } | null>(null);

  // Shared new bookings (created in NewBookingView, shown in BookingsView)
  const [createdBookings, setCreatedBookings] = useState<any[]>([]);

  const bumpBookingsVersion = (args?: {
    vehicleId?: string | null;
    previousVehicleId?: string | null;
    reason?: 'booking-created' | 'booking-updated' | 'booking-cancelled';
  }) => {
    if (!orgId) return;
    const vehicleId = args?.vehicleId;
    if (vehicleId) {
      void invalidateVehicleOperationalAfterBookingChange({
        orgId,
        vehicleId,
        previousVehicleId: args?.previousVehicleId,
        reason: args?.reason ?? 'booking-updated',
      });
      return;
    }
    void invalidateVehicleOperationalState({
      orgId,
      vehicleIds: [],
      reason: args?.reason ?? 'booking-updated',
      optimistic: 'none',
    });
  };

  // Handover + booking operational sync is centralized in vehicle-operational-query.

  // Station state
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [currentStation, setCurrentStation] = useState('-');
  const [isStationDropdownOpen, setIsStationDropdownOpen] = useState(false);
  const [showStationWarning, setShowStationWarning] = useState(false);
  const [pendingStation, setPendingStation] = useState<string | null>(null);
  
  // Warning modals
  const [showCleaningWarning, setShowCleaningWarning] = useState(false);
  const [showStatusWarning, setShowStatusWarning] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<VehicleOperationalUiStatus | null>(null);
  
  // Available stations
  const availableStations: string[] = [];
  
  // Trip filter states
  const [selectedDriver, setSelectedDriver] = useState('all');
  // V4.6.71 — Default to the local calendar day, not `toISOString().slice(0,10)`
  // which is the UTC day and is 1 off for an operator in CEST/CET looking at
  // late-evening trips. See TripsView.localDayRangeIso for the detailed bug
  // report; the picker (<input type="date">) emits local YYYY-MM-DD, so the
  // default has to speak the same dialect.
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [isDriverDropdownOpen, setIsDriverDropdownOpen] = useState(false);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);

  // Trip count and driver options for filter bar; TripsView reports via onTripsLoaded
  const [tripsCount, setTripsCount] = useState(0);
  const [tripDriverOptions, setTripDriverOptions] = useState<string[]>([]);

  // Clear filters function
  const clearFilters = () => {
    setSelectedDriver('all');
    setSelectedDate('');
  };

  // Check if any filter is active
  const hasActiveFilters = selectedDriver !== 'all' || selectedDate !== '';

  const persistCleaningStatus = useCallback(
    async (nextUiStatus: VehicleCleaningUiStatus) => {
      if (!orgId || !selectedVehicle?.id || cleaningStatusBusy) return;
      if (!canEditCleaningStatus) {
        toast.error('Keine Berechtigung', {
          description: 'Zum Ändern des Reinigungsstatus ist Fleet-Schreibrecht erforderlich.',
        });
        return;
      }

      const confirmedUiStatus = deriveVehicleDetailHeaderCleaningStatus(selectedVehicle);
      if (nextUiStatus === confirmedUiStatus) {
        setIsCleaningDropdownOpen(false);
        setShowCleaningWarning(false);
        return;
      }

      setCleaningStatusBusy(true);
      setIsCleaningDropdownOpen(false);
      try {
        const result = await mutateVehicleCleaningStatus({
          orgId,
          vehicleId: selectedVehicle.id,
          uiStatus: nextUiStatus,
        });
        await invalidateVehicleOperationalState({
          orgId,
          vehicleIds: [selectedVehicle.id],
          reason: 'vehicle-status-patch',
          optimistic: 'none',
        });
        await refreshFleetVehicles();
        const fresh = useFleetMapStore
          .getState()
          .vehicles.find((vehicle) => vehicle.id === selectedVehicle.id);
        if (fresh) {
          setSelectedVehicle((prev) => (prev ? { ...prev, ...fresh } : prev));
          setCleaningStatus(deriveVehicleDetailHeaderCleaningStatus(fresh));
        }
        setVehicleTasksRefreshToken((t) => t + 1);

        const sideEffect = resolveCleaningStatusMutationSideEffects(
          result.prismaStatus,
          result,
        );
        if (sideEffect) {
          const { toast: toastPayload, highlightedTaskId, openVehicleTasks } = sideEffect;
          if (toastPayload.type === 'success') {
            toast.success(toastPayload.title, { description: toastPayload.description });
          } else if (toastPayload.type === 'info') {
            toast.info(toastPayload.title, { description: toastPayload.description });
          } else {
            toast.warning(toastPayload.title, { description: toastPayload.description });
          }
          if (highlightedTaskId) {
            setHighlightedVehicleTaskId(highlightedTaskId);
          }
          if (openVehicleTasks) {
            setCurrentView('vehicle-tasks');
          }
        }
      } catch (err) {
        setCleaningStatus(deriveVehicleDetailHeaderCleaningStatus(selectedVehicle));
        toast.error('Reinigungsstatus konnte nicht gespeichert werden', {
          description: classifyVehicleCleaningStatusMutationError(err, 'de'),
        });
      } finally {
        setCleaningStatusBusy(false);
        setShowCleaningWarning(false);
      }
    },
    [
      canEditCleaningStatus,
      cleaningStatusBusy,
      orgId,
      refreshFleetVehicles,
      selectedVehicle,
    ],
  );

  const handleCleaningStatusChange = (newStatus: VehicleCleaningUiStatus) => {
    if (cleaningStatusBusy) return;
    if (shouldWarnBeforeCleaningStatusChange(newStatus)) {
      setShowCleaningWarning(true);
      setIsCleaningDropdownOpen(false);
      return;
    }
    void persistCleaningStatus(newStatus);
  };

  const confirmCleaningChange = () => {
    void persistCleaningStatus('Needs Cleaning');
  };

  const persistVehicleOperationalStatus = useCallback(
    async (editStatus: VehicleOperationalUiStatus) => {
      if (!orgId || !selectedVehicle?.id || vehicleStatusBusy) return;
      if (!canEditVehicleOperationalStatus) {
        toast.error('Keine Berechtigung', {
          description: 'Zum Ändern des Fahrzeugstatus ist Fleet-Schreibrecht erforderlich.',
        });
        return;
      }

      const confirmedEditStatus = deriveVehicleDetailHeaderEditStatus(selectedVehicle);
      if (editStatus === confirmedEditStatus) {
        setIsStatusDropdownOpen(false);
        return;
      }

      setVehicleStatusBusy(true);
      setIsStatusDropdownOpen(false);
      try {
        await mutateVehicleOperationalStatus({
          orgId,
          vehicleId: selectedVehicle.id,
          editStatus,
        });
        await invalidateVehicleOperationalState({
          orgId,
          vehicleIds: [selectedVehicle.id],
          reason: 'vehicle-status-patch',
          optimistic: 'none',
        });
        await refreshFleetVehicles();
        const fresh = useFleetMapStore
          .getState()
          .vehicles.find((vehicle) => vehicle.id === selectedVehicle.id);
        if (fresh) {
          setSelectedVehicle((prev) => (prev ? { ...prev, ...fresh } : prev));
          setVehicleStatus(deriveVehicleDetailHeaderEditStatus(fresh));
        }
        toast.success(vehicleOperationalStatusMutationSuccessMessage(editStatus, 'de'));
      } catch (err) {
        setVehicleStatus(deriveVehicleDetailHeaderEditStatus(selectedVehicle));
        toast.error('Fahrzeugstatus konnte nicht gespeichert werden', {
          description: classifyVehicleOperationalStatusMutationError(err, 'de'),
        });
      } finally {
        setVehicleStatusBusy(false);
        setPendingStatus(null);
        setShowStatusWarning(false);
      }
    },
    [
      canEditVehicleOperationalStatus,
      orgId,
      refreshFleetVehicles,
      selectedVehicle,
      vehicleStatusBusy,
    ],
  );

  // Handle vehicle status change
  const handleVehicleStatusChange = (newStatus: VehicleOperationalUiStatus) => {
    if (vehicleStatusBusy) return;
    if (
      shouldWarnBeforeVehicleOperationalStatusChange(vehicleStatus, newStatus)
    ) {
      setPendingStatus(newStatus);
      setShowStatusWarning(true);
      setIsStatusDropdownOpen(false);
      return;
    }
    void persistVehicleOperationalStatus(newStatus);
  };

  // Confirm vehicle status change
  const confirmStatusChange = () => {
    if (pendingStatus) {
      void persistVehicleOperationalStatus(pendingStatus);
    } else {
      setShowStatusWarning(false);
    }
  };

  // Handle vehicle selection from Fleet
  const handleVehicleSelect = (vehicle: VehicleData) => {
    openVehicleDetail(vehicle, 'overview');
  };

  const handleBackToFleet = () => {
    setCurrentView('fleet');
    setFleetTab('status');
    clearVehicleDetailFromUrl({ replace: true });
  };

  const setFleetHealthServiceNavNormalized = useCallback(
    (input: Parameters<typeof normalizeFleetHealthServiceNavState>[0]) => {
      setFleetHealthServiceNav(normalizeFleetHealthServiceNavState(input));
    },
    [],
  );

  const setFleetTabNormalized = useCallback((tab: FleetTabInput) => {
    const normalized = normalizeFleetTab(tab);
    setFleetTab(normalized.tab);
    if (normalized.subTab) {
      setFleetHealthServiceNav(normalizeFleetHealthServiceTab(normalized.subTab));
    }
  }, []);

  const openServiceCenter = useCallback((nav?: Partial<ServiceCenterNavState>) => {
    setServiceCenterNav(nav ?? {});
    setFleetTab('condition-service');
    setFleetHealthServiceNav(fleetSubTabFromServiceCenterNav(nav));
    setCurrentView('fleet');
  }, []);

  const rentalEntityNavigation = useMemo<RentalEntityNavigationValue>(
    () => ({
      openVehicleById: (vehicleId, tab = 'overview') => {
        const match = fleetVehicles.find((vehicle) => vehicle.id === vehicleId);
        if (match) {
          openVehicleDetail(match, tab);
          return;
        }
        toast.info('Fahrzeug konnte nicht geöffnet werden.');
      },
      openBookingById: (bookingId) => {
        setPendingBookingDetailId(bookingId);
        setCurrentView('bookings');
      },
      openCustomerById: (customerId) => {
        setDetailCustomer({ id: customerId });
        setCurrentView('customer-detail');
      },
      openInvoiceById: (invoiceId) => {
        setPendingInvoiceDetailId(invoiceId);
        setFinanceTab('invoices');
        setCurrentView('invoices');
      },
      openDocumentIntake: (request) => {
        pushDocumentIntakeEntry(request);
        setCurrentView('document-upload');
      },
      openDocumentById: (_documentId, options) => {
        if (options?.vehicleId) {
          const match = fleetVehicles.find((vehicle) => vehicle.id === options.vehicleId);
          if (match) {
            openVehicleDetail(match, 'documents');
            return;
          }
        }
        setCurrentView('documents');
      },
      openAlertById: (_alertId, options) => {
        if (options?.vehicleId) {
          const match = fleetVehicles.find((vehicle) => vehicle.id === options.vehicleId);
          if (match) {
            openVehicleDetail(match, 'health-errors');
            return;
          }
        }
        setCurrentView('health-errors');
      },
      openServiceCaseById: (_serviceCaseId, options) => {
        openServiceCenter({
          vehicleId: options?.vehicleId ?? selectedVehicle?.id,
          tab: 'tasks',
        });
      },
      openFineById: (_fineId) => {
        setCurrentView('fines');
      },
      openVendorById: (vendorId) => {
        setDetailVendorId(vendorId);
        setCurrentView('vendor-detail');
      },
    }),
    [fleetVehicles, openServiceCenter, openVehicleDetail, selectedVehicle?.id],
  );

  /** Central view router — maps legacy views to the new IA. */
  const handleReturnFromDocumentIntake = useCallback(
    (entry: DocumentIntakeEntryState) => {
      const view = entry.returnView;
      if (!view) return;
      if (view === 'invoices' || view === 'price-tariffs' || view === 'customer-payments') {
        setFinanceTab(view as FinanceTab);
      }
      if (view === 'customer-detail' && entry.returnEntityId) {
        setDetailCustomer({ id: entry.returnEntityId });
      }
      if (view === 'bookings' && entry.returnEntityId) {
        setPendingBookingDetailId(entry.returnEntityId);
      }
      if (view === 'overview' && entry.returnEntityId) {
        const match = fleetVehicles.find((vehicle) => vehicle.id === entry.returnEntityId);
        if (match) {
          openVehicleDetail(match, 'overview');
          return;
        }
      }
      if (view === 'health-errors' && entry.returnEntityId) {
        const match = fleetVehicles.find((vehicle) => vehicle.id === entry.returnEntityId);
        if (match) {
          openVehicleDetail(match, 'health-errors');
          return;
        }
      }
      if (view === 'documents' && entry.returnEntityId) {
        const match = fleetVehicles.find((vehicle) => vehicle.id === entry.returnEntityId);
        if (match) {
          openVehicleDetail(match, 'documents');
          return;
        }
      }
      setCurrentView(view as typeof currentView);
    },
    [fleetVehicles, openVehicleDetail],
  );

  const handleViewChange = (view: string) => {
    if (view === 'fleet-condition') {
      setCurrentView('fleet');
      setFleetTabNormalized('health');
      return;
    }
    if (view === 'vendor-management') {
      setCurrentView('fleet');
      setFleetTab('condition-service');
      setFleetHealthServiceNav({ tab: 'work', workSection: 'vendors' });
      return;
    }
    if (view === 'fines') {
      setCurrentView('fines');
      return;
    }
    if (view === 'customer-payments' || view === 'invoices' || view === 'price-tariffs') {
      setFinanceTab(view as FinanceTab);
    }
    if (view === 'fleet') {
      setFleetTab('status');
    }
    if (!VEHICLE_DETAIL_VIEWS.has(view)) {
      clearVehicleDetailFromUrl({ replace: true });
    }
    setCurrentView(view as typeof currentView);
    try {
      if (view === 'settings') {
        sessionStorage.setItem(RENTAL_SETTINGS_VIEW_KEY, '1');
      } else {
        sessionStorage.removeItem(RENTAL_SETTINGS_VIEW_KEY);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(RENTAL_SETTINGS_TAB_KEY, settingsTab);
    } catch {
      /* ignore */
    }
  }, [settingsTab]);

  useEffect(() => {
    try {
      sessionStorage.setItem(RENTAL_FLEET_TAB_KEY, fleetTab);
    } catch {
      /* ignore */
    }
  }, [fleetTab]);

  const skipFleetHealthNavUrlSync = useRef(false);
  const didInitialFleetHealthNavUrlSync = useRef(false);

  useEffect(() => {
    persistFleetHealthServiceNav(fleetHealthServiceNav);
  }, [fleetHealthServiceNav]);

  useEffect(() => {
    if (currentView !== 'fleet' || fleetTab !== 'condition-service') return;
    if (skipFleetHealthNavUrlSync.current) {
      skipFleetHealthNavUrlSync.current = false;
      return;
    }
    if (!didInitialFleetHealthNavUrlSync.current) {
      didInitialFleetHealthNavUrlSync.current = true;
      applyFleetHealthServiceNavToUrl(fleetHealthServiceNav, { replace: true });
      return;
    }
    applyFleetHealthServiceNavToUrl(fleetHealthServiceNav);
  }, [currentView, fleetTab, fleetHealthServiceNav]);

  useEffect(() => {
    const onPopState = () => {
      const fromUrl = parseFleetHealthServiceNavFromSearch(window.location.search);
      if (fromUrl) {
        skipFleetHealthNavUrlSync.current = true;
        setFleetHealthServiceNav(fromUrl);
      }

      const vehicleDetail = parseVehicleDetailFromUrl(window.location.search);
      skipVehicleDetailUrlSync.current = true;
      if (!vehicleDetail) {
        if (VEHICLE_DETAIL_VIEWS.has(currentView)) {
          setCurrentView('fleet');
          setFleetTab('status');
        }
        return;
      }

      if (!canReadFleetTelemetry) {
        clearVehicleDetailFromUrl({ replace: true });
        setCurrentView('fleet');
        setFleetTab('status');
        return;
      }

      const match = fleetVehicles.find((vehicle) => vehicle.id === vehicleDetail.vehicleId);
      if (match) {
        setSelectedVehicle(match);
        setVehicleStatus(deriveVehicleDetailHeaderEditStatus(match));
        setCleaningStatus(deriveVehicleDetailHeaderCleaningStatus(match));
        setCurrentStation(match.station);
        setCurrentView(vehicleDetail.tab);
        return;
      }

      if (!fleetLoading && fleetLastFetchedAt && !match) {
        toast.info('Fahrzeug konnte nicht geöffnet werden.');
        clearVehicleDetailFromUrl({ replace: true });
        setCurrentView('fleet');
        setFleetTab('status');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [canReadFleetTelemetry, currentView, fleetLastFetchedAt, fleetLoading, fleetVehicles]);

  useEffect(() => {
    if (!showVehicleDetailChrome || !selectedVehicle?.id) return;
    if (!VEHICLE_DETAIL_VIEWS.has(currentView)) return;
    if (skipVehicleDetailUrlSync.current) {
      skipVehicleDetailUrlSync.current = false;
      return;
    }

    const fromUrl = parseVehicleDetailFromUrl(window.location.search);
    if (
      fromUrl?.vehicleId === selectedVehicle.id &&
      fromUrl.tab === currentView
    ) {
      return;
    }

    if (!didInitialVehicleDetailUrlSync.current) {
      didInitialVehicleDetailUrlSync.current = true;
      applyVehicleDetailToUrl(
        { vehicleId: selectedVehicle.id, tab: currentView as VehicleDetailTab },
        { replace: true },
      );
      return;
    }
    applyVehicleDetailToUrl({
      vehicleId: selectedVehicle.id,
      tab: currentView as VehicleDetailTab,
    });
  }, [currentView, selectedVehicle?.id, showVehicleDetailChrome]);

  // Handle station change
  const handleStationChange = (newStation: string) => {
    if (newStation !== currentStation) {
      setPendingStation(newStation);
      setShowStationWarning(true);
      setIsStationDropdownOpen(false);
    } else {
      setIsStationDropdownOpen(false);
    }
  };

  // Confirm station change
  const confirmStationChange = () => {
    if (pendingStation) {
      setCurrentStation(pendingStation);
      setPendingStation(null);
    }
    setShowStationWarning(false);
  };

  const detailCustomerId = (() => {
    const rawId = detailCustomer?.id;
    if (typeof rawId !== 'string' || rawId.length === 0) return null;
    return `CID-${rawId.replace('c', '')}4821`;
  })();

  return (
    <RentalEntityNavigationProvider value={rentalEntityNavigation}>
    <HandoverProvider isDarkMode={isDarkMode}>
    <AppShell
      variant="rental"
      sidebar={(
      <Sidebar 
        onNewTaskClick={() => { handleViewChange('tasks'); setAutoOpenNewTask(true); }}
        onNewBookingClick={() => handleViewChange('new-booking')}
        currentView={currentView}
        onViewChange={handleViewChange}
        onFleetTabChange={setFleetTabNormalized}
        settingsTab={settingsTab}
        onSettingsTabChange={applySettingsTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        supportUnreadCount={supportUnreadCount}
      />
      )}
    >
      <VehicleLiveTelemetryBinder
        vehicleId={liveTelemetryVehicleId}
        orgId={orgId}
        isOverviewTab={currentView === 'overview'}
        canReadFleet={canReadFleetTelemetry}
      />
      <Toaster position="top-right" richColors closeButton theme={isDarkMode ? 'dark' : 'light'} />
            <TopBar
              onViewChange={handleViewChange}
              onVehicleSelect={(vehicle) => openVehicleDetail(vehicle, 'overview')}
              onSettingsTabChange={applySettingsTab}
              onFinanceTabChange={setFinanceTab}
            />
        {/* Header Section - Only show for vehicle detail views */}
        {showVehicleDetailChrome && selectedVehicle && (
          <VehicleDetailHeader
            vehicle={selectedVehicle}
            vehicleStatus={vehicleStatus}
            vehicleStatusBusy={vehicleStatusBusy}
            canEditOperationalStatus={canEditVehicleOperationalStatus}
            cleaningStatus={cleaningStatus}
            cleaningStatusBusy={cleaningStatusBusy}
            canEditCleaningStatus={canEditCleaningStatus}
            isStatusDropdownOpen={isStatusDropdownOpen}
            isCleaningDropdownOpen={isCleaningDropdownOpen}
            onToggleStatusDropdown={() => {
              if (vehicleStatusBusy || !canEditVehicleOperationalStatus) return;
              setIsStatusDropdownOpen((open) => !open);
            }}
            onToggleCleaningDropdown={() => {
              if (cleaningStatusBusy || !canEditCleaningStatus) return;
              setIsCleaningDropdownOpen((open) => !open);
            }}
            onVehicleStatusChange={handleVehicleStatusChange}
            onCleaningStatusChange={handleCleaningStatusChange}
            onBack={handleBackToFleet}
            onRefreshOperationalStatus={() => {
              void refreshFleetVehicles();
            }}
          />
        )}

        {/* Tab Navigation - Only show for vehicle detail views */}
        {showVehicleDetailChrome && (
        <div className="mb-4">
          <div className={chromeTabBarClass('p-1')}>
            <div className={`${CHROME_TAB_BAR_SCROLL_CLASS} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
              {([
                { key: 'overview', label: 'Overview' },
                { key: 'trips', label: 'Trips' },
                { key: 'health-errors', label: 'Health' },
                { key: 'damages', label: 'Damages' },
                { key: 'documents', label: 'Documents' },
                { key: 'vehicle-bookings', label: 'Bookings' },
                { key: 'vehicle-tasks', label: 'Task List' },
                { key: 'vehicle-requirements', label: 'Requirements' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    if (selectedVehicle) {
                      openVehicleDetail(selectedVehicle, tab.key);
                    } else {
                      setCurrentView(tab.key as typeof currentView);
                    }
                  }}
                  className={chromeTabTriggerClass(currentView === tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        )}

        {/* Filters Bar - Show on Trips and Driving Insights views, above content */}
        {currentView === 'trips' && (
          <div className="mb-2">
            <div className="rounded-lg px-2.5 py-1 border border-border surface-premium shadow-sm flex items-center justify-end gap-2">
              {/* Trip Counter - Only show on Trips view */}
              {currentView === 'trips' && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-transparent sq-tone-info mr-auto">
                  <span className="text-xs font-bold">
                    {tripsCount} {tripsCount === 1 ? 'Trip' : 'Trips'}
                  </span>
                </div>
              )}

              {/* Date Filter */}
              <div className="relative">
                <button
                  onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-200 ${
                    selectedDate
                      ? 'bg-[color:var(--brand-soft)] border-transparent text-[color:var(--brand-ink)] ring-1 ring-[color:var(--brand-soft)]'
                      : 'surface-premium border-border text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon name="calendar" className={`w-4 h-4 ${selectedDate ? 'text-[color:var(--brand)]' : 'text-muted-foreground'}`} />
                  <span className="text-xs font-medium">
                    {selectedDate ? (() => {
                      // V4.6.71 — Parse as LOCAL date: `new Date("2026-04-19")`
                      // interprets YYYY-MM-DD as UTC midnight per ES spec, which
                      // shifts the display one day earlier in western timezones.
                      // The date picker emits a local calendar day string, so
                      // the display must parse it the same way.
                      const [y, m, d] = selectedDate.split('-').map(Number);
                      return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    })() : 'All Time'}
                  </span>
                  <Icon name="chevron-down" className={`w-3.5 h-3.5 ${selectedDate ? 'text-[color:var(--brand)]' : 'text-muted-foreground'}`} />
                </button>

                {isDateDropdownOpen && (
                  <div className="absolute top-full mt-2 right-0 z-50 rounded-lg border border-border bg-popover shadow-lg overflow-hidden p-2.5">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setIsDateDropdownOpen(false);
                      }}
                      className="px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)] text-foreground outline-none text-sm font-medium"
                    />
                  </div>
                )}
              </div>

              {/* Driver Filter */}
              <div className="relative">
                <button
                  onClick={() => setIsDriverDropdownOpen(!isDriverDropdownOpen)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-200 ${
                    selectedDriver !== 'all'
                      ? 'bg-[color:var(--brand-soft)] border-transparent text-[color:var(--brand-ink)] ring-1 ring-[color:var(--brand-soft)]'
                      : 'surface-premium border-border text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon name="user" className={`w-4 h-4 ${selectedDriver !== 'all' ? 'text-[color:var(--brand)]' : 'text-muted-foreground'}`} />
                  <span className="text-xs font-medium">
                    {selectedDriver === 'all' ? 'All Drivers' : selectedDriver}
                  </span>
                  <Icon name="chevron-down" className={`w-3.5 h-3.5 ${selectedDriver !== 'all' ? 'text-[color:var(--brand)]' : 'text-muted-foreground'}`} />
                </button>

                {isDriverDropdownOpen && (
                  <div className="absolute top-full mt-2 right-0 z-50 min-w-[200px] rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                    {['all', ...tripDriverOptions].map((driver) => (
                      <button
                        key={driver}
                        onClick={() => {
                          setSelectedDriver(driver);
                          setIsDriverDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors border-b border-border/60 last:border-b-0 ${
                          selectedDriver === driver
                            ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                            : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        {driver === 'all' ? 'All Drivers' : driver}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Clear Filters Button - Only show when filters are active */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-transparent transition-all duration-200 sq-tone-critical hover:opacity-90"
                >
                  <Icon name="x" className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Clear</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* V4.6.94 — `MainNavTabs` retired. The horizontal Dashboard /
            Bookings / Fleet / Customers / Stations tab strip duplicated the
            top-level Sidebar entries 1:1, only appeared on those 5 routes
            (causing a ~50px header jump when switching to Insights /
            Settings / Trips), and added zero capability the always-visible
            sidebar (incl. its mobile drawer) didn't already cover. */}
        {currentView === 'trips' ? (
          <TripsView 
            isDarkMode={isDarkMode} 
            vehicleId={selectedVehicle?.id}
            selectedDate={selectedDate || undefined}
            selectedDriver={selectedDriver}
            fuelType={selectedVehicle?.fuelType}
            onOpenBooking={(bookingId) => {
              setPendingBookingDetailId(bookingId);
              setCurrentView('bookings');
            }}
            onTripsLoaded={(trips) => {
              setTripsCount(trips.length);
              const names = [...new Set((trips as { driverName?: string }[]).map((t) => t.driverName).filter(Boolean))] as string[];
              setTripDriverOptions(names);
            }}
          />
        ) : (currentView === 'stations' || currentView === 'station-detail') && !stationsFlagsLoading && !stationsUiEnabled ? (
          <EmptyState
            title="Stations"
            description="Stations V2 UI is not enabled for this organization."
          />
        ) : currentView === 'stations' ? (
          <StationsView onOpenStation={(s) => { setDetailStation(s); setCurrentView('station-detail'); }} />
        ) : currentView === 'station-detail' && detailStation ? (
          <StationDetailView
            stationId={detailStation.id}
            initialStation={detailStation}
            isDarkMode={isDarkMode}
            onBack={() => setCurrentView('stations')}
            onOpenBooking={(bookingId) => {
              setPendingBookingDetailId(bookingId);
              setCurrentView('bookings');
            }}
          />
        ) : currentView === 'dashboard' ? (
          <DashboardView
            onVehicleSelect={(vehicle) => openVehicleDetail(vehicle, 'overview')}
            onOpenVehicleById={(vehicleId) => {
              const v = fleetVehicles.find((fv) => fv.id === vehicleId);
              if (v) openVehicleDetail(v, 'overview');
            }}
            onOpenRentalView={(view) => handleViewChange(view)}
            onOpenSettingsTab={(tab) => {
              applySettingsTab(tab as RentalSettingsTab);
              handleViewChange('settings');
            }}
            onOpenFinanceView={(view) => handleViewChange(view)}
            onOpenInvoiceById={(invoiceId) => {
              setPendingInvoiceDetailId(invoiceId);
              setFinanceTab('invoices');
              setCurrentView('invoices');
            }}
            onOpenPriceTariffs={() => handleViewChange('price-tariffs')}
            onOpenBookingById={(bookingId) => {
              setPendingBookingDetailId(bookingId);
              setCurrentView('bookings');
            }}
            onOpenCustomerById={(customerId) => {
              setDetailCustomer({ id: customerId });
              setCurrentView('customer-detail');
            }}
          />
        ) : currentView === 'bookings' ? (
          <BookingsView onActiveBookingRefChange={setActiveBookingRef} onNavigateToVehicle={(vehicleName) => {
            const nameNorm = vehicleName.toLowerCase().replace(/[-\s]/g, '');
            const vehicle = fleetVehicles.find(v => {
              const modelNorm = v.model.toLowerCase().replace(/[-\s]/g, '');
              return modelNorm.includes(nameNorm) || nameNorm.includes(modelNorm.replace(/\d{4}$/, '').trim());
            });
            if (vehicle) { handleVehicleSelect(vehicle); }
          }} onCreateNewBooking={() => setCurrentView('new-booking')} additionalBookings={createdBookings} onBookingUpdated={(updatedBooking) => {
            setCreatedBookings(prev => prev.map(b => b.id === updatedBooking.id ? updatedBooking : b));
            bumpBookingsVersion({
              vehicleId: updatedBooking.vehicleId ?? null,
              previousVehicleId: updatedBooking.previousVehicleId ?? null,
              reason: 'booking-updated',
            });
          }} onBookingCancelled={(bookingId, meta) => {
            setCreatedBookings(prev => prev.filter(b => b.id !== bookingId));
            bumpBookingsVersion({
              vehicleId: meta?.vehicleId ?? null,
              reason: 'booking-cancelled',
            });
          }} initialDetailBookingId={pendingBookingDetailId} onConsumeInitialDetailBookingId={() => setPendingBookingDetailId(null)} />
        ) : currentView === 'health-errors' ? (
          <HealthErrorsView
            vehicleId={selectedVehicle?.id}
            fuelType={selectedVehicle?.fuelType}
            onOpenServiceCenter={() =>
              openServiceCenter(
                selectedVehicle?.id
                  ? { vehicleId: selectedVehicle.id, tab: 'tasks' }
                  : undefined,
              )
            }
            onOpenExistingTask={(taskId) => {
              setHighlightedVehicleTaskId(taskId);
              setCurrentView('vehicle-tasks');
            }}
            onOpenBooking={(bookingId) => {
              setPendingBookingDetailId(bookingId);
              setCurrentView('bookings');
            }}
            onOpenTrips={(dateIso) => {
              if (dateIso) {
                setSelectedDate(dateIso.slice(0, 10));
              }
              setCurrentView('trips');
            }}
          />
        ) : currentView === 'financial-insights' ? (
          /* V4.6.93 — Standalone Financial Insights page (replacement for the
             retired Dashboard Finances tab). Aggregates real invoice data
             (`/organizations/:orgId/invoices*`) end-to-end without mock
             fallbacks. Lives next to other Insights pages, not under Finance. */
          <FinancialInsightsView isDarkMode={isDarkMode} />
        ) : currentView === 'fleet' ? (
          <FleetHubView
            activeTab={fleetTab}
            onTabChange={setFleetTab}
            healthServiceNav={fleetHealthServiceNav}
            onHealthServiceNavChange={setFleetHealthServiceNavNormalized}
            onVehicleSelect={handleVehicleSelect}
            onOpenVendorDetail={(vendor) => { setDetailVendorId(vendor.id); setCurrentView('vendor-detail'); }}
            onOpenGlobalTasks={(taskId) => {
              setHighlightedTaskId(taskId);
              handleViewChange('tasks');
            }}
            onCreateTask={() => {
              setAutoOpenNewTask(true);
              handleViewChange('tasks');
            }}
            onOpenVehicle={(vehicleId) => {
              const v = fleetVehicles.find((fv) => fv.id === vehicleId);
              if (v) handleVehicleSelect(v);
            }}
            serviceCenterNavigation={serviceCenterNav}
            onServiceCenterNavigationConsumed={() => setServiceCenterNav(null)}
            onOpenServiceCenter={openServiceCenter}
          />
        ) : currentView === 'damages' ? (
          <DamagesView
            isDarkMode={isDarkMode}
            vehicleId={selectedVehicle?.id}
            onOpenVehicleTasks={(taskId) => {
              if (taskId) setHighlightedVehicleTaskId(taskId);
              setCurrentView('vehicle-tasks');
            }}
          />
        ) : currentView === 'documents' ? (
          <DocumentsView
            vehicle={selectedVehicle}
            onOpenLinkedTask={(taskId) => {
              setHighlightedVehicleTaskId(taskId);
              setCurrentView('vehicle-tasks');
            }}
          />
        ) : currentView === 'vehicle-bookings' ? (
          <VehicleBookingsView
            isDarkMode={isDarkMode}
            vehicle={selectedVehicle}
            onCreateBooking={() => setCurrentView('new-booking')}
            onOpenBooking={(bookingId) => {
              setPendingBookingDetailId(bookingId);
              setCurrentView('bookings');
            }}
            onOpenVehicleTasks={() => setCurrentView('vehicle-tasks')}
          />
        ) : currentView === 'vehicle-tasks' ? (
          <VehicleTasksView
            isDarkMode={isDarkMode}
            vehicle={selectedVehicle}
            highlightTaskId={highlightedVehicleTaskId}
            onHighlightConsumed={() => setHighlightedVehicleTaskId(null)}
            tasksRefreshToken={vehicleTasksRefreshToken}
            onOpenInGlobalTasks={(taskId) => {
              setHighlightedTaskId(taskId);
              handleViewChange('tasks');
            }}
            onOpenServiceCenter={() =>
              openServiceCenter(
                selectedVehicle?.id
                  ? { vehicleId: selectedVehicle.id, tab: 'tasks' }
                  : undefined,
              )
            }
          />
        ) : currentView === 'vehicle-requirements' ? (
          <VehicleRequirementsTab
            selectedVehicle={selectedVehicle}
            orgId={orgId}
            onOpenRentalRulesCenter={() => {
              setSettingsTab('rental-rules');
              handleViewChange('settings');
            }}
          />
        ) : currentView === 'customers' ? (
          <CustomersView onOpenCustomerDetail={(c) => { setDetailCustomer(c); setCurrentView('customer-detail'); }} additionalCustomers={newlyCreatedCustomers} />
        ) : currentView === 'customer-detail' && detailCustomer ? (
          <CustomerDetailView
            customer={detailCustomer}
            onBack={() => setCurrentView('customers')}
            onUpdateCustomer={(updated) => setDetailCustomer(updated)}
            onCreateBooking={() => {
              if (detailCustomer?.id) {
                setNewBookingPrefill({ customerId: detailCustomer.id, returnView: 'customer-detail' });
              }
              setCurrentView('new-booking');
            }}
            onOpenInvoice={(invoiceId) => {
              setPendingInvoiceDetailId(invoiceId);
              setFinanceTab('invoices');
              setCurrentView('invoices');
            }}
          />
        ) : currentView === 'fines' ? (
          <FinesView isDarkMode={isDarkMode} />
        ) : currentView === 'invoices' || currentView === 'price-tariffs' || currentView === 'customer-payments' ? (
          <FinanceView
            isDarkMode={isDarkMode}
            activeTab={currentView as FinanceTab}
            onTabChange={(tab) => { setFinanceTab(tab); handleViewChange(tab); }}
            initialInvoiceId={pendingInvoiceDetailId}
            onConsumeInitialInvoiceId={() => setPendingInvoiceDetailId(null)}
            invoiceNavigation={{
              onOpenCustomer: (customerId) => {
                setDetailCustomer({ id: customerId });
                setCurrentView('customer-detail');
              },
              onOpenBooking: (bookingId) => {
                setPendingBookingDetailId(bookingId);
                setCurrentView('bookings');
              },
              onOpenVehicle: (vehicleId) => {
                const v = fleetVehicles.find((vehicle) => vehicle.id === vehicleId);
                if (v) openVehicleDetail(v, 'overview');
              },
            }}
          />
        ) : currentView === 'vendor-detail' && detailVendorId ? (
          <VendorDetailView
            vendorId={detailVendorId}
            onBack={() => {
              setCurrentView('fleet');
              setFleetTab('condition-service');
              setFleetHealthServiceNav({ tab: 'work', workSection: 'vendors' });
              setDetailVendorId(null);
            }}
          />
        ) : currentView === 'tasks' ? (
          <TasksView
            autoOpenNewTask={autoOpenNewTask}
            onAutoOpenConsumed={() => setAutoOpenNewTask(false)}
            highlightedTaskId={highlightedTaskId}
            onHighlightConsumed={() => setHighlightedTaskId(null)}
          />
        ) : currentView === 'document-upload' ? (
          <DocumentUploadView
            isDarkMode={isDarkMode}
            onReturnToOrigin={handleReturnFromDocumentIntake}
            onEntityNavigate={(target) => {
              if (target.view === 'invoices') {
                setPendingInvoiceDetailId(target.entityId);
                setFinanceTab('invoices');
                setCurrentView('invoices');
                return;
              }
              if (target.view === 'financial-insights') {
                setCurrentView('financial-insights');
                return;
              }
              if (target.view === 'damages') {
                setCurrentView('damages');
                return;
              }
              if (target.view === 'health-errors') {
                setCurrentView('health-errors');
              }
            }}
          />
        ) : currentView === 'ai-assistant' ? (
          <AIAssistantView isDarkMode={isDarkMode} />
        ) : currentView === 'support' ? (
          <SupportView
            onOpenHelpCenter={() => {
              setHelpCenterAttempted(false);
              handleViewChange('help-center');
            }}
            helpCenterAttempted={helpCenterAttempted}
            onUnreadCountChange={setSupportUnreadCount}
          />
        ) : currentView === 'workflow-automation' ? (
          <WorkflowAutomationView
            isDarkMode={isDarkMode}
            canRead={hasPermission('workflow-automation', 'read')}
            canWrite={hasPermission('workflow-automation', 'write')}
          />
        ) : currentView === 'whatsapp-business' ? (
          <WhatsAppBusinessView isDarkMode={isDarkMode} />
        ) : currentView === 'parts-accessories' ? (
          <PartsAccessoriesView isDarkMode={isDarkMode} />
        ) : currentView === 'insurances' ? (
          <InsurancesView onNavigateToVehicleDocuments={(vehicleId) => {
            const v = fleetVehicles.find((fv: any) => fv.id === vehicleId);
            if (v) openVehicleDetail(v, 'documents');
          }} />
        ) : currentView === 'ai-voice-assistant' ? (
          <VoiceAssistantView isDarkMode={isDarkMode} />
        ) : currentView === 'help-center' ? (
          <HelpCenterView
            isDarkMode={isDarkMode}
            onOpenSupport={() => {
              try {
                sessionStorage.setItem('support_help_center_attempted', '1');
              } catch {
                /* ignore */
              }
              setHelpCenterAttempted(true);
              handleViewChange('support');
            }}
          />
        ) : currentView === 'data-analyse' ? (
          <DataAnalyseView />
        ) : currentView === 'settings' ? (
          <SettingsView
            activeTab={settingsTab}
            onTabChange={applySettingsTab}
            onNavigateToStations={() => handleViewChange('stations')}
            onCheckBooking={() => handleViewChange('new-booking')}
          />
        ) : currentView === 'new-booking' ? (
          <NewBookingView
            initialCustomerId={newBookingPrefill?.customerId ?? null}
            onBack={() => {
              const returnView = newBookingPrefill?.returnView ?? 'bookings';
              setNewBookingPrefill(null);
              setCurrentView(returnView);
            }}
            onCustomerCreated={(c) => setNewlyCreatedCustomers(prev => [c, ...prev])}
            onBookingCreated={(b) => { setCreatedBookings(prev => [b, ...prev]); bumpBookingsVersion({ vehicleId: b.vehicleId ?? null, reason: 'booking-created' }); }}
            onViewBooking={(bookingId) => {
              setPendingBookingDetailId(bookingId);
              setCurrentView('bookings');
            }}
          />
        ) : currentView === 'overview' ? (
          <VehicleOverviewTab
            selectedVehicle={selectedVehicle}
            orgId={orgId}
            isDarkMode={isDarkMode}
            summary={vehicleOverviewSummary}
            onNavigate={navigateVehicleOverview}
            onOpenHealthDetails={() => {
              if (selectedVehicle) openVehicleDetail(selectedVehicle, 'health-errors');
            }}
            onOpenServiceCenter={openServiceCenter}
            onOpenVehicleTask={(taskId) => {
              setHighlightedVehicleTaskId(taskId);
              if (selectedVehicle) {
                openVehicleDetail(selectedVehicle, 'vehicle-tasks');
              } else {
                setCurrentView('vehicle-tasks');
              }
            }}
            tasksRefreshToken={vehicleTasksRefreshToken}
          />
        ) : null}
      {/* Cleaning Status Warning Modal */}
      {showCleaningWarning && (
        <div className="fixed inset-0 sq-backdrop flex items-center justify-center z-[100]">
          <div className="max-w-md w-full mx-4 rounded-xl p-6 shadow-xl border border-border surface-premium">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full sq-tone-watch flex items-center justify-center shrink-0">
                <Icon name="alert-triangle" className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground font-display">
                Reinigungsaufgabe anlegen
              </h3>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              Der Reinigungsstatus wird auf „Needs Cleaning“ gesetzt und eine echte Reinigungsaufgabe
              für dieses Fahrzeug erstellt — sofern noch keine offene Aufgabe existiert.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCleaningWarning(false)}
                disabled={cleaningStatusBusy}
                className="flex-1 px-3 py-2 rounded-md font-medium transition-all duration-200 bg-muted text-foreground hover:bg-accent border border-border sq-press disabled:opacity-60"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmCleaningChange}
                disabled={cleaningStatusBusy}
                className="flex-1 px-3 py-2 rounded-md font-semibold text-white transition-all duration-200 shadow-sm sq-press bg-[color:var(--status-watch)] hover:opacity-90 disabled:opacity-60"
              >
                {cleaningStatusBusy ? 'Wird gespeichert…' : 'Bestätigen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Status Warning Modal */}
      {showStatusWarning && (
        <div className="fixed inset-0 sq-backdrop flex items-center justify-center z-[100]">
          <div className="max-w-md w-full mx-4 rounded-xl p-6 shadow-xl border border-border surface-premium">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                pendingStatus === 'Manual Block' ? 'sq-tone-critical' : 'sq-tone-warning'
              }`}>
                {pendingStatus === 'Manual Block' ? (
                  <Icon name="x-circle" className="w-5 h-5" />
                ) : (
                  <Icon name="wrench" className="w-5 h-5" />
                )}
              </div>
              <h3 className="text-base font-semibold text-foreground font-display">
                Change Vehicle Status
              </h3>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              {pendingStatus === 'Manual Block' 
                ? 'You are about to manually block this vehicle. It will no longer be available for bookings until you change the status back to "Available".'
                : 'You are about to set this vehicle to maintenance mode. It will be unavailable for bookings and a maintenance task may be required.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (vehicleStatusBusy) return;
                  setShowStatusWarning(false);
                  setPendingStatus(null);
                }}
                disabled={vehicleStatusBusy}
                className="flex-1 px-3 py-2 rounded-md font-medium transition-all duration-200 bg-muted text-foreground hover:bg-accent border border-border sq-press disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirmStatusChange}
                disabled={vehicleStatusBusy}
                className={`flex-1 px-3 py-2 text-white rounded-md font-semibold transition-all duration-200 shadow-sm sq-press hover:opacity-90 disabled:opacity-60 ${
                  pendingStatus === 'Manual Block'
                    ? 'bg-[color:var(--status-critical)]'
                    : 'bg-[color:var(--status-warning)]'
                }`}
              >
                {vehicleStatusBusy ? 'Wird gespeichert…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Station Change Warning Modal */}
      {showStationWarning && (
        <div className="fixed inset-0 sq-backdrop flex items-center justify-center z-[100]">
          <div className="max-w-md w-full mx-4 rounded-xl p-6 shadow-xl border border-border surface-premium">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full sq-tone-brand flex items-center justify-center shrink-0">
                <Icon name="map-pin" className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground font-display">
                Relocate Vehicle
              </h3>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              Are you sure you want to relocate this vehicle from <span className="font-semibold">{currentStation}</span> to <span className="font-semibold">{pendingStation}</span>? This action will update the vehicle's location in the system.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowStationWarning(false);
                  setPendingStation(null);
                }}
                className="flex-1 px-3 py-2 rounded-md font-medium transition-all duration-200 bg-muted text-foreground hover:bg-accent border border-border sq-press"
              >
                Cancel
              </button>
              <button
                onClick={confirmStationChange}
                className="flex-1 px-3 py-2 rounded-md font-semibold text-brand-foreground transition-all duration-200 shadow-sm sq-press bg-brand hover:bg-[color:var(--brand-hover)]"
              >
                Confirm Relocation
              </button>
            </div>
          </div>
        </div>
      )}

    </AppShell>
    </HandoverProvider>
    </RentalEntityNavigationProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <RentalProvider>
        <FleetProvider>
          <DashboardInsightsProvider>
            <AppErrorBoundary
              title="Rental view crashed"
              description="A runtime error interrupted the rental interface. Reload and try opening Fleet again."
            >
              <RentalAppContent />
            </AppErrorBoundary>
          </DashboardInsightsProvider>
        </FleetProvider>
      </RentalProvider>
    </LanguageProvider>
  );
}
