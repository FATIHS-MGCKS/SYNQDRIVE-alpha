
import { Icon } from './components/ui/Icon';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { NewTaskModal } from './components/NewTaskModal';
import { TripsView } from './components/TripsView';
import { DashboardView } from './components/DashboardView';
import { BookingsView } from './components/BookingsView';
import { FinancialInsightsView } from './components/FinancialInsightsView';
import { HealthErrorsView } from './components/HealthErrorsView';
import { FleetHubView, type FleetTab } from './components/FleetHubView';
import { DamagesView } from './components/DamagesView';
import { DocumentsView } from './components/DocumentsView';
import { CustomersView } from './components/CustomersView';
import { SettingsView } from './components/SettingsView';
import { StationsView } from './components/stations/StationsView';
import { StationDetailView } from './components/stations/StationDetailView';
import { NewBookingView } from './components/NewBookingView';
import { FinanceView } from './components/FinanceView';
import type { FinanceTab } from './components/FinanceView';
import { TasksView } from './components/TasksView';
import { VendorDetailView } from './components/VendorDetailView';
import { CustomerDetailView } from './components/CustomerDetailView';
import { VehicleBookingsView } from './components/VehicleBookingsView';
import { VehicleTasksView } from './components/VehicleTasksView';
import { BrandLogo, getBrandFromModel } from './components/BrandLogo';
import { VehicleData } from './data/vehicles';
import { RentalProvider, useRentalOrg } from './RentalContext';
import { FleetProvider, useFleetVehicles, useEffectiveHealth } from './FleetContext';
import { DashboardInsightsProvider } from './DashboardInsightsContext';
import { HandoverProvider } from './HandoverContext';
import { Toaster } from 'sonner';
import { useLiveVehicleTelemetry } from './hooks/useLiveVehicleTelemetry';
import { useVehicleLiveMapStore } from './stores/useVehicleLiveMapStore';
import { resolveTelemetryFreshness } from './lib/telemetryFreshness';
import { useShallow } from 'zustand/react/shallow';
import { LanguageProvider } from './i18n/LanguageContext';
import { DocumentUploadView } from './components/DocumentUploadView';
import { PageHeader, HealthStatusChip, StatusChip } from '../components/patterns';
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
  VehicleOverviewTab,
  VehicleRequirementsTab,
  createVehicleOverviewNavigator,
  useVehicleOverviewSummary,
} from './components/vehicle-detail';
import type { ServiceCenterNavState } from './lib/service-center-navigation';
import { formatUserFacingReasonLabel } from './lib/operational-issues';

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

function VehicleConnectionBadge() {
  const { onlineStatus, lastSignal } = useVehicleLiveMapStore(
    useShallow((state) => ({
      onlineStatus: state.onlineStatus,
      lastSignal: state.lastSignal,
    })),
  );

  // Central 5-state telemetry freshness — same logic as the fleet rows.
  // STANDBY is a calm, neutral state (no warning colour); signal_delayed is a
  // low (watch) hint; offline / no_signal are muted connectivity problems.
  const freshness = resolveTelemetryFreshness({ lastSignal, onlineStatus });
  let timeAgo = '—';
  if (freshness.signalAgeMs != null) {
    const mins = Math.floor(freshness.signalAgeMs / 60000);
    if (mins < 1) timeAgo = 'just now';
    else if (mins < 60) timeAgo = `${mins}m ago`;
    else {
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) timeAgo = `${hrs}h ago`;
      else timeAgo = `${Math.floor(hrs / 24)}d ago`;
    }
  }
  const dotColor = freshness.isLive
    ? 'text-[color:var(--status-positive)] fill-[color:var(--status-positive)] animate-online-pulse'
    : freshness.isSignalDelayed
      ? 'text-[color:var(--status-watch)] fill-[color:var(--status-watch)]'
      : freshness.isStandby
        ? 'text-muted-foreground fill-[color:var(--muted-foreground)]'
        : 'text-muted-foreground fill-[color:var(--status-nodata)]';
  const labelColor = freshness.isLive
    ? 'text-[color:var(--status-positive)]'
    : freshness.isSignalDelayed
      ? 'text-[color:var(--status-watch)]'
      : 'text-muted-foreground';
  const label = freshness.shortLabel;

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-card shadow-sm">
      <div className="flex items-center gap-1.5">
        <Icon name="circle" className={`w-2 h-2 ${dotColor}`} />
        <span className={`text-[10px] font-semibold tracking-[-0.003em] ${labelColor}`}>{label}</span>
      </div>
      <div className="w-px h-4 bg-border"></div>
      <div className="flex items-center gap-1">
        <span className="text-[10.5px] font-semibold text-muted-foreground">
          Last Signal
        </span>
        <span className="text-[10.5px] font-bold tabular-nums text-foreground">
          {timeAgo}
        </span>
      </div>
    </div>
  );
}

