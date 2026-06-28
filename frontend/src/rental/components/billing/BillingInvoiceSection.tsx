import { useMemo, useState } from 'react';
import type { BillingInvoiceDto } from '../../types/billing.types';
import {
  formatDateDe,
  formatMoneyCents,
  invoiceStatusLabel,
  invoiceStatusTone,
} from './billing.utils';
import { EmptyState } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { BillingInvoiceDetailDrawer } from './BillingInvoiceDetailDrawer';
import { Icon } from '../ui/Icon';

interface BillingInvoiceSectionProps {
  invoices: BillingInvoiceDto[];
}

type StatusFilter = 'all' | 'paid' | 'open' | 'overdue';

function invoiceNumber(inv: BillingInvoiceDto): string {
  return inv.stripeInvoiceId ?? `RE-${inv.id.slice(0, 8).toUpperCase()}`;
}

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
        return [invoiceNumber(inv), inv.displayStatus]
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
      <div className="sq-card rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              Rechnungen
            </h3>
            <p className="text-[12px] mt-0.5 text-muted-foreground">
              {filtered.length} von {invoices.length} Rechnungen
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSortDesc((v) => !v)}
          >
            Datum {sortDesc ? '↓' : '↑'}
          </Button>
        </div>

        {invoices.length > 0 && (
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
        )}

        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon={<Icon name="file-text" className="w-5 h-5" />}
            title="Noch keine Rechnungen vorhanden."
            description={
              search || status !== 'all'
                ? 'Passe Suche oder Filter an.'
                : undefined
            }
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
                {filtered.map((inv) => {
                  const gross =
                    inv.grossAmountCents ??
                    inv.amountCents ??
                    (typeof inv.amount === 'number' ? Math.round(inv.amount * 100) : null);
                  const pdfUrl = inv.invoicePdfUrl;
                  const statusRaw = inv.displayStatus ?? inv.status;
                  const currency = (inv.currency ?? 'eur').toUpperCase();

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
                        {pdfUrl ? (
                          <Button variant="outline" size="sm" asChild>
                            <a href={pdfUrl} target="_blank" rel="noreferrer">
                              Rechnung öffnen
                            </a>
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" disabled title="Kein PDF verfügbar">
                            —
                          </Button>
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
