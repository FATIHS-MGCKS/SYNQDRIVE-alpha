import { useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal, RefreshCw, Search } from 'lucide-react';
import { DataTable } from '../../components/patterns';
import type { DataTableColumn } from '../../components/patterns';
import { MasterErrorState, MasterLoadingState, MasterTableShell } from '../shell';
import { Button } from '../../components/ui/button';
import { useBillingSubscriptionsOperational } from './useBillingOperational';
import type { BillingSubscriptionOperationalRowDto } from './types';
import {
  attentionReasonLabel,
  formatDateDe,
  formatRelativeDe,
} from './billing.utils';
import {
  BillingAttentionChip,
  BillingDomainStatusChip,
  BillingHealthChip,
} from './BillingStatusChips';

interface BillingSubscriptionsViewProps {
  onOpenSubscription: (organizationId: string) => void;
  initialFilters?: Record<string, string>;
}

function SubscriptionMobileCard({
  row,
  onOpen,
}: {
  row: BillingSubscriptionOperationalRowDto;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left rounded-xl border p-4 transition-colors hover:bg-muted/40 ${
        row.attention.severity === 'critical'
          ? 'border-l-4 border-l-[color:var(--status-critical)]'
          : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{row.companyName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{row.tariffLabel ?? '—'}</p>
        </div>
        <BillingAttentionChip attention={row.attention} compact />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <BillingDomainStatusChip status={row.domainStatus} />
        <BillingHealthChip health={row.billingHealth} />
        {row.trial.active ? (
          <span className="text-xs text-muted-foreground">Trial bis {formatDateDe(row.trial.endsAt)}</span>
        ) : null}
        <span className="text-xs text-muted-foreground">
          Verlängerung {formatRelativeDe(row.nextChargeAt)}
        </span>
      </div>
    </button>
  );
}

export function BillingSubscriptionsView({
  onOpenSubscription,
  initialFilters,
}: BillingSubscriptionsViewProps) {
  const { data, loading, error, query, setQuery, refresh } = useBillingSubscriptionsOperational();

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const page = query.page ?? 1;
  const totalPages = meta?.totalPages ?? 1;

  const updateFilter = (patch: Partial<typeof query>) => {
    setQuery({ ...query, ...patch, page: patch.page ?? 1 });
  };

  useEffect(() => {
    if (!initialFilters || Object.keys(initialFilters).length === 0) return;
    const mapped: Partial<typeof query> = {};
    if (initialFilters.billingDomainStatus) mapped.domainStatus = initialFilters.billingDomainStatus;
    if (initialFilters.billingHealth) mapped.billingHealth = initialFilters.billingHealth as typeof query.billingHealth;
    if (initialFilters.billingReconciliation) {
      mapped.reconciliationHealth = initialFilters.billingReconciliation as typeof query.reconciliationHealth;
    }
    if (initialFilters.billingTrial) mapped.trialState = initialFilters.billingTrial as typeof query.trialState;
    if (initialFilters.billingAttention) mapped.attention = initialFilters.billingAttention as typeof query.attention;
    if (Object.keys(mapped).length > 0) {
      setQuery({ page: 1, limit: 25, sort: 'attention', sortDir: 'desc', ...mapped }, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilters]);

  const columns = useMemo<DataTableColumn<BillingSubscriptionOperationalRowDto>[]>(
    () => [
      {
        key: 'attention',
        header: 'Aufmerksamkeit',
        align: 'center',
        cell: (row) => <BillingAttentionChip attention={row.attention} />,
      },
      {
        key: 'org',
        header: 'Organisation',
        cell: (row) => (
          <button
            type="button"
            className="text-left"
            onClick={() => onOpenSubscription(row.organizationId)}
          >
            <p className="text-sm font-semibold text-foreground">{row.companyName}</p>
          </button>
        ),
      },
      {
        key: 'lifecycle',
        header: 'Vertragsstatus',
        cell: (row) => <BillingDomainStatusChip status={row.domainStatus} />,
      },
      {
        key: 'billing',
        header: 'Abrechnung',
        cell: (row) => <BillingHealthChip health={row.billingHealth} />,
      },
      {
        key: 'plan',
        header: 'Plan',
        className: 'hidden lg:table-cell',
        cell: (row) => <span className="text-sm">{row.tariffLabel ?? '—'}</span>,
      },
      {
        key: 'trial',
        header: 'Testphase',
        className: 'hidden xl:table-cell',
        cell: (row) =>
          row.trial.active ? (
            <span className="text-sm text-muted-foreground">bis {formatDateDe(row.trial.endsAt)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: 'renewal',
        header: 'Verlängerung',
        className: 'hidden md:table-cell',
        cell: (row) => (
          <span className="text-sm text-muted-foreground">{formatRelativeDe(row.nextChargeAt)}</span>
        ),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        cell: (row) => (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Vertrag ${row.companyName} öffnen`}
            onClick={() => onOpenSubscription(row.organizationId)}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        ),
      },
    ],
    [onOpenSubscription],
  );

  const toolbar = (
    <div className="surface-premium p-4 space-y-3">
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl border border-border bg-[color:var(--input-background)]">
          <Search className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="search"
            aria-label="Verträge suchen"
            placeholder="Organisation suchen…"
            value={query.search ?? ''}
            onChange={(e) => updateFilter({ search: e.target.value })}
            className="flex-1 bg-transparent outline-none text-sm text-foreground"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Vertragsstatus"
            value={query.domainStatus ?? 'all'}
            onChange={(e) =>
              updateFilter({ domainStatus: e.target.value === 'all' ? undefined : e.target.value })
            }
            className="h-9 rounded-xl border border-border bg-background px-2 text-xs"
          >
            <option value="all">Alle Lifecycle</option>
            {['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCEL_SCHEDULED', 'PAUSED', 'CANCELLED', 'DRAFT'].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ),
            )}
          </select>
          <select
            aria-label="Abrechnungsgesundheit"
            value={query.billingHealth ?? 'all'}
            onChange={(e) =>
              updateFilter({
                billingHealth:
                  e.target.value === 'all' ? undefined : (e.target.value as typeof query.billingHealth),
              })
            }
            className="h-9 rounded-xl border border-border bg-background px-2 text-xs"
          >
            <option value="all">Alle Abrechnung</option>
            <option value="ok">OK</option>
            <option value="warning">Warnung</option>
            <option value="critical">Kritisch</option>
          </select>
          <select
            aria-label="Aufmerksamkeit"
            value={query.attention ?? 'all'}
            onChange={(e) =>
              updateFilter({
                attention:
                  e.target.value === 'all' ? undefined : (e.target.value as typeof query.attention),
              })
            }
            className="h-9 rounded-xl border border-border bg-background px-2 text-xs"
          >
            <option value="all">Alle Aufmerksamkeit</option>
            <option value="yes">Mit Aufmerksamkeit</option>
            <option value="critical">Kritisch</option>
            <option value="warning">Warnung</option>
          </select>
          <Button type="button" size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Aktualisieren
          </Button>
        </div>
      </div>
      {query.attention ? (
        <p className="text-xs text-muted-foreground">
          Filter aktiv: Aufmerksamkeit {query.attention}
        </p>
      ) : null}
    </div>
  );

  if (loading && !data) return <MasterLoadingState variant="card" count={3} />;
  if (error) {
    return <MasterErrorState title="Verträge nicht verfügbar" description={error} onRetry={() => void refresh()} />;
  }

  return (
    <div className="space-y-4" data-testid="master-billing-subscriptions">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">Verträge</h2>
        <p className="text-[12px] text-muted-foreground mt-1 max-w-3xl">
          Kanonische Subscription-Liste — Lifecycle, Abrechnungsgesundheit und Aufmerksamkeit aus dem Backend.
        </p>
      </div>

      <MasterTableShell toolbar={toolbar}>
        <div className="hidden md:block">
          <DataTable<BillingSubscriptionOperationalRowDto>
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.organizationId}
            onRowClick={(row) => onOpenSubscription(row.organizationId)}
            dense
          />
        </div>
        <div className="md:hidden space-y-3 p-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Keine Verträge gefunden.</p>
          ) : (
            rows.map((row) => (
              <SubscriptionMobileCard
                key={row.organizationId}
                row={row}
                onOpen={() => onOpenSubscription(row.organizationId)}
              />
            ))
          )}
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/60">
            <p className="text-xs text-muted-foreground">
              Seite {page} von {totalPages} · {meta?.total ?? 0} Verträge
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => updateFilter({ page: page - 1 })}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => updateFilter({ page: page + 1 })}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </MasterTableShell>
    </div>
  );
}

export function billingAttentionTitle(row: BillingSubscriptionOperationalRowDto): string {
  return row.attention.reasons.map(attentionReasonLabel).join(', ');
}
