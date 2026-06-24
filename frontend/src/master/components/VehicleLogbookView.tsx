import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Search, Clock, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight,
  Activity, Cpu, MapPin, Zap, Shield, Database, Eye, FileJson, RefreshCw, Power,
  Battery, Car, Gauge, Fuel, Thermometer, Radio, Wrench, Layers, Navigation,
} from 'lucide-react';
import { api } from '../../lib/api';

interface Props { isDarkMode: boolean }

type Tab = 'overview' | 'signals' | 'workers' | 'trips' | 'hf' | 'dtc' | 'ui-map' | 'raw';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: Eye },
  { key: 'signals', label: 'Signal Groups', icon: Radio },
  { key: 'workers', label: 'Workers & Timeline', icon: Cpu },
  { key: 'trips', label: 'Trip Detection', icon: MapPin },
  { key: 'hf', label: 'HF Analysis', icon: Activity },
  { key: 'dtc', label: 'DTC / Errors', icon: Wrench },
  { key: 'ui-map', label: 'UI Mapping', icon: Layers },
  { key: 'raw', label: 'Raw Logs', icon: FileJson },
];

const DURATION_PRESETS = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

export default function VehicleLogbookView({ isDarkMode: d }: Props) {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const bg = d ? 'bg-neutral-900' : 'bg-white';
  const card = d ? 'bg-neutral-800/60 border-neutral-700/50' : 'bg-gray-50 border-gray-200';
  const text1 = d ? 'text-white' : 'text-gray-900';
  const text2 = d ? 'text-gray-400' : 'text-gray-500';
  const text3 = d ? 'text-gray-500' : 'text-gray-400';
  const border = d ? 'border-neutral-700/50' : 'border-gray-200';
  const inputBg = d ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400';

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.admin.vehicleLogbook.list();
      setVehicles(data);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await api.admin.vehicleLogbook.detail(id);
      setDetail(data);
    } catch { /* silent */ }
    setDetailLoading(false);
  }, []);

  useEffect(() => { if (selectedId) fetchDetail(selectedId); }, [selectedId, fetchDetail]);

  const handleEnable = async (vehicleId: string, hours: number) => {
    await api.admin.vehicleLogbook.enable(vehicleId, { durationHours: hours, enabledBy: 'Master Admin' });
    fetchVehicles();
  };
  const handleDisable = async (vehicleId: string) => {
    await api.admin.vehicleLogbook.disable(vehicleId);
    fetchVehicles();
  };

  const filtered = vehicles.filter((v) => {
    const s = search.toLowerCase();
    return !s || v.licensePlate?.toLowerCase().includes(s) || v.make?.toLowerCase().includes(s) || v.model?.toLowerCase().includes(s) || v.vin?.toLowerCase().includes(s);
  });

  const ago = (d: string | null) => {
    if (!d) return '—';
    const ms = Date.now() - new Date(d).getTime();
    if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)}h ago`;
    return `${Math.round(ms / 86400000)}d ago`;
  };

  const fmtTime = (d: string | null) => d ? new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  // ── Vehicle List ──────────────────────────────────────────────────────
  if (!selectedId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className={`w-6 h-6 ${d ? 'text-indigo-400' : 'text-indigo-600'}`} />
            <div>
              <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">Vehicle Logbook</h1>
              <p className={`text-xs ${text3}`}>Per-vehicle telemetry debug &amp; signal trace console</p>
            </div>
          </div>
          <button onClick={fetchVehicles} className={`p-2 rounded-lg ${d ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}><RefreshCw className={`w-4 h-4 ${text2}`} /></button>
        </div>

        <div className="relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${text3}`} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by plate, make, model, VIN…" className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm ${inputBg}`} />
        </div>

        {loading ? (
          <div className={`text-center py-12 ${text2}`}><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Loading vehicles…</div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((v) => {
              const active = v.logbook?.enabled;
              return (
                <div key={v.id} className={`rounded-xl border ${card} p-3 flex items-center gap-4`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Car className={`w-4 h-4 ${text3}`} />
                      <span className={`text-sm font-semibold ${text1}`}>{v.licensePlate || v.vin || v.id.slice(0, 8)}</span>
                      <span className={`text-xs ${text3}`}>{[v.make, v.model, v.year].filter(Boolean).join(' ')}</span>
                      {v.hardwareType && v.hardwareType !== 'UNKNOWN' && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${d ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}`}>{v.hardwareType}</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-3 mt-1 text-[10px] ${text3}`}>
                      <span className="flex items-center gap-1"><Power className="w-3 h-3" />{v.online ? 'Online' : 'Offline'}</span>
                      <span>Last seen: {ago(v.lastSeen)}</span>
                      {v.tripState && <span>Trip: {v.tripState}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {active ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="w-3 h-3" />Active</span>
                        <span className={`text-[9px] ${text3}`}>until {fmtTime(v.logbook.expiresAt)}</span>
                        <button onClick={(e) => { e.stopPropagation(); handleDisable(v.id); }} className={`text-[10px] px-2 py-1 rounded-lg ${d ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>Disable</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        {DURATION_PRESETS.map((p) => (
                          <button key={p.hours} onClick={(e) => { e.stopPropagation(); handleEnable(v.id, p.hours); }} className={`text-[10px] px-2 py-1 rounded-lg ${d ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>{p.label}</button>
                        ))}
                      </div>
                    )}
                    <button onClick={() => { setSelectedId(v.id); setActiveTab('overview'); }} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${d ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>Open</button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className={`text-center py-8 ${text3}`}>No vehicles found</p>}
          </div>
        )}
      </div>
    );
  }

  // ── Detail View ───────────────────────────────────────────────────────
  const ov = detail?.overview;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => setSelectedId(null)} className={`p-1.5 rounded-lg ${d ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}>
          <ChevronRight className={`w-4 h-4 rotate-180 ${text2}`} />
        </button>
        <BookOpen className={`w-5 h-5 ${d ? 'text-indigo-400' : 'text-indigo-600'}`} />
        <div className="flex-1">
          <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">{ov?.licensePlate || 'Loading…'}</h1>
          <p className={`text-xs ${text3}`}>{[ov?.make, ov?.model, ov?.year].filter(Boolean).join(' ')}{ov?.vin ? ` · ${ov.vin}` : ''}</p>
        </div>
        <button onClick={() => fetchDetail(selectedId)} className={`p-2 rounded-lg ${d ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}><RefreshCw className={`w-4 h-4 ${text2} ${detailLoading ? 'animate-spin' : ''}`} /></button>
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-xl ${d ? 'bg-neutral-800/60' : 'bg-gray-100'} overflow-x-auto`}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${active ? (d ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white text-indigo-700 shadow-sm') : (d ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')}`}>
              <Icon className="w-3.5 h-3.5" />{t.label}
            </button>
          );
        })}
      </div>

      {detailLoading && !detail && <div className={`text-center py-12 ${text2}`}><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Loading logbook data…</div>}

      {detail && (
        <div className="space-y-4">
          {activeTab === 'overview' && <OverviewTab d={d} detail={detail} card={card} text1={text1} text2={text2} text3={text3} ago={ago} fmtTime={fmtTime} />}
          {activeTab === 'signals' && <SignalGroupsTab d={d} detail={detail} card={card} text1={text1} text2={text2} text3={text3} />}
          {activeTab === 'workers' && <WorkersTab d={d} detail={detail} card={card} text1={text1} text2={text2} text3={text3} fmtTime={fmtTime} />}
          {activeTab === 'trips' && <TripsTab d={d} detail={detail} card={card} text1={text1} text2={text2} text3={text3} fmtTime={fmtTime} ago={ago} />}
          {activeTab === 'hf' && <HfTab d={d} detail={detail} card={card} text1={text1} text2={text2} text3={text3} fmtTime={fmtTime} />}
          {activeTab === 'dtc' && <DtcTab d={d} detail={detail} card={card} text1={text1} text2={text2} text3={text3} fmtTime={fmtTime} />}
          {activeTab === 'ui-map' && <UiMappingTab d={d} detail={detail} card={card} text1={text1} text2={text2} text3={text3} />}
          {activeTab === 'raw' && <RawTab d={d} detail={detail} card={card} text1={text1} text2={text2} text3={text3} />}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TABS
// ────────────────────────────────────────────────────────────────────────────

interface TabProps { d: boolean; detail: any; card: string; text1: string; text2: string; text3: string; fmtTime?: (d: string | null) => string; ago?: (d: string | null) => string }

function StatBox({ d, label, value, sub, color }: { d: boolean; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${d ? 'bg-neutral-800/60' : 'bg-gray-50'}`}>
      <p className={`text-[9px] uppercase tracking-wider ${d ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-sm font-bold ${color || (d ? 'text-white' : 'text-gray-900')}`}>{value}</p>
      {sub && <p className={`text-[9px] ${d ? 'text-gray-600' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  );
}

function StatusBadge({ status, d }: { status: string; d: boolean }) {
  const colors: Record<string, string> = {
    healthy: d ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700',
    partial: d ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700',
    missing: d ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700',
    null_value: d ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700',
    stale: d ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700',
    missing_signal: d ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700',
    SUCCESS: d ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700',
    FAILURE: d ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700',
    TIMEOUT: d ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700',
    SKIPPED: d ? 'bg-neutral-500/15 text-neutral-400' : 'bg-gray-100 text-gray-600',
  };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${colors[status] || (d ? 'bg-neutral-700 text-gray-400' : 'bg-gray-100 text-gray-500')}`}>{status}</span>;
}

function Explanation({ text, d }: { text: string; d: boolean }) {
  return <p className={`text-xs px-3 py-2 rounded-lg ${d ? 'bg-indigo-500/10 text-indigo-300/80 border border-indigo-500/20' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}`}>{text}</p>;
}

// ── Overview ────────────────────────────────────────────────────────────

function OverviewTab({ d, detail, card, text1, text2, text3, ago, fmtTime }: TabProps) {
  const ov = detail.overview;
  const tripState = ov?.tripDetectionState ?? 'UNKNOWN';
  const tripColors: Record<string, string> = {
    RESTING: d ? 'text-gray-400' : 'text-gray-500',
    POSSIBLE_START: d ? 'text-amber-400' : 'text-amber-600',
    ACTIVE_TRIP: d ? 'text-emerald-400' : 'text-emerald-600',
    IDLE_WITHIN_TRIP: d ? 'text-amber-400' : 'text-amber-600',
    POSSIBLE_END: d ? 'text-amber-400' : 'text-amber-600',
  };

  return (
    <div className="space-y-4">
      <Explanation d={d} text="This overview shows the current operational status of the vehicle. It helps quickly determine whether the vehicle is active, connected, and which major systems are tracking." />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatBox d={d} label="Connection" value={ov?.connectionStatus ?? '—'} sub={`Last seen: ${ago!(ov?.lastSeenAt)}`} color={ov?.online ? (d ? 'text-emerald-400' : 'text-emerald-600') : undefined} />
        <StatBox d={d} label="Trip State" value={tripState} color={tripColors[tripState] || text2} sub={ov?.activeTripId ? `Trip: ${ov.activeTripId.slice(0, 8)}` : 'No active trip'} />
        <StatBox d={d} label="12V Battery" value={ov?.lvBatteryTracking ? (ov.lvPublicationState ?? 'Tracking') : 'Not tracking'} color={ov?.lvBatteryTracking ? (d ? 'text-cyan-400' : 'text-cyan-600') : text3} />
        <StatBox d={d} label="HV Battery" value={ov?.hvBatteryTracking ? (ov.hvPublicationState ?? 'Tracking') : 'N/A'} color={ov?.hvBatteryTracking ? (d ? 'text-violet-400' : 'text-violet-600') : text3} />
      </div>

      <div className={`rounded-xl border ${card} p-4`}>
        <h3 className={`text-xs font-semibold mb-3 ${text1}`}>Vehicle Identity</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-xs">
          {[
            ['License Plate', ov?.licensePlate],
            ['Make / Model', [ov?.make, ov?.model].filter(Boolean).join(' ')],
            ['Year', ov?.year],
            ['VIN', ov?.vin],
            ['Hardware', ov?.hardwareType],
            ['DIMO Token', ov?.dimoTokenId],
            ['Detection Profile', ov?.detectionProfile],
          ].map(([l, v]) => (
            <div key={l as string}>
              <span className={text3}>{l}: </span>
              <span className={`font-medium ${text1}`}>{v || '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {ov?.logbook && (
        <div className={`rounded-xl border ${card} p-4`}>
          <h3 className={`text-xs font-semibold mb-2 ${text1}`}>Logbook Config</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div><span className={text3}>Enabled: </span><span className={ov.logbook.enabled ? 'text-emerald-400 font-medium' : text2}>{ov.logbook.enabled ? 'Yes' : 'No'}</span></div>
            <div><span className={text3}>Since: </span><span className={text1}>{fmtTime!(ov.logbook.enabledAt)}</span></div>
            <div><span className={text3}>Until: </span><span className={text1}>{fmtTime!(ov.logbook.expiresAt)}</span></div>
            <div><span className={text3}>By: </span><span className={text1}>{ov.logbook.enabledBy || '—'}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Signal Groups ───────────────────────────────────────────────────────

function SignalGroupsTab({ d, detail, card, text1, text2, text3 }: TabProps) {
  const sc = detail.signalCoverage;

  return (
    <div className="space-y-4">
      <Explanation d={d} text="Signal groups show which telemetry signals are present from the latest DIMO snapshot. Missing signals explain why certain UI fields may be empty. Each signal maps to specific UI components." />

      <div className={`rounded-xl border ${card} p-3`}>
        <p className={`text-xs font-medium ${text1}`}>{sc?.summary || 'No data'}</p>
        <p className={`text-[9px] ${text3}`}>Last updated: {sc?.lastUpdated ? new Date(sc.lastUpdated).toLocaleString('de-DE') : '—'}</p>
      </div>

      {sc?.groups?.map((g: any) => (
        <div key={g.name} className={`rounded-xl border ${card} p-4`}>
          <div className="flex items-center gap-2 mb-3">
            <StatusBadge status={g.status} d={d} />
            <h3 className={`text-xs font-semibold ${text1}`}>{g.name}</h3>
            <span className={`text-[9px] ${text3}`}>{g.present}/{g.total} signals</span>
          </div>
          <div className="space-y-1">
            {g.signals.map((s: any) => (
              <div key={s.field} className="flex items-center gap-3 text-xs">
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.present ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className={`w-32 font-medium ${text1}`}>{s.name}</span>
                <span className={`flex-1 font-mono text-[10px] ${s.present ? text2 : (d ? 'text-red-400/70' : 'text-red-500/70')}`}>
                  {s.present ? String(s.value) : 'null — signal missing'}
                </span>
                <span className={`text-[9px] ${text3}`}>{s.uiUsage}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Workers & Timeline ──────────────────────────────────────────────────

function WorkersTab({ d, detail, card, text1, text2, text3, fmtTime }: TabProps) {
  const timeline = detail.timeline ?? [];
  const jobLabels: Record<string, string> = {
    SNAPSHOT: 'Snapshot Poll',
    TRIP_TRACKING: 'Trip Tracking',
    DTC_POLL: 'DTC Poll',
    VEHICLE_SYNC: 'Vehicle Sync',
    DRIVING_EVENTS: 'Driving Events',
    ANALYTICS: 'Analytics',
    LIVE_MAP: 'Live Map',
  };

  return (
    <div className="space-y-4">
      <Explanation d={d} text="This timeline shows recent worker/processor executions for this vehicle. Each entry represents a BullMQ job that touched this vehicle's data. It helps trace when snapshots were polled, when trips were tracked, and whether any jobs failed." />

      {timeline.length === 0 ? (
        <p className={`text-sm ${text3} text-center py-8`}>No recent worker activity recorded</p>
      ) : (
        <div className="space-y-1">
          {timeline.map((e: any) => (
            <div key={e.id} className={`rounded-lg border ${card} px-3 py-2 flex items-center gap-3`}>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.status === 'SUCCESS' ? 'bg-emerald-400' : e.status === 'FAILURE' ? 'bg-red-400' : 'bg-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${text1}`}>{jobLabels[e.jobType] || e.jobType}</span>
                  <StatusBadge status={e.status} d={d} />
                  {e.durationMs != null && <span className={`text-[9px] ${text3}`}>{e.durationMs}ms</span>}
                </div>
                {e.errorMessage && <p className={`text-[10px] text-red-400 truncate`}>{e.errorMessage}</p>}
              </div>
              <span className={`text-[10px] ${text3} shrink-0`}>{fmtTime!(e.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trip Detection ──────────────────────────────────────────────────────

function TripsTab({ d, detail, card, text1, text2, text3, fmtTime, ago }: TabProps) {
  const td = detail.tripDetection;
  const trips = detail.recentTrips ?? [];

  const stateExplanation: Record<string, string> = {
    RESTING: 'Vehicle is not in a trip. Waiting for movement/ignition evidence to trigger a possible start.',
    POSSIBLE_START: 'Movement detected. Validating trip start via DIMO core data and speed patterns.',
    ACTIVE_TRIP: 'Trip is confirmed and in progress. Active tick monitoring waypoints, route, and continuity.',
    IDLE_WITHIN_TRIP: 'Vehicle stopped briefly within an active trip. Monitoring for resume or possible end.',
    POSSIBLE_END: 'Prolonged inactivity detected. Running end-validation and CUSUM boundary analysis.',
  };

  return (
    <div className="space-y-4">
      <Explanation d={d} text="Trip detection traces the V3 local state machine for this vehicle. Each snapshot evaluation feeds evidence into the state machine (RESTING → POSSIBLE_START → ACTIVE_TRIP → POSSIBLE_END → finalize). CUSUM validates trip boundaries." />

      {td ? (
        <>
          <div className={`rounded-xl border ${card} p-4`}>
            <h3 className={`text-xs font-semibold mb-2 ${text1}`}>Current State Machine</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <StatBox d={d} label="State" value={td.state} color={td.state === 'ACTIVE_TRIP' ? (d ? 'text-emerald-400' : 'text-emerald-600') : td.state === 'RESTING' ? text2 : (d ? 'text-amber-400' : 'text-amber-600')} />
              <StatBox d={d} label="Profile" value={td.detectionProfile} />
              <StatBox d={d} label="Active Trip" value={td.activeTripId?.slice(0, 8) || 'None'} />
              <StatBox d={d} label="Possible Start" value={fmtTime!(td.possibleStartAt)} />
              <StatBox d={d} label="Possible End" value={fmtTime!(td.possibleEndAt)} />
              <StatBox d={d} label="CUSUM Validated" value={fmtTime!(td.cusumValidatedAt)} />
              <StatBox d={d} label="End Attempts" value={String(td.endValidationAttempts)} />
              <StatBox d={d} label="Last Activity" value={ago!(td.lastActivityAt)} />
              <StatBox d={d} label="Last Movement" value={ago!(td.lastMeaningfulMovementAt)} />
            </div>
            <p className={`text-xs mt-3 ${d ? 'text-indigo-300/70' : 'text-indigo-600/80'}`}>{stateExplanation[td.state] || ''}</p>
          </div>

          {td.lastEvidenceSummary && (
            <div className={`rounded-xl border ${card} p-4`}>
              <h3 className={`text-xs font-semibold mb-2 ${text1}`}>Last Evidence Summary</h3>
              <pre className={`text-[10px] font-mono overflow-x-auto ${text2}`}>{JSON.stringify(td.lastEvidenceSummary, null, 2)}</pre>
            </div>
          )}
        </>
      ) : (
        <p className={`text-sm ${text3} text-center py-6`}>No trip detection state available</p>
      )}

      {trips.length > 0 && (
        <div className={`rounded-xl border ${card} p-4`}>
          <h3 className={`text-xs font-semibold mb-3 ${text1}`}>Recent Trips</h3>
          <div className="space-y-1.5">
            {trips.map((t: any) => (
              <div key={t.id} className={`rounded-lg px-3 py-2 ${d ? 'bg-neutral-800/40' : 'bg-white'} border ${d ? 'border-neutral-700/30' : 'border-gray-100'}`}>
                <div className="flex items-center gap-3 text-xs">
                  <span className={`font-medium ${text1}`}>{t.id.slice(0, 8)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${t.tripStatus === 'COMPLETED' ? (d ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700') : (d ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700')}`}>{t.tripStatus}</span>
                  <span className={text3}>{fmtTime!(t.startTime)} → {fmtTime!(t.endTime)}</span>
                  <span className={text2}>{t.distanceKm?.toFixed(1) ?? '—'} km</span>
                  {t.enrichedAt && <span className={`text-[9px] ${d ? 'text-cyan-400/70' : 'text-cyan-600/70'}`}>Route ✓</span>}
                  {t.behaviorEnrichedAt && <span className={`text-[9px] ${d ? 'text-violet-400/70' : 'text-violet-600/70'}`}>HF ✓</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── HF Analysis ─────────────────────────────────────────────────────────

function HfTab({ d, detail, card, text1, text2, text3, fmtTime }: TabProps) {
  const runs = detail.hfAnalysis ?? [];

  return (
    <div className="space-y-4">
      <Explanation d={d} text="HF (High-Frequency) enrichment runs after trip finalization. For SMART5 vehicles, it fetches 1-second time-series data (speed, RPM, throttle, engine load, coolant temp) and detects acceleration, braking, and abuse events. For LTE_R1, native DIMO driving events are used instead, plus HF for abuse only." />

      {runs.length === 0 ? (
        <p className={`text-sm ${text3} text-center py-8`}>No HF enrichment runs recorded for recent trips</p>
      ) : (
        <div className="space-y-2">
          {runs.map((r: any) => (
            <div key={r.tripId} className={`rounded-xl border ${card} p-4`}>
              <div className="flex items-center gap-3 mb-2">
                <Activity className={`w-4 h-4 ${d ? 'text-violet-400' : 'text-violet-600'}`} />
                <span className={`text-xs font-medium ${text1}`}>Trip {r.tripId.slice(0, 8)}</span>
                <span className={`text-[9px] ${text3}`}>{fmtTime!(r.startTime)} → {fmtTime!(r.endTime)}</span>
                <span className={`text-[9px] ${d ? 'text-violet-400' : 'text-violet-600'}`}>Enriched: {fmtTime!(r.enrichedAt)}</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                <StatBox d={d} label="Accel Events" value={String(r.accelerationEvents ?? 0)} />
                <StatBox d={d} label="Brake Events" value={String(r.brakingEvents ?? 0)} />
                <StatBox d={d} label="Abuse Events" value={String(r.abuseEvents ?? 0)} color={r.abuseEvents > 0 ? 'text-red-400' : undefined} />
                <StatBox d={d} label="Profile" value={r.detectionProfile ?? '—'} />
                <StatBox d={d} label="Quality" value={
                  (r.accelerationEvents != null || r.brakingEvents != null) ? 'Healthy' : 'Unknown'
                } color={d ? 'text-emerald-400' : 'text-emerald-600'} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DTC / Error Codes ───────────────────────────────────────────────────

function DtcTab({ d, detail, card, text1, text2, text3, fmtTime }: TabProps) {
  const dtc = detail.dtcInfo;

  return (
    <div className="space-y-4">
      <Explanation d={d} text="DTC (Diagnostic Trouble Codes) are polled every 3 hours via DIMO's OBD-II integration. Active codes indicate current vehicle faults. This section helps verify whether codes were received, parsed, and stored correctly." />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatBox d={d} label="Last Poll" value={fmtTime!(dtc?.lastPollAt)} />
        <StatBox d={d} label="Last Success" value={fmtTime!(dtc?.lastSuccessAt)} />
        <StatBox d={d} label="Poll Status" value={dtc?.pollStatus ?? '—'} color={dtc?.pollStatus === 'success' ? (d ? 'text-emerald-400' : 'text-emerald-600') : undefined} />
        <StatBox d={d} label="Active Codes" value={String(dtc?.activeCodes?.length ?? 0)} color={dtc?.activeCodes?.length > 0 ? 'text-red-400' : (d ? 'text-emerald-400' : 'text-emerald-600')} />
      </div>

      {dtc?.pollError && (
        <div className={`rounded-lg px-3 py-2 ${d ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-100'}`}>
          <p className="text-xs text-red-400">Last error: {dtc.pollError}</p>
        </div>
      )}

      {(dtc?.activeCodes?.length > 0 || dtc?.historicalCodes?.length > 0) && (
        <div className={`rounded-xl border ${card} p-4`}>
          <h3 className={`text-xs font-semibold mb-3 ${text1}`}>DTC Events</h3>
          <div className="space-y-1.5">
            {[...(dtc?.activeCodes ?? []), ...(dtc?.historicalCodes ?? [])].map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 text-xs">
                <span className={`w-2 h-2 rounded-full ${c.isActive ? 'bg-red-400' : 'bg-gray-400'}`} />
                <span className={`font-mono font-medium ${text1}`}>{c.dtcCode}</span>
                <span className={text2}>{c.description || '—'}</span>
                <span className={`text-[9px] ${text3}`}>×{c.occurrenceCount}</span>
                <span className={`text-[9px] ${text3} ml-auto`}>{c.isActive ? 'Active' : `Cleared ${fmtTime!(c.clearedAt)}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!dtc?.activeCodes?.length && !dtc?.historicalCodes?.length) && (
        <p className={`text-sm ${text3} text-center py-4`}>No DTC events recorded</p>
      )}
    </div>
  );
}

// ── UI Mapping ──────────────────────────────────────────────────────────

function UiMappingTab({ d, detail, card, text1, text2, text3 }: TabProps) {
  const mappings = detail.uiMapping ?? [];
  const healthy = mappings.filter((m: any) => m.status === 'healthy').length;
  const issues = mappings.length - healthy;

  return (
    <div className="space-y-4">
      <Explanation d={d} text="This section maps important UI fields back to their signal and processing origin. It answers questions like 'Why is fuel percentage missing?' by tracing from the UI component → backend field → raw DIMO signal. Green means the signal is present and current. Red means the value is null (signal not available in snapshots)." />

      <div className={`rounded-xl border ${card} p-3 flex items-center gap-4`}>
        <span className={`text-xs font-medium ${text1}`}>{healthy}/{mappings.length} fields healthy</span>
        {issues > 0 && <span className="text-xs text-red-400">{issues} fields with issues</span>}
      </div>

      <div className="space-y-1">
        {mappings.map((m: any, i: number) => (
          <div key={i} className={`rounded-lg border ${card} px-3 py-2`}>
            <div className="flex items-center gap-3 text-xs">
              <span className={`w-2 h-2 rounded-full shrink-0 ${m.status === 'healthy' ? 'bg-emerald-400' : m.status === 'stale' ? 'bg-amber-400' : 'bg-red-400'}`} />
              <span className={`font-medium w-28 ${text1}`}>{m.uiField}</span>
              <StatusBadge status={m.status} d={d} />
              <span className={`font-mono text-[10px] flex-1 ${m.status === 'healthy' ? text2 : 'text-red-400/70'}`}>{m.value != null ? String(m.value) : 'null'}</span>
              <span className={`text-[9px] ${text3} hidden sm:block`}>{m.page}</span>
            </div>
            <div className={`mt-1 text-[10px] ${d ? 'text-gray-600' : 'text-gray-400'}`}>
              {m.backendField} ← {m.signalOrigin}
            </div>
            {m.status !== 'healthy' && (
              <p className={`text-[10px] mt-0.5 ${d ? 'text-amber-400/80' : 'text-amber-600/80'}`}>{m.reason}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Raw Logs ────────────────────────────────────────────────────────────

function RawTab({ d, detail, card, text1, text2, text3 }: TabProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

  const sections = [
    { key: 'rawPayload', label: 'Latest Snapshot Raw Payload', data: detail.rawPayload },
    { key: 'tripDetection', label: 'Trip Detection State', data: detail.tripDetection },
    { key: 'signalCoverage', label: 'Signal Coverage Analysis', data: detail.signalCoverage },
    { key: 'overview', label: 'Overview Data', data: detail.overview },
  ];

  return (
    <div className="space-y-4">
      <Explanation d={d} text="Raw JSON payloads for advanced inspection. Expand each section to see the full data structure. This is primarily for senior engineers debugging specific signal values or data shape issues." />

      {sections.map((s) => (
        <div key={s.key} className={`rounded-xl border ${card}`}>
          <button onClick={() => toggle(s.key)} className={`w-full flex items-center gap-2 px-4 py-3 text-xs font-medium ${text1}`}>
            {expanded[s.key] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {s.label}
            {s.data ? <span className={`text-[9px] ${text3}`}>{JSON.stringify(s.data).length > 100 ? `${Math.round(JSON.stringify(s.data).length / 1024)}KB` : 'small'}</span> : <span className={`text-[9px] text-red-400`}>null</span>}
          </button>
          {expanded[s.key] && s.data && (
            <div className={`px-4 pb-4 overflow-x-auto`}>
              <pre className={`text-[10px] font-mono whitespace-pre-wrap break-all ${text2}`}>{JSON.stringify(s.data, null, 2)}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
