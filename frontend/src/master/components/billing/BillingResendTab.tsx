import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminBillingEmailDeliverySummaryDto } from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { formatDateDe, parsePaginated } from './admin-billing.utils';

export function BillingResendTab() {
  const [rows, setRows] = useState<AdminBillingEmailDeliverySummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'DEAD_LETTER' | 'FAILED'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.billing.adminEmailDeliveries(params);
      setRows(parsePaginated<AdminBillingEmailDeliverySummaryDto>(res).data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const resend = async (deliveryId: string) => {
    setMessage(null);
    try {
      await api.billing.adminEmailDeliveryResend(deliveryId);
      setMessage('E-Mail erneut gesendet.');
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const replay = async (deliveryId: string) => {
    setMessage(null);
    try {
      await api.billing.adminEmailDeliveryReplay(deliveryId);
      setMessage('Dead Letter erneut eingereiht.');
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  if (loading) return <SkeletonCard className="h-64" />;
  if (error) {
    return <ErrorState title="Resend nicht verfügbar" description={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4" data-testid="master-resend-tab">
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'Alle' },
          { id: 'FAILED', label: 'Fehlgeschlagen' },
          { id: 'DEAD_LETTER', label: 'Dead Letter' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStatusFilter(item.id as typeof statusFilter)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold ${
              statusFilter === item.id
                ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                : 'bg-muted/40 text-muted-foreground'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {message ? <p className="text-xs rounded-lg px-3 py-2 bg-muted/30">{message}</p> : null}

      {rows.length === 0 ? (
        <EmptyState compact title="Keine E-Mail-Zustellungen für diesen Filter." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[1040px]">
            <thead>
              <tr className="bg-muted/40">
                {['Event', 'Empfänger', 'Status', 'Zustand', 'Retries', 'Fehler', 'Aktualisiert', 'Aktion'].map(
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
                <tr key={row.deliveryId} className="border-t border-border/50">
                  <td className="px-3 py-2.5 text-xs font-mono">{row.eventType}</td>
                  <td className="px-3 py-2.5 text-xs">{row.recipientEmail ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{row.deliveryStatus}</td>
                  <td className="px-3 py-2.5 text-xs">{row.deliveryState}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{row.retryCount}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">
                    {row.deadLetterReason ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDateDe(row.updatedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void resend(row.deliveryId)}
                        className="text-[var(--brand)] font-semibold"
                      >
                        Resend
                      </button>
                      {row.deliveryStatus === 'DEAD_LETTER' ? (
                        <button
                          type="button"
                          onClick={() => void replay(row.deliveryId)}
                          className="text-[var(--brand)] font-semibold"
                        >
                          Replay
                        </button>
                      ) : null}
                    </div>
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
