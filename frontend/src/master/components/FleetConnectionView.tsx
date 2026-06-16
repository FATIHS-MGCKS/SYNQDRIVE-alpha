import { useState, useEffect, useMemo, useCallback } from 'react';
import { PageHeader, DataTable, MetricCard, DataCard, EmptyState, StatusChip, SectionHeader } from '../../components/patterns';
import {
  Radio, Car, Signal, SignalZero, Clock, Wifi, Search, ChevronDown,
  AlertCircle, Globe, Zap, Building2, Activity, CheckCircle2, XCircle,
  Gauge, Eye, MapPin, Fuel, Thermometer, Wrench, ShieldAlert,
  Terminal, Play, Loader2, Code2, Send, X,
} from 'lucide-react';
import { api, type AdminFleetConnectivityResponse, type AdminFleetConnectivityVehicle } from '../../lib/api';
import { formatOdometerKmFloor } from '../../lib/formatVehicleDisplay';

/* ── Design-system token helpers ── */
const CARD = 'sq-card overflow-hidden';
const INPUT =
  'w-full px-4 py-2.5 rounded-xl border border-border bg-muted/50 text-sm text-foreground transition-colors outline-none focus:border-[color:var(--brand)] placeholder:text-muted-foreground';
const LABEL = 'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';
const HEAD = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';
const TAB_BAR = 'sq-tab-bar flex gap-1 p-1 rounded-2xl overflow-x-auto w-fit';
const TAB_ACTIVE = 'sq-tab-active flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap';
const TAB_IDLE = 'sq-tab flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap text-muted-foreground hover:text-foreground';


interface FleetConnectionViewProps {
  }

