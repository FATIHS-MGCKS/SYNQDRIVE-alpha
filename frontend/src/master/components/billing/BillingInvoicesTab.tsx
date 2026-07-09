import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminBillingInvoiceDto } from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import {
  formatDateDe,
  formatMoneyCents,
  invoiceStatusLabel,
  invoiceStatusTone,
  parsePaginated,
} from './admin-billing.utils';
import { BillingAdminInvoiceDrawer } from './BillingAdminInvoiceDrawer';

export function BillingInvoicesTab() {
  const [invoices, setInvoices] = useState<AdminBillingInvoiceDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<AdminBillingInvoiceDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (search.trim()) params.search = search.trim();
      if (status !== 'all') params.status = status.toUpperCase();
      const res = await api.billing.adminInvoices(params);
      const parsed = parsePaginated<AdminBillingInvoiceDto>(res);
      setInvoices(parsed.data);
      setTotal(parsed.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(t);
  }, [load]);

  const inputClass =
    'w-full px-3 py-2 rounded-xl border border-border/70 bg-background text-xs outline-none focus:border-[var(--brand)]';

  if (loading && !invoices.length) {
    return <SkeletonCard className="h-64" />;
  }

  if (error && !invoices.length) {
    return <ErrorState title="Rechnungen nicht verfügbar" description={error} onRetry={() => void load()} />;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px] gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechnungsnummer suchen…"
            className={inputClass}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="all">Alle Status</option>
            <option value="paid">Bezahlt</option>
            <option value="open">Offen</option>
            <option value="void">Storniert</option>
          </select>
        </div>
        <p className="text-[11px] text-muted-foreground">{invoices.length} von {total} Rechnungen</p>

        {invoices.length === 0 ? (
          <EmptyState compact title="Noch keine Rechnungen vorhanden." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="bg-muted/40">
                  {['Organisation', 'Rechnungsnr.', 'Zeitraum', 'Status', 'Ausgestellt', 'Brutto', 'PDF'].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const gross = inv.grossAmountCents ?? inv.amountCents;
                  return (
                    <tr
                      key={inv.id}
                      className="border-t border-border/50 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setSelected(inv)}
                    >
                      <td className="px-3 py-2.5 text-xs">
                        {inv.subscription?.organization.companyName ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono">
                        {inv.stripeInvoiceId ?? inv.id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {formatDateDe(inv.periodStart)} – {formatDateDe(inv.periodEnd)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${invoiceStatusTone(inv.status)}`}
                        >
                          {invoiceStatusLabel(inv.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {formatDateDe(inv.invoiceDate)}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-semibold tabular-nums">
                        {formatMoneyCents(gross, (inv.currency ?? 'EUR').toUpperCase())}
                      </td>
                      <td className="px-3 py-2.5 text-xs" onClick={(e) => e.stopPropagation()}>
                        {inv.invoicePdfUrl ? (
                          <a
                            href={inv.invoicePdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--brand)] hover:underline"
                          >
                            PDF
                          </a>
                        ) : (
                          <span className="text-muted-foreground/50" title="Kein PDF">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BillingAdminInvoiceDrawer
        invoice={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  );
}
