import { Circle, MapPin, Gauge, Droplet, Thermometer, Battery, Gauge as Odometer, Calendar, ClipboardList, Sparkles, Wrench, FileText, AlertTriangle, Disc, Camera, Settings, Home, CheckCircle, Heart, XCircle, ChevronDown, User, X, ArrowLeft, Maximize2, Minimize2, MessageSquare, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  api,
  type TireHealthSummaryResponse,
  type BrakeStatus,
  type BatteryHealthSummary,
  type ServiceInfoStatus,
} from '../lib/api';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { NewTaskModal } from './components/NewTaskModal';
import { TripsView } from './components/TripsView';
import { DashboardView } from './components/DashboardView';
import { BookingsView } from './components/BookingsView';
import { RentalDrivingAnalysisView } from './components/RentalDrivingAnalysisView';
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
import { FleetConditionDetailView } from './components/FleetConditionDetailView';
import type { ConditionCategory } from './components/FleetConditionView';
import { FinanceView } from './components/FinanceView';
import type { FinanceTab } from './components/FinanceView';
import { TasksSectionView } from './components/TasksSectionView';
import type { TasksSectionTab } from './components/TasksSectionView';
import { VendorDetailView } from './components/VendorDetailView';
import { CustomerDetailView } from './components/CustomerDetailView';
import { VehicleBookingsView } from './components/VehicleBookingsView';
import { VehicleTasksView } from './components/VehicleTasksView';
import { BrandLogo, getBrandFromModel } from './components/BrandLogo';
import { VehicleData } from './data/vehicles';
import { VehicleTariff, buildTariffs } from './data/tariffs';
import { RentalProvider, useRentalOrg } from './RentalContext';
import { FleetProvider, useFleetVehicles } from './FleetContext';
import { Toaster } from 'sonner';
import { LiveMapOverview } from './components/LiveMapOverview';
import { useLiveVehicleTelemetry } from './hooks/useLiveVehicleTelemetry';
import { RightSidebar } from './components/RightSidebar';
import { LanguageProvider } from './i18n/LanguageContext';
import { DocumentUploadView } from './components/DocumentUploadView';
import { AIAssistantView } from './components/AIAssistantView';
import { SupportView } from './components/SupportView';
import { HelpCenterView } from './components/HelpCenterView';
import { WorkflowAutomationView } from './components/WorkflowAutomationView';
import { WhatsAppBusinessView } from './components/WhatsAppBusinessView';
import { PartsAccessoriesView } from './components/PartsAccessoriesView';
import { InsurancesView } from './components/InsurancesView';
import { ServiceMaintenanceView } from './components/ServiceMaintenanceView';
import { VoiceAssistantView } from './components/VoiceAssistantView';

/* ────────────────────────────────────────────────────────────────────────
   Vehicle Health Box – Figma-aligned, API-wired
   ──────────────────────────────────────────────────────────────────────── */
interface VehicleHealthBoxWiredProps {
  selectedVehicle: VehicleData | null;
  isDarkMode: boolean;
  lvBatteryVoltage: number | null;
  onViewDetails?: () => void;
}

