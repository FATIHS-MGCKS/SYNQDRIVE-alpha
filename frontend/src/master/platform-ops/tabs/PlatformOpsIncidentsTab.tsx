import { ArrowRight } from 'lucide-react';
import {
  DataCard,
  DataTable,
  EmptyState,
  ErrorState,
  SectionHeader,
  StatusChip,
  type DataTableColumn,
} from '../../../components/patterns';
import { MasterPageSection } from '../../shell';
import { usePlatformOpsIncidents } from '../usePlatformOps';
import type { PlatformOpsIncidentDto } from '../types';
import { formatRelativeDe } from '../platform-ops.utils';
import { PlatformOpsIncidentDetailDrawer } from '../components/PlatformOpsIncidentDetailDrawer';

export function PlatformOpsIncidentsTab({
  selectedIncidentId,
  onOpenIncident,
  onCloseIncident,
  onOpenOrganization,
}: {
  selectedIncidentId: string | null;
  onOpenIncident: (id: string) => void;
  onCloseIncident: () => void;
  onOpenOrganization?: (orgId: string) => void;
}) {
  const { incidents, loading, error, refresh } = usePlatformOpsIncidents();

  const columns: DataTableColumn<PlatformOpsIncidentDto>[] = [
    {
      key: 'severity',
      header: 'Schwere',
      cell: (r) => (
        <StatusChip tone={r.severity === 'critical' ? 'critical' : r.severity === 'warning' ? 'warning' : 'info'}>
          {r.severity}
        </StatusChip>
      ),
    },
    { key: 'summary', header: 'Titel', cell: (r) => <span className="font-medium">{r.summary}</span> },
    { key: 'component', header: 'Komponente', cell: (r) => r.affectedComponent },
    { key: 'impact', header: 'Impact', cell: (r) => <span className="text-sm text-muted-foreground line-clamp-2">{r.impact}</span> },
    { key: 'since', header: 'Seit', cell: (r) => formatRelativeDe(r.firstSeen) },
    {
      key: 'orgs',
      header: 'Orgs',
      cell: (r) => (r.organizationIds.length > 0 ? r.organizationIds.length : '—'),
      numeric: true,
    },
    {
      key: 'action',
      header: '',
      cell: (r) => (
        <button type="button" className="text-xs text-[color:var(--brand)] hover:underline flex items-center gap-1" onClick={() => onOpenIncident(r.id)}>
          Detail <ArrowRight className="w-3 h-3" />
        </button>
      ),
    },
  ];

  if (error) {
    return <ErrorState title="Vorfälle" error={error} onRetry={() => void refresh()} />;
  }

  return (
    <MasterPageSection>
      <SectionHeader title="Aktive Vorfälle" description="Aggregierte Plattformprobleme mit Impact und Drilldown" />
      {loading && incidents.length === 0 ? (
        <DataCard bodyClassName="p-8 text-center text-sm text-muted-foreground">Lade Vorfälle…</DataCard>
      ) : incidents.length === 0 ? (
        <EmptyState compact title="Keine aktiven Vorfälle" description="Der Plattformbetrieb ist stabil." />
      ) : (
        <DataCard>
          <DataTable columns={columns} rows={incidents} getRowKey={(r) => r.id} card={false} />
        </DataCard>
      )}

      {selectedIncidentId && (
        <PlatformOpsIncidentDetailDrawer
          incidentId={selectedIncidentId}
          onClose={onCloseIncident}
          onOpenOrganization={onOpenOrganization}
        />
      )}
    </MasterPageSection>
  );
}
