import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminBillingRefundRowDto } from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { formatDateDe, formatMoneyCents, parsePaginated } from './admin-billing.utils';

export function BillingRefundsTab() {
  const [rows, setRows] = useState<AdminBillingRefundRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.billing.adminRefunds({ limit: '50' });
      setRows(parsePaginated<AdminBillingRefundRowDto>(res).data);
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
    return <ErrorState title="Refunds nicht verfügbar" description={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4" data-testid="master-refunds-tab">
      {rows.length === 0 ? (
        <EmptyState compact title="Keine Refunds vorhanden." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-muted/40">
                {['Unternehmen', 'Rechnung', 'Betrag', 'Status', 'Typ', 'Erstattet am'].map((header) => (
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
                  <td className="px-3 py-2.5 text-xs">{row.isPartial ? 'Teil' : 'Voll'}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDateDe(row.refundedAt)}
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
