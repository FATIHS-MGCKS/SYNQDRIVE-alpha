
import { Icon } from './components/ui/Icon';
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
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
import { FinancialInsightsView } from './components/FinancialInsightsView';
import { HealthErrorsView } from './components/HealthErrorsView';
import { FleetView } from './components/FleetView';
import { DamagesView } from './components/DamagesView';
import { DocumentsView } from './components/DocumentsView';
import { CustomersView } from './components/CustomersView';
import { SettingsView, StationsTab } from './components/SettingsView';
import { NewBookingView } from './components/NewBookingView';
import { FleetConditionDetailView } from './components/FleetConditionDetailView';
import { FleetConditionView, type ConditionCategory } from './components/FleetConditionView';
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
import { FleetProvider, useFleetVehicles, useEffectiveHealth } from './FleetContext';
import { collectRentalHealthReasons } from './rental-health-ui';
import { DashboardInsightsProvider } from './DashboardInsightsContext';
import { HandoverProvider } from './HandoverContext';
import { Toaster } from 'sonner';
import { LiveMapOverview } from './components/LiveMapOverview';
import { useLiveVehicleTelemetry } from './hooks/useLiveVehicleTelemetry';
import { useVehicleLiveMapStore } from './stores/useVehicleLiveMapStore';
import { useShallow } from 'zustand/react/shallow';
import { LanguageProvider } from './i18n/LanguageContext';
import { DocumentUploadView } from './components/DocumentUploadView';
import { AIAssistantView } from './components/AIAssistantView';
import { SupportView } from './components/SupportView';
import { HelpCenterView } from './components/HelpCenterView';
import { WorkflowAutomationView } from './components/WorkflowAutomationView';
import { WhatsAppBusinessView } from './components/WhatsAppBusinessView';
import { PartsAccessoriesView } from './components/PartsAccessoriesView';
import { InsurancesView } from './components/InsurancesView';
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
  const { status: rentalStatus, health: rentalHealth, loading: rentalHealthLoading } =
    useEffectiveHealth(vehicleId);
  const rentalReasons = collectRentalHealthReasons(rentalHealth);
  const rentalCriticalCount = rentalReasons.filter((r) => r.state === 'critical').length;
  const rentalWarningCount = rentalReasons.filter((r) => r.state === 'warning').length;
  const errorCodesRentalState = rentalHealth?.modules.error_codes?.state;

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

  // Critical / due-soon counts drive the overall status. Brakes use the generic
  // wear scale; battery and tires use their canonical status so Dashboard and
  // Health Tab always agree on the same green/amber/red state for a vehicle.
  const tireCanon = tires?.overallStatus ?? null;
  const brakeCritical = brakesTracked && brakesVal < 30;
  const tireCritical = tiresTracked && (tireCanon ? tireCanon === 'CRITICAL' : tiresVal < 30);
  const batteryCriticalFlag = batteryTracked && batteryCondition === 'attention';
  const brakeDueSoon = brakesTracked && brakesVal >= 30 && brakesVal < 60;
  const tireDueSoon = tiresTracked && (tireCanon ? (tireCanon === 'WARNING' || tireCanon === 'WATCH') : (tiresVal >= 30 && tiresVal < 60));
  const batteryDueSoonFlag = batteryTracked && batteryCondition === 'watch';
  const localCriticalCount = [brakeCritical, tireCritical, batteryCriticalFlag].filter(Boolean).length;
  const localDueSoonCount = [brakeDueSoon, tireDueSoon, batteryDueSoonFlag].filter(Boolean).length;
  const statCriticalCount = rentalHealth ? rentalCriticalCount : localCriticalCount;
  const statWarningCount = rentalHealth ? rentalWarningCount : localDueSoonCount;

  // Overall badge + summary tiles use Rental-Health-V1 (same map as Dashboard,
  // FleetView, header chip and Health tab) — not binary "any DTC = critical".
  type OverallState = 'insufficient' | 'good' | 'warning' | 'critical';
  const overallState: OverallState = (() => {
    if (rentalHealthLoading && !rentalHealth) return 'insufficient';
    if (rentalStatus === 'Critical') return 'critical';
    if (rentalStatus === 'Warning') return 'warning';
    if (rentalStatus === 'Good Health') return 'good';
    if (trackedCount === 0) return 'insufficient';
    return 'good';
  })();
  const overallStatusLabel = (() => {
    if (rentalHealthLoading && !rentalHealth) return 'Loading…';
    if (rentalStatus === 'Critical') return 'Critical';
    if (rentalStatus === 'Warning') return 'Warning';
    if (rentalStatus === 'Good Health') return 'Good Health';
    if (trackedCount === 0) return 'Insufficient Data';
    return 'Good Health';
  })();
  const overallTitle = (() => {
    const parts: string[] = [];
    if (rentalHealth?.rental_blocked && rentalHealth.blocking_reasons.length > 0) {
      parts.push(`Blocked: ${rentalHealth.blocking_reasons.join(' · ')}`);
    }
    for (const r of rentalReasons) {
      parts.push(`${r.label}: ${r.reason}`);
    }
    return parts.join(' · ') || undefined;
  })();
  const overallDot =
    overallState === 'insufficient'
      ? 'bg-[color:var(--status-nodata)]'
      : overallState === 'good'
      ? 'bg-[color:var(--status-positive)]'
      : overallState === 'warning'
      ? 'bg-[color:var(--status-watch)]'
      : 'bg-[color:var(--status-critical)]';
  const overallAccentRing =
    overallState === 'insufficient'
      ? 'sq-tone-nodata ring-[color:var(--status-nodata-soft)]'
      : overallState === 'good'
      ? 'sq-tone-success ring-[color:var(--status-positive-soft)]'
      : overallState === 'warning'
      ? 'sq-tone-watch ring-[color:var(--status-watch-soft)]'
      : 'sq-tone-critical ring-[color:var(--status-critical-soft)]';

  const getStatus = (v: number, tracked: boolean) => {
    if (!tracked) return { label: 'No Data', labelColor: 'text-muted-foreground', bar: 'bg-muted' };
    if (v >= 80) return { label: 'Excellent', labelColor: 'text-[color:var(--status-positive)]', bar: 'bg-[color:var(--status-positive)]' };
    if (v >= 60) return { label: 'Monitor', labelColor: 'text-[color:var(--status-watch)]', bar: 'bg-[color:var(--status-watch)]' };
    if (v >= 30) return { label: 'Due soon', labelColor: 'text-[color:var(--status-warning)]', bar: 'bg-[color:var(--status-warning)]' };
    return { label: 'Critical', labelColor: 'text-[color:var(--status-critical)]', bar: 'bg-[color:var(--status-critical)]' };
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
    if (!tracked) return { label: 'No Data', labelColor: 'text-muted-foreground', bar: 'bg-muted' };
    if (condition === 'good') return { label: 'Healthy', labelColor: 'text-[color:var(--status-positive)]', bar: 'bg-[color:var(--status-positive)]' };
    if (condition === 'watch') return { label: 'Monitor', labelColor: 'text-[color:var(--status-watch)]', bar: 'bg-[color:var(--status-watch)]' };
    if (condition === 'attention') return { label: 'Attention', labelColor: 'text-[color:var(--status-critical)]', bar: 'bg-[color:var(--status-critical)]' };
    if (voltageV != null) {
      if (voltageV < 12.0) return { label: 'Attention', labelColor: 'text-[color:var(--status-critical)]', bar: 'bg-[color:var(--status-critical)]' };
      if (voltageV < 12.4) return { label: 'Monitor', labelColor: 'text-[color:var(--status-watch)]', bar: 'bg-[color:var(--status-watch)]' };
      return { label: 'Healthy', labelColor: 'text-[color:var(--status-positive)]', bar: 'bg-[color:var(--status-positive)]' };
    }
    if (v < 50) return { label: 'Attention', labelColor: 'text-[color:var(--status-critical)]', bar: 'bg-[color:var(--status-critical)]' };
    if (v < 75) return { label: 'Monitor', labelColor: 'text-[color:var(--status-watch)]', bar: 'bg-[color:var(--status-watch)]' };
    return { label: 'Healthy', labelColor: 'text-[color:var(--status-positive)]', bar: 'bg-[color:var(--status-positive)]' };
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
  const tuvImminent = !tuvOverdue && tuvDays != null && tuvDays >= 0 && tuvDays <= 60;
  const bokraftDate = service?.bokraftValidTill
    ? new Date(service.bokraftValidTill).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;
  const bokraftOverdue = service?.bokraftOverdue === true;
  const bokraftDays = service?.bokraftRemainingDays ?? null;
  const bokraftImminent = !bokraftOverdue && bokraftDays != null && bokraftDays >= 0 && bokraftDays <= 60;

  const divider = <div className="border-t my-3 border-border" />;

  return (
    <div className={`group relative flex h-full flex-col rounded-xl p-3 border transition-shadow duration-300 ease-[var(--ease-out-soft)] hover:shadow-md ${
      'border-border bg-card text-foreground shadow-sm'
    }`}>
      <style>{`
        @keyframes barFillUp { from { width: 0%; } }
        @keyframes calibDots { 0%,20%{opacity:.2} 50%{opacity:1} 100%{opacity:.2} }
      `}</style>

      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className={`text-[11px] font-bold tracking-[-0.01em] ${'text-foreground'}`}>Vehicle Health</h3>
          <span
            title={overallTitle}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ring-1 ${overallAccentRing}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${overallDot}`} />
            {overallStatusLabel}
          </span>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold ${'text-muted-foreground'}`}>
          {trackedCount}/3 tracked
        </span>
      </div>

      <div className="mb-2.5 grid grid-cols-3 gap-1.5">
        {([
          {
            label: 'Critical',
            value: statCriticalCount,
            tone: statCriticalCount > 0
              ? 'border-transparent sq-tone-critical'
              : 'border-transparent sq-tone-success',
          },
          {
            label: 'Due soon',
            value: statWarningCount,
            tone: statWarningCount > 0
              ? 'border-transparent sq-tone-watch'
              : 'border-border bg-muted/40 text-muted-foreground',
          },
          {
            label: 'Faults',
            value: dtcCount,
            tone:
              dtcCount === 0
                ? 'border-border bg-muted/40 text-muted-foreground'
                : errorCodesRentalState === 'critical'
                  ? 'border-transparent sq-tone-critical'
                  : 'border-transparent sq-tone-watch',
          },
        ] as const).map((stat) => (
          <div key={stat.label} className={`rounded-[10px] border px-1.5 py-1.5 text-center ${stat.tone}`}>
            <div className="font-mono text-[15px] font-bold leading-none tabular-nums">{stat.value}</div>
            <div className="mt-0.5 truncate text-[9px] font-semibold leading-none tracking-[-0.01em]">{stat.label}</div>
          </div>
        ))}
      </div>
      {untrackedCount > 0 && (
        <div className="mb-2 flex items-start gap-1.5 rounded-[10px] border border-transparent px-2 py-1.5 sq-tone-info">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span className="text-[9.5px] leading-snug">
            {untrackedCount} of 3 health dimensions untracked — enable tracking for accurate results.
          </span>
        </div>
      )}

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
          // The 12V battery never shows an SOH %; its status word (with colour)
          // already conveys watch/attention, so it gets no separate badge.
          const showBadge =
            !isCalibrating && !isStabilizing && !isUntracked &&
            item.key !== 'battery' && item.value < 60;
          return (
            <div key={item.key} className={`rounded-[13px] border border-border bg-muted/40 px-2 py-2 transition-colors ${isUntracked ? 'opacity-70' : ''}`}>
              <div className="flex gap-2.5 items-center">
              <div className={`w-8 h-8 rounded-[10px] border border-border bg-card flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[10px] font-bold flex-1 tracking-[-0.01em] ${'text-foreground'}`}>{item.label}</span>
                  {isCalibrating && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${'sq-tone-info border-transparent'}`}>
                      Calibrating
                      <span className="inline-flex ml-0.5">
                        {[0, 1, 2].map(i => <span key={i} className="inline-block w-1 h-1 rounded-full mx-px" style={{ backgroundColor: 'currentColor', animation: `calibDots 1.4s infinite ${i * 0.2}s` }} />)}
                      </span>
                    </span>
                  )}
                  {isStabilizing && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${'sq-tone-watch border-transparent'}`}>Estimated</span>
                  )}
                  {isUntracked && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${'sq-tone-neutral border-transparent'}`}>No Data</span>
                  )}
                  {showBadge && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${
                      item.key === 'battery'
                        ? (batteryCondition === 'attention'
                            ? 'sq-tone-critical border-transparent'
                            : 'sq-tone-watch border-transparent')
                        : (item.value < 30 ? 'sq-tone-critical border-transparent' : 'sq-tone-watch border-transparent')
                    }`}>{st.label}</span>
                  )}
                  {isCalibrating ? (
                    <span className={`font-mono text-xs ${'text-muted-foreground'}`}>—</span>
                  ) : isUntracked ? (
                    <span className={`font-mono text-xs ${'text-muted-foreground'}`}>—</span>
                  ) : item.key === 'battery' ? (
                    // LV "Estimated Battery Health" — status word, not an SOH %.
                    <span className={`text-[10px] font-bold tracking-[-0.01em] ${st.labelColor}`}>{isStabilizing ? `~${st.label}` : st.label}</span>
                  ) : (
                    <span className={`font-mono text-[10px] font-bold tabular-nums ${isStabilizing ? 'text-foreground/70' : 'text-foreground'}`}>{item.value > 0 ? `${isStabilizing ? '~' : ''}${Math.round(item.value)}%` : '—'}</span>
                  )}
                </div>
                {isCalibrating ? (
                  <div className={`w-full rounded-full h-2 overflow-hidden ${'bg-muted'}`}>
                    <div className="h-full rounded-full bg-[color:var(--status-info-soft)]" style={{ width: '30%', animation: `barFillUp 2s cubic-bezier(0.16,1,0.3,1) infinite alternate` }} />
                  </div>
                ) : isUntracked ? (
                  <div className={`w-full rounded-full h-2 ${'bg-muted'}`}>
                    <div className="h-full rounded-full bg-muted" style={{ width: '100%' }} />
                  </div>
                ) : (
                  <div className={`w-full rounded-full h-2 overflow-hidden ${'bg-muted'}`}>
                    <div className={`h-full rounded-full ${isStabilizing ? 'bg-[color:var(--status-watch)]' : st.bar}`}
                      style={{ width: `${Math.min(item.value, 100)}%`, animation: `barFillUp 0.8s cubic-bezier(0.16,1,0.3,1) ${idx * 0.15}s both` }}
                    />
                  </div>
                )}
                <div className="flex items-baseline gap-1 mt-0.5">
                  {isCalibrating ? (
                    <span className="text-[10px] text-[color:var(--status-info)]">Initial calibration in progress</span>
                  ) : isStabilizing ? (
                    <>
                      <span className="text-[10px] font-semibold text-[color:var(--status-watch)]">Estimated SOH</span>
                      <span className={`text-[10px] ${'text-muted-foreground'}`}>· {item.detail}</span>
                    </>
                  ) : isUntracked ? (
                    <span className={`text-[10px] ${'text-muted-foreground'}`}>Enable tracking for accurate health data</span>
                  ) : (
                    <>
                      <span className={`text-[10px] font-semibold ${st.labelColor}`}>{item.value > 0 ? st.label : ''}</span>
                      <span className={`text-[10px] ${'text-muted-foreground'}`}>· {item.detail}</span>
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
          if (tone === 'alert') return 'bg-[color:var(--status-watch-soft)]';
          if (tone === 'ok') return 'bg-[color:var(--status-positive-soft)]';
          if (tone === 'muted') return 'bg-muted';
          return 'bg-muted';
        };

        return (
          <>
            <div className="mb-2">
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`text-[10px] font-semibold ${'text-foreground'}`}>Tacho Warnleuchten</span>
                {activeAlerts > 0 ? (
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${'sq-tone-watch'}`}>
                    {activeAlerts} aktiv
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold border sq-tone-success">
                    Alle aus
                  </span>
                )}
                {freshness === 'stale' && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-[color:var(--status-watch)]">
                    <Icon name="alert-triangle" className="w-2.5 h-2.5" />
                    Veraltet
                  </span>
                )}
                {lastUpdateLabel && freshness !== 'stale' && (
                  <span className={`ml-auto text-[9px] ${'text-muted-foreground'}`}>{lastUpdateLabel}</span>
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
                        ? 'border-[color:var(--status-watch-soft)] hover:bg-[color:var(--status-watch-soft)]'
                        : 'border-border hover:bg-muted'
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
                        ? 'text-[color:var(--status-watch)] font-semibold'
                        : 'text-muted-foreground'
                    }`}>{it.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {divider}
          </>
        );
      })()}

      {/* Compliance & Service Tracking
          Three discrete tracking dimensions from the health module:
          Service (manufacturer maintenance interval), TÜV (HU/AU
          Hauptuntersuchung) and BOKraft (commercial passenger transport
          permit). Each tile uses the same critical/imminent/normal tone
          logic so operators can scan all three deadlines at a glance. */}
      <div className="grid grid-cols-3 gap-1.5">
        {(() => {
          type Tone = 'critical' | 'imminent' | 'normal' | 'muted';
          const toneRing = (tone: Tone): string => {
            if (tone === 'critical') return 'border-transparent bg-[color:var(--status-critical-soft)]';
            if (tone === 'imminent') return 'border-transparent bg-[color:var(--status-watch-soft)]';
            if (tone === 'muted') return 'border-border bg-muted/40';
            return 'border-border bg-card';
          };
          const toneIcon = (tone: Tone): string => {
            if (tone === 'critical') return 'text-[color:var(--status-critical)]';
            if (tone === 'imminent') return 'text-[color:var(--status-watch)]';
            if (tone === 'muted') return 'text-muted-foreground';
            return 'text-[color:var(--brand)]';
          };
          const toneTitle = (tone: Tone): string => {
            if (tone === 'critical') return 'text-[color:var(--status-critical)]';
            if (tone === 'imminent') return 'text-[color:var(--status-watch)]';
            if (tone === 'muted') return 'text-muted-foreground';
            return 'text-foreground';
          };
          const toneValue = (tone: Tone): string => {
            if (tone === 'critical') return 'text-[color:var(--status-critical)]';
            if (tone === 'imminent') return 'text-[color:var(--status-watch)]';
            if (tone === 'muted') return 'text-muted-foreground';
            return 'text-foreground/90';
          };

          const svcTone: Tone = svcOverdue ? 'critical' : svcImminent ? 'imminent' : (svcRemDays != null || service?.lastServiceDate) ? 'normal' : 'muted';
          const tuvTone: Tone = tuvOverdue ? 'critical' : tuvImminent ? 'imminent' : tuvDate ? 'normal' : 'muted';
          const bokraftTone: Tone = bokraftOverdue ? 'critical' : bokraftImminent ? 'imminent' : bokraftDate ? 'normal' : 'muted';

          const svcStatusText = (() => {
            if (svcOverdue) {
              const parts: string[] = [];
              if (svcOverdueDays != null) parts.push(`${svcOverdueDays}d`);
              if (svcOverdueKm != null) parts.push(`${svcOverdueKm.toLocaleString('de-DE')} km`);
              return parts.length ? `−${parts.join(' / ')}` : 'Überfällig';
            }
            if (svcRemDays != null) {
              if (svcRemDays <= 90) return `in ${svcRemDays} T`;
              return `in ${svcRemMonths ?? Math.round(svcRemDays / 30)} M`;
            }
            if (service?.lastServiceDate) return `zuletzt ${new Date(service.lastServiceDate).toLocaleDateString('de-DE', { month: '2-digit', year: '2-digit' })}`;
            return 'Kein Tracking';
          })();
          const svcSubText = (() => {
            if (svcOverdue) return 'überfällig';
            if (svcRemKm != null && svcRemKm >= 0) return `${svcRemKm.toLocaleString('de-DE')} km`;
            if (service?.intervalMonths != null) return `Intervall ${service.intervalMonths} M`;
            return 'Service';
          })();

          const tuvStatusText = (() => {
            if (tuvOverdue && tuvDays != null) return `−${Math.abs(tuvDays)} T`;
            if (tuvOverdue) return 'Abgelaufen';
            if (tuvDate) return tuvDate;
            return 'Kein Tracking';
          })();
          const tuvSubText = (() => {
            if (tuvOverdue) return 'HU abgelaufen';
            if (tuvDays != null && tuvDays >= 0) return `noch ${tuvDays} T`;
            return 'Hauptuntersuchung';
          })();

          const bokraftStatusText = (() => {
            if (bokraftOverdue && bokraftDays != null) return `−${Math.abs(bokraftDays)} T`;
            if (bokraftOverdue) return 'Abgelaufen';
            if (bokraftDate) return bokraftDate;
            return 'Kein Tracking';
          })();
          const bokraftSubText = (() => {
            if (bokraftOverdue) return 'BOKraft abgelaufen';
            if (bokraftDays != null && bokraftDays >= 0) return `noch ${bokraftDays} T`;
            return 'Personenbeförderung';
          })();

          const items: Array<{
            key: string;
            label: string;
            icon: ReactNode;
            tone: Tone;
            status: string;
            sub: string;
          }> = [
            {
              key: 'service',
              label: 'Service',
              icon: <Icon name="wrench" className={`w-3 h-3 ${toneIcon(svcTone)}`} />,
              tone: svcTone,
              status: svcStatusText,
              sub: svcSubText,
            },
            {
              key: 'tuv',
              label: 'TÜV',
              icon: <Icon name="clipboard-list" className={`w-3 h-3 ${toneIcon(tuvTone)}`} />,
              tone: tuvTone,
              status: tuvStatusText,
              sub: tuvSubText,
            },
            {
              key: 'bokraft',
              label: 'BOKraft',
              icon: <Icon name="file-text" className={`w-3 h-3 ${toneIcon(bokraftTone)}`} />,
              tone: bokraftTone,
              status: bokraftStatusText,
              sub: bokraftSubText,
            },
          ];

          return items.map(it => (
            <div
              key={it.key}
              className={`rounded-[10px] border px-2 py-1.5 transition-colors ${toneRing(it.tone)} ${it.tone === 'muted' ? 'opacity-80' : ''}`}
            >
              <div className="mb-1 flex items-center gap-1">
                {it.icon}
                <span className={`text-[10px] font-bold tracking-[-0.01em] ${toneTitle(it.tone)}`}>{it.label}</span>
              </div>
              <div className={`text-[10.5px] font-bold leading-none tabular-nums ${toneValue(it.tone)}`}>{it.status}</div>
              <div className={`mt-0.5 truncate text-[9px] leading-none ${'text-muted-foreground'}`} title={it.sub}>
                {it.sub}
              </div>
            </div>
          ));
        })()}
      </div>

      {divider}

      {/* Footer CTAs */}
      <div className="pt-1">
        <button
          onClick={onViewDetails}
          className="group flex w-full items-center justify-between rounded-[12px] px-2.5 py-2 text-[11px] font-bold transition-[background-color,color,transform] duration-300 ease-[var(--ease-out-soft)] active:scale-[0.99] sq-tone-brand hover:opacity-90"
        >
          <span>View Health Details</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-0.5 bg-[color:var(--card)]/70">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </button>
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

