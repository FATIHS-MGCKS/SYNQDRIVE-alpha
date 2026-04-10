import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle, Battery, Disc,
  Gauge, Car, ChevronRight, Activity, CircleDot, Zap, ArrowUpDown,
  Calendar, Wrench, MessageSquare, Bell, AlertCircle, Clock
} from 'lucide-react';
import { VehicleData, getShortModel } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { BrandLogo, getBrandFromModel } from './BrandLogo';
import {
  api,
  type TireHealthSummaryResponse,
  type BrakeStatus,
  type BatteryHealthSummary,
  type ServiceInfoStatus,
} from '../../lib/api';
import { EuromasterServiceRequestModal, type ServiceRequestPrefill } from './euromaster/EuromasterServiceRequestModal';
import { useEuromasterIntegration } from './euromaster/useEuromasterIntegration';

export type ConditionCategory = 'tires' | 'brakes' | 'battery' | 'dtc' | 'service' | 'tuev' | 'bokraft' | 'driver-feedback' | 'alerts';

interface FleetConditionViewProps {
  isDarkMode: boolean;
  onDrillDown?: (vehicleId: string, category: ConditionCategory) => void;
}

type HealthCategory = 'all' | 'Good Health' | 'Warning' | 'Critical';

interface VehicleConditionData {
  tires: TireHealthSummaryResponse | null;
  brakes: BrakeStatus | null;
  battery: BatteryHealthSummary | null;
  service: ServiceInfoStatus | null;
  dtcActive: any[];
  dtcStats: { total?: number; lastChecked?: string } | null;
}

function getHealthColor(status: string, isDark: boolean): string {
  if (status === 'Critical') return isDark ? 'text-red-400' : 'text-red-500';
  if (status === 'Warning') return isDark ? 'text-amber-400' : 'text-amber-500';
  return isDark ? 'text-emerald-400' : 'text-emerald-500';
}

function getHealthBg(status: string, isDark: boolean): string {
  if (status === 'Critical') return isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200/60';
  if (status === 'Warning') return isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200/60';
  return isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200/60';
}

