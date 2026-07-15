import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminBillingInvoiceDto } from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import {
  formatDateDe,
  formatMoneyCents,
  parsePaginated,
} from './admin-billing.utils';
import { BillingAdminInvoiceDrawer } from './BillingAdminInvoiceDrawer';
import {
  MASTER_INVOICE_FILTERS,
  formatAttemptCount,
  invoiceDisplayStatusLabel,
  invoiceDisplayStatusTone,
  masterInvoiceFilterToQuery,
  resolveInvoiceDisplayStatus,
  type MasterInvoiceFilter,
} from './master-invoices.utils';

const PAGE_SIZE = 25;

export function BillingInvoicesTab() {
  const [invoices, setInvoices] = useState<AdminBillingInvoiceDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MasterInvoiceFilter>('all');
  const [selected, setSelected] = useState<AdminBillingInvoiceDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(PAGE_SIZE),
        ...masterInvoiceFilterToQuery(filter),
      };
      if (search.trim()) params.search = search.trim();
      const res = await api.billing.adminInvoices(params);
      const parsed = parsePaginated<AdminBillingInvoiceDto>(res);
      setInvoices(parsed.data);
      setTotal(parsed.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  const inputClass =
    'w-full px-3 py-2 rounded-xl border border-border/70 bg-background text-xs outline-none focus:border-[var(--brand)]';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading && !invoices.length) {
    return <SkeletonCard className="h-64" data-testid="master-invoices-loading" />;
  }

  if (error && !invoices.length) {
    return (
      <ErrorState
        title="Rechnungen nicht verfügbar"
        description={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <>
      <div className="space-y-4" data-testid="master-invoices-tab">
        <div className="flex flex-wrap gap-2">
          {MASTER_INVOICE_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`master-invoice-filter-${item.id}`}
              onClick={() => setFilter(item.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold ${
                filter === item.id
                  ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                  : 'bg-muted/40 text-muted-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechnungsnummer oder Stripe-ID suchen…"
          className={inputClass}
          data-testid="master-invoices-search"
        />

        {error ? (
          <p className="text-xs sq-tone-warning rounded-lg px-3 py-2">{error}</p>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          {invoices.length} von {total} Rechnungen · Seite {page}/{totalPages}
        </p>

        {invoices.length === 0 ? (
          <EmptyState compact title="Keine Rechnungen für diesen Filter." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[1280px]" data-testid="master-invoices-table">
              <thead>
                <tr className="bg-muted/40">
                  {[
                    'Unternehmen',
                    'Rechnungsnr.',
                    'Status',
                    'Netto',
                    'Steuer',
                    'Brutto',
                    'Offen',
                    'Fälligkeit',
                    'Bezahlt am',
                    'Versuche',
                    'Zahlungsmethode',
                  ].map((header) => (
                    <th
                      key={header}
                      className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const displayStatus = resolveInvoiceDisplayStatus(invoice);
                  const currency = (invoice.currency ?? 'EUR').toUpperCase();
                  const gross = invoice.grossAmountCents ?? invoice.amountCents;
                  return (
                    <tr
                      key={invoice.id}
                      className="border-t border-border/50 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setSelected(invoice)}
                    >
                      <td className="px-3 py-2.5 text-xs">
                        {invoice.subscription?.organization.companyName ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono">
                        {invoice.invoiceNumberDisplay ?? invoice.invoiceNumber ?? invoice.id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${invoiceDisplayStatusTone(displayStatus)}`}
                        >
                          {invoiceDisplayStatusLabel(displayStatus)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums">
                        {formatMoneyCents(invoice.netAmountCents, currency)}
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums">
                        {formatMoneyCents(invoice.taxAmountCents, currency)}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-semibold tabular-nums">
                        {formatMoneyCents(gross, currency)}
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums">
                        {formatMoneyCents(invoice.amountRemainingCents, currency)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {formatDateDe(invoice.dueDate)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {formatDateDe(invoice.paidAt)}
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums">
                        {formatAttemptCount(invoice.paymentSummary?.attemptCount)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {invoice.paymentSummary?.paymentMethodLabel ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="px-3 py-1.5 rounded-lg text-xs border border-border/70 disabled:opacity-50"
          >
            Zurück
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
            className="px-3 py-1.5 rounded-lg text-xs border border-border/70 disabled:opacity-50"
          >
            Weiter
          </button>
        </div>
      </div>

      <BillingAdminInvoiceDrawer
        invoice={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onUpdated={() => void load()}
      />
    </>
  );
}
