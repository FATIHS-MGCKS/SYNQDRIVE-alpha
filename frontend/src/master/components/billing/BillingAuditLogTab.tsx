import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminBillingAuditLogDto } from '../../types/admin-billing.types';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { formatDateDe, parsePaginated } from './admin-billing.utils';

export function BillingAuditLogTab() {
  const [logs, setLogs] = useState<AdminBillingAuditLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminBillingAuditLogDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.billing.auditLog({ limit: '100' });
      setLogs(parsePaginated<AdminBillingAuditLogDto>(res).data);
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
    return <ErrorState title="Audit Log nicht verfügbar" description={error} onRetry={() => void load()} />;
  }

  return (
    <>
      {logs.length === 0 ? (
        <EmptyState compact title="Noch keine Audit-Einträge" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="bg-muted/40">
                {['Datum', 'Aktion', 'Entity', 'Organisation', 'Actor'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-t border-border/50 hover:bg-muted/20 cursor-pointer"
                  onClick={() => setSelected(log)}
                >
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDateDe(log.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-semibold">{log.action}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{log.organizationId?.slice(0, 8) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">
                    {log.actorUserId?.slice(0, 8) ?? 'System'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetailDrawer
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.action ?? 'Audit'}
        description={selected?.entityType}
        widthClassName="sm:max-w-xl"
      >
        {selected && (
          <div className="space-y-4 text-xs">
            <pre className="rounded-xl bg-muted/30 p-3 overflow-x-auto text-[10px] leading-relaxed">
              {JSON.stringify(selected.beforeJson, null, 2) || '—'}
            </pre>
            <pre className="rounded-xl bg-muted/30 p-3 overflow-x-auto text-[10px] leading-relaxed">
              {JSON.stringify(selected.afterJson, null, 2) || '—'}
            </pre>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
