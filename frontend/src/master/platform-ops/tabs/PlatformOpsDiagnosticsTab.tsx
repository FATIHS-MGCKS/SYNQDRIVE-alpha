import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  DataCard,
  DataTable,
  ErrorState,
  SectionHeader,
  StatusChip,
  communicationHealthStateTone,
  COMMUNICATION_HEALTH_STATE_LABEL_DE,
  type DataTableColumn,
} from '../../../components/patterns';
import { MasterLoadingState, MasterPageSection } from '../../shell';
import { usePlatformOpsTabData } from '../usePlatformOps';
import type { PlatformOpsAlertGroupDto, PlatformOpsDiagnosticsTab, CommunicationOperationalHealthDto } from '../types';
import { formatRelativeDe } from '../platform-ops.utils';
import { api } from '../../../lib/api';
import { SystemMonitoringView } from '../../components/SystemMonitoringView';

const DIAG_TABS = [
  { id: 'alerts', label: 'Alarme' },
  { id: 'poll-logs', label: 'Abfrage-Protokolle' },
  { id: 'token-health', label: 'Token-Status' },
  { id: 'communication', label: 'Communication' },
  { id: 'tools', label: 'Tools' },
] as const;

export function PlatformOpsDiagnosticsTabView({
  activeTab,
  onTabChange,
}: {
  activeTab: PlatformOpsDiagnosticsTab;
  onTabChange: (tab: PlatformOpsDiagnosticsTab) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="sq-tab-bar flex gap-1 p-1 rounded-md overflow-x-auto w-fit max-w-full" role="tablist">
        {DIAG_TABS.map((t) => (
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

      {activeTab === 'alerts' && <AlertsPanel />}
      {activeTab === 'communication' && <CommunicationHealthPanel />}
      {(activeTab === 'poll-logs' || activeTab === 'token-health') && (
        <SystemMonitoringView embedded initialFocus={activeTab === 'token-health' ? 'tokens' : 'poll-logs'} />
      )}
      {activeTab === 'tools' && <ToolsPanel />}
    </div>
  );
}

interface AlertsDto {
  generatedAt: string;
  isStale: boolean;
  alertmanager: {
    available: boolean;
    firingCritical: number;
    firingWarning: number;
    pending: number;
    silenced: number;
    lastNotificationAt: string | null;
    source: string;
  };
  groups: PlatformOpsAlertGroupDto[];
}

function AlertsPanel() {
  const { data, loading, error, refresh } = usePlatformOpsTabData<AlertsDto>(
    () => api.admin.platformOps.alerts(),
    [],
  );

  if (loading && !data) return <MasterLoadingState variant="table" />;
  if (error) return <ErrorState title="Alarme" error={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const am = data.alertmanager;

  const columns: DataTableColumn<PlatformOpsAlertGroupDto>[] = [
    {
      key: 'severity',
      header: 'Schwere',
      cell: (r) => (
        <StatusChip tone={r.severity === 'critical' ? 'critical' : 'warning'}>{r.severity}</StatusChip>
      ),
    },
    { key: 'name', header: 'Alarm', cell: (r) => <span className="font-medium">{r.alertname}</span> },
    { key: 'component', header: 'Komponente', cell: (r) => r.component },
    {
      key: 'count',
      header: 'Anzahl',
      cell: (r) => (
        <span>
          {r.count}
          {r.silenced && <span className="ml-1 text-xs text-muted-foreground">(stumm)</span>}
          {r.pending && <span className="ml-1 text-xs text-amber-600">(pending)</span>}
        </span>
      ),
      numeric: true,
    },
    { key: 'impact', header: 'Betroffen', cell: (r) => r.affectedResources },
    { key: 'since', header: 'Seit', cell: (r) => formatRelativeDe(r.firstSeen) },
    { key: 'source', header: 'Quelle', cell: (r) => r.source },
  ];

  return (
    <div className="space-y-4">
      <DataCard bodyClassName="p-4 flex flex-wrap gap-4">
        {!am.available ? (
          <StatusChip tone="warning">Alertmanager nicht erreichbar</StatusChip>
        ) : (
          <>
            <StatusChip tone="critical">{am.firingCritical} firing critical</StatusChip>
            <StatusChip tone="warning">{am.firingWarning} firing warning</StatusChip>
            <StatusChip tone="neutral">{am.pending} pending</StatusChip>
            <StatusChip tone="neutral">{am.silenced} silenced</StatusChip>
          </>
        )}
        <span className="text-xs text-muted-foreground self-center">
          Stand: {formatRelativeDe(data.generatedAt)}
        </span>
      </DataCard>

      <MasterPageSection>
        <SectionHeader title="Alarmgruppen" description="Dedupliziert — ein globaler Ausfall = ein Eintrag" />
        {data.groups.length === 0 ? (
          <DataCard bodyClassName="p-6 text-sm text-muted-foreground text-center">Keine aktiven Alarme</DataCard>
        ) : (
          <DataCard>
            <DataTable columns={columns} rows={data.groups} getRowKey={(r) => r.id} card={false} />
          </DataCard>
        )}
      </MasterPageSection>
    </div>
  );
}

function ToolsPanel() {
  const { data, loading, error, refresh } = usePlatformOpsTabData(
    () => api.admin.platformOps.tools(),
    [],
  );

  if (loading && !data) return <MasterLoadingState variant="card" />;
  if (error) return <ErrorState title="Tools" error={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const copyTunnel = () => {
    void navigator.clipboard.writeText(data.sshTunnelExample);
    toast.success('SSH-Tunnel-Befehl kopiert');
  };

  return (
    <MasterPageSection>
      <SectionHeader title="Externe Observability-Tools" description={data.grafanaAccessHint} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ToolLink label="Grafana" url={data.grafanaUrl} />
        <ToolLink label="Prometheus" url={data.prometheusUrl} />
        <ToolLink label="Alertmanager" url={data.alertmanagerUrl} />
      </div>
      <DataCard bodyClassName="p-4 mt-4 space-y-2">
        <p className="text-sm font-medium">SSH-Tunnel (Beispiel)</p>
        <code className="block text-xs font-mono break-all p-3 rounded-lg bg-muted/50">{data.sshTunnelExample}</code>
        <button type="button" className="sq-btn-secondary text-sm px-3 py-1.5 rounded-lg flex items-center gap-2" onClick={copyTunnel}>
          <Copy className="w-3.5 h-3.5" /> Kopieren
        </button>
        {!data.metricsConfigured && (
          <p className="text-xs text-amber-600">METRICS_BEARER_TOKEN nicht konfiguriert — Host-Metriken eingeschränkt.</p>
        )}
      </DataCard>
    </MasterPageSection>
  );
}

function CommunicationHealthPanel() {
  const { data, loading, error, refresh } = usePlatformOpsTabData<CommunicationOperationalHealthDto>(
    () => api.admin.communication.operationalHealth(),
    [],
  );

  if (loading && !data) return <MasterLoadingState variant="table" />;
  if (error) return <ErrorState title="Communication Health" error={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const rows = Object.entries(data.components).map(([key, component]) => ({
    id: key,
    component: key,
    state: component.state,
    diagnostics: component.diagnostics.join(', ') || '—',
    checkedAt: component.checkedAt,
  }));

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: 'component', header: 'Komponente', cell: (row) => row.component },
    {
      key: 'state',
      header: 'Status',
      cell: (row) => (
        <StatusChip tone={communicationHealthStateTone(row.state)}>
          {COMMUNICATION_HEALTH_STATE_LABEL_DE[row.state] ?? row.state}
        </StatusChip>
      ),
    },
    { key: 'diagnostics', header: 'Diagnose', cell: (row) => row.diagnostics },
    {
      key: 'checkedAt',
      header: 'Geprüft',
      cell: (row) => formatRelativeDe(row.checkedAt),
    },
  ];

  return (
    <MasterPageSection>
      <SectionHeader
        title="Communication Center — Betriebsgesundheit"
        description={`Gesamt: ${COMMUNICATION_HEALTH_STATE_LABEL_DE[data.overall] ?? data.overall} · Zuletzt geprüft ${formatRelativeDe(data.checkedAt)}`}
      />
      <DataTable columns={columns} rows={rows} getRowKey={(row) => row.id} card={false} />
    </MasterPageSection>
  );
}

function ToolLink({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted/30 text-sm font-medium"
    >
      {label}
      <ExternalLink className="w-4 h-4 text-muted-foreground" />
    </a>
  );
}
