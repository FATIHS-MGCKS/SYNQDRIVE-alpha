import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminBillingPaymentAttemptRowDto } from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { formatDateDe, formatMoneyCents, parsePaginated } from './admin-billing.utils';

export function BillingPaymentAttemptsTab() {
  const [rows, setRows] = useState<AdminBillingPaymentAttemptRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.billing.adminPaymentAttempts({ limit: '50', status: 'FAILED' });
      setRows(parsePaginated<AdminBillingPaymentAttemptRowDto>(res).data);
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
    return <ErrorState title="Zahlungsversuche nicht verfügbar" description={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4" data-testid="master-payment-attempts-tab">
      {rows.length === 0 ? (
        <EmptyState compact title="Keine fehlgeschlagenen Zahlungsversuche." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="bg-muted/40">
                {['Unternehmen', 'Rechnung', 'Versuch', 'Betrag', 'Status', 'Fehler', 'Zeitpunkt', 'Retry'].map(
                  (header) => (
                    <th
                      key={header}
                      className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                    >
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border/50">
                  <td className="px-3 py-2.5 text-xs">{row.organizationName}</td>
                  <td className="px-3 py-2.5 text-xs font-mono">{row.invoiceNumberLabel}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{row.attemptNumber}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">
                    {formatMoneyCents(row.amountCents, row.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{row.statusLabel}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[220px] truncate">
                    {row.safeErrorMessage ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDateDe(row.attemptedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDateDe(row.nextRetryAt)}
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