// V4.7.23 — Vehicle-Detail header health chip. Reads the canonical
// Rental-Health-V1 status from the shared FleetProvider map so the
// header pill never disagrees with FleetView, FleetCondition or the
// Dashboard popups. Falls back to a neutral "Loading…" pill while the
// batched health request is in flight.
function VehicleHealthChip({ vehicleId }: { vehicleId: string | null }) {
  const { status, health, loading } = useEffectiveHealth(vehicleId);
  const reasons: string[] = [];
  if (health?.rental_blocked && health.blocking_reasons.length > 0) {
    reasons.push(...health.blocking_reasons.map((reason) =>
      formatUserFacingReasonLabel({ title: reason, category: 'rental', issueType: 'rental_blocked' }, 'de'),
    ));
  }
  if (health) {
    for (const [name, mod] of Object.entries(health.modules)) {
      if (mod.state === 'critical' || mod.state === 'warning') {
        reasons.push(formatUserFacingReasonLabel({
          title: mod.reason,
          source: `rental-health:${name}`,
          category: name === 'error_codes' ? 'dtc' : name,
        }, 'de'));
      }
    }
  }
  const title = reasons.join(' · ') || undefined;
  if (loading && !health) {
    return <HealthStatusChip state="unknown" label="Loading…" icon={<Icon name="heart" className="w-3 h-3" />} title="Loading rental health…" />;
  }
  if (status === 'Critical') {
    return <HealthStatusChip state="critical" label="Critical" icon={<Icon name="heart" className="w-3 h-3" />} title={title} />;
  }
  if (status === 'Warning') {
    return <HealthStatusChip state="warning" label="Warning" icon={<Icon name="heart" className="w-3 h-3" />} title={title} />;
  }
  if (status === 'Good Health') {
    return <HealthStatusChip state="good" label="Good Health" icon={<Icon name="heart" className="w-3 h-3" />} title={title} />;
  }
  return <HealthStatusChip state="no_data" label="Limited Data" icon={<Icon name="heart" className="w-3 h-3" />} title={title ?? 'Insufficient rental health data'} />;
}

type RentalSettingsTab =
  | 'account'
  | 'company'
  | 'fleet-connection'
  | 'users'
  | 'billing'
  | 'data-authorization'
  | 'legal-documents'
  | 'rental-rules';

const RENTAL_SETTINGS_TAB_KEY = 'synqdrive_rental_settings_tab';
const RENTAL_SETTINGS_VIEW_KEY = 'synqdrive_rental_on_settings';

function readPersistedSettingsTab(): RentalSettingsTab {
  try {
    const raw = sessionStorage.getItem(RENTAL_SETTINGS_TAB_KEY);
    const valid: RentalSettingsTab[] = [
      'account',
      'company',
      'fleet-connection',
      'users',
      'billing',
      'data-authorization',
      'legal-documents',
      'rental-rules',
    ];
    if (raw && valid.includes(raw as RentalSettingsTab)) return raw as RentalSettingsTab;
  } catch {
    /* ignore */
  }
  return 'company';
}

function readPersistedSettingsView(): boolean {
  try {
    return sessionStorage.getItem(RENTAL_SETTINGS_VIEW_KEY) === '1';
  } catch {
    return false;
  }
}

