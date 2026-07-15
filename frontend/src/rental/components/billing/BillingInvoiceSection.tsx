import { useEffect, useMemo, useRef, useState } from 'react';
import type { BillingInvoiceDto } from '../../types/billing.types';
import {
  formatDateDe,
  formatMoneyCents,
  invoiceStatusLabel,
  invoiceStatusTone,
} from './billing.utils';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { BillingInvoiceDetailDrawer } from './BillingInvoiceDetailDrawer';
import { Icon } from '../ui/Icon';
import type { BillingInvoicesQuery } from './useBillingInvoices';
import type { BillingPaginatedMeta } from './billing-query.utils';

interface BillingInvoiceSectionProps {
  invoices: BillingInvoiceDto[];
  loading?: boolean;
  error?: string | null;
  meta?: BillingPaginatedMeta | null;
  query?: BillingInvoicesQuery;
  onQueryChange?: (query: BillingInvoicesQuery) => void;
  onRetry?: () => void;
}

type StatusFilter = 'all' | 'PAID' | 'OPEN' | 'OVERDUE';

function invoiceNumber(inv: BillingInvoiceDto): string {
  return (
    (inv as BillingInvoiceDto & { invoiceNumberLabel?: string }).invoiceNumberLabel ??
    (inv as BillingInvoiceDto & { invoiceNumber?: string }).invoiceNumber ??
    `RE-${inv.id.slice(0, 8).toUpperCase()}`
  );
}

function mapStatusFilter(status: StatusFilter): string | undefined {
  if (status === 'all') return undefined;
  if (status === 'OVERDUE') return 'OPEN';
  return status;
}

export function BillingInvoiceSection({
  invoices,
  loading = false,
  error = null,
  meta = null,
  query,
  onQueryChange,
  onRetry,
}: BillingInvoiceSectionProps) {
  const [search, setSearch] = useState(query?.search ?? '');
  const [status, setStatus] = useState<StatusFilter>(
    query?.status === 'PAID' || query?.status === 'OPEN' ? (query.status as StatusFilter) : 'all',
  );
  const [selected, setSelected] = useState<BillingInvoiceDto | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onQueryChange?.({
        ...(queryRef.current ?? {}),
        page: 1,
        search: search.trim() || undefined,
        status: mapStatusFilter(status),
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, status, onQueryChange]);

  const totalLabel = useMemo(() => {
    const total = meta?.total ?? invoices.length;
    return `${invoices.length} von ${total} Rechnungen`;
  }, [invoices.length, meta?.total]);

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-background text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]';

  if (loading && invoices.length === 0) {
    return <SkeletonCard className="h-56 rounded-2xl" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Rechnungen konnten nicht geladen werden"
        description={error}
        onRetry={onRetry ? () => void onRetry() : undefined}
        retryLabel="Erneut versuchen"
      />
    );
  }

  return (
    <>
      <div className="surface-premium rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              Rechnungen
            </h3>
            <p className="text-[12px] mt-0.5 text-muted-foreground">{totalLabel}</p>
          </div>
          {loading ? (
            <span className="text-[11px] text-muted-foreground">Aktualisiere…</span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_200px] gap-3 mb-4">
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechnungsnummer suchen…"
              className={`${inputClass} !pl-9`}
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className={inputClass}
          >
            <option value="all">Alle Status</option>
            <option value="PAID">Bezahlt</option>
            <option value="OPEN">Offen</option>
            <option value="OVERDUE">Überfällig</option>
          </select>
        </div>

        {invoices.length === 0 ? (
          <EmptyState
            compact
            icon={<Icon name="file-text" className="w-5 h-5" />}
            title="Noch keine Rechnungen vorhanden."
            description={search || status !== 'all' ? 'Passe Suche oder Filter an.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="bg-muted/40">
                  {['Rechnungsnr.', 'Zeitraum', 'Betrag', 'Status', 'Aktion'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground last:text-right"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const gross =
                    inv.grossAmountCents ??
                    (inv as BillingInvoiceDto & { grossAmount?: { cents: number } }).grossAmount
                      ?.cents ??
                    inv.amountCents ??
                    (typeof inv.amount === 'number' ? Math.round(inv.amount * 100) : null);
                  const statusRaw =
                    (inv as BillingInvoiceDto & { statusLabel?: string }).statusLabel ??
                    inv.displayStatus ??
                    inv.status;
                  const currency = (inv.currency ?? 'EUR').toUpperCase();

                  return (
                    <tr
                      key={inv.id}
                      className="border-t border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => setSelected(inv)}
                    >
                      <td className="px-3 py-2.5 text-[12px] font-medium text-foreground">
                        {invoiceNumber(inv)}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                        {formatDateDe(inv.periodStart)} – {formatDateDe(inv.periodEnd)}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] font-semibold tabular-nums">
                        {formatMoneyCents(gross, currency)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ${invoiceStatusTone(statusRaw)}`}
                        >
                          {invoiceStatusLabel(statusRaw)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setSelected(inv)}>
                          Details
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || (query?.page ?? 1) <= 1}
              onClick={() =>
                onQueryChange?.({
                  ...(query ?? {}),
                  page: Math.max(1, (query?.page ?? 1) - 1),
                })
              }
            >
              Zurück
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Seite {meta.page} von {meta.totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || (query?.page ?? 1) >= meta.totalPages}
              onClick={() =>
                onQueryChange?.({
                  ...(query ?? {}),
                  page: (query?.page ?? 1) + 1,
                })
              }
            >
              Weiter
            </Button>
          </div>
        ) : null}
      </div>

      <BillingInvoiceDetailDrawer
        invoice={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  );
}
