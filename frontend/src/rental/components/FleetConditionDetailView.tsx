import { AlertCircle, Battery, Bell, Calendar, CircleDot, Disc, MessageSquare, ShieldCheck, Wrench } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect } from 'react';

import {
  api,
  type TireHealthSummaryResponse,
  type TireHealthDetailResponse,
  type BrakeHealthSummary,
  type BrakeHealthDetail,
  type BatteryHealthSummary,
  type ServiceInfoStatus,
  type HealthSummaryResponse,
} from '../../lib/api';
import type { ConditionCategory } from './FleetConditionView';

interface FleetConditionDetailViewProps {
  isDarkMode: boolean;
  vehicleId: string;
  category: ConditionCategory;
  onBack: () => void;
}

const CATEGORY_META: Record<ConditionCategory, { label: string; tagline: string; icon: typeof CircleDot }> = {
  tires: { label: 'Tire Condition & Wear Projection', tagline: 'Tread, pressure and estimated remaining life', icon: CircleDot },
  brakes: { label: 'Brake Condition & Wear Analysis', tagline: 'Pads, discs and wear projection', icon: Disc },
  battery: { label: 'Battery Health & Degradation', tagline: 'SOH, telemetry and watchpoints', icon: Battery },
  dtc: { label: 'Error Codes & Diagnostics', tagline: 'Active and historical DTCs across ECUs', icon: AlertCircle },
  service: { label: 'Service Interval Analysis', tagline: 'Remaining km, time and last service event', icon: Wrench },
  tuev: { label: 'TÜV Validity & Planning', tagline: 'Validity window and upcoming HU date', icon: ShieldCheck },
  bokraft: { label: 'BOKraft Validity & Planning', tagline: 'BOKraft inspection status and planning', icon: Calendar },
  'driver-feedback': { label: 'Driver Feedback', tagline: 'Reports and complaints from drivers', icon: MessageSquare },
  alerts: { label: 'Alerts & Watchpoints', tagline: 'Aggregated warnings across all subsystems', icon: Bell },
};

