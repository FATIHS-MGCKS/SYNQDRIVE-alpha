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
import { api } from '../../lib/api';

interface SystemMonitoringViewProps {
  isDarkMode: boolean;
}

const CARD_CLASS = (isDark: boolean) =>
  `rounded-2xl shadow-sm border overflow-hidden ${
    isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'
  }`;

const HEALTH_COLORS = {
  healthy: { bg: 'bg-emerald-500/15', text: 'text-emerald-600', border: 'border-emerald-500/30' },
  warning: { bg: 'bg-amber-500/15', text: 'text-amber-600', border: 'border-amber-500/30' },
  critical: { bg: 'bg-red-500/15', text: 'text-red-600', border: 'border-red-500/30' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  healthy: { bg: 'bg-emerald-500/15', text: 'text-emerald-600' },
  idle: { bg: 'bg-gray-500/10', text: 'text-gray-500' },
  warning: { bg: 'bg-amber-500/15', text: 'text-amber-600' },
  degraded: { bg: 'bg-red-500/15', text: 'text-red-600' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-600' },
  busy: { bg: 'bg-blue-500/15', text: 'text-blue-600' },
  offline: { bg: 'bg-gray-500/20', text: 'text-gray-500' },
};

// ─── Token & Auth Health Sub-Panel ─────────────────────────────────

const TOKEN_STATUS_STYLE: Record<string, { icon: typeof ShieldCheck; color: string; bgColor: string }> = {
  VALID: { icon: ShieldCheck, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  EXPIRED: { icon: ShieldAlert, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  ERROR: { icon: ShieldX, color: 'text-red-500', bgColor: 'bg-red-500/10' },
  NEVER_ACQUIRED: { icon: ShieldQuestion, color: 'text-gray-400', bgColor: 'bg-gray-500/10' },
};

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

function TokenStatusCard({ data, isDarkMode }: { data: TokenCardData; isDarkMode: boolean }) {
  const s = TOKEN_STATUS_STYLE[data.status] ?? TOKEN_STATUS_STYLE.NEVER_ACQUIRED;
  const StatusIcon = s.icon;
  const successRate = data.totalFetches > 0 ? Math.round((data.totalSuccesses / data.totalFetches) * 100) : null;

  return (
    <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700/60' : 'bg-gray-50/80 border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.bgColor}`}>
            <StatusIcon className={`w-4 h-4 ${s.color}`} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{data.label}</p>
            <p className={`text-[11px] font-medium ${s.color}`}>{data.status}</p>
          </div>
        </div>
        {data.ttlRemainingSeconds != null && data.ttlRemainingSeconds > 0 && (
          <div className={`text-right`}>
            <p className={`text-[10px] uppercase tracking-wider font-bold ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>TTL</p>
            <p className={`text-sm font-bold tabular-nums ${data.ttlRemainingSeconds < 300 ? 'text-amber-500' : isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              {formatTtl(data.ttlRemainingSeconds)}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Last acquired</div>
        <div className={`text-right font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{timeAgo(data.lastAcquiredAt)}</div>

        <div className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Expires at</div>
        <div className={`text-right font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {data.expiresAt ? new Date(data.expiresAt).toLocaleTimeString() : '—'}
        </div>

        <div className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Fetches</div>
        <div className={`text-right font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {data.totalFetches} <span className="text-emerald-500">({data.totalSuccesses})</span> / <span className="text-red-500">{data.totalFailures}</span>
        </div>

        <div className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Success rate</div>
        <div className={`text-right font-medium ${successRate != null && successRate < 80 ? 'text-red-500' : isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {successRate != null ? `${successRate}%` : '—'}
        </div>

        <div className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Avg fetch time</div>
        <div className={`text-right font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {data.avgFetchDurationMs != null ? `${data.avgFetchDurationMs} ms` : '—'}
        </div>

        {data.consecutiveFailures > 0 && (
          <>
            <div className="text-red-500 font-medium">Consec. failures</div>
            <div className="text-right font-bold text-red-500">{data.consecutiveFailures}</div>
          </>
        )}
      </div>

      {data.lastError && (
        <div className={`mt-3 p-2.5 rounded-lg text-xs ${isDarkMode ? 'bg-red-500/5 border border-red-500/20' : 'bg-red-50 border border-red-200/50'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
            <span className="text-red-500 font-semibold">Last error {data.lastErrorHttpStatus ? `(HTTP ${data.lastErrorHttpStatus})` : ''}</span>
            <span className={`ml-auto ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{timeAgo(data.lastErrorAt)}</span>
          </div>
          <p className={`break-words ${isDarkMode ? 'text-red-400/80' : 'text-red-600/80'}`}>{data.lastError}</p>
        </div>
      )}
    </div>
  );
}

function TokenAuthHealthPanel({
  isDarkMode,
  tokenHealth,
  tokenHealthLoading,
  onRefresh,
  tokenEventFilter,
  setTokenEventFilter,
  tokenEventExpanded,
  setTokenEventExpanded,
  tokenConfigExpanded,
  setTokenConfigExpanded,
}: {
  isDarkMode: boolean;
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

  const overallStyle = HEALTH_COLORS[overallHealth as keyof typeof HEALTH_COLORS] ?? HEALTH_COLORS.healthy;

  return (
    <div className={CARD_CLASS(isDarkMode)}>
      {/* Header */}
      <div className={`px-5 py-3 border-b flex items-center justify-between ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
            <Key className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <div>
            <h2 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Token & Auth Health</h2>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Developer JWT + Vehicle JWT lifecycle, diagnostics & event history</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tokenHealth && (
            <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${overallStyle.bg} ${overallStyle.text} ${overallStyle.border} border`}>
              {overallHealth === 'healthy' ? 'All tokens healthy' : overallHealth === 'critical' ? 'Token errors' : 'Token warnings'}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={tokenHealthLoading}
            className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${tokenHealthLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {tokenHealthLoading && !tokenHealth ? (
        <div className="p-8 flex justify-center">
          <Loader2 className={`w-6 h-6 animate-spin ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
        </div>
      ) : !tokenHealth ? (
        <div className={`p-6 text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          <ShieldQuestion className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Token health data unavailable. The backend may not be running.</p>
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {/* Developer + Vehicle JWT status cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <TokenStatusCard
              isDarkMode={isDarkMode}
              data={{
                label: 'Developer JWT',
                ...tokenHealth.developer,
              }}
            />
            {vehicleEntries.map(([tokenId, v]) => (
              <TokenStatusCard
                key={tokenId}
                isDarkMode={isDarkMode}
                data={{
                  label: `Vehicle JWT #${tokenId}`,
                  ...v,
                }}
              />
            ))}
            {vehicleEntries.length === 0 && (
              <div className={`rounded-xl border p-4 flex items-center justify-center ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700/60' : 'bg-gray-50/80 border-gray-200'}`}>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No vehicle JWTs acquired yet</p>
              </div>
            )}
          </div>

          {/* Event Log */}
          <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'border-neutral-700/60' : 'border-gray-200'}`}>
            <div className={`px-4 py-2.5 flex items-center justify-between ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2">
                <Activity className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Event History ({filteredEvents.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={tokenEventFilter}
                  onChange={(e) => setTokenEventFilter(e.target.value)}
                  className={`rounded-lg border px-2 py-1 text-[11px] ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-300' : 'bg-white border-gray-200 text-gray-700'}`}
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
                  <tr className={isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'}>
                    <th className={`text-left px-3 py-2 font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Time</th>
                    <th className={`text-left px-3 py-2 font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Type</th>
                    <th className={`text-left px-3 py-2 font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Action</th>
                    <th className={`text-left px-3 py-2 font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Token</th>
                    <th className={`text-left px-3 py-2 font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Status</th>
                    <th className={`text-left px-3 py-2 font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Duration</th>
                    <th className={`text-left px-3 py-2 font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Source</th>
                    <th className={`text-left px-3 py-2 font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={`px-3 py-6 text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        No token events recorded yet. Events appear after the first JWT fetch attempt.
                      </td>
                    </tr>
                  ) : (
                    visibleEvents.map((evt: any, i: number) => (
                      <tr
                        key={i}
                        className={`border-t ${isDarkMode ? 'border-neutral-800/50 hover:bg-neutral-800/20' : 'border-gray-100 hover:bg-gray-50/50'}`}
                      >
                        <td className={`px-3 py-1.5 tabular-nums whitespace-nowrap ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            evt.type === 'DEVELOPER_JWT'
                              ? (isDarkMode ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600')
                              : (isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600')
                          }`}>
                            {evt.type === 'DEVELOPER_JWT' ? 'DEV' : 'VEH'}
                          </span>
                        </td>
                        <td className={`px-3 py-1.5 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{evt.action}</td>
                        <td className={`px-3 py-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {evt.tokenId != null ? `#${evt.tokenId}` : '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          {evt.success ? (
                            <span className="inline-flex items-center gap-1 text-emerald-500">
                              <CheckCircle className="w-3 h-3" /> OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-500">
                              <XCircle className="w-3 h-3" /> FAIL
                            </span>
                          )}
                        </td>
                        <td className={`px-3 py-1.5 tabular-nums ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {evt.durationMs != null ? `${evt.durationMs} ms` : '—'}
                        </td>
                        <td className={`px-3 py-1.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {evt.source ?? '—'}
                        </td>
                        <td className={`px-3 py-1.5 max-w-[220px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {evt.errorMessage ? (
                            <span className="text-red-500 truncate block" title={evt.errorMessage}>
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
              <div className={`px-4 py-2 border-t text-center ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
                <button
                  onClick={() => setTokenEventExpanded(!tokenEventExpanded)}
                  className={`text-xs font-medium flex items-center gap-1 mx-auto ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'}`}
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
          <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'border-neutral-700/60' : 'border-gray-200'}`}>
            <button
              onClick={() => setTokenConfigExpanded(!tokenConfigExpanded)}
              className={`w-full px-4 py-2.5 flex items-center justify-between ${isDarkMode ? 'bg-neutral-800 hover:bg-neutral-800/70' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
            >
              <div className="flex items-center gap-2">
                <Settings2 className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>DIMO Endpoints & Configuration</span>
              </div>
              {tokenConfigExpanded ? (
                <ChevronUp className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
              ) : (
                <ChevronDown className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
              )}
            </button>
            {tokenConfigExpanded && tokenHealth && (
              <div className="p-4 space-y-4">
                {/* Endpoints */}
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-bold mb-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>API Endpoints</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: 'Auth URL', value: tokenHealth.dimoEndpoints?.authUrl, icon: Shield },
                      { label: 'Token Exchange', value: tokenHealth.dimoEndpoints?.tokenExchangeUrl, icon: Key },
                      { label: 'Telemetry API', value: tokenHealth.dimoEndpoints?.telemetryApiUrl, icon: Globe },
                      { label: 'Identity API', value: tokenHealth.dimoEndpoints?.identityApiUrl, icon: Link2 },
                    ].map((ep) => (
                      <div
                        key={ep.label}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50'}`}
                      >
                        <ep.icon className={`w-3.5 h-3.5 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <div className="min-w-0">
                          <p className={`text-[10px] font-medium ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{ep.label}</p>
                          <p className={`truncate font-mono ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{ep.value ?? '—'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Config */}
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-bold mb-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Authentication Config</p>
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
                        className={`px-3 py-2 rounded-lg text-xs ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <c.icon className={`w-3 h-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <span className={`text-[10px] font-medium ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{c.label}</span>
                        </div>
                        <p className={`font-mono truncate ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Monitoring View ──────────────────────────────────────────

export function SystemMonitoringView({ isDarkMode }: SystemMonitoringViewProps) {
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
  const healthStyle = HEALTH_COLORS[health as keyof typeof HEALTH_COLORS] ?? HEALTH_COLORS.healthy;

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            System Monitoring
          </h1>
          <p className={`text-base mt-2 font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Visibility and control over polling, workers, and request health
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`rounded-2xl border px-4 py-2.5 text-sm font-bold ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200' : 'bg-white border-gray-200 text-gray-900 shadow-sm'}`}
            />
            <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>–</span>
            <input
              type="datetime-local"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`rounded-2xl border px-4 py-2.5 text-sm font-bold ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200' : 'bg-white border-gray-200 text-gray-900 shadow-sm'}`}
            />
          </div>
          <label className={`flex items-center gap-2 text-sm font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded border-gray-300 w-4 h-4" />
            Auto-refresh 1m
          </label>
          <button
            onClick={() => { loadAll(); loadPollLogs(); }}
            disabled={loading}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-sm ${
              isDarkMode ? 'bg-neutral-800 hover:bg-neutral-700 text-gray-200' : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-800'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !summary ? (
        <div className={`${CARD_CLASS(isDarkMode)} p-12 flex items-center justify-center`}>
          <Loader2 className={`w-8 h-8 animate-spin ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
        </div>
      ) : (
        <>
          {/* System health strip */}
          <div className={`${CARD_CLASS(isDarkMode)} p-5`}>
            <div className="flex flex-wrap items-center gap-4">
              <div className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border ${healthStyle.bg} ${healthStyle.border}`}>
                {health === 'healthy' && <CheckCircle className={`w-5 h-5 ${healthStyle.text}`} />}
                {health === 'warning' && <AlertTriangle className={`w-5 h-5 ${healthStyle.text}`} />}
                {health === 'critical' && <XCircle className={`w-5 h-5 ${healthStyle.text}`} />}
                <span className={`text-sm font-bold capitalize ${healthStyle.text}`}>System: {health}</span>
              </div>
              <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Providers · Polling · Workers · Tokens
              </span>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5">
            {[
              { label: 'Total requests', value: summary?.totalRequests ?? 0, icon: Activity },
              { label: 'Successful', value: summary?.successfulRequests ?? 0, icon: CheckCircle, green: true },
              { label: 'Failed', value: summary?.failedRequests ?? 0, icon: XCircle, red: true },
              { label: 'Error rate', value: `${summary?.errorRatePercent ?? 0}%`, icon: BarChart3, red: (summary?.errorRatePercent ?? 0) > 10 },
              { label: 'Active workers', value: summary?.activeWorkers ?? 0, icon: Server },
              { label: 'Unhealthy', value: summary?.unhealthyWorkers ?? 0, icon: AlertTriangle, red: (summary?.unhealthyWorkers ?? 0) > 0 },
              { label: 'Polling jobs', value: summary?.pollingJobsRunning ?? 0, icon: Zap },
              { label: 'Delayed/Stuck', value: summary?.delayedOrStuckJobs ?? 0, icon: Clock, red: (summary?.delayedOrStuckJobs ?? 0) > 5 },
              { label: 'Vehicles polled', value: summary?.vehiclesPolledRecently ?? 0, icon: Car },
              { label: 'Avg response', value: summary?.avgResponseTimeMs != null ? `${summary.avgResponseTimeMs} ms` : '—', icon: Gauge },
              { label: 'Retries', value: summary?.retryCount ?? 0, icon: RefreshCw },
              { label: 'Stale vehicles', value: summary?.staleVehicles ?? 0, icon: AlertCircle, red: (summary?.staleVehicles ?? 0) > 0 },
            ].map(({ label, value, icon: Icon, green, red }) => (
              <div key={label} className={`${CARD_CLASS(isDarkMode)} p-5 flex flex-col items-center justify-center text-center`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${red ? (isDarkMode ? 'bg-red-500/10' : 'bg-red-50') : green ? (isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50') : (isDarkMode ? 'bg-neutral-800' : 'bg-gray-100')}`}>
                  <Icon className={`w-5 h-5 ${red ? 'text-red-500' : green ? 'text-emerald-500' : isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                </div>
                <span className={`text-2xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{value}</span>
                <div className={`text-xs font-bold mt-1 uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</div>
              </div>
            ))}
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div className={CARD_CLASS(isDarkMode)}>
              <div className={`px-5 py-3 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
                <h2 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Alerts & anomalies</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {alerts.slice(0, 10).map((a, i) => (
                  <div
                    key={i}
                    className={`px-5 py-3 flex items-start gap-3 ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-50'}`}
                  >
                    {a.severity === 'critical' && <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                    {a.severity === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                    {a.severity === 'info' && <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{a.title}</p>
                      <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{a.summary}</p>
                      {a.affectedComponent && (
                        <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Affected: {a.affectedComponent}</p>
                      )}
                    </div>
                    <span className={`text-[10px] shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {a.lastSeen ? new Date(a.lastSeen).toLocaleString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DIMO signal polling (by job type) */}
          {summary?.workers?.length > 0 && (
            <div className={CARD_CLASS(isDarkMode)}>
              <div className={`px-5 py-3 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
                <h2 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>DIMO signal polling</h2>
                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Per-signal job type: success rate and volume</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
                {summary.workers.filter((w: any) => w.total > 0).map((w: any) => {
                  const sc = STATUS_COLORS[w.status] ?? STATUS_COLORS.idle;
                  const rate = w.total > 0 ? Math.round((w.success / w.total) * 100) : 0;
                  return (
                    <div
                      key={w.name}
                      className={`rounded-xl border p-4 ${isDarkMode ? 'bg-neutral-800/30 border-neutral-700' : 'bg-gray-50/80 border-gray-200'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{w.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-lg ${sc.bg} ${sc.text}`}>{w.status}</span>
                      </div>
                      <div className={`mt-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {w.total} runs · {rate}% success
                      </div>
                    </div>
                  );
                })}
                {summary.workers.filter((w: any) => w.total > 0).length === 0 && (
                  <p className={`col-span-full text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No polling activity in the selected range.</p>
                )}
              </div>
            </div>
          )}

          {/* Workers */}
          <div className={CARD_CLASS(isDarkMode)}>
            <div className={`px-5 py-3 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
              <h2 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Workers</h2>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Background job processors and polling pipelines</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}>
                    <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Worker</th>
                    <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Status</th>
                    <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Jobs</th>
                    <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Failed</th>
                    <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Failure %</th>
                    <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Last success</th>
                    <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}></th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => {
                    const sc = STATUS_COLORS[w.status] ?? STATUS_COLORS.idle;
                    return (
                      <tr
                        key={w.queueKey}
                        className={`border-t ${isDarkMode ? 'border-neutral-800 hover:bg-neutral-800/30' : 'border-gray-100 hover:bg-gray-50'}`}
                      >
                        <td className="px-5 py-3">
                          <p className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{w.name}</p>
                          <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{w.description}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium ${sc.bg} ${sc.text}`}>
                            {w.status}
                          </span>
                        </td>
                        <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{w.total}</td>
                        <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{w.failed}</td>
                        <td className={`px-5 py-3 ${w.failureRatio > 20 ? 'text-red-500' : isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{w.failureRatio}%</td>
                        <td className={`px-5 py-3 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {w.lastSuccessAt ? new Date(w.lastSuccessAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => setDetailWorker(w)}
                            className={`p-1 rounded-lg ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Token & Auth Health – full diagnostic panel */}
          <TokenAuthHealthPanel
            isDarkMode={isDarkMode}
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
          <div className={CARD_CLASS(isDarkMode)}>
            <div className={`px-5 py-3 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
              <h2 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>API requests (poll logs)</h2>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>DIMO and internal polling activity</p>
            </div>
            <div className={`p-4 flex flex-wrap gap-2 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
              <select
                value={filterJobType}
                onChange={(e) => { setFilterJobType(e.target.value); setPollPage(1); }}
                className={`rounded-lg border px-3 py-1.5 text-sm ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}
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
                className={`rounded-lg border px-3 py-1.5 text-sm ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}
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
                  <Loader2 className={`w-6 h-6 animate-spin ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className={isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}>
                      <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Time</th>
                      <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Job type</th>
                      <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Vehicle</th>
                      <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Status</th>
                      <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Duration</th>
                      <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Retries</th>
                      <th className={`text-left px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pollLogs.data.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={`px-5 py-8 text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          No poll logs in the selected range.
                        </td>
                      </tr>
                    ) : (
                      pollLogs.data.map((log) => (
                        <tr
                          key={log.id}
                          className={`border-t ${isDarkMode ? 'border-neutral-800 hover:bg-neutral-800/30' : 'border-gray-100 hover:bg-gray-50'}`}
                        >
                          <td className={`px-5 py-2.5 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {new Date(log.startedAt).toLocaleString()}
                          </td>
                          <td className={`px-5 py-2.5 font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{log.jobType}</td>
                          <td className={`px-5 py-2.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {log.vehicleName || log.vin || log.vehicleId || '—'}
                          </td>
                          <td className="px-5 py-2.5">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                log.status === 'SUCCESS'
                                  ? 'bg-emerald-500/15 text-emerald-600'
                                  : log.status === 'FAILURE' || log.status === 'TIMEOUT'
                                    ? 'bg-red-500/15 text-red-600'
                                    : isDarkMode ? 'bg-neutral-700 text-gray-400' : 'bg-gray-200 text-gray-600'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className={`px-5 py-2.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {log.durationMs != null ? `${log.durationMs} ms` : '—'}
                          </td>
                          <td className={`px-5 py-2.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{log.retryCount ?? 0}</td>
                          <td className="px-5 py-2.5">
                            <button
                              onClick={() => setDetailLog(log)}
                              className={`p-1 rounded ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
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
              <div className={`px-5 py-3 border-t flex items-center justify-between ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
                <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Page {pollLogs.meta.page} of {pollLogs.meta.totalPages} · {pollLogs.meta.total} total
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={pollLogs.meta.page <= 1}
                    onClick={() => setPollPage((p) => p - 1)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium disabled:opacity-50 ${isDarkMode ? 'bg-neutral-800 text-gray-200' : 'bg-gray-100 text-gray-800'}`}
                  >
                    Previous
                  </button>
                  <button
                    disabled={pollLogs.meta.page >= pollLogs.meta.totalPages}
                    onClick={() => setPollPage((p) => p + 1)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium disabled:opacity-50 ${isDarkMode ? 'bg-neutral-800 text-gray-200' : 'bg-gray-100 text-gray-800'}`}
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
            className={`${CARD_CLASS(isDarkMode)} max-w-lg w-full max-h-[80vh] overflow-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between px-5 py-3 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
              <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Request detail</h3>
              <button onClick={() => setDetailLog(null)} className={`p-1 rounded-lg ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-gray-200'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Time</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{new Date(detailLog.startedAt).toLocaleString()}</p></div>
              <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Job type</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{detailLog.jobType}</p></div>
              <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Status</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{detailLog.status}</p></div>
              <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Vehicle</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{detailLog.vehicleName || detailLog.vin || detailLog.vehicleId || '—'}</p></div>
              {detailLog.durationMs != null && <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Duration</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{detailLog.durationMs} ms</p></div>}
              {detailLog.retryCount != null && <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Retries</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{detailLog.retryCount}</p></div>}
              {detailLog.errorMessage && <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Error</span><p className={`text-red-600 ${isDarkMode ? 'text-red-400' : ''}`}>{detailLog.errorMessage}</p></div>}
            </div>
          </div>
        </div>
      )}

      {/* Detail drawer – worker */}
      {detailWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDetailWorker(null)}>
          <div
            className={`${CARD_CLASS(isDarkMode)} max-w-lg w-full max-h-[80vh] overflow-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between px-5 py-3 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
              <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{detailWorker.name}</h3>
              <button onClick={() => setDetailWorker(null)} className={`p-1 rounded-lg ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-gray-200'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{detailWorker.description}</p>
              <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Status</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{detailWorker.status}</p></div>
              <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Jobs (period)</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{detailWorker.total}</p></div>
              <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Failed</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{detailWorker.failed}</p></div>
              <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Failure ratio</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{detailWorker.failureRatio}%</p></div>
              {detailWorker.lastSuccessAt && <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Last success</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{new Date(detailWorker.lastSuccessAt).toLocaleString()}</p></div>}
              {detailWorker.lastFailedAt && <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Last failure</span><p className={isDarkMode ? 'text-red-400' : 'text-red-600'}>{new Date(detailWorker.lastFailedAt).toLocaleString()}</p></div>}
              {detailWorker.avgDurationMs > 0 && <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Avg duration</span><p className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{detailWorker.avgDurationMs} ms</p></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
