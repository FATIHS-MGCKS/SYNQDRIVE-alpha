import { ExternalLink } from 'lucide-react';
import {
  DataCard,
  DataTable,
  ErrorState,
  SectionHeader,
  StatusChip,
  type DataTableColumn,
} from '../../../components/patterns';
import { MasterLoadingState, MasterPageSection, MasterStaleDataHint } from '../../shell';
import { usePlatformOpsResilience } from '../usePlatformOps';
import type { PlatformOpsResilienceDto } from '../types';
import { formatRelativeDe, platformOpsStateLabel, platformOpsStateTone } from '../platform-ops.utils';

export function PlatformOpsResilienceTab() {
  const { data, loading, error, refresh } = usePlatformOpsResilience();

  if (loading && !data) return <MasterLoadingState variant="table" />;
  if (error) return <ErrorState title="Resilienz" error={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  return <ResilienceContent data={data} onRefresh={() => void refresh()} />;
}

function ResilienceContent({ data, onRefresh }: { data: PlatformOpsResilienceDto; onRefresh: () => void }) {
  const columns: DataTableColumn<(typeof data.tiers)[0]>[] = [
    { key: 'label', header: 'Datenquelle', cell: (r) => <span className="font-medium">{r.label}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusChip tone={platformOpsStateTone(r.status)}>{platformOpsStateLabel(r.status)}</StatusChip>,
    },
    { key: 'last', header: 'Letztes Backup', cell: (r) => formatRelativeDe(r.lastSuccessAt) },
    {
      key: 'age',
      header: 'Alter (h)',
      cell: (r) => (r.ageHours != null ? r.ageHours : '—'),
      numeric: true,
    },
    { key: 'offsite', header: 'Offsite', cell: (r) => r.offsiteStatus ?? '—' },
    {
      key: 'restore',
      header: 'Restore-Validierung',
      cell: (r) => {
        const val = r.restoreValidation;
        if (!val || val === 'unknown') return <span className="text-muted-foreground">Nicht verifiziert</span>;
        return (
          <StatusChip tone={val === 'passed' ? 'success' : val === 'failed' ? 'critical' : 'warning'}>
            {val}
          </StatusChip>
        );
      },
    },
    {
      key: 'failure',
      header: 'Fehler',
      cell: (r) => r.failureMessage ?? '—',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={platformOpsStateTone(data.overall)} dot>
          Resilienz: {platformOpsStateLabel(data.overall)}
        </StatusChip>
        <span className="text-xs text-muted-foreground">Quelle: {data.source}</span>
        {data.isStale && <MasterStaleDataHint label="Backup-Daten veraltet." onRefresh={onRefresh} />}
      </div>

      <MasterPageSection>
        <SectionHeader
          title="Backup & Recovery"
          description="Kein „Protected“ ohne verifizierte Restore-Validierung"
        />
        <DataCard>
          <DataTable columns={columns} rows={data.tiers} getRowKey={(r) => r.id} card={false} />
        </DataCard>
      </MasterPageSection>

      {data.rpoRtoDocUrl && (
        <a
          href={data.rpoRtoDocUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-[color:var(--brand)] hover:underline"
        >
          RPO/RTO Runbook <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}
