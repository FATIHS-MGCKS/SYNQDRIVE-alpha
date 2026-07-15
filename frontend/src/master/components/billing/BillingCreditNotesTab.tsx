import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminBillingCreditNoteRowDto } from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { formatDateDe, formatMoneyCents, parsePaginated } from './admin-billing.utils';
import { isSafeExternalUrl } from './master-invoices.utils';

export function BillingCreditNotesTab() {
  const [rows, setRows] = useState<AdminBillingCreditNoteRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.billing.adminCreditNotes({ limit: '50' });
      setRows(parsePaginated<AdminBillingCreditNoteRowDto>(res).data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <SkeletonCard className="h-64" />;
  if (error) {
    return <ErrorState title="Gutschriften nicht verfügbar" description={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4" data-testid="master-credit-notes-tab">
      {rows.length === 0 ? (
        <EmptyState compact title="Keine Gutschriften vorhanden." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-muted/40">
                {['Unternehmen', 'Rechnung', 'Betrag', 'Status', 'Ausgestellt', 'Dokument'].map((header) => (
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
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border/50">
                  <td className="px-3 py-2.5 text-xs">{row.organizationName}</td>
                  <td className="px-3 py-2.5 text-xs font-mono">{row.invoiceNumberLabel}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">
                    {formatMoneyCents(row.amountCents, row.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{row.statusLabel}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDateDe(row.issuedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {isSafeExternalUrl(row.pdfUrl) ? (
                      <a href={row.pdfUrl!} target="_blank" rel="noreferrer noopener" className="text-[var(--brand)]">
                        PDF
                      </a>
                    ) : isSafeExternalUrl(row.hostedUrl) ? (
                      <a
                        href={row.hostedUrl!}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[var(--brand)]"
                      >
                        Öffnen
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
