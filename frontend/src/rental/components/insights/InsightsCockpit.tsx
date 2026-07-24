import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert, TrendingDown, Zap, type LucideIcon } from 'lucide-react';
import type { Money } from '@synq/money/money.contract';
import { Icon } from '../ui/Icon';
import { useDashboardInsights, type DashboardInsight } from '../../DashboardInsightsContext';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { api, type MisuseCaseRecord } from '../../../lib/api';
import {
  financialImpactMoney,
  insightRecommendation,
  matchesStationIdFilter,
  partitionInsights,
} from '../../lib/insights-categories';
import {
  estimatedFinancialRiskMoney,
  formatEvaluationsMoneyDisplay,
  resolveEvaluationsCockpitMoney,
} from '../../lib/evaluations/evaluations-money';
import { minorToWholeMajorUnits } from '@synq/money/money.util';
import { EmptyState } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';

interface InsightsCockpitProps {
  isDarkMode: boolean;
  stationId?: string | null;
  /** Canonical overdue receivables (minor + currency). */
  financialRisk?: Money | null;
  /** Canonical open receivables (minor + currency). */
  openReceivables?: Money | null;
  /** @deprecated Use `financialRisk` — whole major EUR for backward compatibility. */
  financialRiskEur?: number;
  /** @deprecated Use `openReceivables` — whole major EUR for backward compatibility. */
  openReceivablesEur?: number;
}

interface InsightKpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: 'critical' | 'watch' | 'info';
  accent?: boolean;
}

function InsightKpiCard({
  label,
  value,
  icon: MetricIcon,
  tone,
  accent = false,
}: InsightKpiCardProps) {
  const isCritical = tone === 'critical' && accent;
  const isWatch = tone === 'watch' && accent;
  const isInfo = tone === 'info' && accent;

  return (
    <div
      className={cn(
        'relative overflow-hidden border text-left',
        'min-h-[96px] rounded-lg surface-premium/55 px-2.5 py-2',
        isCritical && 'border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.035]',
        isWatch && 'border-[color:var(--status-watch)]/30 surface-premium/55',
        isInfo && 'border-border/45 surface-premium/55',
        !isCritical && !isWatch && !isInfo && 'border-border/45',
      )}
      aria-label={`${label}: ${value}`}
    >
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              'mt-1 text-[21px] font-semibold tabular-nums leading-none tracking-[-0.03em]',
              isCritical && 'text-[color:var(--status-critical)]',
              isWatch && 'text-[color:var(--status-watch)]',
              isInfo && 'text-[color:var(--status-info)]',
              !isCritical && !isWatch && !isInfo && 'text-foreground',
            )}
          >
            {value}
          </p>
        </div>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            isCritical && 'sq-tone-critical',
            isWatch && 'sq-tone-watch',
            isInfo && 'sq-tone-info',
            !isCritical && !isWatch && !isInfo && 'bg-muted text-muted-foreground',
          )}
        >
          <MetricIcon className="h-3 w-3" />
        </div>
      </div>
      {isCritical ? (
        <span
          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--status-critical)]"
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === 'CRITICAL'
      ? 'sq-tone-critical'
      : severity === 'WARNING'
        ? 'sq-tone-warning'
        : severity === 'OPPORTUNITY'
          ? 'sq-tone-brand'
          : 'sq-tone-neutral';
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cls}`}>
      {severity}
    </span>
  );
}

function InsightCard({ insight, isDarkMode }: { insight: DashboardInsight; isDarkMode: boolean }) {
  const impactMoney = financialImpactMoney(insight);
  const impact =
    impactMoney != null ? minorToWholeMajorUnits(impactMoney.amountMinor, impactMoney.currency) : null;
  const rec = insightRecommendation(insight);
  const m = insight.metrics as Record<string, unknown> | null | undefined;
  const bookingId = (m?.bookingId ?? insight.timeContext?.bookingId) as string | undefined;
  const customerId = (m?.customerId ?? insight.timeContext?.customerId) as string | undefined;

  return (
    <article
      className={`rounded-xl border p-3 ${isDarkMode ? 'surface-premium border-border' : 'bg-white border-gray-200'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-xs font-semibold text-foreground leading-snug">{insight.title}</h4>
        <SeverityBadge severity={insight.severity} />
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{insight.message}</p>
      {(impact != null || bookingId || customerId) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
          {impact != null && <span className="sq-tone-warning px-1.5 py-0.5 rounded-md">≈ {impact} € Risiko</span>}
          {bookingId && <span className="px-1.5 py-0.5 rounded-md border border-border">Buchung</span>}
          {customerId && <span className="px-1.5 py-0.5 rounded-md border border-border">Kunde</span>}
        </div>
      )}
      {insight.reasons && insight.reasons.length > 0 && (
        <ul className="mt-2 text-[10px] text-muted-foreground/90 list-disc pl-4 space-y-0.5">
          {insight.reasons.slice(0, 3).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] font-medium text-[color:var(--brand)]">→ {rec}</p>
    </article>
  );
}