function getProgressColor(value: number): string {
  if (value >= 70) return 'bg-emerald-500';
  if (value >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function getProgressTrack(isDark: boolean): string {
  return isDark ? 'bg-neutral-700/50' : 'bg-gray-200/80';
}

function getMetricColor(value: number, isDark: boolean): string {
  if (value >= 70) return isDark ? 'text-emerald-400' : 'text-emerald-500';
  if (value >= 40) return isDark ? 'text-amber-400' : 'text-amber-500';
  return isDark ? 'text-red-400' : 'text-red-500';
}

function formatRemainingTime(months: number | null): string {
  if (months == null) return '—';
  if (months < 0) return 'Overdue';
  const m = Math.round(months);
  if (m >= 12) return `${Math.floor(m / 12)}y ${m % 12}mo`;
  return `${m} months`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function FleetConditionView({ isDarkMode, onDrillDown }: FleetConditionViewProps) {
  const { fleetVehicles } = useFleetVehicles();
  const { orgId } = useRentalOrg();
  const [filterCategory, setFilterCategory] = useState<HealthCategory>('all');
  const [conditionData, setConditionData] = useState<Record<string, VehicleConditionData>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [emModalOpen, setEmModalOpen] = useState(false);
  const [emPrefill, setEmPrefill] = useState<ServiceRequestPrefill | undefined>(undefined);
  const emState = useEuromasterIntegration();

  const openEuromasterForVehicle = useCallback((vehicle: VehicleData) => {
    setEmPrefill({
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.license,
      vehicleMake: vehicle.make ?? undefined,
      vehicleModel: vehicle.model,
      mileageKm: vehicle.odometer,
      context: 'fleet-condition',
    });
    setEmModalOpen(true);
  }, []);

  const isDark = isDarkMode;

  const totalCount = fleetVehicles.length;
  const goodCount = fleetVehicles.filter(v => v.healthStatus === 'Good Health').length;
  const warningCount = fleetVehicles.filter(v => v.healthStatus === 'Warning').length;
  const criticalCount = fleetVehicles.filter(v => v.healthStatus === 'Critical').length;

  const filtered = useMemo(() =>
    fleetVehicles.filter(v => filterCategory === 'all' || v.healthStatus === filterCategory),
    [fleetVehicles, filterCategory]
  );

  const loadVehicleCondition = useCallback(async (vehicleId: string) => {
    if (conditionData[vehicleId] || loadingIds.has(vehicleId)) return;
    setLoadingIds(prev => new Set(prev).add(vehicleId));
    try {
      const [tires, brakes, battery, service, dtcActive, dtcStats] = await Promise.all([
        api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.brakeStatus(vehicleId).catch(() => null),
        api.vehicleIntelligence.batteryHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.serviceInfoStatus(vehicleId).catch(() => null),
        api.vehicleIntelligence.dtcActive(vehicleId).catch(() => []),
        api.vehicleIntelligence.dtcStats(vehicleId).catch(() => null),
      ]);
      setConditionData(prev => ({
        ...prev,
        [vehicleId]: { tires, brakes, battery, service, dtcActive: Array.isArray(dtcActive) ? dtcActive : [], dtcStats },
      }));
    } catch {
      /* keep current state */
    } finally {
      setLoadingIds(prev => { const n = new Set(prev); n.delete(vehicleId); return n; });
    }
  }, [conditionData, loadingIds]);

  useEffect(() => {
    filtered.forEach(v => loadVehicleCondition(v.id));
  }, [filtered.map(v => v.id).join(',')]);

  const cardClass = `rounded-2xl border shadow-sm ${
    isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
  }`;
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';
  const textMuted = isDark ? 'text-gray-500' : 'text-gray-400';

  return (
    <div className="space-y-5">
      {/* ─── Header ─── */}
      <div>
        <h1 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Fleet Condition</h1>
        <p className={`text-xs mt-1 ${textSecondary}`}>Predictive maintenance analysis, wear projection, and operational control</p>
      </div>

      {/* Service Partner CTA */}
      <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${isDarkMode ? 'bg-red-500/5 border border-red-500/10' : 'bg-red-50/50 border border-red-100'}`}>
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-red-500" />
          <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Fleet maintenance needs? Plan with your service partner</span>
        </div>
        <button
          onClick={() => { setEmPrefill({ context: 'fleet-condition' }); setEmModalOpen(true); }}
          disabled={!emState.canCreateCase}
          className={`px-3 py-1 text-[10px] font-semibold rounded-lg transition-colors ${
            emState.canCreateCase
              ? 'text-white bg-red-600 hover:bg-red-700'
              : isDarkMode ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Euromaster →
        </button>
      </div>

      {/* ─── Top Stats ─── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className={`${cardClass} p-4`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-semibold ${textSecondary}`}>Total Fleet</span>
            <Car className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
          </div>
          <span className={`text-3xl font-bold tracking-tight ${textPrimary}`}>{totalCount}</span>
          <p className={`text-[10px] mt-1 ${textMuted}`}>vehicles monitored</p>
        </div>
        {[
          { label: 'Healthy', count: goodCount, status: 'Good Health' as HealthCategory, icon: CheckCircle, cls: isDark ? 'text-emerald-400' : 'text-emerald-500', ring: 'ring-emerald-500/40' },
          { label: 'Warning', count: warningCount, status: 'Warning' as HealthCategory, icon: AlertTriangle, cls: isDark ? 'text-amber-400' : 'text-amber-500', ring: 'ring-amber-500/40' },
          { label: 'Critical', count: criticalCount, status: 'Critical' as HealthCategory, icon: ShieldAlert, cls: isDark ? 'text-red-400' : 'text-red-500', ring: 'ring-red-500/40' },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => setFilterCategory(filterCategory === s.status ? 'all' : s.status)}
            className={`${cardClass} p-4 text-left transition-all hover:scale-[1.01] ${filterCategory === s.status ? `ring-2 ${s.ring}` : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold ${textSecondary}`}>{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.cls}`} />
            </div>
            <span className={`text-3xl font-bold tracking-tight ${textPrimary}`}>{s.count}</span>
            <p className={`text-[10px] mt-1 ${s.cls} font-medium`}>
              {s.count > 0
                ? `${Math.round((s.count / Math.max(totalCount, 1)) * 100)}% of fleet`
                : s.label === 'Critical' ? 'All clear' : 'None'}
            </p>
          </button>
        ))}
      </div>

      {/* ─── Filter Bar ─── */}
      <div className={`${cardClass} px-4 py-3 flex items-center justify-between`}>
        <h3 className={`text-sm font-semibold ${textPrimary}`}>
          Vehicle Condition Details
          {filterCategory !== 'all' && <span className={`ml-2 text-xs font-normal ${textMuted}`}>({filterCategory})</span>}
        </h3>
        <div className="flex gap-1.5">
          {(['all', 'Good Health', 'Warning', 'Critical'] as HealthCategory[]).map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterCategory === cat
                ? 'bg-blue-600 text-white shadow-sm'
                : isDark ? 'bg-neutral-800 text-gray-400 hover:text-white' : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}>
              {cat === 'all' ? 'All' : cat === 'Good Health' ? 'Good' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Vehicle List ─── */}
      {filtered.length === 0 ? (
        <div className={`${cardClass} py-16 text-center`}>
          <CheckCircle className={`w-8 h-8 mx-auto mb-3 ${textMuted}`} />
          <p className={`text-xs ${textSecondary}`}>No vehicles match the current filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(vehicle => {
            const cd = conditionData[vehicle.id];
            const isLoading = loadingIds.has(vehicle.id);
            const brand = getBrandFromModel(vehicle.model);

            return (
              <div key={vehicle.id} className={`${cardClass} overflow-hidden`}>
                {/* Vehicle Header */}
                <div className={`px-4 py-3 flex items-center gap-3 border-b ${isDark ? 'border-neutral-700/40' : 'border-gray-200'}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isDark ? 'bg-neutral-800' : 'bg-gray-100'}`}>
                    <BrandLogo brand={brand} size={22} isDarkMode={isDark} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold truncate ${textPrimary}`}>{[vehicle.make, getShortModel(vehicle.model), vehicle.year].filter(Boolean).join(' ')}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{vehicle.license}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] ${textMuted}`}>{vehicle.station}</span>
                      <span className={`text-[10px] ${textMuted}`}>Odometer: {vehicle.odometer.toLocaleString('de-DE')} km</span>
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getHealthBg(vehicle.healthStatus, isDark)} ${getHealthColor(vehicle.healthStatus, isDark)}`}>
                    {vehicle.healthStatus === 'Good Health' && <CheckCircle className="w-3 h-3" />}
                    {vehicle.healthStatus === 'Warning' && <AlertTriangle className="w-3 h-3" />}
                    {vehicle.healthStatus === 'Critical' && <ShieldAlert className="w-3 h-3" />}
                    {vehicle.healthStatus === 'Good Health' ? 'Healthy' : vehicle.healthStatus}
                  </span>
                  {emState.canCreateCase && (
                    <button
                      onClick={() => openEuromasterForVehicle(vehicle)}
                      className="shrink-0 px-2 py-0.5 text-[9px] font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                      title="Plan service with Euromaster"
                    >
                      <Wrench className="w-3 h-3 inline mr-0.5" />EM
                    </button>
                  )}
                </div>

                {/* Condition Items */}
                {isLoading && !cd ? (
                  <div className="px-4 py-6 flex justify-center">
                    <div className={`w-5 h-5 border-2 border-t-transparent rounded-full animate-spin ${isDark ? 'border-blue-400' : 'border-blue-500'}`} />
                  </div>
                ) : (
                  <div className={`divide-y ${isDark ? 'divide-neutral-800/40' : 'divide-gray-100'}`}>
                    {/* 1. Tires */}
                    <ConditionRow
                      isDark={isDark}
                      icon={CircleDot}
                      label="Tires"
                      onClick={() => onDrillDown?.(vehicle.id, 'tires')}
                    >
                      {(() => {
                        const t = cd?.tires;
                        const pct = t?.overallPercent ?? vehicle.tires;
                        const remKm = t?.overallRemainingKm;
                        return (
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1 max-w-[200px]">
                              <div className={`h-2 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
                                <div className={`h-full rounded-full transition-all ${getProgressColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                            </div>
                            <span className={`text-xs font-bold w-10 text-right ${getMetricColor(pct, isDark)}`}>{Math.round(pct)}%</span>
                            <span className={`text-[10px] ${textMuted} hidden sm:inline`}>
                              {remKm != null ? `~${Math.round(remKm / 1000)}k km remaining` : ''}
                            </span>
                          </div>
                        );
                      })()}
                    </ConditionRow>

                    {/* 2. Brakes */}
                    <ConditionRow isDark={isDark} icon={Disc} label="Brakes" onClick={() => onDrillDown?.(vehicle.id, 'brakes')}>
                      {(() => {
                        const b = cd?.brakes;
                        const pct = b?.padWearPercent ?? vehicle.brakes;
                        const remKm = b?.kmSinceService != null ? Math.max(0, 60000 - b.kmSinceService) : null;
                        return (
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1 max-w-[200px]">
                              <div className={`h-2 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
                                <div className={`h-full rounded-full transition-all ${getProgressColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                            </div>
                            <span className={`text-xs font-bold w-10 text-right ${getMetricColor(pct, isDark)}`}>{Math.round(pct)}%</span>
                            <span className={`text-[10px] ${textMuted} hidden sm:inline`}>
                              {remKm != null ? `~${Math.round(remKm / 1000)}k km projected` : b?.lastServiceDate ? `Srv ${formatDate(b.lastServiceDate)}` : ''}
                            </span>
                          </div>
                        );
                      })()}
                    </ConditionRow>

                    {/* 3. Battery SOH */}
                    <ConditionRow isDark={isDark} icon={Battery} label="Battery SOH" onClick={() => onDrillDown?.(vehicle.id, 'battery')}>
                      {(() => {
                        const bat = cd?.battery;
                        const pubState = bat?.currentState?.publicationState;
                        const isCalib = pubState === 'INITIAL_CALIBRATION';
                        const isStab = pubState === 'STABILIZING';
                        const soh = isCalib ? null : (bat?.currentState?.publishedSohPct ?? bat?.currentState?.sohPercent ?? null);
                        const voltage = bat?.currentState?.voltageV;
                        const cond = bat?.condition;
                        const pct = soh ?? (voltage != null ? Math.min(100, Math.max(0, (voltage - 11.5) / (12.8 - 11.5) * 100)) : null);
                        if (isCalib) {
                          return (
                            <div className="flex items-center gap-3 flex-1">
                              <span className={`text-xs font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Calibrating</span>
                              <style>{`@keyframes calibDots { 0%,20%{opacity:.2} 50%{opacity:1} 100%{opacity:.2} }`}</style>
                              <span className="inline-flex">{[0,1,2].map(i => <span key={i} className={`inline-block w-1 h-1 rounded-full mx-px ${isDark ? 'bg-blue-400' : 'bg-blue-500'}`} style={{ animation: `calibDots 1.4s infinite ${i * 0.2}s` }} />)}</span>
                            </div>
                          );
                        }
                        return (
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1 max-w-[200px]">
                              <div className={`h-2 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
                                <div className={`h-full rounded-full transition-all ${isStab ? (isDark ? 'bg-amber-500/60' : 'bg-amber-400') : pct != null ? getProgressColor(pct) : 'bg-gray-400'}`} style={{ width: `${pct != null ? Math.min(pct, 100) : 0}%` }} />
                              </div>
                            </div>
                            <span className={`text-xs font-bold w-10 text-right ${pct != null ? getMetricColor(pct, isDark) : textMuted}`}>
                              {soh != null ? `${isStab ? '~' : ''}${Math.round(soh)}%` : voltage != null ? `${voltage.toFixed(1)}V` : '—'}
                            </span>
                            <span className={`text-[10px] hidden sm:inline ${
                              isStab ? (isDark ? 'text-amber-400' : 'text-amber-600')
                              : cond === 'good' ? (isDark ? 'text-emerald-400' : 'text-emerald-600')
                              : cond === 'watch' ? (isDark ? 'text-amber-400' : 'text-amber-600')
                              : cond === 'attention' ? (isDark ? 'text-red-400' : 'text-red-600')
                              : textMuted
                            }`}>
                              {isStab ? 'Estimated' : cond === 'good' ? 'Healthy' : cond === 'watch' ? 'Monitor' : cond === 'attention' ? 'Attention' : ''}
                            </span>
                          </div>
                        );
                      })()}
                    </ConditionRow>

                    {/* 4. Error Codes */}
                    <ConditionRow isDark={isDark} icon={AlertCircle} label="Error Codes" onClick={() => onDrillDown?.(vehicle.id, 'dtc')}>
                      {(() => {
                        const activeCount = cd?.dtcActive?.length ?? 0;
                        return (
                          <div className="flex items-center gap-3 flex-1">
                            {activeCount > 0 ? (
                              <>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  activeCount >= 3 ? (isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600')
                                  : (isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600')
                                }`}>
                                  <AlertCircle className="w-3 h-3" />
                                  {activeCount} active
                                </span>
                                <span className={`text-[10px] ${textMuted} hidden sm:inline`}>DTCs detected</span>
                              </>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                              }`}>
                                <CheckCircle className="w-3 h-3" />
                                No active codes
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </ConditionRow>

                    {/* 5. Service */}
                    <ConditionRow isDark={isDark} icon={Wrench} label="Service" onClick={() => onDrillDown?.(vehicle.id, 'service')}>
                      {(() => {
                        const svc = cd?.service;
                        const pct = svc?.serviceRemainingPercent ?? null;
                        const remKm = svc?.serviceRemainingKm;
                        const remMo = svc?.serviceRemainingMonths;
                        return (
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1 max-w-[200px]">
                              <div className={`h-2 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
                                <div className={`h-full rounded-full transition-all ${pct != null ? getProgressColor(pct) : 'bg-gray-400'}`} style={{ width: `${pct != null ? Math.min(pct, 100) : 0}%` }} />
                              </div>
                            </div>
                            <span className={`text-xs font-bold w-10 text-right ${pct != null ? getMetricColor(pct, isDark) : textMuted}`}>
                              {pct != null ? `${Math.round(pct)}%` : '—'}
                            </span>
                            <span className={`text-[10px] ${textMuted} hidden sm:inline`}>
                              {remKm != null ? `${remKm.toLocaleString('de-DE')} km` : ''}{remKm != null && remMo != null ? ' / ' : ''}{remMo != null ? formatRemainingTime(remMo) : ''}
                              {remKm == null && remMo == null && svc?.lastServiceDate ? `Last: ${formatDate(svc.lastServiceDate)}` : ''}
                            </span>
                          </div>
                        );
                      })()}
                    </ConditionRow>

                    {/* 6. TÜV */}
                    <ConditionRow isDark={isDark} icon={ShieldCheck} label="TÜV" onClick={() => onDrillDown?.(vehicle.id, 'tuev')}>
                      {(() => {
                        const svc = cd?.service;
                        const remMo = svc?.tuvRemainingMonths ?? null;
                        const validTill = svc?.tuvValidTill ?? null;
                        const pct = remMo != null ? Math.min(100, Math.max(0, (remMo / 24) * 100)) : null;
                        return (
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1 max-w-[200px]">
                              <div className={`h-2 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
                                <div className={`h-full rounded-full transition-all ${pct != null ? getProgressColor(pct) : 'bg-gray-400'}`} style={{ width: `${pct != null ? Math.min(pct, 100) : 0}%` }} />
                              </div>
                            </div>
                            <span className={`text-xs font-bold w-14 text-right ${
                              remMo != null && remMo <= 2 ? (isDark ? 'text-red-400' : 'text-red-500')
                              : remMo != null && remMo <= 6 ? (isDark ? 'text-amber-400' : 'text-amber-500')
                              : (isDark ? 'text-emerald-400' : 'text-emerald-500')
                            }`}>
                              {remMo != null ? formatRemainingTime(remMo) : '—'}
                            </span>
                            <span className={`text-[10px] ${textMuted} hidden sm:inline`}>
                              {validTill ? `Valid till ${formatDate(validTill)}` : ''}
                            </span>
                          </div>
                        );
                      })()}
                    </ConditionRow>

                    {/* 7. BOKraft */}
                    <ConditionRow isDark={isDark} icon={Calendar} label="BOKraft" onClick={() => onDrillDown?.(vehicle.id, 'bokraft')}>
                      {(() => {
                        const svc = cd?.service;
                        const remMo = svc?.bokraftRemainingMonths ?? null;
                        const validTill = svc?.bokraftValidTill ?? null;
                        const pct = remMo != null ? Math.min(100, Math.max(0, (remMo / 12) * 100)) : null;
                        return (
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1 max-w-[200px]">
                              <div className={`h-2 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
                                <div className={`h-full rounded-full transition-all ${pct != null ? getProgressColor(pct) : 'bg-gray-400'}`} style={{ width: `${pct != null ? Math.min(pct, 100) : 0}%` }} />
                              </div>
                            </div>
                            <span className={`text-xs font-bold w-14 text-right ${
                              remMo != null && remMo <= 1 ? (isDark ? 'text-red-400' : 'text-red-500')
                              : remMo != null && remMo <= 3 ? (isDark ? 'text-amber-400' : 'text-amber-500')
                              : (isDark ? 'text-emerald-400' : 'text-emerald-500')
                            }`}>
                              {remMo != null ? formatRemainingTime(remMo) : '—'}
                            </span>
                            <span className={`text-[10px] ${textMuted} hidden sm:inline`}>
                              {validTill ? `Valid till ${formatDate(validTill)}` : ''}
                            </span>
                          </div>
                        );
                      })()}
                    </ConditionRow>

                    {/* 8. Driver Feedback */}
                    <ConditionRow isDark={isDark} icon={MessageSquare} label="Driver Feedback" onClick={() => onDrillDown?.(vehicle.id, 'driver-feedback')} noBar>
                      <div className="flex items-center gap-2 flex-1">
                        <span className={`text-xs font-medium ${textSecondary}`}>0 entries</span>
                        <span className={`text-[10px] ${textMuted}`}>No feedback recorded</span>
                      </div>
                    </ConditionRow>

                    {/* 9. Alerts */}
                    <ConditionRow isDark={isDark} icon={Bell} label="Alerts" onClick={() => onDrillDown?.(vehicle.id, 'alerts')} noBar>
                      {(() => {
                        const tireAlerts = cd?.tires?.alerts ?? [];
                        const brakeWatchpoints = cd?.brakes?.watchpoints ?? [];
                        const batWatchpoints = cd?.battery?.watchpoints ?? [];
                        const dtcCount = cd?.dtcActive?.length ?? 0;
                        const warningCount = tireAlerts.filter(a => a.severity === 'warning').length + brakeWatchpoints.length + batWatchpoints.length;
                        const criticalCount = tireAlerts.filter(a => a.severity === 'critical').length + (dtcCount >= 3 ? 1 : 0);
                        const total = warningCount + criticalCount;
                        return (
                          <div className="flex items-center gap-2 flex-1">
                            {total > 0 ? (
                              <>
                                {criticalCount > 0 && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600'
                                  }`}>{criticalCount} Critical</span>
                                )}
                                {warningCount > 0 && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'
                                  }`}>{warningCount} Warning</span>
                                )}
                              </>
                            ) : (
                              <span className={`text-xs font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>No alerts</span>
                            )}
                          </div>
                        );
                      })()}
                    </ConditionRow>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Euromaster Modal */}
      <EuromasterServiceRequestModal
        isDarkMode={isDarkMode}
        isOpen={emModalOpen}
        onClose={() => setEmModalOpen(false)}
        prefill={emPrefill}
      />
    </div>
  );
}

function ConditionRow({ isDark, icon: Icon, label, children, onClick, noBar }: {
  isDark: boolean;
  icon: any;
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  noBar?: boolean;
}) {
  const textMuted = isDark ? 'text-gray-500' : 'text-gray-400';
  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-all ${
        isDark ? 'hover:bg-neutral-800/40' : 'hover:bg-gray-50/60'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${textMuted}`} />
      <span className={`text-xs font-medium w-28 shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{label}</span>
      {children}
      <ChevronRight className={`w-4 h-4 shrink-0 ${textMuted} transition-transform group-hover:translate-x-0.5`} />
    </button>
  );
}
