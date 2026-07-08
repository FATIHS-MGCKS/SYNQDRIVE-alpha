import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Database,
  ExternalLink,
  Gauge,
  Layers,
  Radio,
  RefreshCw,
  Server,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  DataCard,
  DataTable,
  ErrorState,
  MetricCard,
  PageHeader,
  SectionHeader,
  StatusChip,
  monitoringSystemHealthTone,
  workerMonitoringTone,
} from '../../components/patterns';
import type { DataTableColumn } from '../../components/patterns';
import { api } from '../../lib/api';

interface PlatformHealthViewProps {
  isDarkMode: boolean;
  onViewChange?: (view: string, settingsTab?: string) => void;
}

interface QueueRow {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  status: string;
}

function overallTone(status: string) {
  if (status === 'critical') return 'critical' as const;
  if (status === 'warning') return 'warning' as const;
  return 'success' as const;
}

export function PlatformHealthView({ onViewChange }: PlatformHealthViewProps) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.platformHealth();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Platform health konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const queueColumns: DataTableColumn<QueueRow>[] = [
    {
      key: 'queue',
      header: 'Queue',
      cell: (r) => <span className="font-mono text-xs">{r.queue}</span>,
    },
    { key: 'waiting', header: 'Waiting', cell: (r) => r.waiting, numeric: true },
    { key: 'active', header: 'Active', cell: (r) => r.active, numeric: true },
    { key: 'delayed', header: 'Delayed', cell: (r) => r.delayed, numeric: true },
    { key: 'failed', header: 'Failed', cell: (r) => r.failed, numeric: true },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusChip tone={workerMonitoringTone(r.status)}>{r.status}</StatusChip>,
    },
  ];

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Platform Health" error={error} onRetry={() => void load()} />
      </div>
    );
  }

  const readiness = data?.readiness;
  const monitoring = data?.monitoring;
  const alerts = data?.alerts ?? [];
  const queues: QueueRow[] = data?.queues ?? [];
  const dimo = data?.integrations?.dimo;
  const obs = data?.observability;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <PageHeader
        variant="full"
        title="Platform Health"
        description="Infrastruktur, Worker, Queues und Integrationen — aggregiert für Master Admin"
        status={
          <StatusChip tone={overallTone(data?.overallStatus ?? 'healthy')} dot>
            {data?.overallStatus ?? '…'}
          </StatusChip>
        }
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="sq-btn-secondary flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </button>
        }
        meta={
          data?.generatedAt ? (
            <span className="text-xs text-muted-foreground">
              Stand: {new Date(data.generatedAt).toLocaleString('de-DE')}
            </span>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="System (1h)"
          value={monitoring?.systemHealth ?? '—'}
          status={monitoringSystemHealthTone(monitoring?.systemHealth ?? 'healthy')}
          icon={<Gauge className="h-4 w-4" />}
        />
        <MetricCard
          label="Readiness"
          value={readiness?.status ?? '—'}
          status={readiness?.status === 'ok' ? 'success' : 'critical'}
          icon={<Server className="h-4 w-4" />}
        />
        <MetricCard
          label="Fehlerrate Polls"
          value={monitoring ? `${monitoring.errorRatePercent}%` : '—'}
          status={
            monitoring?.errorRatePercent > 10
              ? 'critical'
              : monitoring?.errorRatePercent > 5
                ? 'warning'
                : 'success'
          }
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          label="Enrichment pending"
          value={monitoring?.delayedOrStuckJobs ?? '—'}
          status={(monitoring?.delayedOrStuckJobs ?? 0) > 50 ? 'warning' : 'neutral'}
          icon={<Layers className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DataCard title="Infrastruktur">
          <div className="space-y-2 text-sm">
            {readiness?.checks &&
              Object.entries(readiness.checks).map(([name, check]: [string, any]) => (
                <div
                  key={name}
                  className="flex items-center justify-between py-1 border-b border-border/50 last:border-0"
                >
                  <span className="capitalize">{name}</span>
                  <StatusChip tone={check.status === 'ok' ? 'success' : 'critical'}>
                    {check.status}
                  </StatusChip>
                </div>
              ))}
            {readiness?.checks?.clickhouse?.details && (
              <p className="text-xs text-muted-foreground pt-1">
                CH: {String(readiness.checks.clickhouse.details.status)} — configured:{' '}
                {String(readiness.checks.clickhouse.details.configured)}
              </p>
            )}
          </div>
        </DataCard>

        <DataCard title="DIMO">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Fahrzeuge verbunden</span>
              <span className="font-semibold">
                {dimo?.connected ?? '—'} / {dimo?.total ?? '—'}
              </span>
            </div>
            <button
              type="button"
              className="text-xs text-[color:var(--brand)] hover:underline"
              onClick={() => onViewChange?.('fleet-connection')}
            >
              Fleet Connection öffnen →
            </button>
            <button
              type="button"
              className="block text-xs text-[color:var(--brand)] hover:underline"
              onClick={() => onViewChange?.('settings', 'monitoring')}
            >
              API & Worker Monitoring (Detail) →
            </button>
          </div>
        </DataCard>
      </div>

      <SectionHeader title="BullMQ Queues (live)" />
      <DataCard>
        <DataTable<QueueRow>
          columns={queueColumns}
          rows={queues}
          getRowKey={(r) => r.queue}
          empty="Keine Queue-Daten"
          card={false}
        />
      </DataCard>

      <SectionHeader title="Alerts (letzte Stunde)" />
      <DataCard>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <CheckCircle className="w-4 h-4 text-green-500" />
            Keine aktiven Alerts in der letzten Stunde
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a: any) => (
              <li
                key={a.id ?? a.title}
                className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/30"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{a.title ?? a.summary}</p>
                  <p className="text-xs text-muted-foreground">{a.affectedComponent}</p>
                </div>
                <StatusChip tone={a.severity === 'critical' ? 'critical' : 'warning'}>
                  {a.severity}
                </StatusChip>
              </li>
            ))}
          </ul>
        )}
      </DataCard>

      <SectionHeader title="Observability (Grafana / Prometheus)" />
      <DataCard title="Grafana & Prometheus">
        <p className="text-sm text-muted-foreground mb-3">
          Trends und historische Metriken laufen auf dem VPS (nur localhost). Master Admin zeigt den
          aktuellen Snapshot; Grafana für Verlauf und Deep-Dive.
        </p>
        <div className="space-y-2 text-sm font-mono">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            Grafana: {obs?.grafanaUrl ?? 'http://127.0.0.1:3000'}
          </div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-muted-foreground" />
            Prometheus: {obs?.prometheusUrl ?? 'http://127.0.0.1:9090'}
          </div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            Metrics token: {obs?.metricsConfigured ? 'konfiguriert' : 'fehlt'}
          </div>
        </div>
        {obs?.grafanaAccessHint && (
          <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3">
            {obs.grafanaAccessHint}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          Nach SSH-Tunnel: Browser → http://localhost:3000 (Grafana SynqDrive Ops Dashboard)
        </p>
      </DataCard>
    </div>
  );
}
