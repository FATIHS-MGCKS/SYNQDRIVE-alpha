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
  type DataAnalyseHealthTrace,
  type DataAnalyseHighFrequency,
  type DataAnalyseLaunchFeasibilityResult,
  type DataAnalysePipeline,
  type DataAnalyseSignalGroup,
  type DataAnalyseSignalRow,
  type DataAnalyseTelemetryOverview,
  type DataAnalyseVehicle,
} from '../../lib/api';
import { useRentalOrg } from '../RentalContext';

type TabKey =
  | 'overview'
  | 'signals'
  | 'hf'
  | 'launch'
  | 'health'
  | 'pipeline'
  | 'groups';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'signals', label: 'Signal Logs' },
  { key: 'hf', label: 'High Frequency' },
  { key: 'launch', label: 'Launch Feasibility' },
  { key: 'health', label: 'Health Trace' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'groups', label: 'Signal Groups' },
];

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
  const [launch, setLaunch] = useState<DataAnalyseLaunchFeasibilityResult | null>(null);
  const [health, setHealth] = useState<DataAnalyseHealthTrace | null>(null);
  const [pipeline, setPipeline] = useState<DataAnalysePipeline | null>(null);
  const [groups, setGroups] = useState<DataAnalyseSignalGroup[]>([]);

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
      const [ov, sig, hfRes, launchRes, healthRes, pipe, grp] = await Promise.all([
        api.dataAnalyse.telemetryOverview(orgId, selectedId),
        api.dataAnalyse.signals(orgId, selectedId),
        api.dataAnalyse.highFrequency(orgId, selectedId),
        api.dataAnalyse.launchFeasibility(orgId, selectedId),
        api.dataAnalyse.healthTrace(orgId, selectedId),
        api.dataAnalyse.pipeline(orgId, selectedId),
        api.dataAnalyse.signalGroups(orgId, selectedId),
      ]);
      setOverview(ov);
      setSignals(sig);
      setHf(hfRes);
      setLaunch(launchRes);
      setHealth(healthRes);
      setPipeline(pipe);
      setGroups(grp);
    } catch {
      setError('Analysis data could not be loaded for the selected vehicle.');
    } finally {
      setLoadingData(false);
    }
  }, [orgId, selectedId, canAccess]);

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
        description="Analyze real telemetry arrival, signal intervals, high-frequency availability, storage paths, and health calculation inputs for connected vehicles."
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
                <StatusChip tone={hf.available ? 'success' : 'critical'}>
                  {hf.available ? 'High-frequency detection active' : 'No active high-frequency detection'}
                </StatusChip>
                {hf.snapshotLevelOnly && (
                  <StatusChip tone="warning">Snapshot-level only (~30s)</StatusChip>
                )}
              </div>
              {hf.message && (
                <p className="text-sm text-amber-600 dark:text-amber-400">{hf.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                ClickHouse: {hf.clickHouseAvailable ? 'available' : 'unavailable'} · Waypoints (24h): {hf.waypointCount24h ?? '—'}
              </p>
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
