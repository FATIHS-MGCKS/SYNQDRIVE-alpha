import {
  DataCard,
  DataTable,
  ErrorState,
  SectionHeader,
  StatusChip,
  workerMonitoringTone,
  type DataTableColumn,
} from '../../../components/patterns';
import { MasterLoadingState, MasterPageSection } from '../../shell';
import { usePlatformOpsTabData } from '../usePlatformOps';
import {
  formatRelativeDe,
  platformOpsStateLabel,
  platformOpsStateTone,
} from '../platform-ops.utils';
import { api } from '../../../lib/api';
import type { PlatformOpsProcessingTab } from '../types';

const PROCESSING_TABS = [
  { id: 'queues', label: 'Queues' },
  { id: 'workers', label: 'Worker' },
  { id: 'schedulers', label: 'Scheduler' },
] as const;

export function PlatformOpsProcessingTabView({
  activeTab,
  onTabChange,
}: {
  activeTab: PlatformOpsProcessingTab;
  onTabChange: (tab: PlatformOpsProcessingTab) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="sq-tab-bar flex gap-1 p-1 rounded-md overflow-x-auto w-fit max-w-full" role="tablist">
        {PROCESSING_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={activeTab === t.id ? 'sq-tab-active px-4 py-2 rounded-xl text-sm font-bold' : 'sq-tab px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground'}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'queues' && <QueuesPanel />}
      {activeTab === 'workers' && <WorkersPanel />}
      {activeTab === 'schedulers' && <SchedulersPanel />}
    </div>
  );
}

function QueuesPanel() {
  const { data, loading, error, refresh } = usePlatformOpsTabData(() => api.admin.platformOps.queues(), []);

  if (loading && !data) return <MasterLoadingState variant="table" />;
  if (error) return <ErrorState title="Queues" error={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const abnormal = [...(data.queues ?? [])].sort((a: { abnormal: boolean; failed: number }, b: { abnormal: boolean; failed: number }) => {
    if (a.abnormal !== b.abnormal) return a.abnormal ? -1 : 1;
    return b.failed - a.failed;
  });

  const columns: DataTableColumn<(typeof abnormal)[0]>[] = [
    { key: 'queue', header: 'Queue', cell: (r) => <span className="font-mono text-xs">{r.queue}</span> },
    {
      key: 'failed',
      header: 'Failed',
      cell: (r) => (
        <span className={r.failed > 0 ? 'font-semibold text-[color:var(--status-critical)]' : ''}>{r.failed}</span>
      ),
      numeric: true,
    },
    { key: 'stalled', header: 'Stalled', cell: (r) => r.stalled, numeric: true },
    { key: 'delayed', header: 'Delayed', cell: (r) => r.delayed, numeric: true },
    { key: 'waiting', header: 'Waiting', cell: (r) => r.waiting, numeric: true },
    { key: 'active', header: 'Active', cell: (r) => r.active, numeric: true },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusChip tone={workerMonitoringTone(r.status)}>{r.status}</StatusChip>,
    },
  ];

  return (
    <MasterPageSection>
      <SectionHeader
        title="Queue-Zustände"
        description={`${data.summary?.abnormalCount ?? 0} abnormal · ${data.summary?.failedTotal ?? 0} failed gesamt`}
      />
      <DataCard>
        <DataTable columns={columns} rows={abnormal} getRowKey={(r) => r.queue} card={false} />
      </DataCard>
    </MasterPageSection>
  );
}

function WorkersPanel() {
  const { data, loading, error, refresh } = usePlatformOpsTabData(() => api.admin.platformOps.workers(), []);

  if (loading && !data) return <MasterLoadingState variant="table" />;
  if (error) return <ErrorState title="Worker" error={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const columns: DataTableColumn<(typeof data.workers)[0]>[] = [
    { key: 'name', header: 'Worker', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'purpose', header: 'Zweck', cell: (r) => <span className="text-sm text-muted-foreground">{r.purpose}</span> },
    {
      key: 'state',
      header: 'Zustand',
      cell: (r) => <StatusChip tone={platformOpsStateTone(r.state)}>{platformOpsStateLabel(r.state)}</StatusChip>,
    },
    {
      key: 'failures',
      header: 'Fehlerrate',
      cell: (r) => `${r.failureRatio}%`,
      numeric: true,
    },
    { key: 'lastSuccess', header: 'Letzter Erfolg', cell: (r) => formatRelativeDe(r.lastSuccessAt) },
    {
      key: 'throughput',
      header: 'Throughput/h',
      cell: (r) => (r.throughputPerHour != null ? r.throughputPerHour : '—'),
      numeric: true,
    },
  ];

  return (
    <MasterPageSection>
      <SectionHeader title="Worker-Verarbeitung" description="Basierend auf Processing Health — nicht nur Prozess-Running" />
      <DataCard>
        <DataTable columns={columns} rows={data.workers} getRowKey={(r) => r.id} card={false} />
      </DataCard>
    </MasterPageSection>
  );
}

function SchedulersPanel() {
  const { data, loading, error, refresh } = usePlatformOpsTabData(() => api.admin.platformOps.schedulers(), []);

  if (loading && !data) return <MasterLoadingState variant="table" />;
  if (error) return <ErrorState title="Scheduler" error={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const columns: DataTableColumn<(typeof data.schedulers)[0]>[] = [
    { key: 'name', header: 'Job', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'cadence', header: 'Erwartet', cell: (r) => r.expectedCadence },
    { key: 'lastRun', header: 'Letzter Lauf', cell: (r) => formatRelativeDe(r.lastRunAt) },
    { key: 'lastSuccess', header: 'Letzter Erfolg', cell: (r) => formatRelativeDe(r.lastSuccessAt) },
    { key: 'next', header: 'Nächster erwartet', cell: (r) => formatRelativeDe(r.nextExpectedAt) },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <StatusChip tone={r.status === 'ok' ? 'success' : r.status === 'missed' || r.status === 'failed' ? 'critical' : 'neutral'}>
          {r.status}
        </StatusChip>
      ),
    },
  ];

  return (
    <MasterPageSection>
      <SectionHeader title="Geplante Jobs" description="Kanonische Scheduler-Daten — kein Browser-Timer" />
      <DataCard>
        <DataTable columns={columns} rows={data.schedulers} getRowKey={(r) => r.id} card={false} />
      </DataCard>
    </MasterPageSection>
  );
}
