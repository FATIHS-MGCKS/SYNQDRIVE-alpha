import { useState, useEffect } from 'react';
import {
  ArrowLeft, CircleDot, Disc, Battery, AlertCircle, Wrench, ShieldCheck,
  Calendar, MessageSquare, Bell, Activity, TrendingDown, TrendingUp,
  CheckCircle, AlertTriangle, ShieldAlert, Clock, Zap, Sparkles, ChevronRight
} from 'lucide-react';
import {
  api,
  type TireHealthSummaryResponse,
  type TireHealthDetailResponse,
  type BrakeStatus,
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

const CATEGORY_META: Record<ConditionCategory, { label: string; icon: typeof CircleDot }> = {
  tires: { label: 'Tire Condition & Wear Projection', icon: CircleDot },
  brakes: { label: 'Brake Condition & Wear Analysis', icon: Disc },
  battery: { label: 'Battery Health & Degradation', icon: Battery },
  dtc: { label: 'Error Codes & Diagnostics', icon: AlertCircle },
  service: { label: 'Service Interval Analysis', icon: Wrench },
  tuev: { label: 'TÜV Validity & Planning', icon: ShieldCheck },
  bokraft: { label: 'BOKraft Validity & Planning', icon: Calendar },
  'driver-feedback': { label: 'Driver Feedback', icon: MessageSquare },
  alerts: { label: 'Alerts & Watchpoints', icon: Bell },
};

function getProgressColor(v: number) { return v >= 70 ? 'bg-emerald-500' : v >= 40 ? 'bg-amber-500' : 'bg-red-500'; }
function getProgressTrack(d: boolean) { return d ? 'bg-neutral-700/50' : 'bg-gray-200/80'; }
function getMetricColor(v: number, d: boolean) { return v >= 70 ? (d ? 'text-emerald-400' : 'text-emerald-500') : v >= 40 ? (d ? 'text-amber-400' : 'text-amber-500') : (d ? 'text-red-400' : 'text-red-500'); }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }
function fmtRemTime(mo: number | null) { if (mo == null) return '—'; if (mo < 0) return 'Overdue'; const m = Math.round(mo); return m >= 12 ? `${Math.floor(m / 12)}y ${m % 12}mo` : `${m} months`; }

