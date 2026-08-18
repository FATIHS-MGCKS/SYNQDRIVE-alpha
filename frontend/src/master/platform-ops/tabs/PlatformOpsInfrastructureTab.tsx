import { AlertTriangle, Server } from 'lucide-react';
import {
  DataCard,
  ErrorState,
  MetricCard,
  SectionHeader,
  StatusChip,
} from '../../../components/patterns';
import { MasterLoadingState, MasterPageSection, MasterStaleDataHint } from '../../shell';
import { usePlatformOpsTabData } from '../usePlatformOps';
import { formatRelativeDe, platformOpsStateLabel, platformOpsStateTone } from '../platform-ops.utils';
import { api } from '../../../lib/api';

interface InfraDto {
  generatedAt: string;
  isStale: boolean;
  available: boolean;
  source: string;
  diskPercentUsed: number | null;
  memoryPercentUsed: number | null;
  cpuPercentUsed: number | null;
  load1: number | null;
  uptimeSeconds: number | null;
  riskLevel: string;
  signals: Array<{ id: string; label: string; value: string; state: string }>;
}

function formatUptime(sec: number | null): string {
  if (sec == null) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

export function PlatformOpsInfrastructureTab() {
  const { data, loading, error, refresh } = usePlatformOpsTabData<InfraDto>(
    () => api.admin.platformOps.infrastructure(),
    [],
  );

  if (loading && !data) return <MasterLoadingState variant="metric" count={4} />;
  if (error) return <ErrorState title="Infrastruktur" error={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  if (!data.available) {
    return (
      <ErrorState
        title="Host-Metriken nicht verfügbar"
        error="Prometheus/Observability nicht erreichbar — kein Fake-Healthy."
        onRetry={() => void refresh()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={platformOpsStateTone(data.riskLevel as any)} dot>
          Risiko: {platformOpsStateLabel(data.riskLevel as any)}
        </StatusChip>
        <span className="text-xs text-muted-foreground">Stand: {formatRelativeDe(data.generatedAt)}</span>
        {data.isStale && <MasterStaleDataHint label="Metriken veraltet." onRefresh={() => void refresh()} />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <MetricCard label="Disk" value={data.diskPercentUsed != null ? `${data.diskPercentUsed}%` : '—'} status={data.diskPercentUsed != null && data.diskPercentUsed > 85 ? 'critical' : 'neutral'} icon={<Server className="h-4 w-4" />} />
        <MetricCard label="RAM" value={data.memoryPercentUsed != null ? `${data.memoryPercentUsed}%` : '—'} status={data.memoryPercentUsed != null && data.memoryPercentUsed > 90 ? 'critical' : 'neutral'} icon={<Server className="h-4 w-4" />} />
        <MetricCard label="CPU" value={data.cpuPercentUsed != null ? `${data.cpuPercentUsed}%` : '—'} status="neutral" icon={<Server className="h-4 w-4" />} />
        <MetricCard label="Load (1m)" value={data.load1 ?? '—'} status="neutral" icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCard label="Uptime" value={formatUptime(data.uptimeSeconds)} status="success" icon={<Server className="h-4 w-4" />} />
      </div>

      {data.signals.length > 0 && (
        <MasterPageSection>
          <SectionHeader title="Kapazitätssignale" />
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.signals.map((s) => (
              <li key={s.id}>
                <DataCard bodyClassName="p-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-semibold tabular-nums">{s.value}</p>
                  <StatusChip tone={platformOpsStateTone(s.state as any)}>
                    {platformOpsStateLabel(s.state as any)}
                  </StatusChip>
                </DataCard>
              </li>
            ))}
          </ul>
        </MasterPageSection>
      )}
    </div>
  );
}
