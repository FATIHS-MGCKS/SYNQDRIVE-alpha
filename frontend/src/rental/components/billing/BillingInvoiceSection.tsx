import { useMemo, useState } from 'react';
import type { BillingInvoiceDto } from '../../types/billing.types';
import {
  formatDateDe,
  formatMoneyCents,
  invoiceStatusLabel,
  invoiceStatusTone,
} from './billing.utils';
import { EmptyState } from '../../../components/patterns/states';
import { BillingInvoiceDetailDrawer } from './BillingInvoiceDetailDrawer';
import { Icon } from '../ui/Icon';

interface BillingInvoiceSectionProps {
  invoices: BillingInvoiceDto[];
}

type StatusFilter = 'all' | 'paid' | 'open' | 'overdue';

export function BillingInvoiceSection({ invoices }: BillingInvoiceSectionProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortDesc, setSortDesc] = useState(true);
  const [selected, setSelected] = useState<BillingInvoiceDto | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...invoices]
      .filter((inv) => {
        const s = (inv.status ?? inv.displayStatus ?? '').toLowerCase();
        if (status === 'paid' && s !== 'paid') return false;
        if (status === 'open' && !['open', 'pending', 'draft'].includes(s)) return false;
        if (status === 'overdue' && !['overdue', 'uncollectible'].includes(s)) return false;
        if (!q) return true;
        return [inv.id, inv.stripeInvoiceId, inv.displayStatus]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const da = new Date(a.invoiceDate ?? a.date ?? 0).getTime();
        const db = new Date(b.invoiceDate ?? b.date ?? 0).getTime();
        return sortDesc ? db - da : da - db;
      });
  }, [invoices, search, status, sortDesc]);

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]';

  return (
    <>
      <div className="sq-card rounded-2xl p-5 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              Rechnungshistorie
            </h3>
            <p className="text-[11px] mt-0.5 text-muted-foreground">
              {filtered.length} von {invoices.length} Rechnungen
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSortDesc((v) => !v)}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg text-[var(--brand)] hover:bg-[var(--brand-soft)]"
          >
            Datum {sortDesc ? '↓' : '↑'}
          </button>
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
            <option value="paid">Bezahlt</option>
            <option value="open">Offen</option>
            <option value="overdue">Überfällig</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon={<Icon name="file-text" className="w-5 h-5" />}
            title="Noch keine Rechnungen vorhanden."
            description={
              search || status !== 'all'
                ? 'Passe Suche oder Filter an.'
                : 'Sobald Rechnungen erstellt wurden, erscheinen sie hier.'
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="bg-muted/40">
                  {[
                    'Rechnungsnr.',
                    'Zeitraum',
                    'Ausgestellt',
                    'Fällig',
                    'Bezahlt',
                    'Netto',
                    'MwSt.',
                    'Brutto',
                    'Status',
                    'PDF',
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const gross =
                    inv.grossAmountCents ??
                    inv.amountCents ??
                    (typeof inv.amount === 'number' ? Math.round(inv.amount * 100) : null);
                  const net = inv.netAmountCents ?? gross;
                  const tax = inv.taxCents;
                  const pdfUrl = inv.invoicePdfUrl;
                  const statusRaw = inv.displayStatus ?? inv.status;

                  return (
                    <tr
                      key={inv.id}
                      className="border-t border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => setSelected(inv)}
                    >
                      <td className="px-3 py-2.5 text-xs font-mono text-foreground">
                        {inv.stripeInvoiceId ?? inv.id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {formatDateDe(inv.periodStart)} – {formatDateDe(inv.periodEnd)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {formatDateDe(inv.invoiceDate ?? inv.date)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {formatDateDe(inv.dueDate)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {formatDateDe(inv.paidAt)}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-semibold tabular-nums">
                        {formatMoneyCents(net, (inv.currency ?? 'eur').toUpperCase())}
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                        {tax != null
                          ? formatMoneyCents(tax, (inv.currency ?? 'eur').toUpperCase())
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-semibold tabular-nums">
                        {formatMoneyCents(gross, (inv.currency ?? 'eur').toUpperCase())}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ${invoiceStatusTone(statusRaw)}`}
                        >
                          {invoiceStatusLabel(statusRaw)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {pdfUrl ? (
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                            aria-label="PDF herunterladen"
                          >
                            <Icon name="download" className="w-4 h-4" />
                          </a>
                        ) : (
                          <span
                            className="inline-flex p-1.5 rounded-lg text-muted-foreground/40 cursor-not-allowed"
                            title="Kein PDF verfügbar"
                          >
                            <Icon name="download" className="w-4 h-4" />
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

      <BillingInvoiceDetailDrawer
        invoice={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  );
}