function RentalAppContent() {
  const { orgId } = useRentalOrg();
  const { fleetVehicles, loading: fleetLoading, refresh: refreshFleet } = useFleetVehicles();

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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [cleaningStatus, setCleaningStatus] = useState<'Clean' | 'Needs Cleaning'>('Clean');
  const [vehicleStatus, setVehicleStatus] = useState<'Available' | 'Manual Block' | 'Maintenance'>('Available');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isCleaningDropdownOpen, setIsCleaningDropdownOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [autoOpenNewTask, setAutoOpenNewTask] = useState(false);
  const [currentView, setCurrentView] = useState<'overview' | 'trips' | 'dashboard' | 'bookings' | 'health-errors' | 'fleet' | 'damages' | 'documents' | 'customers' | 'customer-detail' | 'tasks' | 'vendor-detail' | 'invoices' | 'price-tariffs' | 'financial-insights' | 'settings' | 'new-booking' | 'stations' | 'station-detail' | 'vehicle-bookings' | 'vehicle-tasks' | 'vehicle-requirements' | 'document-upload' | 'ai-assistant' | 'support' | 'help-center' | 'data-analyse' | 'workflow-automation' | 'whatsapp-business' | 'parts-accessories' | 'insurances' | 'ai-voice-assistant'>(() =>
    readPersistedSettingsView() ? 'settings' : 'dashboard',
  );
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [detailStation, setDetailStation] = useState<import('../lib/api').Station | null>(null);
  const [detailVendorId, setDetailVendorId] = useState<string | null>(null);
  // V4.6.99 — Pending Booking-Detail-Id für die Cross-View-Navigation
  // (Dashboard → BookingsView → Detail-Seite). Wird gesetzt, wenn ein
  // BK-Chip in einer StatInlineDetail-Karte geklickt wird; BookingsView
  // konsumiert das Feld in einem useEffect und setzt anschliessend
  // `setPendingBookingDetailId(null)` über den Reset-Callback zurück.
  const [pendingBookingDetailId, setPendingBookingDetailId] = useState<string | null>(null);
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
  const [fleetTab, setFleetTab] = useState<FleetTab>('status');
  const [serviceCenterNav, setServiceCenterNav] = useState<ServiceCenterNavState | null>(null);
  const [financeTab, setFinanceTab] = useState<FinanceTab>('invoices');
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
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    if (!fleetLoading && fleetVehicles.length > 0 && !selectedVehicle) {
      setSelectedVehicle(fleetVehicles[0]);
    }
  }, [fleetLoading, fleetVehicles, selectedVehicle]);

  // Shared new customers (created in NewBookingView, shown in CustomersView)
  const [newlyCreatedCustomers, setNewlyCreatedCustomers] = useState<any[]>([]);

  // Shared new bookings (created in NewBookingView, shown in BookingsView)
  const [createdBookings, setCreatedBookings] = useState<any[]>([]);

  // Triggers a FleetContext refresh whenever bookings are created / updated /
  // cancelled so the backend-derived vehicle status (Available/Reserved/
  // Active Rented) reflects the new commitment state inside the next render
  // instead of waiting up to 30s for the scheduled fleet poll to pick it up.
  const bumpBookingsVersion = () => {
    refreshFleet().catch(() => {});
  };

  // V4.6.75 — HandoverProvider broadcasts `handover:completed` after the
  // pickup or return protocol has been written. Refresh fleet so BookingsView
  // and DashboardView reflect the new booking status + vehicle availability
  // immediately.
  useEffect(() => {
    const onHandover = () => {
      refreshFleet().catch(() => {});
    };
    window.addEventListener('handover:completed', onHandover as EventListener);
    return () => window.removeEventListener('handover:completed', onHandover as EventListener);
  }, [refreshFleet]);

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
        void refreshFleet();

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
    [cleaningStatusBusy, orgId, refreshFleet, selectedVehicle?.id],
  );

  const handleCleaningStatusChange = (newStatus: 'Clean' | 'Needs Cleaning') => {
    if (newStatus === 'Needs Cleaning') {
      setShowCleaningWarning(true);
      setIsCleaningDropdownOpen(false);
    } else {
      setIsCleaningDropdownOpen(false);
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
      setIsStatusDropdownOpen(false);
    } else {
      setVehicleStatus(newStatus);
      setIsStatusDropdownOpen(false);
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
    setVehicleStatus(vehicle.status === 'Available' ? 'Available' : vehicle.status === 'Maintenance' ? 'Maintenance' : 'Available');
    setCleaningStatus(vehicle.cleaningStatus);
    setCurrentStation(vehicle.station);
    setCurrentView('overview');
  };

  const handleBackToFleet = () => {
    setCurrentView('fleet');
    setFleetTab('status');
  };

  const openServiceCenter = useCallback((nav?: Partial<ServiceCenterNavState>) => {
    setServiceCenterNav(nav ?? {});
    setFleetTab('service');
    setCurrentView('fleet');
  }, []);

  /** Central view router — maps legacy views to the new IA. */
  const handleViewChange = (view: string) => {
    if (view === 'fleet-condition') {
      setCurrentView('fleet');
      setFleetTab('health');
      return;
    }
    if (view === 'vendor-management') {
      setCurrentView('fleet');
      setFleetTab('service');
      return;
    }
    if (view === 'fines') return;
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
    <HandoverProvider isDarkMode={isDarkMode}>
    <AppShell
      variant="rental"
      sidebar={(
      <Sidebar 
        onNewTaskClick={() => { handleViewChange('tasks'); setAutoOpenNewTask(true); }}
        onNewBookingClick={() => handleViewChange('new-booking')}
        currentView={currentView}
        onViewChange={handleViewChange}
        onFleetTabChange={setFleetTab}
        settingsTab={settingsTab}
        onSettingsTabChange={setSettingsTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        supportUnreadCount={supportUnreadCount}
      />
      )}
    >
      <VehicleLiveTelemetryBinder vehicleId={liveTelemetryVehicleId} orgId={orgId} />
      <Toaster position="top-right" richColors closeButton theme={isDarkMode ? 'dark' : 'light'} />
            <TopBar isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} currentView={currentView} fleetTab={fleetTab} settingsTab={settingsTab} selectedVehicle={selectedVehicle} activeBookingRef={activeBookingRef} detailCustomerId={detailCustomerId} detailStationName={detailStation?.name ?? null} onViewChange={handleViewChange} onVehicleSelect={setSelectedVehicle} onSettingsTabChange={setSettingsTab} onFinanceTabChange={setFinanceTab} onFleetTabChange={setFleetTab} />
        {/* Header Section - Only show for vehicle detail views */}
        {showVehicleDetailChrome && selectedVehicle && (
        <div className="mb-3 animate-fade-up">
          <PageHeader
            eyebrow={[selectedVehicle.license, selectedVehicle.station].filter(Boolean).join(' · ') || 'Vehicle'}
            title={`${selectedVehicle.make ?? ''} ${selectedVehicle.model} ${selectedVehicle.year}`.trim()}
            icon={(
              <BrandLogo
                brand={getBrandFromModel(selectedVehicle.make || selectedVehicle.model || '')}
                size={24}
              />
            )}
            actions={(
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={handleBackToFleet}
                  className="sq-press p-1.5 rounded-xl border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
                  title="Back to Fleet"
                  aria-label="Back to Fleet"
                >
                  <Icon name="arrow-left" className="w-4 h-4" />
                </button>
                <div className="relative">
                <button
                  onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                  className={`sq-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] ${
                    vehicleStatus === 'Available'
                      ? ''
                      : vehicleStatus === 'Manual Block'
                        ? ''
                        : ''
                  }`}
                >
                  <StatusChip
                    tone={vehicleStatus === 'Available' ? 'success' : vehicleStatus === 'Manual Block' ? 'critical' : 'warning'}
                    icon={
                      vehicleStatus === 'Available' ? (
                        <Icon name="check-circle" className="w-3 h-3" />
                      ) : vehicleStatus === 'Manual Block' ? (
                        <Icon name="x-circle" className="w-3 h-3" />
                      ) : (
                        <Icon name="wrench" className="w-3 h-3" />
                      )
                    }
                  >
                    {vehicleStatus}
                  </StatusChip>
                </button>
                
                {isStatusDropdownOpen && (
                  <div className="sq-overlay animate-fade-up absolute top-full mt-1.5 left-0 z-50 min-w-[170px] p-1 rounded-xl">
                    <button
                      onClick={() => handleVehicleStatusChange('Available')}
                      className="w-full px-2.5 py-2 flex items-center gap-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <Icon name="check-circle" className="w-3.5 h-3.5 text-[color:var(--status-positive)]" />
                      <span className="text-[12px] font-medium text-foreground">Available</span>
                    </button>
                    <button
                      onClick={() => handleVehicleStatusChange('Manual Block')}
                      className="w-full px-2.5 py-2 flex items-center gap-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <Icon name="x-circle" className="w-3.5 h-3.5 text-[color:var(--status-critical)]" />
                      <span className="text-[12px] font-medium text-foreground">Manual Block</span>
                    </button>
                    <button
                      onClick={() => handleVehicleStatusChange('Maintenance')}
                      className="w-full px-2.5 py-2 flex items-center gap-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <Icon name="wrench" className="w-3.5 h-3.5 text-[color:var(--status-attention)]" />
                      <span className="text-[12px] font-medium text-foreground">Maintenance</span>
                    </button>
                  </div>
                )}
                </div>

                <div className="relative">
                <button
                  onClick={() => setIsCleaningDropdownOpen(!isCleaningDropdownOpen)}
                  className="sq-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
                >
                  <StatusChip
                    tone={cleaningStatus === 'Clean' ? 'info' : 'critical'}
                    icon={<Icon name="sparkles" className="w-3 h-3" />}
                  >
                    {cleaningStatus}
                  </StatusChip>
                </button>

                {isCleaningDropdownOpen && (
                  <div className="sq-overlay animate-fade-up absolute top-full mt-1.5 left-0 z-50 min-w-[170px] p-1 rounded-xl">
                    <button
                      onClick={() => handleCleaningStatusChange('Clean')}
                      className="w-full px-2.5 py-2 flex items-center gap-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <Icon name="sparkles" className="w-3.5 h-3.5 text-[color:var(--status-info)]" />
                      <span className="text-[12px] font-medium text-foreground">Clean</span>
                    </button>
                    <button
                      onClick={() => handleCleaningStatusChange('Needs Cleaning')}
                      className="w-full px-2.5 py-2 flex items-center gap-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <Icon name="alert-triangle" className="w-3.5 h-3.5 text-[color:var(--status-critical)]" />
                      <span className="text-[12px] font-medium text-foreground">Needs Cleaning</span>
                    </button>
                  </div>
                )}
                </div>

                <VehicleHealthChip vehicleId={selectedVehicle.id ?? null} />
                <VehicleConnectionBadge />
              </div>
            )}
          />
        </div>
        )}

        {/* Tab Navigation - Only show for vehicle detail views */}
        {showVehicleDetailChrome && (
        <div className="mb-4">
          <div className="sq-tab-bar p-1 flex items-center w-full">
            <div className="flex flex-nowrap gap-0.5 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  onClick={() => setCurrentView(tab.key as typeof currentView)}
                  className={`px-3.5 py-1.5 rounded-[calc(var(--radius-md)-2px)] text-[11px] leading-[16.2px] font-semibold tracking-[-0.003em] whitespace-nowrap transition-all duration-200 ${
                    currentView === tab.key
                      ? 'bg-card text-foreground shadow-[var(--shadow-1)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
                  }`}
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
            <div className="rounded-lg px-2.5 py-1 border border-border bg-card shadow-sm flex items-center justify-end gap-2">
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
                      : 'bg-card border-border text-foreground hover:bg-muted'
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
                      : 'bg-card border-border text-foreground hover:bg-muted'
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
            onOpenFinanceView={(view) => handleViewChange(view)}
            onOpenBookingById={(bookingId) => {
              setPendingBookingDetailId(bookingId);
              setCurrentView('bookings');
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
            bumpBookingsVersion();
          }} onBookingCancelled={(bookingId) => {
            setCreatedBookings(prev => prev.filter(b => b.id !== bookingId));
            bumpBookingsVersion();
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
            onCreateBooking={() => setCurrentView('new-booking')}
          />
        ) : currentView === 'invoices' || currentView === 'price-tariffs' ? (
          <FinanceView
            isDarkMode={isDarkMode}
            activeTab={currentView as FinanceTab}
            onTabChange={(tab) => { setFinanceTab(tab); handleViewChange(tab); }}
          />
        ) : currentView === 'vendor-detail' && detailVendorId ? (
          <VendorDetailView
            vendorId={detailVendorId}
            onBack={() => { setCurrentView('fleet'); setFleetTab('service'); setDetailVendorId(null); }}
          />
        ) : currentView === 'tasks' ? (
          <TasksView
            autoOpenNewTask={autoOpenNewTask}
            onAutoOpenConsumed={() => setAutoOpenNewTask(false)}
            highlightedTaskId={highlightedTaskId}
            onHighlightConsumed={() => setHighlightedTaskId(null)}
          />
        ) : currentView === 'document-upload' ? (
          <DocumentUploadView isDarkMode={isDarkMode} />
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
          <WorkflowAutomationView isDarkMode={isDarkMode} />
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
            onTabChange={setSettingsTab}
            onNavigateToStations={() => handleViewChange('stations')}
          />
        ) : currentView === 'new-booking' ? (
          <NewBookingView onBack={() => setCurrentView('bookings')} onCustomerCreated={(c) => setNewlyCreatedCustomers(prev => [c, ...prev])} onBookingCreated={(b) => { setCreatedBookings(prev => [b, ...prev]); bumpBookingsVersion(); }} />
        ) : currentView === 'overview' ? (
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
        ) : null}

      {/* New Task Modal */}
      <NewTaskModal 
        isOpen={isNewTaskModalOpen} 
        onClose={() => setIsNewTaskModalOpen(false)} 
        isDarkMode={isDarkMode}
      />

      {/* Cleaning Status Warning Modal */}
      {showCleaningWarning && (
        <div className="fixed inset-0 sq-backdrop flex items-center justify-center z-[100]">
          <div className="max-w-md w-full mx-4 rounded-xl p-6 shadow-xl border border-border bg-card">
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
          <div className="max-w-md w-full mx-4 rounded-xl p-6 shadow-xl border border-border bg-card">
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
          <div className="max-w-md w-full mx-4 rounded-xl p-6 shadow-xl border border-border bg-card">
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
