import { Shield } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EmptyState,
  ErrorState,
  SkeletonRows,
  Timeline,
} from '../../../components/patterns';
import { api } from '../../../lib/api';
import type { StatusTone } from '../../../components/patterns/status-utils';
import { AUDIT_ACTION_LABELS } from './constants';
import { formatDateTime } from './utils';

interface SecurityActivityTabProps {
  orgId: string;
}

export function SecurityActivityTab({ orgId }: SecurityActivityTabProps) {
  const [rows, setRows] = useState<Array<{
    id: string;
    action: string;
    entity: string;
    description: string;
    userName: string;
    createdAt: string;
    auditAction?: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entities = ['USER', 'ORGANIZATION_INVITE', 'ORGANIZATION_ROLE'] as const;
      const batches = await Promise.all(
        entities.map(async (entity) => {
          try {
            return await api.activityLog.listByOrg(orgId, { entity, limit: 40 });
          } catch {
            return null;
          }
        }),
      );
      const failed = batches.filter((b) => b === null).length;
      if (failed === entities.length) {
        throw new Error('Aktivitäten konnten nicht geladen werden.');
      }
      const merged = batches
        .filter((res): res is NonNullable<typeof res> => res !== null)
        .flatMap((res) => (Array.isArray(res) ? res : res?.data ?? []))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRows(merged);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Aktivitäten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (actionFilter !== 'all') {
        const hay = `${row.action} ${row.description}`.toLowerCase();
        if (!hay.includes(actionFilter.toLowerCase())) return false;
      }
      if (userFilter.trim()) {
        const q = userFilter.trim().toLowerCase();
        if (!row.userName.toLowerCase().includes(q) && !row.description.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [rows, actionFilter, userFilter]);

  const timelineItems = filtered.slice(0, 30).map((row) => {
    const auditKey = Object.entries(AUDIT_ACTION_LABELS).find(([, label]) =>
      row.description.includes(label),
    )?.[0];
    const tone: StatusTone =
      row.action.toLowerCase().includes('delete') || row.action.toLowerCase().includes('remove')
        ? 'critical'
        : 'neutral';
    return {
      id: row.id,
      title: auditKey ? AUDIT_ACTION_LABELS[auditKey] : row.description,
      time: formatDateTime(row.createdAt),
      description: row.userName ? `von ${row.userName}` : undefined,
      tone,
    };
  });

  return (
    <div className="space-y-4">
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)] grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Aktion</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-xl border border-border text-[13px]"
          >
            <option value="all">Alle Sicherheitsereignisse</option>
            <option value="passwort">Passwort zurückgesetzt</option>
            <option value="rolle">Rolle geändert</option>
            <option value="einladung">Einladung</option>
            <option value="berechtigung">Berechtigung</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Benutzer / Text</span>
          <input
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="Filtern…"
            className="mt-1 w-full px-3 py-2 rounded-xl border border-border text-[13px]"
          />
        </label>
      </div>

      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        {error && !rows.length ? (
          <ErrorState title="Aktivität nicht verfügbar" error={error} onRetry={() => void load()} />
        ) : loading ? (
          <SkeletonRows rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Shield className="w-5 h-5" />}
            title="Keine Sicherheitsereignisse"
            description="Änderungen an Benutzern, Rollen und Einladungen erscheinen hier."
          />
        ) : (
          <Timeline items={timelineItems} />
        )}
      </div>
    </div>
  );
}