function getProgressColor(v: number) { return v >= 70 ? 'bg-emerald-500' : v >= 40 ? 'bg-amber-500' : 'bg-red-500'; }
function getProgressTrack(d: boolean) { return d ? 'bg-neutral-700/50' : 'bg-gray-200/80'; }
function getMetricColor(v: number, d: boolean) { return v >= 70 ? (d ? 'text-emerald-400' : 'text-emerald-500') : v >= 40 ? (d ? 'text-amber-400' : 'text-amber-500') : (d ? 'text-red-400' : 'text-red-500'); }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }
function fmtRemTime(mo: number | null) { if (mo == null) return '—'; if (mo < 0) return 'Overdue'; const m = Math.round(mo); return m >= 12 ? `${Math.floor(m / 12)}y ${m % 12}mo` : `${m} months`; }
function formatEnumLabel(value: unknown, fallback = '—') { return typeof value === 'string' && value.length > 0 ? value.replace(/_/g, ' ') : fallback; }
// Canonical tire status (GOOD|WATCH|WARNING|CRITICAL|UNKNOWN) → pill style + label.
function tireStatusPill(status: string | null | undefined, d: boolean): { cls: string; label: string } {
  switch (status) {
    case 'GOOD': return { cls: d ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700', label: 'Good' };
    case 'WATCH': return { cls: d ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700', label: 'Watch' };
    case 'WARNING': return { cls: d ? 'bg-orange-500/15 text-orange-400' : 'bg-orange-50 text-orange-700', label: 'Warning' };
    case 'CRITICAL': return { cls: d ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700', label: 'Critical' };
    default: return { cls: d ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600', label: 'Unknown' };
  }
}

export function FleetConditionDetailView({ isDarkMode, vehicleId, category, onBack }: FleetConditionDetailViewProps) {
  const isDark = isDarkMode;
  const meta = CATEGORY_META[category];
  const CategoryIcon = meta.icon;

  const [loading, setLoading] = useState(true);
  const [tiresSummary, setTiresSummary] = useState<TireHealthSummaryResponse | null>(null);
  const [tiresDetail, setTiresDetail] = useState<TireHealthDetailResponse | null>(null);
  const [brakeSummary, setBrakeSummary] = useState<BrakeHealthSummary | null>(null);
  const [brakeDetail, setBrakeDetail] = useState<BrakeHealthDetail | null>(null);
  const [battery, setBattery] = useState<BatteryHealthSummary | null>(null);
  const [service, setService] = useState<ServiceInfoStatus | null>(null);
  const [dtcActive, setDtcActive] = useState<any[]>([]);
  const [dtcAll, setDtcAll] = useState<any[]>([]);
  const [healthSummary, setHealthSummary] = useState<HealthSummaryResponse | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<HealthSummaryResponse | null>(null);

  useEffect(() => {
    setLoading(true);
    const promises: Promise<any>[] = [];

    if (category === 'tires') {
      promises.push(
        api.vehicleIntelligence.tireHealthSummary(vehicleId).then(setTiresSummary).catch(() => null),
        api.vehicleIntelligence.tireHealthDetail(vehicleId).then(setTiresDetail).catch(() => null),
      );
    } else if (category === 'brakes') {
      promises.push(
        api.vehicleIntelligence.brakeHealthSummary(vehicleId).then(setBrakeSummary).catch(() => null),
        api.vehicleIntelligence.brakeHealthDetail(vehicleId).then(setBrakeDetail).catch(() => null),
      );
    } else if (category === 'battery') {
      promises.push(api.vehicleIntelligence.batteryHealthSummary(vehicleId).then(setBattery).catch(() => null));
    } else if (category === 'dtc') {
      promises.push(
        api.vehicleIntelligence.dtcActive(vehicleId).then(d => setDtcActive(Array.isArray(d) ? d : [])).catch(() => []),
        api.vehicleIntelligence.dtc(vehicleId).then(d => setDtcAll(Array.isArray(d) ? d : [])).catch(() => []),
      );
    } else if (category === 'service' || category === 'tuev' || category === 'bokraft') {
      promises.push(api.vehicleIntelligence.serviceInfoStatus(vehicleId).then(setService).catch(() => null));
    } else if (category === 'alerts') {
      promises.push(
        api.vehicleIntelligence.tireHealthSummary(vehicleId).then(setTiresSummary).catch(() => null),
        api.vehicleIntelligence.brakeHealthSummary(vehicleId).then(setBrakeSummary).catch(() => null),
        api.vehicleIntelligence.brakeHealthDetail(vehicleId).then(setBrakeDetail).catch(() => null),
        api.vehicleIntelligence.batteryHealthSummary(vehicleId).then(setBattery).catch(() => null),
        api.vehicleIntelligence.dtcActive(vehicleId).then(d => setDtcActive(Array.isArray(d) ? d : [])).catch(() => []),
      );
    }

    Promise.all(promises).finally(() => setLoading(false));
  }, [vehicleId, category]);

  const triggerAiAnalysis = async () => {
    setAiLoading(true);
    try {
      const result = await api.vehicleIntelligence.healthSummary(vehicleId);
      setAiResult(result);
    } catch { /* keep null */ }
    finally { setAiLoading(false); }
  };

  const cardClass = `rounded-2xl border shadow-sm ${isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';
  const textMuted = isDark ? 'text-gray-500' : 'text-gray-400';

  return (
    <div className="space-y-5">
      {/* ─── Back + Header ─── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Fleet Health"
          className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
        >
          <Icon name="arrow-left" className="w-5 h-5" />
        </button>
        <div className={`p-2.5 rounded-xl ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'}`}>
          <CategoryIcon className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
        </div>
        <div>
          <h1 className={`text-lg font-bold tracking-tight ${textPrimary}`}>{meta.label}</h1>
          <p className={`text-xs mt-0.5 ${textSecondary}`}>{meta.tagline}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className={`w-8 h-8 border-2 border-t-transparent rounded-full animate-spin ${isDark ? 'border-blue-400' : 'border-blue-500'}`} />
          <p className={`text-xs mt-3 ${textSecondary}`}>Loading analysis data...</p>
        </div>
      ) : (
        <>
          {/* ─── Category-specific content ─── */}
          {category === 'tires' && <TiresDetail isDark={isDark} summary={tiresSummary} detail={tiresDetail} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'brakes' && <BrakesDetail isDark={isDark} summary={brakeSummary} detail={brakeDetail} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'battery' && <BatteryDetail isDark={isDark} battery={battery} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'dtc' && <DtcDetail isDark={isDark} active={dtcActive} all={dtcAll} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'service' && <ServiceDetail isDark={isDark} service={service} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'tuev' && <TuevDetail isDark={isDark} service={service} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'bokraft' && <BokraftDetail isDark={isDark} service={service} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'driver-feedback' && <DriverFeedbackDetail isDark={isDark} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'alerts' && <AlertsDetail isDark={isDark} tires={tiresSummary} brakeSummary={brakeSummary} brakeDetail={brakeDetail} battery={battery} dtcActive={dtcActive} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}

          {/* ─── AI Analysis Box ─── */}
          <div className={`${cardClass} p-5`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-xl ${isDark ? 'bg-purple-500/15' : 'bg-purple-50'}`}>
                <Icon name="sparkles" className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
              </div>
              <div className="flex-1">
                <h3 className={`text-sm font-semibold ${textPrimary}`}>AI Predictive Analysis</h3>
                <p className={`text-[10px] ${textMuted}`}>Analyze wear patterns, behavior impact, and maintenance recommendations</p>
              </div>
              <button
                onClick={triggerAiAnalysis}
                disabled={aiLoading}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  aiLoading
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:scale-[1.02] active:scale-[0.98]'
                } ${isDark
                  ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-[0_4px_14px_rgba(147,51,234,0.3)]'
                  : 'bg-gradient-to-r from-purple-500 to-violet-500 text-white shadow-[0_4px_14px_rgba(147,51,234,0.25)]'
                }`}
              >
                {aiLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-t-transparent border-white rounded-full animate-spin" />
                    Analyzing...
                  </span>
                ) : aiResult ? 'Re-analyze' : 'Run Analysis'}
              </button>
            </div>

            {aiResult && (
              <div className={`mt-1 rounded-xl p-4 space-y-4 ${isDark ? 'bg-neutral-800/50 border border-neutral-700/40' : 'bg-gray-50/80 border border-gray-200'}`}>
                {/* Overall */}
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    aiResult.overallStatus.level === 'good' ? (isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700')
                    : aiResult.overallStatus.level === 'watch' ? (isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700')
                    : (isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700')
                  }`}>{aiResult.overallStatus.title}</span>
                  <p className={`text-xs ${textSecondary}`}>{aiResult.overallStatus.shortSummary}</p>
                </div>

                {/* Future Outlook */}
                {aiResult.futureOutlook && (
                  <div>
                    <h4 className={`text-[10px] uppercase tracking-wider font-bold mb-2 ${textMuted}`}>Predictive Outlook</h4>
                    <p className={`text-xs ${textSecondary}`}>{aiResult.futureOutlook.summary}</p>
                    {aiResult.futureOutlook.items.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {aiResult.futureOutlook.items.map((item, i) => (
                          <li key={i} className={`text-xs flex items-start gap-2 ${textSecondary}`}>
                            <Icon name="trending-down" className={`w-3 h-3 mt-0.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Maintenance Focus */}
                {aiResult.maintenanceFocus.length > 0 && (
                  <div>
                    <h4 className={`text-[10px] uppercase tracking-wider font-bold mb-2 ${textMuted}`}>Maintenance Priority</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {aiResult.maintenanceFocus.map((f, i) => (
                        <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                          f.priority === 'high' ? (isDark ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200/50')
                          : f.priority === 'medium' ? (isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200/50')
                          : (isDark ? 'bg-neutral-800 border border-neutral-700/40' : 'bg-gray-50 border border-gray-200')
                        }`}>
                          <span className={`text-[10px] font-bold uppercase ${
                            f.priority === 'high' ? (isDark ? 'text-red-400' : 'text-red-600')
                            : f.priority === 'medium' ? (isDark ? 'text-amber-400' : 'text-amber-600')
                            : textMuted
                          }`}>{f.priority}</span>
                          <span className={`text-xs font-medium ${textPrimary}`}>{f.area}</span>
                          <span className={`text-[10px] ${textMuted}`}>— {f.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {aiResult.preventiveRecommendations.length > 0 && (
                  <div>
                    <h4 className={`text-[10px] uppercase tracking-wider font-bold mb-2 ${textMuted}`}>Preventive Recommendations</h4>
                    <ul className="space-y-1.5">
                      {aiResult.preventiveRecommendations.map((r, i) => (
                        <li key={i} className={`text-xs flex items-start gap-2 ${textSecondary}`}>
                          <Icon name="check-circle" className={`w-3 h-3 mt-0.5 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Data Confidence */}
                <div className="flex items-center gap-2 pt-2 border-t border-dashed border-gray-200 dark:border-neutral-700">
                  <span className={`text-[10px] font-semibold ${textMuted}`}>Data confidence:</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    aiResult.dataConfidence.level === 'high' ? (isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                    : aiResult.dataConfidence.level === 'medium' ? (isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600')
                    : (isDark ? 'bg-gray-500/10 text-gray-400' : 'bg-gray-100 text-gray-500')
                  }`}>{aiResult.dataConfidence.level}</span>
                  <span className={`text-[10px] ${textMuted}`}>{aiResult.dataConfidence.reason}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════ Category Detail Sections ═══════════════ */

interface DetailProps {
  isDark: boolean;
  cardClass: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

function StatBox({ isDark, label, value, sub, cardClass, textPrimary, textMuted, colorClass }: DetailProps & { label: string; value: string; sub?: string; colorClass?: string }) {
  return (
    <div className={`${cardClass} p-4`}>
      <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${textMuted}`}>{label}</p>
      <p className={`text-2xl font-bold ${colorClass ?? textPrimary}`}>{value}</p>
      {sub && <p className={`text-[10px] mt-1 ${textMuted}`}>{sub}</p>}
    </div>
  );
}

function WatchpointList({ items, isDark, textSecondary }: { items: string[]; isDark: boolean; textSecondary: string }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((w, i) => (
        <li key={i} className={`text-xs flex items-start gap-2 ${textSecondary}`}>
          <Icon name="alert-triangle" className={`w-3 h-3 mt-0.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
          {w}
        </li>
      ))}
    </ul>
  );
}

function RecommendationList({ items, isDark, textSecondary }: { items: string[]; isDark: boolean; textSecondary: string }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((r, i) => (
        <li key={i} className={`text-xs flex items-start gap-2 ${textSecondary}`}>
          <Icon name="check-circle" className={`w-3 h-3 mt-0.5 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
          {r}
        </li>
      ))}
    </ul>
  );
}

/* ─── TIRES ─── */
function TiresDetail({ isDark, summary, detail, ...p }: DetailProps & { summary: TireHealthSummaryResponse | null; detail: TireHealthDetailResponse | null }) {
  const s = summary;
  const pct = s?.overallPercent ?? 0;
  const canonPill = tireStatusPill(s?.overallStatus, isDark);
  return (
    <>
      {/* Canonical tire status (single source of truth — measured vs estimated honesty) */}
      {s?.overallStatus && (
        <div className={`${p.cardClass} p-4 flex flex-wrap items-center gap-x-4 gap-y-2`}>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${canonPill.cls}`}>{canonPill.label}</span>
            <span className={`text-[10px] uppercase tracking-wider font-semibold ${p.textMuted}`}>Tire Status</span>
          </div>
          {s.displayTreadMm != null && (
            <p className={`text-xs ${p.textSecondary}`}>
              Lowest tread: <span className={`font-bold ${p.textPrimary}`}>ca. {s.displayTreadMm.toFixed(1)} mm</span>
              {s.lowestTreadPosition ? <span className={p.textMuted}> · {s.lowestTreadPosition}</span> : null}
            </p>
          )}
          {s.displayMode && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              s.displayMode === 'MEASURED'
                ? (isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-700')
                : (isDark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-50 text-violet-700')
            }`}>
              {s.displayMode === 'MEASURED' ? 'Measured' : s.displayMode === 'ESTIMATED' ? 'Estimated' : 'Unknown'}
            </span>
          )}
          {s.confidence && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isDark ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
              Confidence: {s.confidence}
            </span>
          )}
          {s.lastMeasurementAt && (
            <span className={`text-[10px] ${p.textMuted}`}>Last measured: {fmtDate(s.lastMeasurementAt)}</span>
          )}
        </div>
      )}
      {/* Recommendations from canonical read model */}
      {(s?.recommendations ?? []).length > 0 && (
        <div className={`${p.cardClass} p-4`}>
          <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${p.textMuted}`}>Recommendations</p>
          <ul className="space-y-1">
            {(s?.recommendations ?? []).slice(0, 4).map((rec, i) => (
              <li key={i} className={`text-xs flex items-start gap-2 ${p.textSecondary}`}>
                <span className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${isDark ? 'bg-blue-400' : 'bg-blue-500'}`} />
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox {...p} isDark={isDark} label="Tread Life" value={`${Math.round(pct)}%`} colorClass={getMetricColor(pct, isDark)} sub={s?.healthStatus ?? ''} />
        <StatBox {...p} isDark={isDark} label="Remaining KM" value={s?.overallRemainingKm != null ? `~${Math.round(s.overallRemainingKm / 1000)}k` : '—'} sub="projected wear limit" />
        <StatBox {...p} isDark={isDark} label="Wear Rate" value={s?.wearRateMmPer1000km != null ? `${s.wearRateMmPer1000km.toFixed(2)} mm/1k` : '—'} sub="estimated per 1,000 km" />
        <StatBox {...p} isDark={isDark} label="Confidence" value={s?.confidenceLabel ?? '—'} sub={s?.confidenceScore != null ? `Score: ${s.confidenceScore}` : ''} colorClass={
          (s?.confidenceScore ?? 0) >= 70 ? (isDark ? 'text-emerald-400' : 'text-emerald-500') : (s?.confidenceScore ?? 0) >= 40 ? (isDark ? 'text-amber-400' : 'text-amber-500') : p.textMuted
        } />
      </div>

      {s?.actionState && (
        <div className={`${p.cardClass} p-4`}>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-[10px] uppercase tracking-wider font-semibold ${p.textMuted}`}>Operational Action</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              s.actionState === 'REPLACE'
                ? isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700'
                : s.actionState === 'PLAN_SERVICE'
                ? isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700'
                : s.actionState === 'CHECK_SOON'
                ? isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-700'
                : isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {formatEnumLabel(s.actionState)}
            </span>
          </div>
          {(s.actionReasons ?? []).length > 0 && (
            <p className={`text-xs mt-2 ${p.textSecondary}`}>{s.actionReasons?.[0]}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {s.measurementState && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                {s.measurementState}
              </span>
            )}
            {s.pressureContext?.dimoFreshness && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                DIMO pressure: {s.pressureContext.dimoFreshness}
              </span>
            )}
            {s.pressureContext?.hmFreshness && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                HM pressure: {s.pressureContext.hmFreshness}
              </span>
            )}
          </div>
          {(s.dataQualityWarnings ?? []).length > 0 && (
            <p className={`text-[10px] mt-2 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
              {s.dataQualityWarnings?.[0]}
            </p>
          )}
        </div>
      )}

      {/* Per-wheel */}
      {detail?.wheels && detail.wheels.length > 0 && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-4 ${p.textPrimary}`}>Per-Wheel Condition</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {detail.wheels.map(w => (
              <div key={w.position} className={`p-3 rounded-xl border ${isDark ? 'bg-neutral-800/40 border-neutral-700/40' : 'bg-white border-gray-200'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${p.textMuted}`}>{w.position}</p>
                <div className={`h-2 rounded-full overflow-hidden mb-2 ${getProgressTrack(isDark)}`}>
                  <div className={`h-full rounded-full ${getProgressColor(w.wearPercent)}`} style={{ width: `${Math.min(w.wearPercent, 100)}%` }} />
                </div>
                <p className={`text-lg font-bold ${getMetricColor(w.wearPercent, isDark)}`}>{Math.round(w.wearPercent)}%</p>
                <p className={`text-[10px] ${p.textMuted}`}>{w.treadMm.toFixed(1)} mm • ~{Math.round(w.remainingKm / 1000)}k km</p>
                {w.brand && <p className={`text-[10px] mt-1 ${p.textMuted}`}>{w.brand} {w.tireModel ?? ''}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wear Factors */}
      {detail?.factors && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>Wear-Promoting Factors</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Behavior', value: detail.factors.behaviorFactor, desc: detail.factors.behaviorFactor > 1.1 ? 'Elevated — accelerating wear' : 'Normal' },
              { label: 'Temperature', value: detail.factors.temperatureFactor, desc: detail.factors.temperatureFactor > 1.03 ? 'Increased wear from conditions' : 'Low impact' },
              { label: 'Usage Mix', value: detail.factors.usageFactor, desc: detail.factors.usageFactor > 1.08 ? 'City-heavy usage' : 'Balanced' },
              { label: 'Axle Front', value: detail.factors.axleFactorFront, desc: detail.factors.axleFactorFront > 1.1 ? 'Above average load' : 'Standard' },
            ].map(f => (
              <div key={f.label} className={`px-3 py-2 rounded-lg ${isDark ? 'bg-neutral-800/40' : 'bg-gray-50'}`}>
                <p className={`text-[10px] uppercase tracking-wider font-semibold ${p.textMuted}`}>{f.label}</p>
                <p className={`text-xs font-bold mt-1 ${f.value > 1.1 ? (isDark ? 'text-amber-400' : 'text-amber-600') : p.textPrimary}`}>×{f.value.toFixed(2)}</p>
                <p className={`text-[10px] mt-0.5 ${p.textMuted}`}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Road Type Distribution (per tire setup) */}
      {detail?.usageSplit && (detail.usageSplit.city > 0 || detail.usageSplit.highway > 0 || detail.usageSplit.rural > 0) && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>Road Type Distribution</h3>
          <p className={`text-[10px] mb-3 ${p.textMuted}`}>Aggregated from trip analysis — organized per current tire setup</p>
          <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden mb-3">
            {detail.usageSplit.city > 0 && <div className={`${isDark ? 'bg-blue-500' : 'bg-blue-400'} rounded-full`} style={{ width: `${detail.usageSplit.city}%` }} />}
            {detail.usageSplit.highway > 0 && <div className={`${isDark ? 'bg-emerald-500' : 'bg-emerald-400'} rounded-full`} style={{ width: `${detail.usageSplit.highway}%` }} />}
            {detail.usageSplit.rural > 0 && <div className={`${isDark ? 'bg-amber-500' : 'bg-amber-400'} rounded-full`} style={{ width: `${detail.usageSplit.rural}%` }} />}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className={`text-sm font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{detail.usageSplit.city}%</p>
              <p className={`text-[10px] uppercase tracking-wider ${p.textMuted}`}>City</p>
            </div>
            <div>
              <p className={`text-sm font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{detail.usageSplit.highway}%</p>
              <p className={`text-[10px] uppercase tracking-wider ${p.textMuted}`}>Highway</p>
            </div>
            <div>
              <p className={`text-sm font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>{detail.usageSplit.rural}%</p>
              <p className={`text-[10px] uppercase tracking-wider ${p.textMuted}`}>Country</p>
            </div>
          </div>
          {detail.factors?.usageFactor != null && (
            <p className={`text-[10px] mt-3 ${p.textMuted}`}>
              Usage wear factor: <span className={`font-semibold ${detail.factors.usageFactor > 1.05 ? (isDark ? 'text-amber-400' : 'text-amber-600') : p.textPrimary}`}>×{detail.factors.usageFactor.toFixed(2)}</span>
            </p>
          )}
        </div>
      )}

      {/* Alerts */}
      {s?.alerts && s.alerts.length > 0 && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>Watchpoints</h3>
          <ul className="space-y-2">
            {s.alerts.map((a, i) => (
              <li key={i} className={`text-xs flex items-start gap-2 ${
                a.severity === 'critical' ? (isDark ? 'text-red-400' : 'text-red-600')
                : a.severity === 'warning' ? (isDark ? 'text-amber-400' : 'text-amber-600')
                : p.textSecondary
              }`}>
                <Icon name="alert-triangle" className="w-3 h-3 mt-0.5 shrink-0" />
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/* ─── BRAKES ─── */
function BrakesDetail({
  isDark,
  summary,
  detail,
  ...p
}: DetailProps & { summary: BrakeHealthSummary | null; detail: BrakeHealthDetail | null }) {
  const pct =
    summary?.pads?.healthPercent != null || summary?.discs?.healthPercent != null
      ? Math.min(summary?.pads?.healthPercent ?? 101, summary?.discs?.healthPercent ?? 101)
      : null;
  // Canonical condition is the single source of truth shown to operators.
  const condition = summary?.overallCondition ?? 'UNKNOWN';
  const condLabel =
    condition === 'UNKNOWN' ? '—' : condition.charAt(0) + condition.slice(1).toLowerCase();
  const condColor =
    condition === 'GOOD'
      ? isDark ? 'text-emerald-400' : 'text-emerald-500'
      : condition === 'WATCH'
        ? isDark ? 'text-amber-400' : 'text-amber-500'
        : condition === 'WARNING' || condition === 'CRITICAL'
          ? isDark ? 'text-red-400' : 'text-red-500'
          : p.textMuted;
  const BASIS_LABEL: Record<string, string> = {
    MEASURED: 'Measured', DOCUMENTED: 'Documented', SENSOR: 'Sensor', ESTIMATED: 'Estimated', UNKNOWN: 'Unknown',
  };
  const CONF_LABEL: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', UNKNOWN: 'Unknown' };
  const fmtRange = (min: number | null | undefined, max: number | null | undefined): string => {
    if (min == null && max == null) return '—';
    const f = (n: number) => Math.round(n).toLocaleString('de-DE');
    if (min != null && max != null) return min === max ? `${f(min)} km` : `${f(min)}–${f(max)} km`;
    return `~${f((min ?? max) as number)} km`;
  };
  const stateLabel =
    summary?.stateClass === 'MEASURED'
      ? 'Measured'
      : summary?.stateClass === 'ESTIMATED'
        ? 'Estimated'
        : summary?.stateClass === 'WARNING_ONLY'
          ? 'Warning only'
          : 'No baseline';
  const statusLabel =
    summary?.status === 'healthy'
      ? 'Healthy'
      : summary?.status === 'attention'
        ? 'Attention'
        : summary?.status === 'critical'
          ? 'Critical'
          : 'Pending baseline';
  const statusColor =
    summary?.status === 'healthy'
      ? isDark
        ? 'text-emerald-400'
        : 'text-emerald-500'
      : summary?.status === 'attention'
        ? isDark
          ? 'text-amber-400'
          : 'text-amber-500'
        : summary?.status === 'critical'
          ? isDark
            ? 'text-red-400'
            : 'text-red-500'
          : p.textMuted;

  const watchpoints = [
    ...(summary?.reasons ?? []),
    ...(summary?.recommendations ?? []),
    ...(summary?.baselineWarnings ?? []),
    ...(summary?.provenanceWarnings ?? []),
    ...(detail?.alerts ?? []).map((a) => a.message),
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox
          {...p}
          isDark={isDark}
          label="Brake Condition"
          value={condLabel}
          colorClass={condColor}
          sub={pct != null ? `Pad/disc est. ${Math.round(pct)}%` : 'evidence-based'}
        />
        <StatBox
          {...p}
          isDark={isDark}
          label="Remaining (F / R)"
          value={fmtRange(summary?.estimatedFrontRemainingKmMin, summary?.estimatedFrontRemainingKmMax)}
          sub={`Rear: ${fmtRange(summary?.estimatedRearRemainingKmMin, summary?.estimatedRearRemainingKmMax)}`}
        />
        <StatBox
          {...p}
          isDark={isDark}
          label="Data Basis"
          value={BASIS_LABEL[summary?.dataBasis ?? 'UNKNOWN'] ?? 'Unknown'}
          colorClass={
            summary?.dataBasis === 'MEASURED' || summary?.dataBasis === 'DOCUMENTED'
              ? isDark ? 'text-emerald-400' : 'text-emerald-600'
              : summary?.dataBasis === 'ESTIMATED'
                ? isDark ? 'text-blue-400' : 'text-blue-600'
                : undefined
          }
          sub={summary?.nextInspectionRecommendedInKm != null ? `Inspect in ~${Math.round(summary.nextInspectionRecommendedInKm).toLocaleString('de-DE')} km` : stateLabel}
        />
        <StatBox
          {...p}
          isDark={isDark}
          label="Confidence"
          value={CONF_LABEL[summary?.confidenceLevel ?? 'UNKNOWN'] ?? 'Unknown'}
          colorClass={statusColor}
          sub={summary?.confidence?.score != null ? `Score: ${summary.confidence.score}` : statusLabel}
        />
      </div>

      {summary?.modelCoverage && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>Model Coverage</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${p.textMuted}`}>Coverage</p>
              <p className={`text-lg font-bold mt-1 ${p.textPrimary}`}>
                {summary.modelCoverage.coverageRatio != null
                  ? `${Math.round(summary.modelCoverage.coverageRatio * 100)}%`
                  : '—'}
              </p>
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${p.textMuted}`}>Modeled KM</p>
              <p className={`text-lg font-bold mt-1 ${p.textPrimary}`}>
                {summary.modelCoverage.modeledDistanceKm != null
                  ? Math.round(summary.modelCoverage.modeledDistanceKm).toLocaleString('de-DE')
                  : '—'}
              </p>
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${p.textMuted}`}>Since Anchor</p>
              <p className={`text-lg font-bold mt-1 ${p.textPrimary}`}>
                {summary.modelCoverage.distanceSinceAnchorKm != null
                  ? Math.round(summary.modelCoverage.distanceSinceAnchorKm).toLocaleString('de-DE')
                  : '—'}
              </p>
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${p.textMuted}`}>Trips</p>
              <p className={`text-lg font-bold mt-1 ${p.textPrimary}`}>
                {summary.modelCoverage.modeledTripCount}
              </p>
            </div>
          </div>
          <p className={`text-[10px] mt-3 ${p.textMuted}`}>
            Source: {summary.modelCoverage.source}
          </p>
        </div>
      )}

      {watchpoints.length > 0 && (
        <div className={`${p.cardClass} p-5 space-y-4`}>
          <h3 className={`text-sm font-semibold mb-2 ${p.textPrimary}`}>Watchpoints</h3>
          <WatchpointList items={watchpoints} isDark={isDark} textSecondary={p.textSecondary} />
        </div>
      )}

      {(detail?.history?.length ?? 0) > 0 && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>Service History</h3>
          <div className="space-y-2">
            {detail!.history.slice(0, 10).map((h) => (
              <div key={h.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isDark ? 'bg-neutral-800/40' : 'bg-gray-50'}`}>
                <Icon name="clock" className={`w-3 h-3 ${p.textMuted}`} />
                <span className={`text-xs font-medium ${p.textPrimary}`}>{fmtDate(h.date)}</span>
                {h.serviceKind && <span className={`text-[10px] ${p.textMuted}`}>{h.serviceKind}</span>}
                {h.odometerKm != null && <span className={`text-[10px] ${p.textMuted}`}>{h.odometerKm.toLocaleString('de-DE')} km</span>}
                {h.workshopName && <span className={`text-[10px] ${p.textMuted}`}>{h.workshopName}</span>}
                {h.notes && <span className={`text-[10px] ${p.textMuted} truncate flex-1`}>{h.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── BATTERY ─── */
function BatteryDetail({ isDark, battery: bat, ...p }: DetailProps & { battery: BatteryHealthSummary | null }) {
  const pubState = bat?.lv?.publicationState ?? bat?.currentState?.publicationState;
  const isCalib = pubState === 'INITIAL_CALIBRATION';
  const isStab = pubState === 'STABILIZING';
  const volt = bat?.lv?.telemetry?.voltageV ?? bat?.currentState?.voltageV;
  const cond = bat?.lv?.condition ?? bat?.condition;
  const matConf = bat?.lv?.confidence ?? bat?.currentState?.maturityConfidence;
  const lvStatus = bat?.lv?.status ?? (isCalib ? 'calibrating' : 'ready');
  // LV "Estimated Battery Health" status (no SOH %) + separate Resting Voltage.
  const estStatus: string =
    bat?.lv?.estimatedHealth?.status ??
    (cond === 'good' ? 'GOOD' : cond === 'watch' ? 'WATCH' : cond === 'attention' ? 'WARNING' : 'UNKNOWN');
  const statusLabel: Record<string, string> = { GOOD: 'Good', WATCH: 'Watch', WARNING: 'Warning', CRITICAL: 'Critical', UNKNOWN: '—', UNSUPPORTED: 'Not rated' };
  const statusColor = (s: string) =>
    s === 'GOOD' ? (isDark ? 'text-emerald-400' : 'text-emerald-500') :
    s === 'WATCH' ? (isDark ? 'text-amber-400' : 'text-amber-500') :
    s === 'WARNING' ? (isDark ? 'text-orange-400' : 'text-orange-500') :
    s === 'CRITICAL' ? (isDark ? 'text-red-400' : 'text-red-500') : p.textMuted;
  const restingV = bat?.lv?.restingVoltage?.valueV ?? bat?.lv?.telemetry?.restingVoltage ?? null;
  const restingStatus: string = bat?.lv?.restingVoltage?.status ?? 'UNKNOWN';

  return (
    <>
      {isCalib && (
        <div className={`${p.cardClass} p-5`}>
          <style>{`@keyframes calibDots { 0%,20%{opacity:.2} 50%{opacity:1} 100%{opacity:.2} }`}</style>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Initial calibration in progress</span>
            <span className="inline-flex">{[0,1,2].map(i => <span key={i} className={`inline-block w-1.5 h-1.5 rounded-full mx-0.5 ${isDark ? 'bg-blue-400' : 'bg-blue-500'}`} style={{ animation: `calibDots 1.4s infinite ${i * 0.2}s` }} />)}</span>
          </div>
          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Collecting rest and start-cycle measurements for accurate SOH estimation</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox
          {...p}
          isDark={isDark}
          label="Est. Health"
          value={
            isCalib
              ? 'Calibrating'
              : lvStatus === 'no_recent_data'
                ? 'No data'
                : statusLabel[estStatus] ?? '—'
          }
          colorClass={
            isCalib
              ? (isDark ? 'text-blue-400' : 'text-blue-500')
              : statusColor(estStatus)
          }
          sub={
            isCalib
              ? 'collecting data'
              : lvStatus === 'no_recent_data'
                ? 'no recent data'
                : 'estimated battery health'
          }
        />
        <StatBox
          {...p}
          isDark={isDark}
          label="Resting Voltage"
          value={restingV != null ? `${restingV.toFixed(2)}V` : volt != null ? `${volt.toFixed(1)}V` : '—'}
          colorClass={restingV != null ? statusColor(restingStatus) : p.textMuted}
          sub={restingV != null && statusLabel[restingStatus] !== '—' ? statusLabel[restingStatus] : 'rest/charge state'}
        />
        <StatBox
          {...p}
          isDark={isDark}
          label="Condition"
          value={
            lvStatus === 'no_recent_data'
              ? 'No recent data'
              : lvStatus === 'estimate_unavailable'
                ? 'Unavailable'
                : isCalib
                  ? 'Calibrating'
                  : isStab
                    ? 'Estimated'
                    : cond === 'good'
                      ? 'Healthy'
                      : cond === 'watch'
                        ? 'Monitor'
                        : cond === 'attention'
                          ? 'Attention'
                          : '—'
          }
          colorClass={
            isCalib
              ? (isDark ? 'text-blue-400' : 'text-blue-500')
              : isStab
                ? (isDark ? 'text-amber-400' : 'text-amber-500')
                : cond === 'good'
                  ? (isDark ? 'text-emerald-400' : 'text-emerald-500')
                  : cond === 'watch'
                    ? (isDark ? 'text-amber-400' : 'text-amber-500')
                    : cond === 'attention'
                      ? (isDark ? 'text-red-400' : 'text-red-500')
                      : p.textMuted
          }
          sub="interpreted status"
        />
        <StatBox {...p} isDark={isDark} label="Confidence" value={matConf ?? '—'} sub="maturity level" />
      </div>

      {!isCalib && !isStab && (cond === 'watch' || cond === 'attention') && (
        <div className={`${p.cardClass} p-4 flex items-start gap-3 ${
          cond === 'attention'
            ? (isDark ? 'border-red-500/30 bg-red-500/5' : 'border-red-200 bg-red-50/80')
            : (isDark ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-200 bg-amber-50/80')
        }`}>
          <Icon name="alert-circle" className={`w-4 h-4 mt-0.5 shrink-0 ${
            cond === 'attention'
              ? (isDark ? 'text-red-400' : 'text-red-600')
              : (isDark ? 'text-amber-400' : 'text-amber-600')
          }`} />
          <div>
            <p className={`text-sm font-semibold ${
              cond === 'attention'
                ? (isDark ? 'text-red-300' : 'text-red-700')
                : (isDark ? 'text-amber-300' : 'text-amber-700')
            }`}>
              {cond === 'attention' ? 'Batterie kritisch' : 'Batterie kritisch beobachten'}
            </p>
            <p className={`text-xs mt-0.5 ${p.textSecondary}`}>
              {cond === 'attention'
                ? 'Ruhespannung bzw. geschätzte Batteriegesundheit kritisch — Starthilfe oder Austausch empfohlen. Startschwierigkeiten wahrscheinlich.'
                : 'Niedrige Ruhespannung oder geschätzte Batteriegesundheit unter Schwelle — Startschwierigkeiten möglich, Ladezustand und Lichtmaschine prüfen.'}
            </p>
          </div>
        </div>
      )}

      {!isCalib && ((bat?.watchpoints?.length ?? 0) > 0 || (bat?.recommendations?.length ?? 0) > 0) && (
        <div className={`${p.cardClass} p-5 space-y-4`}>
          {(bat?.watchpoints?.length ?? 0) > 0 && <><h3 className={`text-sm font-semibold mb-2 ${p.textPrimary}`}>Watchpoints</h3><WatchpointList items={bat!.watchpoints} isDark={isDark} textSecondary={p.textSecondary} /></>}
          {(bat?.recommendations?.length ?? 0) > 0 && <><h3 className={`text-sm font-semibold mb-2 ${p.textPrimary}`}>Recommendations</h3><RecommendationList items={bat!.recommendations} isDark={isDark} textSecondary={p.textSecondary} /></>}
        </div>
      )}
    </>
  );
}

/* ─── DTC ─── */
function DtcDetail({ isDark, active, all, ...p }: DetailProps & { active: any[]; all: any[] }) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatBox {...p} isDark={isDark} label="Active DTCs" value={`${active.length}`} colorClass={active.length > 0 ? (isDark ? 'text-red-400' : 'text-red-500') : (isDark ? 'text-emerald-400' : 'text-emerald-500')} sub={active.length > 0 ? 'requires attention' : 'no active codes'} />
        <StatBox {...p} isDark={isDark} label="Total Historical" value={`${all.length}`} sub="all-time codes" />
        <StatBox {...p} isDark={isDark} label="Status" value={active.length === 0 ? 'Clear' : active.length >= 3 ? 'Critical' : 'Warning'} colorClass={
          active.length === 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-500') : active.length >= 3 ? (isDark ? 'text-red-400' : 'text-red-500') : (isDark ? 'text-amber-400' : 'text-amber-500')
        } />
      </div>

      {active.length > 0 && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>Active Error Codes</h3>
          <div className="space-y-2">
            {active.map((d: any, i: number) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isDark ? 'bg-red-500/5 border border-red-500/20' : 'bg-red-50 border border-red-200/50'}`}>
                <Icon name="alert-circle" className={`w-4 h-4 shrink-0 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
                <span className={`text-xs font-mono font-bold ${isDark ? 'text-red-300' : 'text-red-700'}`}>{d.code ?? d.dtcCode ?? 'DTC'}</span>
                <span className={`text-xs flex-1 ${p.textSecondary}`}>{d.description ?? d.label ?? ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── SERVICE ─── */
function ServiceDetail({ isDark, service: svc, ...p }: DetailProps & { service: ServiceInfoStatus | null }) {
  const pct = svc?.serviceRemainingPercent ?? null;
  // Mercedes fleet-clearance only ships time_to_next_service (days) today,
  // not distance_to_next_service (km). Surface that gap explicitly rather
  // than rendering "—" which looks like a data bug.
  const hmActive = svc?.hmServiceSource === true;
  const kmMissingFromOem = hmActive && svc?.hmDistanceFromOem === false;
  const timeMissingFromOem = hmActive && svc?.hmTimeFromOem === false;
  const kmValue =
    svc?.serviceRemainingKm != null
      ? `${svc.serviceRemainingKm.toLocaleString('de-DE')}`
      : kmMissingFromOem
        ? 'n/a'
        : '—';
  const kmSub = kmMissingFromOem ? 'vom OEM nicht geliefert' : 'estimated';
  const timeSub = timeMissingFromOem ? 'vom OEM nicht geliefert' : 'until due';
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox {...p} isDark={isDark} label="Service Remaining" value={pct != null ? `${Math.round(pct)}%` : '—'} colorClass={pct != null ? getMetricColor(pct, isDark) : p.textMuted} sub="until next service" />
        <StatBox {...p} isDark={isDark} label="Remaining KM" value={kmValue} sub={kmSub} colorClass={kmMissingFromOem ? p.textMuted : undefined} />
        <StatBox {...p} isDark={isDark} label="Remaining Time" value={fmtRemTime(svc?.serviceRemainingMonths ?? null)} sub={timeSub} />
        <StatBox {...p} isDark={isDark} label="Last Service" value={fmtDate(svc?.lastServiceDate ?? null)} sub={svc?.lastServiceWorkshop ?? ''} />
      </div>

      {hmActive && kmMissingFromOem && (
        <div className={`${p.cardClass} p-3 text-xs ${p.textMuted} flex items-center gap-2`}>
          <Icon name="info" className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Kilometer bis zum nächsten Service werden vom OEM aktuell nicht gestreamt — nur Tage verfügbar.
          </span>
        </div>
      )}

      {svc?.serviceHistory && svc.serviceHistory.length > 0 && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>Service History</h3>
          <div className="space-y-2">
            {svc.serviceHistory.slice(0, 10).map(h => (
              <div key={h.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isDark ? 'bg-neutral-800/40' : 'bg-gray-50'}`}>
                <Icon name="clock" className={`w-3 h-3 ${p.textMuted}`} />
                <span className={`text-xs font-medium ${p.textPrimary}`}>{fmtDate(h.date)}</span>
                <span className={`text-[10px] ${p.textMuted}`}>{h.eventType}</span>
                {h.odometerKm != null && <span className={`text-[10px] ${p.textMuted}`}>{h.odometerKm.toLocaleString('de-DE')} km</span>}
                {h.workshopName && <span className={`text-[10px] ${p.textMuted}`}>{h.workshopName}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── TÜV ─── */
function TuevDetail({ isDark, service: svc, ...p }: DetailProps & { service: ServiceInfoStatus | null }) {
  const remMo = svc?.tuvRemainingMonths ?? null;
  const pct = remMo != null ? Math.min(100, Math.max(0, (remMo / 24) * 100)) : null;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatBox {...p} isDark={isDark} label="Valid Until" value={fmtDate(svc?.tuvValidTill ?? null)} colorClass={
          remMo != null && remMo <= 2 ? (isDark ? 'text-red-400' : 'text-red-500') : remMo != null && remMo <= 6 ? (isDark ? 'text-amber-400' : 'text-amber-500') : undefined
        } sub="TÜV expiry" />
        <StatBox {...p} isDark={isDark} label="Remaining" value={fmtRemTime(remMo)} colorClass={
          remMo != null && remMo <= 2 ? (isDark ? 'text-red-400' : 'text-red-500') : remMo != null && remMo <= 6 ? (isDark ? 'text-amber-400' : 'text-amber-500') : (isDark ? 'text-emerald-400' : 'text-emerald-500')
        } />
        <StatBox {...p} isDark={isDark} label="Last TÜV" value={fmtDate(svc?.tuvLastDate ?? null)} sub="previous inspection" />
      </div>

      {svc?.tuvHistory && svc.tuvHistory.length > 0 && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>TÜV History</h3>
          <div className="space-y-2">
            {svc.tuvHistory.map(h => (
              <div key={h.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isDark ? 'bg-neutral-800/40' : 'bg-gray-50'}`}>
                <Icon name="clock" className={`w-3 h-3 ${p.textMuted}`} />
                <span className={`text-xs font-medium ${p.textPrimary}`}>{fmtDate(h.date)}</span>
                {h.workshopName && <span className={`text-[10px] ${p.textMuted}`}>{h.workshopName}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── BOKraft ─── */
function BokraftDetail({ isDark, service: svc, ...p }: DetailProps & { service: ServiceInfoStatus | null }) {
  const remMo = svc?.bokraftRemainingMonths ?? null;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatBox {...p} isDark={isDark} label="Valid Until" value={fmtDate(svc?.bokraftValidTill ?? null)} colorClass={
          remMo != null && remMo <= 1 ? (isDark ? 'text-red-400' : 'text-red-500') : remMo != null && remMo <= 3 ? (isDark ? 'text-amber-400' : 'text-amber-500') : undefined
        } sub="BOKraft expiry" />
        <StatBox {...p} isDark={isDark} label="Remaining" value={fmtRemTime(remMo)} colorClass={
          remMo != null && remMo <= 1 ? (isDark ? 'text-red-400' : 'text-red-500') : remMo != null && remMo <= 3 ? (isDark ? 'text-amber-400' : 'text-amber-500') : (isDark ? 'text-emerald-400' : 'text-emerald-500')
        } />
        <StatBox {...p} isDark={isDark} label="Last BOKraft" value={fmtDate(svc?.bokraftLastDate ?? null)} sub="previous inspection" />
      </div>

      {svc?.bokraftHistory && svc.bokraftHistory.length > 0 && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>BOKraft History</h3>
          <div className="space-y-2">
            {svc.bokraftHistory.map(h => (
              <div key={h.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isDark ? 'bg-neutral-800/40' : 'bg-gray-50'}`}>
                <Icon name="clock" className={`w-3 h-3 ${p.textMuted}`} />
                <span className={`text-xs font-medium ${p.textPrimary}`}>{fmtDate(h.date)}</span>
                {h.workshopName && <span className={`text-[10px] ${p.textMuted}`}>{h.workshopName}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── DRIVER FEEDBACK ─── */
function DriverFeedbackDetail({ isDark, ...p }: DetailProps) {
  return (
    <div className={`${p.cardClass} p-8 text-center`}>
      <Icon name="message-square" className={`w-10 h-10 mx-auto mb-3 ${p.textMuted}`} />
      <p className={`text-sm font-semibold ${p.textPrimary}`}>No Driver Feedback Recorded</p>
      <p className={`text-xs mt-1 ${p.textSecondary}`}>Driver feedback will appear here once submitted through the driver app.</p>
    </div>
  );
}

/* ─── ALERTS ─── */
function AlertsDetail({ isDark, tires, brakeSummary, brakeDetail, battery, dtcActive, ...p }: DetailProps & {
  tires: TireHealthSummaryResponse | null;
  brakeSummary: BrakeHealthSummary | null;
  brakeDetail: BrakeHealthDetail | null;
  battery: BatteryHealthSummary | null;
  dtcActive: any[];
}) {
  const allAlerts: { source: string; severity: 'critical' | 'warning' | 'info'; message: string }[] = [];

  (tires?.alerts ?? []).forEach(a => allAlerts.push({ source: 'Tires', severity: a.severity, message: a.message }));
  (brakeSummary?.baselineWarnings ?? []).forEach(w =>
    allAlerts.push({ source: 'Brakes', severity: 'warning', message: w }),
  );
  (brakeSummary?.provenanceWarnings ?? []).forEach(w =>
    allAlerts.push({ source: 'Brakes', severity: 'info', message: w }),
  );
  (brakeDetail?.alerts ?? []).forEach((a) =>
    allAlerts.push({
      source: 'Brakes',
      severity: a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info',
      message: a.message,
    }),
  );
  (battery?.watchpoints ?? []).forEach(w => allAlerts.push({ source: 'Battery', severity: 'warning', message: w }));
  if (dtcActive.length > 0) allAlerts.push({ source: 'DTC', severity: dtcActive.length >= 3 ? 'critical' : 'warning', message: `${dtcActive.length} active error code(s)` });

  const critical = allAlerts.filter(a => a.severity === 'critical');
  const warning = allAlerts.filter(a => a.severity === 'warning');
  const info = allAlerts.filter(a => a.severity === 'info');

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <StatBox {...p} isDark={isDark} label="Critical" value={`${critical.length}`} colorClass={critical.length > 0 ? (isDark ? 'text-red-400' : 'text-red-500') : (isDark ? 'text-emerald-400' : 'text-emerald-500')} />
        <StatBox {...p} isDark={isDark} label="Warning" value={`${warning.length}`} colorClass={warning.length > 0 ? (isDark ? 'text-amber-400' : 'text-amber-500') : (isDark ? 'text-emerald-400' : 'text-emerald-500')} />
        <StatBox {...p} isDark={isDark} label="Info" value={`${info.length}`} />
      </div>

      {allAlerts.length > 0 ? (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>All Alerts</h3>
          <div className="space-y-2">
            {allAlerts.map((a, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                a.severity === 'critical' ? (isDark ? 'bg-red-500/5 border border-red-500/20' : 'bg-red-50 border border-red-200/50')
                : a.severity === 'warning' ? (isDark ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-amber-50 border border-amber-200/50')
                : (isDark ? 'bg-neutral-800/40 border border-neutral-700/40' : 'bg-gray-50 border border-gray-200')
              }`}>
                {a.severity === 'critical' ? <Icon name="shield-alert" className={`w-4 h-4 shrink-0 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
                : a.severity === 'warning' ? <Icon name="alert-triangle" className={`w-4 h-4 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
                : <Icon name="activity" className={`w-4 h-4 shrink-0 ${p.textMuted}`} />}
                <span className={`text-[10px] font-semibold uppercase ${p.textMuted} w-16 shrink-0`}>{a.source}</span>
                <span className={`text-xs flex-1 ${p.textSecondary}`}>{a.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={`${p.cardClass} p-8 text-center`}>
          <Icon name="check-circle" className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-emerald-400' : 'text-emerald-500'}`} />
          <p className={`text-sm font-semibold ${p.textPrimary}`}>No Active Alerts</p>
          <p className={`text-xs mt-1 ${p.textSecondary}`}>All monitored components are within normal parameters.</p>
        </div>
      )}
    </>
  );
}
