import { Circle, MapPin, Gauge, Droplet, Thermometer, Battery, Gauge as Odometer, Calendar, ClipboardList, Sparkles, Wrench, FileText, AlertTriangle, Disc, Camera, Settings, Home, CheckCircle, Heart, XCircle, ChevronDown, User, X, ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { NewTaskModal } from './components/NewTaskModal';
import { TripsView } from './components/TripsView';
import { DashboardView } from './components/DashboardView';
import { BookingsView } from './components/BookingsView';
import { DrivingInsightsView } from './components/DrivingInsightsView';
import { HealthErrorsView } from './components/HealthErrorsView';
import { FleetView } from './components/FleetView';
import { DamagesView } from './components/DamagesView';
import { DocumentsView } from './components/DocumentsView';
import { CustomersView } from './components/CustomersView';
// TasksView, InvoicesView, FinesView, PriceTariffsView, AnalyticsView
// are now rendered via OperationsView
import { SettingsView, StationsTab } from './components/SettingsView';
import { NewBookingView } from './components/NewBookingView';
import { MainNavTabs } from './components/MainNavTabs';
import type { MainNavTab } from './components/MainNavTabs';
import { OperationsView } from './components/OperationsView';
import type { OperationsTab } from './components/OperationsView';
import { FinanceView } from './components/FinanceView';
import type { FinanceTab } from './components/FinanceView';
import { TasksSectionView } from './components/TasksSectionView';
import type { TasksSectionTab } from './components/TasksSectionView';
import { CustomerDetailView } from './components/CustomerDetailView';
import { VehicleBookingsView } from './components/VehicleBookingsView';
import { VehicleTasksView } from './components/VehicleTasksView';
import { BrandLogo, getBrandFromModel } from './components/BrandLogo';
import { VehicleData, fleetVehicles } from './data/vehicles';
import { VehicleTariff, buildTariffs } from './data/tariffs';
import berlinMap from 'figma:asset/23b71b566638f37fe76b7ff1aed253ecc0494825.png';
import { Toaster } from 'sonner';
import { RightSidebar } from './components/RightSidebar';
import { LanguageProvider } from './i18n/LanguageContext';
import { DocumentUploadView } from './components/DocumentUploadView';
import { AIAssistantView } from './components/AIAssistantView';
import { SupportView } from './components/SupportView';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [cleaningStatus, setCleaningStatus] = useState<'Clean' | 'Needs Cleaning'>('Clean');
  const [vehicleStatus, setVehicleStatus] = useState<'Available' | 'Manual Block' | 'Maintenance'>('Available');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isCleaningDropdownOpen, setIsCleaningDropdownOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [autoOpenNewTask, setAutoOpenNewTask] = useState(false);
  const [currentView, setCurrentView] = useState<'overview' | 'trips' | 'dashboard' | 'bookings' | 'driving-insights' | 'health-errors' | 'fleet' | 'damages' | 'documents' | 'customers' | 'customer-detail' | 'tasks' | 'vendor-management' | 'invoices' | 'fines' | 'price-tariffs' | 'analytics' | 'settings' | 'new-booking' | 'stations' | 'vehicle-bookings' | 'vehicle-tasks' | 'document-upload' | 'ai-assistant' | 'support'>('dashboard');
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [settingsTab, setSettingsTab] = useState<'account' | 'company' | 'fleet-connection' | 'users' | 'billing' | 'data-authorization'>('company');
  const [operationsTab, setOperationsTab] = useState<OperationsTab>('analytics');
  const [financeTab, setFinanceTab] = useState<FinanceTab>('invoices');
  const [tasksSectionTab, setTasksSectionTab] = useState<TasksSectionTab>('tasks');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleData | null>(fleetVehicles[0]);
  const [activeBookingRef, setActiveBookingRef] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Tariff state (shared between PriceTariffsView and NewBookingView)
  const [tariffs, setTariffs] = useState<VehicleTariff[]>(() => buildTariffs());

  // Shared new customers (created in NewBookingView, shown in CustomersView)
  const [newlyCreatedCustomers, setNewlyCreatedCustomers] = useState<any[]>([]);

  // Shared new bookings (created in NewBookingView, shown in BookingsView)
  const [createdBookings, setCreatedBookings] = useState<any[]>([]);

  // Hovered vehicle for cross-component highlighting (StatInlineDetail <-> RightSidebar)
  const [hoveredVehicle, setHoveredVehicle] = useState<string | null>(null);

  // Station state
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [currentStation, setCurrentStation] = useState('Kassel Hauptbahnhof');
  const [isStationDropdownOpen, setIsStationDropdownOpen] = useState(false);
  const [showStationWarning, setShowStationWarning] = useState(false);
  const [pendingStation, setPendingStation] = useState<string | null>(null);
  
  // Warning modals
  const [showCleaningWarning, setShowCleaningWarning] = useState(false);
  const [showStatusWarning, setShowStatusWarning] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'Manual Block' | 'Maintenance' | null>(null);
  
  // Available stations
  const availableStations = [
    'Kassel Hauptbahnhof',
    'Kassel Mitte',
  ];
  
  // Trip filter states
  const [selectedDriver, setSelectedDriver] = useState('all');
  const [selectedDate, setSelectedDate] = useState('');
  const [isDriverDropdownOpen, setIsDriverDropdownOpen] = useState(false);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);

  // Trip data
  const allTrips = [
    {
      id: '1',
      date: '25 Feb 2026',
      startTime: '08:15',
      endTime: '09:42',
      driver: 'Kunde A',
      startLocation: 'Kassel Hauptbahnhof',
      endLocation: 'Kassel Mitte',
      distance: '12 km',
      duration: '27min',
      alerts: 0,
      drivingScore: 94
    },
    {
      id: '2',
      date: '25 Feb 2026',
      startTime: '11:30',
      endTime: '12:45',
      driver: 'Kunde B',
      startLocation: 'Kassel Mitte',
      endLocation: 'Kassel Hauptbahnhof',
      distance: '15 km',
      duration: '1h 15min',
      alerts: 1,
      drivingScore: 88
    },
    {
      id: '3',
      date: '24 Feb 2026',
      startTime: '14:20',
      endTime: '16:05',
      driver: 'Kunde C',
      startLocation: 'Kassel Hauptbahnhof',
      endLocation: 'Kassel Mitte',
      distance: '18 km',
      duration: '1h 45min',
      alerts: 0,
      drivingScore: 82
    },
    {
      id: '4',
      date: '24 Feb 2026',
      startTime: '17:00',
      endTime: '17:38',
      driver: 'Kunde A',
      startLocation: 'Kassel Mitte',
      endLocation: 'Kassel Hauptbahnhof',
      distance: '10 km',
      duration: '38min',
      alerts: 0,
      drivingScore: 96
    },
    {
      id: '5',
      date: '23 Feb 2026',
      startTime: '09:45',
      endTime: '11:20',
      driver: 'Kunde B',
      startLocation: 'Kassel Hauptbahnhof',
      endLocation: 'Kassel Mitte',
      distance: '22 km',
      duration: '1h 35min',
      alerts: 2,
      drivingScore: 78
    },
    {
      id: '6',
      date: '23 Feb 2026',
      startTime: '16:10',
      endTime: '17:45',
      driver: 'Kunde C',
      startLocation: 'Kassel Mitte',
      endLocation: 'Kassel Hauptbahnhof',
      distance: '14 km',
      duration: '1h 35min',
      alerts: 0,
      drivingScore: 91
    }
  ];

  // Filter trips
  const filteredTrips = allTrips.filter(trip => {
    const matchesDriver = selectedDriver === 'all' || trip.driver === selectedDriver;
    const matchesDate = !selectedDate || trip.date.includes(selectedDate);
    return matchesDriver && matchesDate;
  });

  // Clear filters function
  const clearFilters = () => {
    setSelectedDriver('all');
    setSelectedDate('');
  };

  // Check if any filter is active
  const hasActiveFilters = selectedDriver !== 'all' || selectedDate !== '';

  // Handle cleaning status change
  const handleCleaningStatusChange = (newStatus: 'Clean' | 'Needs Cleaning') => {
    if (newStatus === 'Needs Cleaning') {
      setShowCleaningWarning(true);
      setIsCleaningDropdownOpen(false);
    } else {
      setCleaningStatus(newStatus);
      setIsCleaningDropdownOpen(false);
    }
  };

  // Confirm cleaning status change
  const confirmCleaningChange = () => {
    setCleaningStatus('Needs Cleaning');
    setShowCleaningWarning(false);
    // Here you would create a cleaning task
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
  };

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

  return (
    <LanguageProvider>
    <div 
      className={`size-full flex overflow-hidden transition-colors duration-500 relative ${
        isDarkMode 
          ? 'bg-[#000000] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-neutral-900 via-neutral-950 to-black' 
          : 'bg-[#F2F2F7] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white via-gray-50 to-[#E5E5EA]'
      }`}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <Toaster position="top-right" richColors closeButton theme={isDarkMode ? 'dark' : 'light'} />
      <Sidebar 
        isDarkMode={isDarkMode} 
        onNewTaskClick={() => { setCurrentView('tasks'); setTasksSectionTab('tasks'); setAutoOpenNewTask(true); }}
        onNewBookingClick={() => setCurrentView('new-booking')}
        currentView={currentView}
        onViewChange={setCurrentView}
        settingsTab={settingsTab}
        onSettingsTabChange={setSettingsTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
      />
      <div className="flex-1 flex flex-col overflow-hidden pt-16 lg:pt-0">
        <div className={`flex-1 overflow-auto px-6 sm:px-12 lg:px-16 pt-8 lg:pt-10 pb-14 ${isDarkMode ? 'text-gray-100' : ''}`}>
          <div className="max-w-[1400px] mx-auto">
            <TopBar isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} currentView={currentView} settingsTab={settingsTab} selectedVehicle={selectedVehicle} activeBookingRef={activeBookingRef} detailCustomerId={detailCustomer ? `CID-${detailCustomer.id.replace('c', '')}4821` : null} onViewChange={setCurrentView} onVehicleSelect={setSelectedVehicle} onSettingsTabChange={setSettingsTab} onFinanceTabChange={setFinanceTab} onTasksTabChange={setTasksSectionTab} />
            
        {/* Header Section - Only show for overview and trips views */}
        {currentView !== 'dashboard' && currentView !== 'bookings' && currentView !== 'fleet' && currentView !== 'customers' && currentView !== 'customer-detail' && currentView !== 'tasks' && currentView !== 'invoices' && currentView !== 'fines' && currentView !== 'price-tariffs' && currentView !== 'analytics' && currentView !== 'settings' && currentView !== 'new-booking' && currentView !== 'stations' && currentView !== 'fleet-condition' && currentView !== 'document-upload' && currentView !== 'ai-assistant' && currentView !== 'support' && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBackToFleet}
                className={`p-2 rounded-xl border transition-all duration-200 hover:shadow-md ${
                  isDarkMode
                    ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-300 hover:bg-neutral-800'
                    : 'bg-white/60 border-gray-200/50 text-gray-600 hover:bg-white'
                }`}
                title="Back to Fleet"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center justify-center" style={{ width: 32, height: 32 }}>
                <BrandLogo 
                  brand={getBrandFromModel(selectedVehicle?.model || 'Volkswagen Golf 2025')} 
                  size={28} 
                  isDarkMode={isDarkMode} 
                />
              </div>
              <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedVehicle?.model || 'Volkswagen Golf 2025'}</h1>
              <div className="flex gap-2">
                <div className="relative">
                <button 
                  onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold border flex items-center gap-1.5 transition-all duration-200 hover:shadow-md cursor-pointer ${
                    vehicleStatus === 'Available'
                      ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                      : vehicleStatus === 'Manual Block'
                      ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                      : 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200'
                  }`}
                >
                  {vehicleStatus === 'Available' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : vehicleStatus === 'Manual Block' ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    <Wrench className="w-4 h-4" />
                  )}
                  {vehicleStatus}
                  <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                </button>
                
                {isStatusDropdownOpen && (
                  <div className="absolute top-full mt-2 left-0 z-50 min-w-[180px] backdrop-blur-xl bg-white/95 rounded-xl border border-gray-200/50 shadow-xl overflow-hidden">
                    <button
                      onClick={() => handleVehicleStatusChange('Available')}
                      className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-green-50 transition-colors text-left border-b border-gray-100"
                    >
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-gray-700">Available</span>
                    </button>
                    <button
                      onClick={() => handleVehicleStatusChange('Manual Block')}
                      className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-red-50 transition-colors text-left border-b border-gray-100"
                    >
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-medium text-gray-700">Manual Block</span>
                    </button>
                    <button
                      onClick={() => handleVehicleStatusChange('Maintenance')}
                      className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-orange-50 transition-colors text-left"
                    >
                      <Wrench className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-medium text-gray-700">Maintenance</span>
                    </button>
                  </div>
                )}
                </div>

                {/* Cleaning Status Dropdown */}
                <div className="relative">
                <button 
                  onClick={() => setIsCleaningDropdownOpen(!isCleaningDropdownOpen)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold border flex items-center gap-1.5 transition-all duration-200 hover:shadow-md cursor-pointer ${
                    cleaningStatus === 'Clean'
                      ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200'
                      : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  {cleaningStatus}
                  <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                </button>

                {isCleaningDropdownOpen && (
                  <div className="absolute top-full mt-2 left-0 z-50 min-w-[180px] backdrop-blur-xl bg-white/95 rounded-xl border border-gray-200/50 shadow-xl overflow-hidden">
                    <button
                      onClick={() => handleCleaningStatusChange('Clean')}
                      className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-blue-50 transition-colors text-left border-b border-gray-100"
                    >
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">Clean</span>
                    </button>
                    <button
                      onClick={() => handleCleaningStatusChange('Needs Cleaning')}
                      className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-red-50 transition-colors text-left"
                    >
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-medium text-gray-700">Needs Cleaning</span>
                    </button>
                  </div>
                )}
                </div>

                <span className={`px-4 py-1.5 rounded-full text-sm font-semibold border flex items-center gap-1.5 ${
                  selectedVehicle?.healthStatus === 'Critical'
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : selectedVehicle?.healthStatus === 'Warning'
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                }`}>
                  <Heart className="w-4 h-4" />
                  {selectedVehicle?.healthStatus || 'Good Health'}
                </span>
              </div>
            </div>
            {(() => {
              const ls = selectedVehicle?.lastSignal;
              let connState: 'online' | 'standby' | 'offline' = 'offline';
              let timeAgo = '—';
              if (ls) {
                const diff = Date.now() - new Date(ls).getTime();
                if (!isNaN(diff) && diff >= 0) {
                  if (diff < 900000) connState = 'online';
                  else if (diff < 86400000) connState = 'standby';
                  const mins = Math.floor(diff / 60000);
                  if (mins < 1) timeAgo = 'just now';
                  else if (mins < 60) timeAgo = `${mins}m ago`;
                  else { const hrs = Math.floor(mins / 60); if (hrs < 24) timeAgo = `${hrs}h ago`; else timeAgo = `${Math.floor(hrs / 24)}d ago`; }
                }
              }
              const dotColor = connState === 'online' ? 'text-green-500 fill-green-500 animate-online-pulse' : connState === 'standby' ? 'text-amber-500 fill-amber-500' : 'text-gray-400 fill-gray-400';
              const labelColor = connState === 'online' ? 'text-green-700' : connState === 'standby' ? (isDarkMode ? 'text-amber-400' : 'text-amber-600') : 'text-gray-500';
              const label = connState === 'online' ? 'Online' : connState === 'standby' ? 'Standby' : 'Offline';
              return (
                <div className={`flex items-center gap-3 px-5 py-2.5 backdrop-blur-sm rounded-xl border shadow-sm ${isDarkMode ? 'bg-neutral-900/60 border-neutral-700/50' : 'bg-white/60 border-gray-200/50'}`}>
                  <div className="flex items-center gap-2">
                    <Circle className={`w-2.5 h-2.5 ${dotColor}`} />
                    <span className={`text-sm font-bold ${labelColor}`}>{label}</span>
                  </div>
                  <div className={`w-px h-5 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`}></div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Last Signal</span>
                    <span className={`text-xs font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{timeAgo}</span>
                  </div>
                </div>
              );
            })()}
          </div>
          
          {/* Vehicle Details Section */}
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-4 py-2.5 backdrop-blur-sm rounded-xl border shadow-sm ${
              isDarkMode 
                ? 'bg-neutral-900/60 border-neutral-700/50' 
                : 'bg-white/60 border-gray-200/50'
            }`}>
              <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>License Plate</span>
              <span className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{selectedVehicle?.license || 'KS FS 600'}</span>
            </div>
            
            <div className="relative">
              <button 
                onClick={() => setIsStationDropdownOpen(!isStationDropdownOpen)}
                className={`flex items-center gap-2 px-4 py-2.5 backdrop-blur-sm rounded-xl border shadow-sm transition-all duration-200 hover:shadow-md cursor-pointer ${
                  isDarkMode 
                    ? 'bg-neutral-900/60 border-neutral-700/50 hover:bg-neutral-900/80' 
                    : 'bg-white/60 border-gray-200/50 hover:bg-white/80'
                }`}>
                <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Station</span>
                <span className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{currentStation}</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isStationDropdownOpen ? 'rotate-180' : ''} ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              </button>
              
              {isStationDropdownOpen && (
                <div className={`absolute top-full mt-2 left-0 min-w-[240px] backdrop-blur-xl rounded-xl shadow-lg border z-50 overflow-hidden ${
                  isDarkMode 
                    ? 'bg-neutral-900/95 border-neutral-700/50' 
                    : 'bg-white/95 border-gray-200/50'
                }`}>
                  {availableStations.map((station) => (
                    <button
                      key={station}
                      onClick={() => handleStationChange(station)}
                      className={`w-full px-4 py-3 text-left text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                        station === currentStation
                          ? isDarkMode
                            ? 'bg-blue-600/20 text-blue-400'
                            : 'bg-blue-50 text-blue-600'
                          : isDarkMode
                            ? 'text-gray-300 hover:bg-neutral-800/60'
                            : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <MapPin className="w-4 h-4" />
                      {station}
                      {station === currentStation && (
                        <CheckCircle className="w-4 h-4 ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className={`flex items-center gap-2 px-4 py-2.5 backdrop-blur-sm rounded-xl border shadow-sm ${
              isDarkMode 
                ? 'bg-gradient-to-r from-amber-900/40 to-orange-900/40 border-amber-700/50' 
                : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200/50'
            }`}>
              <span className={`text-xs font-medium ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>Fuel</span>
              <span className={`text-sm font-bold ${isDarkMode ? 'text-amber-300' : 'text-amber-900'}`}>{selectedVehicle?.fuelType || 'Petrol'}</span>
            </div>
          </div>
        </div>
        )}

        {/* Tab Navigation - Only show for overview and trips views */}
        {currentView !== 'dashboard' && currentView !== 'bookings' && currentView !== 'fleet' && currentView !== 'customers' && currentView !== 'customer-detail' && currentView !== 'tasks' && currentView !== 'invoices' && currentView !== 'fines' && currentView !== 'price-tariffs' && currentView !== 'analytics' && currentView !== 'settings' && currentView !== 'new-booking' && currentView !== 'stations' && currentView !== 'fleet-condition' && currentView !== 'document-upload' && currentView !== 'ai-assistant' && currentView !== 'support' && (
        <div className="mb-4">
          <div className={`backdrop-blur-xl rounded-2xl p-2 shadow-[0_4px_20px_rgb(0,0,0,0.06)] border flex gap-2 items-center w-full ${
            isDarkMode 
              ? 'bg-neutral-900/60 border-neutral-700/50' 
              : 'bg-white/60 border-gray-200/50'
          }`}>
            <div className="flex gap-2 flex-1">
              <button 
                onClick={() => setCurrentView('overview')}
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                currentView === 'overview'
                  ? isDarkMode 
                    ? 'bg-neutral-800 text-white shadow-[0_2px_8px_rgb(0,0,0,0.08)]' 
                    : 'bg-white text-gray-900 shadow-[0_2px_8px_rgb(0,0,0,0.08)]'
                  : isDarkMode 
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}>
                Overview
              </button>
              <button 
                onClick={() => setCurrentView('trips')}
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                currentView === 'trips'
                  ? isDarkMode 
                    ? 'bg-neutral-800 text-white shadow-[0_2px_8px_rgb(0,0,0,0.08)]' 
                    : 'bg-white text-gray-900 shadow-[0_2px_8px_rgb(0,0,0,0.08)]'
                  : isDarkMode 
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}>
                Trips
              </button>
              <button 
                onClick={() => setCurrentView('driving-insights')}
                className={`px-6 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                currentView === 'driving-insights'
                  ? isDarkMode 
                    ? 'bg-neutral-800 text-white shadow-[0_2px_8px_rgb(0,0,0,0.08)]' 
                    : 'bg-white text-gray-900 shadow-[0_2px_8px_rgb(0,0,0,0.08)]'
                  : isDarkMode 
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}>
                Driving Insights
              </button>
              <button 
                onClick={() => setCurrentView('health-errors')}
                className={`px-6 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                currentView === 'health-errors'
                  ? isDarkMode 
                    ? 'bg-neutral-800 text-white shadow-[0_2px_8px_rgb(0,0,0,0.08)]' 
                    : 'bg-white text-gray-900 shadow-[0_2px_8px_rgb(0,0,0,0.08)]'
                  : isDarkMode 
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}>
                Health
              </button>
              <button 
                onClick={() => setCurrentView('damages')}
                className={`px-6 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                currentView === 'damages'
                  ? isDarkMode 
                    ? 'bg-neutral-800 text-white shadow-[0_2px_8px_rgb(0,0,0,0.08)]' 
                    : 'bg-white text-gray-900 shadow-[0_2px_8px_rgb(0,0,0,0.08)]'
                  : isDarkMode 
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}>
                Damages
              </button>
              <button 
                onClick={() => setCurrentView('documents')}
                className={`px-6 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                currentView === 'documents'
                  ? isDarkMode 
                    ? 'bg-neutral-800 text-white shadow-[0_2px_8px_rgb(0,0,0,0.08)]' 
                    : 'bg-white text-gray-900 shadow-[0_2px_8px_rgb(0,0,0,0.08)]'
                  : isDarkMode 
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}>
                Documents
              </button>
              <button 
                onClick={() => setCurrentView('vehicle-bookings')}
                className={`px-6 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                currentView === 'vehicle-bookings'
                  ? isDarkMode 
                    ? 'bg-neutral-800 text-white shadow-[0_2px_8px_rgb(0,0,0,0.08)]' 
                    : 'bg-white text-gray-900 shadow-[0_2px_8px_rgb(0,0,0,0.08)]'
                  : isDarkMode 
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}>
                Bookings
              </button>
              <button 
                onClick={() => setCurrentView('vehicle-tasks')}
                className={`px-6 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                currentView === 'vehicle-tasks'
                  ? isDarkMode 
                    ? 'bg-neutral-800 text-white shadow-[0_2px_8px_rgb(0,0,0,0.08)]' 
                    : 'bg-white text-gray-900 shadow-[0_2px_8px_rgb(0,0,0,0.08)]'
                  : isDarkMode 
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}>
                Task List
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Filters Bar - Show on Trips and Driving Insights views, above content */}
        {(currentView === 'trips' || currentView === 'driving-insights') && (
          <div className="mb-4">
            <div className={`backdrop-blur-xl rounded-2xl px-4 py-2.5 shadow-[0_4px_20px_rgb(0,0,0,0.06)] border flex items-center justify-end gap-2 ${
              isDarkMode 
                ? 'bg-neutral-900/60 border-neutral-700/50' 
                : 'bg-white/60 border-gray-200/50'
            }`}>
              {/* Trip Counter - Only show on Trips view */}
              {currentView === 'trips' && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-200 mr-auto ${
                  isDarkMode 
                    ? 'bg-blue-900/30 border-blue-700/50' 
                    : 'bg-blue-50/80 border-blue-200/50'
                }`}>
                  <span className={`text-xs font-bold ${
                    isDarkMode ? 'text-blue-300' : 'text-blue-700'
                  }`}>
                    {filteredTrips.length} {filteredTrips.length === 1 ? 'Trip' : 'Trips'}
                  </span>
                </div>
              )}

              {/* Date Filter */}
              <div className="relative">
                <button
                  onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-200 ${
                    selectedDate
                      ? isDarkMode
                        ? 'bg-green-900/30 border-green-700/50 ring-2 ring-green-500/20'
                        : 'bg-green-50/80 border-green-300/50 ring-2 ring-green-400/20'
                      : isDarkMode 
                        ? 'bg-neutral-800/60 border-neutral-700/50 hover:bg-neutral-800' 
                        : 'bg-white/60 border-gray-200/50 hover:bg-white'
                  }`}
                >
                  <Calendar className={`w-4 h-4 ${
                    selectedDate
                      ? isDarkMode ? 'text-green-400' : 'text-green-600'
                      : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <span className={`text-xs font-medium ${
                    selectedDate
                      ? isDarkMode ? 'text-green-300' : 'text-green-700'
                      : isDarkMode ? 'text-gray-200' : 'text-gray-900'
                  }`}>
                    {selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'All Time'}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 ${
                    selectedDate
                      ? isDarkMode ? 'text-green-400' : 'text-green-600'
                      : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                </button>

                {isDateDropdownOpen && (
                  <div className={`absolute top-full mt-2 right-0 z-50 backdrop-blur-xl rounded-xl border shadow-xl overflow-hidden p-3 ${
                    isDarkMode 
                      ? 'bg-neutral-900/95 border-neutral-700/50' 
                      : 'bg-white/95 border-gray-200/50'
                  }`}>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setIsDateDropdownOpen(false);
                      }}
                      className={`px-3 py-2 rounded-lg border outline-none text-sm font-medium ${
                        isDarkMode
                          ? 'bg-neutral-800 border-neutral-700 text-gray-200'
                          : 'bg-white border-gray-200 text-gray-900'
                      }`}
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
                      ? isDarkMode
                        ? 'bg-green-900/30 border-green-700/50 ring-2 ring-green-500/20'
                        : 'bg-green-50/80 border-green-300/50 ring-2 ring-green-400/20'
                      : isDarkMode 
                        ? 'bg-neutral-800/60 border-neutral-700/50 hover:bg-neutral-800' 
                        : 'bg-white/60 border-gray-200/50 hover:bg-white'
                  }`}
                >
                  <User className={`w-4 h-4 ${
                    selectedDriver !== 'all'
                      ? isDarkMode ? 'text-green-400' : 'text-green-600'
                      : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <span className={`text-xs font-medium ${
                    selectedDriver !== 'all'
                      ? isDarkMode ? 'text-green-300' : 'text-green-700'
                      : isDarkMode ? 'text-gray-200' : 'text-gray-900'
                  }`}>
                    {selectedDriver === 'all' ? 'All Drivers' : selectedDriver}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 ${
                    selectedDriver !== 'all'
                      ? isDarkMode ? 'text-green-400' : 'text-green-600'
                      : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                </button>

                {isDriverDropdownOpen && (
                  <div className={`absolute top-full mt-2 right-0 z-50 min-w-[200px] backdrop-blur-xl rounded-xl border shadow-xl overflow-hidden ${
                    isDarkMode 
                      ? 'bg-neutral-900/95 border-neutral-700/50' 
                      : 'bg-white/95 border-gray-200/50'
                  }`}>
                    {['all', 'Kunde A', 'Kunde B', 'Kunde C'].map((driver) => (
                      <button
                        key={driver}
                        onClick={() => {
                          setSelectedDriver(driver);
                          setIsDriverDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors border-b last:border-b-0 ${
                          selectedDriver === driver
                            ? isDarkMode
                              ? 'bg-blue-600/20 text-blue-400 border-neutral-700/50'
                              : 'bg-blue-50 text-blue-600 border-gray-200/50'
                            : isDarkMode
                              ? 'text-gray-300 hover:bg-neutral-800 border-neutral-700/50'
                              : 'text-gray-700 hover:bg-gray-50 border-gray-200/50'
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
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all duration-200 ${
                    isDarkMode 
                      ? 'bg-red-900/30 border-red-700/50 hover:bg-red-900/50 text-red-400 hover:text-red-300' 
                      : 'bg-red-50/80 border-red-200/50 hover:bg-red-100 text-red-600 hover:text-red-700'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Clear</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content Area - Changes based on currentView */}
        {/* Main Navigation Tabs - Show for Dashboard, Bookings, Fleet, Customers, Stations */}
        {(['dashboard', 'bookings', 'fleet', 'customers', 'stations'] as const).includes(currentView as MainNavTab) && (
          <MainNavTabs
            isDarkMode={isDarkMode}
            activeTab={currentView as MainNavTab}
            onTabChange={(tab) => setCurrentView(tab)}
          />
        )}

        {currentView === 'trips' ? (
          <TripsView 
            isDarkMode={isDarkMode} 
            filteredTrips={filteredTrips}
          />
        ) : currentView === 'stations' ? (
          <StationsTab isDarkMode={isDarkMode} />
        ) : currentView === 'dashboard' ? (
          <DashboardView isDarkMode={isDarkMode} onVehicleSelect={(vehicle) => { setSelectedVehicle(vehicle); setCurrentView('overview'); }} onItemHover={setHoveredVehicle} />
        ) : currentView === 'bookings' ? (
          <BookingsView isDarkMode={isDarkMode} onActiveBookingRefChange={setActiveBookingRef} onNavigateToVehicle={(vehicleName) => {
            const nameNorm = vehicleName.toLowerCase().replace(/[-\s]/g, '');
            const vehicle = fleetVehicles.find(v => {
              const modelNorm = v.model.toLowerCase().replace(/[-\s]/g, '');
              return modelNorm.includes(nameNorm) || nameNorm.includes(modelNorm.replace(/\d{4}$/, '').trim());
            });
            if (vehicle) { handleVehicleSelect(vehicle); }
          }} onCreateNewBooking={() => setCurrentView('new-booking')} additionalBookings={createdBookings} onBookingUpdated={(updatedBooking) => {
            setCreatedBookings(prev => prev.map(b => b.id === updatedBooking.id ? updatedBooking : b));
          }} onBookingCancelled={(bookingId) => {
            setCreatedBookings(prev => prev.filter(b => b.id !== bookingId));
          }} />
        ) : currentView === 'driving-insights' ? (
          <DrivingInsightsView isDarkMode={isDarkMode} />
        ) : currentView === 'health-errors' ? (
          <HealthErrorsView isDarkMode={isDarkMode} />
        ) : currentView === 'fleet' ? (
          <FleetView isDarkMode={isDarkMode} onVehicleSelect={handleVehicleSelect} />
        ) : currentView === 'damages' ? (
          <DamagesView isDarkMode={isDarkMode} />
        ) : currentView === 'documents' ? (
          <DocumentsView isDarkMode={isDarkMode} vehicle={selectedVehicle} />
        ) : currentView === 'vehicle-bookings' ? (
          <VehicleBookingsView isDarkMode={isDarkMode} vehicleName={selectedVehicle?.model} />
        ) : currentView === 'vehicle-tasks' ? (
          <VehicleTasksView isDarkMode={isDarkMode} />
        ) : currentView === 'customers' ? (
          <CustomersView isDarkMode={isDarkMode} onOpenCustomerDetail={(c) => { setDetailCustomer(c); setCurrentView('customer-detail'); }} additionalCustomers={newlyCreatedCustomers} />
        ) : currentView === 'customer-detail' && detailCustomer ? (
          <CustomerDetailView
            customer={detailCustomer}
            isDarkMode={isDarkMode}
            onBack={() => setCurrentView('customers')}
            onUpdateCustomer={(updated) => setDetailCustomer(updated)}
          />
        ) : currentView === 'invoices' || currentView === 'fines' || currentView === 'price-tariffs' ? (
          <FinanceView
            isDarkMode={isDarkMode}
            activeTab={currentView as FinanceTab}
            onTabChange={(tab) => { setFinanceTab(tab); setCurrentView(tab); }}
            tariffs={tariffs}
            onTariffsChange={setTariffs}
          />
        ) : currentView === 'tasks' || currentView === 'vendor-management' ? (
          <TasksSectionView
            isDarkMode={isDarkMode}
            activeTab={currentView as TasksSectionTab}
            onTabChange={(tab) => { setTasksSectionTab(tab); setCurrentView(tab); }}
            autoOpenNewTask={autoOpenNewTask}
            onAutoOpenConsumed={() => setAutoOpenNewTask(false)}
            highlightedTaskId={highlightedTaskId}
            onHighlightConsumed={() => setHighlightedTaskId(null)}
          />
        ) : currentView === 'analytics' || currentView === 'fleet-condition' ? (
          <OperationsView
            isDarkMode={isDarkMode}
            activeTab={currentView as OperationsTab}
            onTabChange={(tab) => setCurrentView(tab)}
            tariffs={tariffs}
            onTariffsChange={setTariffs}
          />
        ) : currentView === 'document-upload' ? (
          <DocumentUploadView isDarkMode={isDarkMode} />
        ) : currentView === 'ai-assistant' ? (
          <AIAssistantView isDarkMode={isDarkMode} />
        ) : currentView === 'support' ? (
          <SupportView isDarkMode={isDarkMode} />
        ) : currentView === 'settings' ? (
          <SettingsView isDarkMode={isDarkMode} activeTab={settingsTab} onTabChange={setSettingsTab} />
        ) : currentView === 'new-booking' ? (
          <NewBookingView isDarkMode={isDarkMode} onBack={() => setCurrentView('bookings')} tariffs={tariffs} onCustomerCreated={(c) => setNewlyCreatedCustomers(prev => [c, ...prev])} onBookingCreated={(b) => { setCreatedBookings(prev => [b, ...prev]); }} />
        ) : (
          <>
        {/* Main Grid - Top Section */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* Left Column - Map and AI Summary */}
          <div className={"col-span-2 flex flex-col gap-4 transition-all duration-300"}>
            {/* Mapbox with Integrated Data Bar */}
            <div className={`backdrop-blur-xl rounded-3xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_20px_60px_rgb(0,0,0,0.12)] transition-all duration-300 ${
              isDarkMode 
                ? 'bg-neutral-900/80' 
                : 'bg-white/80'
            }`}>
              {/* Map Area */}
              <div className="group relative h-[360px] rounded-2xl overflow-hidden transition-all duration-300">
                <img 
                  src={berlinMap}
                  alt="Map View"
                  className="w-full h-full object-cover scale-105"
                />
                {/* Map Overlay with Vehicle Pin */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <div className="relative">
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 animate-bounce">
                      <MapPin className="w-10 h-10 text-red-500 fill-red-500 drop-shadow-lg" />
                    </div>
                  </div>
                </div>
                {/* Map Controls Overlay */}
                <div className="absolute top-4 right-4 flex flex-col gap-2">
                  <button className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg flex items-center justify-center hover:bg-white transition-colors">
                    <span className="text-lg font-bold text-gray-700">+</span>
                  </button>
                  <button className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg flex items-center justify-center hover:bg-white transition-colors">
                    <span className="text-lg font-bold text-gray-700">−</span>
                  </button>
                </div>

                {/* Integrated Driving Data Bar - docked at bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-3 opacity-70 group-hover:opacity-100 transition-opacity duration-700 ease-in-out">
                  <div className="bg-gradient-to-r from-white/80 to-white/70 backdrop-blur-xl rounded-2xl p-3 border border-white/50 shadow-lg">
                    <div className="grid grid-cols-6 gap-1.5">
                      {/* Ignition Status - Highlighted */}
                      <div className="flex flex-col items-center px-1 py-2 bg-green-100/80 rounded-xl border border-green-200/60">
                        <Circle className="w-3.5 h-3.5 text-green-600 fill-green-600 mb-0.5" />
                        <span className="text-[10px] text-gray-600 mb-0.5">Ignition</span>
                        <span className="text-sm font-bold text-green-700">{selectedVehicle?.speed && selectedVehicle.speed > 0 ? 'ON' : 'OFF'}</span>
                      </div>

                      {/* Speed */}
                      <div className="flex flex-col items-center px-1 py-2">
                        <Gauge className="w-3.5 h-3.5 text-blue-500 mb-0.5" />
                        <span className="text-[10px] text-gray-600 mb-0.5">Speed</span>
                        <span className="text-sm font-bold text-gray-900">{selectedVehicle?.speed || 0} <span className="text-[10px] font-normal text-gray-500">km/h</span></span>
                      </div>

                      {/* Fuel */}
                      <div className="flex flex-col items-center px-1 py-2">
                        <Droplet className="w-3.5 h-3.5 text-green-500 mb-0.5" />
                        <span className="text-[10px] text-gray-600 mb-0.5">Fuel</span>
                        <span className="text-sm font-bold text-gray-900">{selectedVehicle?.fuel || 65}<span className="text-[10px] font-normal text-gray-500">%</span></span>
                      </div>

                      {/* Coolant */}
                      <div className="flex flex-col items-center px-1 py-2">
                        <Thermometer className="w-3.5 h-3.5 text-red-500 mb-0.5" />
                        <span className="text-[10px] text-gray-600 mb-0.5">Coolant</span>
                        <span className="text-sm font-bold text-gray-900">{selectedVehicle?.coolant || 90}<span className="text-[10px] font-normal text-gray-500">°C</span></span>
                      </div>

                      {/* Battery */}
                      <div className="flex flex-col items-center px-1 py-2">
                        <Battery className="w-3.5 h-3.5 text-amber-500 mb-0.5" />
                        <span className="text-[10px] text-gray-600 mb-0.5">Battery</span>
                        <span className="text-sm font-bold text-gray-900">{selectedVehicle?.battery || 12.8}<span className="text-[10px] font-normal text-gray-500">V</span></span>
                      </div>

                      {/* Odometer */}
                      <div className="flex flex-col items-center px-1 py-2">
                        <Odometer className="w-3.5 h-3.5 text-gray-500 mb-0.5" />
                        <span className="text-[10px] text-gray-600 mb-0.5">Odometer</span>
                        <span className="text-sm font-bold text-gray-900">{selectedVehicle ? selectedVehicle.odometer.toLocaleString('de-DE') : '45.100'} <span className="text-[10px] font-normal text-gray-500">km</span></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="bg-gradient-to-br from-purple-50/80 to-pink-50/80 backdrop-blur-xl rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_20px_60px_rgb(0,0,0,0.12)] transition-all duration-300 border border-purple-200/50">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-semibold text-gray-900">AI Summary</h3>
                <span className="ml-auto px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">Last Updated: 2min ago</span>
              </div>
              
              {/* Overall Status */}
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-3 mb-3 border border-purple-200/50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <p className="text-sm font-bold text-gray-900">Overall Status: Excellent</p>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Vehicle is operating in <span className="font-semibold text-green-600">optimal condition</span> with all systems functioning normally. No critical issues detected across 24 monitored parameters.
                </p>
              </div>

              {/* Detailed Insights */}
              <div className="space-y-2">
                {/* Performance */}
                <div className="bg-white/40 backdrop-blur-sm rounded-xl p-2.5 border border-gray-200/50">
                  <div className="flex items-start gap-2">
                    <Gauge className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">Performance Analysis</p>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        Current speed at 57 km/h with RPM at 2,400 indicates efficient engine operation. Fuel consumption is <span className="font-semibold text-green-600">12% below average</span> for similar driving conditions.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Maintenance */}
                <div className="bg-white/40 backdrop-blur-sm rounded-xl p-2.5 border border-gray-200/50">
                  <div className="flex items-start gap-2">
                    <Wrench className="w-4 h-4 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">Maintenance Forecast</p>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        Next scheduled service in <span className="font-semibold text-amber-600">10,000 km</span> or <span className="font-semibold">3 months</span> (April 2026). Oil change and brake inspection recommended. Tire tread depth is good for <span className="font-semibold">15,000+ km</span>.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Rental Impact */}
                <div className="bg-white/40 backdrop-blur-sm rounded-xl p-2.5 border border-gray-200/50">
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-purple-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">Rental Readiness</p>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        Vehicle is <span className="font-semibold text-green-600">ready for rental</span>. Current booking ends in <span className="font-semibold">2 days</span>. Interior cleaning task scheduled before next rental on Feb 25. Battery health and tire pressure optimal.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recommendations */}
                <div className="bg-gradient-to-r from-blue-50/80 to-purple-50/80 rounded-xl p-2.5 border border-blue-200/50">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">AI Recommendations</p>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        • Monitor brake fluid level (high priority task open)<br/>
                        • Consider pre-rental inspection checklist<br/>
                        • Update vehicle documentation before end of month
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Health Box */}
          <div className="flex flex-col gap-6">
            {/* Overall Health Box */}
            <div className="flex flex-col gap-4 h-full">
            {/* Box 1: Vehicle Health */}
            <div className={`backdrop-blur-xl rounded-3xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_20px_60px_rgb(0,0,0,0.12)] transition-all duration-300 flex flex-col h-[392px] ${
              isDarkMode 
                ? 'bg-neutral-900/80' 
                : 'bg-white/80'
            }`}>
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Vehicle Health</h3>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5" />
                  Good Health
                </span>
              </div>

              {/* Stats Icons */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="flex flex-col items-center py-1">
                  <Circle className="w-5 h-5 text-gray-400 mb-1" />
                  <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>0</span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Alerts</span>
                  <span className="text-[10px] text-gray-400">No active alerts</span>
                </div>
                <div className="flex flex-col items-center py-1">
                  <Gauge className="w-5 h-5 text-gray-400 mb-1" />
                  <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>0</span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Anomalies</span>
                  <span className="text-[10px] text-gray-400">No unusual Data</span>
                </div>
                <div className="flex flex-col items-center py-1">
                  <ClipboardList className="w-5 h-5 text-gray-400 mb-1" />
                  <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>0</span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Feedback</span>
                  <span className="text-[10px] text-gray-400">All systems ok</span>
                </div>
              </div>

              {/* Progress Bars */}
              <div className="space-y-2.5 flex-1">
                <style>{`@keyframes barFillUp { from { width: 0%; } }`}</style>
                {[
                  { label: 'Brakes', value: selectedVehicle?.brakes ?? 98 },
                  { label: 'Tires', value: selectedVehicle?.tires ?? 70 },
                  { label: 'Battery', value: Math.round(((selectedVehicle?.battery ?? 12.8) / 14.5) * 100) },
                  { label: 'Engine Oil', value: selectedVehicle?.engineOil ?? 40 },
                ].map((item, idx) => (
                  <div key={item.label}>
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{item.label}</span>
                      <span className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{item.value}%</span>
                    </div>
                    <div className={`w-full rounded-full h-1.5 ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-200/50'}`}>
                      <div className={`h-1.5 rounded-full ${item.value > 60 ? 'bg-green-500' : item.value > 30 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${item.value}%`, animation: `barFillUp 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${idx * 0.12}s both` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Box 2: Service Info */}
            <div className={`backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_20px_60px_rgb(0,0,0,0.12)] transition-all duration-300 flex-1 ${
              isDarkMode 
                ? 'bg-neutral-900/80' 
                : 'bg-white/80'
            }`}>
              <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                <Wrench className="w-4 h-4 text-blue-500" />
                Service Info
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl p-3.5 border ${isDarkMode ? 'bg-neutral-800/50 border-neutral-600/50' : 'bg-gray-50/80 border-gray-200/50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Gauge className="w-4 h-4 text-blue-500" />
                    <span className="text-xs text-gray-600">Next Service</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">in 15 weeks</p>
                  <p className="text-xs text-gray-500">or in 12,500 km</p>
                </div>

                <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-200/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Gauge className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-600">Last Service</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">04.03.2026</p>
                  <p className="text-xs text-gray-500">2,500 km ago</p>
                </div>

                <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-200/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-purple-500" />
                    <span className="text-xs text-gray-600">Next TÜV/Inspection</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">20.08.2025</p>
                </div>

                <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-200/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-600">Last TÜV/Inspection</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">20.08.2025</p>
                </div>
              </div>
            </div>

            {/* Box 3: Quick Actions */}
            <div className={`backdrop-blur-xl rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_20px_60px_rgb(0,0,0,0.12)] transition-all duration-300 overflow-hidden ${
              isDarkMode 
                ? 'bg-neutral-900/80' 
                : 'bg-white/80'
            }`}>
              <div className="bg-gradient-to-br from-blue-50/80 to-indigo-50/80 backdrop-blur-lg rounded-3xl p-5 border border-blue-200/50">
                <h4 className="text-xs font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  Quick Actions
                </h4>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Log Oil Change */}
                  <button className="flex items-center gap-2 px-3 py-2.5 bg-white/80 hover:bg-white rounded-xl border border-gray-200/50 hover:border-blue-300 hover:shadow-md transition-all duration-200 group">
                    <Droplet className="w-3.5 h-3.5 text-amber-600 group-hover:text-amber-700" />
                    <span className="text-[10px] font-medium text-gray-700 group-hover:text-gray-900">Log Oil Change</span>
                  </button>

                  {/* Log Service */}
                  <button className="flex items-center gap-2 px-3 py-2.5 bg-white/80 hover:bg-white rounded-xl border border-gray-200/50 hover:border-blue-300 hover:shadow-md transition-all duration-200 group">
                    <Wrench className="w-3.5 h-3.5 text-blue-600 group-hover:text-blue-700" />
                    <span className="text-[10px] font-medium text-gray-700 group-hover:text-gray-900">Log Service</span>
                  </button>

                  {/* Log Inspection */}
                  <button className="flex items-center gap-2 px-3 py-2.5 bg-white/80 hover:bg-white rounded-xl border border-gray-200/50 hover:border-blue-300 hover:shadow-md transition-all duration-200 group">
                    <FileText className="w-3.5 h-3.5 text-purple-600 group-hover:text-purple-700" />
                    <span className="text-[10px] font-medium text-gray-700 group-hover:text-gray-900">Log Inspection</span>
                  </button>

                  {/* Log Brake Change */}
                  <button className="flex items-center gap-2 px-3 py-2.5 bg-white/80 hover:bg-white rounded-xl border border-gray-200/50 hover:border-blue-300 hover:shadow-md transition-all duration-200 group">
                    <Disc className="w-3.5 h-3.5 text-red-600 group-hover:text-red-700" />
                    <span className="text-[10px] font-medium text-gray-700 group-hover:text-gray-900">Log Brake</span>
                  </button>

                  {/* Log Tire Change */}
                  <button className="flex items-center gap-2 px-3 py-2.5 bg-white/80 hover:bg-white rounded-xl border border-gray-200/50 hover:border-blue-300 hover:shadow-md transition-all duration-200 group">
                    <Circle className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-900" />
                    <span className="text-[10px] font-medium text-gray-700 group-hover:text-gray-900">Log Tire</span>
                  </button>

                  {/* Log Damage */}
                  <button className="flex items-center gap-2 px-3 py-2.5 bg-white/80 hover:bg-white rounded-xl border border-gray-200/50 hover:border-blue-300 hover:shadow-md transition-all duration-200 group">
                    <Camera className="w-3.5 h-3.5 text-orange-600 group-hover:text-orange-700" />
                    <span className="text-[10px] font-medium text-gray-700 group-hover:text-gray-900">Log Damage</span>
                  </button>

                  {/* Log Repair */}
                  <button className="flex items-center gap-2 px-3 py-2.5 bg-white/80 hover:bg-white rounded-xl border border-gray-200/50 hover:border-blue-300 hover:shadow-md transition-all duration-200 group">
                    <Settings className="w-3.5 h-3.5 text-green-600 group-hover:text-green-700" />
                    <span className="text-[10px] font-medium text-gray-700 group-hover:text-gray-900">Log Repair</span>
                  </button>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* Bottom Section - Three Equal Boxes */}
        <div className="grid grid-cols-2 gap-6">
          {/* Booking List */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_20px_60px_rgb(0,0,0,0.12)] transition-all duration-300">
            <div className="flex items-center gap-2 mb-6">
              <Calendar className="w-5 h-5 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-900">Rental Bookings</h3>
              <span className="ml-auto px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">5 Total</span>
            </div>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {/* Active Booking 1 */}
              <div className="bg-gradient-to-br from-blue-50/80 to-blue-100/60 rounded-2xl p-4 border border-blue-200/50">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900 mb-1">Max Mustermann</p>
                    <p className="text-xs text-gray-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Feb 20 - Feb 23, 2026
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold border border-green-200">Active</span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    Berlin
                  </span>
                  <span>3 days</span>
                  <span className="font-semibold text-gray-900">€180.00</span>
                </div>
                <div className="mt-2 pt-2 border-t border-blue-200/50">
                  <p className="text-xs text-gray-600">📧 max.mustermann@email.com</p>
                  <p className="text-xs text-gray-600">📱 +49 176 1234 5678</p>
                </div>
              </div>
              
              {/* Upcoming Booking 1 */}
              <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-200/50">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900 mb-1">Anna Schmidt</p>
                    <p className="text-xs text-gray-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Feb 25 - Feb 28, 2026
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold border border-amber-200">Upcoming</span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    München
                  </span>
                  <span>3 days</span>
                  <span className="font-semibold text-gray-900">€180.00</span>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-200/50">
                  <p className="text-xs text-gray-600">📧 anna.schmidt@email.com</p>
                  <p className="text-xs text-gray-600">📱 +49 151 9876 5432</p>
                </div>
              </div>

              {/* Upcoming Booking 2 */}
              <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-200/50">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900 mb-1">Thomas Weber</p>
                    <p className="text-xs text-gray-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Mar 1 - Mar 5, 2026
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold border border-amber-200">Upcoming</span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    Hamburg
                  </span>
                  <span>4 days</span>
                  <span className="font-semibold text-gray-900">€240.00</span>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-200/50">
                  <p className="text-xs text-gray-600">📧 t.weber@company.de</p>
                  <p className="text-xs text-gray-600">📱 +49 162 3456 7890</p>
                </div>
              </div>

              {/* Upcoming Booking 3 */}
              <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-200/50">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900 mb-1">Sarah Müller</p>
                    <p className="text-xs text-gray-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Mar 8 - Mar 10, 2026
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold border border-amber-200">Upcoming</span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    Frankfurt
                  </span>
                  <span>2 days</span>
                  <span className="font-semibold text-gray-900">€120.00</span>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-200/50">
                  <p className="text-xs text-gray-600">📧 sarah.mueller@web.de</p>
                  <p className="text-xs text-gray-600">📱 +49 173 2468 1357</p>
                </div>
              </div>

              {/* Completed Booking */}
              <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-300/50 opacity-75">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-gray-700 mb-1">Michael Becker</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Feb 15 - Feb 18, 2026
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-gray-200 text-gray-600 rounded-lg text-xs font-semibold border border-gray-300">Completed</span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    Köln
                  </span>
                  <span>3 days</span>
                  <span className="font-semibold text-gray-700">€180.00</span>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-300/50">
                  <p className="text-xs text-gray-500">📧 m.becker@mail.com</p>
                  <p className="text-xs text-gray-500">✅ Returned & Inspected</p>
                </div>
              </div>
            </div>
          </div>

          {/* Task List */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_20px_60px_rgb(0,0,0,0.12)] transition-all duration-300">
            <div className="flex items-center gap-2 mb-6">
              <ClipboardList className="w-5 h-5 text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-900">Task List</h3>
              <span className="ml-auto px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">3 Open</span>
            </div>
            
            {/* Tabs */}
            <div className="flex gap-2 mb-4 bg-gray-100/80 rounded-xl p-1">
              <button className="flex-1 px-4 py-2 bg-white rounded-lg text-sm font-semibold text-gray-900 shadow-sm">
                Open
              </button>
              <button className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Done
              </button>
            </div>
            
            {/* Task Items */}
            <div className="space-y-4">
              {/* Task 1 */}
              <div className="bg-gradient-to-br from-red-50/80 to-red-100/60 rounded-2xl p-4 border border-red-200/50">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-sm font-bold text-gray-900">Check brake fluid level</p>
                  <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-semibold border border-red-200">High Priority</span>
                </div>
                <p className="text-xs text-gray-700 mb-3">Brake fluid needs to be checked and topped up if necessary. Vehicle shows warning light.</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500 font-medium">Created:</span>
                    <span className="ml-1 text-gray-900 font-semibold">Feb 18, 2026</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Due:</span>
                    <span className="ml-1 text-red-700 font-bold">Feb 22, 2026</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Creator:</span>
                    <span className="ml-1 text-gray-900 font-semibold">System</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Assigned:</span>
                    <span className="ml-1 text-gray-900 font-semibold">Workshop Team</span>
                  </div>
                </div>
              </div>

              {/* Task 2 */}
              <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-200/50">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-sm font-bold text-gray-900">Clean interior after rental</p>
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold border border-blue-200">Normal</span>
                </div>
                <p className="text-xs text-gray-700 mb-3">Full interior cleaning required after customer return. Focus on back seats and trunk area.</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500 font-medium">Created:</span>
                    <span className="ml-1 text-gray-900 font-semibold">Feb 19, 2026</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Due:</span>
                    <span className="ml-1 text-gray-900 font-semibold">Feb 25, 2026</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Creator:</span>
                    <span className="ml-1 text-gray-900 font-semibold">Max Mustermann</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Assigned:</span>
                    <span className="ml-1 text-gray-900 font-semibold">Cleaning Service</span>
                  </div>
                </div>
              </div>

              {/* Task 3 */}
              <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-200/50">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-sm font-bold text-gray-900">Update vehicle documentation</p>
                  <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold border border-green-200">Low Priority</span>
                </div>
                <p className="text-xs text-gray-700 mb-3">Service records and inspection certificates need to be updated in the system.</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500 font-medium">Created:</span>
                    <span className="ml-1 text-gray-900 font-semibold">Feb 15, 2026</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Due:</span>
                    <span className="ml-1 text-gray-900 font-semibold">Mar 1, 2026</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Creator:</span>
                    <span className="ml-1 text-gray-900 font-semibold">Anna Schmidt</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Assigned:</span>
                    <span className="ml-1 text-gray-900 font-semibold">Fleet Manager</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
          </>
        )}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Always visible */}
      <RightSidebar 
        isDarkMode={isDarkMode} 
        highlightedVehicle={hoveredVehicle}
        onTaskClick={(taskId) => {
          setCurrentView('tasks');
          setTasksSectionTab('tasks');
          setHighlightedTaskId(taskId);
        }}
        onVehicleAlertClick={(vehicleId) => {
          const vehicle = fleetVehicles.find(v => v.id === vehicleId);
          if (vehicle) {
            setSelectedVehicle(vehicle);
            setCurrentView('health-errors');
          }
        }}
        onSchedulePickupReturnClick={() => {
          setCurrentView('bookings');
        }}
        onScheduleMaintenanceClick={(vehicleId) => {
          const vehicle = fleetVehicles.find(v => v.id === vehicleId);
          if (vehicle) {
            setSelectedVehicle(vehicle);
            setCurrentView('health-errors');
          }
        }}
      />
      
      {/* New Task Modal */}
      <NewTaskModal 
        isOpen={isNewTaskModalOpen} 
        onClose={() => setIsNewTaskModalOpen(false)} 
        isDarkMode={isDarkMode}
      />

      {/* Cleaning Status Warning Modal */}
      {showCleaningWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className={`max-w-md w-full mx-4 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-neutral-900/95 border-neutral-700/50' 
              : 'bg-white/95 border-gray-200/50'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
              <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Cleaning Task Required
              </h3>
            </div>
            <p className={`mb-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Setting the vehicle status to "Needs Cleaning" will automatically create a cleaning task. The vehicle will be marked as unavailable until the cleaning is completed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCleaningWarning(false)}
                className={`flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                  isDarkMode
                    ? 'bg-neutral-800 text-gray-300 hover:bg-neutral-700 border border-neutral-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmCleaningChange}
                className="flex-1 px-4 py-2.5 bg-yellow-600 text-white rounded-xl font-semibold hover:bg-yellow-700 transition-all duration-200 shadow-lg"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Status Warning Modal */}
      {showStatusWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className={`max-w-md w-full mx-4 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-neutral-900/95 border-neutral-700/50' 
              : 'bg-white/95 border-gray-200/50'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                pendingStatus === 'Manual Block' ? 'bg-red-100' : 'bg-orange-100'
              }`}>
                {pendingStatus === 'Manual Block' ? (
                  <XCircle className="w-6 h-6 text-red-600" />
                ) : (
                  <Wrench className="w-6 h-6 text-orange-600" />
                )}
              </div>
              <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Change Vehicle Status
              </h3>
            </div>
            <p className={`mb-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {pendingStatus === 'Manual Block' 
                ? 'You are about to manually block this vehicle. It will no longer be available for bookings until you change the status back to "Available".'
                : 'You are about to set this vehicle to maintenance mode. It will be unavailable for bookings and a maintenance task may be required.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowStatusWarning(false);
                  setPendingStatus(null);
                }}
                className={`flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                  isDarkMode
                    ? 'bg-neutral-800 text-gray-300 hover:bg-neutral-700 border border-neutral-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmStatusChange}
                className={`flex-1 px-4 py-2.5 text-white rounded-xl font-semibold transition-all duration-200 shadow-lg ${
                  pendingStatus === 'Manual Block'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-orange-600 hover:bg-orange-700'
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className={`max-w-md w-full mx-4 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-neutral-900/95 border-neutral-700/50' 
              : 'bg-white/95 border-gray-200/50'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Relocate Vehicle
              </h3>
            </div>
            <p className={`mb-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Are you sure you want to relocate this vehicle from <span className="font-semibold">{currentStation}</span> to <span className="font-semibold">{pendingStation}</span>? This action will update the vehicle's location in the system.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowStationWarning(false);
                  setPendingStation(null);
                }}
                className={`flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                  isDarkMode
                    ? 'bg-neutral-800 text-gray-300 hover:bg-neutral-700 border border-neutral-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmStationChange}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all duration-200 shadow-lg"
              >
                Confirm Relocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </LanguageProvider>
  );
}