function VehicleConnectionBadge() {
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
      ? 'text-[color:var(--status-positive)] fill-[color:var(--status-positive)] animate-online-pulse'
      : connState === 'standby'
      ? 'text-[color:var(--status-watch)] fill-[color:var(--status-watch)]'
      : 'text-muted-foreground fill-[color:var(--status-nodata)]';
  const labelColor =
    connState === 'online'
      ? 'text-[color:var(--status-positive)]'
      : connState === 'standby'
      ? 'text-[color:var(--status-watch)]'
      : 'text-muted-foreground';
  const label =
    connState === 'online'
      ? 'Online'
      : connState === 'standby'
      ? 'Standby'
      : 'Offline';

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

        <div className="absolute bottom-0 left-0 right-0 p-2 opacity-85 group-hover:opacity-100 transition-opacity duration-700 ease-[var(--ease-out-soft)]">
          <div className="sq-map-liquid-glass rounded-xl p-1.5">
            {(() => {
              const stateLabel = liveTelemetry.displayState;
              const stateColor =
                stateLabel === 'MOVING'
                  ? 'text-[color:var(--status-positive)]'
                  : stateLabel === 'IDLE'
                  ? 'text-[color:var(--status-watch)]'
                  : 'text-muted-foreground';
              return (
                <div className="grid grid-cols-3 gap-1">
                  <div className="sq-map-liquid-tile flex flex-col items-center justify-center rounded-[10px] px-1 py-1">
                    <Icon name="circle" className={`w-2.5 h-2.5 mb-0.5 ${stateColor}`} />
                    <span className={`text-[8px] mb-0 ${'text-muted-foreground'}`}>
                      State
                    </span>
                    <span className={`text-[10px] font-bold ${stateColor}`}>{stateLabel}</span>
                  </div>

                  <div className="sq-map-liquid-tile flex flex-col items-center justify-center rounded-[10px] px-1 py-1">
                    <Icon name="droplet"
                      className="w-2.5 h-2.5 mb-0.5 text-[color:var(--status-positive)]"
                    />
                    <span className={`text-[8px] mb-0 ${'text-muted-foreground'}`}>
                      {selectedVehicle?.isElectric ? 'Energy' : 'Fuel'}
                    </span>
                    <span className={`text-[10px] font-bold ${'text-foreground'}`}>
                      {Math.round(
                        selectedVehicle?.isElectric
                          ? (liveTelemetry.snapshot?.battery ?? selectedVehicle?.battery ?? 0)
                          : (liveTelemetry.snapshot?.fuel ?? selectedVehicle?.fuel ?? 0),
                      )}
                      <span className="text-[8px] font-normal text-muted-foreground">%</span>
                    </span>
                  </div>

                  <div className="sq-map-liquid-tile flex flex-col items-center justify-center rounded-[10px] px-1 py-1">
                    <Icon name="gauge" className="w-2.5 h-2.5 text-muted-foreground mb-0.5" />
                    <span className={`text-[8px] mb-0 ${'text-muted-foreground'}`}>
                      Odometer
                    </span>
                    <span className={`text-[10px] font-bold ${'text-foreground'}`}>
                      {selectedVehicle
                        ? (liveTelemetry.snapshot?.odometer ?? selectedVehicle.odometer).toLocaleString('de-DE')
                        : '—'}{' '}
                      <span className="text-[8px] font-normal text-muted-foreground">km</span>
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

// V4.7.23 — Vehicle-Detail header health chip. Reads the canonical
// Rental-Health-V1 status from the shared FleetProvider map so the
// header pill never disagrees with FleetView, FleetCondition or the
// Dashboard popups. Falls back to a neutral "Loading…" pill while the
// batched health request is in flight.
function VehicleHealthChip({ vehicleId }: { vehicleId: string | null }) {
  const { status, health } = useEffectiveHealth(vehicleId);
  const reasons: string[] = [];
  if (health?.rental_blocked && health.blocking_reasons.length > 0) {
    reasons.push(`Blocked: ${health.blocking_reasons.join(' · ')}`);
  }
  if (health) {
    for (const [name, mod] of Object.entries(health.modules)) {
      if (mod.state === 'critical' || mod.state === 'warning') {
        reasons.push(`${name.replace(/_/g, ' ')}: ${mod.reason}`);
      }
    }
  }
  const title = reasons.join(' · ') || undefined;
  if (status === 'Critical') {
    return (
      <span title={title} className="sq-chip sq-chip-critical">
        <Icon name="heart" className="w-3 h-3" /> Critical
      </span>
    );
  }
  if (status === 'Warning') {
    return (
      <span title={title} className="sq-chip sq-chip-warning">
        <Icon name="heart" className="w-3 h-3" /> Warning
      </span>
    );
  }
  if (status === 'Good Health') {
    return (
      <span title={title} className="sq-chip sq-chip-success">
        <Icon name="heart" className="w-3 h-3" /> Good Health
      </span>
    );
  }
  return (
    <span title="Loading rental health…" className="sq-chip sq-chip-neutral">
      <Icon name="heart" className="w-3 h-3" /> Loading…
    </span>
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
  const [currentView, setCurrentView] = useState<'overview' | 'trips' | 'dashboard' | 'bookings' | 'health-errors' | 'fleet' | 'damages' | 'documents' | 'customers' | 'customer-detail' | 'tasks' | 'vendor-management' | 'vendor-detail' | 'invoices' | 'fines' | 'price-tariffs' | 'financial-insights' | 'settings' | 'new-booking' | 'stations' | 'vehicle-bookings' | 'vehicle-tasks' | 'document-upload' | 'ai-assistant' | 'support' | 'help-center' | 'fleet-condition' | 'fleet-condition-detail' | 'workflow-automation' | 'whatsapp-business' | 'parts-accessories' | 'insurances' | 'ai-voice-assistant'>('dashboard');
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [detailVendorId, setDetailVendorId] = useState<string | null>(null);
  // V4.6.99 — Pending Booking-Detail-Id für die Cross-View-Navigation
  // (Dashboard → BookingsView → Detail-Seite). Wird gesetzt, wenn ein
  // BK-Chip in einer StatInlineDetail-Karte geklickt wird; BookingsView
  // konsumiert das Feld in einem useEffect und setzt anschliessend
  // `setPendingBookingDetailId(null)` über den Reset-Callback zurück.
  const [pendingBookingDetailId, setPendingBookingDetailId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'account' | 'company' | 'fleet-connection' | 'users' | 'billing' | 'data-authorization' | 'legal-documents'>('company');
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
  const showVehicleDetailChrome = VEHICLE_DETAIL_VIEWS.has(currentView);
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
        {/* Larger gutters + breathable top/bottom rhythm. The content column is
            centered (mx-auto) inside the full remaining width so the left/right
            margins stay symmetric now that the right sidebar is gone. */}
        <div className="flex-1 overflow-auto px-5 sm:px-7 lg:px-[100px] pt-4 lg:pt-6 pb-8 text-foreground">
          <div className="max-w-[1440px] mx-auto text-[13px]">
            <TopBar isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} currentView={currentView} settingsTab={settingsTab} selectedVehicle={selectedVehicle} activeBookingRef={activeBookingRef} detailCustomerId={detailCustomerId} onViewChange={setCurrentView} onVehicleSelect={setSelectedVehicle} onSettingsTabChange={setSettingsTab} onFinanceTabChange={setFinanceTab} onTasksTabChange={setTasksSectionTab} />
        {/* Header Section - Only show for vehicle detail views */}
        {showVehicleDetailChrome && (
        <div className="mb-3 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 min-w-0">
              <button
                onClick={handleBackToFleet}
                className="sq-press p-1.5 rounded-xl border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
                title="Back to Fleet"
                aria-label="Back to Fleet"
              >
                <Icon name="arrow-left" className="w-4 h-4" />
              </button>
              <div className="flex items-center justify-center shrink-0" style={{ width: 28, height: 28 }}>
                <BrandLogo
                  brand={getBrandFromModel(selectedVehicle?.make || selectedVehicle?.model || '')}
                  size={24}
                  isDarkMode={isDarkMode}
                />
              </div>
              <h1 className="text-[12px] leading-[1.12] font-bold tracking-[-0.02em] text-foreground truncate">
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
                    <Icon name="check-circle" className="w-3 h-3" />
                  ) : vehicleStatus === 'Manual Block' ? (
                    <Icon name="x-circle" className="w-3 h-3" />
                  ) : (
                    <Icon name="wrench" className="w-3 h-3" />
                  )}
                  {vehicleStatus}
                  <Icon name="chevron-down" className={`w-3 h-3 ml-0.5 transition-transform duration-200 ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
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

                {/* Cleaning Status Dropdown */}
                <div className="relative">
                <button
                  onClick={() => setIsCleaningDropdownOpen(!isCleaningDropdownOpen)}
                  className={`sq-press sq-chip ${cleaningStatus === 'Clean' ? 'sq-chip-info' : 'sq-chip-critical'}`}
                >
                  <Icon name="sparkles" className="w-3 h-3" />
                  {cleaningStatus}
                  <Icon name="chevron-down" className={`w-3 h-3 ml-0.5 transition-transform duration-200 ${isCleaningDropdownOpen ? 'rotate-180' : ''}`} />
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

                <VehicleHealthChip vehicleId={selectedVehicle?.id ?? null} />
              </div>
            </div>
            <VehicleConnectionBadge />
          </div>
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
          <VehicleBookingsView isDarkMode={isDarkMode} vehicle={selectedVehicle} />
        ) : currentView === 'vehicle-tasks' ? (
          <VehicleTasksView isDarkMode={isDarkMode} vehicle={selectedVehicle} />
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
        ) : currentView === 'fleet-condition' ? (
          <FleetConditionView
            isDarkMode={isDarkMode}
            onDrillDown={(vehicleId, category) => {
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
                className="flex-1 px-3 py-2 rounded-md font-semibold text-white transition-all duration-200 shadow-sm sq-press bg-[color:var(--status-watch)] hover:opacity-90"
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