function VehicleHealthBoxWired({ selectedVehicle, isDarkMode, lvBatteryVoltage, onViewDetails }: VehicleHealthBoxWiredProps) {
  const [tires, setTires] = useState<TireHealthSummaryResponse | null>(null);
  const [brakes, setBrakes] = useState<BrakeStatus | null>(null);
  const [battery, setBattery] = useState<BatteryHealthSummary | null>(null);
  const [service, setService] = useState<ServiceInfoStatus | null>(null);
  const [dtcCount, setDtcCount] = useState(0);

  const vehicleId = selectedVehicle?.id ?? null;

  useEffect(() => {
    if (!vehicleId) { setTires(null); setBrakes(null); setBattery(null); setService(null); setDtcCount(0); return; }
    let cancelled = false;
    (async () => {
      const [t, b, bat, svc, dtc] = await Promise.all([
        api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.brakeStatus(vehicleId).catch(() => null),
        api.vehicleIntelligence.batteryHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.serviceInfoStatus(vehicleId).catch(() => null),
        api.vehicleIntelligence.dtcActive(vehicleId).catch(() => []),
      ]);
      if (cancelled) return;
      setTires(t); setBrakes(b); setBattery(bat); setService(svc);
      setDtcCount(Array.isArray(dtc) ? dtc.length : 0);
    })();
    return () => { cancelled = true; };
  }, [vehicleId]);

  const dm = isDarkMode;

  const brakesVal = brakes?.padWearPercent ?? selectedVehicle?.brakes ?? 0;
  const tiresVal = tires?.overallPercent ?? selectedVehicle?.tires ?? 0;
  const batteryPubState = battery?.currentState?.publicationState ?? 'INITIAL_CALIBRATION';
  const soh = batteryPubState === 'INITIAL_CALIBRATION' ? null : (battery?.currentState?.publishedSohPct ?? battery?.currentState?.sohPercent ?? null);
  const voltage = battery?.currentState?.voltageV ?? lvBatteryVoltage;
  const batteryVal = soh ?? (voltage != null ? Math.min(100, Math.max(0, Math.round((voltage - 11.5) / (12.8 - 11.5) * 100))) : 0);

  const brakesTracked = brakes?.padWearPercent != null || (selectedVehicle?.brakes != null && selectedVehicle.brakes > 0);
  const tiresTracked = tires?.overallPercent != null || (selectedVehicle?.tires != null && selectedVehicle.tires > 0);
  const batteryTracked = soh != null || voltage != null;
  const trackedFlags = [brakesTracked, tiresTracked, batteryTracked];
  const trackedValues = [brakesVal, tiresVal, batteryVal].filter((_, i) => trackedFlags[i]);
  const untrackedCount = 3 - trackedValues.length;

  const healthScore = trackedValues.length > 0
    ? Math.round(trackedValues.reduce((a, b) => a + b, 0) / trackedValues.length)
    : -1;
  const criticalCount = trackedValues.filter(v => v < 30).length;
  const dueSoonCount = trackedValues.filter(v => v >= 30 && v < 60).length;

  const getStatus = (v: number, tracked: boolean) => {
    if (!tracked) return { label: 'No Data', labelColor: dm ? 'text-gray-500' : 'text-gray-400', bar: dm ? 'bg-neutral-700' : 'bg-gray-200' };
    if (v >= 80) return { label: 'Excellent', labelColor: 'text-green-600', bar: 'bg-green-500' };
    if (v >= 60) return { label: 'Monitor', labelColor: 'text-yellow-600', bar: 'bg-yellow-500' };
    if (v >= 30) return { label: 'Due soon', labelColor: 'text-orange-500', bar: 'bg-orange-500' };
    return { label: 'Critical', labelColor: 'text-red-600', bar: 'bg-red-500' };
  };

  const brakesDetail = (() => {
    const remKm = brakes?.kmSinceService != null ? Math.max(0, 60000 - brakes.kmSinceService) : null;
    if (remKm != null) return `~${Math.round(remKm / 1000)}k km`;
    if (brakesVal >= 80) return '~12,000 km';
    if (brakesVal >= 60) return 'Check soon';
    return brakesVal > 0 ? 'Service needed' : 'No tracking';
  })();

  const tiresDetail = (() => {
    const remKm = tires?.overallRemainingKm;
    if (remKm != null) return `~${Math.round(remKm / 1000)}k km`;
    if (tiresVal >= 80) return '~15,000 km';
    if (tiresVal >= 60) return '~9,000 km';
    return tiresVal > 0 ? 'Replace soon' : 'No tracking';
  })();

  const batteryDetail = (() => {
    if (batteryPubState === 'INITIAL_CALIBRATION') return 'Calibrating';
    if (batteryPubState === 'STABILIZING') return voltage != null ? `~${voltage.toFixed(1)}V · Stabilizing` : 'Stabilizing';
    if (soh != null) return voltage != null ? `${voltage.toFixed(1)}V` : 'SOH tracked';
    if (voltage != null) return `${voltage.toFixed(1)}V`;
    return 'No tracking';
  })();

  const healthItems = [
    {
      key: 'brakes', label: 'Brakes', value: brakesVal, detail: brakesDetail, tracked: brakesTracked,
      iconBg: dm ? 'bg-green-900/30' : 'bg-green-50',
      icon: <Disc className="w-4 h-4 text-green-600" />,
    },
    {
      key: 'tires', label: 'Tires', value: tiresVal, detail: tiresDetail, tracked: tiresTracked,
      iconBg: dm ? 'bg-neutral-700' : 'bg-gray-100',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dm ? '#9ca3af' : '#6b7280'} strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="9" /><line x1="12" y1="15" x2="12" y2="22" />
          <line x1="2" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="22" y2="12" />
        </svg>
      ),
    },
    {
      key: 'battery', label: 'Battery', value: batteryVal, detail: batteryDetail, tracked: batteryTracked,
      iconBg: dm ? 'bg-green-900/30' : 'bg-green-50',
      icon: <Battery className="w-4 h-4 text-green-600" />,
    },
  ];

  const svcRemWeeks = service?.serviceRemainingMonths != null ? Math.round(service.serviceRemainingMonths * 4.33) : null;
  const svcRemKm = service?.serviceRemainingKm;
  const tuvDate = service?.tuvValidTill ? new Date(service.tuvValidTill).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

  const divider = <div className={`border-t my-3 ${dm ? 'border-neutral-700/80' : 'border-gray-100'}`} />;

  return (
    <div className="rounded-xl p-3 border border-border bg-card shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
      <style>{`
        @keyframes barFillUp { from { width: 0%; } }
        @keyframes statusPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes ecgRun { from { transform: translateX(0px); } to { transform: translateX(-36px); } }
        @keyframes calibDots { 0%,20%{opacity:.2} 50%{opacity:1} 100%{opacity:.2} }
      `}</style>

      {/* Header: Title + Heart ECG */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-col items-start gap-1">
          <h3 className={`font-bold text-base leading-tight ${dm ? 'text-white' : 'text-gray-900'}`}>Vehicle Health</h3>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
            healthScore < 0
              ? dm ? 'bg-neutral-500/15 border-neutral-500/30 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'
              : healthScore >= 80
              ? dm ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'bg-green-50 border-green-200 text-green-700'
              : healthScore >= 60
              ? dm ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'
              : dm ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              healthScore < 0 ? (dm ? 'bg-gray-500' : 'bg-gray-400') : healthScore >= 80 ? 'bg-green-500' : healthScore >= 60 ? 'bg-amber-500' : 'bg-red-500'
            }`} style={{ animation: 'statusPulse 2s ease-in-out infinite' }} />
            {healthScore < 0 ? 'Insufficient Data' : healthScore >= 80 ? 'Good Health' : healthScore >= 60 ? 'Fair Health' : 'Poor Health'}
          </span>
        </div>
        <div className="relative flex-shrink-0 w-[62px] h-[62px]">
          <svg width="62" height="62" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <clipPath id="heartClipVHB">
                <path d="M36,21 C36,14 26,9 19,17 C12,25 12,33 19,40 L36,57 L53,40 C60,33 60,25 53,17 C46,9 36,14 36,21Z"/>
              </clipPath>
            </defs>
            <path
              d="M36,21 C36,14 26,9 19,17 C12,25 12,33 19,40 L36,57 L53,40 C60,33 60,25 53,17 C46,9 36,14 36,21Z"
              fill={healthScore < 0 ? '#9ca3af' : healthScore >= 80 ? '#22c55e' : healthScore >= 60 ? '#f59e0b' : '#ef4444'} fillOpacity="0.15"
              stroke={healthScore < 0 ? '#9ca3af' : healthScore >= 80 ? '#22c55e' : healthScore >= 60 ? '#f59e0b' : '#ef4444'} strokeWidth="2.5" strokeLinejoin="round"
            />
            <g clipPath="url(#heartClipVHB)">
              <g style={{ animation: 'ecgRun 1.6s linear infinite' }}>
                <polyline
                  points="-36,38 -24,38 -21,22 -18,54 -15,38 0,38 12,38 15,22 18,54 21,38 36,38 48,38 51,22 54,54 57,38 72,38 84,38 87,22 90,54 93,38 108,38"
                  fill="none" stroke={healthScore < 0 ? '#9ca3af' : healthScore >= 80 ? '#22c55e' : healthScore >= 60 ? '#f59e0b' : '#ef4444'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                />
              </g>
            </g>
          </svg>
        </div>
      </div>

      {/* Status Bar */}
      <div className={`flex items-center rounded-xl border mb-2 ${dm ? 'border-neutral-700 bg-neutral-800/60' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 flex-1 justify-center">
          <CheckCircle className={`w-3.5 h-3.5 flex-shrink-0 ${criticalCount === 0 ? 'text-green-500' : 'text-red-500'}`} />
          <span className={`text-[11px] font-medium ${dm ? 'text-gray-300' : 'text-gray-700'}`}>{criticalCount} Critical</span>
        </div>
        <div className={`w-px h-4 ${dm ? 'bg-neutral-600' : 'bg-gray-200'}`} />
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 flex-1 justify-center">
          <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${dueSoonCount > 0 ? 'text-amber-500' : dm ? 'text-gray-500' : 'text-gray-400'}`} />
          <span className={`text-[11px] font-medium ${dueSoonCount > 0 ? 'text-amber-600' : dm ? 'text-gray-500' : 'text-gray-500'}`}>{dueSoonCount} Due Soon</span>
        </div>
        <div className={`w-px h-4 ${dm ? 'bg-neutral-600' : 'bg-gray-200'}`} />
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 flex-1 justify-center">
          <AlertCircle className={`w-3.5 h-3.5 flex-shrink-0 ${dtcCount > 0 ? 'text-red-500' : dm ? 'text-gray-500' : 'text-gray-400'}`} />
          <span className={`text-[11px] font-medium ${dtcCount > 0 ? (dm ? 'text-red-400' : 'text-red-600') : dm ? 'text-gray-400' : 'text-gray-600'}`}>{dtcCount} Faults</span>
        </div>
      </div>
      {untrackedCount > 0 && (
        <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mb-1 border ${dm ? 'bg-blue-500/5 border-blue-500/20' : 'bg-blue-50/60 border-blue-100'}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={dm ? 'text-blue-400' : 'text-blue-500'}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span className={`text-[10px] leading-snug ${dm ? 'text-blue-300/80' : 'text-blue-600'}`}>
            {untrackedCount} of 3 health dimensions have no data yet. Enable tracking to get more accurate results.
          </span>
        </div>
      )}
      <p className={`text-[10px] mb-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
        Diagnostics · Wear trends · Service status
      </p>

      {divider}

      {/* Health Items */}
      <div className="space-y-3">
        {healthItems.map((item, idx) => {
          const isCalibrating = item.key === 'battery' && batteryPubState === 'INITIAL_CALIBRATION';
          const isStabilizing = item.key === 'battery' && batteryPubState === 'STABILIZING';
          const isUntracked = !item.tracked && !isCalibrating && !isStabilizing;
          const st = getStatus(item.value, item.tracked);
          const showBadge = !isCalibrating && !isStabilizing && !isUntracked && item.value < 60;
          return (
            <div key={item.key} className={`flex gap-2.5 items-center ${isUntracked ? 'opacity-60' : ''}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-xs font-semibold flex-1 ${dm ? 'text-gray-100' : 'text-gray-800'}`}>{item.label}</span>
                  {isCalibrating && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${dm ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-600'}`}>
                      Calibrating
                      <span className="inline-flex ml-0.5">
                        {[0, 1, 2].map(i => <span key={i} className="inline-block w-1 h-1 rounded-full mx-px" style={{ backgroundColor: 'currentColor', animation: `calibDots 1.4s infinite ${i * 0.2}s` }} />)}
                      </span>
                    </span>
                  )}
                  {isStabilizing && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${dm ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>Estimated</span>
                  )}
                  {isUntracked && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${dm ? 'bg-neutral-700 border-neutral-600 text-gray-400' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>No Data</span>
                  )}
                  {showBadge && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${
                      item.value < 30 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}>{st.label}</span>
                  )}
                  {isCalibrating ? (
                    <span className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-400'}`}>—</span>
                  ) : isUntracked ? (
                    <span className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-400'}`}>—</span>
                  ) : (
                    <span className={`text-xs font-bold ${isStabilizing ? (dm ? 'text-gray-300' : 'text-gray-600') : dm ? 'text-white' : 'text-gray-900'}`}>{item.value > 0 ? `${isStabilizing ? '~' : ''}${Math.round(item.value)}%` : '—'}</span>
                  )}
                </div>
                {isCalibrating ? (
                  <div className={`w-full rounded-full h-1.5 overflow-hidden ${dm ? 'bg-neutral-800' : 'bg-gray-100'}`}>
                    <div className={`h-1.5 rounded-full ${dm ? 'bg-blue-500/30' : 'bg-blue-200'}`} style={{ width: '30%', animation: `barFillUp 2s ease-in-out infinite alternate` }} />
                  </div>
                ) : isUntracked ? (
                  <div className={`w-full rounded-full h-1.5 ${dm ? 'bg-neutral-800' : 'bg-gray-100'}`}>
                    <div className={`h-1.5 rounded-full ${dm ? 'bg-neutral-700' : 'bg-gray-200'}`} style={{ width: '100%' }} />
                  </div>
                ) : (
                  <div className={`w-full rounded-full h-1.5 ${dm ? 'bg-neutral-800' : 'bg-gray-100'}`}>
                    <div className={`h-1.5 rounded-full ${isStabilizing ? (dm ? 'bg-amber-500/60' : 'bg-amber-400') : st.bar}`}
                      style={{ width: `${Math.min(item.value, 100)}%`, animation: `barFillUp 0.8s cubic-bezier(0.25,0.46,0.45,0.94) ${idx * 0.15}s both` }}
                    />
                  </div>
                )}
                <div className="flex items-baseline gap-1 mt-0.5">
                  {isCalibrating ? (
                    <span className={`text-[10px] ${dm ? 'text-blue-400/70' : 'text-blue-500'}`}>Initial calibration in progress</span>
                  ) : isStabilizing ? (
                    <>
                      <span className={`text-[10px] font-semibold ${dm ? 'text-amber-400/80' : 'text-amber-600'}`}>Estimated SOH</span>
                      <span className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>· {item.detail}</span>
                    </>
                  ) : isUntracked ? (
                    <span className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Enable tracking for accurate health data</span>
                  ) : (
                    <>
                      <span className={`text-[10px] font-semibold ${st.labelColor}`}>{item.value > 0 ? st.label : ''}</span>
                      <span className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>· {item.detail}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {divider}

      {/* Service Info (integrated) */}
      <div className="grid grid-cols-2 gap-x-3">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Wrench className="w-3 h-3 text-blue-500 flex-shrink-0" />
            <span className={`text-[11px] font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>Maintenance</span>
          </div>
          <div className="flex items-start gap-1">
            <Calendar className="w-3 h-3 text-violet-400 mt-px flex-shrink-0" />
            <span className={`text-[10px] leading-snug ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
              {svcRemWeeks != null ? (
                <>Next: <span className={`font-semibold ${dm ? 'text-gray-200' : 'text-gray-700'}`}>in {svcRemWeeks} weeks</span>{svcRemKm != null && <><br />{svcRemKm.toLocaleString('de-DE')} km</>}</>
              ) : service?.lastServiceDate ? (
                <>Last: <span className={`font-semibold ${dm ? 'text-gray-200' : 'text-gray-700'}`}>{new Date(service.lastServiceDate).toLocaleDateString('de-DE')}</span></>
              ) : (
                <span className={dm ? 'text-gray-600' : 'text-gray-400'}>No tracking</span>
              )}
            </span>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Calendar className="w-3 h-3 text-blue-500 flex-shrink-0" />
            <span className={`text-[11px] font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>Inspection</span>
          </div>
          <div className="flex items-start gap-1">
            <Calendar className="w-3 h-3 text-violet-400 mt-px flex-shrink-0" />
            <span className={`text-[10px] leading-snug ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
              {tuvDate ? (
                <>TÜV: <span className={`font-semibold ${
                  (service?.tuvRemainingMonths ?? 99) <= 2 ? 'text-red-500' : (service?.tuvRemainingMonths ?? 99) <= 6 ? 'text-amber-500' : dm ? 'text-gray-200' : 'text-gray-700'
                }`}>{tuvDate}</span></>
              ) : (
                <span className={dm ? 'text-gray-600' : 'text-gray-400'}>No tracking</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {divider}

      {/* Footer CTAs */}
      <div className="flex items-center justify-between">
        <button
          onClick={onViewDetails}
          className="text-[12px] font-medium text-blue-500 hover:text-blue-600 transition-colors flex items-center gap-1 group"
        >
          View Health Details
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            className="group-hover:translate-x-0.5 transition-transform">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function RentalAppContent() {
  const { orgId } = useRentalOrg();
  const { fleetVehicles, loading: fleetLoading } = useFleetVehicles();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [cleaningStatus, setCleaningStatus] = useState<'Clean' | 'Needs Cleaning'>('Clean');
  const [vehicleStatus, setVehicleStatus] = useState<'Available' | 'Manual Block' | 'Maintenance'>('Available');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isCleaningDropdownOpen, setIsCleaningDropdownOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [autoOpenNewTask, setAutoOpenNewTask] = useState(false);
  const [currentView, setCurrentView] = useState<'overview' | 'trips' | 'dashboard' | 'bookings' | 'health-errors' | 'fleet' | 'damages' | 'documents' | 'customers' | 'customer-detail' | 'tasks' | 'vendor-management' | 'vendor-detail' | 'invoices' | 'fines' | 'price-tariffs' | 'analytics' | 'rental-driving-analysis' | 'settings' | 'new-booking' | 'stations' | 'vehicle-bookings' | 'vehicle-tasks' | 'document-upload' | 'ai-assistant' | 'support' | 'help-center' | 'fleet-condition' | 'fleet-condition-detail' | 'workflow-automation' | 'whatsapp-business' | 'parts-accessories' | 'insurances' | 'service-maintenance' | 'ai-voice-assistant'>('dashboard');
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [detailVendorId, setDetailVendorId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'account' | 'company' | 'fleet-connection' | 'users' | 'billing' | 'data-authorization'>('company');
  const [operationsTab, setOperationsTab] = useState<OperationsTab>('analytics');
  const [conditionDrillVehicleId, setConditionDrillVehicleId] = useState<string | null>(null);
  const [conditionDrillCategory, setConditionDrillCategory] = useState<ConditionCategory>('tires');
  const [financeTab, setFinanceTab] = useState<FinanceTab>('invoices');
  const [tasksSectionTab, setTasksSectionTab] = useState<TasksSectionTab>('tasks');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleData | null>(null);
  const liveTelemetry = useLiveVehicleTelemetry(
    currentView === 'overview' ? selectedVehicle?.id ?? null : null,
    orgId
  );
  const [activeBookingRef, setActiveBookingRef] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Tariff state (shared between PriceTariffsView and NewBookingView)
  const [tariffs, setTariffs] = useState<VehicleTariff[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    setTariffs(buildTariffs(fleetVehicles));
  }, [fleetVehicles]);

  useEffect(() => {
    if (!fleetLoading && fleetVehicles.length > 0 && !selectedVehicle) {
      setSelectedVehicle(fleetVehicles[0]);
    }
  }, [fleetLoading, fleetVehicles, selectedVehicle]);

  // Shared new customers (created in NewBookingView, shown in CustomersView)
  const [newlyCreatedCustomers, setNewlyCreatedCustomers] = useState<any[]>([]);

  // Shared new bookings (created in NewBookingView, shown in BookingsView)
  const [createdBookings, setCreatedBookings] = useState<any[]>([]);

  // Hovered vehicle for cross-component highlighting (StatInlineDetail <-> RightSidebar)
  const [hoveredVehicle, setHoveredVehicle] = useState<string | null>(null);

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
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
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
    <div 
      className="h-screen w-full flex overflow-hidden transition-colors duration-300 relative bg-background"
      style={{ fontFamily: "'Inter', 'Manrope', sans-serif" }}
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
        <div className="flex-1 overflow-auto px-4 sm:px-6 lg:px-8 pt-3 lg:pt-4 pb-6 text-foreground">
          <div className="max-w-[1400px] mx-auto text-[13px]">
            <TopBar isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} currentView={currentView} settingsTab={settingsTab} selectedVehicle={selectedVehicle} activeBookingRef={activeBookingRef} detailCustomerId={detailCustomer ? `CID-${detailCustomer.id.replace('c', '')}4821` : null} onViewChange={setCurrentView} onVehicleSelect={setSelectedVehicle} onSettingsTabChange={setSettingsTab} onFinanceTabChange={setFinanceTab} onTasksTabChange={setTasksSectionTab} />
        {/* Header Section - Only show for overview and trips views */}
        {currentView !== 'dashboard' && currentView !== 'bookings' && currentView !== 'fleet' && currentView !== 'customers' && currentView !== 'customer-detail' && currentView !== 'tasks' && currentView !== 'invoices' && currentView !== 'fines' && currentView !== 'price-tariffs' && currentView !== 'analytics' && currentView !== 'settings' && currentView !== 'new-booking' && currentView !== 'stations' && currentView !== 'fleet-condition' && currentView !== 'document-upload' && currentView !== 'ai-assistant' && currentView !== 'support' && currentView !== 'help-center' && currentView !== 'workflow-automation' && currentView !== 'whatsapp-business' && currentView !== 'parts-accessories' && currentView !== 'ai-voice-assistant' && (
        <div className="mb-2">
          <div className="flex flex-wrap items-center justify-between mb-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleBackToFleet}
                className={`p-1.5 rounded-lg border transition-all duration-200 hover:shadow-md ${
                  isDarkMode
                    ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-300 hover:bg-neutral-800'
                    : 'bg-white/60 border-gray-200/50 text-gray-600 hover:bg-white'
                }`}
                title="Back to Fleet"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center justify-center" style={{ width: 22, height: 22 }}>
                <BrandLogo 
                  brand={getBrandFromModel(selectedVehicle?.make || selectedVehicle?.model || '')} 
                  size={20} 
                  isDarkMode={isDarkMode} 
                />
              </div>
              <h1 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedVehicle ? `${selectedVehicle.make ?? ''} ${selectedVehicle.model} ${selectedVehicle.year}`.trim() : '—'}</h1>
              <div className="flex gap-1.5">
                <div className="relative">
                <button 
                  onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1 transition-all duration-200 hover:shadow-md cursor-pointer ${
                    vehicleStatus === 'Available'
                      ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                      : vehicleStatus === 'Manual Block'
                      ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                      : 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200'
                  }`}
                >
                  {vehicleStatus === 'Available' ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : vehicleStatus === 'Manual Block' ? (
                    <XCircle className="w-3 h-3" />
                  ) : (
                    <Wrench className="w-3 h-3" />
                  )}
                  {vehicleStatus}
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                </button>
                
                {isStatusDropdownOpen && (
                  <div className="absolute top-full mt-1.5 left-0 z-50 min-w-[160px] bg-popover text-popover-foreground rounded-lg border border-border shadow-lg overflow-hidden">
                    <button
                      onClick={() => handleVehicleStatusChange('Available')}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-green-50 transition-colors text-left border-b border-gray-100"
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-xs font-medium text-gray-700">Available</span>
                    </button>
                    <button
                      onClick={() => handleVehicleStatusChange('Manual Block')}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-red-50 transition-colors text-left border-b border-gray-100"
                    >
                      <XCircle className="w-3.5 h-3.5 text-red-600" />
                      <span className="text-xs font-medium text-gray-700">Manual Block</span>
                    </button>
                    <button
                      onClick={() => handleVehicleStatusChange('Maintenance')}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-orange-50 transition-colors text-left"
                    >
                      <Wrench className="w-3.5 h-3.5 text-orange-600" />
                      <span className="text-xs font-medium text-gray-700">Maintenance</span>
                    </button>
                  </div>
                )}
                </div>

                {/* Cleaning Status Dropdown */}
                <div className="relative">
                <button 
                  onClick={() => setIsCleaningDropdownOpen(!isCleaningDropdownOpen)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1 transition-all duration-200 hover:shadow-md cursor-pointer ${
                    cleaningStatus === 'Clean'
                      ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200'
                      : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  {cleaningStatus}
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                </button>

                {isCleaningDropdownOpen && (
                  <div className="absolute top-full mt-1.5 left-0 z-50 min-w-[160px] bg-popover text-popover-foreground rounded-lg border border-border shadow-lg overflow-hidden">
                    <button
                      onClick={() => handleCleaningStatusChange('Clean')}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-blue-50 transition-colors text-left border-b border-gray-100"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs font-medium text-gray-700">Clean</span>
                    </button>
                    <button
                      onClick={() => handleCleaningStatusChange('Needs Cleaning')}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-red-50 transition-colors text-left"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                      <span className="text-xs font-medium text-gray-700">Needs Cleaning</span>
                    </button>
                  </div>
                )}
                </div>

                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1 ${
                  selectedVehicle?.healthStatus === 'Critical'
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : selectedVehicle?.healthStatus === 'Warning'
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                }`}>
                  <Heart className="w-3 h-3" />
                  {selectedVehicle?.healthStatus || 'Good Health'}
                </span>
              </div>
            </div>
            {(() => {
              const connState = liveTelemetry.onlineStatus === 'ONLINE' ? 'online' : liveTelemetry.onlineStatus === 'STANDBY' ? 'standby' : 'offline';
              let timeAgo = '—';
              if (liveTelemetry.lastSignal) {
                const diff = Date.now() - new Date(liveTelemetry.lastSignal).getTime();
                if (!isNaN(diff) && diff >= 0) {
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
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Circle className={`w-2 h-2 ${dotColor}`} />
                    <span className={`text-xs font-bold ${labelColor}`}>{label}</span>
                  </div>
                  <div className={`w-px h-4 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`}></div>
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Last Signal</span>
                    <span className={`text-[10px] font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{timeAgo}</span>
                  </div>
                </div>
              );
            })()}
          </div>
          
          {/* Vehicle Details Section */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-card shadow-sm">
              <span className={`text-[10px] font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>License Plate</span>
              <span className={`text-xs font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{selectedVehicle?.license || '—'}</span>
            </div>
            
            <div className="relative">
              <button 
                onClick={() => setIsStationDropdownOpen(!isStationDropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-card shadow-sm transition-all duration-200 hover:bg-muted cursor-pointer">
                <span className={`text-[10px] font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Station</span>
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{currentStation}</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isStationDropdownOpen ? 'rotate-180' : ''} ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              </button>
              
              {isStationDropdownOpen && (
                <div className="absolute top-full mt-1.5 left-0 min-w-[200px] rounded-lg shadow-lg border border-border bg-popover z-50 overflow-hidden">
                  {availableStations.map((station) => (
                    <button
                      key={station}
                      onClick={() => handleStationChange(station)}
                      className={`w-full px-3 py-2 text-left text-xs font-medium transition-all duration-200 flex items-center gap-2 ${
                        station === currentStation
                          ? isDarkMode
                            ? 'bg-blue-600/20 text-blue-400'
                            : 'bg-blue-50 text-blue-600'
                          : isDarkMode
                            ? 'text-gray-300 hover:bg-neutral-800/60'
                            : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {station}
                      {station === currentStation && (
                        <CheckCircle className="w-3.5 h-3.5 ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border shadow-sm ${
              selectedVehicle?.isElectric
                ? 'border-emerald-500/25 bg-emerald-500/5'
                : 'border-amber-500/25 bg-amber-500/5'
            }`}>
              <span className={`text-[10px] font-medium ${selectedVehicle?.isElectric ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600') : (isDarkMode ? 'text-amber-400' : 'text-amber-600')}`}>{selectedVehicle?.isElectric ? 'Energy' : 'Fuel'}</span>
              <span className={`text-xs font-bold ${selectedVehicle?.isElectric ? (isDarkMode ? 'text-emerald-300' : 'text-emerald-900') : (isDarkMode ? 'text-amber-300' : 'text-amber-900')}`}>
                {selectedVehicle?.isElectric
                  ? (selectedVehicle.battery != null ? `${Math.round(selectedVehicle.battery)}%` : 'EV')
                  : (selectedVehicle?.fuelLevel != null ? `${Math.round(selectedVehicle.fuelLevel)}%` : selectedVehicle?.fuelType || 'Petrol')}
              </span>
            </div>
          </div>
        </div>
        )}

        {/* Tab Navigation - Only show for overview and trips views */}
        {currentView !== 'dashboard' && currentView !== 'bookings' && currentView !== 'fleet' && currentView !== 'customers' && currentView !== 'customer-detail' && currentView !== 'tasks' && currentView !== 'invoices' && currentView !== 'fines' && currentView !== 'price-tariffs' && currentView !== 'analytics' && currentView !== 'settings' && currentView !== 'new-booking' && currentView !== 'stations' && currentView !== 'fleet-condition' && currentView !== 'document-upload' && currentView !== 'ai-assistant' && currentView !== 'support' && currentView !== 'help-center' && currentView !== 'whatsapp-business' && currentView !== 'parts-accessories' && currentView !== 'ai-voice-assistant' && (
        <div className="mb-4">
          <div className="rounded-lg p-1 border border-border bg-muted flex gap-1 items-center w-full shadow-sm">
            <div className="flex flex-nowrap gap-1 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button 
                onClick={() => setCurrentView('overview')}
                className={`px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                currentView === 'overview'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              }`}>
                Overview
              </button>
              <button 
                onClick={() => setCurrentView('trips')}
                className={`px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                currentView === 'trips'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              }`}>
                Trips
              </button>
              <button 
                onClick={() => setCurrentView('health-errors')}
                className={`px-3 py-1 text-xs font-medium whitespace-nowrap rounded-md transition-all duration-200 ${
                currentView === 'health-errors'
                  ? 'bg-card text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              }`}>
                Health
              </button>
              <button 
                onClick={() => setCurrentView('damages')}
                className={`px-4 py-1.5 text-xs font-medium whitespace-nowrap rounded-lg transition-all duration-200 ${
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
                className={`px-3 py-1 text-xs font-medium whitespace-nowrap rounded-md transition-all duration-200 ${
                currentView === 'documents'
                  ? 'bg-card text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              }`}>
                Documents
              </button>
              <button 
                onClick={() => setCurrentView('vehicle-bookings')}
                className={`px-3 py-1 text-xs font-medium whitespace-nowrap rounded-md transition-all duration-200 ${
                currentView === 'vehicle-bookings'
                  ? 'bg-card text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              }`}>
                Bookings
              </button>
              <button 
                onClick={() => setCurrentView('vehicle-tasks')}
                className={`px-3 py-1 text-xs font-medium whitespace-nowrap rounded-md transition-all duration-200 ${
                currentView === 'vehicle-tasks'
                  ? 'bg-card text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              }`}>
                Task List
              </button>
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
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-200 mr-auto ${
                  isDarkMode 
                    ? 'bg-blue-900/30 border-blue-700/50' 
                    : 'bg-blue-50/80 border-blue-200/50'
                }`}>
                  <span className={`text-xs font-bold ${
                    isDarkMode ? 'text-blue-300' : 'text-blue-700'
                  }`}>
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
                  <div className="absolute top-full mt-2 right-0 z-50 rounded-lg border border-border bg-popover shadow-lg overflow-hidden p-2.5">
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
                  <div className="absolute top-full mt-2 right-0 z-50 min-w-[200px] rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                    {['all', ...tripDriverOptions].map((driver) => (
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
            vehicleId={selectedVehicle?.id}
            selectedDate={selectedDate || undefined}
            selectedDriver={selectedDriver}
            fuelType={selectedVehicle?.fuelType}
            onTripsLoaded={(trips) => {
              setTripsCount(trips.length);
              const names = [...new Set((trips as { driverName?: string }[]).map((t) => t.driverName).filter(Boolean))] as string[];
              setTripDriverOptions(names);
            }}
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
        ) : currentView === 'health-errors' ? (
          <HealthErrorsView isDarkMode={isDarkMode} vehicleId={selectedVehicle?.id} fuelType={selectedVehicle?.fuelType} />
        ) : currentView === 'rental-driving-analysis' ? (
          <RentalDrivingAnalysisView isDarkMode={isDarkMode} />
        ) : currentView === 'fleet' ? (
          <FleetView isDarkMode={isDarkMode} onVehicleSelect={handleVehicleSelect} />
        ) : currentView === 'damages' ? (
          <DamagesView isDarkMode={isDarkMode} vehicleId={selectedVehicle?.id} />
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
        ) : currentView === 'vendor-detail' && detailVendorId ? (
          <VendorDetailView
            isDarkMode={isDarkMode}
            vendorId={detailVendorId}
            onBack={() => { setCurrentView('vendor-management'); setDetailVendorId(null); }}
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
            onOpenVendorDetail={(vendor) => { setDetailVendorId(vendor.id); setCurrentView('vendor-detail'); }}
          />
        ) : currentView === 'fleet-condition-detail' && conditionDrillVehicleId ? (
          <FleetConditionDetailView
            isDarkMode={isDarkMode}
            vehicleId={conditionDrillVehicleId}
            category={conditionDrillCategory}
            onBack={() => setCurrentView('fleet-condition')}
          />
        ) : currentView === 'analytics' || currentView === 'fleet-condition' ? (
          <OperationsView
            isDarkMode={isDarkMode}
            activeTab={currentView as OperationsTab}
            onTabChange={(tab) => setCurrentView(tab)}
            tariffs={tariffs}
            onTariffsChange={setTariffs}
            onConditionDrillDown={(vehicleId, category) => {
              setConditionDrillVehicleId(vehicleId);
              setConditionDrillCategory(category);
              setCurrentView('fleet-condition-detail');
            }}
          />
        ) : currentView === 'document-upload' ? (
          <DocumentUploadView isDarkMode={isDarkMode} />
        ) : currentView === 'ai-assistant' ? (
          <AIAssistantView isDarkMode={isDarkMode} />
        ) : currentView === 'support' ? (
          <SupportView isDarkMode={isDarkMode} />
        ) : currentView === 'workflow-automation' ? (
          <WorkflowAutomationView isDarkMode={isDarkMode} />
        ) : currentView === 'whatsapp-business' ? (
          <WhatsAppBusinessView isDarkMode={isDarkMode} />
        ) : currentView === 'parts-accessories' ? (
          <PartsAccessoriesView isDarkMode={isDarkMode} />
        ) : currentView === 'insurances' ? (
          <InsurancesView isDarkMode={isDarkMode} onNavigateToVehicleDocuments={(vehicleId) => {
            const v = fleetVehicles.find((fv: any) => fv.id === vehicleId);
            if (v) { setSelectedVehicle(v); setCurrentView('documents'); }
          }} />
        ) : currentView === 'service-maintenance' ? (
          <ServiceMaintenanceView isDarkMode={isDarkMode} />
        ) : currentView === 'ai-voice-assistant' ? (
          <VoiceAssistantView isDarkMode={isDarkMode} />
        ) : currentView === 'help-center' ? (
          <HelpCenterView isDarkMode={isDarkMode} />
        ) : currentView === 'settings' ? (
          <SettingsView isDarkMode={isDarkMode} activeTab={settingsTab} onTabChange={setSettingsTab} />
        ) : currentView === 'new-booking' ? (
          <NewBookingView isDarkMode={isDarkMode} onBack={() => setCurrentView('bookings')} tariffs={tariffs} onCustomerCreated={(c) => setNewlyCreatedCustomers(prev => [c, ...prev])} onBookingCreated={(b) => { setCreatedBookings(prev => [b, ...prev]); }} />
        ) : (
          <>
        {/* Main Grid - Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {/* Left Column - Map and AI Summary */}
          <div className={"col-span-2 flex flex-col gap-3 transition-all duration-300"}>
            {/* Mapbox with Integrated Data Bar */}
            <div className="rounded-xl p-3 border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
              {/* Map Area */}
              <div className="group relative h-[340px] rounded-lg overflow-hidden transition-all duration-300">
                <LiveMapOverview
                  className="w-full h-full"
                  targetPosition={liveTelemetry.targetPosition}
                  initialPosition={selectedVehicle?.lat != null && selectedVehicle?.lng != null ? [selectedVehicle.lng, selectedVehicle.lat] : null}
                  heading={liveTelemetry.heading}
                  speedKmh={liveTelemetry.speedKmh}
                  licensePlate={selectedVehicle?.license ?? ''}
                  waitingForPosition={!!selectedVehicle && !!orgId && !liveTelemetry.targetPosition}
                  isLiveTracking={liveTelemetry.isLiveTracking}
                  isDarkMode={isDarkMode}
                />

                {/* Integrated Driving Data Bar - docked at bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-3 opacity-70 group-hover:opacity-100 transition-opacity duration-700 ease-in-out">
                  <div className={`rounded-lg p-2.5 border shadow-md backdrop-blur-md ${isDarkMode ? 'bg-card/90 border-border' : 'bg-card/95 border-border'}`}>
                    {(() => {
                      const dIgn = liveTelemetry.displayIgnition;
                      const ignIsOn = dIgn === 'ON';
                      const ignIsUnknown = dIgn === 'UNKNOWN';
                      const coolantVal = liveTelemetry.displayCoolant;
                      const coolantDisplay = coolantVal != null ? `${coolantVal}` : '—';
                      const stateLabel = liveTelemetry.displayState;
                      const stateColor = stateLabel === 'MOVING' ? (isDarkMode ? 'text-green-400' : 'text-green-700') : stateLabel === 'IDLE' ? (isDarkMode ? 'text-amber-400' : 'text-amber-600') : (isDarkMode ? 'text-gray-400' : 'text-gray-500');
                      return (
                    <div className={`grid gap-1.5 ${selectedVehicle?.isElectric ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3 md:grid-cols-6'}`}>
                      <div className={`flex flex-col items-center px-1 py-2 rounded-xl border ${ignIsOn ? (isDarkMode ? 'bg-green-900/30 border-green-800/40' : 'bg-green-100/80 border-green-200/60') : ignIsUnknown ? (isDarkMode ? 'bg-neutral-800/40 border-neutral-700/40' : 'bg-gray-100/80 border-gray-200/60') : (isDarkMode ? 'bg-red-900/30 border-red-800/40' : 'bg-red-100/80 border-red-200/60')}`}>
                        <Circle className={`w-3.5 h-3.5 mb-0.5 ${ignIsOn ? 'text-green-600 fill-green-600' : ignIsUnknown ? 'text-gray-400 fill-gray-400' : 'text-red-500 fill-red-500'}`} />
                        <span className={`text-[10px] mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ignition</span>
                        <span className={`text-sm font-bold ${ignIsOn ? (isDarkMode ? 'text-green-400' : 'text-green-700') : ignIsUnknown ? (isDarkMode ? 'text-gray-500' : 'text-gray-400') : (isDarkMode ? 'text-red-400' : 'text-red-600')}`}>{dIgn === 'UNKNOWN' ? '—' : dIgn}</span>
                      </div>

                      <div className="flex flex-col items-center px-1 py-2">
                        <Circle className="w-3.5 h-3.5 text-blue-500 mb-0.5" />
                        <span className={`text-[10px] mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>State</span>
                        <span className={`text-sm font-bold ${stateColor}`}>{stateLabel}</span>
                      </div>

                      <div className="flex flex-col items-center px-1 py-2">
                        <Droplet className={`w-3.5 h-3.5 mb-0.5 ${selectedVehicle?.isElectric ? 'text-emerald-500' : 'text-green-500'}`} />
                        <span className={`text-[10px] mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{selectedVehicle?.isElectric ? 'Energy' : 'Fuel'}</span>
                        <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{Math.round(liveTelemetry.snapshot?.fuel ?? selectedVehicle?.fuel ?? 0)}<span className="text-[10px] font-normal text-gray-500">%</span></span>
                      </div>

                      {!selectedVehicle?.isElectric && (
                      <div className="flex flex-col items-center px-1 py-2">
                        <Thermometer className="w-3.5 h-3.5 text-red-500 mb-0.5" />
                        <span className={`text-[10px] mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Coolant</span>
                        <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{coolantDisplay}{coolantDisplay !== '—' && <span className="text-[10px] font-normal text-gray-500">°C</span>}</span>
                      </div>
                      )}

                      {!selectedVehicle?.isElectric && (
                      <div className="flex flex-col items-center px-1 py-2">
                        <Battery className="w-3.5 h-3.5 text-amber-500 mb-0.5" />
                        <span className={`text-[10px] mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Battery</span>
                        <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{((liveTelemetry.snapshot?.lvBatteryVoltage ?? 0) > 0 ? liveTelemetry.snapshot!.lvBatteryVoltage.toFixed(1) : '—')}<span className="text-[10px] font-normal text-gray-500">V</span></span>
                      </div>
                      )}

                      <div className="flex flex-col items-center px-1 py-2">
                        <Odometer className="w-3.5 h-3.5 text-gray-500 mb-0.5" />
                        <span className={`text-[10px] mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Odometer</span>
                        <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedVehicle ? (liveTelemetry.snapshot?.odometer ?? selectedVehicle.odometer).toLocaleString('de-DE') : '—'} <span className="text-[10px] font-normal text-gray-500">km</span></span>
                      </div>
                    </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="rounded-xl p-4 border border-border bg-card shadow-sm transition-shadow hover:shadow-md dark:border-purple-500/20 dark:bg-card">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-semibold text-gray-900">AI Summary</h3>
                <span className="ml-auto px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">Last Updated: 2min ago</span>
              </div>
              
              {/* Overall Status */}
              <div className="rounded-lg p-3 mb-2 border border-border bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <p className="text-sm font-bold text-gray-900">Overall Status: Excellent</p>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">
                  Vehicle is operating in <span className="font-semibold text-green-600">optimal condition</span> with all systems functioning normally. No critical issues detected across 24 monitored parameters.
                </p>
              </div>

              {/* Detailed Insights */}
              <div className="space-y-2">
                {/* Performance */}
                <div className="rounded-lg p-2 border border-border bg-muted/40">
                  <div className="flex items-start gap-2">
                    <Gauge className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-gray-900 mb-1">Performance Analysis</p>
                      <p className="text-[10px] text-gray-700 leading-relaxed">
                        Current speed at 57 km/h with RPM at 2,400 indicates efficient engine operation. Fuel consumption is <span className="font-semibold text-green-600">12% below average</span> for similar driving conditions.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Maintenance */}
                <div className="rounded-lg p-2 border border-border bg-muted/40">
                  <div className="flex items-start gap-2">
                    <Wrench className="w-4 h-4 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-gray-900 mb-1">Maintenance Forecast</p>
                      <p className="text-[10px] text-gray-700 leading-relaxed">
                        Next scheduled service in <span className="font-semibold text-amber-600">10,000 km</span> or <span className="font-semibold">3 months</span> (April 2026). Oil change and brake inspection recommended. Tire tread depth is good for <span className="font-semibold">15,000+ km</span>.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Rental Impact */}
                <div className="rounded-lg p-2 border border-border bg-muted/40">
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-purple-600 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-gray-900 mb-1">Rental Readiness</p>
                      <p className="text-[10px] text-gray-700 leading-relaxed">
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
                      <p className="text-xs font-semibold text-gray-900 mb-1">AI Recommendations</p>
                      <p className="text-[10px] text-gray-700 leading-relaxed">
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
          <div className="flex flex-col gap-4">
            {/* Overall Health Box */}
            <div className="flex flex-col gap-4 h-full">
            {/* Box 1: Vehicle Health (Figma design) */}
            <VehicleHealthBoxWired
              selectedVehicle={selectedVehicle}
              isDarkMode={isDarkMode}
              lvBatteryVoltage={liveTelemetry.snapshot?.lvBatteryVoltage ?? null}
              onViewDetails={() => {
                if (selectedVehicle) {
                  setCurrentView('health-errors');
                }
              }}
            />

            {/* Box 3: Quick Actions */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-shadow hover:shadow-md dark:border-blue-500/20">
              <div className="px-3 py-2.5 border-b border-border bg-muted/30">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-2 font-display">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  Quick Actions
                </h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3">
                <button type="button" className="flex items-center gap-2 px-2.5 py-2 bg-card hover:bg-muted rounded-md border border-border hover:border-primary/20 hover:shadow-sm transition-all duration-200 group sq-press">
                  <Droplet className="w-3.5 h-3.5 text-amber-600 group-hover:text-amber-700" />
                  <span className="text-[10px] font-medium text-foreground">Log Oil Change</span>
                </button>
                <button type="button" className="flex items-center gap-2 px-2.5 py-2 bg-card hover:bg-muted rounded-md border border-border hover:border-primary/20 hover:shadow-sm transition-all duration-200 group sq-press">
                  <Wrench className="w-3.5 h-3.5 text-blue-600 group-hover:text-blue-700" />
                  <span className="text-[10px] font-medium text-foreground">Log Service</span>
                </button>
                <button type="button" className="flex items-center gap-2 px-2.5 py-2 bg-card hover:bg-muted rounded-md border border-border hover:border-primary/20 hover:shadow-sm transition-all duration-200 group sq-press">
                  <FileText className="w-3.5 h-3.5 text-purple-600 group-hover:text-purple-700" />
                  <span className="text-[10px] font-medium text-foreground">Log Inspection</span>
                </button>
                <button type="button" className="flex items-center gap-2 px-2.5 py-2 bg-card hover:bg-muted rounded-md border border-border hover:border-primary/20 hover:shadow-sm transition-all duration-200 group sq-press">
                  <Disc className="w-3.5 h-3.5 text-red-600 group-hover:text-red-700" />
                  <span className="text-[10px] font-medium text-foreground">Log Brake</span>
                </button>
                <button type="button" className="flex items-center gap-2 px-2.5 py-2 bg-card hover:bg-muted rounded-md border border-border hover:border-primary/20 hover:shadow-sm transition-all duration-200 group sq-press">
                  <Circle className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                  <span className="text-[10px] font-medium text-foreground">Log Tire</span>
                </button>
                <button type="button" className="flex items-center gap-2 px-2.5 py-2 bg-card hover:bg-muted rounded-md border border-border hover:border-primary/20 hover:shadow-sm transition-all duration-200 group sq-press">
                  <Camera className="w-3.5 h-3.5 text-orange-600 group-hover:text-orange-700" />
                  <span className="text-[10px] font-medium text-foreground">Log Damage</span>
                </button>
                <button type="button" className="flex items-center gap-2 px-2.5 py-2 bg-card hover:bg-muted rounded-md border border-border hover:border-primary/20 hover:shadow-sm transition-all duration-200 group sq-press">
                  <Settings className="w-3.5 h-3.5 text-green-600 group-hover:text-green-700" />
                  <span className="text-[10px] font-medium text-foreground">Log Repair</span>
                </button>
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
        orgId={orgId}
        fleetVehicles={fleetVehicles}
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
        <div className="fixed inset-0 sq-backdrop flex items-center justify-center z-[100]">
          <div className="max-w-md w-full mx-4 rounded-xl p-6 shadow-xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              </div>
              <h3 className="text-base font-semibold text-foreground font-display">
                Cleaning Task Required
              </h3>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              Setting the vehicle status to "Needs Cleaning" will automatically create a cleaning task. The vehicle will be marked as unavailable until the cleaning is completed.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCleaningWarning(false)}
                className="flex-1 px-3 py-2 rounded-md font-medium transition-all duration-200 bg-muted text-foreground hover:bg-accent border border-border sq-press"
              >
                Cancel
              </button>
              <button
                onClick={confirmCleaningChange}
                className="flex-1 px-3 py-2 bg-yellow-600 text-white rounded-md font-semibold hover:bg-yellow-700 transition-all duration-200 shadow-sm sq-press"
              >
                Create Task
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
                pendingStatus === 'Manual Block' ? 'bg-red-100' : 'bg-orange-100'
              }`}>
                {pendingStatus === 'Manual Block' ? (
                  <XCircle className="w-5 h-5 text-red-600" />
                ) : (
                  <Wrench className="w-5 h-5 text-orange-600" />
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
                className={`flex-1 px-3 py-2 text-white rounded-md font-semibold transition-all duration-200 shadow-sm sq-press ${
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
        <div className="fixed inset-0 sq-backdrop flex items-center justify-center z-[100]">
          <div className="max-w-md w-full mx-4 rounded-xl p-6 shadow-xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-blue-600" />
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
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 transition-all duration-200 shadow-sm sq-press"
              >
                Confirm Relocation
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <RentalProvider>
        <FleetProvider>
          <RentalAppContent />
        </FleetProvider>
      </RentalProvider>
    </LanguageProvider>
  );
}