export function FleetConditionDetailView({ isDarkMode, vehicleId, category, onBack }: FleetConditionDetailViewProps) {
  const isDark = isDarkMode;
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;

  const [loading, setLoading] = useState(true);
  const [tiresSummary, setTiresSummary] = useState<TireHealthSummaryResponse | null>(null);
  const [tiresDetail, setTiresDetail] = useState<TireHealthDetailResponse | null>(null);
  const [brakes, setBrakes] = useState<BrakeStatus | null>(null);
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
      promises.push(api.vehicleIntelligence.brakeStatus(vehicleId).then(setBrakes).catch(() => null));
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
        api.vehicleIntelligence.brakeStatus(vehicleId).then(setBrakes).catch(() => null),
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
        <button onClick={onBack} className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className={`p-2.5 rounded-xl ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'}`}>
          <Icon className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
        </div>
        <div>
          <h1 className={`text-lg font-bold tracking-tight ${textPrimary}`}>{meta.label}</h1>
          <p className={`text-xs mt-0.5 ${textSecondary}`}>Predictive maintenance analysis and wear projection</p>
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
          {category === 'brakes' && <BrakesDetail isDark={isDark} brakes={brakes} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'battery' && <BatteryDetail isDark={isDark} battery={battery} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'dtc' && <DtcDetail isDark={isDark} active={dtcActive} all={dtcAll} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'service' && <ServiceDetail isDark={isDark} service={service} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'tuev' && <TuevDetail isDark={isDark} service={service} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'bokraft' && <BokraftDetail isDark={isDark} service={service} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'driver-feedback' && <DriverFeedbackDetail isDark={isDark} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}
          {category === 'alerts' && <AlertsDetail isDark={isDark} tires={tiresSummary} brakes={brakes} battery={battery} dtcActive={dtcActive} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted} />}

          {/* ─── AI Analysis Box ─── */}
          <div className={`${cardClass} p-5`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-xl ${isDark ? 'bg-purple-500/15' : 'bg-purple-50'}`}>
                <Sparkles className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
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
                            <TrendingDown className={`w-3 h-3 mt-0.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
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
                          <CheckCircle className={`w-3 h-3 mt-0.5 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
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
          <AlertTriangle className={`w-3 h-3 mt-0.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
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
          <CheckCircle className={`w-3 h-3 mt-0.5 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
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
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox {...p} isDark={isDark} label="Tread Life" value={`${Math.round(pct)}%`} colorClass={getMetricColor(pct, isDark)} sub={s?.healthStatus ?? ''} />
        <StatBox {...p} isDark={isDark} label="Remaining KM" value={s?.overallRemainingKm != null ? `~${Math.round(s.overallRemainingKm / 1000)}k` : '—'} sub="projected wear limit" />
        <StatBox {...p} isDark={isDark} label="Wear Rate" value={s?.wearRateMmPer1000km != null ? `${s.wearRateMmPer1000km.toFixed(2)} mm/1k` : '—'} sub="estimated per 1,000 km" />
        <StatBox {...p} isDark={isDark} label="Confidence" value={s?.confidenceLabel ?? '—'} sub={s?.confidenceScore != null ? `Score: ${s.confidenceScore}` : ''} colorClass={
          (s?.confidenceScore ?? 0) >= 70 ? (isDark ? 'text-emerald-400' : 'text-emerald-500') : (s?.confidenceScore ?? 0) >= 40 ? (isDark ? 'text-amber-400' : 'text-amber-500') : p.textMuted
        } />
      </div>

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
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
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
function BrakesDetail({ isDark, brakes: b, ...p }: DetailProps & { brakes: BrakeStatus | null }) {
  const pad = b?.padWearPercent ?? 0;
  const condColor = b?.condition === 'good' ? (isDark ? 'text-emerald-400' : 'text-emerald-500') : b?.condition === 'watch' ? (isDark ? 'text-amber-400' : 'text-amber-500') : (isDark ? 'text-red-400' : 'text-red-500');
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox {...p} isDark={isDark} label="Pad Life" value={b?.padWearPercent != null ? `${Math.round(pad)}%` : '—'} colorClass={b?.padWearPercent != null ? getMetricColor(pad, isDark) : p.textMuted} sub="brake pad remaining" />
        <StatBox {...p} isDark={isDark} label="KM Since Service" value={b?.kmSinceService != null ? `${b.kmSinceService.toLocaleString('de-DE')}` : '—'} sub="kilometers" />
        <StatBox {...p} isDark={isDark} label="Condition" value={b?.condition === 'good' ? 'Healthy' : b?.condition === 'watch' ? 'Monitor' : b?.condition === 'attention' ? 'Attention' : '—'} colorClass={condColor} sub={`Confidence: ${b?.dataConfidence ?? '—'}`} />
        <StatBox {...p} isDark={isDark} label="Braking Behavior" value={b?.drivingImpact.brakingBehavior !== 'unknown' ? b?.drivingImpact.brakingBehavior ?? '—' : '—'} sub={b?.drivingImpact.harshBrakesPer100km != null ? `${b.drivingImpact.harshBrakesPer100km}/100km harsh` : ''} colorClass={
          b?.drivingImpact.brakingBehavior === 'aggressive' ? (isDark ? 'text-red-400' : 'text-red-500')
          : b?.drivingImpact.brakingBehavior === 'elevated' ? (isDark ? 'text-amber-400' : 'text-amber-500')
          : undefined
        } />
      </div>

      {/* Driving Impact */}
      {b?.drivingImpact && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>Driving Impact on Brake Wear</h3>
          <div className="grid grid-cols-3 gap-4">
            <div><p className={`text-[10px] uppercase tracking-wider font-semibold ${p.textMuted}`}>Harsh Brakes (90d)</p><p className={`text-lg font-bold mt-1 ${p.textPrimary}`}>{b.drivingImpact.totalHarshBrakes90d}</p></div>
            <div><p className={`text-[10px] uppercase tracking-wider font-semibold ${p.textMuted}`}>Per 100 km</p><p className={`text-lg font-bold mt-1 ${b.drivingImpact.harshBrakesPer100km != null && b.drivingImpact.harshBrakesPer100km > 5 ? (isDark ? 'text-amber-400' : 'text-amber-500') : p.textPrimary}`}>{b.drivingImpact.harshBrakesPer100km ?? '—'}</p></div>
            <div><p className={`text-[10px] uppercase tracking-wider font-semibold ${p.textMuted}`}>Total KM (90d)</p><p className={`text-lg font-bold mt-1 ${p.textPrimary}`}>{b.drivingImpact.totalKm90d.toLocaleString('de-DE')}</p></div>
          </div>
        </div>
      )}

      {/* Watchpoints + Recs */}
      {((b?.watchpoints?.length ?? 0) > 0 || (b?.recommendations?.length ?? 0) > 0) && (
        <div className={`${p.cardClass} p-5 space-y-4`}>
          {(b?.watchpoints?.length ?? 0) > 0 && <><h3 className={`text-sm font-semibold mb-2 ${p.textPrimary}`}>Watchpoints</h3><WatchpointList items={b!.watchpoints} isDark={isDark} textSecondary={p.textSecondary} /></>}
          {(b?.recommendations?.length ?? 0) > 0 && <><h3 className={`text-sm font-semibold mb-2 ${p.textPrimary}`}>Recommendations</h3><RecommendationList items={b!.recommendations} isDark={isDark} textSecondary={p.textSecondary} /></>}
        </div>
      )}

      {/* History */}
      {b?.history && b.history.length > 0 && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>Service History</h3>
          <div className="space-y-2">
            {b.history.slice(0, 10).map(h => (
              <div key={h.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isDark ? 'bg-neutral-800/40' : 'bg-gray-50'}`}>
                <Clock className={`w-3 h-3 ${p.textMuted}`} />
                <span className={`text-xs font-medium ${p.textPrimary}`}>{fmtDate(h.date)}</span>
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
  const pubState = bat?.currentState?.publicationState;
  const isCalib = pubState === 'INITIAL_CALIBRATION';
  const isStab = pubState === 'STABILIZING';
  const soh = isCalib ? null : (bat?.currentState?.publishedSohPct ?? bat?.currentState?.sohPercent ?? null);
  const volt = bat?.currentState?.voltageV;
  const cond = bat?.condition;
  const matConf = bat?.currentState?.maturityConfidence;

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
        <StatBox {...p} isDark={isDark} label={isStab ? 'Estimated SOH' : 'SOH'} value={isCalib ? 'Calibrating' : soh != null ? `${isStab ? '~' : ''}${Math.round(soh)}%` : '—'} colorClass={isCalib ? (isDark ? 'text-blue-400' : 'text-blue-500') : isStab ? (isDark ? 'text-amber-400' : 'text-amber-500') : soh != null ? getMetricColor(soh, isDark) : p.textMuted} sub={isCalib ? 'collecting data' : isStab ? 'stabilizing' : 'state of health'} />
        <StatBox {...p} isDark={isDark} label="Voltage" value={volt != null ? `${volt.toFixed(1)}V` : '—'} sub="current reading" />
        <StatBox {...p} isDark={isDark} label="Condition" value={isCalib ? 'Calibrating' : isStab ? 'Estimated' : cond === 'good' ? 'Healthy' : cond === 'watch' ? 'Monitor' : cond === 'attention' ? 'Attention' : '—'} colorClass={
          isCalib ? (isDark ? 'text-blue-400' : 'text-blue-500') : isStab ? (isDark ? 'text-amber-400' : 'text-amber-500') : cond === 'good' ? (isDark ? 'text-emerald-400' : 'text-emerald-500') : cond === 'watch' ? (isDark ? 'text-amber-400' : 'text-amber-500') : cond === 'attention' ? (isDark ? 'text-red-400' : 'text-red-500') : p.textMuted
        } sub="interpreted status" />
        <StatBox {...p} isDark={isDark} label="Confidence" value={matConf ?? '—'} sub="maturity level" />
      </div>

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
                <AlertCircle className={`w-4 h-4 shrink-0 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
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
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox {...p} isDark={isDark} label="Service Remaining" value={pct != null ? `${Math.round(pct)}%` : '—'} colorClass={pct != null ? getMetricColor(pct, isDark) : p.textMuted} sub="until next service" />
        <StatBox {...p} isDark={isDark} label="Remaining KM" value={svc?.serviceRemainingKm != null ? `${svc.serviceRemainingKm.toLocaleString('de-DE')}` : '—'} sub="estimated" />
        <StatBox {...p} isDark={isDark} label="Remaining Time" value={fmtRemTime(svc?.serviceRemainingMonths ?? null)} sub="until due" />
        <StatBox {...p} isDark={isDark} label="Last Service" value={fmtDate(svc?.lastServiceDate ?? null)} sub={svc?.lastServiceWorkshop ?? ''} />
      </div>

      {svc?.serviceHistory && svc.serviceHistory.length > 0 && (
        <div className={`${p.cardClass} p-5`}>
          <h3 className={`text-sm font-semibold mb-3 ${p.textPrimary}`}>Service History</h3>
          <div className="space-y-2">
            {svc.serviceHistory.slice(0, 10).map(h => (
              <div key={h.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isDark ? 'bg-neutral-800/40' : 'bg-gray-50'}`}>
                <Clock className={`w-3 h-3 ${p.textMuted}`} />
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
                <Clock className={`w-3 h-3 ${p.textMuted}`} />
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
                <Clock className={`w-3 h-3 ${p.textMuted}`} />
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
      <MessageSquare className={`w-10 h-10 mx-auto mb-3 ${p.textMuted}`} />
      <p className={`text-sm font-semibold ${p.textPrimary}`}>No Driver Feedback Recorded</p>
      <p className={`text-xs mt-1 ${p.textSecondary}`}>Driver feedback will appear here once submitted through the driver app.</p>
    </div>
  );
}

