import { MetricCard, StatusChip } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { EmptyState, ErrorState, SkeletonCard } from '../../components/patterns/states';
import type { BillingOverviewOperationalDto, PaginatedBillingSubscriptionsResponse } from './types';
import {
  formatDateDe,
  formatMoneyEuros,
  formatRelativeDe,
  platformBillingHealthTone,
} from './billing.utils';
import { BillingAttentionChip } from './BillingStatusChips';

interface BillingOverviewViewProps {
  overview: BillingOverviewOperationalDto;
  attention: PaginatedBillingSubscriptionsResponse | null;
  onOpenSubscription: (organizationId: string) => void;
  onGoSubscriptions: (filters?: Record<string, string>) => void;
  onGoReconciliation: () => void;
  onGoInvoices: () => void;
}

export function BillingOverviewView({
  overview,
  attention,
  onOpenSubscription,
  onGoSubscriptions,
  onGoReconciliation,
  onGoInvoices,
}: BillingOverviewViewProps) {
  const kpis = [
    {
      label: 'Aktive Verträge',
      value: String(overview.activeSubscriptions),
      onClick: () => onGoSubscriptions({ billingDomainStatus: 'ACTIVE' }),
    },
    {
      label: 'Past Due',
      value: String(overview.pastDueSubscriptions),
      status: overview.pastDueSubscriptions > 0 ? ('critical' as const) : undefined,
      onClick: () => onGoSubscriptions({ billingDomainStatus: 'PAST_DUE' }),
    },
    {
      label: 'Offene Abweichungen',
      value: String(overview.openReconciliationDrifts),
      status: overview.openReconciliationDrifts > 0 ? ('critical' as const) : undefined,
      onClick: onGoReconciliation,
    },
    {
      label: 'Fehlzahlungen',
      value: String(overview.failedPayments),
      status: overview.failedPayments > 0 ? ('critical' as const) : undefined,
      onClick: () => onGoSubscriptions({ billingAttention: 'critical' }),
    },
    {
      label: 'Trials ≤ 7 Tage',
      value: String(overview.trialsExpiringCount),
      status: overview.trialsExpiringCount > 0 ? ('warning' as const) : undefined,
      onClick: () => onGoSubscriptions({ billingTrial: 'expiring' }),
    },
    {
      label: 'Webhook-Fehler',
      value: String(overview.webhookFailures),
      status: overview.webhookFailures > 0 ? ('warning' as const) : undefined,
      onClick: onGoReconciliation,
    },
  ];

  return (
    <div className="space-y-5" data-testid="master-billing-overview">
      <div className="surface-premium p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <StatusChip tone={platformBillingHealthTone(overview.billingHealth)} dot className="text-sm">
            {overview.billingHealthLabel}
          </StatusChip>
          <p className="text-xs text-muted-foreground">
            Letzter Abgleich: {formatDateDe(overview.reconciliationLastRunAt)} · Letzter Webhook:{' '}
            {formatDateDe(overview.lastSuccessfulWebhookAt)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            className="text-left"
            onClick={kpi.onClick}
          >
            <MetricCard
              label={kpi.label}
              value={kpi.value}
              status={kpi.status}
              valueSize="compact"
            />
          </button>
        ))}
      </div>

      {!overview.mrrIncomplete && overview.mrr != null ? (
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <MetricCard label="MRR" value={formatMoneyEuros(overview.mrr)} valueSize="compact" />
          <MetricCard label="ARR" value={formatMoneyEuros(overview.arr)} valueSize="compact" />
        </div>
      ) : (
        <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          MRR/ARR nicht vollständig berechenbar
          {overview.mrrIncompleteReason ? ` (${overview.mrrIncompleteReason})` : ''}.
          Offene Rechnungen:{' '}
          <button type="button" className="text-[var(--brand)] font-semibold" onClick={onGoInvoices}>
            {overview.openInvoices} anzeigen
          </button>
        </div>
      )}

      <div className="surface-premium p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Aufmerksamkeit</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Verträge mit Handlungsbedarf — sortiert nach Schweregrad.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => onGoSubscriptions({ billingAttention: 'yes' })}>
            Alle anzeigen
          </Button>
        </div>

        {!attention || attention.data.length === 0 ? (
          <EmptyState compact title="Keine offenen Aufmerksamkeitspunkte." />
        ) : (
          <div className="space-y-2">
            {attention.data.map((row) => (
              <button
                key={row.organizationId}
                type="button"
                className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                onClick={() => onOpenSubscription(row.organizationId)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{row.companyName}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.tariffLabel ?? '—'} · Verlängerung {formatRelativeDe(row.nextChargeAt)}
                  </p>
                </div>
                <BillingAttentionChip attention={row.attention} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function BillingOverviewSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonCard className="h-20" />
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="h-20" />
        ))}
      </div>
      <SkeletonCard className="h-48" />
    </div>
  );
}

export function BillingOverviewError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <ErrorState
      title="Billing-Übersicht nicht verfügbar"
      description={message}
      onRetry={onRetry}
    />
  );
}
