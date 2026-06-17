import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  Zap,
  Server,
  BarChart3,
  Car,
  AlertCircle,
  XCircle,
  Info,
  Gauge,
  Loader2,
  X,
  ChevronRight,
  Key,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldQuestion,
  Link2,
  Settings2,
  Timer,
  Hash,
  Globe,
} from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, DataTable, MetricCard, DataCard, EmptyState, ErrorState, StatusChip, StatusDot, SectionHeader, DetailDrawer, tokenAuthStatusTone, workerMonitoringTone, monitoringSystemHealthTone, pollLogStatusTone } from '../../components/patterns';
import type { DataTableColumn } from '../../components/patterns';
import { api } from '../../lib/api';

/* ── Design-system token helpers ── */
const CARD = 'sq-card overflow-hidden';
const INPUT =
  'w-full px-4 py-2.5 rounded-xl border border-border bg-muted/50 text-sm text-foreground transition-colors outline-none focus:border-[color:var(--brand)] placeholder:text-muted-foreground';
const LABEL = 'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';
const HEAD = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';
const TAB_BAR = 'sq-tab-bar flex gap-1 p-1 rounded-2xl overflow-x-auto w-fit';
const TAB_ACTIVE = 'sq-tab-active flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap';
const TAB_IDLE = 'sq-tab flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap text-muted-foreground hover:text-foreground';



