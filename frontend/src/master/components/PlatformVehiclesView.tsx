import { Car, Search, Building2, CheckCircle, AlertTriangle, Wrench, Wifi, WifiOff, Plus, Zap, Battery, Disc3, Gauge, ClipboardList, Fuel, RefreshCw, RotateCcw, Pencil, Shield, Loader2, Radio, Camera } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import type { RegisteredVehicle, DimoVehicle, Organization } from '../data/platform-data';
import { VehicleRegistrationModal } from './VehicleRegistrationModal';
import { ExteriorImagesEditor } from './ExteriorImagesEditor';
import { api } from '@/lib/api';
import type { HmVehicleStatusDto, HmVehicleDto } from '@/lib/api';
import {
  PageHeader,
  MetricCard,
  DataCard,
  DataTable,
  StatusChip,
  StatusDot,
  HealthStatusChip,
  EmptyState,
  DetailDrawer,
  ConfirmDialog,
  fleetVehicleStatusTone,
  onlineSignalTone,
  hmVehicleStateTone,
  hmClearanceTone,
} from '../../components/patterns';
import type { DataTableColumn } from '../../components/patterns';

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  Available: CheckCircle,
  Rented: Car,
  Maintenance: Wrench,
  Blocked: AlertTriangle,
  Reserved: Car,
  'Active Rented': Car,
};

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

  const cardClass = 'surface-premium';

  const registeredColumns: DataTableColumn<RegisteredVehicle>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle',
      cell: (v) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{v.vehicleName}</p>
          <p className="font-mono text-xs text-muted-foreground">{v.vin}</p>
        </div>
      ),
    },
    {
      key: 'org',
      header: 'Organization',
      cell: (v) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm text-foreground">{v.organizationName}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (v) => {
        const Icon = STATUS_ICONS[v.status] ?? Car;
        return (
          <StatusChip tone={fleetVehicleStatusTone(v.status)} className="!text-xs">
            <Icon className="h-3 w-3" />
            {v.status}
          </StatusChip>
        );
      },
    },
    {
      key: 'health',
      header: 'Health',
      cell: (v) => <HealthStatusChip state={v.health} label={v.health} className="!text-xs" />,
    },
    {
      key: 'station',
      header: 'Station',
      cell: (v) => <span className="text-sm text-muted-foreground">{v.station}</span>,
    },
    {
      key: 'signal',
      header: 'Signal',
      cell: (v) => (
        <div className="flex items-center gap-1.5">
          <StatusDot tone={onlineSignalTone(v.onlineStatus ?? (v.online ? 'ONLINE' : 'OFFLINE'))} />
          <span className="text-xs text-muted-foreground">{timeAgo(v.lastSignal)}</span>
        </div>
      ),
    },
  ];

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
      <PageHeader
        title="Vehicles"
        icon={<Car className="h-4 w-4" />}
      />

      <div className="sq-tab-bar flex w-fit gap-1 rounded-lg p-1.5 bg-muted">
        <button onClick={() => setActiveTab('registered')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'registered' ? 'surface-premium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          Registered Vehicles
        </button>
        <button onClick={() => setActiveTab('unregistered')} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'unregistered' ? 'surface-premium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          DIMO
          {effectiveDimoVehicles.length > 0 && (
            <StatusChip tone="info" className="!text-[10px] !py-0.5">
              {effectiveDimoVehicles.length}
            </StatusChip>
          )}
        </button>
        <button onClick={() => setActiveTab('hm-telemetry')} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'hm-telemetry' ? 'surface-premium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          <Radio className="h-3.5 w-3.5" />
          HM Telemetry
          {hmTelemetryCandidates.length > 0 && (
            <StatusChip tone="watch" className="!text-[10px] !py-0.5">
              {hmTelemetryCandidates.length}
            </StatusChip>
          )}
        </button>
      </div>

      {/* Summary */}
      {activeTab === 'registered' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            { label: 'Available', count: registeredVehicles.filter((v) => v.status === 'Available').length, tone: 'success' as const },
            { label: 'Active Rented', count: registeredVehicles.filter((v) => v.status === 'Active Rented').length, tone: 'info' as const },
            { label: 'Maintenance', count: registeredVehicles.filter((v) => v.status === 'Maintenance').length, tone: 'warning' as const },
            { label: 'Blocked', count: registeredVehicles.filter((v) => v.status === 'Blocked').length, tone: 'critical' as const },
            { label: 'Reserved', count: registeredVehicles.filter((v) => v.status === 'Reserved').length, tone: 'watch' as const },
            { label: 'Unknown', count: registeredVehicles.filter((v) => v.status === 'Unknown').length, tone: 'neutral' as const },
          ].map((s) => (
            <MetricCard key={s.label} label={s.label} value={s.count} status={s.tone} />
          ))}
        </div>
      )}

      {/* Filters */}
      <DataCard flush bodyClassName="p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input type="text" placeholder={activeTab === 'registered' ? 'Search by name, VIN, plate, or org...' : 'Search by VIN, make, or model...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground" />
          </div>
          {activeTab === 'unregistered' && onSyncFromDimo && (
            <button type="button" onClick={() => onSyncFromDimo()} className="sq-cta inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold">
              <RefreshCw className="h-5 w-5" /> Sync from DIMO
            </button>
          )}
          {activeTab === 'registered' && (
            <>
              <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)} className={`px-3 py-2 rounded-md border text-sm font-semibold appearance-none cursor-pointer bg-muted border-border text-foreground`}><option value="all">All Organizations</option>{uniqueOrgs.map(o => <option key={o} value={o}>{o}</option>)}</select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={`px-3 py-2 rounded-md border text-sm font-semibold appearance-none cursor-pointer bg-muted border-border text-foreground`}><option value="all">All Status</option><option>Available</option><option>Rented</option><option>Maintenance</option><option>Blocked</option><option>Reserved</option><option>Unknown</option></select>
            </>
          )}
        </div>
      </DataCard>

      {activeTab === 'registered' && (
        <DataTable
          columns={registeredColumns}
          rows={filteredRegistered}
          getRowKey={(v) => v.id}
          onRowClick={setSelectedVehicle}
          getRowClassName={(v) => (selectedVehicle?.id === v.id ? 'bg-accent/50' : undefined)}
          empty="No registered vehicles match your filters"
        />
      )}

      {/* DIMO VEHICLES TABLE - vehicles from DIMO API available for registration */}
      {activeTab === 'unregistered' && (
        <>
          {filteredDimo.length === 0 ? (
            <EmptyState
              icon={<Zap className="h-12 w-12" />}
              title="No DIMO Vehicles Available"
              description="Click Sync from DIMO to load vehicles from the DIMO API."
              action={
                onSyncFromDimo ? (
                  <button type="button" onClick={() => onSyncFromDimo()} className="sq-cta inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold">
                    <RefreshCw className="h-5 w-5" /> Sync from DIMO
                  </button>
                ) : undefined
              }
            />
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
                        <td className={`px-4 py-2.5 text-sm font-mono ${v.vin ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
                          {v.vin || '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right text-sm font-medium text-foreground`}>
                          {v.odometer > 0
                            ? v.odometer.toLocaleString('de-DE') + ' km'
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {v.battery != null ? (
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--status-positive)]">
                              <Zap className="w-3.5 h-3.5" />{Math.round(v.battery)}%
                            </span>
                          ) : v.fuelLevel != null ? (
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--status-watch)]">
                              <Fuel className="w-3.5 h-3.5" />{Math.round(v.fuelLevel)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-sm text-muted-foreground`}>
                          {timeAgo(v.lastSignal)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusChip tone={v.connectionStatus === 'Connected' ? 'success' : 'neutral'} className="!text-xs">
                            {v.connectionStatus === 'Connected' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                            {v.connectionStatus}
                          </StatusChip>
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusChip tone={hasHmHealth ? 'ai' : 'neutral'} className="!text-[10px]">
                            {hasHmHealth ? 'HW + HMH' : 'HW only'}
                          </StatusChip>
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
                            <button type="button" onClick={() => setRegisterDimo(v)} className="sq-cta flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold">
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
            <EmptyState
              icon={<Radio className="h-12 w-12" />}
              title="No HM Telemetry Candidates"
              description="Vehicles will appear here once their HM Telemetry-APP clearance is approved."
            />
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
                          <StatusChip tone={hmClearanceTone(v.clearanceStatus)} className="!text-xs">
                            {v.clearanceStatus === 'APPROVED' ? <CheckCircle className="h-3 w-3" /> : null}
                            {v.clearanceStatus}
                          </StatusChip>
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
                          <StatusChip tone="watch" className="!text-[10px]">
                            <Radio className="h-3 w-3" />
                            HM Telemetry-APP
                          </StatusChip>
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

      <DetailDrawer
        open={!!selectedVehicle}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedVehicle(null);
            setShowDeregisterConfirm(false);
          }
        }}
        title={selectedVehicle?.vehicleName ?? ''}
        description={
          selectedVehicle
            ? `${selectedVehicle.make} ${selectedVehicle.model} · ${selectedVehicle.year}`
            : undefined
        }
        widthClassName="sm:max-w-[520px]"
        status={
          selectedVehicle ? (
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const StatusIcon = STATUS_ICONS[selectedVehicle.status] ?? Car;
                const os = selectedVehicle.onlineStatus ?? (selectedVehicle.online ? 'ONLINE' : 'OFFLINE');
                const lb = os === 'ONLINE' ? 'Online' : os === 'STANDBY' ? 'Standby' : 'Offline';
                return (
                  <>
                    <StatusChip tone={fleetVehicleStatusTone(selectedVehicle.status)} className="!text-xs">
                      <StatusIcon className="h-3 w-3" />
                      {selectedVehicle.status}
                    </StatusChip>
                    <HealthStatusChip state={selectedVehicle.health} label={selectedVehicle.health} className="!text-xs" />
                    <StatusChip tone={onlineSignalTone(os)} dot className="!text-xs">
                      {lb}
                    </StatusChip>
                  </>
                );
              })()}
            </div>
          ) : undefined
        }
        footer={
          selectedVehicle ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditVehicle(selectedVehicle);
                  setSelectedVehicle(null);
                }}
                className="sq-press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              {onDeregisterVehicle && (
                <button
                  type="button"
                  onClick={() => setShowDeregisterConfirm(true)}
                  className="sq-press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[color:var(--status-critical)]"
                >
                  <RotateCcw className="h-3 w-3" /> Deregister
                </button>
              )}
            </div>
          ) : undefined
        }
      >
        {selectedVehicle && (() => {
        const v = selectedVehicle;
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
          <div className="space-y-5">
                {/* General Information */}
                <div className={sectionClass}>
                  {sectionTitle(<Car className="w-4 h-4 text-muted-foreground" />, 'General Information')}
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
                  {sectionTitle(<Battery className="w-4 h-4 text-muted-foreground" />, 'Battery')}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                    {field('Type', v.batteryType)}
                    {field('Ampere (Ah)', v.batteryAmpere)}
                    {field('Voltage (V)', v.batteryVolt)}
                  </div>
                </div>

                {/* Tires */}
                <div className={sectionClass}>
                  {sectionTitle(<Disc3 className="w-4 h-4 text-muted-foreground" />, 'Tires')}
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
                  {sectionTitle(<Disc3 className="w-4 h-4 text-muted-foreground" />, 'Brakes')}
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
                  {sectionTitle(<Gauge className="w-4 h-4 text-muted-foreground" />, 'Engine & Drivetrain')}
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
                  {sectionTitle(<ClipboardList className="w-4 h-4 text-muted-foreground" />, 'Service History')}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {field('Last TÜV', v.lastTuev)}
                    {field('Last BOKraft', v.lastBokraft)}
                    {field('Last Inspection', v.lastInspection)}
                    {field('Last Oil Change', v.lastOilChange)}
                    {field('Last Brake Pad Change', v.lastBrakePadChange)}
                    {field('Last Brake Rotor Change', v.lastBrakeRotorChange)}
                  </div>
                </div>

                {/* Exterior Photos (Damage Map) — V4.7.50 */}
                <div className={sectionClass}>
                  {sectionTitle(<Camera className="w-4 h-4 text-muted-foreground" />, 'Exterior Photos')}
                  <ExteriorImagesEditor
                    isDarkMode={isDarkMode}
                    vehicleId={v.id}
                    vehicleMake={v.make}
                    vehicleModel={v.model}
                    title="Damage map photos"
                    subtitle="Front, left, right, rear and roof — drives the Rental damage map carousel for this vehicle."
                  />
                </div>

                {/* === HIGH MOBILITY SECTION === */}
                <div className={sectionClass}>
                  {sectionTitle(<Shield className="w-4 h-4 text-muted-foreground" />, 'High Mobility')}
                  {hmStatusLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading HM status…
                    </div>
                  ) : hmStatus ? (
                    <div className="space-y-3">
                      {/* State Badge + OEM path badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusChip tone={hmVehicleStateTone(hmStatus.state)} className="!text-xs">
                          <Shield className="h-3 w-3" />
                          {hmStatus.state === 'LINKED_ACTIVE' ? 'Active' :
                           hmStatus.state === 'NOT_CONFIGURED' ? 'Not Configured' :
                           hmStatus.state === 'CLEARANCE_PENDING' ? 'Pending Approval' :
                           hmStatus.state === 'APPROVED' ? 'Approved' :
                           hmStatus.state === 'ELIGIBLE' ? 'Eligible' :
                           hmStatus.state === 'REJECTED' ? 'Rejected' :
                           hmStatus.state === 'REVOKED' ? 'Revoked' :
                           hmStatus.state === 'ERROR' ? 'Error' : hmStatus.state}
                        </StatusChip>
                        {hmStatus.clearanceStatus && hmStatus.state !== 'LINKED_ACTIVE' && (
                          <span className="text-xs text-muted-foreground">{hmStatus.clearanceStatus}</span>
                        )}
                        {/* OEM path label */}
                        {hmStatus.oemPath === 'DIRECT_FLEET_CLEARANCE' && (
                          <StatusChip tone="ai" className="!text-[10px]">
                            Direct Clearance
                          </StatusChip>
                        )}
                      </div>

                      {/* OEM routing note — shown for VW Group / Porsche in NOT_CONFIGURED state */}
                      {hmStatus.routingNote && hmStatus.state === 'NOT_CONFIGURED' && (
                        <div className="sq-tone-ai flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
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
                        <p className="text-xs text-[color:var(--status-critical)]">
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
                            className="sq-cta flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
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
                            className="sq-cta flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
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
                            className="sq-press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[color:var(--status-critical)] disabled:opacity-50"
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
        );
      })()}
      </DetailDrawer>

      <ConfirmDialog
        open={showDeregisterConfirm && !!selectedVehicle}
        onOpenChange={(open) => { if (!open && !deregistering) setShowDeregisterConfirm(false); }}
        title="Deregister Vehicle"
        description={selectedVehicle ? selectedVehicle.vehicleName : undefined}
        confirmLabel={deregistering ? 'Deregistering…' : 'Confirm Deregister'}
        cancelLabel="Cancel"
        tone="critical"
        loading={deregistering}
        onConfirm={async () => {
          if (!selectedVehicle || !onDeregisterVehicle) return;
          setDeregistering(true);
          try {
            await onDeregisterVehicle(selectedVehicle.id);
            setShowDeregisterConfirm(false);
            setSelectedVehicle(null);
          } catch { /* error handled in parent */ }
          setDeregistering(false);
        }}
      >
        {selectedVehicle && (
          <>
            <div className="mb-4 rounded-lg bg-muted p-3">
              <p className="text-xs leading-relaxed text-foreground">
                This will remove the vehicle from the SynqDrive registration and clean up all associated registration data (license plate, assignments, health tracking, operational data).
              </p>
              <p className="mt-2 text-xs leading-relaxed text-foreground">
                The underlying DIMO vehicle identity is preserved. The vehicle will reappear in <strong>Non Registered Vehicles</strong> and can be registered again.
              </p>
            </div>
            <div className="sq-tone-watch rounded-xl border border-border p-3 text-xs">
              <strong>VIN:</strong> {selectedVehicle.vin} &nbsp;·&nbsp; <strong>Plate:</strong> {selectedVehicle.licensePlate || '—'} &nbsp;·&nbsp; <strong>Org:</strong> {selectedVehicle.organizationName || selectedVehicle.organizationId}
            </div>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}