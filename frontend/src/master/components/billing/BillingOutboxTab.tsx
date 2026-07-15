import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminBillingOutboxDeliveryRowDto } from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { formatDateDe, parsePaginated } from './admin-billing.utils';

export function BillingOutboxTab() {
  const [rows, setRows] = useState<AdminBillingOutboxDeliveryRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'DEAD_LETTER' | 'FAILED' | 'PENDING'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.billing.adminOutboxDeliveries(params);
      setRows(parsePaginated<AdminBillingOutboxDeliveryRowDto>(res).data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <SkeletonCard className="h-64" />;
  if (error) {
    return <ErrorState title="Outbox nicht verfügbar" description={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4" data-testid="master-outbox-tab">
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'Alle' },
          { id: 'PENDING', label: 'Ausstehend' },
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

      {rows.length === 0 ? (
        <EmptyState compact title="Keine Outbox-Einträge für diesen Filter." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[1040px]">
            <thead>
              <tr className="bg-muted/40">
                {['Event', 'Consumer', 'Status', 'Org', 'Retries', 'Fehler', 'Nächster Retry', 'Aktualisiert'].map(
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
                  <td className="px-3 py-2.5 text-xs font-mono">{row.eventType}</td>
                  <td className="px-3 py-2.5 text-xs">{row.consumerId}</td>
                  <td className="px-3 py-2.5 text-xs">{row.status}</td>
                  <td className="px-3 py-2.5 text-xs font-mono">{row.organizationId ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{row.retryCount}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">
                    {row.lastError ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDateDe(row.nextRetryAt)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDateDe(row.updatedAt)}
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
