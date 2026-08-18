import { ArrowRight } from 'lucide-react';
import {
  DataCard,
  DataTable,
  ErrorState,
  SectionHeader,
  StatusChip,
  type DataTableColumn,
} from '../../../components/patterns';
import { MasterLoadingState, MasterPageSection } from '../../shell';
import { usePlatformOpsTabData } from '../usePlatformOps';
import type { PlatformOpsServiceSummaryDto } from '../types';
import {
  SERVICE_GROUP_LABELS,
  platformOpsStateLabel,
  platformOpsStateTone,
} from '../platform-ops.utils';
import { api } from '../../../lib/api';
import { PlatformOpsServiceDetailDrawer } from '../components/PlatformOpsServiceDetailDrawer';

type ServicesResponse = {
  groups: Record<string, PlatformOpsServiceSummaryDto[]>;
  generatedAt: string;
  isStale: boolean;
  moduleErrors: Record<string, string>;
};

export function PlatformOpsServicesTab({
  selectedServiceId,
  onOpenService,
  onCloseService,
  onNavigateView,
}: {
  selectedServiceId: string | null;
  onOpenService: (id: string) => void;
  onCloseService: () => void;
  onNavigateView?: (view: string, params?: Record<string, string>) => void;
}) {
  const { data, loading, error, refresh } = usePlatformOpsTabData<ServicesResponse>(
    () => api.admin.platformOps.services(),
    [],
  );

  if (loading && !data) return <MasterLoadingState variant="table" />;
  if (error) return <ErrorState title="Dienste" error={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const columns: DataTableColumn<PlatformOpsServiceSummaryDto>[] = [
    { key: 'name', header: 'Dienst', cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: 'state',
      header: 'Zustand',
      cell: (r) => (
        <StatusChip tone={platformOpsStateTone(r.state)}>{platformOpsStateLabel(r.state)}</StatusChip>
      ),
    },
    { key: 'signal', header: 'Signal', cell: (r) => r.keySignal },
    { key: 'summary', header: 'Zusammenfassung', cell: (r) => <span className="text-sm text-muted-foreground">{r.stateSummary}</span> },
    {
      key: 'open',
      header: '',
      cell: (r) => (
        <button type="button" className="text-xs text-[color:var(--brand)] hover:underline flex items-center gap-1" onClick={() => onOpenService(r.id)}>
          Detail <ArrowRight className="w-3 h-3" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {Object.entries(data.groups).map(([group, services]) => (
        <MasterPageSection key={group}>
          <SectionHeader title={SERVICE_GROUP_LABELS[group] ?? group} />
          <DataCard>
            <DataTable columns={columns} rows={services} getRowKey={(r) => r.id} card={false} />
          </DataCard>
        </MasterPageSection>
      ))}

      {Object.keys(data.moduleErrors).length > 0 && (
        <ErrorState
          title="Teilweise Daten nicht verfügbar"
          error={Object.entries(data.moduleErrors).map(([k, v]) => `${k}: ${v}`).join('; ')}
          onRetry={() => void refresh()}
        />
      )}

      {selectedServiceId && (
        <PlatformOpsServiceDetailDrawer
          serviceId={selectedServiceId}
          onClose={onCloseService}
          onNavigateView={onNavigateView}
        />
      )}
    </div>
  );
}
