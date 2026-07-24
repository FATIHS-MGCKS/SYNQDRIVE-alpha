
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAppTheme } from '../context/AppThemeContext';
import { Icon } from './components/ui/Icon';
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
import { normalizeFleetStatusKey } from './lib/vehicle-status';
import { VEHICLE_OPERATIONAL_STATUS } from './lib/vehicle-operational-state';
import {
  invalidateVehicleOperationalAfterBookingChange,
  invalidateVehicleOperationalState,
} from './lib/vehicle-operational-query';
import { RentalProvider, useRentalOrg } from './RentalContext';
import { FleetProvider, useFleetVehicles } from './FleetContext';
import { DashboardInsightsProvider } from './DashboardInsightsContext';
import { HandoverProvider } from './HandoverContext';
import { Toaster } from 'sonner';
import { useLiveVehicleTelemetry } from './hooks/useLiveVehicleTelemetry';
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
  VehicleDetailTabBar,
  VehicleDetailTabPanel,
  VehicleOverviewTab,
  VehicleRequirementsTab,
  VehicleTripsFilterBar,
  createVehicleOverviewNavigator,
  useVehicleOverviewSummary,
} from './components/vehicle-detail';
import type { VehicleDetailTab } from './components/vehicle-detail';
import type { ServiceCenterNavState } from './lib/service-center-navigation';
import {
  VEHICLE_DETAIL_VIEW_CLASS,
} from './lib/vehicle-detail-mobile-ui';
import {
  RentalEntityNavigationProvider,
  type RentalEntityNavigationValue,
} from './context/RentalEntityNavigationContext';

// Views that render the vehicle detail header (incl. <VehicleConnectionBadge>).
// The live-telemetry binder must cover the same set so the Online/Offline +
// Last-Signal indicator stays populated across tabs — not just Overview.
// Keep in sync with the header/tabs guards further below in RentalAppContent.
const VEHICLE_DETAIL_VIEWS = new Set<string>([
  'overview',
  'trips',
  'health-errors',
  'damages',
  'documents',
  'vehicle-bookings',
  'vehicle-tasks',
  'vehicle-requirements',
]);

