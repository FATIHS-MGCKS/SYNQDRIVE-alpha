import { Activity, Database, Search, Shield } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  MetricCard,
  PageHeader,
  SkeletonMetricGrid,
  SkeletonRows,
  StatusChip,
  type DataTableColumn,
} from '../../components/patterns';
import {
  api,
  type DataAnalyseEventArchitecture,
  type DataAnalyseEventLayer,
  type DataAnalyseHealthTrace,
  type DataAnalyseHfAvailabilityStatus,
  type DataAnalyseHighFrequency,
  type DataAnalyseLaunchFeasibilityResult,
  type DataAnalysePipeline,
  type DataAnalyseSignalGroup,
  type DataAnalyseSignalQuality,
  type DataAnalyseSignalRow,
  type DataAnalyseTelemetryOverview,
  type DataAnalyseVehicle,
  type DeviceConnectionSummary,
  type VehicleRpmWebhookSummary,
} from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import {
  DEVICE_CONNECTION_LABELS,
  deviceConnectionEventLabel,
  deviceConnectionSeverityTone,
  formatDeviceConnectionTimestamp,
  formatDurationMs,
  sortDeviceConnectionEvents,
  webhookConfiguredLabel,
} from '../lib/device-connection-ui';
import {
  RPM_WEBHOOK_LABELS,
  formatRpmTimestamp,
  formatRpmValue,
  rpmCandidateHeadline,
  rpmCandidateStatusLabel,
  rpmCandidateStatusTone,
  rpmContextSummary,
  rpmWebhookConfiguredLabel,
  sortRpmCandidates,
} from '../lib/rpm-webhook-ui';

/**
 * Canonical operator legend for the aggregated HF-availability status. Single
 * source of truth shared by the status chip and the legend block so the UI can
 * never describe the same state two different ways.
 */
const HF_AVAILABILITY_META: Record<
  DataAnalyseHfAvailabilityStatus,
  { label: string; tone: 'success' | 'warning' | 'critical' | 'neutral'; description: string }
> = {
  hf_available: {
    label: 'HF available',
    tone: 'success',
    description: 'Real, usable high-frequency telemetry (sub-2s cadence or healthy waypoint/HF-point volume).',
  },
  sparse: {
    label: 'HF sparse',
    tone: 'warning',
    description: 'Some HF/waypoint data exists but is too thin to be reliable for detection.',
  },
  snapshot_only: {
    label: 'Snapshot only (~30s)',
    tone: 'warning',
    description: 'Only ~30s snapshot/latest-state telemetry — no high-frequency stream.',
  },
  missing: {
    label: 'No telemetry',
    tone: 'critical',
    description: 'No telemetry of any kind observed for this vehicle.',
  },
  unknown: {
    label: 'Unknown',
    tone: 'neutral',
    description: 'Nothing queried yet / counts indeterminate.',
  },
};

type TabKey =
  | 'overview'
  | 'signals'
  | 'hf'
  | 'events'
  | 'deviceConnection'
  | 'rpmWebhooks'
  | 'launch'
  | 'health'
  | 'pipeline'
  | 'groups';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'signals', label: 'Signal Logs' },
  { key: 'hf', label: 'High Frequency' },
  { key: 'events', label: 'Event-Architektur' },
  { key: 'deviceConnection', label: 'Device Connection' },
  { key: 'rpmWebhooks', label: 'RPM Webhooks' },
  { key: 'launch', label: 'Launch Feasibility' },
  { key: 'health', label: 'Health Trace' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'groups', label: 'Signal Groups' },
];

const EVENT_LAYER_TONE: Record<string, 'success' | 'warning' | 'critical' | 'neutral'> = {
  active: 'success',
  configured: 'success',
  sparse: 'warning',
  snapshot_only: 'warning',
  insufficient: 'warning',
  no_events: 'neutral',
  not_configured: 'neutral',
  unknown: 'neutral',
  skipped: 'neutral',
  failed: 'critical',
  unavailable: 'critical',
};

