import { Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { useEffectiveHealth } from '../FleetContext';
import {
  api,
  type TireHealthSummaryResponse,
  type BatteryHealthSummary,
  type ServiceInfoStatus,
  type OilChangeStatus,
  type BrakeHealthSummary,
} from '../../lib/api';
import {
  deriveInsights,
  type ReadinessLevel,
  type CostOutlookLevel,
  type DowntimeRiskLevel,
} from './vehicle-insights-logic';
import {
  type PlanningItem,
  kmDisplayIsUrgent,
} from './vehicle-forecast-engine';

// ── Props ─────────────────────────────────────────────────────────────────────

interface VehicleInsightsCardProps {
  vehicleId: string | null;
  isDarkMode: boolean;
}

// ── Tone helpers ──────────────────────────────────────────────────────────────
// All three insight dimensions roll up into a small set of tones (good / watch
// / limited / critical / neutral). Each tone owns the full surface treatment
// (background + border + text + dot) so the three Mini-Tiles in the status
// strip feel like one visual family with the dot/pill in the header.

type Tone = 'good' | 'watch' | 'limited' | 'critical' | 'neutral';

function readinessTone(level: ReadinessLevel): Tone {
  switch (level) {
    case 'Ready': return 'good';
    case 'Monitor': return 'watch';
    case 'Limited': return 'limited';
    case 'Action Needed': return 'critical';
  }
}

function costOutlookTone(level: CostOutlookLevel): Tone {
  switch (level) {
    case 'Stable': return 'good';
    case 'Moderate Increase': return 'watch';
    case 'Elevated': return 'limited';
  }
}

function downtimeRiskTone(level: DowntimeRiskLevel): Tone {
  switch (level) {
    case 'Low': return 'good';
    case 'Medium': return 'watch';
    case 'High': return 'critical';
  }
}

function toneTile(tone: Tone, dm: boolean): string {
  switch (tone) {
    case 'good':
      return dm
        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'watch':
      return dm
        ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
        : 'border-amber-200 bg-amber-50 text-amber-700';
    case 'limited':
      return dm
        ? 'border-orange-500/25 bg-orange-500/10 text-orange-300'
        : 'border-orange-200 bg-orange-50 text-orange-700';
    case 'critical':
      return dm
        ? 'border-red-500/25 bg-red-500/10 text-red-300'
        : 'border-red-200 bg-red-50 text-red-700';
    case 'neutral':
      return dm
        ? 'border-white/10 bg-white/[0.03] text-neutral-400'
        : 'border-slate-100 bg-slate-50 text-slate-500';
  }
}

function toneRing(tone: Tone, dm: boolean): string {
  switch (tone) {
    case 'good':
      return dm ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25' : 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'watch':
      return dm ? 'bg-amber-500/10 text-amber-300 ring-amber-500/25' : 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'limited':
      return dm ? 'bg-orange-500/10 text-orange-300 ring-orange-500/25' : 'bg-orange-50 text-orange-700 ring-orange-200';
    case 'critical':
      return dm ? 'bg-red-500/10 text-red-300 ring-red-500/25' : 'bg-red-50 text-red-700 ring-red-200';
    case 'neutral':
      return dm ? 'bg-muted/80 text-muted-foreground ring-border/70' : 'bg-slate-50 text-slate-500 ring-slate-200';
  }
}

function toneDot(tone: Tone): string {
  switch (tone) {
    case 'good': return 'bg-emerald-500';
    case 'watch': return 'bg-amber-500';
    case 'limited': return 'bg-orange-500';
    case 'critical': return 'bg-red-500';
    case 'neutral': return 'bg-slate-400';
  }
}

function urgencyDot(urgency: PlanningItem['urgency']): string {
  switch (urgency) {
    case 'overdue': return 'bg-red-500';
    case 'due': return 'bg-red-400';
    case 'soon': return 'bg-amber-400';
    case 'normal': return 'bg-blue-300';
  }
}

// ── Mini stat tile (Readiness / Cost / Downtime) ──────────────────────────────

function StatusTile({
  label, value, tone, dm,
}: { label: string; value: string; tone: Tone; dm: boolean }) {
  return (
    <div className={`rounded-[10px] border px-2 py-1.5 ${toneTile(tone, dm)}`}>
      <div className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.06em] opacity-80">
        <span className={`h-1 w-1 rounded-full ${toneDot(tone)}`} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 truncate text-[11px] font-bold leading-tight tracking-[-0.01em]">
        {value}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function VehicleInsightsCard({ vehicleId, isDarkMode }: VehicleInsightsCardProps) {
  const { health: rentalHealth } = useEffectiveHealth(vehicleId);
  const [tires, setTires] = useState<TireHealthSummaryResponse | null>(null);
  const [brakes, setBrakes] = useState<BrakeHealthSummary | null>(null);
  const [battery, setBattery] = useState<BatteryHealthSummary | null>(null);
  const [service, setService] = useState<ServiceInfoStatus | null>(null);
  const [oil, setOil] = useState<OilChangeStatus | null>(null);
  const [dtcCount, setDtcCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!vehicleId) {
      setTires(null); setBrakes(null); setBattery(null); setService(null);
      setOil(null); setDtcCount(0); setFetchedAt(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
      api.vehicleIntelligence.brakeHealthSummary(vehicleId).catch(() => null),
      api.vehicleIntelligence.batteryHealthSummary(vehicleId).catch(() => null),
      api.vehicleIntelligence.serviceInfoStatus(vehicleId).catch(() => null),
      api.vehicleIntelligence.dtcActive(vehicleId).catch(() => []),
      api.vehicleIntelligence.oilChangeStatus(vehicleId).catch(() => null),
    ]).then(([t, b, bat, svc, dtc, oilData]) => {
      if (cancelled) return;
      setTires(t); setBrakes(b); setBattery(bat); setService(svc);
      setOil(oilData);
      setDtcCount(Array.isArray(dtc) ? dtc.length : 0);
      setFetchedAt(new Date());
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [vehicleId]);

  if (!vehicleId) return null;

  const dm = isDarkMode;
  const insights = deriveInsights({
    tires,
    brakes,
    battery,
    service,
    dtcCount,
    oil,
    errorCodesState: rentalHealth?.modules.error_codes?.state,
  });
  const { verdict, readiness, costOutlook, downtimeRisk, forecast, nextAction, confidence, hasAnyData } = insights;

  const readyTone = readinessTone(readiness);
  const costTone = costOutlookTone(costOutlook);
  const downTone = downtimeRiskTone(downtimeRisk);

  // Verdict surface — only Action Needed and Limited get a colored surface to
  // keep the visual budget for genuine alerts. Everything else renders as
  // neutral typography on the card so the operator's eye lands on the
  // status strip.
  const verdictSurface =
    readiness === 'Action Needed'
      ? dm
        ? 'border-l-red-500 bg-red-500/10 text-red-100'
        : 'border-l-red-500 bg-red-50/80 text-red-900'
      : readiness === 'Limited'
      ? dm
        ? 'border-l-orange-400 bg-orange-500/10 text-orange-100'
        : 'border-l-orange-400 bg-orange-50/80 text-orange-900'
      : null;

  return (
    <div className={`group flex h-full flex-col rounded-xl border bg-card p-3 shadow-sm transition-shadow duration-300 ease-[var(--ease-out-soft)] hover:shadow-md ${
      dm ? 'border-border/60' : 'border-border'
    }`}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
            dm ? 'border-brand/20 bg-brand-soft text-brand' : 'border-blue-100 bg-blue-50 text-blue-600'
          }`}>
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <h3 className={`text-[11px] font-bold tracking-[-0.01em] truncate ${dm ? 'text-foreground' : 'text-slate-900'}`}>
            Vehicle Insights
          </h3>
          {hasAnyData && (
            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ring-1 ${toneRing(readyTone, dm)}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${toneDot(readyTone)}`} />
              {readiness}
            </span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {loading ? (
            <Icon name="loader-2" className={`h-3 w-3 animate-spin ${dm ? 'text-muted-foreground' : 'text-slate-400'}`} />
          ) : fetchedAt ? (
            <span className={`text-[10px] font-semibold tabular-nums ${dm ? 'text-muted-foreground' : 'text-slate-400'}`}>
              {fetchedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Verdict ────────────────────────────────────────────────────────── */}
      {hasAnyData ? (
        verdictSurface ? (
          <div className={`mb-2.5 rounded-[10px] border-l-2 px-2.5 py-2 text-[10px] leading-snug font-semibold ${verdictSurface}`}>
            {verdict}
          </div>
        ) : (
          <p className={`mb-2.5 text-[10px] leading-snug font-medium ${dm ? 'text-foreground/90' : 'text-slate-700'}`}>
            {verdict}
          </p>
        )
      ) : (
        <p className={`mb-2.5 text-[10px] leading-snug ${dm ? 'text-muted-foreground' : 'text-slate-400'}`}>
          No health tracking data configured for this vehicle.
        </p>
      )}

      {/* ── Status strip ───────────────────────────────────────────────────── */}
      {hasAnyData && (
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          <StatusTile label="Readiness" value={readiness} tone={readyTone} dm={dm} />
          <StatusTile label="Cost Outlook" value={costOutlook} tone={costTone} dm={dm} />
          <StatusTile label="Downtime" value={downtimeRisk} tone={downTone} dm={dm} />
        </div>
      )}

      {/* ── Planning Horizon ───────────────────────────────────────────────── */}
      <div className="mb-3 flex-1 min-h-0">
        <div className="mb-1.5 flex items-center justify-between">
          <span className={`text-[9.5px] font-bold uppercase tracking-[0.12em] ${dm ? 'text-muted-foreground' : 'text-slate-400'}`}>
            Planning Horizon
          </span>
          {hasAnyData && forecast.length > 0 && (
            <span className={`text-[9.5px] font-semibold ${dm ? 'text-muted-foreground' : 'text-slate-400'}`}>
              {forecast.length} item{forecast.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {!hasAnyData ? (
          <p className={`text-[11px] ${dm ? 'text-muted-foreground' : 'text-slate-400'}`}>
            Connect tracking data to see upcoming planning items.
          </p>
        ) : forecast.length > 0 ? (
          <div className={`overflow-hidden rounded-[10px] border ${dm ? 'border-border/60 bg-muted/30' : 'border-slate-100 bg-slate-50/60'}`}>
            {forecast.map((item: PlanningItem, i: number) => {
              const kmUrgent = kmDisplayIsUrgent(item.displayKm);
              const timeTextCls =
                item.urgency === 'overdue' || item.urgency === 'due'
                  ? dm ? 'text-red-300' : 'text-red-600'
                  : item.urgency === 'soon'
                  ? dm ? 'text-amber-300' : 'text-amber-600'
                  : dm ? 'text-muted-foreground' : 'text-slate-500';
              return (
                <div
                  key={`${item.type}-${i}`}
                  className={`flex items-center gap-2 px-2.5 py-1.5 ${
                    i < forecast.length - 1
                      ? `border-b ${dm ? 'border-border/40' : 'border-slate-100'}`
                      : ''
                  }`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${urgencyDot(item.urgency)}`} />
                  <span className={`flex-1 min-w-0 truncate text-[11px] font-semibold ${dm ? 'text-foreground/90' : 'text-slate-800'}`}>
                    {item.title}
                  </span>
                  <div className="shrink-0 flex items-center gap-1 whitespace-nowrap">
                    {item.displayKm && (
                      <span className={`font-mono text-[10px] font-semibold tabular-nums ${
                        kmUrgent
                          ? dm ? 'text-red-300' : 'text-red-600'
                          : dm ? 'text-muted-foreground' : 'text-slate-500'
                      }`}>
                        {item.displayKm}
                      </span>
                    )}
                    {item.displayKm && item.displayTime && (
                      <span className={`text-[9px] ${dm ? 'text-muted-foreground/70' : 'text-slate-300'}`}>·</span>
                    )}
                    {item.displayTime && (
                      <span className={`font-mono text-[10px] font-semibold tabular-nums ${timeTextCls}`}>
                        {item.displayTime}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={`text-[11px] ${dm ? 'text-muted-foreground' : 'text-slate-400'}`}>
            Nothing urgent within the next 5 months.
          </p>
        )}
      </div>

      {/* ── Next Action ────────────────────────────────────────────────────── */}
      {hasAnyData && (
        <div className={`mb-2 flex items-center gap-2 rounded-[10px] border px-2.5 py-2 ${
          dm ? 'border-status-ai/25 bg-status-ai-soft' : 'border-blue-100 bg-blue-50/70'
        }`}>
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
            dm ? 'bg-status-ai-soft text-status-ai' : 'bg-white text-blue-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
          }`}>
            <Icon name="arrow-right" className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <div className={`text-[8.5px] font-bold uppercase tracking-[0.12em] ${dm ? 'text-status-ai/70' : 'text-blue-600/80'}`}>
              Next Action
            </div>
            <div className={`text-[11.5px] font-semibold leading-tight ${dm ? 'text-foreground' : 'text-blue-900'}`}>
              {nextAction}
            </div>
          </div>
        </div>
      )}

      {/* ── Confidence footer ──────────────────────────────────────────────── */}
      {hasAnyData && (
        <div className={`flex items-start gap-1.5 text-[9.5px] leading-snug ${dm ? 'text-muted-foreground' : 'text-slate-400'}`}>
          <Icon name="lock" className="h-2.5 w-2.5 mt-px shrink-0 opacity-70" />
          <span>{confidence}</span>
        </div>
      )}
    </div>
  );
}