/* ─── ALERTS ─── */
function AlertsDetail({ isDark, tires, brakes, battery, dtcActive, ...p }: DetailProps & {
  tires: TireHealthSummaryResponse | null;
  brakes: BrakeStatus | null;
  battery: BatteryHealthSummary | null;
  dtcActive: any[];
}) {
  const allAlerts: { source: string; severity: 'critical' | 'warning' | 'info'; message: string }[] = [];

  (tires?.alerts ?? []).forEach(a => allAlerts.push({ source: 'Tires', severity: a.severity, message: a.message }));
  (brakes?.watchpoints ?? []).forEach(w => allAlerts.push({ source: 'Brakes', severity: 'warning', message: w }));
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
                {a.severity === 'critical' ? <ShieldAlert className={`w-4 h-4 shrink-0 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
                : a.severity === 'warning' ? <AlertTriangle className={`w-4 h-4 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
                : <Activity className={`w-4 h-4 shrink-0 ${p.textMuted}`} />}
                <span className={`text-[10px] font-semibold uppercase ${p.textMuted} w-16 shrink-0`}>{a.source}</span>
                <span className={`text-xs flex-1 ${p.textSecondary}`}>{a.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={`${p.cardClass} p-8 text-center`}>
          <CheckCircle className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-emerald-400' : 'text-emerald-500'}`} />
          <p className={`text-sm font-semibold ${p.textPrimary}`}>No Active Alerts</p>
          <p className={`text-xs mt-1 ${p.textSecondary}`}>All monitored components are within normal parameters.</p>
        </div>
      )}
    </>
  );
}