function statusChipTone(status: string): 'success' | 'warning' | 'critical' | 'neutral' | 'info' {
  if (status === 'OK' || status === 'fresh' || status === 'available' || status === 'Good for detection' || status === 'current') {
    return 'success';
  }
  if (status === 'Delayed' || status === 'Borderline' || status === 'stale' || status === 'partial' || status === 'Possible but weak') {
    return 'warning';
  }
  if (status === 'Missing' || status === 'offline' || status === 'Not reliable' || status === 'Too sparse' || status === 'not_persisted') {
    return 'critical';
  }
  return 'neutral';
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function inputBasisTone(basis: string): 'success' | 'warning' | 'info' | 'neutral' {
  if (basis === 'signal-based') return 'success';
  if (basis === 'mixed') return 'info';
  if (basis === 'modeled') return 'warning';
  return 'neutral';
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function EventLayerCard({ title, layer }: { title: string; layer: DataAnalyseEventLayer }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{title}</span>
        <StatusChip tone={EVENT_LAYER_TONE[layer.status] ?? 'neutral'}>{layer.label}</StatusChip>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{layer.detail}</p>
      {layer.counters && layer.counters.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {layer.counters.map((c) => (
            <span key={c.label} className="text-[10px] text-muted-foreground tabular-nums">
              {c.label}: <span className="font-medium text-foreground">{c.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** LTE_R1 Event Context Architecture diagnostic tab (read-only). */
function EventArchitectureTab({ data }: { data: DataAnalyseEventArchitecture }) {
  const feas = data.detectorFeasibility;
  const m = data.metrics;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={data.powertrainApplicable ? 'success' : 'neutral'}>
          {data.powertrainApplicable ? 'LTE_R1 / ICE' : 'ICE-Kontext nicht anwendbar'}
        </StatusChip>
        <span className="text-xs text-muted-foreground">{data.powertrainNote}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <EventLayerCard title="LTE_R1 Native Event Intake" layer={data.nativeEventIntake} />
        <EventLayerCard title="Device Connection Webhook Intake" layer={data.deviceConnectionWebhookIntake} />
        <EventLayerCard title="RPM Webhook Intake" layer={data.rpmWebhookIntake} />
        <EventLayerCard title="Event Context Enrichment" layer={data.eventContextEnrichment} />
        <EventLayerCard title="Trip Signal Summary Enrichment" layer={data.tripSignalSummaryEnrichment} />
      </div>

      <div className="rounded-xl border border-border/60 p-4 space-y-3">
        <span className="text-sm font-semibold">Detector Feasibility</span>
        <div className="flex flex-wrap gap-2">
          <StatusChip tone={feas.nativeBehaviorEvents ? 'success' : 'neutral'}>
            Native Behavior Events: {feas.nativeBehaviorEvents ? 'verfügbar' : 'nein'}
          </StatusChip>
          <StatusChip tone={feas.deviceConnectionWebhooks ? 'success' : 'neutral'}>
            Device Connection Webhooks: {feas.deviceConnectionWebhooks ? 'verfügbar' : 'nein'}
          </StatusChip>
          <StatusChip tone={feas.rpmWebhooks ? 'success' : 'neutral'}>
            RPM Webhooks: {feas.rpmWebhooks ? 'verfügbar' : 'nein'}
          </StatusChip>
          <StatusChip tone={feas.contextClassification ? 'success' : 'neutral'}>
            Context Classification: {feas.contextClassification ? 'verfügbar' : 'nein'}
          </StatusChip>
          <StatusChip tone="warning">
            HF-derived Kurzzeit-Detektion: {feas.shortEventHfDerivedDetection === 'disabled' ? 'deaktiviert' : 'nicht belastbar'}
          </StatusChip>
        </div>
        {feas.notes.length > 0 && (
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
            {feas.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Effektive Kadenz" value={formatMs(m.effectiveCadenceMs)} />
        <MetricCard label="Median Intervall" value={formatMs(m.medianIntervalMs)} />
        <MetricCard label="P95 Intervall" value={formatMs(m.p95IntervalMs)} />
        <MetricCard label="Kontextfenster verarbeitet" value={String(m.contextWindowsProcessed)} />
        <MetricCard label="Device-Events (7d)" value={String(m.deviceConnectionEvents7d)} />
        <MetricCard label="RPM-Kandidaten (7d)" value={String(m.rpmWebhookCandidates7d)} />
        <MetricCard
          label="Offene Aussteck-Episode"
          value={m.openUnpluggedEpisode ? 'ja' : 'nein'}
        />
        <MetricCard
          label="Fehlende Signale"
          value={m.missingSignals.length ? m.missingSignals.join(', ') : '—'}
        />
      </div>
    </div>
  );
}

function DeviceConnectionTab({
  data,
  debugRaw,
}: {
  data: DeviceConnectionSummary;
  debugRaw: boolean;
}) {
  const events = sortDeviceConnectionEvents(data.recentEvents);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={data.lteR1Capable ? 'success' : 'neutral'}>
          {data.lteR1Capable ? DEVICE_CONNECTION_LABELS.lteR1Connected : 'Nicht LTE_R1'}
        </StatusChip>
        <StatusChip tone={EVENT_LAYER_TONE[data.webhookConfigured] ?? 'neutral'}>
          {webhookConfiguredLabel(data.webhookConfigured)}
        </StatusChip>
        {data.openUnpluggedEpisode && data.severity && (
          <StatusChip tone={deviceConnectionSeverityTone(data.severity)}>
            {DEVICE_CONNECTION_LABELS.telematicsInterruption}
          </StatusChip>
        )}
        {data.rentalRelevant && (
          <StatusChip tone="critical">{DEVICE_CONNECTION_LABELS.duringActiveBooking}</StatusChip>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Abgezogen (24h)" value={String(data.unpluggedCount24h)} />
        <MetricCard label="Abgezogen (7d)" value={String(data.unpluggedCount7d)} />
        <MetricCard label="Eingesteckt (24h)" value={String(data.pluggedCount24h)} />
        <MetricCard label="Eingesteckt (7d)" value={String(data.pluggedCount7d)} />
        <MetricCard
          label="Letzter Webhook"
          value={formatDeviceConnectionTimestamp(data.lastWebhookReceivedAt)}
        />
        <MetricCard
          label="Offene Episode"
          value={data.openUnpluggedEpisode ? 'ja' : DEVICE_CONNECTION_LABELS.noOpenInterruption}
        />
        <MetricCard
          label="Episode-Dauer"
          value={formatDurationMs(data.openUnpluggedDurationMs)}
        />
        <MetricCard
          label="Buchungskontext"
          value={data.activeBookingId ? data.activeBookingId : '—'}
        />
      </div>

      <div className="rounded-xl border border-border/60 p-4 space-y-2">
        <p className="text-sm font-semibold">DIMO Device Connection Events</p>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">Keine Webhook-Ereignisse im Fenster.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-border/30 pb-2 last:border-0"
              >
                <span className="font-medium">{deviceConnectionEventLabel(event.eventType)}</span>
                <span className="text-muted-foreground">
                  {formatDeviceConnectionTimestamp(event.observedAt)}
                </span>
                <StatusChip tone={deviceConnectionSeverityTone(event.severity)} className="text-[10px]">
                  {event.severity}
                </StatusChip>
                {event.rentalRelevant && (
                  <StatusChip tone="critical" className="text-[10px]">
                    {DEVICE_CONNECTION_LABELS.duringActiveBooking}
                  </StatusChip>
                )}
                {(event.bookingId || event.tripId) && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {event.bookingId ? `booking:${event.bookingId}` : ''}
                    {event.tripId ? ` trip:${event.tripId}` : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {debugRaw && data.rawEvents && data.rawEvents.length > 0 && (
        <div className="rounded-xl border border-dashed border-border/60 p-4 space-y-2">
          <p className="text-sm font-semibold">Admin Debug — Raw Payload</p>
          <pre className="text-[10px] overflow-auto max-h-64 bg-muted/30 p-2 rounded-lg">
            {JSON.stringify(data.rawEvents, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function RpmWebhookTab({ data }: { data: VehicleRpmWebhookSummary }) {
  const candidates = sortRpmCandidates(data.recentCandidates);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={data.lteR1IceCapable ? 'success' : 'neutral'}>
          {data.lteR1IceCapable ? RPM_WEBHOOK_LABELS.lteR1Ice : RPM_WEBHOOK_LABELS.notLteR1Ice}
        </StatusChip>
        <StatusChip tone={EVENT_LAYER_TONE[data.webhookConfigured] ?? 'neutral'}>
          {rpmWebhookConfiguredLabel(data.webhookConfigured)}
        </StatusChip>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Kandidaten (24h)" value={String(data.count24h)} />
        <MetricCard label="Kandidaten (7d)" value={String(data.count7d)} />
        <MetricCard
          label="Letzter Trigger"
          value={formatRpmTimestamp(data.lastObservedAt)}
        />
        <MetricCard
          label="Max RPM (7d)"
          value={formatRpmValue(data.maxObservedRpm7d)}
        />
        <MetricCard
          label="Standard-Schwellwert"
          value={formatRpmValue(data.thresholdDefault)}
        />
      </div>

      <div className="rounded-xl border border-border/60 p-4 space-y-2">
        <p className="text-sm font-semibold">DIMO RPM Webhook Kandidaten</p>
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">{RPM_WEBHOOK_LABELS.noCandidates}</p>
        ) : (
          <ul className="space-y-2">
            {candidates.map((candidate) => {
              const contextSummary = rpmContextSummary(candidate);
              return (
                <li
                  key={candidate.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-border/30 pb-2 last:border-0"
                >
                  <span className="font-medium">{rpmCandidateHeadline(candidate)}</span>
                  <span className="text-muted-foreground">
                    {formatRpmTimestamp(candidate.observedAt)}
                  </span>
                  <StatusChip tone={rpmCandidateStatusTone(candidate.status)} className="text-[10px]">
                    {rpmCandidateStatusLabel(candidate.status)}
                  </StatusChip>
                  {contextSummary && (
                    <span className="text-[10px] text-muted-foreground w-full">{contextSummary}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function DataAnalyseView() {
  const { orgId, hasPermission } = useRentalOrg();
  const canAccess = hasPermission('data-analyse', 'read');

  const [vehicles, setVehicles] = useState<DataAnalyseVehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<DataAnalyseTelemetryOverview | null>(null);
  const [signals, setSignals] = useState<DataAnalyseSignalRow[]>([]);
  const [hf, setHf] = useState<DataAnalyseHighFrequency | null>(null);
  const [signalQuality, setSignalQuality] = useState<DataAnalyseSignalQuality | null>(null);
  const [launch, setLaunch] = useState<DataAnalyseLaunchFeasibilityResult | null>(null);
  const [health, setHealth] = useState<DataAnalyseHealthTrace | null>(null);
  const [pipeline, setPipeline] = useState<DataAnalysePipeline | null>(null);
  const [groups, setGroups] = useState<DataAnalyseSignalGroup[]>([]);
  const [eventArch, setEventArch] = useState<DataAnalyseEventArchitecture | null>(null);
  const [deviceConnection, setDeviceConnection] = useState<DeviceConnectionSummary | null>(null);
  const [deviceConnectionDebugRaw, setDeviceConnectionDebugRaw] = useState(false);
  const [rpmWebhooks, setRpmWebhooks] = useState<VehicleRpmWebhookSummary | null>(null);

  const [signalSearch, setSignalSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedId) ?? null,
    [vehicles, selectedId],
  );

  const loadVehicles = useCallback(async () => {
    if (!orgId || !canAccess) {
      setLoadingVehicles(false);
      return;
    }
    setLoadingVehicles(true);
    setError(null);
    try {
      const list = await api.dataAnalyse.vehicles(orgId);
      setVehicles(list);
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
      }
    } catch {
      setVehicles([]);
      setError('Could not load connected vehicles for analysis.');
    } finally {
      setLoadingVehicles(false);
    }
  }, [orgId, canAccess, selectedId]);

  const loadVehicleData = useCallback(async () => {
    if (!orgId || !selectedId || !canAccess) return;
    setLoadingData(true);
    setError(null);
    try {
      const [ov, sig, hfRes, sqRes, launchRes, healthRes, pipe, grp, evArch, devConn, rpm] = await Promise.all([
        api.dataAnalyse.telemetryOverview(orgId, selectedId),
        api.dataAnalyse.signals(orgId, selectedId),
        api.dataAnalyse.highFrequency(orgId, selectedId),
        api.dataAnalyse.latestTripSignalQuality(orgId, selectedId).catch(() => null),
        api.dataAnalyse.launchFeasibility(orgId, selectedId),
        api.dataAnalyse.healthTrace(orgId, selectedId),
        api.dataAnalyse.pipeline(orgId, selectedId),
        api.dataAnalyse.signalGroups(orgId, selectedId),
        api.dataAnalyse.eventArchitecture(orgId, selectedId),
        api.dataAnalyse.deviceConnectionEvents(orgId, selectedId, deviceConnectionDebugRaw),
        api.dataAnalyse.rpmWebhookCandidates(orgId, selectedId),
      ]);
      setOverview(ov);
      setSignals(sig);
      setHf(hfRes);
      setSignalQuality(sqRes);
      setLaunch(launchRes);
      setHealth(healthRes);
      setPipeline(pipe);
      setGroups(grp);
      setEventArch(evArch);
      setDeviceConnection(devConn);
      setRpmWebhooks(rpm);
    } catch {
      setError('Analysis data could not be loaded for the selected vehicle.');
    } finally {
      setLoadingData(false);
    }
  }, [orgId, selectedId, canAccess, deviceConnectionDebugRaw]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    void loadVehicleData();
  }, [loadVehicleData]);

  const signalGroups = useMemo(() => {
    const set = new Set(signals.map((s) => s.signalGroup));
    return ['all', ...Array.from(set).sort()];
  }, [signals]);

  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const s of signals) {
      for (const m of s.usedByModules) set.add(m);
    }
    return ['all', ...Array.from(set).sort()];
  }, [signals]);

  const filteredSignals = useMemo(() => {
    return signals
      .filter((s) => {
        if (signalSearch && !s.signalName.toLowerCase().includes(signalSearch.toLowerCase())) return false;
        if (groupFilter !== 'all' && s.signalGroup !== groupFilter) return false;
        if (statusFilter !== 'all' && s.intervalStatus !== statusFilter) return false;
        if (moduleFilter !== 'all' && !s.usedByModules.includes(moduleFilter)) return false;
        return true;
      })
      .sort((a, b) => {
        const aTs = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
        const bTs = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
        return bTs - aTs;
      });
  }, [signals, signalSearch, groupFilter, statusFilter, moduleFilter]);

  const signalColumns: DataTableColumn<DataAnalyseSignalRow>[] = [
    { key: 'signalName', header: 'Signal', cell: (r) => <span className="font-mono text-xs">{r.signalName}</span> },
    { key: 'signalGroup', header: 'Group', cell: (r) => r.signalGroup },
    { key: 'latestValue', header: 'Latest', cell: (r) => String(r.latestValue ?? '—') },
    { key: 'unit', header: 'Unit', cell: (r) => r.unit ?? '—' },
    { key: 'lastSeen', header: 'Last seen', cell: (r) => formatTs(r.lastSeen) },
    { key: 'observedIntervalMs', header: 'Interval', cell: (r) => formatMs(r.observedIntervalMs) },
    {
      key: 'intervalStatus',
      header: 'Status',
      cell: (r) => <StatusChip tone={statusChipTone(r.intervalStatus)}>{r.intervalStatus}</StatusChip>,
    },
    { key: 'storageLocation', header: 'Storage', cell: (r) => <span className="text-xs text-muted-foreground">{r.storageLocation}</span> },
    {
      key: 'usedByModules',
      header: 'Used by',
      cell: (r) => r.usedByModules.join(', '),
    },
  ];

  if (!canAccess) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Shield className="w-5 h-5" />}
          title="Access restricted"
          description="Data Analyse is available to organization admins with data-analyse.read permission."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-[1400px] mx-auto w-full">
      <PageHeader
        title="Data Analyse"
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="info">Temporary internal diagnostic page</StatusChip>
            <StatusChip tone="neutral">Read-only</StatusChip>
          </div>
        }
      />

      {error && <ErrorState error={error} onRetry={() => { void loadVehicles(); void loadVehicleData(); }} />}

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Vehicle selector</h2>
        </div>
        {loadingVehicles ? (
          <SkeletonRows rows={2} />
        ) : vehicles.length === 0 ? (
          <EmptyState
            icon={<Activity className="w-5 h-5" />}
            title="No active connected vehicles"
            description="No active connected vehicles available for telemetry analysis."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedId(v.id)}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  selectedId === v.id ? 'border-primary bg-primary/5' : 'border-border/60 hover:bg-muted/40'
                }`}
              >
                <div className="font-medium text-sm">{v.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {v.licensePlate ?? '—'} · {v.provider ?? '—'}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <StatusChip tone={statusChipTone(v.connectionStatus)}>{v.connectionStatus}</StatusChip>
                  <span className="text-[10px] text-muted-foreground">Last: {formatTs(v.lastSeenAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedVehicle && (
        <>
          <div className="flex flex-wrap gap-1 border-b border-border/60 pb-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                  tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loadingData && tab === 'overview' ? (
            <SkeletonMetricGrid count={4} />
          ) : null}

          {tab === 'overview' && overview && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Last telemetry" value={formatTs(overview.lastTelemetryReceived)} />
                <MetricCard label="Signals observed" value={String(overview.totalSignalsObserved)} />
                <MetricCard label="HF signals" value={String(overview.highFrequencySignalsObserved)} />
                <MetricCard
                  label="Freshness"
                  value={overview.insufficientData ? 'insufficient data' : overview.dataFreshnessStatus}
                />
                <MetricCard label="Avg interval" value={formatMs(overview.averageObservedIntervalMs)} />
                <MetricCard label="Fastest interval" value={formatMs(overview.fastestObservedIntervalMs)} />
                <MetricCard label="Slowest interval" value={formatMs(overview.slowestObservedIntervalMs)} />
                <MetricCard
                  label="Missing expected"
                  value={String(overview.missingExpectedSignals.length)}
                />
              </div>
              {overview.notes.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                  {overview.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'signals' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={signalSearch}
                    onChange={(e) => setSignalSearch(e.target.value)}
                    placeholder="Search signal name"
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background"
                  />
                </div>
                <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="text-xs rounded-md border border-border px-2 py-1.5 bg-background">
                  {signalGroups.map((g) => (
                    <option key={g} value={g}>{g === 'all' ? 'All groups' : g}</option>
                  ))}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs rounded-md border border-border px-2 py-1.5 bg-background">
                  {['all', 'OK', 'Delayed', 'Sparse', 'Missing', 'Unknown'].map((s) => (
                    <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>
                  ))}
                </select>
                <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="text-xs rounded-md border border-border px-2 py-1.5 bg-background">
                  {modules.map((m) => (
                    <option key={m} value={m}>{m === 'all' ? 'All modules' : m}</option>
                  ))}
                </select>
              </div>
              {loadingData ? (
                <SkeletonRows rows={8} />
              ) : (
                <DataTable
                  columns={signalColumns}
                  rows={filteredSignals}
                  getRowKey={(r) => r.signalName}
                  empty="No signals match filters."
                />
              )}
            </div>
          )}

          {tab === 'hf' && hf && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const meta = HF_AVAILABILITY_META[hf.hfAvailabilityStatus ?? 'unknown'];
                  return (
                    <StatusChip tone={meta.tone} title={meta.description}>
                      {meta.label}
                    </StatusChip>
                  );
                })()}
                <StatusChip tone={hf.available ? 'success' : 'critical'}>
                  {hf.available ? 'High-frequency detection active' : 'No active high-frequency detection'}
                </StatusChip>
                {hf.snapshotLevelOnly && (
                  <StatusChip tone="warning">Snapshot-level only (~30s)</StatusChip>
                )}
                <StatusChip tone={hf.clickHouseAvailable ? 'success' : 'neutral'}>
                  ClickHouse: {hf.clickHouseAvailable ? 'available' : 'unavailable'}
                </StatusChip>
                <StatusChip
                  tone={
                    hf.hfMirrorStatus === 'enabled'
                      ? 'success'
                      : hf.hfMirrorStatus === 'disabled'
                        ? 'neutral'
                        : 'warning'
                  }
                >
                  HF mirror: {hf.hfMirrorStatus ?? 'unknown'}
                </StatusChip>
              </div>
              {hf.message && (
                <p className="text-sm text-amber-600 dark:text-amber-400">{hf.message}</p>
              )}
              <details className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <summary className="cursor-pointer select-none font-medium text-muted-foreground">
                  HF availability legend
                </summary>
                <dl className="mt-2 space-y-1">
                  {(Object.keys(HF_AVAILABILITY_META) as DataAnalyseHfAvailabilityStatus[]).map(
                    (key) => (
                      <div key={key} className="flex items-start gap-2">
                        <dt className="min-w-[140px] font-medium text-foreground">
                          {HF_AVAILABILITY_META[key].label}
                        </dt>
                        <dd className="text-muted-foreground">
                          {HF_AVAILABILITY_META[key].description}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </details>
              {/* Clearly-separated persistence layers — "waypoints missing" is NOT
                  the same as "HF missing". Each layer is counted on its own. */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="HF points (telemetry_hf_points)"
                  value={`${hf.hfPointCount24h ?? '—'} / ${hf.hfPointCount7d ?? '—'}`}
                  hint="24h / 7d"
                />
                <MetricCard
                  label="Waypoints (telemetry_waypoints)"
                  value={`${hf.waypointCount24h ?? '—'} / ${hf.waypointCount7d ?? '—'}`}
                  hint="24h / 7d"
                />
                <MetricCard
                  label="Snapshot samples (telemetry_snapshots)"
                  value={`${hf.snapshotSampleCount24h ?? '—'} / ${hf.snapshotSampleCount7d ?? '—'}`}
                  hint="24h / 7d"
                />
                <MetricCard
                  label="HF events (telemetry_hf_events)"
                  value={String(hf.hfRecentEvents?.length ?? 0)}
                  hint="recent (24h)"
                />
              </div>
              {hf.hfSignalGroupsSeen && hf.hfSignalGroupsSeen.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  HF signal groups seen: {hf.hfSignalGroupsSeen.join(', ')}
                  {hf.hfLatestPointAt ? ` · latest HF point: ${formatTs(hf.hfLatestPointAt)}` : ''}
                </p>
              )}
              {signalQuality && (
                <details className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
                  <summary className="cursor-pointer select-none font-medium text-amber-800 dark:text-amber-300">
                    Internal debug — trip signal quality (read-only, not a trip score)
                  </summary>
                  <div className="mt-2 space-y-2 text-muted-foreground">
                    <div className="flex flex-wrap gap-2">
                      <StatusChip tone={signalQuality.degraded ? 'warning' : 'neutral'}>
                        {signalQuality.degraded ? 'Degraded (CH)' : 'ClickHouse OK'}
                      </StatusChip>
                      <StatusChip
                        tone={
                          signalQuality.overallQuality === 'good'
                            ? 'success'
                            : signalQuality.overallQuality === 'unavailable'
                              ? 'critical'
                              : 'warning'
                        }
                      >
                        Quality: {signalQuality.overallQuality}
                      </StatusChip>
                      <StatusChip tone="neutral">HF: {signalQuality.hfAvailability}</StatusChip>
                      <StatusChip tone="neutral">
                        Windows: {signalQuality.windowCount} · Points: {signalQuality.hfPointCount}
                      </StatusChip>
                    </div>
                    {signalQuality.tripId && (
                      <p>Trip: <span className="font-mono">{signalQuality.tripId}</span></p>
                    )}
                    {signalQuality.missingKeySignals.length > 0 && (
                      <p>Missing key signals: {signalQuality.missingKeySignals.join(', ')}</p>
                    )}
                    {signalQuality.reasons.length > 0 && (
                      <ul className="list-disc pl-4">
                        {signalQuality.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              )}
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="p-2 font-medium">Signal</th>
                      <th className="p-2 font-medium">Reliability</th>
                      <th className="p-2 font-medium">Detection</th>
                      <th className="p-2 font-medium">24h / 7d</th>
                      <th className="p-2 font-medium">Median / P95</th>
                      <th className="p-2 font-medium">Launch</th>
                      <th className="p-2 font-medium">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hf.signals.map((s) => (
                      <tr key={s.signalKey} className="border-t border-border/40 align-top">
                        <td className="p-2">
                          <div className="font-mono">{s.displayName || s.signalName}</div>
                          <div className="text-muted-foreground">{s.pollGroup} · {s.storageTable}</div>
                          <div className="text-muted-foreground mt-1">{s.explanation}</div>
                          {s.notes.length > 0 && (
                            <ul className="mt-1 text-muted-foreground list-disc pl-4">
                              {s.notes.map((n) => <li key={n}>{n}</li>)}
                            </ul>
                          )}
                        </td>
                        <td className="p-2">
                          <StatusChip tone={statusChipTone(s.reliabilityStatus)}>{s.reliabilityStatus}</StatusChip>
                        </td>
                        <td className="p-2">
                          <StatusChip tone={statusChipTone(s.detectionQuality)}>{s.detectionQuality}</StatusChip>
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {s.sampleCount24h ?? '—'} / {s.sampleCount7d ?? '—'}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {formatMs(s.medianIntervalMs)} / {formatMs(s.p95IntervalMs)}
                          <div>Gaps: {s.gapCount ?? '—'}</div>
                        </td>
                        <td className="p-2">
                          <StatusChip tone={statusChipTone(s.launchDetectionUsefulness)}>{s.launchDetectionUsefulness}</StatusChip>
                          <div className="text-muted-foreground mt-1">{s.practicalUse.join(', ') || '—'}</div>
                        </td>
                        <td className="p-2 text-muted-foreground">{formatTs(s.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'events' && eventArch && (
            <EventArchitectureTab data={eventArch} />
          )}

          {tab === 'deviceConnection' && deviceConnection && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={deviceConnectionDebugRaw}
                  onChange={(e) => setDeviceConnectionDebugRaw(e.target.checked)}
                />
                Admin Debug — Raw Webhook Payload anzeigen
              </label>
              <DeviceConnectionTab data={deviceConnection} debugRaw={deviceConnectionDebugRaw} />
            </div>
          )}

          {tab === 'rpmWebhooks' && rpmWebhooks && (
            <RpmWebhookTab data={rpmWebhooks} />
          )}

          {tab === 'launch' && launch && (
            <div className="rounded-xl border border-border/60 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Feasibility</span>
                <StatusChip tone={statusChipTone(launch.feasibility)}>{launch.feasibility}</StatusChip>
              </div>
              <p className="text-sm">{launch.recommendation}</p>
              <div className="grid md:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="font-medium mb-1">Available</div>
                  <p className="text-muted-foreground">{launch.availableSignals.join(', ') || '—'}</p>
                </div>
                <div>
                  <div className="font-medium mb-1">Missing</div>
                  <p className="text-muted-foreground">{launch.missingSignals.join(', ') || '—'}</p>
                </div>
              </div>
              <ul className="text-xs text-muted-foreground list-disc pl-4">
                {launch.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          )}

          {tab === 'health' && health && (
            <div className="grid gap-4 lg:grid-cols-3">
              {(['brake', 'tire', 'battery'] as const).map((key) => {
                const section = health[key];
                return (
                  <div key={key} className="rounded-xl border border-border/60 p-4 space-y-2">
                    <h3 className="text-sm font-semibold capitalize">{key} Health Trace</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip tone={statusChipTone(section.freshness)}>{section.freshness}</StatusChip>
                      <StatusChip tone={inputBasisTone(section.inputBasis)}>{section.inputBasis}</StatusChip>
                    </div>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <div>Status: {section.status ?? '—'}</div>
                      <div>Last calc: {formatTs(section.lastCalculationAt)}</div>
                      <div>Source: {section.calculationSource ?? 'Unknown / not traceable'}</div>
                    </div>
                    {section.notes.map((n) => (
                      <p key={n} className="text-xs text-amber-600 dark:text-amber-400">{n}</p>
                    ))}
                    {Array.isArray((section.evidence as { consumedSignals?: unknown }).consumedSignals) && (
                      <div className="text-xs space-y-1 mt-2">
                        <div className="font-medium">Signal inputs</div>
                        {((section.evidence as { consumedSignals: Array<{ signal: string; arriving: boolean; lastSeen: string | null; intervalStatus: string }> }).consumedSignals).map((sig) => (
                          <div key={sig.signal} className="flex justify-between gap-2 text-muted-foreground">
                            <span className="font-mono">{sig.signal}</span>
                            <span>{sig.arriving ? sig.intervalStatus : 'missing'} · {formatTs(sig.lastSeen)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-auto max-h-32">
                      {JSON.stringify(section.evidence, null, 2)}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'pipeline' && pipeline && (
            <div className="space-y-3">
              <p className="text-sm">Provider: <strong>{pipeline.provider ?? 'Unknown'}</strong></p>
              <div className="flex flex-col gap-2">
                {pipeline.steps.map((step, i) => (
                  <div key={step.step} className="flex items-start gap-3">
                    <div className="text-xs text-muted-foreground w-6">{i + 1}</div>
                    <div className="flex-1 rounded-lg border border-border/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{step.step}</span>
                        <StatusChip tone={statusChipTone(step.status)}>{step.status}</StatusChip>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {step.sourceName ?? 'Unknown / not traceable'} · {formatTs(step.lastSeenAt)}
                      </div>
                      {step.notes && <p className="text-xs mt-1">{step.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {pipeline.lastError && (
                <p className="text-xs text-destructive">Last error: {pipeline.lastError}</p>
              )}
            </div>
          )}

          {tab === 'groups' && (
            <div className="grid gap-3">
              {groups.map((g) => (
                <div key={g.id} className="rounded-lg border border-border/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{g.groupName}</h3>
                    <StatusChip tone={statusChipTone(g.currentAvailability)}>{g.currentAvailability}</StatusChip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{g.description}</p>
                  <p className="text-xs mt-2"><span className="font-medium">Use:</span> {g.practicalUse}</p>
                  {g.sourceProvider && (
                    <p className="text-xs mt-1 text-muted-foreground"><span className="font-medium">Source:</span> {g.sourceProvider}</p>
                  )}
                  {g.storageLocation && (
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Storage:</span> {g.storageLocation}</p>
                  )}
                  {g.limitations && (
                    <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">{g.limitations}</p>
                  )}
                  <p className="text-xs"><span className="font-medium">Modules:</span> {g.usedByModules.join(', ')}</p>
                  {g.availabilityNotes && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{g.availabilityNotes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
