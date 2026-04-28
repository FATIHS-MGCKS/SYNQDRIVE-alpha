import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle, Battery, Disc,
  Car, ChevronRight, CircleDot,
  Calendar, Wrench, MessageSquare, Bell, AlertCircle, Search, ArrowUpDown
} from 'lucide-react';
import { getShortModel } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { BrandLogo, getBrandFromModel } from './BrandLogo';
import {
  api,
  type TireHealthSummaryResponse,
  type BrakeHealthSummary,
  type BatteryHealthSummary,
  type ServiceInfoStatus,
} from '../../lib/api';

export type ConditionCategory = 'tires' | 'brakes' | 'battery' | 'dtc' | 'service' | 'tuev' | 'bokraft' | 'driver-feedback' | 'alerts';

interface FleetConditionViewProps {
  isDarkMode: boolean;
  onDrillDown?: (vehicleId: string, category: ConditionCategory) => void;
}

type HealthCategory = 'all' | 'Good Health' | 'Warning' | 'Critical';
type SortMode = 'critical-first' | 'alpha' | 'license';

interface VehicleConditionData {
  tires: TireHealthSummaryResponse | null;
  brakes: BrakeHealthSummary | null;
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
  if (status === 'Critical') return isDark ? 'bg-red-500/10 border-red-500/25' : 'bg-red-50 border-red-200/70';
  if (status === 'Warning') return isDark ? 'bg-amber-500/10 border-amber-500/25' : 'bg-amber-50 border-amber-200/70';
  return isDark ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-emerald-50 border-emerald-200/70';
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

function formatEnumLabel(value: unknown, fallback = '—'): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  return value.replace(/_/g, ' ');
}

// Rank used by the "Critical first" sort. Higher rank sorts earlier.
function healthRank(status: string): number {
  if (status === 'Critical') return 3;
  if (status === 'Warning') return 2;
  return 1;
}

