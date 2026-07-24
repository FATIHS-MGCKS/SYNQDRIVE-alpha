import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert, TrendingDown, Zap, type LucideIcon } from 'lucide-react';
import type { DashboardInsight } from '../../DashboardInsightsContext';
import { useRentalOrg } from '../../RentalContext';
import { api, type MisuseCaseRecord } from '../../../lib/api';
import { financialImpactEur, insightRecommendation } from '../../lib/insights-categories';
import { useEvaluationsInsightsAnalytics } from '../../hooks/useEvaluationsInsightsAnalytics';
import { EmptyState } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';

interface InsightsCockpitProps {
  isDarkMode: boolean;
  stationId?: string | null;
  financialRiskEur?: number;
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

function RunStateBanner({
  hasRun,
  stale,
  error,
  loading,
}: {
  hasRun: boolean;
  stale: boolean;
  error: string | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <p className="text-[11px] text-muted-foreground" role="status">
        Insights werden geladen…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-[11px] text-[color:var(--status-critical)]" role="alert">
        Insights konnten nicht geladen werden: {error}
      </p>
    );
  }
  if (!hasRun) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Noch keine Insight-Berechnung für diese Organisation — KPIs erscheinen nach dem ersten Lauf.
      </p>
    );
  }
  if (stale) {
    return (
      <p className="text-[11px] text-[color:var(--status-watch)]">
        Daten möglicherweise veraltet — letzte Berechnung liegt zurück.
      </p>
    );
  }
  return null;
}

function InsightCard({ insight, isDarkMode }: { insight: DashboardInsight; isDarkMode: boolean }) {
  const impact = financialImpactEur(insight);
  return (
    <article
      className={`rounded-xl border p-3 text-[11px] ${isDarkMode ? 'border-border' : 'border-gray-200'}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-semibold text-foreground">{insight.title}</span>
        <SeverityBadge severity={insight.severity} />
      </div>
      <p className="text-muted-foreground leading-relaxed">{insight.message}</p>
      {impact != null && impact > 0 ? (
        <p className="mt-1 text-[10px] font-medium text-[color:var(--status-watch)]">
          Geschätzte Exposition: ≈ {impact.toLocaleString('de-DE')} €
        </p>
      ) : null}
      <p className="mt-1.5 text-[10px] font-medium text-[color:var(--brand)]">
        → {insightRecommendation(insight)}
      </p>
    </article>
  );
}

function MisuseAbuseSection({ orgId, isDarkMode }: { orgId: string; isDarkMode: boolean }) {
  const [rows, setRows] = useState<MisuseCaseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.misuseCases
      .list(orgId, { page: 1, limit: 8 })
      .then((res) => {
        if (!cancelled) setRows(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
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
      <h3 className="text-[12px] font-semibold mb-3 text-foreground flex items-center gap-2">
        <ShieldAlert className="h-3.5 w-3.5 text-[color:var(--status-watch)]" />
        Nutzungsauffälligkeiten
      </h3>
      {loading ? (
        <p className="text-xs text-muted-foreground">Lade…</p>
      ) : rows.length === 0 ? (
        <EmptyState compact title="Keine Auffälligkeiten" description="Misuse-Signale erscheinen hier separat paginiert." />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const title = row.title ?? row.type ?? 'Auffälligkeit';
            const desc = row.description ?? '';
            const sev = row.severity ?? 'INFO';
            const action = row.recommendedAction ?? 'Prüfen';
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
  financialRiskEur = 0,
  openReceivablesEur = 0,
}: InsightsCockpitProps) {
  const { orgId } = useRentalOrg();
  const { summary, businessRisks, revenueLeakage, loading, error } = useEvaluationsInsightsAnalytics({
    orgId,
    stationId,
    listLimit: 50,
  });

  const recommended = useMemo(() => {
    const combined = [...businessRisks, ...revenueLeakage] as DashboardInsight[];
    return combined
      .filter((i) => i.severity === 'CRITICAL' || i.severity === 'WARNING')
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 6);
  }, [businessRisks, revenueLeakage]);

  const estimatedRiskMinor =
    (summary?.estimatedFinancialExposureMinor ?? 0) + Math.round(financialRiskEur * 100);
  const estimatedRiskEur = Math.round(estimatedRiskMinor / 100);

  const hasRun = summary?.hasRun ?? false;
  const stale = summary?.stale ?? false;

  return (
    <div className="space-y-4">
      <RunStateBanner hasRun={hasRun} stale={stale} error={error} loading={loading} />

      <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 lg:grid-cols-5">
        <InsightKpiCard
          label="Business Risks"
          value={String(summary?.counts.businessRisks ?? 0)}
          icon={AlertTriangle}
          tone="critical"
          accent={(summary?.counts.businessRisks ?? 0) > 0}
        />
        <InsightKpiCard
          label="Finanzrisiko (geschätzt)"
          value={`≈ ${estimatedRiskEur.toLocaleString('de-DE')} €`}
          icon={TrendingDown}
          tone="watch"
          accent={estimatedRiskEur > 0}
        />
        <InsightKpiCard
          label="Offene Forderungen"
          value={`${openReceivablesEur.toLocaleString('de-DE')} €`}
          icon={Zap}
          tone="info"
          accent={openReceivablesEur > 0}
        />
        <InsightKpiCard
          label="Kritische Buchungen"
          value={String(summary?.counts.criticalBusinessRisks ?? 0)}
          icon={AlertTriangle}
          tone="critical"
          accent={(summary?.counts.criticalBusinessRisks ?? 0) > 0}
        />
        <InsightKpiCard
          label="Revenue Leakage"
          value={String(summary?.counts.revenueLeakage ?? 0)}
          icon={TrendingDown}
          tone="watch"
          accent={(summary?.counts.revenueLeakage ?? 0) > 0}
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
                <InsightCard key={i.id} insight={i as DashboardInsight} isDarkMode={isDarkMode} />
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
                <InsightCard key={i.id} insight={i as DashboardInsight} isDarkMode={isDarkMode} />
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
            {recommended.map((i) => (
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