function formatTtl(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return 'expired';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

interface TokenCardData {
  label: string;
  status: string;
  lastAcquiredAt: string | null;
  expiresAt: string | null;
  ttlRemainingSeconds: number | null;
  totalFetches: number;
  totalSuccesses: number;
  totalFailures: number;
  consecutiveFailures: number;
  lastErrorAt: string | null;
  lastError: string | null;
  lastErrorHttpStatus: number | null;
  avgFetchDurationMs: number | null;
}

function tokenStatusIcon(status: string) {
  const s = String(status).toUpperCase();
  if (s === 'VALID') return ShieldCheck;
  if (s === 'EXPIRED') return ShieldAlert;
  if (s === 'ERROR') return ShieldX;
  return ShieldQuestion;
}

function TokenStatusCard({ data }: { data: TokenCardData }) {
  const tone = tokenAuthStatusTone(data.status);
  const StatusIcon = tokenStatusIcon(data.status);
  const successRate = data.totalFetches > 0 ? Math.round((data.totalSuccesses / data.totalFetches) * 100) : null;

  return (
    <DataCard bodyClassName="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <StatusIcon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{data.label}</p>
            <StatusChip tone={tone} className="!text-[10px] mt-0.5">
              {data.status}
            </StatusChip>
          </div>
        </div>
        {data.ttlRemainingSeconds != null && data.ttlRemainingSeconds > 0 && (
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">TTL</p>
            <p className={`text-sm font-bold tabular-nums ${data.ttlRemainingSeconds < 300 ? 'text-[color:var(--status-watch)]' : 'text-foreground'}`}>
              {formatTtl(data.ttlRemainingSeconds)}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="text-muted-foreground">Last acquired</div>
        <div className="text-right font-medium text-foreground">{timeAgo(data.lastAcquiredAt)}</div>

        <div className="text-muted-foreground">Expires at</div>
        <div className="text-right font-medium text-foreground">
          {data.expiresAt ? new Date(data.expiresAt).toLocaleTimeString() : '—'}
        </div>

        <div className="text-muted-foreground">Fetches</div>
        <div className="text-right font-medium text-foreground">
          {data.totalFetches}{' '}
          <span className="text-[color:var(--status-positive)]">({data.totalSuccesses})</span> /{' '}
          <span className="text-[color:var(--status-critical)]">{data.totalFailures}</span>
        </div>

        <div className="text-muted-foreground">Success rate</div>
        <div className={`text-right font-medium ${successRate != null && successRate < 80 ? 'text-[color:var(--status-critical)]' : 'text-foreground'}`}>
          {successRate != null ? `${successRate}%` : '—'}
        </div>

        <div className="text-muted-foreground">Avg fetch time</div>
        <div className="text-right font-medium text-foreground">
          {data.avgFetchDurationMs != null ? `${data.avgFetchDurationMs} ms` : '—'}
        </div>

        {data.consecutiveFailures > 0 && (
          <>
            <div className="font-medium text-[color:var(--status-critical)]">Consec. failures</div>
            <div className="text-right font-bold text-[color:var(--status-critical)]">{data.consecutiveFailures}</div>
          </>
        )}
      </div>

      {data.lastError && (
        <div className="sq-tone-critical mt-3 rounded-lg border border-border p-2.5 text-xs">
          <div className="mb-1 flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3 shrink-0 text-[color:var(--status-critical)]" />
            <span className="font-semibold text-[color:var(--status-critical)]">
              Last error {data.lastErrorHttpStatus ? `(HTTP ${data.lastErrorHttpStatus})` : ''}
            </span>
            <span className="ml-auto text-muted-foreground">{timeAgo(data.lastErrorAt)}</span>
          </div>
          <p className="break-words text-[color:var(--status-critical)]">{data.lastError}</p>
        </div>
      )}
    </DataCard>
  );
}

function TokenAuthHealthPanel({ tokenHealth,
  tokenHealthLoading,
  onRefresh,
  tokenEventFilter,
  setTokenEventFilter,
  tokenEventExpanded,
  setTokenEventExpanded,
  tokenConfigExpanded,
  setTokenConfigExpanded,
}: {
  tokenHealth: any;
  tokenHealthLoading: boolean;
  onRefresh: () => void;
  tokenEventFilter: string;
  setTokenEventFilter: (v: string) => void;
  tokenEventExpanded: boolean;
  setTokenEventExpanded: (v: boolean) => void;
  tokenConfigExpanded: boolean;
  setTokenConfigExpanded: (v: boolean) => void;
}) {
  const vehicleEntries: [string, any][] = tokenHealth?.vehicles
    ? Object.entries(tokenHealth.vehicles)
    : [];

  const filteredEvents = useMemo(() => {
    const events: any[] = tokenHealth?.recentEvents ?? [];
    if (!tokenEventFilter) return events;
    return events.filter(
      (e: any) =>
        (tokenEventFilter === 'DEVELOPER' && e.type === 'DEVELOPER_JWT') ||
        (tokenEventFilter === 'VEHICLE' && e.type === 'VEHICLE_JWT') ||
        (tokenEventFilter === 'ERROR' && !e.success),
    );
  }, [tokenHealth?.recentEvents, tokenEventFilter]);

  const visibleEvents = tokenEventExpanded ? filteredEvents : filteredEvents.slice(0, 15);

  const overallHealth = useMemo(() => {
    if (!tokenHealth) return 'unknown';
    const devOk = tokenHealth.developer?.status === 'VALID';
    const vehStatuses = vehicleEntries.map(([, v]) => v.status);
    const allVehOk = vehStatuses.length === 0 || vehStatuses.every((s: string) => s === 'VALID');
    if (devOk && allVehOk) return 'healthy';
    const anyError = tokenHealth.developer?.status === 'ERROR' || vehStatuses.some((s: string) => s === 'ERROR');
    if (anyError) return 'critical';
    return 'warning';
  }, [tokenHealth, vehicleEntries]);

  const overallTone = useMemo(() => monitoringSystemHealthTone(overallHealth), [overallHealth]);

  return (
    <DataCard
      title="Token & Auth Health"
      description="Developer JWT + Vehicle JWT lifecycle, diagnostics & event history"
      actions={
        <div className="flex items-center gap-2">
          {tokenHealth && (
            <StatusChip tone={overallTone}>
              {overallHealth === 'healthy' ? 'All tokens healthy' : overallHealth === 'critical' ? 'Token errors' : 'Token warnings'}
            </StatusChip>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={tokenHealthLoading}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${tokenHealthLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
      bodyClassName="p-5 space-y-5"
    >
      {tokenHealthLoading && !tokenHealth ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[color:var(--status-info)]" />
        </div>
      ) : !tokenHealth ? (
        <EmptyState
          compact
          icon={<ShieldQuestion className="h-8 w-8" />}
          title="Token health unavailable"
          description="The backend may not be running."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <TokenStatusCard
              data={{
                label: 'Developer JWT',
                ...tokenHealth.developer,
              }}
            />
            {vehicleEntries.map(([tokenId, v]) => (
              <TokenStatusCard
                key={tokenId}
                data={{
                  label: `Vehicle JWT #${tokenId}`,
                  ...v,
                }}
              />
            ))}
            {vehicleEntries.length === 0 && (
              <div className={`rounded-xl border p-4 flex items-center justify-center sq-CARD`}>
                <p className={`text-xs text-muted-foreground`}>No vehicle JWTs acquired yet</p>
              </div>
            )}
          </div>

          {/* Event Log */}
          <div className={`rounded-xl border overflow-hidden border-border`}>
            <div className={`px-4 py-2.5 flex items-center justify-between bg-muted/50`}>
              <div className="flex items-center gap-2">
                <Activity className={`w-3.5 h-3.5 text-muted-foreground`} />
                <span className={`text-xs font-semibold text-foreground`}>
                  Event History ({filteredEvents.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={tokenEventFilter}
                  onChange={(e) => setTokenEventFilter(e.target.value)}
                  className={`rounded-lg border px-2 py-1 text-[11px] border-border`}
                >
                  <option value="">All events</option>
                  <option value="DEVELOPER">Developer JWT</option>
                  <option value="VEHICLE">Vehicle JWT</option>
                  <option value="ERROR">Errors only</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={'bg-muted/30'}>
                    <th className={`text-left px-3 py-2 font-semibold text-muted-foreground`}>Time</th>
                    <th className={`text-left px-3 py-2 font-semibold text-muted-foreground`}>Type</th>
                    <th className={`text-left px-3 py-2 font-semibold text-muted-foreground`}>Action</th>
                    <th className={`text-left px-3 py-2 font-semibold text-muted-foreground`}>Token</th>
                    <th className={`text-left px-3 py-2 font-semibold text-muted-foreground`}>Status</th>
                    <th className={`text-left px-3 py-2 font-semibold text-muted-foreground`}>Duration</th>
                    <th className={`text-left px-3 py-2 font-semibold text-muted-foreground`}>Source</th>
                    <th className={`text-left px-3 py-2 font-semibold text-muted-foreground`}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={`px-3 py-6 text-center text-muted-foreground`}>
                        No token events recorded yet. Events appear after the first JWT fetch attempt.
                      </td>
                    </tr>
                  ) : (
                    visibleEvents.map((evt: any, i: number) => (
                      <tr
                        key={i}
                        className={`border-t border-border hover:bg-muted/50`}
                      >
                        <td className={`px-3 py-1.5 tabular-nums whitespace-nowrap text-muted-foreground`}>
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            evt.type === 'DEVELOPER_JWT'
                              ? ('sq-tone-ai')
                              : ('sq-chip-info')
                          }`}>
                            {evt.type === 'DEVELOPER_JWT' ? 'DEV' : 'VEH'}
                          </span>
                        </td>
                        <td className={`px-3 py-1.5 font-medium text-foreground`}>{evt.action}</td>
                        <td className={`px-3 py-1.5 text-muted-foreground`}>
                          {evt.tokenId != null ? `#${evt.tokenId}` : '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          {evt.success ? (
                            <StatusChip tone="success" className="!text-[10px]">
                              <CheckCircle className="h-3 w-3" /> OK
                            </StatusChip>
                          ) : (
                            <StatusChip tone="critical" className="!text-[10px]">
                              <XCircle className="h-3 w-3" /> FAIL
                            </StatusChip>
                          )}
                        </td>
                        <td className={`px-3 py-1.5 tabular-nums text-muted-foreground`}>
                          {evt.durationMs != null ? `${evt.durationMs} ms` : '—'}
                        </td>
                        <td className={`px-3 py-1.5 text-muted-foreground`}>
                          {evt.source ?? '—'}
                        </td>
                        <td className={`px-3 py-1.5 max-w-[220px] text-muted-foreground`}>
                          {evt.errorMessage ? (
                            <span className="block truncate text-[color:var(--status-critical)]" title={evt.errorMessage}>
                              {evt.httpStatus ? `HTTP ${evt.httpStatus}: ` : ''}{evt.errorMessage}
                            </span>
                          ) : evt.ttlSeconds != null ? (
                            <span>TTL {formatTtl(evt.ttlSeconds)}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filteredEvents.length > 15 && (
              <div className={`px-4 py-2 border-t text-center border-border`}>
                <button
                  onClick={() => setTokenEventExpanded(!tokenEventExpanded)}
                  className={`text-xs font-medium flex items-center gap-1 mx-auto sq-tone-info`}
                >
                  {tokenEventExpanded ? (
                    <>Show less <ChevronUp className="w-3 h-3" /></>
                  ) : (
                    <>Show all {filteredEvents.length} events <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* DIMO Endpoints & Config */}
          <div className={`rounded-xl border overflow-hidden border-border`}>
            <button
              onClick={() => setTokenConfigExpanded(!tokenConfigExpanded)}
              className={`w-full px-4 py-2.5 flex items-center justify-between hover:bg-muted transition-colors`}
            >
              <div className="flex items-center gap-2">
                <Settings2 className={`w-3.5 h-3.5 text-muted-foreground`} />
                <span className={`text-xs font-semibold text-foreground`}>DIMO Endpoints & Configuration</span>
              </div>
              {tokenConfigExpanded ? (
                <ChevronUp className={`w-3.5 h-3.5 text-muted-foreground`} />
              ) : (
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground`} />
              )}
            </button>
            {tokenConfigExpanded && tokenHealth && (
              <div className="p-4 space-y-4">
                {/* Endpoints */}
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-bold mb-2 text-muted-foreground`}>API Endpoints</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: 'Auth URL', value: tokenHealth.dimoEndpoints?.authUrl, icon: Shield },
                      { label: 'Token Exchange', value: tokenHealth.dimoEndpoints?.tokenExchangeUrl, icon: Key },
                      { label: 'Telemetry API', value: tokenHealth.dimoEndpoints?.telemetryApiUrl, icon: Globe },
                      { label: 'Identity API', value: tokenHealth.dimoEndpoints?.identityApiUrl, icon: Link2 },
                    ].map((ep) => (
                      <div
                        key={ep.label}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-muted/50`}
                      >
                        <ep.icon className={`w-3.5 h-3.5 shrink-0 text-muted-foreground`} />
                        <div className="min-w-0">
                          <p className={`text-[10px] font-medium text-muted-foreground`}>{ep.label}</p>
                          <p className={`truncate font-mono text-foreground`}>{ep.value ?? '—'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Config */}
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-bold mb-2 text-muted-foreground`}>Authentication Config</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { label: 'Client ID', value: tokenHealth.config?.clientId, icon: Hash },
                      { label: 'Signer Wallet', value: tokenHealth.config?.signerWallet ? `${tokenHealth.config.signerWallet.slice(0, 8)}…${tokenHealth.config.signerWallet.slice(-6)}` : '—', icon: Globe },
                      { label: 'NFT Contract', value: tokenHealth.config?.nftContractAddress ? `${tokenHealth.config.nftContractAddress.slice(0, 8)}…${tokenHealth.config.nftContractAddress.slice(-6)}` : '—', icon: Link2 },
                      { label: 'JWT TTL', value: tokenHealth.config?.vehicleJwtTtlConfigured ? `${tokenHealth.config.vehicleJwtTtlConfigured}s` : '—', icon: Timer },
                      { label: 'Refresh margin', value: tokenHealth.config?.vehicleJwtRefreshMargin ? `${tokenHealth.config.vehicleJwtRefreshMargin}s` : '—', icon: Clock },
                      { label: 'Timeout', value: tokenHealth.config?.requestTimeoutMs ? `${tokenHealth.config.requestTimeoutMs} ms` : '—', icon: Timer },
                    ].map((c) => (
                      <div
                        key={c.label}
                        className={`px-3 py-2 rounded-lg text-xs bg-muted/50`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <c.icon className={`w-3 h-3 text-muted-foreground`} />
                          <span className={`text-[10px] font-medium text-muted-foreground`}>{c.label}</span>
                        </div>
                        <p className={`font-mono truncate text-foreground`}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </DataCard>
  );
}

// ─── Main Monitoring View ──────────────────────────────────────────

export function SystemMonitoringView() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [workers, setWorkers] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [pollLogs, setPollLogs] = useState<{ data: any[]; meta: any }>({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } });
  const [pollLogsLoading, setPollLogsLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [detailLog, setDetailLog] = useState<any | null>(null);
  const [detailWorker, setDetailWorker] = useState<any | null>(null);
  const [filterJobType, setFilterJobType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [pollPage, setPollPage] = useState(1);
  const [tokenHealth, setTokenHealth] = useState<any>(null);
  const [tokenHealthLoading, setTokenHealthLoading] = useState(false);
  const [tokenEventFilter, setTokenEventFilter] = useState<string>('');
  const [tokenEventExpanded, setTokenEventExpanded] = useState(false);
  const [tokenConfigExpanded, setTokenConfigExpanded] = useState(false);

  const fromIso = new Date(dateFrom).toISOString();
  const toIso = new Date(dateTo).toISOString();

  const loadSummary = useCallback(async () => {
    try {
      const data = await api.admin.monitoring.summary({ from: fromIso, to: toIso });
      setSummary(data);
    } catch {
      setSummary(null);
    }
  }, [fromIso, toIso]);

  const loadWorkers = useCallback(async () => {
    try {
      const data = await api.admin.monitoring.workers({ from: fromIso, to: toIso });
      setWorkers(Array.isArray(data) ? data : []);
    } catch {
      setWorkers([]);
    }
  }, [fromIso, toIso]);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await api.admin.monitoring.alerts({ from: fromIso, to: toIso });
      setAlerts(Array.isArray(data) ? data : []);
    } catch {
      setAlerts([]);
    }
  }, [fromIso, toIso]);

  const loadPollLogs = useCallback(async () => {
    setPollLogsLoading(true);
    try {
      const res = await api.admin.monitoring.pollLogs({
        page: pollPage,
        limit: 50,
        from: fromIso,
        to: toIso,
        ...(filterJobType && { jobType: filterJobType }),
        ...(filterStatus && { status: filterStatus }),
      });
      setPollLogs(res ?? { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } });
    } catch {
      setPollLogs({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } });
    }
    setPollLogsLoading(false);
  }, [fromIso, toIso, pollPage, filterJobType, filterStatus]);

  const loadTokenHealth = useCallback(async () => {
    setTokenHealthLoading(true);
    try {
      const data = await api.admin.monitoring.tokenHealth();
      setTokenHealth(data);
    } catch {
      setTokenHealth(null);
    }
    setTokenHealthLoading(false);
  }, []);

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([loadSummary(), loadWorkers(), loadAlerts(), loadTokenHealth()]).finally(() => setLoading(false));
  }, [loadSummary, loadWorkers, loadAlerts, loadTokenHealth]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadPollLogs();
  }, [loadPollLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(loadAll, 60000);
    return () => clearInterval(t);
  }, [autoRefresh, loadAll]);

  const health = summary?.systemHealth ?? 'healthy';
  const healthTone = monitoringSystemHealthTone(health);

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="System Monitoring"
        eyebrow="Master Admin"
        description="Visibility and control over polling, workers, and request health"
        icon={<Activity className="w-4 h-4" />}
        status={<StatusChip tone={healthTone}>{health}</StatusChip>}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-2xl border px-4 py-2.5 text-sm font-bold border-border" />
              <span className="text-muted-foreground">–</span>
              <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-2xl border px-4 py-2.5 text-sm font-bold border-border" />
            </div>
            <label className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded border-border w-4 h-4" />
              Auto-refresh 1m
            </label>
            <button
              onClick={() => { loadAll(); loadPollLogs(); }}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-sm sq-cta disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      {loading && !summary ? (
        <div className={`${CARD} p-12 flex items-center justify-center`}>
          <Loader2 className={`w-8 h-8 animate-spin text-[color:var(--status-info)]`} />
        </div>
      ) : (
        <>
          <DataCard bodyClassName="p-5">
            <div className="flex flex-wrap items-center gap-4">
              <StatusChip tone={healthTone} dot className="px-5 py-2.5 text-sm font-bold capitalize">
                System: {health}
              </StatusChip>
              <span className="text-sm font-medium text-muted-foreground">
                Providers · Polling · Workers · Tokens
              </span>
            </div>
          </DataCard>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {[
              { label: 'Total requests', value: summary?.totalRequests ?? 0, icon: Activity, status: 'neutral' as const },
              { label: 'Successful', value: summary?.successfulRequests ?? 0, icon: CheckCircle, status: 'success' as const },
              { label: 'Failed', value: summary?.failedRequests ?? 0, icon: XCircle, status: 'critical' as const },
              { label: 'Error rate', value: `${summary?.errorRatePercent ?? 0}%`, icon: BarChart3, status: (summary?.errorRatePercent ?? 0) > 10 ? 'critical' as const : 'neutral' as const },
              { label: 'Active workers', value: summary?.activeWorkers ?? 0, icon: Server, status: 'info' as const },
              { label: 'Unhealthy', value: summary?.unhealthyWorkers ?? 0, icon: AlertTriangle, status: (summary?.unhealthyWorkers ?? 0) > 0 ? 'critical' as const : 'success' as const },
              { label: 'Polling jobs', value: summary?.pollingJobsRunning ?? 0, icon: Zap, status: 'info' as const },
              { label: 'Delayed/Stuck', value: summary?.delayedOrStuckJobs ?? 0, icon: Clock, status: (summary?.delayedOrStuckJobs ?? 0) > 5 ? 'warning' as const : 'neutral' as const },
              { label: 'Vehicles polled', value: summary?.vehiclesPolledRecently ?? 0, icon: Car, status: 'neutral' as const },
              { label: 'Avg response', value: summary?.avgResponseTimeMs != null ? `${summary.avgResponseTimeMs} ms` : '—', icon: Gauge, status: 'neutral' as const },
              { label: 'Retries', value: summary?.retryCount ?? 0, icon: RefreshCw, status: 'watch' as const },
              { label: 'Stale vehicles', value: summary?.staleVehicles ?? 0, icon: AlertCircle, status: (summary?.staleVehicles ?? 0) > 0 ? 'warning' as const : 'success' as const },
            ].map(({ label, value, icon: Icon, status }) => (
              <MetricCard key={label} label={label} value={value} status={status} icon={<Icon className="h-4 w-4" />} />
            ))}
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <DataCard title="Alerts & anomalies" flush bodyClassName="divide-y divide-border">
              {alerts.slice(0, 10).map((a, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/50">
                  <StatusChip
                    tone={a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info'}
                    className="shrink-0 !px-1.5 !py-1"
                  >
                    {a.severity === 'critical' ? <XCircle className="h-3.5 w-3.5" /> : a.severity === 'warning' ? <AlertTriangle className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
                  </StatusChip>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium text-foreground`}>{a.title}</p>
                      <p className={`text-xs mt-0.5 text-muted-foreground`}>{a.summary}</p>
                      {a.affectedComponent && (
                        <p className={`text-[10px] mt-1 text-muted-foreground`}>Affected: {a.affectedComponent}</p>
                      )}
                    </div>
                    <span className={`text-[10px] shrink-0 text-muted-foreground`}>
                      {a.lastSeen ? new Date(a.lastSeen).toLocaleString() : ''}
                    </span>
                </div>
              ))}
            </DataCard>
          )}

          {/* DIMO signal polling (by job type) */}
          {summary?.workers?.length > 0 && (
            <div className={CARD}>
              <div className={`px-5 py-3 border-b border-border`}>
                <h2 className={`text-sm font-semibold text-foreground`}>DIMO signal polling</h2>
                <p className={`text-xs mt-0.5 text-muted-foreground`}>Per-signal job type: success rate and volume</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
                {summary.workers.filter((w: any) => w.total > 0).map((w: any) => {
                  const rate = w.total > 0 ? Math.round((w.success / w.total) * 100) : 0;
                  return (
                    <div
                      key={w.name}
                      className={`rounded-xl border p-4 border-border`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{w.name}</span>
                        <StatusChip tone={workerMonitoringTone(w.status)} className="!text-xs">
                          {w.status}
                        </StatusChip>
                      </div>
                      <div className={`mt-2 text-xs text-muted-foreground`}>
                        {w.total} runs · {rate}% success
                      </div>
                    </div>
                  );
                })}
                {summary.workers.filter((w: any) => w.total > 0).length === 0 && (
                  <p className={`col-span-full text-sm text-muted-foreground`}>No polling activity in the selected range.</p>
                )}
              </div>
            </div>
          )}

          {/* Workers */}
          <div className={CARD}>
            <div className={`px-5 py-3 border-b border-border`}>
              <h2 className={`text-sm font-semibold text-foreground`}>Workers</h2>
              <p className={`text-xs mt-0.5 text-muted-foreground`}>Background job processors and polling pipelines</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={'bg-muted/50'}>
                    <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Worker</th>
                    <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Status</th>
                    <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Jobs</th>
                    <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Failed</th>
                    <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Failure %</th>
                    <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Last success</th>
                    <th className={`text-left px-5 py-3 font-semibold text-foreground`}></th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => (
                      <tr
                        key={w.queueKey}
                        className="border-t border-border hover:bg-muted/50"
                      >
                        <td className="px-5 py-3">
                          <p className="font-medium text-foreground">{w.name}</p>
                          <p className="text-[11px] text-muted-foreground">{w.description}</p>
                        </td>
                        <td className="px-5 py-3">
                          <StatusChip tone={workerMonitoringTone(w.status)} className="!text-xs">
                            {w.status}
                          </StatusChip>
                        </td>
                        <td className="px-5 py-3 text-foreground">{w.total}</td>
                        <td className="px-5 py-3 text-foreground">{w.failed}</td>
                        <td className={`px-5 py-3 ${w.failureRatio > 20 ? 'text-[color:var(--status-critical)]' : 'text-foreground'}`}>{w.failureRatio}%</td>
                        <td className={`px-5 py-3 text-xs text-muted-foreground`}>
                          {w.lastSuccessAt ? new Date(w.lastSuccessAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => setDetailWorker(w)}
                            className={`p-1 rounded-lg hover:bg-muted text-muted-foreground`}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Token & Auth Health – full diagnostic panel */}
          <TokenAuthHealthPanel
            tokenHealth={tokenHealth}
            tokenHealthLoading={tokenHealthLoading}
            onRefresh={loadTokenHealth}
            tokenEventFilter={tokenEventFilter}
            setTokenEventFilter={setTokenEventFilter}
            tokenEventExpanded={tokenEventExpanded}
            setTokenEventExpanded={setTokenEventExpanded}
            tokenConfigExpanded={tokenConfigExpanded}
            setTokenConfigExpanded={setTokenConfigExpanded}
          />

          {/* API requests (poll logs) */}
          <div className={CARD}>
            <div className={`px-5 py-3 border-b border-border`}>
              <h2 className={`text-sm font-semibold text-foreground`}>API requests (poll logs)</h2>
              <p className={`text-xs mt-0.5 text-muted-foreground`}>DIMO and internal polling activity</p>
            </div>
            <div className={`p-4 flex flex-wrap gap-2 border-b border-border`}>
              <select
                value={filterJobType}
                onChange={(e) => { setFilterJobType(e.target.value); setPollPage(1); }}
                className={`rounded-lg border px-3 py-1.5 text-sm border-border`}
              >
                <option value="">All job types</option>
                <option value="SNAPSHOT">SNAPSHOT</option>
                <option value="LIVE_MAP">LIVE_MAP</option>
                <option value="ANALYTICS">ANALYTICS</option>
                <option value="VEHICLE_SYNC">VEHICLE_SYNC</option>
                <option value="DTC_POLL">DTC_POLL</option>
                <option value="DRIVING_EVENTS">DRIVING_EVENTS</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPollPage(1); }}
                className={`rounded-lg border px-3 py-1.5 text-sm border-border`}
              >
                <option value="">All statuses</option>
                <option value="SUCCESS">SUCCESS</option>
                <option value="FAILURE">FAILURE</option>
                <option value="TIMEOUT">TIMEOUT</option>
                <option value="SKIPPED">SKIPPED</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              {pollLogsLoading ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className={`w-6 h-6 animate-spin text-[color:var(--status-info)]`} />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className={'bg-muted/50'}>
                      <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Time</th>
                      <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Job type</th>
                      <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Vehicle</th>
                      <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Status</th>
                      <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Duration</th>
                      <th className={`text-left px-5 py-3 font-semibold text-foreground`}>Retries</th>
                      <th className={`text-left px-5 py-3 font-semibold text-foreground`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pollLogs.data.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={`px-5 py-8 text-center text-muted-foreground`}>
                          No poll logs in the selected range.
                        </td>
                      </tr>
                    ) : (
                      pollLogs.data.map((log) => (
                        <tr
                          key={log.id}
                          className={`border-t border-border hover:bg-muted/50`}
                        >
                          <td className={`px-5 py-2.5 text-xs text-muted-foreground`}>
                            {new Date(log.startedAt).toLocaleString()}
                          </td>
                          <td className={`px-5 py-2.5 font-medium text-foreground`}>{log.jobType}</td>
                          <td className={`px-5 py-2.5 text-foreground`}>
                            {log.vehicleName || log.vin || log.vehicleId || '—'}
                          </td>
                          <td className="px-5 py-2.5">
                            <StatusChip tone={pollLogStatusTone(log.status)} className="!text-xs">
                              {log.status}
                            </StatusChip>
                          </td>
                          <td className={`px-5 py-2.5 text-foreground`}>
                            {log.durationMs != null ? `${log.durationMs} ms` : '—'}
                          </td>
                          <td className={`px-5 py-2.5 text-foreground`}>{log.retryCount ?? 0}</td>
                          <td className="px-5 py-2.5">
                            <button
                              onClick={() => setDetailLog(log)}
                              className={`p-1 rounded hover:bg-muted text-muted-foreground`}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
            {pollLogs.meta && pollLogs.meta.totalPages > 1 && (
              <div className={`px-5 py-3 border-t flex items-center justify-between border-border`}>
                <span className={`text-xs text-muted-foreground`}>
                  Page {pollLogs.meta.page} of {pollLogs.meta.totalPages} · {pollLogs.meta.total} total
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={pollLogs.meta.page <= 1}
                    onClick={() => setPollPage((p) => p - 1)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium disabled:opacity-50 bg-muted/50`}
                  >
                    Previous
                  </button>
                  <button
                    disabled={pollLogs.meta.page >= pollLogs.meta.totalPages}
                    onClick={() => setPollPage((p) => p + 1)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium disabled:opacity-50 bg-muted/50`}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Detail drawer – log */}
      {detailLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDetailLog(null)}>
          <div
            className={`${CARD} max-w-lg w-full max-h-[80vh] overflow-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between px-5 py-3 border-b border-border`}>
              <h3 className={`text-sm font-semibold text-foreground`}>Request detail</h3>
              <button onClick={() => setDetailLog(null)} className={`p-1 rounded-lg hover:bg-muted`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div><span className={'text-muted-foreground'}>Time</span><p className={'text-foreground'}>{new Date(detailLog.startedAt).toLocaleString()}</p></div>
              <div><span className={'text-muted-foreground'}>Job type</span><p className={'text-foreground'}>{detailLog.jobType}</p></div>
              <div><span className={'text-muted-foreground'}>Status</span><p className={'text-foreground'}>{detailLog.status}</p></div>
              <div><span className={'text-muted-foreground'}>Vehicle</span><p className={'text-foreground'}>{detailLog.vehicleName || detailLog.vin || detailLog.vehicleId || '—'}</p></div>
              {detailLog.durationMs != null && <div><span className={'text-muted-foreground'}>Duration</span><p className={'text-foreground'}>{detailLog.durationMs} ms</p></div>}
              {detailLog.retryCount != null && <div><span className={'text-muted-foreground'}>Retries</span><p className={'text-foreground'}>{detailLog.retryCount}</p></div>}
              {detailLog.errorMessage && <div><span className="text-muted-foreground">Error</span><p className="text-[color:var(--status-critical)]">{detailLog.errorMessage}</p></div>}
            </div>
          </div>
        </div>
      )}

      {/* Detail drawer – worker */}
      {detailWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDetailWorker(null)}>
          <div
            className={`${CARD} max-w-lg w-full max-h-[80vh] overflow-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between px-5 py-3 border-b border-border`}>
              <h3 className={`text-sm font-semibold text-foreground`}>{detailWorker.name}</h3>
              <button onClick={() => setDetailWorker(null)} className={`p-1 rounded-lg hover:bg-muted`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p className={'text-muted-foreground'}>{detailWorker.description}</p>
              <div><span className={'text-muted-foreground'}>Status</span><p className={'text-foreground'}>{detailWorker.status}</p></div>
              <div><span className={'text-muted-foreground'}>Jobs (period)</span><p className={'text-foreground'}>{detailWorker.total}</p></div>
              <div><span className={'text-muted-foreground'}>Failed</span><p className={'text-foreground'}>{detailWorker.failed}</p></div>
              <div><span className={'text-muted-foreground'}>Failure ratio</span><p className={'text-foreground'}>{detailWorker.failureRatio}%</p></div>
              {detailWorker.lastSuccessAt && <div><span className={'text-muted-foreground'}>Last success</span><p className={'text-foreground'}>{new Date(detailWorker.lastSuccessAt).toLocaleString()}</p></div>}
              {detailWorker.lastFailedAt && <div><span className={'text-muted-foreground'}>Last failure</span><p className={'text-[color:var(--status-critical)]'}>{new Date(detailWorker.lastFailedAt).toLocaleString()}</p></div>}
              {detailWorker.avgDurationMs > 0 && <div><span className={'text-muted-foreground'}>Avg duration</span><p className={'text-foreground'}>{detailWorker.avgDurationMs} ms</p></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