export function FleetConditionView({ isDarkMode, onDrillDown }: FleetConditionViewProps) {
  const { fleetVehicles } = useFleetVehicles();
  const { orgId: _orgId } = useRentalOrg();
  const [filterCategory, setFilterCategory] = useState<HealthCategory>('all');
  const [sortMode, setSortMode] = useState<SortMode>('critical-first');
  const [searchQuery, setSearchQuery] = useState('');
  const [conditionData, setConditionData] = useState<Record<string, VehicleConditionData>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const isDark = isDarkMode;

  const totalCount = fleetVehicles.length;
  const goodCount = fleetVehicles.filter(v => v.healthStatus === 'Good Health').length;
  const warningCount = fleetVehicles.filter(v => v.healthStatus === 'Warning').length;
  const criticalCount = fleetVehicles.filter(v => v.healthStatus === 'Critical').length;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = fleetVehicles.filter(v => {
      if (filterCategory !== 'all' && v.healthStatus !== filterCategory) return false;
      if (!q) return true;
      const haystack = [v.model, v.make, v.license, v.station, v.year?.toString()].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
    const sorted = [...base];
    if (sortMode === 'critical-first') {
      sorted.sort((a, b) => healthRank(b.healthStatus) - healthRank(a.healthStatus) || (a.license ?? '').localeCompare(b.license ?? ''));
    } else if (sortMode === 'alpha') {
      sorted.sort((a, b) => (a.model ?? '').localeCompare(b.model ?? ''));
    } else {
      sorted.sort((a, b) => (a.license ?? '').localeCompare(b.license ?? ''));
    }
    return sorted;
  }, [fleetVehicles, filterCategory, sortMode, searchQuery]);

  const loadVehicleCondition = useCallback(async (vehicleId: string) => {
    if (conditionData[vehicleId] || loadingIds.has(vehicleId)) return;
    setLoadingIds(prev => new Set(prev).add(vehicleId));
    try {
      const [tires, brakes, battery, service, dtcActive, dtcStats] = await Promise.all([
        api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.brakeHealthSummary(vehicleId).catch(() => null),
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

  const cardClass = `rounded-xl border shadow-xs ${
    isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
  }`;
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';
  const textMuted = isDark ? 'text-gray-500' : 'text-gray-400';

  return (
    <div className="space-y-3.5">
      {/* ─── Header ─── */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Fleet Condition</h1>
          <p className={`text-[11px] mt-0.5 ${textSecondary}`}>
            Zustand, Verschleiß und operative Lage aller Fahrzeuge — Ein-Klick-Drill-down in die Details.
          </p>
        </div>
        <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
          <span className={`text-[10px] font-semibold ${textMuted}`}>Sort</span>
          <ArrowUpDown className={`w-3 h-3 ${textMuted}`} />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className={`bg-transparent text-xs font-medium outline-none cursor-pointer ${textPrimary}`}
          >
            <option value="critical-first">Critical first</option>
            <option value="alpha">Model A–Z</option>
            <option value="license">License plate</option>
          </select>
        </div>
      </div>

      {/* ─── Top Stats ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <button
          onClick={() => setFilterCategory('all')}
          className={`${cardClass} px-3 py-2.5 text-left transition-all hover:scale-[1.01] ${filterCategory === 'all' ? 'ring-2 ring-blue-500/30' : ''}`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${textSecondary}`}>Total Fleet</span>
            <Car className={`w-3.5 h-3.5 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
          </div>
          <span className={`text-2xl font-bold tracking-tight ${textPrimary}`}>{totalCount}</span>
          <p className={`text-[10px] mt-0.5 ${textMuted}`}>vehicles monitored</p>
        </button>
        {[
          { label: 'Healthy', count: goodCount, status: 'Good Health' as HealthCategory, icon: CheckCircle, cls: isDark ? 'text-emerald-400' : 'text-emerald-500', ring: 'ring-emerald-500/40' },
          { label: 'Warning', count: warningCount, status: 'Warning' as HealthCategory, icon: AlertTriangle, cls: isDark ? 'text-amber-400' : 'text-amber-500', ring: 'ring-amber-500/40' },
          { label: 'Critical', count: criticalCount, status: 'Critical' as HealthCategory, icon: ShieldAlert, cls: isDark ? 'text-red-400' : 'text-red-500', ring: 'ring-red-500/40' },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => setFilterCategory(filterCategory === s.status ? 'all' : s.status)}
            className={`${cardClass} px-3 py-2.5 text-left transition-all hover:scale-[1.01] ${filterCategory === s.status ? `ring-2 ${s.ring}` : ''}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${textSecondary}`}>{s.label}</span>
              <s.icon className={`w-3.5 h-3.5 ${s.cls}`} />
            </div>
            <span className={`text-2xl font-bold tracking-tight ${textPrimary}`}>{s.count}</span>
            <p className={`text-[10px] mt-0.5 ${s.cls} font-medium`}>
              {s.count > 0
                ? `${Math.round((s.count / Math.max(totalCount, 1)) * 100)}% of fleet`
                : s.label === 'Critical' ? 'All clear' : 'None'}
            </p>
          </button>
        ))}
      </div>

      {/* ─── Filter + Search Bar ─── */}
      <div className={`${cardClass} px-3 py-2 flex flex-col md:flex-row md:items-center gap-2 md:gap-3`}>
        <h3 className={`text-xs font-semibold ${textPrimary} md:mr-2`}>
          Vehicle Condition
          <span className={`ml-2 text-[10px] font-normal ${textMuted}`}>({filtered.length})</span>
        </h3>
        <div className="flex-1 flex items-center gap-2 md:max-w-xs">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border flex-1 ${isDark ? 'bg-neutral-800/60 border-neutral-700' : 'bg-gray-50 border-gray-200'}`}>
            <Search className={`w-3.5 h-3.5 ${textMuted}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search model, plate, station…"
              className={`bg-transparent text-xs outline-none flex-1 min-w-0 ${textPrimary}`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className={`text-[10px] ${textMuted} hover:${textPrimary} shrink-0`}
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'Good Health', 'Warning', 'Critical'] as HealthCategory[]).map(cat => {
            const count = cat === 'all' ? totalCount : cat === 'Good Health' ? goodCount : cat === 'Warning' ? warningCount : criticalCount;
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 ${
                  filterCategory === cat
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isDark ? 'bg-neutral-800 text-gray-400 hover:text-white' : 'bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                {cat === 'all' ? 'All' : cat === 'Good Health' ? 'Good' : cat}
                <span className={`text-[9px] px-1 py-px rounded ${filterCategory === cat ? 'bg-white/20' : isDark ? 'bg-neutral-700' : 'bg-gray-200'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Vehicle List ─── */}
      {filtered.length === 0 ? (
        <div className={`${cardClass} py-12 text-center`}>
          <CheckCircle className={`w-7 h-7 mx-auto mb-2 ${textMuted}`} />
          <p className={`text-xs ${textSecondary}`}>No vehicles match the current filter{searchQuery ? ' or search' : ''}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(vehicle => {
            const cd = conditionData[vehicle.id];
            const isLoading = loadingIds.has(vehicle.id);
            const brand = getBrandFromModel(vehicle.model);

            return (
              <div key={vehicle.id} className={`${cardClass} overflow-hidden`}>
                {/* Vehicle Header */}
                <div className={`px-3 py-2 flex items-center gap-2.5 border-b ${isDark ? 'border-neutral-800' : 'border-gray-100'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDark ? 'bg-neutral-800' : 'bg-gray-100'}`}>
                    <BrandLogo brand={brand} size={18} isDarkMode={isDark} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold truncate ${textPrimary}`}>{[vehicle.make, getShortModel(vehicle.model), vehicle.year].filter(Boolean).join(' ')}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{vehicle.license}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] ${textMuted} truncate`}>{vehicle.station}</span>
                      <span className={`text-[10px] ${textMuted}`}>· {vehicle.odometer.toLocaleString('de-DE')} km</span>
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getHealthBg(vehicle.healthStatus, isDark)} ${getHealthColor(vehicle.healthStatus, isDark)}`}>
                    {vehicle.healthStatus === 'Good Health' && <CheckCircle className="w-3 h-3" />}
                    {vehicle.healthStatus === 'Warning' && <AlertTriangle className="w-3 h-3" />}
                    {vehicle.healthStatus === 'Critical' && <ShieldAlert className="w-3 h-3" />}
                    {vehicle.healthStatus === 'Good Health' ? 'Healthy' : vehicle.healthStatus}
                  </span>
                </div>

                {/* Condition Items */}
                {isLoading && !cd ? (
                  <div className="px-4 py-5 flex justify-center">
                    <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${isDark ? 'border-blue-400' : 'border-blue-500'}`} />
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
                        const action = t?.actionState;
                        const warnCount =
                          (t?.dataQualityWarnings?.length ?? 0) +
                          (t?.pressureContext?.warningHints?.length ?? 0);
                        return (
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1 max-w-[180px]">
                              <div className={`h-1.5 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
                                <div className={`h-full rounded-full transition-all ${getProgressColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                            </div>
                            <span className={`text-xs font-bold w-9 text-right ${getMetricColor(pct, isDark)}`}>{Math.round(pct)}%</span>
                            <span className={`text-[10px] ${textMuted} hidden sm:inline truncate`}>
                              {remKm != null
                                ? `~${Math.round(remKm / 1000)}k km remaining`
                                : action
                                ? formatEnumLabel(action)
                                : 'No km estimate'}
                            </span>
                            {warnCount > 0 && (
                              <span className={`text-[9px] hidden lg:inline ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                                {warnCount} warning{warnCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </ConditionRow>

                    {/* 2. Brakes */}
                    <ConditionRow isDark={isDark} icon={Disc} label="Brakes" onClick={() => onDrillDown?.(vehicle.id, 'brakes')}>
                      {(() => {
                        const b = cd?.brakes;
                        const pct =
                          b?.pads?.healthPercent != null || b?.discs?.healthPercent != null
                            ? Math.min(b?.pads?.healthPercent ?? 101, b?.discs?.healthPercent ?? 101)
                            : null;
                        const remKm = b?.remainingKm ?? null;
                        const stateLabel =
                          b?.stateClass === 'MEASURED'
                            ? 'Measured'
                            : b?.stateClass === 'ESTIMATED'
                              ? 'Estimated'
                              : b?.stateClass === 'WARNING_ONLY'
                                ? 'Warning only'
                                : 'No baseline';
                        return (
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1 max-w-[180px]">
                              <div className={`h-1.5 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    pct != null ? getProgressColor(pct) : isDark ? 'bg-neutral-600' : 'bg-gray-300'
                                  }`}
                                  style={{ width: `${pct != null ? Math.min(pct, 100) : 12}%` }}
                                />
                              </div>
                            </div>
                            <span className={`text-xs font-bold w-9 text-right ${pct != null ? getMetricColor(pct, isDark) : textMuted}`}>
                              {pct != null ? `${Math.round(pct)}%` : '—'}
                            </span>
                            <span className={`text-[10px] ${textMuted} hidden sm:inline truncate`}>
                              {remKm != null
                                ? `~${Math.round(remKm / 1000)}k km projected`
                                : stateLabel}
                            </span>
                          </div>
                        );
                      })()}
                    </ConditionRow>

                    {/* 3. Battery SOH */}
                    <ConditionRow isDark={isDark} icon={Battery} label="Battery SOH" onClick={() => onDrillDown?.(vehicle.id, 'battery')}>
                      {(() => {
                        const bat = cd?.battery;
                        const pubState = bat?.lv?.publicationState ?? bat?.currentState?.publicationState;
                        const isCalib = pubState === 'INITIAL_CALIBRATION';
                        const isStab = pubState === 'STABILIZING';
                        const soh = isCalib
                          ? null
                          : (bat?.lv?.healthPercent ?? bat?.currentState?.publishedSohPct ?? bat?.currentState?.sohPercent ?? null);
                        const estimate = bat?.lv?.estimatedHealthPercent ?? bat?.currentState?.estimatedSohPct ?? null;
                        const voltage = bat?.lv?.telemetry?.voltageV ?? bat?.currentState?.voltageV;
                        const cond = bat?.lv?.condition ?? bat?.condition;
                        const pct = soh ?? estimate;
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
                            <div className="flex-1 max-w-[180px]">
                              <div className={`h-1.5 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
                                <div className={`h-full rounded-full transition-all ${isStab ? (isDark ? 'bg-amber-500/60' : 'bg-amber-400') : pct != null ? getProgressColor(pct) : 'bg-gray-400'}`} style={{ width: `${pct != null ? Math.min(pct, 100) : 0}%` }} />
                              </div>
                            </div>
                            <span className={`text-xs font-bold w-9 text-right ${pct != null ? getMetricColor(pct, isDark) : textMuted}`}>
                              {soh != null
                                ? `${isStab ? '~' : ''}${Math.round(soh)}%`
                                : estimate != null
                                  ? `~${Math.round(estimate)}%`
                                  : voltage != null
                                    ? `${voltage.toFixed(1)}V`
                                    : '—'}
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
                            <div className="flex-1 max-w-[180px]">
                              <div className={`h-1.5 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
                                <div className={`h-full rounded-full transition-all ${pct != null ? getProgressColor(pct) : 'bg-gray-400'}`} style={{ width: `${pct != null ? Math.min(pct, 100) : 0}%` }} />
                              </div>
                            </div>
                            <span className={`text-xs font-bold w-9 text-right ${pct != null ? getMetricColor(pct, isDark) : textMuted}`}>
                              {pct != null ? `${Math.round(pct)}%` : '—'}
                            </span>
                            <span className={`text-[10px] ${textMuted} hidden sm:inline truncate`}>
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
                            <div className="flex-1 max-w-[180px]">
                              <div className={`h-1.5 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
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
                            <span className={`text-[10px] ${textMuted} hidden sm:inline truncate`}>
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
                            <div className="flex-1 max-w-[180px]">
                              <div className={`h-1.5 rounded-full overflow-hidden ${getProgressTrack(isDark)}`}>
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
                            <span className={`text-[10px] ${textMuted} hidden sm:inline truncate`}>
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
                        const brakeWarnings =
                          (cd?.brakes?.baselineWarnings?.length ?? 0) +
                          (cd?.brakes?.provenanceWarnings?.length ?? 0);
                        const batWatchpoints = cd?.battery?.watchpoints ?? [];
                        const dtcCount = cd?.dtcActive?.length ?? 0;
                        const warnCount =
                          tireAlerts.filter(a => a.severity === 'warning').length +
                          brakeWarnings +
                          batWatchpoints.length;
                        const critCount =
                          tireAlerts.filter(a => a.severity === 'critical').length +
                          (cd?.brakes?.hasAlert ? 1 : 0) +
                          (dtcCount >= 3 ? 1 : 0);
                        const total = warnCount + critCount;
                        return (
                          <div className="flex items-center gap-2 flex-1">
                            {total > 0 ? (
                              <>
                                {critCount > 0 && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600'
                                  }`}>{critCount} Critical</span>
                                )}
                                {warnCount > 0 && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'
                                  }`}>{warnCount} Warning</span>
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
    </div>
  );
}

function ConditionRow({ isDark, icon: Icon, label, children, onClick }: {
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
      className={`w-full px-3 py-2 flex items-center gap-2.5 text-left transition-all group ${
        isDark ? 'hover:bg-neutral-800/40' : 'hover:bg-gray-50/60'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${textMuted}`} />
      <span className={`text-[11px] font-medium w-24 shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{label}</span>
      {children}
      <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${textMuted} transition-transform group-hover:translate-x-0.5`} />
    </button>
  );
}
