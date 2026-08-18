import { useMemo, useState } from 'react';
import { DataCard, DataTable, StatusChip } from '../../../components/patterns';
import type { DataTableColumn } from '../../../components/patterns';
import { MasterErrorState, MasterLoadingState } from '../../shell';
import { useAuditLog } from '../useSecurityAccess';
import type { AuditLogListItemDto } from '../types';
import {
  auditResultLabel,
  auditResultTone,
  formatRelativeDe,
  truncateReason,
} from '../security-access.utils';

interface SecurityAuditTabProps {
  securityOnly?: boolean;
  organizationId?: string | null;
  auditDomain?: string | null;
  onOpenAudit: (auditId: string) => void;
}

const INPUT =
  'rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring';

export function SecurityAuditTab({
  securityOnly = false,
  organizationId,
  auditDomain,
  onOpenAudit,
}: SecurityAuditTabProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query = useMemo(
    () => ({
      page,
      limit: 50,
      search: search || undefined,
      organizationId: organizationId ?? undefined,
      auditDomain: auditDomain ?? undefined,
      securityOnly,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
    }),
    [page, search, organizationId, auditDomain, securityOnly, from, to],
  );

  const { result, loading, error, refresh } = useAuditLog(query);

  const columns = useMemo<DataTableColumn<AuditLogListItemDto>[]>(
    () => [
      {
        key: 'time',
        header: 'Zeitstempel',
        cell: (r) => <span className="text-xs text-muted-foreground">{formatRelativeDe(r.createdAt)}</span>,
      },
      {
        key: 'actor',
        header: 'Akteur',
        cell: (r) => <span className="text-xs font-medium">{r.userName}</span>,
      },
      {
        key: 'action',
        header: 'Aktion',
        cell: (r) => <span className="text-xs font-semibold">{r.action}</span>,
      },
      {
        key: 'target',
        header: 'Ziel',
        cell: (r) => (
          <span className="text-xs text-muted-foreground">
            {r.entity}
            {r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ''}
          </span>
        ),
      },
      {
        key: 'org',
        header: 'Organisation',
        cell: (r) => <span className="text-xs">{r.organizationName ?? 'Plattform'}</span>,
      },
      {
        key: 'result',
        header: 'Ergebnis',
        cell: (r) => (
          <StatusChip tone={auditResultTone(r.result)} className="text-[10px]">
            {auditResultLabel(r.result)}
          </StatusChip>
        ),
      },
      {
        key: 'reason',
        header: 'Grund',
        cell: (r) => <span className="text-xs text-muted-foreground">{truncateReason(r.reason)}</span>,
      },
    ],
    [],
  );

  const totalPages = result?.meta.totalPages ?? 1;
  const title = securityOnly ? 'Sicherheitsereignisse' : 'Audit-Protokoll';

  return (
    <div className="space-y-4">
      <DataCard flush bodyClassName="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="search"
            className={INPUT}
            placeholder="Suche…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <input type="date" className={INPUT} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Von" />
          <input type="date" className={INPUT} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Bis" />
          <button type="button" className="sq-btn-secondary rounded-xl px-4 py-2 text-xs font-semibold" onClick={() => void refresh()}>
            Filter anwenden
          </button>
        </div>
        {!securityOnly && (
          <p className="mt-2 text-[10px] text-muted-foreground">Nur-Lese — revisionssichere Audit-Wahrheit.</p>
        )}
      </DataCard>

      {loading && !result ? (
        <MasterLoadingState variant="rows" count={6} />
      ) : error ? (
        <MasterErrorState title={title} error={error} onRetry={() => void refresh()} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {result?.meta.total ?? 0} Einträge · Seite {page} / {totalPages}
          </p>

          <div className="hidden lg:block">
            <DataTable
              columns={columns}
              rows={result?.data ?? []}
              getRowKey={(r) => r.id}
              empty="Keine Einträge"
              onRowClick={(r) => onOpenAudit(r.id)}
            />
          </div>

          <div className="space-y-2 lg:hidden">
            {(result?.data ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                className="w-full rounded-xl border border-border/60 bg-card p-4 text-left"
                onClick={() => onOpenAudit(r.id)}
              >
                <p className="text-sm font-semibold">{r.action}</p>
                <p className="text-xs text-muted-foreground">{r.userName} · {formatRelativeDe(r.createdAt)}</p>
                <StatusChip tone={auditResultTone(r.result)} className="mt-2 text-[10px]">
                  {auditResultLabel(r.result)}
                </StatusChip>
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                className="sq-btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Zurück
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                className="sq-btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
                onClick={() => setPage((p) => p + 1)}
              >
                Weiter
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
