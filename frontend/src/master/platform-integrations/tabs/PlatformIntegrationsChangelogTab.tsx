import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { DataTable, type DataTableColumn } from '../../../components/patterns/data-table';
import { formatRelativeDe } from '../platform-integrations.utils';
import { MasterErrorState, MasterLoadingState } from '../../shell/MasterPageStates';

interface ChangelogRow {
  id: string;
  createdAt: string;
  actorName: string | null;
  description: string;
  changeSummary: string | null;
}

export function PlatformIntegrationsChangelogTab() {
  const [rows, setRows] = useState<ChangelogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.activityLog({
        limit: 50,
        entity: 'ADMIN_OPERATION',
      });
      const data = res.data ?? [];
      setRows(
        data.filter(
          (row: ChangelogRow) =>
            /platform|email|integration|stripe|dimo|voice|whatsapp|sender/i.test(
              `${row.description} ${row.changeSummary ?? ''}`,
            ),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataTableColumn<ChangelogRow>[] = [
    {
      key: 'time',
      header: 'Zeit',
      cell: (row) => formatRelativeDe(row.createdAt),
    },
    {
      key: 'actor',
      header: 'Akteur',
      cell: (row) => row.actorName ?? '—',
      className: 'hidden sm:table-cell',
    },
    {
      key: 'change',
      header: 'Änderung',
      cell: (row) => (
        <div>
          <div className="font-medium text-sm">{row.description}</div>
          {row.changeSummary && (
            <div className="text-xs text-muted-foreground mt-1">{row.changeSummary}</div>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <MasterLoadingState variant="table" count={4} />;
  if (error) return <MasterErrorState title="Änderungsprotokoll" error={error} onRetry={() => void load()} />;

  return (
    <div data-testid="platform-integrations-changelog">
      <DataTable columns={columns} rows={rows} getRowKey={(row) => row.id} empty="Keine relevanten Einträge" />
    </div>
  );
}