function StatusDot({ status }: { status: AdminFleetConnectivityVehicle['connectionStatus'];  }) {
  const cfg = {
    online: { color: 'sq-dot-success', pulse: true, label: 'Online', badge: 'sq-chip-success' },
    standby: { color: 'sq-dot-watch', pulse: false, label: 'Standby', badge: 'sq-chip-watch' },
    offline: { color: 'sq-dot-critical', pulse: false, label: 'Offline', badge: 'sq-chip-critical' },
    not_connected: { color: 'sq-dot-nodata', pulse: false, label: 'Not Connected', badge: 'sq-chip-neutral' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

const SIGNAL_ICONS: Record<string, typeof MapPin> = {
  Location: MapPin, Odometer: Gauge, 'Fuel Level': Fuel, 'EV SoC': Zap,
  Speed: Activity, 'Brake Pad': ShieldAlert, 'Engine Oil': Wrench,
  'Coolant Temp': Thermometer, 'Tire Health': Eye, DTC: AlertCircle,
};

const SIGNAL_QUERIES: Record<string, string> = {
  Location: 'signalsLatest(tokenId) { currentLocationLatitude { value, timestamp }, currentLocationLongitude { value, timestamp } }',
  Odometer: 'signalsLatest(tokenId) { powertrainTransmissionTravelledDistance { value, timestamp } }',
  'Fuel Level': 'signalsLatest(tokenId) { fuelSystemRelativeLevel { value, timestamp } }',
  'EV SoC': 'signalsLatest(tokenId) { powertrainTractionBatteryStateOfCharge { value, timestamp } }',
  Speed: 'signalsLatest(tokenId) { speed { value, timestamp } }',
  'Brake Pad': 'signalsLatest(tokenId) { chassisAxleRow1WheelLeftBrakePadWear { value }, chassisAxleRow1WheelRightBrakePadWear { value } }',
  'Engine Oil': 'signalsLatest(tokenId) { OBDEngineOilLife { value, timestamp } }',
  'Coolant Temp': 'signalsLatest(tokenId) { powertrainCombustionEngineECT { value, timestamp } }',
  'Tire Health': 'signalsLatest(tokenId) { chassisAxleRow1WheelLeftTirePressure { value }, chassisAxleRow1WheelRightTirePressure { value }, chassisAxleRow2WheelLeftTirePressure { value }, chassisAxleRow2WheelRightTirePressure { value } }',
  DTC: 'signalsLatest(tokenId) { obdDTCList { value, timestamp } }',
};

function QueryConsole({ vehicle, onClose }: { vehicle: AdminFleetConnectivityVehicle; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ q: string; r: string; t: number }[]>([]);

  const run = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      if (q.trim().toLowerCase() === 'availablesignals') {
        const res = JSON.stringify(vehicle.availableSignals, null, 2);
        setResult(res);
        setHistory(prev => [{ q, r: res, t: Date.now() }, ...prev.slice(0, 19)]);
      } else {
        const tokenId = vehicle.dimoTokenId;
        if (!tokenId) {
          setResult('Error: No DIMO tokenId available for this vehicle');
          return;
        }
        const res = await api.dimo.queryGraphQL(tokenId, q);
        const formatted = JSON.stringify(res, null, 2);
        setResult(formatted);
        setHistory(prev => [{ q, r: formatted, t: Date.now() }, ...prev.slice(0, 19)]);
      }
    } catch (err: any) {
      const errMsg = `Error: ${err?.message || 'Query failed'}`;
      setResult(errMsg);
      setHistory(prev => [{ q, r: errMsg, t: Date.now() }, ...prev.slice(0, 19)]);
    } finally {
      setLoading(false);
    }
  }, [vehicle]);

  const bg = 'bg-muted/30';
  const cardBg = 'sq-CARD';
  const textP = 'text-foreground';
  const textM = 'text-muted-foreground';

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50`} onClick={onClose}>
      <div className={`w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border shadow-2xl ${cardBg}`} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-3 border-b border-border`}>
          <div className="flex items-center gap-2">
            <Terminal className={`w-4 h-4 text-[color:var(--brand)]`} />
            <span className={`text-sm font-bold ${textP}`}>Query Console</span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground`}>
              {vehicle.make} {vehicle.model} · Token #{vehicle.dimoTokenId ?? '—'}
            </span>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg hover:bg-neutral-700 ${textM}`}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex gap-2">
            <button onClick={() => run('availableSignals')} className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors border-border text-[color:var(--brand)] hover:bg-muted/50`}>
              <span className="flex items-center gap-1"><Play className="w-3 h-3" /> List Available Signals</span>
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run(query)}
              placeholder="Enter DIMO GraphQL query or 'availableSignals'..."
              className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono border outline-none bg-muted/50 border-border text-foreground placeholder:text-muted-foreground`}
            />
            <button onClick={() => run(query)} disabled={loading || !query.trim()} className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors text-[color:var(--status-info)] disabled:opacity-50`}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Run
            </button>
          </div>
          {result && (
            <pre className={`p-3 rounded-xl text-[11px] font-mono overflow-x-auto max-h-60 text-[color:var(--status-positive)]`}>
              {result}
            </pre>
          )}
          {history.length > 0 && (
            <div>
              <p className={`text-[10px] uppercase font-semibold mb-2 ${textM}`}>History</p>
              <div className="space-y-2">
                {history.map((h, i) => (
                  <div key={i} className={`p-2 rounded-lg border cursor-pointer border-border`} onClick={() => { setQuery(h.q); run(h.q); }}>
                    <p className={`text-[10px] font-mono truncate text-[color:var(--brand)]`}>{h.q}</p>
                    <p className={`text-[10px] mt-0.5 ${textM}`}>{new Date(h.t).toLocaleTimeString('de-DE')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FleetConnectionView() {
  const [data, setData] = useState<AdminFleetConnectivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'standby' | 'offline' | 'not_connected'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [jammingOpenId, setJammingOpenId] = useState<string | null>(null);
  const [queryConsoleVehicle, setQueryConsoleVehicle] = useState<AdminFleetConnectivityVehicle | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    api.dimo.fleetConnectivity()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const cardClass = `rounded-2xl p-5 shadow-sm border ${
    'sq-card border-border'
  }`;
  const textPrimary = 'text-foreground';
  const textSecondary = 'text-muted-foreground';
  const textMuted = 'text-muted-foreground';

  const vehicles = useMemo(() => {
    if (!data) return [];
    let list = data.vehicles;
    if (statusFilter !== 'all') list = list.filter(v => v.connectionStatus === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.vin?.toLowerCase().includes(q) ||
        v.licensePlate?.toLowerCase().includes(q) ||
        `${v.make} ${v.model}`.toLowerCase().includes(q) ||
        v.deviceSerial?.toLowerCase().includes(q) ||
        v.organizationName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, statusFilter, search]);

  const s = data?.summary;
  const ph = data?.pollHealth;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className={`w-10 h-10 border-2 border-t-transparent rounded-full animate-spin sq-tone-info`} />
        <p className={`text-xs mt-4 ${textSecondary}`}>Loading fleet connectivity diagnostics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <AlertCircle className={`w-12 h-12 mb-4 text-[color:var(--status-critical)]`} />
        <p className={`text-sm font-semibold ${textPrimary}`}>Could not load connectivity diagnostics</p>
        <p className={`text-xs mt-1 ${textSecondary}`}>Check your connection or try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fleet Connection & Diagnostics"
        eyebrow="Master Admin"
        description="Vehicle connectivity, data sources, signal coverage, and poll health"
        icon={<Radio className="w-4 h-4" />}
      />

      {/* ─── Summary Strip ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { label: 'Total', value: s?.total ?? 0, icon: Car, cls: 'sq-tone-info' },
          { label: 'Online', value: s?.online ?? 0, icon: Signal, cls: 'sq-chip-success' },
          { label: 'Standby', value: s?.standby ?? 0, icon: Clock, cls: 'sq-tone-watch' },
          { label: 'Offline', value: s?.offline ?? 0, icon: SignalZero, cls: 'sq-tone-critical' },
          { label: 'Not Connected', value: s?.notConnected ?? 0, icon: Wifi, cls: 'sq-chip-neutral' },
          { label: 'Telemetry', value: s?.withTelemetry ?? 0, icon: Activity, cls: 'sq-tone-ai' },
          { label: 'Avg Coverage', value: `${s?.avgSignalCoverage ?? 0}%`, icon: Gauge, cls: 'sq-tone-info' },
        ].map(stat => (
          <div key={stat.label} className={cardClass}>
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${stat.cls}`}>
                <stat.icon className="w-4 h-4" />
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>{stat.label}</p>
                <p className={`text-lg font-bold ${textPrimary}`}>{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Poll Health / Diagnostics Strip ─── */}
      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-4">
          <Activity className={`w-4 h-4 text-[color:var(--status-info)]`} />
          <h3 className={`text-sm font-semibold ${textPrimary}`}>Poll & Sync Health (24h)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${textMuted}`}>Success Rate</p>
            <p className={`text-lg font-bold ${
              ph?.successRate == null ? textMuted
              : ph.successRate >= 95 ? ('text-[color:var(--status-positive)]')
              : ph.successRate >= 80 ? ('text-[color:var(--status-watch)]')
              : ('text-[color:var(--status-critical)]')
            }`}>{ph?.successRate != null ? `${ph.successRate}%` : '—'}</p>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${textMuted}`}>Successes</p>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className={`w-3.5 h-3.5 text-[color:var(--status-positive)]`} />
              <p className={`text-lg font-bold ${textPrimary}`}>{ph?.success24h ?? 0}</p>
            </div>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${textMuted}`}>Failures</p>
            <div className="flex items-center gap-1.5">
              <XCircle className={`w-3.5 h-3.5 text-[color:var(--status-critical)]`} />
              <p className={`text-lg font-bold ${textPrimary}`}>{ph?.failure24h ?? 0}</p>
            </div>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${textMuted}`}>Timeouts</p>
            <div className="flex items-center gap-1.5">
              <Clock className={`w-3.5 h-3.5 text-[color:var(--status-watch)]`} />
              <p className={`text-lg font-bold ${textPrimary}`}>{ph?.timeout24h ?? 0}</p>
            </div>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${textMuted}`}>Last Failure</p>
            <p className={`text-xs font-medium ${textSecondary}`}>
              {ph?.lastFailureAt ? new Date(ph.lastFailureAt).toLocaleString('de-DE') : '—'}
            </p>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${textMuted}`}>Failed Job</p>
            <p className={`text-xs font-medium ${textSecondary}`}>{ph?.lastFailureJobType ?? '—'}</p>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${textMuted}`}>Last Error</p>
            <p className={`text-[10px] font-mono truncate text-[color:var(--status-critical)]`} title={ph?.lastFailureError ?? undefined}>
              {ph?.lastFailureError ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Filters ─── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${textMuted}`} />
          <input
            type="text"
            placeholder="Search VIN, plate, make, model, serial, org..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border border-border bg-muted/50 text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-[color:var(--brand)]`}
          />
        </div>
        <div className="flex gap-1.5">
          {([['all', 'All'], ['online', 'Online'], ['standby', 'Standby'], ['offline', 'Offline'], ['not_connected', 'No Connection']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Vehicle List ─── */}
      {vehicles.length === 0 ? (
        <div className={`${CARD} flex flex-col items-center justify-center py-16 px-6 text-center border-dashed ${
          '!border-border'
        }`}>
          <div className={`p-3 rounded-full mb-3 bg-muted`}>
            <Car className={`w-8 h-8 text-muted-foreground`} />
          </div>
          <p className={`text-sm font-semibold ${textPrimary}`}>
            {search || statusFilter !== 'all' ? 'No vehicles match your filters' : 'No vehicles registered'}
          </p>
          <p className={`text-xs mt-1 max-w-sm ${textSecondary}`}>
            {search || statusFilter !== 'all'
              ? 'Try adjusting your search or filter criteria.'
              : 'Vehicles will appear here once they are registered and connected via DIMO.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {vehicles.map(v => {
            const isExpanded = expandedId === v.vehicleId;
            const ConnIcon = v.connectionType === 'Aftermarket Device' ? Wifi : v.connectionType === 'Synthetic Device' ? Globe : Zap;
            const d = v.diagnostics;
            return (
              <div key={v.vehicleId} className={`${CARD} transition-all duration-200 hover:shadow-lg cursor-pointer`} onClick={() => setExpandedId(isExpanded ? null : v.vehicleId)}>
                {/* Compact row */}
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    v.connectionStatus === 'online' ? ('sq-chip-success')
                    : v.connectionStatus === 'standby' ? ('sq-tone-watch')
                    : v.connectionStatus === 'offline' ? ('sq-tone-critical')
                    : ('sq-chip-neutral')
                  }`}>
                    <ConnIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-semibold truncate ${textPrimary}`}>{v.make} {v.model} {v.year ?? ''}</p>
                      {v.licensePlate && <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-muted/50`}>{v.licensePlate}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={`text-[10px] font-mono ${textMuted}`}>{v.vin}</span>
                      {v.organizationName && (
                        <span className="flex items-center gap-1">
                          <Building2 className={`w-2.5 h-2.5 ${textMuted}`} />
                          <span className={`text-[10px] ${textMuted}`}>{v.organizationName}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Signal coverage badge */}
                    <div className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold ${
                      v.signalCoverage >= 70 ? ('sq-tone-success')
                      : v.signalCoverage >= 40 ? ('sq-tone-watch')
                      : ('sq-chip-neutral')
                    }`}>
                      <Gauge className="w-3 h-3" />
                      {v.signalCoverage}%
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className={`text-[10px] ${textMuted}`}>Last Signal</p>
                      <p className={`text-xs font-medium ${
                        v.freshnessLabel === 'Live' ? ('text-[color:var(--status-positive)]')
                        : v.freshnessLabel === 'Unknown' ? textMuted
                        : textPrimary
                      }`}>{v.freshnessLabel}</p>
                    </div>
                    <StatusDot status={v.connectionStatus} />
                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''} ${textMuted}`} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className={`mt-4 pt-4 border-t border-border`} onClick={e => e.stopPropagation()}>
                    {/* Connection & Device */}
                    <div className="mb-5">
                      <h4 className={`text-[10px] uppercase tracking-wider font-bold mb-3 ${textMuted}`}>Connection & Device</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                        {([
                          ['Connection Type', v.connectionType],
                          ['Source Type', v.sourceType ?? '—'],
                          ['Provider', v.provider],
                          ['Device Serial', v.deviceSerial ? <span className="font-mono">{v.deviceSerial}</span> : '—'],
                          ['DIMO Token ID', v.dimoTokenId != null ? <span className="font-mono">{v.dimoTokenId}</span> : '—'],
                          ['Synthetic Token', v.syntheticTokenId != null ? <span className="font-mono">{v.syntheticTokenId}</span> : '—'],
                          ['DIMO Status', v.dimoConnectionStatus ?? '—'],
                          ['Paired / Linked', v.pairedAt ? new Date(v.pairedAt).toLocaleDateString('de-DE') : '—'],
                        ] as [string, React.ReactNode][]).map(([label, value]) => (
                          <div key={label}>
                            <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>{label}</p>
                            <p className={`text-xs font-medium mt-0.5 ${textPrimary}`}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* OBD + jamming (latest telemetry snapshot) */}
                    <div className="mb-5">
                      <h4 className={`text-[10px] uppercase tracking-wider font-bold mb-3 ${textMuted}`}>OBD & cellular</h4>
                      <div className={`rounded-xl border px-3 py-3 space-y-3 border-border`}>
                        <div className="flex items-center gap-2">
                          {v.obdIsPluggedIn === true && <><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /><span className={`text-xs font-medium ${textPrimary}`}>OBD Device Plugged IN</span></>}
                          {v.obdIsPluggedIn === false && <><XCircle className="w-4 h-4 text-red-500 shrink-0" /><span className={`text-xs font-medium ${textPrimary}`}>OBD Device NOT plugged in</span></>}
                          {v.obdIsPluggedIn == null && <span className={`text-xs ${textMuted}`}>OBD plug-in: no snapshot data</span>}
                        </div>
                        <div>
                          <button
                            type="button"
                            className={`flex items-center gap-2 text-left w-full ${(v.jammingDetectedCount ?? 0) > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if ((v.jammingDetectedCount ?? 0) <= 0) return;
                              setJammingOpenId(jammingOpenId === v.vehicleId ? null : v.vehicleId);
                            }}
                          >
                            <span className={`text-xs font-semibold ${textPrimary}`}>{v.jammingDetectedCount ?? 0} Jamming detected</span>
                            {(v.jammingDetectedCount ?? 0) > 0 && (
                              <ChevronDown className={`w-3.5 h-3.5 ${textMuted} transition-transform ${jammingOpenId === v.vehicleId ? 'rotate-180' : ''}`} />
                            )}
                          </button>
                          {jammingOpenId === v.vehicleId && (v.jammingDetectedCount ?? 0) > 0 && (
                            <ul className={`mt-2 space-y-2 pl-3 border-l-2 text-[color:var(--status-watch)]`}>
                              {(v.jammingIncidents ?? []).map((inc, i) => (
                                <li key={i} className={`text-[10px] space-y-0.5 ${textSecondary}`}>
                                  <p><span className={textMuted}>When: </span>{inc.detectedAt ? new Date(inc.detectedAt).toLocaleString('de-DE') : '—'}</p>
                                  <p><span className={textMuted}>Where: </span>{inc.where ?? '—'}</p>
                                  <p><span className={textMuted}>Last known address: </span>{inc.lastKnownAddress ?? '—'}</p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status & Timing */}
                    <div className="mb-5">
                      <h4 className={`text-[10px] uppercase tracking-wider font-bold mb-3 ${textMuted}`}>Status & Timing</h4>
                      {/* Status interpretation banner */}
                      <div className={`flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg text-xs ${
                        v.connectionStatus === 'online' ? ('sq-tone-success')
                        : v.connectionStatus === 'standby' ? ('sq-tone-watch')
                        : v.connectionStatus === 'offline' ? ('sq-tone-critical')
                        : ('sq-chip-neutral')
                      }`}>
                        <StatusDot status={v.connectionStatus} />
                        <span className="mt-0.5">{v.statusNote}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                        {([
                          ['Connection Status', <StatusDot key="s" status={v.connectionStatus} />],
                          ['Last Signal', v.lastSeenAt ? new Date(v.lastSeenAt).toLocaleString('de-DE') : '—'],
                          ['Last Sync', v.lastSyncedAt ? new Date(v.lastSyncedAt).toLocaleString('de-DE') : '—'],
                          ['Data Freshness', v.freshnessLabel],
                          ['Telemetry Available', v.hasTelemetry ? <span className={'text-[color:var(--status-positive)]'}>Yes</span> : <span className={textMuted}>No</span>],
                          ['Odometer', formatOdometerKmFloor(v.odometerKm)],
                          ['Location', (v.latitude != null && v.longitude != null) ? `${v.latitude.toFixed(4)}, ${v.longitude.toFixed(4)}` : '—'],
                        ] as [string, React.ReactNode][]).map(([label, value]) => (
                          <div key={label}>
                            <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>{label}</p>
                            <div className="mt-0.5">
                              {typeof value === 'string' ? <p className={`text-xs font-medium ${textPrimary}`}>{value}</p> : value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Vehicle Mapping */}
                    <div className="mb-5">
                      <h4 className={`text-[10px] uppercase tracking-wider font-bold mb-3 ${textMuted}`}>Vehicle / Device Mapping</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                        {([
                          ['Vehicle ID', <span className="font-mono text-[10px]">{v.vehicleId}</span>],
                          ['VIN', <span className="font-mono text-[10px]">{v.vin}</span>],
                          ['License Plate', v.licensePlate ?? '—'],
                          ['Organization', v.organizationName ?? '—'],
                        ] as [string, React.ReactNode][]).map(([label, value]) => (
                          <div key={label}>
                            <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>{label}</p>
                            <div className={`text-xs font-medium mt-0.5 ${textPrimary}`}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Signal Coverage */}
                    <div className="mb-5">
                      <h4 className={`text-[10px] uppercase tracking-wider font-bold mb-3 ${textMuted}`}>
                        Signal Coverage
                        <span className={`ml-2 text-[10px] font-medium ${
                          v.signalCoverage >= 70 ? ('text-[color:var(--status-positive)]')
                          : v.signalCoverage >= 40 ? ('text-[color:var(--status-watch)]')
                          : ('text-muted-foreground')
                        }`}>{v.signalCoverage}%</span>
                      </h4>
                      {v.availableSignals.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {v.availableSignals.map(sig => {
                            const Icon = SIGNAL_ICONS[sig] ?? Activity;
                            const querySnippet = SIGNAL_QUERIES[sig];
                            return (
                              <span key={sig} className={`group relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold ${
                                'border-border'
                              }`} title={querySnippet ? `Query: ${querySnippet}` : undefined}>
                                <Icon className="w-3 h-3" />
                                {sig}
                                {querySnippet && <Code2 className={`w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition-opacity text-[color:var(--brand)]`} />}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className={`text-xs ${textMuted}`}>No signal data available</p>
                      )}
                      {v.availableSignals.length > 0 && (
                        <div className={`w-full h-1.5 rounded-full overflow-hidden mt-3 bg-muted`}>
                          <div
                            className={`h-full rounded-full transition-all ${
                              v.signalCoverage >= 70 ? 'bg-emerald-500' : v.signalCoverage >= 40 ? 'bg-amber-500' : 'bg-gray-400'
                            }`}
                            style={{ width: `${Math.min(v.signalCoverage, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Poll Diagnostics */}
                    <div className="mb-5">
                      <h4 className={`text-[10px] uppercase tracking-wider font-bold mb-3 ${textMuted}`}>Poll Diagnostics (24h)</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-3">
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>Successes</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <CheckCircle2 className={`w-3 h-3 text-[color:var(--status-positive)]`} />
                            <p className={`text-xs font-bold ${textPrimary}`}>{d.pollSuccess24h}</p>
                          </div>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>Failures</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <XCircle className={`w-3 h-3 ${d.pollFailure24h > 0 ? ('text-[color:var(--status-critical)]') : textMuted}`} />
                            <p className={`text-xs font-bold ${d.pollFailure24h > 0 ? ('text-[color:var(--status-critical)]') : textPrimary}`}>{d.pollFailure24h}</p>
                          </div>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>Last Success</p>
                          <p className={`text-xs font-medium mt-0.5 ${textPrimary}`}>{d.lastPollSuccessAt ? new Date(d.lastPollSuccessAt).toLocaleString('de-DE') : '—'}</p>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>Last Failure</p>
                          <p className={`text-xs font-medium mt-0.5 ${d.lastPollFailureAt ? ('text-[color:var(--status-critical)]') : textPrimary}`}>{d.lastPollFailureAt ? new Date(d.lastPollFailureAt).toLocaleString('de-DE') : '—'}</p>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>Last Duration</p>
                          <p className={`text-xs font-medium mt-0.5 ${textPrimary}`}>{d.lastPollDurationMs != null ? `${d.lastPollDurationMs} ms` : '—'}</p>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>Last Error</p>
                          <p className={`text-[10px] font-mono mt-0.5 truncate text-[color:var(--status-critical)]`} title={d.lastPollError ?? undefined}>{d.lastPollError ?? '—'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Query Console Button */}
                    <div className={`pt-4 border-t border-border`}>
                      <button
                        onClick={() => setQueryConsoleVehicle(v)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all sq-tone-brand border border-border hover:opacity-90"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        Open Query Console
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Query Console Modal */}
      {queryConsoleVehicle && (
        <QueryConsole
          vehicle={queryConsoleVehicle}
          onClose={() => setQueryConsoleVehicle(null)}
        />
      )}
    </div>
  );
}
