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

  const attention = organizations.filter((o) => o.warnings.length > 0);

  const kpis = [
    {
      label: 'MRR',
      value: mrrIncomplete ? '—' : formatMoneyEuros(overview.mrr),
      meta: mrrIncomplete ? 'Preisstaffeln fehlen' : 'Aus letzten bezahlten Rechnungen',
    },
    {
      label: 'ARR',
      value: mrrIncomplete ? '—' : formatMoneyEuros(overview.arr),
      meta: 'MRR × 12',
    },
    { label: 'Aktive Abos', value: String(overview.activeSubscriptions), meta: 'Subscriptions ACTIVE' },
    { label: 'Testphase', value: String(overview.trialingSubscriptions), meta: 'TRIALING' },
    { label: 'Überfällig', value: String(overview.pastDueSubscriptions), meta: 'PAST_DUE' },
    { label: 'Offene Rechnungen', value: String(overview.openInvoices), meta: 'Status OPEN' },
    {
      label: 'Ohne Zahlungsmethode',
      value: String(overview.missingPaymentMethods),
      meta: 'Aktive Abos ohne PM',
    },
    {
      label: 'Abrechenbare Fahrzeuge',
      value: String(overview.billableConnectedVehicles),
      meta: 'Verbunden & billable',
    },
    {
      label: 'Preis nicht konfiguriert',
      value: String(overview.organizationsWithPriceNotConfigured),
      meta: 'Orgs ohne Preisversion',
    },
    {
      label: 'Stripe Sync Fehler',
      value: String(overview.stripeSyncErrors),
      meta: 'Fehlgeschlagene Webhooks',
    },
  ];

  return (
    <div className="space-y-5">
      {mrrIncomplete && (
        <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          MRR/ARR können nicht vollständig berechnet werden
          {overview.mrrIncompleteReason ? ` (${overview.mrrIncompleteReason})` : ''}, weil
          Preisstaffeln fehlen oder nicht veröffentlicht sind. Angezeigte Werte basieren nur auf
          historischen Rechnungen.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {kpis.map((kpi) => (
          <MetricCard key={kpi.label} label={kpi.label} value={kpi.value} hint={kpi.meta} />
        ))}
      </div>

      <div className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Attention Queue</h3>
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
                    {row.warnings.map((w) => (
                      <span
                        key={w}
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold sq-tone-warning"
                      >
                        {warningLabel(w)}
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
