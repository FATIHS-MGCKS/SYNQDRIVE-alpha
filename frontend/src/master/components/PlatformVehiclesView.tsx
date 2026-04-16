import { Car, Search, Building2, CheckCircle, AlertTriangle, Wrench, Wifi, WifiOff, Plus, Zap, X, Battery, Disc3, Gauge, ClipboardList, Fuel, RefreshCw, RotateCcw, Pencil, Shield, Loader2, Radio } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import type { RegisteredVehicle, DimoVehicle, Organization } from '../data/platform-data';
import { VehicleRegistrationModal } from './VehicleRegistrationModal';
import { api } from '@/lib/api';
import type { HmVehicleStatusDto, HmVehicleDto } from '@/lib/api';

function formatDot(dot: string): string {
  if (!dot) return '';
  const d = dot.replace(/\D/g, '');
  if (d.length === 4) return `KW ${d.slice(0, 2)} / ${d.slice(2)}`;
  return dot;
}

function timeAgo(isoString: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'gerade eben';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `vor ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `vor ${diffD}d`;
  const diffW = Math.floor(diffD / 7);
  if (diffW < 5) return `vor ${diffW}w`;
  const diffMo = Math.floor(diffD / 30);
  return `vor ${diffMo} Mon.`;
}

interface PlatformVehiclesViewProps {
  isDarkMode: boolean;
  registeredVehicles: RegisteredVehicle[];
  dimoVehicles: DimoVehicle[];
  organizations: Organization[];
  dimoConnected: boolean;
  onRegisterVehicle: (vehicle: RegisteredVehicle, dimoId: string) => void;
  onUpdateVehicle?: (vehicle: RegisteredVehicle) => void | Promise<void>;
  onDeregisterVehicle?: (vehicleId: string) => Promise<void>;
  onSyncFromDimo?: () => Promise<void>;
  onRefreshSnapshot?: (id: string) => Promise<DimoVehicle>;
  loading?: boolean;
}

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle }> = {
  Available: { color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
  Rented: { color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Car },
  Maintenance: { color: 'bg-orange-50 text-orange-700 border-orange-200', icon: Wrench },
  Blocked: { color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
  Reserved: { color: 'bg-purple-50 text-purple-700 border-purple-200', icon: Car },
};

export function PlatformVehiclesView({ isDarkMode, registeredVehicles, dimoVehicles, organizations, dimoConnected, onRegisterVehicle, onUpdateVehicle, onDeregisterVehicle, onSyncFromDimo, onRefreshSnapshot, loading = false }: PlatformVehiclesViewProps) {
  const [activeTab, setActiveTab] = useState<'registered' | 'unregistered' | 'hm-telemetry'>('registered');
  const [editVehicle, setEditVehicle] = useState<RegisteredVehicle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOrg, setFilterOrg] = useState<string>('all');
  const [registerDimo, setRegisterDimo] = useState<DimoVehicle | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<RegisteredVehicle | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [showDeregisterConfirm, setShowDeregisterConfirm] = useState(false);
  const [deregistering, setDeregistering] = useState(false);
  const [localDimoOverrides, setLocalDimoOverrides] = useState<Record<string, DimoVehicle>>({});
  const [hmStatus, setHmStatus] = useState<HmVehicleStatusDto | null>(null);
  const [hmStatusLoading, setHmStatusLoading] = useState(false);
  const [hmActionLoading, setHmActionLoading] = useState<string | null>(null);
  // HM Telemetry-APP candidates
  const [hmTelemetryCandidates, setHmTelemetryCandidates] = useState<HmVehicleDto[]>([]);
  const [hmTelemetryLoading, setHmTelemetryLoading] = useState(false);
  // VINs that have an approved HM Health-APP record (for badge display in DIMO tab)
  const [hmHealthVinSet, setHmHealthVinSet] = useState<Set<string>>(new Set());

  const effectiveDimoVehicles = dimoVehicles.map(v => localDimoOverrides[v.id] ?? v);

  const loadHmTelemetryCandidates = useCallback(async () => {
    setHmTelemetryLoading(true);
    try {
      const data = await api.highMobility.listTelemetryAppCandidates();
      setHmTelemetryCandidates(data);
    } catch {
      setHmTelemetryCandidates([]);
    } finally {
      setHmTelemetryLoading(false);
    }
  }, []);

  // Load HM Health-APP approved VINs for DIMO tab badge display
  const loadHmHealthVins = useCallback(async () => {
    try {
      const data = await api.highMobility.listVehicles({ packageType: 'HEALTH', clearanceStatus: 'APPROVED' });
      const vins = new Set([...data.health].map((v) => v.vin.toUpperCase()));
      setHmHealthVinSet(vins);
    } catch {
      // non-critical — badges simply won't show
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'hm-telemetry') {
      loadHmTelemetryCandidates();
    }
    if (activeTab === 'unregistered') {
      loadHmHealthVins();
    }
  }, [activeTab, loadHmTelemetryCandidates, loadHmHealthVins]);

  const loadHmStatus = useCallback(async (vehicleId: string) => {
    setHmStatusLoading(true);
    setHmStatus(null);
    try {
      const data = await api.vehicleIntelligence.hmStatus(vehicleId);
      setHmStatus(data);
    } catch {
      setHmStatus(null);
    } finally {
      setHmStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVehicle?.id) {
      loadHmStatus(selectedVehicle.id);
    } else {
      setHmStatus(null);
    }
  }, [selectedVehicle?.id, loadHmStatus]);

  const handleRefreshSnapshot = async (v: DimoVehicle) => {
    if (!onRefreshSnapshot || refreshingId) return;
    setRefreshingId(v.id);
    try {
      const updated = await onRefreshSnapshot(v.id);
      setLocalDimoOverrides(prev => ({ ...prev, [v.id]: updated }));
    } catch {
      // silently ignored – backend logs the error
    } finally {
      setRefreshingId(null);
    }
  };

  const uniqueOrgs = [...new Set(registeredVehicles.map(v => v.organizationName).filter(Boolean))];

  const filteredRegistered = registeredVehicles.filter(v => {
    const q = searchQuery.toLowerCase();
    const name = (v.vehicleName || '').toLowerCase();
    const vin = (v.vin || '').toLowerCase();
    const org = (v.organizationName || '').toLowerCase();
    const plate = (v.licensePlate || '').toLowerCase();
    return (name.includes(q) || vin.includes(q) || org.includes(q) || plate.includes(q))
      && (filterStatus === 'all' || v.status === filterStatus) && (filterOrg === 'all' || v.organizationName === filterOrg);
  });

  const filteredDimo = effectiveDimoVehicles.filter(v => {
    const q = searchQuery.toLowerCase();
    return (v.vin || '').toLowerCase().includes(q) || (v.make || '').toLowerCase().includes(q) || (v.model || '').toLowerCase().includes(q);
  });

  const cardClass = 'bg-card border border-border rounded-lg shadow-xs';

  return (
    <div className="space-y-4 pb-6 relative">
      {loading && (
        <div className="absolute inset-0 bg-white/50 dark:bg-neutral-950/50 z-10 flex items-center justify-center rounded-2xl">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-bold">Loading...</span>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Vehicles</h1>
          <p className="text-sm mt-1 font-medium text-muted-foreground">{registeredVehicles.length} registered · {dimoVehicles.length} from DIMO</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1.5 rounded-lg w-fit bg-muted">
        <button onClick={() => setActiveTab('registered')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'registered' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          Registered Vehicles
        </button>
        <button onClick={() => setActiveTab('unregistered')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'unregistered' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          DIMO
          {effectiveDimoVehicles.length > 0 && <span className="px-2 py-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-lg">{effectiveDimoVehicles.length}</span>}
        </button>
        <button onClick={() => setActiveTab('hm-telemetry')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'hm-telemetry' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          <Radio className="w-3.5 h-3.5" />
          HM Telemetry
          {hmTelemetryCandidates.length > 0 && <span className="px-2 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded-lg">{hmTelemetryCandidates.length}</span>}
        </button>
      </div>

      {/* Summary */}
      {activeTab === 'registered' && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Available', count: registeredVehicles.filter(v => v.status === 'Available').length, color: 'text-green-500', bg: isDarkMode ? 'bg-green-500/10' : 'bg-green-50' },
            { label: 'Rented', count: registeredVehicles.filter(v => v.status === 'Rented').length, color: 'text-blue-500', bg: isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50' },
            { label: 'Maintenance', count: registeredVehicles.filter(v => v.status === 'Maintenance').length, color: 'text-orange-500', bg: isDarkMode ? 'bg-orange-500/10' : 'bg-orange-50' },
            { label: 'Blocked', count: registeredVehicles.filter(v => v.status === 'Blocked').length, color: 'text-red-500', bg: isDarkMode ? 'bg-red-500/10' : 'bg-red-50' },
            { label: 'Reserved', count: registeredVehicles.filter(v => v.status === 'Reserved').length, color: 'text-purple-500', bg: isDarkMode ? 'bg-purple-500/10' : 'bg-purple-50' },
          ].map(s => (
            <div key={s.label} className={`${cardClass} p-4 flex flex-col items-center justify-center text-center`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${s.bg}`}>
                <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
              </div>
              <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className={`${cardClass} p-4`}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-md border bg-muted border-border">
            <Search className={`w-4 h-4 shrink-0 text-muted-foreground`} />
            <input type="text" placeholder={activeTab === 'registered' ? 'Search by name, VIN, plate, or org...' : 'Search by VIN, make, or model...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className={`flex-1 bg-transparent outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground`} />
          </div>
          {activeTab === 'unregistered' && onSyncFromDimo && (
            <button onClick={() => onSyncFromDimo()} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm hover:shadow-md transition-all shrink-0">
              <RefreshCw className="w-5 h-5" /> Sync from DIMO
            </button>
          )}
          {activeTab === 'registered' && (
            <>
              <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)} className={`px-3 py-2 rounded-md border text-sm font-semibold appearance-none cursor-pointer bg-muted border-border text-foreground`}><option value="all">All Organizations</option>{uniqueOrgs.map(o => <option key={o} value={o}>{o}</option>)}</select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={`px-3 py-2 rounded-md border text-sm font-semibold appearance-none cursor-pointer bg-muted border-border text-foreground`}><option value="all">All Status</option><option>Available</option><option>Rented</option><option>Maintenance</option><option>Blocked</option><option>Reserved</option></select>
            </>
          )}
        </div>
      </div>

      {/* REGISTERED TABLE */}
      {activeTab === 'registered' && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className={`border-b border-border bg-muted/50`}>
                <th className={`text-left px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Vehicle</th>
                <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Organization</th>
                <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Status</th>
                <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Health</th>
                <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Station</th>
                <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Signal</th>
              </tr></thead>
              <tbody>
                {filteredRegistered.map(v => {
                  const cfg = statusConfig[v.status] || statusConfig['Available'];
                  const Icon = cfg.icon;
                  return (
                    <tr key={v.id} onClick={() => setSelectedVehicle(v)} className={`border-b border-border last:border-b-0 transition-colors cursor-pointer hover:bg-muted/50 ${selectedVehicle?.id === v.id ? 'bg-accent/50' : ''}`}>
                      <td className="px-5 py-2.5"><div><p className={`text-sm font-semibold text-foreground`}>{v.vehicleName}</p><p className={`text-xs font-mono text-muted-foreground`}>{v.vin}</p></div></td>
                      <td className="px-4 py-2.5"><div className="flex items-center gap-2"><Building2 className={`w-3.5 h-3.5 text-muted-foreground`} /><span className={`text-sm text-foreground`}>{v.organizationName}</span></div></td>
                      <td className="px-4 py-2.5"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cfg.color}`}><Icon className="w-3 h-3" />{v.status}</span></td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${v.health === 'Good' ? 'bg-green-50 text-green-700' : v.health === 'Warning' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{v.health}</span></td>
                      <td className={`px-4 py-2.5 text-sm text-muted-foreground`}>{v.station}</td>
                      <td className="px-4 py-2.5"><div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${v.onlineStatus === 'ONLINE' ? 'bg-green-500' : v.onlineStatus === 'STANDBY' ? 'bg-amber-500' : 'bg-gray-400'}`} /><span className={`text-xs text-muted-foreground`}>{timeAgo(v.lastSignal)}</span></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DIMO VEHICLES TABLE - vehicles from DIMO API available for registration */}
      {activeTab === 'unregistered' && (
        <>
          {filteredDimo.length === 0 ? (
            <div className={`${cardClass} p-12 text-center`}>
              <Zap className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <h3 className={`text-lg font-bold mb-2 text-foreground`}>No DIMO Vehicles Available</h3>
              <p className={`text-sm mb-4 font-medium text-muted-foreground`}>Click Sync from DIMO to load vehicles from the DIMO API.</p>
              {onSyncFromDimo && (
                <button onClick={() => onSyncFromDimo()} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm hover:shadow-md">
                  <RefreshCw className="w-5 h-5" /> Sync from DIMO
                </button>
              )}
            </div>
          ) : (
            <div className={`${cardClass} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className={`border-b border-border bg-muted/50`}>
                    <th className={`text-left px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Vehicle</th>
                    <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>VIN</th>
                    <th className={`text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Odometer</th>
                    <th className={`text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Energy / Fuel</th>
                    <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Signal</th>
                    <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Connection</th>
                    <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>HM</th>
                    <th className="px-4 py-2"></th>
                  </tr></thead>
                  <tbody>
                    {filteredDimo.map(v => {
                      const hasHmHealth = v.vin ? hmHealthVinSet.has(v.vin.toUpperCase()) : false;
                      return (
                      <tr key={v.id} className="border-b border-border last:border-b-0 transition-colors hover:bg-muted/50">
                        <td className="px-5 py-2.5">
                          <p className={`text-sm font-semibold text-foreground`}>{v.make} {v.model} {v.year}</p>
                          {v.powertrainType && <p className={`text-[10px] mt-0.5 font-medium text-muted-foreground`}>{v.powertrainType}</p>}
                        </td>
                        <td className={`px-4 py-2.5 text-sm font-mono ${v.vin ? (isDarkMode ? 'text-gray-400' : 'text-gray-600') : (isDarkMode ? 'text-gray-700' : 'text-gray-300')}`}>
                          {v.vin || '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right text-sm font-medium text-foreground`}>
                          {v.odometer > 0
                            ? v.odometer.toLocaleString('de-DE') + ' km'
                            : <span className={isDarkMode ? 'text-gray-700' : 'text-gray-300'}>—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {v.battery != null ? (
                            <span className={`inline-flex items-center gap-1 text-sm font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                              <Zap className="w-3.5 h-3.5" />{Math.round(v.battery)}%
                            </span>
                          ) : v.fuelLevel != null ? (
                            <span className={`inline-flex items-center gap-1 text-sm font-medium ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                              <Fuel className="w-3.5 h-3.5" />{Math.round(v.fuelLevel)}%
                            </span>
                          ) : (
                            <span className={isDarkMode ? 'text-gray-700' : 'text-gray-300'}>—</span>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-sm text-muted-foreground`}>
                          {timeAgo(v.lastSignal)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${v.connectionStatus === 'Connected' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {v.connectionStatus === 'Connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                            {v.connectionStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${hasHmHealth ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
                            {hasHmHealth ? 'HW + HMH' : 'HW only'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {onRefreshSnapshot && (
                              <button
                                onClick={() => handleRefreshSnapshot(v)}
                                disabled={refreshingId === v.id}
                                title="Snapshot aktualisieren"
                                className="p-1.5 rounded-lg transition-colors hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${refreshingId === v.id ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                            <button onClick={() => setRegisterDimo(v)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl text-xs font-semibold shadow hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all">
                              <Plus className="w-3 h-3" /> Register
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* HM Telemetry-APP Candidates Tab */}
      {activeTab === 'hm-telemetry' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Vehicles with approved HM Telemetry-APP clearance awaiting SynqDrive registration.
              </p>
            </div>
            <button
              onClick={loadHmTelemetryCandidates}
              disabled={hmTelemetryLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${hmTelemetryLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {hmTelemetryLoading ? (
            <div className={`${cardClass} p-12 text-center`}>
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Loading HM Telemetry candidates…</p>
            </div>
          ) : hmTelemetryCandidates.length === 0 ? (
            <div className={`${cardClass} p-12 text-center`}>
              <Radio className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <h3 className="text-lg font-bold mb-2 text-foreground">No HM Telemetry Candidates</h3>
              <p className="text-sm font-medium text-muted-foreground">
                Vehicles will appear here once their HM Telemetry-APP clearance is approved.
              </p>
            </div>
          ) : (
            <div className={`${cardClass} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vehicle / VIN</th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Clearance</th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source Mode</th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Approved At</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {hmTelemetryCandidates.map(v => (
                      <tr key={v.id} className="border-b border-border last:border-b-0 transition-colors hover:bg-muted/50">
                        <td className="px-5 py-2.5">
                          <p className="text-sm font-semibold text-foreground">{v.brand}</p>
                          <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{v.vin}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold border ${
                            v.clearanceStatus === 'APPROVED'
                              ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30'
                              : v.clearanceStatus === 'CLEARANCE_PENDING'
                                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30'
                                : 'bg-muted text-muted-foreground border-border'
                          }`}>
                            {v.clearanceStatus === 'APPROVED' ? <CheckCircle className="w-3 h-3" /> : null}
                            {v.clearanceStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-medium text-muted-foreground">{v.sourceMode}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-muted-foreground">
                            {v.clearanceApprovedAt ? new Date(v.clearanceApprovedAt).toLocaleDateString() : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30">
                            <Radio className="w-3 h-3" />
                            HM Telemetry-APP
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Registration Modal (create) */}
      {registerDimo && (
        <VehicleRegistrationModal
          isDarkMode={isDarkMode}
          isOpen={true}
          onClose={() => setRegisterDimo(null)}
          dimoVehicle={registerDimo}
          organizations={organizations}
          onRegister={(rv) => { onRegisterVehicle(rv, registerDimo.id); setRegisterDimo(null); }}
        />
      )}

      {/* Registration Modal (edit) */}
      {editVehicle && (
        <VehicleRegistrationModal
          isDarkMode={isDarkMode}
          isOpen={true}
          onClose={() => setEditVehicle(null)}
          existingVehicle={editVehicle}
          organizations={organizations}
          onRegister={() => {}}
          onUpdate={(rv) => { onUpdateVehicle?.(rv); setEditVehicle(null); }}
        />
      )}

      {/* === VEHICLE DETAIL DRAWER === */}
      {selectedVehicle && (() => {
        const v = selectedVehicle;
        const cfg = statusConfig[v.status] || statusConfig['Available'];
        const StatusIcon = cfg.icon;
        const sectionClass = 'p-4 rounded-lg border bg-muted/50 border-border';
        const labelClass = `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`;
        const valueClass = `text-sm text-foreground`;
        const sectionTitle = (icon: React.ReactNode, title: string) => (
          <div className="flex items-center gap-2 mb-3">
            {icon}
            <h4 className={`text-sm font-bold text-foreground`}>{title}</h4>
          </div>
        );
        const field = (label: string, value: string | number, mono = false) => (
          <div>
            <p className={labelClass}>{label}</p>
            <p className={`${valueClass} ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
          </div>
        );

        return (
          <div className="fixed inset-y-0 right-0 w-full sm:w-[520px] z-[90] flex" onClick={() => setSelectedVehicle(null)}>
            <div className="flex-1" />
            <div className="w-full sm:w-[520px] h-full border-l border-border shadow-lg overflow-y-auto bg-card" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className={`text-base font-bold text-foreground`}>{v.vehicleName}</h2>
                    <p className={`text-sm mt-0.5 text-muted-foreground`}>{v.make} {v.model} · {v.year}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setSelectedVehicle(null); setEditVehicle(v); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-400 dark:hover:bg-indigo-500/25"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    {onDeregisterVehicle && (
                      <button
                        onClick={() => setShowDeregisterConfirm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                      >
                        <RotateCcw className="w-3 h-3" /> Deregister
                      </button>
                    )}
                    <button onClick={() => setSelectedVehicle(null)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cfg.color}`}><StatusIcon className="w-3 h-3" />{v.status}</span>
                  <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${v.health === 'Good' ? 'bg-green-50 text-green-700' : v.health === 'Warning' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{v.health}</span>
                  {(() => {
                    const os = v.onlineStatus ?? (v.online ? 'ONLINE' : 'OFFLINE');
                    const dc = os === 'ONLINE' ? 'bg-green-500' : os === 'STANDBY' ? 'bg-amber-500' : 'bg-gray-400';
                    const tc = os === 'ONLINE' ? 'text-green-600' : os === 'STANDBY' ? (isDarkMode ? 'text-amber-400' : 'text-amber-600') : (isDarkMode ? 'text-gray-500' : 'text-gray-400');
                    const lb = os === 'ONLINE' ? 'Online' : os === 'STANDBY' ? 'Standby' : 'Offline';
                    return <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${dc}`} /><span className={`text-xs font-semibold ${tc}`}>{lb}</span></div>;
                  })()}
                </div>

                {/* General Information */}
                <div className={sectionClass}>
                  {sectionTitle(<Car className="w-4 h-4 text-indigo-500" />, 'General Information')}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {field('VIN', v.vin, true)}
                    {field('License Plate', v.licensePlate)}
                    {field('Make / Model', `${v.make} ${v.model}`)}
                    {field('Year', v.year)}
                    {field('Vehicle Type', v.vehicleType)}
                    {field('Fuel Type', v.fuelType)}
                    {field('Mileage', `${(v.mileage ?? 0).toLocaleString()} km`)}
                    {field('Curb Weight', v.curbWeight ? `${v.curbWeight} kg` : '—')}
                    {field('Organization', v.organizationName)}
                    {field('Station', v.station)}
                    {field('Op. Status', v.operationalStatus)}
                    {field('Last Signal', v.lastSignal)}
                  </div>
                  {v.notes && <div className="mt-3">{field('Notes', v.notes)}</div>}
                </div>

                {/* Battery */}
                <div className={sectionClass}>
                  {sectionTitle(<Battery className="w-4 h-4 text-green-500" />, 'Battery')}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                    {field('Type', v.batteryType)}
                    {field('Ampere (Ah)', v.batteryAmpere)}
                    {field('Voltage (V)', v.batteryVolt)}
                  </div>
                </div>

                {/* Tires */}
                <div className={sectionClass}>
                  {sectionTitle(<Disc3 className="w-4 h-4 text-amber-500" />, 'Tires')}
                  <div className="space-y-4">
                    {/* Front Axle */}
                    <div>
                      <p className={`text-xs font-bold mb-2 text-muted-foreground`}>Front Axle</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {field('Dimension', v.tireFrontDimension)}
                        {field('Brand / Model', v.tireFrontBrandModel)}
                        {field('Season', v.tireFrontSeason)}
                        {field('DOT', formatDot(v.tireFrontDot))}
                        {field('Load Index', v.tireFrontLoadIndex)}
                        {field('Speed Index', v.tireFrontSpeedIndex)}
                      </div>
                    </div>
                    {/* Back Axle */}
                    <div>
                      <p className={`text-xs font-bold mb-2 text-muted-foreground`}>Rear Axle</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {field('Dimension', v.tireBackDimension)}
                        {field('Brand / Model', v.tireBackBrandModel)}
                        {field('Season', v.tireBackSeason)}
                        {field('DOT', formatDot(v.tireBackDot))}
                        {field('Load Index', v.tireBackLoadIndex)}
                        {field('Speed Index', v.tireBackSpeedIndex)}
                      </div>
                    </div>
                    {/* Tread Depth */}
                    <div>
                      <p className={`text-xs font-bold mb-2 text-muted-foreground`}>Tread Depth (mm)</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {field('FL', v.treadDepthFL)}
                        {field('FR', v.treadDepthFR)}
                        {field('BL', v.treadDepthBL)}
                        {field('BR', v.treadDepthBR)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Brakes */}
                <div className={sectionClass}>
                  {sectionTitle(<Disc3 className="w-4 h-4 text-red-500" />, 'Brakes')}
                  <div className="space-y-4">
                    <div>
                      <p className={`text-xs font-bold mb-2 text-muted-foreground`}>Front Axle</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
                        {field('Rotor Dia. (mm)', v.brakeFrontRotorDiameter)}
                        {field('Rotor Width (mm)', v.brakeFrontRotorWidth)}
                        {field('Pad Thickness (mm)', v.brakeFrontPadThickness)}
                      </div>
                    </div>
                    <div>
                      <p className={`text-xs font-bold mb-2 text-muted-foreground`}>Rear Axle</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
                        {field('Rotor Dia. (mm)', v.brakeBackRotorDiameter)}
                        {field('Rotor Width (mm)', v.brakeBackRotorWidth)}
                        {field('Pad Thickness (mm)', v.brakeBackPadThickness)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Engine & Drivetrain */}
                <div className={sectionClass}>
                  {sectionTitle(<Gauge className="w-4 h-4 text-purple-500" />, 'Engine & Drivetrain')}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {field('Drivetrain', v.drivetrain)}
                    {field('Idle RPM', v.idleRpm)}
                    {field('Max RPM', v.maxRpm)}
                    {field('Brake Force Dist.', v.brakeForceDistribution)}
                    {field('Weight Dist. (F/R)', v.frontToRearWeightDistribution)}
                    {field('Service Intervals', v.serviceIntervals)}
                  </div>
                </div>

                {/* Service History */}
                <div className={sectionClass}>
                  {sectionTitle(<ClipboardList className="w-4 h-4 text-blue-500" />, 'Service History')}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {field('Last TÜV', v.lastTuev)}
                    {field('Last BOKraft', v.lastBokraft)}
                    {field('Last Inspection', v.lastInspection)}
                    {field('Last Oil Change', v.lastOilChange)}
                    {field('Last Brake Pad Change', v.lastBrakePadChange)}
                    {field('Last Brake Rotor Change', v.lastBrakeRotorChange)}
                  </div>
                </div>

                {/* === HIGH MOBILITY SECTION === */}
                <div className={sectionClass}>
                  {sectionTitle(<Shield className="w-4 h-4 text-purple-500" />, 'High Mobility')}
                  {hmStatusLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading HM status…
                    </div>
                  ) : hmStatus ? (
                    <div className="space-y-3">
                      {/* State Badge + OEM path badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                          hmStatus.state === 'LINKED_ACTIVE' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20' :
                          hmStatus.state === 'APPROVED' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' :
                          hmStatus.state === 'CLEARANCE_PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' :
                          hmStatus.state === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' :
                          hmStatus.state === 'ERROR' ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20' :
                          'bg-muted text-muted-foreground border-border'
                        }`}>
                          <Shield className="w-3 h-3" />
                          {hmStatus.state === 'LINKED_ACTIVE' ? 'Active' :
                           hmStatus.state === 'NOT_CONFIGURED' ? 'Not Configured' :
                           hmStatus.state === 'CLEARANCE_PENDING' ? 'Pending Approval' :
                           hmStatus.state === 'APPROVED' ? 'Approved' :
                           hmStatus.state === 'ELIGIBLE' ? 'Eligible' :
                           hmStatus.state === 'REJECTED' ? 'Rejected' :
                           hmStatus.state === 'REVOKED' ? 'Revoked' :
                           hmStatus.state === 'ERROR' ? 'Error' : hmStatus.state}
                        </span>
                        {hmStatus.clearanceStatus && hmStatus.state !== 'LINKED_ACTIVE' && (
                          <span className="text-xs text-muted-foreground">{hmStatus.clearanceStatus}</span>
                        )}
                        {/* OEM path label */}
                        {hmStatus.oemPath === 'DIRECT_FLEET_CLEARANCE' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                            Direct Clearance
                          </span>
                        )}
                      </div>

                      {/* OEM routing note — shown for VW Group / Porsche in NOT_CONFIGURED state */}
                      {hmStatus.routingNote && hmStatus.state === 'NOT_CONFIGURED' && (
                        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 dark:bg-violet-900/20 dark:border-violet-800/40 text-xs text-violet-700 dark:text-violet-300">
                          <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{hmStatus.routingNote}</span>
                        </div>
                      )}

                      {/* Clearance pending / rejected reason note */}
                      {hmStatus.state === 'CLEARANCE_PENDING' && (
                        <p className="text-xs text-muted-foreground">
                          Waiting for provider approval. Refresh to check for updates.
                        </p>
                      )}
                      {hmStatus.state === 'REJECTED' && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          Fleet clearance was rejected by the provider.
                        </p>
                      )}

                      {/* Fields */}
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                        {hmStatus.linkedAt && (
                          <div>
                            <p className={labelClass}>Linked At</p>
                            <p className={valueClass}>{new Date(hmStatus.linkedAt).toLocaleDateString()}</p>
                          </div>
                        )}
                        {hmStatus.lastCheckedAt && (
                          <div>
                            <p className={labelClass}>Last Checked</p>
                            <p className={valueClass}>{new Date(hmStatus.lastCheckedAt).toLocaleDateString()}</p>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 flex-wrap pt-1">

                        {/* ELIGIBILITY-FIRST brands: Check Eligibility */}
                        {hmStatus.canCheckEligibility && (
                          <button
                            disabled={!!hmActionLoading}
                            onClick={async () => {
                              setHmActionLoading('eligibility');
                              try {
                                await api.vehicleIntelligence.hmCheckEligibility(v.id);
                                await loadHmStatus(v.id);
                              } catch { /* silent */ }
                              setHmActionLoading(null);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted hover:bg-muted/70 text-foreground disabled:opacity-50 transition-colors"
                          >
                            {hmActionLoading === 'eligibility' && <Loader2 className="w-3 h-3 animate-spin" />}
                            Check Eligibility
                          </button>
                        )}

                        {/* DIRECT_FLEET_CLEARANCE brands: Start Activation (VW Group, Porsche) */}
                        {hmStatus.canRequestDirectClearance && (
                          <button
                            disabled={!!hmActionLoading}
                            onClick={async () => {
                              setHmActionLoading('directClearance');
                              try {
                                const result = await api.vehicleIntelligence.hmRequestDirectClearance(v.id);
                                if (result.status) setHmStatus(result.status);
                                else await loadHmStatus(v.id);
                              } catch { /* silent */ }
                              setHmActionLoading(null);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors"
                          >
                            {hmActionLoading === 'directClearance' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                            Start Activation
                          </button>
                        )}

                        {hmStatus.canActivate && (
                          <button
                            disabled={!!hmActionLoading}
                            onClick={async () => {
                              setHmActionLoading('activate');
                              try {
                                await api.vehicleIntelligence.hmActivateHealth(v.id);
                                await loadHmStatus(v.id);
                              } catch { /* silent */ }
                              setHmActionLoading(null);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 transition-colors"
                          >
                            {hmActionLoading === 'activate' && <Loader2 className="w-3 h-3 animate-spin" />}
                            Activate HM Health
                          </button>
                        )}
                        {hmStatus.canRefresh && (
                          <button
                            disabled={!!hmActionLoading}
                            onClick={async () => {
                              setHmActionLoading('refresh');
                              try {
                                const updated = await api.vehicleIntelligence.hmRefreshStatus(v.id);
                                setHmStatus(updated as HmVehicleStatusDto);
                              } catch { /* silent */ }
                              setHmActionLoading(null);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted hover:bg-muted/70 text-foreground disabled:opacity-50 transition-colors"
                          >
                            {hmActionLoading === 'refresh' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            Refresh
                          </button>
                        )}
                        {hmStatus.canDeactivate && (
                          <button
                            disabled={!!hmActionLoading}
                            onClick={async () => {
                              setHmActionLoading('deactivate');
                              try {
                                await api.vehicleIntelligence.hmDeactivate(v.id);
                                await loadHmStatus(v.id);
                              } catch { /* silent */ }
                              setHmActionLoading(null);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-400 disabled:opacity-50 transition-colors"
                          >
                            {hmActionLoading === 'deactivate' && <Loader2 className="w-3 h-3 animate-spin" />}
                            Deactivate
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">HM status unavailable</p>
                  )}
                </div>
              </div>

              {/* Deregister Confirmation Modal */}
              {showDeregisterConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => !deregistering && setShowDeregisterConfirm(false)}>
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
                  <div onClick={e => e.stopPropagation()} className="relative w-full max-w-md bg-card border border-border rounded-xl p-5 shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-red-500/10' : 'bg-red-50'}`}>
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">Deregister Vehicle</h3>
                        <p className={`text-xs text-muted-foreground`}>{v.vehicleName}</p>
                      </div>
                    </div>
                    <div className="rounded-lg p-3 mb-4 bg-muted">
                      <p className={`text-xs leading-relaxed text-foreground`}>
                        This will remove the vehicle from the SynqDrive registration and clean up all associated registration data (license plate, assignments, health tracking, operational data).
                      </p>
                      <p className={`text-xs leading-relaxed mt-2 text-foreground`}>
                        The underlying DIMO vehicle identity is preserved. The vehicle will reappear in <strong>Non Registered Vehicles</strong> and can be registered again.
                      </p>
                    </div>
                    <div className={`rounded-xl p-3 mb-5 text-xs ${isDarkMode ? 'bg-amber-500/5 border border-amber-500/10 text-amber-300' : 'bg-amber-50 border border-amber-100 text-amber-800'}`}>
                      <strong>VIN:</strong> {v.vin} &nbsp;·&nbsp; <strong>Plate:</strong> {v.licensePlate || '—'} &nbsp;·&nbsp; <strong>Org:</strong> {v.organizationName || v.organizationId}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setShowDeregisterConfirm(false)}
                        disabled={deregistering}
                        className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors text-muted-foreground hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          setDeregistering(true);
                          try {
                            await onDeregisterVehicle!(v.id);
                            setShowDeregisterConfirm(false);
                            setSelectedVehicle(null);
                          } catch { /* error handled in parent */ }
                          setDeregistering(false);
                        }}
                        disabled={deregistering}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {deregistering && <RefreshCw className="w-3 h-3 animate-spin" />}
                        Confirm Deregister
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}