function VehicleLiveTelemetryBinder({
  vehicleId,
  orgId,
}: {
  vehicleId: string | null;
  orgId: string;
}) {
  useLiveVehicleTelemetry(vehicleId, orgId);
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
  const [cleaningStatus, setCleaningStatus] = useState<'Clean' | 'Needs Cleaning'>('Clean');
  const [vehicleStatus, setVehicleStatus] = useState<'Available' | 'Manual Block' | 'Maintenance'>('Available');
  const [autoOpenNewTask, setAutoOpenNewTask] = useState(false);
  const [currentView, setCurrentView] = useState<'overview' | 'trips' | 'dashboard' | 'bookings' | 'health-errors' | 'fleet' | 'damages' | 'documents' | 'customers' | 'customer-detail' | 'tasks' | 'vendor-detail' | 'invoices' | 'fines' | 'price-tariffs' | 'customer-payments' | 'financial-insights' | 'settings' | 'new-booking' | 'stations' | 'station-detail' | 'vehicle-bookings' | 'vehicle-tasks' | 'vehicle-requirements' | 'document-upload' | 'ai-assistant' | 'support' | 'help-center' | 'data-analyse' | 'workflow-automation' | 'whatsapp-business' | 'parts-accessories' | 'insurances' | 'ai-voice-assistant'>(() => {
    const financeView = typeof window !== 'undefined' ? parseFinanceViewFromUrl(window.location.search) : null;
    if (financeView) return financeView;
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
  const vehicleDetailActiveTab: VehicleDetailTab | null = VEHICLE_DETAIL_VIEWS.has(currentView)
    ? (currentView as VehicleDetailTab)
    : null;
  const [activeBookingRef, setActiveBookingRef] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [highlightedVehicleTaskId, setHighlightedVehicleTaskId] = useState<string | null>(null);
  const [vehicleTasksRefreshToken, setVehicleTasksRefreshToken] = useState(0);
  const [cleaningStatusBusy, setCleaningStatusBusy] = useState(false);
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
        setCurrentView: (view) => setCurrentView(view),
        setHighlightedVehicleTaskId,
        setPendingBookingDetailId,
      }),
    [setCurrentView, setHighlightedVehicleTaskId, setPendingBookingDetailId],
  );
  
  useEffect(() => {
    if (!fleetLoading && fleetVehicles.length > 0 && !selectedVehicle) {
      setSelectedVehicle(fleetVehicles[0]);
    }
  }, [fleetLoading, fleetVehicles, selectedVehicle]);

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
    const normalized = normalizeFleetStatusKey(fresh.status);
    setVehicleStatus(
      normalized === VEHICLE_OPERATIONAL_STATUS.AVAILABLE
        ? 'Available'
        : normalized === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE
          ? 'Maintenance'
          : 'Manual Block',
    );
    setCleaningStatus(fresh.cleaningStatus);
  }, [fleetVehicles, selectedVehicle?.id, selectedVehicle?.status, selectedVehicle?.cleaningStatus]);

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
  const [pendingStatus, setPendingStatus] = useState<'Manual Block' | 'Maintenance' | null>(null);
  
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

  // Handle cleaning status change
  const persistCleaningStatus = useCallback(
    async (apiStatus: 'CLEAN' | 'NEEDS_CLEANING') => {
      if (!orgId || !selectedVehicle?.id || cleaningStatusBusy) return;
      setCleaningStatusBusy(true);
      try {
        const res = await api.vehicles.updateOperationalStatus(orgId, selectedVehicle.id, {
          cleaningStatus: apiStatus,
        });
        const uiStatus = apiStatus === 'NEEDS_CLEANING' ? 'Needs Cleaning' : 'Clean';
        setCleaningStatus(uiStatus);
        setSelectedVehicle((prev) => (prev ? { ...prev, cleaningStatus: uiStatus } : prev));
        setVehicleTasksRefreshToken((t) => t + 1);
        void invalidateVehicleOperationalState({
          orgId,
          vehicleIds: [selectedVehicle.id],
          reason: 'vehicle-status-patch',
          optimistic: 'none',
        });

        const action = res.cleaningTask?.action;
        if (apiStatus === 'NEEDS_CLEANING') {
          if (action === 'created') {
            toast.success('Reinigungsaufgabe erstellt', {
              description: 'Die Aufgabe erscheint im Task-Tab dieses Fahrzeugs.',
            });
            if (res.cleaningTask?.taskId) {
              setHighlightedVehicleTaskId(res.cleaningTask.taskId);
              setCurrentView('vehicle-tasks');
            }
          } else if (action === 'existing') {
            toast.info('Offene Reinigungsaufgabe bereits vorhanden', {
              description: 'Es wurde keine Duplikat-Aufgabe erstellt.',
            });
            if (res.cleaningTask?.taskId) {
              setHighlightedVehicleTaskId(res.cleaningTask.taskId);
              setCurrentView('vehicle-tasks');
            }
          } else {
            toast.warning('Reinigungsstatus gespeichert', {
              description: 'Die Reinigungsaufgabe konnte nicht angelegt werden.',
            });
          }
        } else if (action === 'completed') {
          toast.success('Reinigungsaufgabe abgeschlossen', {
            description:
              (res.cleaningTask?.completedCount ?? 0) > 1
                ? `${res.cleaningTask?.completedCount} offene Reinigungsaufgaben wurden abgeschlossen.`
                : 'Fahrzeug als sauber markiert.',
          });
        } else {
          toast.success('Fahrzeug als sauber markiert');
        }
      } catch (err) {
        toast.error('Reinigungsstatus konnte nicht gespeichert werden', {
          description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        });
        throw err;
      } finally {
        setCleaningStatusBusy(false);
      }
    },
    [cleaningStatusBusy, orgId, selectedVehicle?.id],
  );

  const handleCleaningStatusChange = (newStatus: 'Clean' | 'Needs Cleaning') => {
    if (newStatus === 'Needs Cleaning') {
      setShowCleaningWarning(true);
    } else {
      void persistCleaningStatus('CLEAN');
    }
  };

  // Confirm cleaning status change
  const confirmCleaningChange = () => {
    setShowCleaningWarning(false);
    void persistCleaningStatus('NEEDS_CLEANING');
  };

  // Handle vehicle status change
  const handleVehicleStatusChange = (newStatus: 'Available' | 'Manual Block' | 'Maintenance') => {
    // Show warning if changing from Available to Maintenance or Manual Block
    if (vehicleStatus === 'Available' && (newStatus === 'Maintenance' || newStatus === 'Manual Block')) {
      setPendingStatus(newStatus);
      setShowStatusWarning(true);
    } else {
      setVehicleStatus(newStatus);
    }
  };

  // Confirm vehicle status change
  const confirmStatusChange = () => {
    if (pendingStatus) {
      setVehicleStatus(pendingStatus);
      setPendingStatus(null);
    }
    setShowStatusWarning(false);
  };

  // Handle vehicle selection from Fleet
  const handleVehicleSelect = (vehicle: VehicleData) => {
    setSelectedVehicle(vehicle);
    setVehicleStatus(vehicle.status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE ? 'Available' : vehicle.status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE ? 'Maintenance' : 'Available');
    setCleaningStatus(vehicle.cleaningStatus);
    setCurrentStation(vehicle.station);
    setCurrentView('overview');
  };

  const handleBackToFleet = () => {
    setCurrentView('fleet');
    setFleetTab('status');
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
      openVehicleById: (vehicleId) => {
        const match = fleetVehicles.find((vehicle) => vehicle.id === vehicleId);
        if (match) {
          setSelectedVehicle(match);
          setCurrentView('overview');
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
          if (match) setSelectedVehicle(match);
        }
        setCurrentView('documents');
      },
      openAlertById: (_alertId, options) => {
        if (options?.vehicleId) {
          const match = fleetVehicles.find((vehicle) => vehicle.id === options.vehicleId);
          if (match) setSelectedVehicle(match);
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
    [fleetVehicles, openServiceCenter, selectedVehicle?.id],
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
        if (match) setSelectedVehicle(match);
      }
      if (view === 'health-errors' && entry.returnEntityId) {
        const match = fleetVehicles.find((vehicle) => vehicle.id === entry.returnEntityId);
        if (match) setSelectedVehicle(match);
      }
      setCurrentView(view as typeof currentView);
    },
    [fleetVehicles],
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
      if (!fromUrl) return;
      skipFleetHealthNavUrlSync.current = true;
      setFleetHealthServiceNav(fromUrl);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
      <VehicleLiveTelemetryBinder vehicleId={liveTelemetryVehicleId} orgId={orgId} />
      <Toaster position="top-right" richColors closeButton theme={isDarkMode ? 'dark' : 'light'} />
            <TopBar
              onViewChange={handleViewChange}
              onVehicleSelect={setSelectedVehicle}
              onSettingsTabChange={applySettingsTab}
              onFinanceTabChange={setFinanceTab}
            />
        {showVehicleDetailChrome ? (
          <div
            data-testid="vehicle-detail-view"
            className={VEHICLE_DETAIL_VIEW_CLASS}
          >
            {selectedVehicle ? (
              <VehicleDetailHeader
                vehicle={selectedVehicle}
                vehicleStatus={vehicleStatus}
                cleaningStatus={cleaningStatus}
                onVehicleStatusChange={handleVehicleStatusChange}
                onCleaningStatusChange={handleCleaningStatusChange}
                onBack={handleBackToFleet}
                onRefreshOperationalStatus={() => {
                  void refreshFleetVehicles();
                }}
              />
            ) : null}

            {vehicleDetailActiveTab ? (
              <VehicleDetailTabBar
                activeTab={vehicleDetailActiveTab}
                onTabChange={(tab) => setCurrentView(tab)}
              />
            ) : null}
          </div>
        ) : null}

        {/* V4.6.94 — `MainNavTabs` retired. The horizontal Dashboard /
            Bookings / Fleet / Customers / Stations tab strip duplicated the
            top-level Sidebar entries 1:1, only appeared on those 5 routes
            (causing a ~50px header jump when switching to Insights /
            Settings / Trips), and added zero capability the always-visible
            sidebar (incl. its mobile drawer) didn't already cover. */}
        {currentView === 'trips' ? (
          <VehicleDetailTabPanel tab="trips" activeTab="trips">
            <VehicleTripsFilterBar
              tripsCount={tripsCount}
              selectedDate={selectedDate}
              selectedDriver={selectedDriver}
              tripDriverOptions={tripDriverOptions}
              hasActiveFilters={hasActiveFilters}
              onSelectedDateChange={setSelectedDate}
              onSelectedDriverChange={setSelectedDriver}
              onClearFilters={clearFilters}
            />
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
                const names = [
                  ...new Set(
                    (trips as { driverName?: string }[])
                      .map((trip) => trip.driverName)
                      .filter(Boolean),
                  ),
                ] as string[];
                setTripDriverOptions(names);
              }}
            />
          </VehicleDetailTabPanel>
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
            onVehicleSelect={(vehicle) => { setSelectedVehicle(vehicle); setCurrentView('overview'); }}
            onOpenVehicleById={(vehicleId) => {
              const v = fleetVehicles.find((fv) => fv.id === vehicleId);
              if (v) { setSelectedVehicle(v); setCurrentView('overview'); }
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
          <VehicleDetailTabPanel tab="health-errors" activeTab="health-errors">
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
          </VehicleDetailTabPanel>
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
          <VehicleDetailTabPanel tab="damages" activeTab="damages">
            <DamagesView
              isDarkMode={isDarkMode}
              vehicleId={selectedVehicle?.id}
              onOpenVehicleTasks={(taskId) => {
                if (taskId) setHighlightedVehicleTaskId(taskId);
                setCurrentView('vehicle-tasks');
              }}
            />
          </VehicleDetailTabPanel>
        ) : currentView === 'documents' ? (
          <VehicleDetailTabPanel tab="documents" activeTab="documents">
            <DocumentsView
              vehicle={selectedVehicle}
              onOpenLinkedTask={(taskId) => {
                setHighlightedVehicleTaskId(taskId);
                setCurrentView('vehicle-tasks');
              }}
            />
          </VehicleDetailTabPanel>
        ) : currentView === 'vehicle-bookings' ? (
          <VehicleDetailTabPanel tab="vehicle-bookings" activeTab="vehicle-bookings">
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
          </VehicleDetailTabPanel>
        ) : currentView === 'vehicle-tasks' ? (
          <VehicleDetailTabPanel tab="vehicle-tasks" activeTab="vehicle-tasks">
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
          </VehicleDetailTabPanel>
        ) : currentView === 'vehicle-requirements' ? (
          <VehicleDetailTabPanel tab="vehicle-requirements" activeTab="vehicle-requirements">
            <VehicleRequirementsTab
              selectedVehicle={selectedVehicle}
              orgId={orgId}
              onOpenRentalRulesCenter={() => {
                setSettingsTab('rental-rules');
                handleViewChange('settings');
              }}
            />
          </VehicleDetailTabPanel>
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
                if (v) {
                  setSelectedVehicle(v);
                  setCurrentView('overview');
                }
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
            if (v) { setSelectedVehicle(v); setCurrentView('documents'); }
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
          <VehicleDetailTabPanel tab="overview" activeTab="overview">
            <VehicleOverviewTab
              selectedVehicle={selectedVehicle}
              orgId={orgId}
              isDarkMode={isDarkMode}
              summary={vehicleOverviewSummary}
              onNavigate={navigateVehicleOverview}
              onOpenHealthDetails={() => {
                if (selectedVehicle) setCurrentView('health-errors');
              }}
              onOpenServiceCenter={openServiceCenter}
              onOpenVehicleTask={(taskId) => {
                setHighlightedVehicleTaskId(taskId);
                setCurrentView('vehicle-tasks');
              }}
              tasksRefreshToken={vehicleTasksRefreshToken}
            />
          </VehicleDetailTabPanel>
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
                  setShowStatusWarning(false);
                  setPendingStatus(null);
                }}
                className="flex-1 px-3 py-2 rounded-md font-medium transition-all duration-200 bg-muted text-foreground hover:bg-accent border border-border sq-press"
              >
                Cancel
              </button>
              <button
                onClick={confirmStatusChange}
                className={`flex-1 px-3 py-2 text-white rounded-md font-semibold transition-all duration-200 shadow-sm sq-press hover:opacity-90 ${
                  pendingStatus === 'Manual Block'
                    ? 'bg-[color:var(--status-critical)]'
                    : 'bg-[color:var(--status-warning)]'
                }`}
              >
                Confirm
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
