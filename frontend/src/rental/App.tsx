import { Circle, MapPin, Gauge, Droplet, Gauge as Odometer, Calendar, ClipboardList, Sparkles, Wrench, FileText, AlertTriangle, Disc, Camera, Settings, Home, CheckCircle, Heart, XCircle, ChevronDown, User, X, ArrowLeft, Maximize2, Minimize2, MessageSquare, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  api,
  type TireHealthSummaryResponse,
  type BrakeHealthSummary,
  type BatteryHealthSummary,
  type ServiceInfoStatus,
  type AiHealthCareResponse,
} from '../lib/api';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { NewTaskModal } from './components/NewTaskModal';
import { TripsView } from './components/TripsView';
import { DashboardView } from './components/DashboardView';
import { BookingsView } from './components/BookingsView';
import { RentalDrivingAnalysisView } from './components/RentalDrivingAnalysisView';
import { FinancialInsightsView } from './components/FinancialInsightsView';
import { HealthErrorsView } from './components/HealthErrorsView';
import { FleetView } from './components/FleetView';
import { DamagesView } from './components/DamagesView';
import { DocumentsView } from './components/DocumentsView';
import { CustomersView } from './components/CustomersView';
// TasksView, InvoicesView, FinesView, PriceTariffsView, AnalyticsView
// are now rendered via OperationsView
import { SettingsView, StationsTab } from './components/SettingsView';
import { NewBookingView } from './components/NewBookingView';
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
import { DashboardInsightsProvider } from './DashboardInsightsContext';
import { HandoverProvider } from './HandoverContext';
import { Toaster } from 'sonner';
import { LiveMapOverview } from './components/LiveMapOverview';
import { useLiveVehicleTelemetry } from './hooks/useLiveVehicleTelemetry';
import { useVehicleLiveMapStore } from './stores/useVehicleLiveMapStore';
import { useShallow } from 'zustand/react/shallow';
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
import { VehicleInsightsCard } from './components/VehicleInsightsCard';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import vhBrakeIcon from '../assets/icons/vehicle-health/brake.svg';
import vhMotorFilterIcon from '../assets/icons/vehicle-health/motor-filter.svg';
import vhCarBatteryIcon from '../assets/icons/vehicle-health/car-battery.svg';
import tellTaleOilIcon from '../assets/icons/telltale/oil.svg';
import tellTaleCelIcon from '../assets/icons/telltale/cel.svg';
import tellTaleBrakePadIcon from '../assets/icons/telltale/brake-pad.svg';
import tellTaleTirePressureIcon from '../assets/icons/telltale/tire-pressure.svg';
import tellTaleBatteryWarningIcon from '../assets/icons/telltale/battery.svg';

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
  const [brakes, setBrakes] = useState<BrakeHealthSummary | null>(null);
  const [battery, setBattery] = useState<BatteryHealthSummary | null>(null);
  const [service, setService] = useState<ServiceInfoStatus | null>(null);
  const [dtcCount, setDtcCount] = useState(0);
  const [aiHealthCare, setAiHealthCare] = useState<AiHealthCareResponse | null>(null);

  const vehicleId = selectedVehicle?.id ?? null;

  useEffect(() => {
    if (!vehicleId) {
      setTires(null); setBrakes(null); setBattery(null); setService(null);
      setDtcCount(0); setAiHealthCare(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [t, b, bat, svc, dtc, ai] = await Promise.all([
        api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.brakeHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.batteryHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.serviceInfoStatus(vehicleId).catch(() => null),
        api.vehicleIntelligence.dtcActive(vehicleId).catch(() => []),
        api.vehicleIntelligence.aiHealthCare(vehicleId).catch(() => null),
      ]);
      if (cancelled) return;
      setTires(t); setBrakes(b); setBattery(bat); setService(svc);
      setDtcCount(Array.isArray(dtc) ? dtc.length : 0);
      setAiHealthCare(ai);
    })();
    return () => { cancelled = true; };
  }, [vehicleId]);

  const dm = isDarkMode;

  const brakesPercent =
    brakes?.pads?.healthPercent != null || brakes?.discs?.healthPercent != null
      ? Math.min(brakes?.pads?.healthPercent ?? 101, brakes?.discs?.healthPercent ?? 101)
      : null;
  const brakesVal = brakesPercent ?? 0;
  const tiresVal = tires?.overallPercent ?? selectedVehicle?.tires ?? 0;
  const batteryPubState = battery?.lv?.publicationState ?? battery?.currentState?.publicationState ?? 'INITIAL_CALIBRATION';
  const soh =
    battery?.lv?.healthPercent ??
    (batteryPubState === 'INITIAL_CALIBRATION'
      ? null
      : (battery?.currentState?.publishedSohPct ?? battery?.currentState?.sohPercent ?? null));
  const estimatedSoh = battery?.lv?.estimatedHealthPercent ?? battery?.currentState?.estimatedSohPct ?? null;
  const voltage = battery?.lv?.telemetry?.voltageV ?? battery?.currentState?.voltageV ?? lvBatteryVoltage;
  const batteryScore = soh ?? estimatedSoh ?? null;
  const batteryVal = batteryScore ?? 0;
  const batteryCondition = battery?.lv?.condition ?? battery?.condition ?? null;

  const brakesTracked = brakesPercent != null;
  const tiresTracked = tires?.overallPercent != null || (selectedVehicle?.tires != null && selectedVehicle.tires > 0);
  const batteryTracked = batteryScore != null;
  const trackedFlags = [brakesTracked, tiresTracked, batteryTracked];
  const trackedValues = [brakesVal, tiresVal, batteryVal].filter((_, i) => trackedFlags[i]);
  const untrackedCount = 3 - trackedValues.length;
  const trackedCount = trackedValues.length;

  const healthScore = trackedValues.length > 0
    ? Math.round(trackedValues.reduce((a, b) => a + b, 0) / trackedValues.length)
    : -1;
  const healthProgress = healthScore < 0 ? 0 : Math.min(Math.max(healthScore, 0), 100);
  const overallStatusLabel =
    healthScore < 0 ? 'Insufficient Data' : healthScore >= 80 ? 'Good Health' : healthScore >= 60 ? 'Fair Health' : 'Poor Health';
  const overallAccent = healthScore < 0 ? 'bg-slate-400' : healthScore >= 80 ? 'bg-emerald-500' : healthScore >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const overallProgress = healthScore < 0 ? (dm ? 'bg-neutral-700' : 'bg-slate-200') : healthScore >= 80 ? 'bg-emerald-500' : healthScore >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const overallBadge = healthScore < 0
    ? dm ? 'bg-neutral-800/90 text-neutral-300 ring-neutral-700/80' : 'bg-slate-50 text-slate-500 ring-slate-200'
    : healthScore >= 80
    ? dm ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : healthScore >= 60
    ? dm ? 'bg-amber-500/10 text-amber-300 ring-amber-500/25' : 'bg-amber-50 text-amber-700 ring-amber-200'
    : dm ? 'bg-red-500/10 text-red-300 ring-red-500/25' : 'bg-red-50 text-red-700 ring-red-200';
  // Critical/Monitor counts: tires/brakes use the generic wear scale, battery
  // uses the canonical condition so Dashboard and Health Tab agree.
  const brakeCritical = brakesTracked && brakesVal < 30;
  const tireCritical = tiresTracked && tiresVal < 30;
  const batteryCriticalFlag = batteryTracked && batteryCondition === 'attention';
  const brakeDueSoon = brakesTracked && brakesVal >= 30 && brakesVal < 60;
  const tireDueSoon = tiresTracked && tiresVal >= 30 && tiresVal < 60;
  const batteryDueSoonFlag = batteryTracked && batteryCondition === 'watch';
  const criticalCount = [brakeCritical, tireCritical, batteryCriticalFlag].filter(Boolean).length;
  const dueSoonCount = [brakeDueSoon, tireDueSoon, batteryDueSoonFlag].filter(Boolean).length;

  const getStatus = (v: number, tracked: boolean) => {
    if (!tracked) return { label: 'No Data', labelColor: dm ? 'text-gray-500' : 'text-gray-400', bar: dm ? 'bg-neutral-700' : 'bg-gray-200' };
    if (v >= 80) return { label: 'Excellent', labelColor: 'text-green-600', bar: 'bg-green-500' };
    if (v >= 60) return { label: 'Monitor', labelColor: 'text-yellow-600', bar: 'bg-yellow-500' };
    if (v >= 30) return { label: 'Due soon', labelColor: 'text-orange-500', bar: 'bg-orange-500' };
    return { label: 'Critical', labelColor: 'text-red-600', bar: 'bg-red-500' };
  };

  // Battery uses the canonical condition from the backend
  // (CanonicalBatteryHealthService) so the Dashboard Vehicle Health box and
  // the Health Tab render the identical green/amber/red status for the same
  // vehicle. The generic wear-scale (80/60/30) only fits brakes and tires.
  //
  // Thresholds (mirrored from backend, for voltage-only fallback):
  //   voltage < 12.0 → Attention (red)   — starting unlikely
  //   voltage < 12.4 → Monitor   (amber) — starting difficulty possible
  //   SOH    < 50   → Attention (red)
  //   SOH    < 75   → Monitor   (amber)
  const getBatteryStatus = (
    v: number,
    tracked: boolean,
    condition: string | null | undefined,
    voltageV: number | null | undefined,
  ) => {
    if (!tracked) return { label: 'No Data', labelColor: dm ? 'text-gray-500' : 'text-gray-400', bar: dm ? 'bg-neutral-700' : 'bg-gray-200' };
    if (condition === 'good') return { label: 'Healthy', labelColor: 'text-green-600', bar: 'bg-green-500' };
    if (condition === 'watch') return { label: 'Monitor', labelColor: 'text-amber-600', bar: 'bg-amber-500' };
    if (condition === 'attention') return { label: 'Attention', labelColor: 'text-red-600', bar: 'bg-red-500' };
    if (voltageV != null) {
      if (voltageV < 12.0) return { label: 'Attention', labelColor: 'text-red-600', bar: 'bg-red-500' };
      if (voltageV < 12.4) return { label: 'Monitor', labelColor: 'text-amber-600', bar: 'bg-amber-500' };
      return { label: 'Healthy', labelColor: 'text-green-600', bar: 'bg-green-500' };
    }
    if (v < 50) return { label: 'Attention', labelColor: 'text-red-600', bar: 'bg-red-500' };
    if (v < 75) return { label: 'Monitor', labelColor: 'text-amber-600', bar: 'bg-amber-500' };
    return { label: 'Healthy', labelColor: 'text-green-600', bar: 'bg-green-500' };
  };

  const brakesDetail = (() => {
    const remKm = brakes?.remainingKm ?? null;
    if (remKm != null) return `~${Math.round(remKm / 1000)}k km`;
    if (brakes?.stateClass === 'WARNING_ONLY') return 'Warning-only telemetry';
    if (brakes?.stateClass === 'NO_BASELINE') return 'No baseline';
    if (brakesVal >= 80) return 'Healthy estimate';
    if (brakesVal >= 60) return 'Check soon';
    return brakesTracked ? 'Service needed' : 'No tracking';
  })();

  const tiresDetail = (() => {
    const remKm = tires?.overallRemainingKm;
    if (remKm != null) return `~${Math.round(remKm / 1000)}k km`;
    if (tires?.actionState === 'REPLACE') return 'Replace now';
    if (tires?.actionState === 'PLAN_SERVICE') return 'Plan service';
    if (tires?.actionState === 'CHECK_SOON') return 'Check soon';
    return tiresTracked ? 'Model estimate unavailable' : 'No tracking';
  })();

  const batteryDetail = (() => {
    if (batteryPubState === 'INITIAL_CALIBRATION') return 'Calibrating (estimate unavailable)';
    if (batteryPubState === 'STABILIZING') return voltage != null ? `~${voltage.toFixed(1)}V · Stabilizing` : 'Stabilizing';
    const vStr = voltage != null ? `${voltage.toFixed(1)}V` : null;
    // Surface the critical message inline so operators don't need to open
    // the Health Tab to see why the battery is amber/red.
    if (batteryCondition === 'attention') {
      return vStr
        ? `${vStr} · Kritisch — Starthilfe/Austausch empfohlen`
        : 'Kritisch — Starthilfe/Austausch empfohlen';
    }
    if (batteryCondition === 'watch') {
      return vStr
        ? `${vStr} · Startschwierigkeiten möglich`
        : 'Startschwierigkeiten möglich';
    }
    if (soh != null) return vStr ?? 'SOH tracked';
    if (vStr) return vStr;
    return 'Estimate unavailable';
  })();

  const healthItems = [
    {
      key: 'brakes', label: 'Brakes', value: brakesVal, detail: brakesDetail, tracked: brakesTracked,
      iconBg: '',
      icon: <img src={vhBrakeIcon} alt="" aria-hidden="true" className={`w-5 h-5 object-contain ${dm ? 'invert' : ''}`} />,
    },
    {
      key: 'tires', label: 'Tires', value: tiresVal, detail: tiresDetail, tracked: tiresTracked,
      iconBg: '',
      icon: <img src={vhMotorFilterIcon} alt="" aria-hidden="true" className={`w-5 h-5 object-contain rotate-90 ${dm ? 'invert' : ''}`} />,
    },
    {
      key: 'battery', label: 'Battery', value: batteryVal, detail: batteryDetail, tracked: batteryTracked,
      iconBg: '',
      icon: <img src={vhCarBatteryIcon} alt="" aria-hidden="true" className={`w-5 h-5 object-contain ${dm ? 'invert' : ''}`} />,
    },
  ];

  // Service status — prefer day-level precision from the backend and keep
  // the sign so an overdue vehicle renders red instead of being silently
  // clamped to 0 weeks remaining.
  const svcOverdue = service?.serviceOverdue === true;
  const svcImminent = service?.serviceDueImminently === true && !svcOverdue;
  const svcRemDays = service?.serviceRemainingDays ?? null;
  const svcRemMonths = service?.serviceRemainingMonths ?? null;
  const svcOverdueDays = service?.serviceOverdueDays ?? null;
  const svcOverdueKm = service?.serviceOverdueKm ?? null;
  const svcRemKm = service?.serviceRemainingKm;
  const tuvDate = service?.tuvValidTill ? new Date(service.tuvValidTill).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
  const tuvOverdue = service?.tuvOverdue === true;
  const tuvDays = service?.tuvRemainingDays ?? null;

  const divider = <div className={`border-t my-3 ${dm ? 'border-neutral-700/80' : 'border-gray-100'}`} />;

  return (
    <div className={`group relative overflow-hidden rounded-[18px] p-[1px] shadow-[var(--shadow-2)] transition-[box-shadow,transform] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)] ${
      dm
        ? 'bg-gradient-to-br from-blue-500/25 via-neutral-800/80 to-emerald-500/20'
        : 'bg-gradient-to-br from-blue-500/20 via-white to-emerald-500/10'
    }`}>
      <div className={`pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full blur-2xl ${
        dm ? 'bg-blue-400/10' : 'bg-blue-500/10'
      }`} />
      <div className={`relative flex h-full flex-col rounded-[17px] p-3 ${
        dm
          ? 'border border-white/10 bg-neutral-950/95 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'border border-white/80 bg-white/95 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]'
      }`}>
      <style>{`
        @keyframes barFillUp { from { width: 0%; } }
        @keyframes calibDots { 0%,20%{opacity:.2} 50%{opacity:1} 100%{opacity:.2} }
      `}</style>

      <div className={`relative mb-2.5 overflow-hidden rounded-[14px] border p-2.5 ${
        dm ? 'border-white/10 bg-white/[0.04]' : 'border-slate-200/80 bg-slate-50/80'
      }`}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className={`text-[10.5px] font-bold uppercase tracking-[0.12em] ${dm ? 'text-neutral-400' : 'text-slate-500'}`}>Vehicle Health</h3>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className={`font-mono text-[24px] font-bold leading-none tracking-[-0.04em] tabular-nums ${dm ? 'text-white' : 'text-slate-950'}`}>
                {healthScore < 0 ? '—' : healthScore}
              </span>
              <span className={`text-[10px] font-semibold ${dm ? 'text-neutral-500' : 'text-slate-400'}`}>%</span>
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ${overallBadge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${overallAccent}`} />
            {overallStatusLabel}
          </span>
        </div>
        <div className={`h-2 overflow-hidden rounded-full ${dm ? 'bg-neutral-800' : 'bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)]'}`}>
          <div
            className={`h-full rounded-full ${overallProgress} shadow-[0_0_12px_rgba(37,99,235,0.18)]`}
            style={{ width: `${healthProgress}%`, animation: 'barFillUp 0.7s cubic-bezier(0.16,1,0.3,1) both' }}
          />
        </div>
        <div className={`mt-1.5 flex items-center justify-between text-[9.5px] font-semibold ${dm ? 'text-neutral-500' : 'text-slate-500'}`}>
          <span>{trackedCount}/3 tracked</span>
          <span>{untrackedCount > 0 ? `${untrackedCount} missing` : 'complete'}</span>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1.5">
        {([
          {
            label: 'Critical',
            value: criticalCount,
            tone: criticalCount > 0
              ? dm ? 'border-red-500/25 bg-red-500/10 text-red-300' : 'border-red-200 bg-red-50 text-red-700'
              : dm ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-emerald-100 bg-emerald-50/80 text-emerald-700',
          },
          {
            label: 'Due soon',
            value: dueSoonCount,
            tone: dueSoonCount > 0
              ? dm ? 'border-amber-500/25 bg-amber-500/10 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'
              : dm ? 'border-white/10 bg-white/[0.03] text-neutral-400' : 'border-slate-100 bg-slate-50 text-slate-500',
          },
          {
            label: 'Faults',
            value: dtcCount,
            tone: dtcCount > 0
              ? dm ? 'border-red-500/25 bg-red-500/10 text-red-300' : 'border-red-200 bg-red-50 text-red-700'
              : dm ? 'border-white/10 bg-white/[0.03] text-neutral-400' : 'border-slate-100 bg-slate-50 text-slate-500',
          },
        ] as const).map((stat) => (
          <div key={stat.label} className={`rounded-[10px] border px-1.5 py-1.5 text-center ${stat.tone}`}>
            <div className="font-mono text-[15px] font-bold leading-none tabular-nums">{stat.value}</div>
            <div className="mt-0.5 truncate text-[8.5px] font-semibold leading-none tracking-[-0.01em]">{stat.label}</div>
          </div>
        ))}
      </div>
      {untrackedCount > 0 && (
        <div className={`mb-2 flex items-start gap-1.5 rounded-[11px] border px-2 py-1.5 ${dm ? 'bg-blue-500/5 border-blue-500/20' : 'bg-blue-50/70 border-blue-100'}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={dm ? 'text-blue-400' : 'text-blue-500'}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span className={`text-[9.5px] leading-snug ${dm ? 'text-blue-300/80' : 'text-blue-700'}`}>
            {untrackedCount} of 3 health dimensions have no data yet. Enable tracking to get more accurate results.
          </span>
        </div>
      )}
      <p className={`mb-1 text-[9.5px] font-semibold tracking-[0.02em] ${dm ? 'text-neutral-500' : 'text-slate-400'}`}>
        Diagnostics · Wear trends · Service status
      </p>

      {divider}

      {/* Health Items */}
      <div className="space-y-2">
        {healthItems.map((item, idx) => {
          const isCalibrating = item.key === 'battery' && batteryPubState === 'INITIAL_CALIBRATION';
          const isStabilizing = item.key === 'battery' && batteryPubState === 'STABILIZING';
          const isUntracked = !item.tracked && !isCalibrating && !isStabilizing;
          const st = item.key === 'battery'
            ? getBatteryStatus(item.value, item.tracked, batteryCondition, voltage)
            : getStatus(item.value, item.tracked);
          const showBadge =
            !isCalibrating && !isStabilizing && !isUntracked && (
              item.key === 'battery'
                ? (batteryCondition === 'watch' || batteryCondition === 'attention')
                : item.value < 60
            );
          return (
            <div key={item.key} className={`rounded-[13px] border px-2 py-2 transition-colors ${
              dm ? 'border-white/10 bg-white/[0.025]' : 'border-slate-100 bg-slate-50/70'
            } ${isUntracked ? 'opacity-70' : ''}`}>
              <div className="flex gap-2.5 items-center">
              <div className={`w-8 h-8 rounded-[10px] border flex items-center justify-center flex-shrink-0 ${
                dm ? 'border-white/10 bg-white/[0.04]' : 'border-white bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
              } ${item.iconBg}`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[11.5px] font-bold flex-1 tracking-[-0.01em] ${dm ? 'text-gray-100' : 'text-slate-800'}`}>{item.label}</span>
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
                      item.key === 'battery'
                        ? (batteryCondition === 'attention'
                            ? 'bg-red-50 border-red-200 text-red-600'
                            : 'bg-amber-50 border-amber-200 text-amber-700')
                        : (item.value < 30 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-amber-50 border-amber-200 text-amber-700')
                    }`}>{st.label}</span>
                  )}
                  {isCalibrating ? (
                    <span className={`font-mono text-xs ${dm ? 'text-gray-500' : 'text-gray-400'}`}>—</span>
                  ) : isUntracked ? (
                    <span className={`font-mono text-xs ${dm ? 'text-gray-500' : 'text-gray-400'}`}>—</span>
                  ) : (
                    <span className={`font-mono text-[12px] font-bold tabular-nums ${isStabilizing ? (dm ? 'text-gray-300' : 'text-gray-600') : dm ? 'text-white' : 'text-slate-950'}`}>{item.value > 0 ? `${isStabilizing ? '~' : ''}${Math.round(item.value)}%` : '—'}</span>
                  )}
                </div>
                {isCalibrating ? (
                  <div className={`w-full rounded-full h-2 overflow-hidden ${dm ? 'bg-neutral-800' : 'bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)]'}`}>
                    <div className={`h-full rounded-full ${dm ? 'bg-blue-500/30' : 'bg-blue-200'}`} style={{ width: '30%', animation: `barFillUp 2s cubic-bezier(0.16,1,0.3,1) infinite alternate` }} />
                  </div>
                ) : isUntracked ? (
                  <div className={`w-full rounded-full h-2 ${dm ? 'bg-neutral-800' : 'bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)]'}`}>
                    <div className={`h-full rounded-full ${dm ? 'bg-neutral-700' : 'bg-slate-200'}`} style={{ width: '100%' }} />
                  </div>
                ) : (
                  <div className={`w-full rounded-full h-2 overflow-hidden ${dm ? 'bg-neutral-800' : 'bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)]'}`}>
                    <div className={`h-full rounded-full ${isStabilizing ? (dm ? 'bg-amber-500/60' : 'bg-amber-400') : st.bar}`}
                      style={{ width: `${Math.min(item.value, 100)}%`, animation: `barFillUp 0.8s cubic-bezier(0.16,1,0.3,1) ${idx * 0.15}s both` }}
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
            </div>
          );
        })}
      </div>

      {divider}

      {/* ── Tacho Warnleuchten (Quick-View)
            Compact mirror of the dedicated warning-light strip in the
            Health Tab (HealthErrorsView). Shows 5 dashboard tell-tale
            icons (Motoröl, Motorkontrollleuchte, Bremsbelag, Reifendruck,
            Batterie-Warnleuchte) with active/off/no-data state, derived
            from the same `aiHealthCare.indicators` payload so the
            Dashboard and the Health Tab can never disagree.
            Only rendered when HM/OEM dashboard streaming is active for
            the vehicle (`hmHealthActive`), to avoid a misleading "alle
            Aus"-line on fleets without OEM stream coverage. */}
      {aiHealthCare?.hmHealthActive && (() => {
        type Tone = 'alert' | 'ok' | 'neutral' | 'muted';
        const freshness = aiHealthCare.hmFreshnessStatus;
        const streamCold = freshness === 'no_data';
        const resolveFlag = (
          value: boolean | null | undefined,
          activeText: string,
          okText: string,
        ): { text: string; tone: Tone } => {
          if (value === true) return { text: activeText, tone: 'alert' };
          if (value === false) return { text: okText, tone: 'ok' };
          if (streamCold) return { text: 'Noch keine Daten', tone: 'neutral' };
          // warn_flag semantics: missing push on a fresh stream === light is off
          return { text: okText, tone: 'ok' };
        };
        const oilLow = aiHealthCare.hmIndicators?.oilLevel?.status === 'LOW';
        const oilHasData = aiHealthCare.oilLevelDisplay && aiHealthCare.oilLevelDisplay.mode !== 'no_data';
        const oilTone: Tone = oilLow ? 'alert' : oilHasData ? 'ok' : streamCold ? 'neutral' : 'muted';
        const cel = resolveFlag(aiHealthCare.indicators?.limpMode, 'Aktiv', 'Aus');
        const brakePad = resolveFlag(aiHealthCare.indicators?.brakeWarning, 'Aktiv', 'Aus');
        const tirePressure = resolveFlag(aiHealthCare.indicators?.tirePressureWarning, 'Aktiv', 'Aus');
        const batteryLight = resolveFlag(aiHealthCare.indicators?.batteryWarningLight, 'Aktiv', 'Aus');

        const items: Array<{ key: string; label: string; tone: Tone; text: string; icon: string; rotate?: boolean }> = [
          { key: 'oil', label: 'Motoröl', tone: oilTone, text: oilLow ? 'Niedrig' : oilHasData ? (aiHealthCare.oilLevelDisplay?.label ?? 'OK') : streamCold ? 'Noch keine Daten' : 'Kein Push', icon: tellTaleOilIcon },
          { key: 'cel', label: 'Motor-K.', tone: cel.tone, text: cel.text, icon: tellTaleCelIcon },
          { key: 'brake-pad', label: 'Bremsbelag', tone: brakePad.tone, text: brakePad.text, icon: tellTaleBrakePadIcon },
          { key: 'tire-pressure', label: 'Reifendruck', tone: tirePressure.tone, text: tirePressure.text, icon: tellTaleTirePressureIcon },
          { key: 'battery-light', label: 'Batterie', tone: batteryLight.tone, text: batteryLight.text, icon: tellTaleBatteryWarningIcon },
        ];

        const activeAlerts = items.filter(it => it.tone === 'alert').length;
        const lastUpdateLabel = (() => {
          if (!aiHealthCare.lastHmUpdate) return null;
          const ms = Date.now() - new Date(aiHealthCare.lastHmUpdate).getTime();
          const h = Math.floor(ms / 3600000);
          const d = Math.floor(h / 24);
          if (d >= 1) return `vor ${d}d`;
          return `vor ${h < 1 ? '<1h' : `${h}h`}`;
        })();

        const iconBgFor = (tone: Tone): string => {
          if (tone === 'alert') return dm ? 'bg-amber-500/20' : 'bg-amber-50';
          if (tone === 'ok') return dm ? 'bg-emerald-500/10' : 'bg-emerald-50';
          if (tone === 'muted') return dm ? 'bg-neutral-800' : 'bg-gray-100';
          return dm ? 'bg-neutral-800' : 'bg-gray-100';
        };

        return (
          <>
            <div className="mb-2">
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`text-[11px] font-semibold ${dm ? 'text-gray-100' : 'text-gray-800'}`}>Tacho Warnleuchten</span>
                {activeAlerts > 0 ? (
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${dm ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    {activeAlerts} aktiv
                  </span>
                ) : (
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${dm ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                    Alle aus
                  </span>
                )}
                {freshness === 'stale' && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Veraltet
                  </span>
                )}
                {lastUpdateLabel && freshness !== 'stale' && (
                  <span className={`ml-auto text-[9px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>{lastUpdateLabel}</span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {items.map(it => (
                  <button
                    key={it.key}
                    type="button"
                    onClick={onViewDetails}
                    title={`${it.label}: ${it.text}`}
                    className={`group flex flex-col items-center gap-1 px-1 py-1.5 rounded-lg border transition-colors ${
                      it.tone === 'alert'
                        ? dm ? 'border-amber-500/30 hover:bg-amber-500/10' : 'border-amber-200 hover:bg-amber-50'
                        : dm ? 'border-neutral-700/70 hover:bg-neutral-800/60' : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${iconBgFor(it.tone)}`}>
                      <img
                        src={it.icon}
                        alt=""
                        aria-hidden="true"
                        className={`w-3.5 h-3.5 object-contain transition-opacity ${
                          it.tone === 'alert' ? 'opacity-95' : it.tone === 'ok' ? 'opacity-50 grayscale' : 'opacity-30 grayscale'
                        }`}
                      />
                    </div>
                    <span className={`text-[9px] leading-none truncate w-full text-center ${
                      it.tone === 'alert'
                        ? dm ? 'text-amber-300 font-semibold' : 'text-amber-700 font-semibold'
                        : dm ? 'text-gray-400' : 'text-gray-500'
                    }`}>{it.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {divider}
          </>
        );
      })()}

      {/* Service Info (integrated)
          Emphasizes critical state: overdue → red label + icon + overdue copy,
          imminent (≤7d / ≤500km) → amber. The label text is precise (Tage/km)
          so operators see "Überfällig seit 48 Tagen" instead of a rounded
          "-2 months" that hides the urgency. */}
      <div className="grid grid-cols-2 gap-x-3">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Wrench className={`w-3 h-3 flex-shrink-0 ${svcOverdue ? 'text-red-500' : svcImminent ? 'text-amber-500' : 'text-blue-500'}`} />
            <span className={`text-[11px] font-semibold ${svcOverdue ? 'text-red-600 dark:text-red-400' : svcImminent ? 'text-amber-600 dark:text-amber-400' : dm ? 'text-white' : 'text-gray-800'}`}>
              Maintenance{svcOverdue ? ' — Überfällig' : svcImminent ? ' — Fällig' : ''}
            </span>
          </div>
          <div className="flex items-start gap-1">
            <Calendar className={`w-3 h-3 mt-px flex-shrink-0 ${svcOverdue ? 'text-red-400' : svcImminent ? 'text-amber-400' : 'text-violet-400'}`} />
            <span className={`text-[10px] leading-snug ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
              {svcOverdue ? (
                <>
                  Service: <span className="font-semibold text-red-600 dark:text-red-400">
                    überfällig seit {svcOverdueDays != null ? `${svcOverdueDays} Tagen` : ''}
                    {svcOverdueDays != null && svcOverdueKm != null ? ' / ' : ''}
                    {svcOverdueKm != null ? `${svcOverdueKm.toLocaleString('de-DE')} km` : ''}
                  </span>
                </>
              ) : svcRemDays != null ? (
                <>
                  Next: <span className={`font-semibold ${svcImminent ? 'text-amber-600 dark:text-amber-400' : dm ? 'text-gray-200' : 'text-gray-700'}`}>
                    {svcRemDays <= 90 ? `in ${svcRemDays} Tagen` : `in ${svcRemMonths ?? Math.round(svcRemDays / 30)} Monaten`}
                  </span>
                  {svcRemKm != null && svcRemKm >= 0 && <><br />{svcRemKm.toLocaleString('de-DE')} km</>}
                </>
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
            <Calendar className={`w-3 h-3 flex-shrink-0 ${tuvOverdue ? 'text-red-500' : 'text-blue-500'}`} />
            <span className={`text-[11px] font-semibold ${tuvOverdue ? 'text-red-600 dark:text-red-400' : dm ? 'text-white' : 'text-gray-800'}`}>
              Inspection{tuvOverdue ? ' — Abgelaufen' : ''}
            </span>
          </div>
          <div className="flex items-start gap-1">
            <Calendar className={`w-3 h-3 mt-px flex-shrink-0 ${tuvOverdue ? 'text-red-400' : 'text-violet-400'}`} />
            <span className={`text-[10px] leading-snug ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
              {tuvDate ? (
                <>TÜV: <span className={`font-semibold ${
                  tuvOverdue ? 'text-red-600 dark:text-red-400' :
                  (tuvDays ?? 9999) <= 60 ? 'text-red-500' :
                  (tuvDays ?? 9999) <= 180 ? 'text-amber-500' :
                  dm ? 'text-gray-200' : 'text-gray-700'
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
      <div className="pt-1">
        <button
          onClick={onViewDetails}
          className={`group flex w-full items-center justify-between rounded-[12px] px-2.5 py-2 text-[11px] font-bold transition-[background-color,color,transform] duration-300 ease-[var(--ease-out-soft)] active:scale-[0.99] ${
            dm
              ? 'bg-blue-500/10 text-blue-300 hover:bg-blue-500/15'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
        >
          <span>View Health Details</span>
          <span className={`flex h-5 w-5 items-center justify-center rounded-full transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-0.5 ${
            dm ? 'bg-blue-400/15' : 'bg-white/80'
          }`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </button>
      </div>
      </div>
    </div>
  );
}

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

function VehicleConnectionBadge({ isDarkMode }: { isDarkMode: boolean }) {
  const { onlineStatus, lastSignal } = useVehicleLiveMapStore(
    useShallow((state) => ({
      onlineStatus: state.onlineStatus,
      lastSignal: state.lastSignal,
    })),
  );

  const connState =
    onlineStatus === 'ONLINE'
      ? 'online'
      : onlineStatus === 'STANDBY'
      ? 'standby'
      : 'offline';
  let timeAgo = '—';
  if (lastSignal) {
    const diff = Date.now() - new Date(lastSignal).getTime();
    if (!isNaN(diff) && diff >= 0) {
      const mins = Math.floor(diff / 60000);
      if (mins < 1) timeAgo = 'just now';
      else if (mins < 60) timeAgo = `${mins}m ago`;
      else {
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) timeAgo = `${hrs}h ago`;
        else timeAgo = `${Math.floor(hrs / 24)}d ago`;
      }
    }
  }
  const dotColor =
    connState === 'online'
      ? 'text-green-500 fill-green-500 animate-online-pulse'
      : connState === 'standby'
      ? 'text-amber-500 fill-amber-500'
      : 'text-gray-400 fill-gray-400';
  const labelColor =
    connState === 'online'
      ? 'text-green-700'
      : connState === 'standby'
      ? isDarkMode
        ? 'text-amber-400'
        : 'text-amber-600'
      : 'text-gray-500';
  const label =
    connState === 'online'
      ? 'Online'
      : connState === 'standby'
      ? 'Standby'
      : 'Offline';

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-card shadow-sm">
      <div className="flex items-center gap-1.5">
        <Circle className={`w-2 h-2 ${dotColor}`} />
        <span className={`text-[12px] font-semibold tracking-[-0.003em] ${labelColor}`}>{label}</span>
      </div>
      <div className={`w-px h-4 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`}></div>
      <div className="flex items-center gap-1">
        <span
          className={`text-[10.5px] font-semibold ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          Last Signal
        </span>
        <span
          className={`text-[10.5px] font-bold tabular-nums ${
            isDarkMode ? 'text-gray-200' : 'text-gray-900'
          }`}
        >
          {timeAgo}
        </span>
      </div>
    </div>
  );
}

function OverviewLiveMapCard({
  selectedVehicle,
  orgId,
  isDarkMode,
}: {
  selectedVehicle: VehicleData | null;
  orgId: string;
  isDarkMode: boolean;
}) {
  const liveTelemetry = useVehicleLiveMapStore(
    useShallow((state) => ({
      targetPosition: state.targetPosition,
      heading: state.heading,
      speedKmh: state.speedKmh,
      isLiveTracking: state.isLiveTracking,
      snapshot: state.snapshot,
      displayState: state.displayState,
    })),
  );

  return (
    <div className="rounded-xl p-3 border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="group relative h-[340px] rounded-lg overflow-hidden transition-all duration-300">
        <LiveMapOverview
          className="w-full h-full"
          targetPosition={liveTelemetry.targetPosition}
          initialPosition={
            selectedVehicle?.lat != null && selectedVehicle?.lng != null
              ? [selectedVehicle.lng, selectedVehicle.lat]
              : null
          }
          heading={liveTelemetry.heading}
          speedKmh={liveTelemetry.speedKmh}
          licensePlate={selectedVehicle?.license ?? ''}
          waitingForPosition={!!selectedVehicle && !!orgId && !liveTelemetry.targetPosition}
          isLiveTracking={liveTelemetry.isLiveTracking}
          isDarkMode={isDarkMode}
        />

        <div className="absolute bottom-0 left-0 right-0 p-3 opacity-85 group-hover:opacity-100 transition-opacity duration-700 ease-[var(--ease-out-soft)]">
          <div
            className="sq-map-liquid-glass rounded-[18px] p-2.5"
          >
            {(() => {
              const stateLabel = liveTelemetry.displayState;
              const stateColor =
                stateLabel === 'MOVING'
                  ? isDarkMode
                    ? 'text-green-400'
                    : 'text-green-700'
                  : stateLabel === 'IDLE'
                  ? isDarkMode
                    ? 'text-amber-400'
                    : 'text-amber-600'
                  : isDarkMode
                  ? 'text-gray-400'
                  : 'text-gray-500';
              return (
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="sq-map-liquid-tile flex flex-col items-center rounded-[12px] px-1 py-2">
                    <Circle className="w-3.5 h-3.5 text-blue-500 mb-0.5" />
                    <span className={`text-[10px] mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      State
                    </span>
                    <span className={`text-sm font-bold ${stateColor}`}>{stateLabel}</span>
                  </div>

                  <div className="sq-map-liquid-tile flex flex-col items-center rounded-[12px] px-1 py-2">
                    <Droplet
                      className={`w-3.5 h-3.5 mb-0.5 ${
                        selectedVehicle?.isElectric ? 'text-emerald-500' : 'text-green-500'
                      }`}
                    />
                    <span className={`text-[10px] mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {selectedVehicle?.isElectric ? 'Energy' : 'Fuel'}
                    </span>
                    <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {Math.round(
                        selectedVehicle?.isElectric
                          ? (liveTelemetry.snapshot?.battery ?? selectedVehicle?.battery ?? 0)
                          : (liveTelemetry.snapshot?.fuel ?? selectedVehicle?.fuel ?? 0),
                      )}
                      <span className="text-[10px] font-normal text-gray-500">%</span>
                    </span>
                  </div>

                  <div className="sq-map-liquid-tile flex flex-col items-center rounded-[12px] px-1 py-2">
                    <Odometer className="w-3.5 h-3.5 text-gray-500 mb-0.5" />
                    <span className={`text-[10px] mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Odometer
                    </span>
                    <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {selectedVehicle
                        ? (liveTelemetry.snapshot?.odometer ?? selectedVehicle.odometer).toLocaleString('de-DE')
                        : '—'}{' '}
                      <span className="text-[10px] font-normal text-gray-500">km</span>
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

function VehicleHealthBoxTelemetryBridge({
  selectedVehicle,
  isDarkMode,
  onViewDetails,
}: {
  selectedVehicle: VehicleData | null;
  isDarkMode: boolean;
  onViewDetails?: () => void;
}) {
  const lvBatteryVoltage = useVehicleLiveMapStore(
    (state) => state.snapshot?.lvBatteryVoltage ?? null,
  );
  return (
    <VehicleHealthBoxWired
      selectedVehicle={selectedVehicle}
      isDarkMode={isDarkMode}
      lvBatteryVoltage={lvBatteryVoltage}
      onViewDetails={onViewDetails}
    />
  );
}

function RentalAppContent() {
  const { orgId } = useRentalOrg();
  const { fleetVehicles, loading: fleetLoading, refresh: refreshFleet } = useFleetVehicles();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [cleaningStatus, setCleaningStatus] = useState<'Clean' | 'Needs Cleaning'>('Clean');
  const [vehicleStatus, setVehicleStatus] = useState<'Available' | 'Manual Block' | 'Maintenance'>('Available');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isCleaningDropdownOpen, setIsCleaningDropdownOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [autoOpenNewTask, setAutoOpenNewTask] = useState(false);
  const [currentView, setCurrentView] = useState<'overview' | 'trips' | 'dashboard' | 'bookings' | 'health-errors' | 'fleet' | 'damages' | 'documents' | 'customers' | 'customer-detail' | 'tasks' | 'vendor-management' | 'vendor-detail' | 'invoices' | 'fines' | 'price-tariffs' | 'analytics' | 'rental-driving-analysis' | 'financial-insights' | 'settings' | 'new-booking' | 'stations' | 'vehicle-bookings' | 'vehicle-tasks' | 'document-upload' | 'ai-assistant' | 'support' | 'help-center' | 'fleet-condition' | 'fleet-condition-detail' | 'workflow-automation' | 'whatsapp-business' | 'parts-accessories' | 'insurances' | 'service-maintenance' | 'ai-voice-assistant'>('dashboard');
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [detailVendorId, setDetailVendorId] = useState<string | null>(null);
  // V4.6.99 — Pending Booking-Detail-Id für die Cross-View-Navigation
  // (Dashboard → BookingsView → Detail-Seite). Wird gesetzt, wenn ein
  // BK-Chip in einer StatInlineDetail-Karte geklickt wird; BookingsView
  // konsumiert das Feld in einem useEffect und setzt anschliessend
  // `setPendingBookingDetailId(null)` über den Reset-Callback zurück.
  const [pendingBookingDetailId, setPendingBookingDetailId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'account' | 'company' | 'fleet-connection' | 'users' | 'billing' | 'data-authorization'>('company');
  const [operationsTab, setOperationsTab] = useState<OperationsTab>('analytics');
  const [conditionDrillVehicleId, setConditionDrillVehicleId] = useState<string | null>(null);
  const [conditionDrillCategory, setConditionDrillCategory] = useState<ConditionCategory>('tires');
  const [financeTab, setFinanceTab] = useState<FinanceTab>('invoices');
  const [tasksSectionTab, setTasksSectionTab] = useState<TasksSectionTab>('tasks');
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
  const [activeBookingRef, setActiveBookingRef] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
  
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

  // Monotonic counter bumped whenever bookings are created / updated /
  // cancelled. Persistent components (e.g. the RightSidebar calendar and
  // schedule list) use this as a refetch trigger so newly created bookings
  // with a today pickup/return show up immediately without a page reload.
  // Also triggers a FleetContext refresh so the backend-derived vehicle
  // status (Available/Reserved/Active Rented) reflects the new commitment
  // state inside the next render instead of waiting up to 30s for the
  // scheduled fleet poll to pick it up.
  const [bookingsVersion, setBookingsVersion] = useState(0);
  const bumpBookingsVersion = () => {
    setBookingsVersion(v => v + 1);
    refreshFleet().catch(() => {});
  };

  // V4.6.75 — HandoverProvider broadcasts `handover:completed` after the
  // pickup or return protocol has been written. Bump bookingsVersion +
  // refresh fleet so BookingsView, DashboardView and the RightSidebar
  // reflect the new booking status + vehicle availability immediately.
  useEffect(() => {
    const onHandover = () => {
      setBookingsVersion(v => v + 1);
      refreshFleet().catch(() => {});
    };
    window.addEventListener('handover:completed', onHandover as EventListener);
    return () => window.removeEventListener('handover:completed', onHandover as EventListener);
  }, [refreshFleet]);

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

  const detailCustomerId = (() => {
    const rawId = detailCustomer?.id;
    if (typeof rawId !== 'string' || rawId.length === 0) return null;
    return `CID-${rawId.replace('c', '')}4821`;
  })();

  return (
    <HandoverProvider isDarkMode={isDarkMode}>
    <div 
      className="h-screen w-full flex overflow-hidden transition-colors duration-300 relative bg-background"
      style={{ fontFamily: "'Manrope', sans-serif" }}
    >
      <VehicleLiveTelemetryBinder vehicleId={liveTelemetryVehicleId} orgId={orgId} />
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
        {/* V4.6.86 — larger gutters + more breathable top/bottom rhythm. Max-width grows slightly
            on ultra-wide screens so dashboards/tables don't cramp against the right sidebar. */}
        <div className="flex-1 overflow-auto px-5 sm:px-7 lg:px-[50px] pt-4 lg:pt-6 pb-8 text-foreground">
          <div className="max-w-[1440px] mx-auto text-[13px]">
            <TopBar isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} currentView={currentView} settingsTab={settingsTab} selectedVehicle={selectedVehicle} activeBookingRef={activeBookingRef} detailCustomerId={detailCustomerId} onViewChange={setCurrentView} onVehicleSelect={setSelectedVehicle} onSettingsTabChange={setSettingsTab} onFinanceTabChange={setFinanceTab} onTasksTabChange={setTasksSectionTab} />
        {/* Header Section - Only show for overview and trips views */}
        {currentView !== 'dashboard' && currentView !== 'bookings' && currentView !== 'fleet' && currentView !== 'customers' && currentView !== 'customer-detail' && currentView !== 'tasks' && currentView !== 'invoices' && currentView !== 'fines' && currentView !== 'price-tariffs' && currentView !== 'analytics' && currentView !== 'settings' && currentView !== 'new-booking' && currentView !== 'stations' && currentView !== 'fleet-condition' && currentView !== 'document-upload' && currentView !== 'ai-assistant' && currentView !== 'support' && currentView !== 'help-center' && currentView !== 'workflow-automation' && currentView !== 'whatsapp-business' && currentView !== 'parts-accessories' && currentView !== 'ai-voice-assistant' && (
        <div className="mb-3 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 min-w-0">
              <button
                onClick={handleBackToFleet}
                className="sq-press p-1.5 rounded-xl border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
                title="Back to Fleet"
                aria-label="Back to Fleet"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center justify-center shrink-0" style={{ width: 28, height: 28 }}>
                <BrandLogo
                  brand={getBrandFromModel(selectedVehicle?.make || selectedVehicle?.model || '')}
                  size={24}
                  isDarkMode={isDarkMode}
                />
              </div>
              <h1 className="text-[18px] leading-[1.12] font-bold tracking-[-0.02em] text-foreground truncate">
                {selectedVehicle ? `${selectedVehicle.make ?? ''} ${selectedVehicle.model} ${selectedVehicle.year}`.trim() : '—'}
              </h1>

              {/* Inline meta: license · station (flat, no card wrappers) */}
              <div className="flex items-center gap-1.5 shrink-0 pl-1.5 ml-0.5 border-l border-border/60">
                <span
                  className="text-[11px] font-semibold tabular-nums text-foreground"
                  title="License"
                >
                  {selectedVehicle?.license || '—'}
                </span>
                <span aria-hidden className="text-muted-foreground/60">·</span>
                <span
                  className="text-[11px] font-medium text-muted-foreground"
                  title="Station"
                >
                  {selectedVehicle?.station || '—'}
                </span>
              </div>

              <div className="flex gap-1.5">
                <div className="relative">
                <button
                  onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                  className={`sq-press sq-chip ${
                    vehicleStatus === 'Available'
                      ? 'sq-chip-success'
                      : vehicleStatus === 'Manual Block'
                        ? 'sq-chip-critical'
                        : 'sq-chip-warning'
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
                  <ChevronDown className={`w-3 h-3 ml-0.5 transition-transform duration-200 ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isStatusDropdownOpen && (
                  <div className="sq-overlay animate-fade-up absolute top-full mt-1.5 left-0 z-50 min-w-[170px] p-1 rounded-xl">
                    <button
                      onClick={() => handleVehicleStatusChange('Available')}
                      className="w-full px-2.5 py-2 flex items-center gap-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-[color:var(--status-positive)]" />
                      <span className="text-[12px] font-medium text-foreground">Available</span>
                    </button>
                    <button
                      onClick={() => handleVehicleStatusChange('Manual Block')}
                      className="w-full px-2.5 py-2 flex items-center gap-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <XCircle className="w-3.5 h-3.5 text-[color:var(--status-critical)]" />
                      <span className="text-[12px] font-medium text-foreground">Manual Block</span>
                    </button>
                    <button
                      onClick={() => handleVehicleStatusChange('Maintenance')}
                      className="w-full px-2.5 py-2 flex items-center gap-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <Wrench className="w-3.5 h-3.5 text-[color:var(--status-attention)]" />
                      <span className="text-[12px] font-medium text-foreground">Maintenance</span>
                    </button>
                  </div>
                )}
                </div>

                {/* Cleaning Status Dropdown */}
                <div className="relative">
                <button
                  onClick={() => setIsCleaningDropdownOpen(!isCleaningDropdownOpen)}
                  className={`sq-press sq-chip ${cleaningStatus === 'Clean' ? 'sq-chip-info' : 'sq-chip-critical'}`}
                >
                  <Sparkles className="w-3 h-3" />
                  {cleaningStatus}
                  <ChevronDown className={`w-3 h-3 ml-0.5 transition-transform duration-200 ${isCleaningDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isCleaningDropdownOpen && (
                  <div className="sq-overlay animate-fade-up absolute top-full mt-1.5 left-0 z-50 min-w-[170px] p-1 rounded-xl">
                    <button
                      onClick={() => handleCleaningStatusChange('Clean')}
                      className="w-full px-2.5 py-2 flex items-center gap-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[color:var(--status-info)]" />
                      <span className="text-[12px] font-medium text-foreground">Clean</span>
                    </button>
                    <button
                      onClick={() => handleCleaningStatusChange('Needs Cleaning')}
                      className="w-full px-2.5 py-2 flex items-center gap-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-[color:var(--status-critical)]" />
                      <span className="text-[12px] font-medium text-foreground">Needs Cleaning</span>
                    </button>
                  </div>
                )}
                </div>

                <span className={`sq-chip ${
                  selectedVehicle?.healthStatus === 'Critical'
                    ? 'sq-chip-critical'
                    : selectedVehicle?.healthStatus === 'Warning'
                      ? 'sq-chip-warning'
                      : 'sq-chip-success'
                }`}>
                  <Heart className="w-3 h-3" />
                  {selectedVehicle?.healthStatus || 'Good Health'}
                </span>
              </div>
            </div>
            <VehicleConnectionBadge isDarkMode={isDarkMode} />
          </div>
        </div>
        )}

        {/* Tab Navigation - Only show for vehicle detail views */}
        {currentView !== 'dashboard' && currentView !== 'bookings' && currentView !== 'fleet' && currentView !== 'customers' && currentView !== 'customer-detail' && currentView !== 'tasks' && currentView !== 'invoices' && currentView !== 'fines' && currentView !== 'price-tariffs' && currentView !== 'analytics' && currentView !== 'settings' && currentView !== 'new-booking' && currentView !== 'stations' && currentView !== 'fleet-condition' && currentView !== 'document-upload' && currentView !== 'ai-assistant' && currentView !== 'support' && currentView !== 'help-center' && currentView !== 'workflow-automation' && currentView !== 'whatsapp-business' && currentView !== 'parts-accessories' && currentView !== 'ai-voice-assistant' && (
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
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setCurrentView(tab.key as typeof currentView)}
                  className={`px-3.5 py-1.5 rounded-[calc(var(--radius-md)-2px)] text-[12px] leading-[16.2px] font-semibold tracking-[-0.003em] whitespace-nowrap transition-all duration-200 ${
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
            onTripsLoaded={(trips) => {
              setTripsCount(trips.length);
              const names = [...new Set((trips as { driverName?: string }[]).map((t) => t.driverName).filter(Boolean))] as string[];
              setTripDriverOptions(names);
            }}
          />
        ) : currentView === 'stations' ? (
          <StationsTab isDarkMode={isDarkMode} />
        ) : currentView === 'dashboard' ? (
          <DashboardView
            isDarkMode={isDarkMode}
            onVehicleSelect={(vehicle) => { setSelectedVehicle(vehicle); setCurrentView('overview'); }}
            onItemHover={setHoveredVehicle}
            onOpenVehicleById={(vehicleId) => {
              const v = fleetVehicles.find((fv) => fv.id === vehicleId);
              if (v) { setSelectedVehicle(v); setCurrentView('overview'); }
            }}
            onOpenRentalView={(view) => setCurrentView(view)}
            onOpenBookingById={(bookingId) => {
              setPendingBookingDetailId(bookingId);
              setCurrentView('bookings');
            }}
          />
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
            bumpBookingsVersion();
          }} onBookingCancelled={(bookingId) => {
            setCreatedBookings(prev => prev.filter(b => b.id !== bookingId));
            bumpBookingsVersion();
          }} initialDetailBookingId={pendingBookingDetailId} onConsumeInitialDetailBookingId={() => setPendingBookingDetailId(null)} />
        ) : currentView === 'health-errors' ? (
          <HealthErrorsView isDarkMode={isDarkMode} vehicleId={selectedVehicle?.id} fuelType={selectedVehicle?.fuelType} />
        ) : currentView === 'rental-driving-analysis' ? (
          <RentalDrivingAnalysisView isDarkMode={isDarkMode} />
        ) : currentView === 'financial-insights' ? (
          /* V4.6.93 — Standalone Financial Insights page (replacement for the
             retired Dashboard Finances tab). Aggregates real invoice data
             (`/organizations/:orgId/invoices*`) end-to-end without mock
             fallbacks. Lives next to other Insights pages, not under Finance. */
          <FinancialInsightsView isDarkMode={isDarkMode} />
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
          <NewBookingView isDarkMode={isDarkMode} onBack={() => setCurrentView('bookings')} tariffs={tariffs} onCustomerCreated={(c) => setNewlyCreatedCustomers(prev => [c, ...prev])} onBookingCreated={(b) => { setCreatedBookings(prev => [b, ...prev]); bumpBookingsVersion(); }} />
        ) : (
          <>
        {/* Main Grid - Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {/* Left Column - Map and AI Summary */}
          <div className={"col-span-2 flex flex-col gap-3 transition-all duration-300"}>
            <OverviewLiveMapCard
              selectedVehicle={selectedVehicle}
              orgId={orgId}
              isDarkMode={isDarkMode}
            />

            {/* Vehicle Insights — data-driven operational widget */}
            <VehicleInsightsCard
              vehicleId={selectedVehicle?.id ?? null}
              isDarkMode={isDarkMode}
            />
          </div>

          {/* Right Column - Health Box */}
          <div className="flex flex-col gap-4">
            {/* Overall Health Box */}
            <div className="flex flex-col gap-4 h-full">
            {/* Box 1: Vehicle Health (Figma design) */}
            <VehicleHealthBoxTelemetryBridge
              selectedVehicle={selectedVehicle}
              isDarkMode={isDarkMode}
              onViewDetails={() => {
                if (selectedVehicle) {
                  setCurrentView('health-errors');
                }
              }}
            />

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
        bookingsVersion={bookingsVersion}
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
        isCollapsed={isRightSidebarCollapsed}
        onToggleCollapse={() => setIsRightSidebarCollapsed(prev => !prev)}
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