function RunStateBanner({
  hasRun,
  stale,
  error,
  loading,
}: {
  hasRun: boolean;
  stale: boolean;
  error: boolean;
  loading: boolean;
}) {
  if (loading) return null;
  if (error) {
    return (
      <div className="rounded-xl p-3 sq-tone-critical text-xs font-medium flex items-center gap-2">
        <Icon name="alert-circle" className="w-4 h-4 shrink-0" />
        Insights konnten nicht geladen werden.
      </div>
    );
  }
  if (!hasRun) {
    return (
      <div className="rounded-xl p-3 sq-tone-neutral text-xs">
        Insights wurden für diese Organisation noch nicht berechnet. Der nächste Lauf erfolgt automatisch.
      </div>
    );
  }
  if (stale) {
    return (
      <div className="rounded-xl p-3 sq-tone-warning text-xs">
        Insights sind möglicherweise veraltet — letzter Lauf liegt zurück.
      </div>
    );
  }
  return null;
}

function MisuseAbuseSection({ orgId, isDarkMode }: { orgId: string; isDarkMode: boolean }) {
  const [rows, setRows] = useState<MisuseCaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.misuseCases
      .list(orgId, { limit: 8, page: 1 })
      .then((res) => {
        if (cancelled) return;
        setRows(Array.isArray(res?.data) ? res.data : []);
        setErrored(false);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setErrored(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return (
    <section className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="w-4 h-4 text-[color:var(--status-watch)]" />
        <h3 className="text-[12px] font-semibold text-foreground">Nutzungsauffälligkeiten</h3>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Lade Missbrauchs- & Risikosignale…</p>
      ) : errored ? (
        <p className="text-xs text-muted-foreground">Signale konnten nicht geladen werden.</p>
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          title="Keine aktiven Auffälligkeiten"
          description="Fahrverhalten wird nach abgeschlossenen Fahrten ausgewertet."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const title = String(row.title ?? row.type ?? 'Auffälligkeit');
            const desc = String(row.description ?? '');
            const sev = String(row.severity ?? 'WATCH');
            const action = String(row.recommendedAction ?? 'Rückgabe genauer prüfen.');
            return (
              <article
                key={String(row.id)}
                className={`rounded-xl border p-3 text-[11px] ${isDarkMode ? 'border-border' : 'border-gray-200'}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-foreground">{title}</span>
                  <SeverityBadge severity={sev === 'CRITICAL' ? 'CRITICAL' : sev === 'HIGH' ? 'WARNING' : 'INFO'} />
                </div>
                {desc && <p className="text-muted-foreground leading-relaxed">{desc}</p>}
                <p className="mt-1.5 text-[10px] font-medium text-[color:var(--brand)]">→ {action}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function InsightsCockpit({
  isDarkMode,
  stationId = null,
  financialRisk = null,
  openReceivables = null,
  financialRiskEur = 0,
  openReceivablesEur = 0,
}: InsightsCockpitProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const { response, loading, error } = useDashboardInsights();

  const vehicleStationById = useMemo(() => {
    const m = new Map<string, string | null | undefined>();
    for (const v of fleetVehicles) m.set(v.id, v.stationId);
    return m;
  }, [fleetVehicles]);

  const filteredInsights = useMemo(() => {
    const list = response?.insights ?? [];
    return list.filter((i) => matchesStationIdFilter(i, stationId, vehicleStationById));
  }, [response?.insights, stationId, vehicleStationById]);

  const { businessRisks, revenueLeakage, recommended } = useMemo(
    () => partitionInsights(filteredInsights),
    [filteredInsights],
  );

  const resolvedFinancialRisk = useMemo(
    () => resolveEvaluationsCockpitMoney(financialRisk, financialRiskEur),
    [financialRisk, financialRiskEur],
  );
  const resolvedOpenReceivables = useMemo(
    () => resolveEvaluationsCockpitMoney(openReceivables, openReceivablesEur),
    [openReceivables, openReceivablesEur],
  );

  const estimatedRisk = useMemo(() => {
    return estimatedFinancialRiskMoney(resolvedFinancialRisk, [
      ...businessRisks,
      ...revenueLeakage,
    ]);
  }, [businessRisks, revenueLeakage, resolvedFinancialRisk]);

  const criticalBookings = businessRisks.filter((i) => i.severity === 'CRITICAL').length;
  const hasRun = response?.hasRun ?? false;
  const stale = response?.stale ?? false;

  return (
    <div className="space-y-4">
      <RunStateBanner hasRun={hasRun} stale={stale} error={error} loading={loading} />

      <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 lg:grid-cols-5">
        <InsightKpiCard
          label="Business Risks"
          value={String(businessRisks.length)}
          icon={AlertTriangle}
          tone="critical"
          accent={businessRisks.length > 0}
        />
        <InsightKpiCard
          label="Finanzrisiko (geschätzt)"
          value={`≈ ${formatEvaluationsMoneyDisplay(estimatedRisk)}`}
          icon={TrendingDown}
          tone="watch"
          accent={estimatedRisk.amountMinor > 0}
        />
        <InsightKpiCard
          label="Offene Forderungen"
          value={formatEvaluationsMoneyDisplay(resolvedOpenReceivables)}
          icon={Zap}
          tone="info"
          accent={resolvedOpenReceivables.amountMinor > 0}
        />
        <InsightKpiCard
          label="Kritische Buchungen"
          value={String(criticalBookings)}
          icon={AlertTriangle}
          tone="critical"
          accent={criticalBookings > 0}
        />
        <InsightKpiCard
          label="Revenue Leakage"
          value={String(revenueLeakage.length)}
          icon={TrendingDown}
          tone="watch"
          accent={revenueLeakage.length > 0}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
          <h3 className="text-[12px] font-semibold mb-3 text-foreground">Geschäftsrisiken</h3>
          {loading ? (
            <p className="text-xs text-muted-foreground">Lade…</p>
          ) : businessRisks.length === 0 ? (
            <EmptyState compact title="Keine aktiven Geschäftsrisiken" description="Operative Risiken erscheinen hier mit Buchungsbezug." />
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {businessRisks.map((i) => (
                <InsightCard key={i.id} insight={i} isDarkMode={isDarkMode} />
              ))}
            </div>
          )}
        </section>

        <section className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
          <h3 className="text-[12px] font-semibold mb-3 text-foreground">Umsatzverlust / Umsatzrisiken</h3>
          {loading ? (
            <p className="text-xs text-muted-foreground">Lade…</p>
          ) : revenueLeakage.length === 0 ? (
            <EmptyState compact title="Keine Leakage-Signale" description="Unterauslastung und offene Forderungen erscheinen hier." />
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {revenueLeakage.map((i) => (
                <InsightCard key={i.id} insight={i} isDarkMode={isDarkMode} />
              ))}
            </div>
          )}
        </section>
      </div>

      {orgId && <MisuseAbuseSection key={orgId} orgId={orgId} isDarkMode={isDarkMode} />}

      <section className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <h3 className="text-[12px] font-semibold mb-3 text-foreground">Empfohlene Maßnahmen</h3>
        {recommended.length === 0 ? (
          <p className="text-xs text-muted-foreground">Keine dringenden Empfehlungen — weiter beobachten.</p>
        ) : (
          <ul className="space-y-2">
            {recommended.slice(0, 6).map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-[11px]">
                <span className="text-[color:var(--brand)] font-bold">•</span>
                <span>
                  <span className="font-semibold text-foreground">{i.title}</span>
                  <span className="text-muted-foreground"> — {insightRecommendation(i)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
