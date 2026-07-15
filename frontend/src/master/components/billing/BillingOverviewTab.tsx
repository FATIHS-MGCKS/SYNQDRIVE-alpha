import type { AdminBillingOverviewDto, AdminOrgBillingRowDto } from '../../types/admin-billing.types';
import { MetricCard } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import { formatMoneyEuros, warningLabel } from './admin-billing.utils';

interface BillingOverviewTabProps {
  overview: AdminBillingOverviewDto;
  organizations: AdminOrgBillingRowDto[];
  onSelectOrg: (orgId: string) => void;
  onGoOrganizations: () => void;
}

export function BillingOverviewTab({
  overview,
  organizations,
  onSelectOrg,
  onGoOrganizations,
}: BillingOverviewTabProps) {
  const mrrIncomplete = overview.mrrIncomplete ?? !overview.pricingConfigured;
  const attention = organizations.filter((organization) => organization.warnings.length > 0);

  const kpis = [
    {
      label: 'MRR',
      value: mrrIncomplete ? '—' : formatMoneyEuros(overview.mrr),
      meta: mrrIncomplete ? 'Preisstaffeln fehlen' : 'Monatlich wiederkehrend',
    },
    {
      label: 'Aktive Verträge',
      value: String(overview.activeSubscriptions),
      meta: 'Status ACTIVE',
    },
    {
      label: 'Trials',
      value: String(overview.trialingSubscriptions),
      meta: 'Status TRIALING',
    },
    {
      label: 'Past Due',
      value: String(overview.pastDueSubscriptions),
      meta: 'Überfällige Verträge',
      status: overview.pastDueSubscriptions > 0 ? 'warning' as const : undefined,
    },
    {
      label: 'Offene Rechnungen',
      value: String(overview.openInvoices),
      meta: 'Status OPEN',
      status: overview.openInvoices > 0 ? 'warning' as const : undefined,
    },
    {
      label: 'Fehlzahlungen',
      value: String(overview.failedPayments ?? 0),
      meta: 'Status FAILED',
      status: (overview.failedPayments ?? 0) > 0 ? 'critical' as const : undefined,
    },
    {
      label: 'Ohne Zahlungsmethode',
      value: String(overview.missingPaymentMethods),
      meta: 'Aktive Verträge ohne PM',
      status: overview.missingPaymentMethods > 0 ? 'warning' as const : undefined,
    },
    {
      label: 'Drift',
      value: String(overview.reconciliationDrifts ?? 0),
      meta: 'Offene Abweichungen',
      status: (overview.reconciliationDrifts ?? 0) > 0 ? 'critical' as const : undefined,
    },
    {
      label: 'Fehlgeschlagene E-Mails',
      value: String(overview.failedEmailDeliveries ?? 0),
      meta: 'Outbox Dead Letter',
      status: (overview.failedEmailDeliveries ?? 0) > 0 ? 'critical' as const : undefined,
    },
  ];

  return (
    <div className="space-y-5" data-testid="master-billing-overview">
      {mrrIncomplete ? (
        <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          MRR kann nicht vollständig berechnet werden
          {overview.mrrIncompleteReason ? ` (${overview.mrrIncompleteReason})` : ''}, weil
          Preisstaffeln fehlen oder nicht veröffentlicht sind.
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <MetricCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            hint={kpi.meta}
            status={kpi.status}
            valueSize="compact"
          />
        ))}
      </div>

      <div className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Aufmerksamkeit erforderlich</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Organisationen mit Billing-Warnungen
            </p>
          </div>
          <button
            type="button"
            onClick={onGoOrganizations}
            className="text-[11px] font-semibold text-[var(--brand)] hover:underline"
          >
            Alle anzeigen
          </button>
        </div>

        {attention.length === 0 ? (
          <EmptyState compact title="Keine offenen Billing-Warnungen" />
        ) : (
          <div className="divide-y divide-border/50">
            {attention.slice(0, 12).map((row) => (
              <button
                key={row.organization.id}
                type="button"
                onClick={() => onSelectOrg(row.organization.id)}
                className="w-full flex items-center justify-between gap-4 py-3 text-left hover:bg-muted/30 px-2 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {row.organization.companyName}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {row.warnings.map((warning) => (
                      <span
                        key={warning}
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold sq-tone-warning"
                      >
                        {warningLabel(warning)}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {row.billableVehicleCount} Fahrzeuge
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
