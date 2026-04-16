import { useState, useEffect, useCallback } from 'react';
import {
  Radio, Search, RefreshCw, Plus, Trash2, CheckCircle2, XCircle,
  Clock, AlertTriangle, ChevronDown, ChevronUp, Loader2, Shield,
  Activity, Filter, Eye, Link2, Zap, Package, RotateCcw,
  Wifi, WifiOff, Database, Terminal, Signal, SignalLow
} from 'lucide-react';
import { api } from '../../lib/api';
import type {
  HmVehicleDto, HmVehicleListDto, HmEligibilityResultDto, HmPackageType,
  HmClearanceStatus, HmSourceMode, HmEligibilityStatus, HmDeliveryMode,
  HmStatusHistoryDto, HmRegistrationState, HmStreamingState,
  HmMqttConnectionState, HmMqttConsumerStatusDto, HmStreamSyncLogDto,
  HmStreamingReadinessDto
} from '../../lib/api';
import { toast } from 'sonner';

// ── Status badge helpers ────────────────────────────────────────────────────

const CLEARANCE_CONFIG: Record<HmClearanceStatus, { label: string; color: string }> = {
  DRAFT:             { label: 'Draft',             color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  CLEARANCE_PENDING: { label: 'Pending Clearance', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  APPROVED:          { label: 'Approved',          color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  REJECTED:          { label: 'Rejected',          color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  ERROR:             { label: 'Error',             color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  REVOKING:          { label: 'Revoking',          color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' },
  REVOKED:           { label: 'Revoked',           color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
  CANCELED:          { label: 'Canceled',          color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
};

const ELIGIBILITY_CONFIG: Record<HmEligibilityStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  UNKNOWN:    { label: 'Unknown',     color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500', icon: Clock },
  PENDING:    { label: 'Checking…',  color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400', icon: Loader2 },
  ELIGIBLE:   { label: 'Eligible',   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', icon: CheckCircle2 },
  INELIGIBLE: { label: 'Ineligible', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', icon: XCircle },
  ERROR:      { label: 'Error',      color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400', icon: AlertTriangle },
};

function ClearanceBadge({ status }: { status: HmClearanceStatus }) {
  const cfg = CLEARANCE_CONFIG[status] ?? CLEARANCE_CONFIG.DRAFT;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function EligibilityBadge({ status }: { status: HmEligibilityStatus }) {
  const cfg = ELIGIBILITY_CONFIG[status] ?? ELIGIBILITY_CONFIG.UNKNOWN;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function DeliveryBadge({ mode }: { mode: HmDeliveryMode | null }) {
  if (!mode) return <span className="text-xs text-muted-foreground">—</span>;
  const color = mode === 'BOTH' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400'
    : mode === 'PUSH' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
    : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${color}`}>
      {mode}
    </span>
  );
}

function PackageBadge({ pkg }: { pkg: HmPackageType }) {
  return pkg === 'HEALTH'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400"><Activity className="w-3 h-3" />Health</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400"><Zap className="w-3 h-3" />Full Telemetry</span>;
}

// Phase 2 badges
const REGISTRATION_STATE_CONFIG: Record<HmRegistrationState, { label: string; color: string }> = {
  NOT_REGISTERED:      { label: 'Not Registered',    color: 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-500' },
  REGISTRATION_PENDING:{ label: 'Reg. Pending',       color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  REGISTERED:          { label: 'Registered',         color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  REGISTRATION_FAILED: { label: 'Reg. Failed',        color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
};

function RegistrationStateBadge({ state }: { state: HmRegistrationState }) {
  const cfg = REGISTRATION_STATE_CONFIG[state] ?? REGISTRATION_STATE_CONFIG.NOT_REGISTERED;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

const STREAMING_STATE_CONFIG: Record<HmStreamingState, { label: string; color: string; icon: typeof Wifi }> = {
  NOT_CONFIGURED: { label: 'Not Configured', color: 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-500', icon: WifiOff },
  CONFIGURED:     { label: 'Configured',     color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400', icon: Signal },
  CONNECTING:     { label: 'Connecting',     color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400', icon: Loader2 },
  CONNECTED:      { label: 'Streaming',      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', icon: Wifi },
  DISCONNECTED:   { label: 'Disconnected',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400', icon: WifiOff },
  ERROR:          { label: 'Stream Error',   color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', icon: AlertTriangle },
};

function StreamingStateBadge({ state }: { state: HmStreamingState }) {
  const cfg = STREAMING_STATE_CONFIG[state] ?? STREAMING_STATE_CONFIG.NOT_CONFIGURED;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

const MQTT_STATE_CONFIG: Record<HmMqttConnectionState, { label: string; color: string; icon: typeof Wifi }> = {
  DISABLED:     { label: 'Disabled',     color: 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-500', icon: WifiOff },
  DISCONNECTED: { label: 'Disconnected', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400', icon: WifiOff },
  CONNECTING:   { label: 'Connecting',   color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400', icon: Loader2 },
  CONNECTED:    { label: 'Connected',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', icon: Wifi },
  ERROR:        { label: 'Error',        color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', icon: AlertTriangle },
};

function MqttStateBadge({ state }: { state: HmMqttConnectionState }) {
  const cfg = MQTT_STATE_CONFIG[state] ?? MQTT_STATE_CONFIG.DISCONNECTED;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ── Vehicle card (row) ──────────────────────────────────────────────────────

function VehicleRow({
  vehicle,
  isDarkMode,
  onRefresh,
  onRemove,
  onFetchHealth,
  onViewHistory,
}: {
  vehicle: HmVehicleDto;
  isDarkMode: boolean;
  onRefresh: (id: string) => Promise<void>;
  onRemove: (id: string, vin: string) => Promise<void>;
  onFetchHealth: (id: string) => Promise<void>;
  onViewHistory: (vehicle: HmVehicleDto) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE') : '—';

  const handleRefresh = async () => {
    setLoading('refresh');
    try { await onRefresh(vehicle.id); } finally { setLoading(null); }
  };
  const handleFetchHealth = async () => {
    setLoading('health');
    try { await onFetchHealth(vehicle.id); } finally { setLoading(null); }
  };
  const handleRemove = async () => {
    if (!confirmRemove) { setConfirmRemove(true); return; }
    setLoading('remove');
    try { await onRemove(vehicle.id, vehicle.vin); } finally { setLoading(null); setConfirmRemove(false); }
  };

  const rowBg = isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200';
  const mutedFg = isDarkMode ? 'text-neutral-500' : 'text-gray-400';

  return (
    <div className={`rounded-xl border ${rowBg} overflow-hidden`}>
      {/* Main row */}
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
        {/* VIN + brand */}
        <div className="flex-1 min-w-[180px]">
          <div className="text-sm font-mono font-semibold tracking-wide">{vehicle.vin}</div>
          <div className={`text-xs mt-0.5 ${mutedFg}`}>{vehicle.brand}</div>
        </div>

        {/* Package */}
        <PackageBadge pkg={vehicle.packageType} />

        {/* Eligibility */}
        <EligibilityBadge status={vehicle.eligibilityStatus} />

        {/* Delivery mode */}
        <DeliveryBadge mode={vehicle.eligibilityDeliveryMode} />

        {/* Clearance */}
        <ClearanceBadge status={vehicle.clearanceStatus} />

        {/* Link state */}
        {vehicle.isLinked ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            <Link2 className="w-3 h-3" />Linked
          </span>
        ) : (
          <span className={`text-xs ${mutedFg}`}>Not linked</span>
        )}

        {/* Source mode / app container domain */}
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
          vehicle.sourceMode === 'HM_ONLY'
            ? isDarkMode ? 'bg-violet-900/40 text-violet-400' : 'bg-violet-100 text-violet-700'
            : isDarkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-gray-100 text-gray-500'
        }`}>
          {vehicle.sourceMode === 'DIMO_PLUS_HM'
            ? (vehicle.packageType === 'HEALTH' ? 'DIMO + HMH' : 'DIMO + HM')
            : (vehicle.packageType === 'FULL_TELEMETRY' ? 'HM Telemetry' : 'HM Health')}
        </span>

        {/* Phase 2: Registration state (HM_ONLY) */}
        {vehicle.sourceMode === 'HM_ONLY' && (
          <RegistrationStateBadge state={vehicle.registrationState ?? 'NOT_REGISTERED'} />
        )}

        {/* Phase 2: Streaming state (FULL_TELEMETRY only) */}
        {vehicle.packageType === 'FULL_TELEMETRY' && (
          <StreamingStateBadge state={vehicle.streamingState ?? 'NOT_CONFIGURED'} />
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => onViewHistory(vehicle)}
            className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-500'}`}
            title="Status history"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading === 'refresh'}
            className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-500'}`}
            title="Refresh status"
          >
            {loading === 'refresh' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          {vehicle.clearanceStatus === 'APPROVED' && (
            <button
              onClick={handleFetchHealth}
              disabled={loading === 'health'}
              className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-teal-400' : 'hover:bg-gray-100 text-teal-600'}`}
              title="Fetch health data"
            >
              {loading === 'health' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
            </button>
          )}
          {confirmRemove ? (
            <>
              <button
                onClick={handleRemove}
                disabled={loading === 'remove'}
                className="px-2 py-1 rounded-lg text-[11px] font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 transition-colors"
              >
                Confirm
              </button>
              <button onClick={() => setConfirmRemove(false)} className="px-2 py-1 rounded-lg text-[11px] font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-400 transition-colors">
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={handleRemove}
              className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-red-400' : 'hover:bg-gray-100 text-red-500'}`}
              title="Remove vehicle"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setExpanded(e => !e)} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className={`px-4 py-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs ${isDarkMode ? 'border-neutral-800 bg-neutral-950' : 'border-gray-100 bg-gray-50'}`}>
          <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Created</div>{fmt(vehicle.createdAt)}</div>
          <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Clearance Requested</div>{fmt(vehicle.clearanceRequestedAt)}</div>
          <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Approved At</div>{fmt(vehicle.clearanceApprovedAt)}</div>
          <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Last Status Check</div>{fmt(vehicle.clearanceLastCheckedAt)}</div>
          <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Linked At</div>{fmt(vehicle.linkedAt)}</div>
          <div><div className={`font-medium mb-0.5 ${mutedFg}`}>SynqDrive Vehicle ID</div><span className="font-mono">{vehicle.synqdriveVehicleId ?? '—'}</span></div>
          <div><div className={`font-medium mb-0.5 ${mutedFg}`}>HM Reference</div><span className="font-mono">{vehicle.hmVehicleReference ?? '—'}</span></div>
          <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Eligibility Checked</div>{fmt(vehicle.eligibilityCheckedAt)}</div>
          {/* Phase 2 fields */}
          {vehicle.sourceMode === 'HM_ONLY' && (
            <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Registered At</div>{fmt(vehicle.registeredAt ?? null)}</div>
          )}
          {vehicle.packageType === 'FULL_TELEMETRY' && (
            <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Streaming State</div>{vehicle.streamingState ?? '—'}</div>
          )}
          {vehicle.providerMode && (
            <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Provider Mode</div><span className="font-mono">{vehicle.providerMode}</span></div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Vehicle Group Section ───────────────────────────────────────────────────

function VehicleSection({
  title,
  icon: Icon,
  vehicles,
  isDarkMode,
  onRefresh,
  onRemove,
  onFetchHealth,
  onViewHistory,
  badge,
}: {
  title: string;
  icon: typeof Activity;
  vehicles: HmVehicleDto[];
  isDarkMode: boolean;
  onRefresh: (id: string) => Promise<void>;
  onRemove: (id: string, vin: string) => Promise<void>;
  onFetchHealth: (id: string) => Promise<void>;
  onViewHistory: (v: HmVehicleDto) => void;
  badge?: React.ReactNode;
}) {
  const headerBg = isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200';
  return (
    <div>
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border mb-3 ${headerBg}`}>
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{title}</span>
        {badge}
        <span className={`ml-auto text-xs ${isDarkMode ? 'text-neutral-500' : 'text-gray-400'}`}>{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''}</span>
      </div>
      {vehicles.length === 0 ? (
        <div className={`flex flex-col items-center justify-center py-8 rounded-xl border border-dashed text-center ${isDarkMode ? 'border-neutral-800 text-neutral-600' : 'border-gray-200 text-gray-400'}`}>
          <Package className="w-6 h-6 mb-2 opacity-40" />
          <div className="text-sm">No vehicles in this category</div>
        </div>
      ) : (
        <div className="space-y-2">
          {vehicles.map(v => (
            <VehicleRow
              key={v.id}
              vehicle={v}
              isDarkMode={isDarkMode}
              onRefresh={onRefresh}
              onRemove={onRemove}
              onFetchHealth={onFetchHealth}
              onViewHistory={onViewHistory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add Vehicle Modal ───────────────────────────────────────────────────────

const KNOWN_BRANDS = [
  'BMW','Mercedes-Benz','Audi','Volkswagen','Porsche','Opel','Ford',
  'Toyota','Honda','Hyundai','Kia','Renault','Peugeot','Citroën',
  'Fiat','Volvo','Skoda','SEAT','Nissan','Mazda','Stellantis','Other'
];

function AddVehicleModal({
  isDarkMode,
  onClose,
  onAdd,
  prefillVin,
  prefillBrand,
}: {
  isDarkMode: boolean;
  onClose: () => void;
  onAdd: (vin: string, brand: string, pkg: HmPackageType) => Promise<void>;
  prefillVin?: string;
  prefillBrand?: string;
}) {
  const [vin, setVin] = useState(prefillVin ?? '');
  const [brand, setBrand] = useState(prefillBrand ?? '');
  const [pkg, setPkg] = useState<HmPackageType>('HEALTH');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!vin.trim() || !brand.trim()) return;
    setLoading(true);
    try { await onAdd(vin.trim().toUpperCase(), brand.trim(), pkg); onClose(); }
    catch { /* toast handled by parent */ }
    finally { setLoading(false); }
  };

  const overlay = 'fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4';
  const card = `w-full max-w-md rounded-xl border shadow-2xl p-6 ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-neutral-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-blue-500/30`;
  const labelCls = 'block text-xs font-medium mb-1.5 text-muted-foreground';

  return (
    <div className={overlay} onClick={onClose}>
      <div className={card} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-5">
          <div className={`p-1.5 rounded-lg ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
            <Plus className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold">Add Vehicle to High Mobility</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>VIN</label>
            <input className={inputCls} value={vin} onChange={e => setVin(e.target.value.toUpperCase())} placeholder="e.g. WBA12345678901234" />
          </div>
          <div>
            <label className={labelCls}>Brand</label>
            <select className={inputCls} value={brand} onChange={e => setBrand(e.target.value)}>
              <option value="">Select brand…</option>
              {KNOWN_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Package Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['HEALTH', 'FULL_TELEMETRY'] as HmPackageType[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPkg(p)}
                  className={`flex flex-col items-start px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                    pkg === p
                      ? p === 'HEALTH'
                        ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700'
                        : 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-700'
                      : isDarkMode ? 'border-neutral-700 text-neutral-400 hover:border-neutral-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="font-semibold">{p === 'HEALTH' ? 'Health' : 'Full Telemetry'}</span>
                  <span className="opacity-60 mt-0.5">{p === 'HEALTH' ? 'OEM health signals' : 'Prepared — not active yet'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${isDarkMode ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Cancel
          </button>
          <button
            onClick={handle}
            disabled={loading || !vin.trim() || !brand.trim()}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Vehicle
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status History Modal ────────────────────────────────────────────────────

function HistoryModal({
  vehicle,
  isDarkMode,
  onClose,
}: {
  vehicle: HmVehicleDto;
  isDarkMode: boolean;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<HmStatusHistoryDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.highMobility.statusHistory(vehicle.id)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [vehicle.id]);

  const overlay = 'fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4';
  const card = `w-full max-w-lg rounded-xl border shadow-2xl ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;

  return (
    <div className={overlay} onClick={onClose}>
      <div className={card} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
          <div>
            <h3 className="text-sm font-semibold">Status History</h3>
            <div className="text-xs text-muted-foreground mt-0.5 font-mono">{vehicle.vin}</div>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <XCircle className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : history.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">No history recorded yet</div>
          ) : (
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className={`rounded-lg px-3 py-2.5 ${isDarkMode ? 'bg-neutral-950 border border-neutral-800' : 'bg-gray-50 border border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold font-mono">{h.eventType}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(h.createdAt).toLocaleString('de-DE')}</span>
                  </div>
                  {(h.oldStatus || h.newStatus) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {h.oldStatus && <span className="font-mono">{h.oldStatus}</span>}
                      {h.oldStatus && h.newStatus && <span>→</span>}
                      {h.newStatus && <span className="font-mono font-medium">{h.newStatus}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Eligibility Tab ─────────────────────────────────────────────────────────

function EligibilityTab({
  isDarkMode,
  onAddToList,
}: {
  isDarkMode: boolean;
  onAddToList: (vin: string, brand: string) => void;
}) {
  const [vin, setVin] = useState('');
  const [brand, setBrand] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HmEligibilityResultDto | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const check = async () => {
    if (!vin.trim() || !brand.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api.highMobility.checkEligibility(vin.trim().toUpperCase(), brand.trim());
      setResult(res);
      if (res.eligibilityStatus === 'ELIGIBLE') toast.success(`${vin.trim().toUpperCase()} is eligible for High Mobility`);
      else if ((res as any).eligibilityStatus === 'NOT_APPLICABLE') toast.info(`${brand.trim()} uses direct fleet clearance — eligibility check not applicable`);
      else if (res.eligibilityStatus === 'INELIGIBLE') toast.warning(`${vin.trim().toUpperCase()} is not eligible`);
      else toast.info(`Eligibility check complete: ${res.eligibilityStatus}`);
    } catch (e: any) {
      toast.error(e?.message || 'Eligibility check failed');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = `px-3 py-2 rounded-lg border text-sm ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-neutral-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-blue-500/30`;
  const cardCls = `rounded-xl border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;

  return (
    <div className="space-y-5">
      {/* Input panel */}
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Check Vehicle Eligibility</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-muted-foreground">VIN</label>
            <input
              className={`${inputCls} w-full`}
              value={vin}
              onChange={e => setVin(e.target.value.toUpperCase())}
              placeholder="e.g. WBA12345678901234"
              onKeyDown={e => e.key === 'Enter' && check()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Brand</label>
            <select className={`${inputCls} w-full`} value={brand} onChange={e => setBrand(e.target.value)}>
              <option value="">Select brand…</option>
              {KNOWN_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={check}
              disabled={loading || !vin.trim() || !brand.trim()}
              className="w-full sm:w-auto px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Check
            </button>
          </div>
        </div>
      </div>

      {/* Result panel */}
      {result && (
        <div className={`${cardCls} overflow-hidden`}>
          {/* Header */}
          <div className={`px-5 py-4 flex items-start gap-4 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
            <div className={`p-2 rounded-lg ${result.eligibilityStatus === 'ELIGIBLE' ? 'bg-emerald-100 dark:bg-emerald-900/30' : result.eligibilityStatus === 'INELIGIBLE' ? 'bg-red-100 dark:bg-red-900/30' : (result as any).eligibilityStatus === 'NOT_APPLICABLE' ? 'bg-violet-100 dark:bg-violet-900/30' : 'bg-gray-100 dark:bg-neutral-800'}`}>
              {result.eligibilityStatus === 'ELIGIBLE'
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                : result.eligibilityStatus === 'INELIGIBLE'
                ? <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                : (result as any).eligibilityStatus === 'NOT_APPLICABLE'
                ? <Shield className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                : <AlertTriangle className="w-5 h-5 text-orange-500" />
              }
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold font-mono">{result.vin}</span>
                <span className="text-xs text-muted-foreground">{result.brand}</span>
                <EligibilityBadge status={result.eligibilityStatus} />
                <DeliveryBadge mode={result.deliveryMode} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Checked {new Date(result.checkedAt).toLocaleString('de-DE')}
              </div>
            </div>
          </div>

          {/* Capabilities */}
          {result.capabilities && Object.keys(result.capabilities).length > 0 && (
            <div className={`px-5 py-3 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
              <div className="text-xs font-medium text-muted-foreground mb-2">Capabilities</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.capabilities).map(([k, v]) => (
                  <span key={k} className={`text-[11px] px-2 py-0.5 rounded font-mono ${isDarkMode ? 'bg-neutral-800 text-neutral-300' : 'bg-gray-100 text-gray-700'}`}>
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Routing note for VW Group / Porsche */}
          {(result as any).routingNote && (
            <div className={`px-5 py-3 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
              <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${isDarkMode ? 'bg-violet-900/20 border border-violet-800/40 text-violet-300' : 'bg-violet-50 border border-violet-200 text-violet-700'}`}>
                <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold">OEM routing: </span>
                  {(result as any).routingNote}
                  {(result as any).canRequestDirectClearance && (
                    <span className="block mt-1 font-medium">Use the Vehicle List to add this vehicle directly and request fleet clearance.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
            {result.eligibilityStatus === 'ELIGIBLE' && (
              <button
                onClick={() => onAddToList(result.vin, result.brand)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add to Vehicle List
              </button>
            )}
            {(result as any).canRequestDirectClearance && (
              <button
                onClick={() => onAddToList(result.vin, result.brand)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add to Fleet (Direct Clearance)
              </button>
            )}
            <button
              onClick={() => setShowRaw(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${isDarkMode ? 'border-neutral-700 text-neutral-400 hover:bg-neutral-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {showRaw ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Raw Response
            </button>
          </div>

          {/* Raw debug payload */}
          {showRaw && result.rawResponse && (
            <div className={`px-5 pb-4`}>
              <pre className={`text-[11px] font-mono p-3 rounded-lg overflow-x-auto ${isDarkMode ? 'bg-neutral-950 text-neutral-400' : 'bg-gray-50 text-gray-600'}`}>
                {JSON.stringify(result.rawResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Vehicle List Tab ────────────────────────────────────────────────────────

function VehicleListTab({
  isDarkMode,
}: {
  isDarkMode: boolean;
}) {
  const [data, setData] = useState<HmVehicleListDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [historyVehicle, setHistoryVehicle] = useState<HmVehicleDto | null>(null);
  const [addVin, setAddVin] = useState('');
  const [addBrand, setAddBrand] = useState('');

  // Filters
  const [filterPkg, setFilterPkg] = useState<HmPackageType | ''>('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterClearance, setFilterClearance] = useState<HmClearanceStatus | ''>('');
  const [filterSourceMode, setFilterSourceMode] = useState<HmSourceMode | ''>('');
  const [filterLinked, setFilterLinked] = useState<'true' | 'false' | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.highMobility.listVehicles({
        packageType: filterPkg || undefined,
        clearanceStatus: filterClearance || undefined,
        brand: filterBrand || undefined,
        sourceMode: filterSourceMode || undefined,
      });
      setData(res);
    } catch { toast.error('Failed to load HM vehicles'); }
    finally { setLoading(false); }
  }, [filterPkg, filterClearance, filterBrand, filterSourceMode]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async (id: string) => {
    try {
      const updated = await api.highMobility.refreshStatus(id);
      setData(prev => prev ? {
        ...prev,
        health: prev.health.map(v => v.id === id ? updated : v),
        fullTelemetry: prev.fullTelemetry.map(v => v.id === id ? updated : v),
      } : prev);
      toast.success('Status refreshed');
    } catch (e: any) { toast.error(e?.message || 'Refresh failed'); }
  };

  const handleRemove = async (id: string, vin: string) => {
    try {
      await api.highMobility.removeVehicle(id);
      setData(prev => prev ? {
        ...prev,
        health: prev.health.filter(v => v.id !== id),
        fullTelemetry: prev.fullTelemetry.filter(v => v.id !== id),
        total: prev.total - 1,
      } : prev);
      toast.success(`Vehicle ${vin} removed`);
    } catch (e: any) { toast.error(e?.message || 'Remove failed'); }
  };

  const handleFetchHealth = async (id: string) => {
    try {
      await api.highMobility.fetchHealth(id);
      toast.success('Health data fetched');
    } catch (e: any) { toast.error(e?.message || 'Health fetch failed'); }
  };

  const handleAdd = async (vin: string, brand: string, pkg: HmPackageType) => {
    try {
      await api.highMobility.createVehicle({ vin, brand, packageType: pkg });
      toast.success(`Vehicle ${vin} added to HM fleet`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add vehicle');
      throw e;
    }
  };

  const openAddWithPrefill = (vin: string, brand: string) => {
    setAddVin(vin);
    setAddBrand(brand);
    setShowAdd(true);
  };

  const selectCls = `px-2 py-1.5 rounded-lg border text-xs ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'} focus:outline-none`;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select className={selectCls} value={filterPkg} onChange={e => setFilterPkg(e.target.value as any)}>
            <option value="">All Packages</option>
            <option value="HEALTH">Health</option>
            <option value="FULL_TELEMETRY">Full Telemetry</option>
          </select>
          <select className={selectCls} value={filterSourceMode} onChange={e => setFilterSourceMode(e.target.value as any)}>
            <option value="">All Sources</option>
            <option value="DIMO_PLUS_HM">DIMO + HM</option>
            <option value="HM_ONLY">HM Only</option>
          </select>
          <select className={selectCls} value={filterClearance} onChange={e => setFilterClearance(e.target.value as any)}>
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="CLEARANCE_PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="ERROR">Error</option>
          </select>
          <input
            className={`${selectCls} w-32`}
            placeholder="Brand…"
            value={filterBrand}
            onChange={e => setFilterBrand(e.target.value)}
          />
          <button onClick={load} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={() => { setAddVin(''); setAddBrand(''); setShowAdd(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Vehicle
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          <VehicleSection
            title="HM Health-APP Vehicles"
            icon={Activity}
            vehicles={data?.health ?? []}
            isDarkMode={isDarkMode}
            onRefresh={handleRefresh}
            onRemove={handleRemove}
            onFetchHealth={handleFetchHealth}
            onViewHistory={setHistoryVehicle}
            badge={
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">
                HEALTH package · DIMO add-on
              </span>
            }
          />
          <VehicleSection
            title="HM Telemetry-APP Vehicles"
            icon={Zap}
            vehicles={data?.fullTelemetry ?? []}
            isDarkMode={isDarkMode}
            onRefresh={handleRefresh}
            onRemove={handleRemove}
            onFetchHealth={handleFetchHealth}
            onViewHistory={setHistoryVehicle}
            badge={
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400">
                FULL_TELEMETRY · own lifecycle
              </span>
            }
          />
        </div>
      )}

      {showAdd && (
        <AddVehicleModal
          isDarkMode={isDarkMode}
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
          prefillVin={addVin}
          prefillBrand={addBrand}
        />
      )}
      {historyVehicle && (
        <HistoryModal
          vehicle={historyVehicle}
          isDarkMode={isDarkMode}
          onClose={() => setHistoryVehicle(null)}
        />
      )}
    </div>
  );
}

// ── Dual-App MQTT Diagnostics Tab ────────────────────────────────────────────

function DualAppStreamingTab({ isDarkMode }: { isDarkMode: boolean }) {
  const [activeApp, setActiveApp] = useState<'health' | 'telemetry'>('health');
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [telemetryStatus, setTelemetryStatus] = useState<any>(null);
  const [healthLogs, setHealthLogs] = useState<HmStreamSyncLogDto[]>([]);
  const [telemetryLogs, setTelemetryLogs] = useState<HmStreamSyncLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const cardCls = `rounded-xl border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;
  const mutedFg = isDarkMode ? 'text-neutral-500' : 'text-gray-400';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hStatus, tStatus, hLogs, tLogs] = await Promise.allSettled([
        api.highMobility.getHealthAppMqttStatus?.() ?? Promise.resolve(null),
        api.highMobility.getTelemetryAppMqttStatus?.() ?? Promise.resolve(null),
        api.highMobility.getHealthAppStreamLogs?.({ limit: 20 }) ?? Promise.resolve({ data: [], total: 0 }),
        api.highMobility.getTelemetryAppStreamLogs?.({ limit: 20 }) ?? Promise.resolve({ data: [], total: 0 }),
      ]);
      if (hStatus.status === 'fulfilled' && hStatus.value) setHealthStatus(hStatus.value);
      if (tStatus.status === 'fulfilled' && tStatus.value) setTelemetryStatus(tStatus.value);
      if (hLogs.status === 'fulfilled') setHealthLogs((hLogs.value as any)?.data ?? []);
      if (tLogs.status === 'fulfilled') setTelemetryLogs((tLogs.value as any)?.data ?? []);
    } catch {
      toast.error('Failed to load MQTT diagnostics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabBg = isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-100 border-gray-200';
  const tabActive = isDarkMode ? 'bg-neutral-700 text-white' : 'bg-white text-gray-900 shadow-sm';
  const tabInactive = isDarkMode ? 'text-neutral-400 hover:text-neutral-200' : 'text-gray-500 hover:text-gray-700';

  const statusData = activeApp === 'health' ? healthStatus : telemetryStatus;
  const logs = activeApp === 'health' ? healthLogs : telemetryLogs;
  const appLabel = activeApp === 'health' ? 'HM Health-APP' : 'HM Telemetry-APP';
  const appColor = activeApp === 'health' ? 'teal' : 'indigo';

  return (
    <div className="space-y-4">
      {/* App selector */}
      <div className="flex items-center gap-3">
        <div className={`inline-flex items-center gap-1 p-1 rounded-lg border ${tabBg}`}>
          <button
            onClick={() => setActiveApp('health')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeApp === 'health' ? tabActive : tabInactive}`}
          >
            <Activity className="w-3 h-3" />
            HM Health-APP
          </button>
          <button
            onClick={() => setActiveApp('telemetry')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeApp === 'telemetry' ? tabActive : tabInactive}`}
          >
            <Zap className="w-3 h-3" />
            HM Telemetry-APP
          </button>
        </div>
        <button
          onClick={load}
          className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-500'}`}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          {/* Status card */}
          <div className={`${cardCls} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${statusData?.connectionState === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : statusData?.connectionState === 'CONNECTING' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-sm font-semibold">{appLabel} — MQTT Status</span>
              {statusData?.connectionState && (
                <MqttStateBadge state={statusData.connectionState as HmMqttConnectionState} />
              )}
            </div>
            {statusData ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div><div className={`font-medium mb-0.5 ${mutedFg}`}>MQTT Enabled</div>{statusData.mqttEnabled ? '✓ Yes' : '✗ No'}</div>
                <div><div className={`font-medium mb-0.5 ${mutedFg}`}>OAuth Enabled</div>{statusData.oauthEnabled ? '✓ Yes' : '✗ No'}</div>
                <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Host</div><span className="font-mono">{statusData.config?.host ?? '—'}</span></div>
                <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Topic</div><span className="font-mono text-[11px] break-all">{statusData.config?.topic ?? '—'}</span></div>
                <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Client ID</div><span className="font-mono text-[11px]">{statusData.config?.clientId ?? '—'}</span></div>
                <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Consumer Group</div><span className="font-mono text-[11px]">{statusData.config?.consumerGroup ?? '—'}</span></div>
                {statusData.consumerDbState && (
                  <>
                    <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Last Connected</div>{statusData.consumerDbState.lastConnectedAt ? new Date(statusData.consumerDbState.lastConnectedAt).toLocaleString('de-DE') : '—'}</div>
                    <div><div className={`font-medium mb-0.5 ${mutedFg}`}>Last Message</div>{statusData.consumerDbState.lastMessageAt ? new Date(statusData.consumerDbState.lastMessageAt).toLocaleString('de-DE') : '—'}</div>
                  </>
                )}
              </div>
            ) : (
              <div className={`text-xs ${mutedFg}`}>Status not available — check .env config for {appLabel}</div>
            )}
          </div>

          {/* Stream logs */}
          <div className={cardCls}>
            <div className={`flex items-center gap-2 px-4 py-3 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
              <Database className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Recent Stream Logs</span>
              <span className={`ml-auto text-[10px] ${mutedFg}`}>{logs.length} entries</span>
            </div>
            <div className="divide-y divide-border">
              {logs.length === 0 ? (
                <div className={`flex flex-col items-center justify-center py-8 text-xs ${mutedFg}`}>
                  <Terminal className="w-5 h-5 mb-2 opacity-40" />
                  No messages received yet
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className={`px-4 py-2.5 ${isDarkMode ? 'hover:bg-neutral-800/50' : 'hover:bg-gray-50'} cursor-pointer transition-colors`} onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${log.ingestStatus === 'STORED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : log.ingestStatus === 'FAILED' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'}`}>
                        {log.ingestStatus}
                      </span>
                      {log.isDuplicate && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">DUP</span>}
                      <span className="text-xs font-mono text-muted-foreground">{log.vin ?? '—'}</span>
                      <span className={`text-[10px] truncate max-w-[200px] ${mutedFg}`}>{log.topic}</span>
                      <span className={`ml-auto text-[10px] ${mutedFg}`}>{log.createdAt ? new Date(log.createdAt).toLocaleTimeString('de-DE') : '—'}</span>
                    </div>
                    {expandedLog === log.id && log.normalizedSummaryJson && (
                      <pre className={`mt-2 text-[10px] p-2 rounded overflow-auto max-h-32 ${isDarkMode ? 'bg-neutral-950 text-neutral-400' : 'bg-gray-50 text-gray-600'}`}>
                        {JSON.stringify(log.normalizedSummaryJson, null, 2)}
                      </pre>
                    )}
                    {expandedLog === log.id && log.errorMessage && (
                      <p className="mt-1 text-[10px] text-red-500">{log.errorMessage}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Legacy Streaming Tab (retained for backward compat, not shown in tabs) ───

function StreamingTab({ isDarkMode }: { isDarkMode: boolean }) {
  const [consumerStatus, setConsumerStatus] = useState<HmMqttConsumerStatusDto | null>(null);
  const [logs, setLogs] = useState<HmStreamSyncLogDto[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [testingConn, setTestingConn] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterVin, setFilterVin] = useState('');

  const cardCls = `rounded-xl border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;
  const mutedFg = isDarkMode ? 'text-neutral-500' : 'text-gray-400';
  const labelCls = `text-xs font-medium ${mutedFg}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [status, logsRes] = await Promise.allSettled([
        api.highMobility.getConsumerStatus(),
        api.highMobility.getStreamLogs({
          limit: 30,
          ingestStatus: filterStatus || undefined,
          vin: filterVin.trim().toUpperCase() || undefined,
        }),
      ]);
      if (status.status === 'fulfilled') setConsumerStatus(status.value);
      if (logsRes.status === 'fulfilled') {
        setLogs(logsRes.value.data);
        setLogTotal(logsRes.value.total);
      }
    } catch {
      toast.error('Failed to load streaming status');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterVin]);

  useEffect(() => { load(); }, [load]);

  const handleTestConnection = async () => {
    setTestingConn(true);
    try {
      const r = await api.highMobility.testMqttConnection();
      if (r.success) toast.success(r.message);
      else toast.error(r.message);
    } catch (e: any) {
      toast.error(e?.message || 'Connection test failed');
    } finally {
      setTestingConn(false);
    }
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString('de-DE') : '—';
  const fmtShort = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE') : '—';

  const INGEST_STATUS_COLOR: Record<string, string> = {
    RECEIVED:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    PARSED:        'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400',
    STORED:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    FAILED:        'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    DEDUPLICATED:  'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-500',
  };

  return (
    <div className="space-y-5">
      {/* MQTT Consumer Status */}
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Wifi className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">MQTT V2 Consumer</h3>
          {consumerStatus && <MqttStateBadge state={consumerStatus.connectionState} />}
          <button onClick={load} className={`ml-auto p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : consumerStatus ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div><div className={`${labelCls} mb-0.5`}>Environment</div><span className="font-mono font-medium">{consumerStatus.environment}</span></div>
              <div><div className={`${labelCls} mb-0.5`}>Application ID</div><span className="font-mono">{consumerStatus.applicationId || '—'}</span></div>
              <div><div className={`${labelCls} mb-0.5`}>Consumer Group</div><span className="font-mono text-[11px]">{consumerStatus.consumerGroup}</span></div>
              <div><div className={`${labelCls} mb-0.5`}>MQTT Enabled</div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${consumerStatus.mqttEnabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-500'}`}>
                  {consumerStatus.mqttEnabled ? 'Yes' : 'No'}
                </span>
              </div>
              <div><div className={`${labelCls} mb-0.5`}>Cert Configured</div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${consumerStatus.certConfigured ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'}`}>
                  {consumerStatus.certConfigured ? 'Ready' : 'Missing'}
                </span>
              </div>
              <div><div className={`${labelCls} mb-0.5`}>Last Connected</div>{fmt(consumerStatus.lastConnectedAt)}</div>
              <div><div className={`${labelCls} mb-0.5`}>Last Message</div>{fmt(consumerStatus.lastMessageAt)}</div>
              <div><div className={`${labelCls} mb-0.5`}>Last Error</div>{fmt(consumerStatus.lastErrorAt)}</div>
            </div>

            {consumerStatus.lastErrorMessage && (
              <div className={`text-xs px-3 py-2 rounded-lg ${isDarkMode ? 'bg-red-900/20 border border-red-800/40 text-red-400' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                <span className="font-medium">Last Error:</span> {consumerStatus.lastErrorMessage}
              </div>
            )}

            {!consumerStatus.mqttEnabled && (
              <div className={`text-xs px-3 py-2 rounded-lg ${isDarkMode ? 'bg-yellow-900/20 border border-yellow-800/40 text-yellow-400' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'}`}>
                Set <code className="font-mono">HM_MQTT_ENABLED=true</code> and configure certificate paths to enable MQTT V2 streaming.
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleTestConnection}
                disabled={testingConn}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {testingConn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Signal className="w-3.5 h-3.5" />}
                Test Connection
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No consumer state recorded yet. MQTT consumer will update this when active.
          </div>
        )}
      </div>

      {/* Architecture notice */}
      <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-xs ${isDarkMode ? 'bg-indigo-900/20 border-indigo-800/40 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
        <Database className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">Phase 2 architecture: </span>
          MQTT V2 messages are ingested, deduplicated, normalized, and staged. Full downstream product activation
          (trips, health scoring, abuse detection) is deferred to Phase 3. All raw messages are stored for replay.
        </div>
      </div>

      {/* Stream Logs */}
      <div className={cardCls}>
        <div className={`px-5 py-4 flex items-center gap-2 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Stream Ingest Logs</h3>
          <span className={`text-xs ${mutedFg}`}>({logTotal} total)</span>
          <div className="ml-auto flex items-center gap-2">
            <input
              className={`px-2 py-1 rounded text-xs border ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-neutral-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} focus:outline-none`}
              placeholder="VIN…"
              value={filterVin}
              onChange={e => setFilterVin(e.target.value)}
              style={{ width: 100 }}
            />
            <select
              className={`px-2 py-1 rounded text-xs border ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'} focus:outline-none`}
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="STORED">Stored</option>
              <option value="FAILED">Failed</option>
              <option value="DEDUPLICATED">Deduplicated</option>
            </select>
            <button onClick={load} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : logs.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-10 text-center ${isDarkMode ? 'text-neutral-600' : 'text-gray-400'}`}>
              <SignalLow className="w-6 h-6 mb-2 opacity-40" />
              <div className="text-sm">No stream messages yet</div>
              <div className={`text-xs mt-1 ${mutedFg}`}>Messages will appear here once MQTT streaming is active</div>
            </div>
          ) : logs.map(log => (
            <div key={log.id} className="px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-semibold">{log.vin ?? '—'}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDarkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-gray-100 text-gray-500'}`}>{log.topic}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${INGEST_STATUS_COLOR[log.ingestStatus] ?? ''}`}>{log.ingestStatus}</span>
                {log.isDuplicate && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-500">DUPE</span>}
                <span className={`ml-auto text-[10px] ${mutedFg}`}>{fmt(log.createdAt)}</span>
                <button onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)} className={`p-1 rounded ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-500' : 'hover:bg-gray-100 text-gray-400'}`}>
                  {expandedLog === log.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
              {log.errorMessage && (
                <div className="text-[11px] text-red-500 mt-1 font-mono">{log.errorMessage}</div>
              )}
              {expandedLog === log.id && log.normalizedSummaryJson && (
                <pre className={`mt-2 text-[11px] font-mono p-2 rounded-lg overflow-x-auto ${isDarkMode ? 'bg-neutral-950 text-neutral-400' : 'bg-gray-50 text-gray-600'}`}>
                  {JSON.stringify(log.normalizedSummaryJson, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main View ───────────────────────────────────────────────────────────────

interface Props {
  isDarkMode: boolean;
}

export function HighMobilityDataView({ isDarkMode }: Props) {
  const [tab, setTab] = useState<'vehicles' | 'eligibility' | 'streaming'>('vehicles');
  const [addVin, setAddVin] = useState('');
  const [addBrand, setAddBrand] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const openAddFromEligibility = (vin: string, brand: string) => {
    setAddVin(vin);
    setAddBrand(brand);
    setShowAdd(true);
    setTab('vehicles');
  };

  const tabBg = isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-gray-100 border-gray-200';
  const tabActive = isDarkMode ? 'bg-neutral-700 text-white' : 'bg-white text-gray-900 shadow-sm';
  const tabInactive = isDarkMode ? 'text-neutral-400 hover:text-neutral-200' : 'text-gray-500 hover:text-gray-700';

  return (
    <div className="flex flex-col h-full min-h-0 px-4 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-neutral-800' : 'bg-blue-50'}`}>
          <Radio className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold">High Mobility</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-teal-900/40 text-teal-400' : 'bg-teal-100 text-teal-700'}`}>
              HM Health-APP
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-indigo-900/40 text-indigo-400' : 'bg-indigo-100 text-indigo-700'}`}>
              HM Telemetry-APP
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dual-app MQTT V2 architecture — separate credentials, topics, consumers, and routing per app container
          </p>
        </div>
      </div>

      {/* Domain rules notice */}
      <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-xs ${isDarkMode ? 'bg-blue-900/20 border-blue-800/40 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
        <Shield className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">App container rules: </span>
          HM Health-APP signals are informational/display-grade only (oil, tires, brakes, service). 
          HM Telemetry-APP owns the full telemetry lifecycle with separate OAuth credentials, MQTT certs, and topic routing.
          Never mix app container credentials, state, or routing.
        </div>
      </div>

      {/* Tabs */}
      <div className={`inline-flex items-center gap-1 p-1 rounded-lg border self-start ${tabBg}`}>
        <button
          onClick={() => setTab('vehicles')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'vehicles' ? tabActive : tabInactive}`}
        >
          Vehicle List
        </button>
        <button
          onClick={() => setTab('eligibility')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'eligibility' ? tabActive : tabInactive}`}
        >
          Eligibility Check
        </button>
        <button
          onClick={() => setTab('streaming')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'streaming' ? tabActive : tabInactive}`}
        >
          <Signal className="w-3 h-3" />
          MQTT Diagnostics
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'vehicles' && <VehicleListTab isDarkMode={isDarkMode} />}
        {tab === 'eligibility' && <EligibilityTab isDarkMode={isDarkMode} onAddToList={openAddFromEligibility} />}
        {tab === 'streaming' && <DualAppStreamingTab isDarkMode={isDarkMode} />}
      </div>

      {/* Add modal from eligibility redirect */}
      {showAdd && (
        <AddVehicleModal
          isDarkMode={isDarkMode}
          onClose={() => setShowAdd(false)}
          prefillVin={addVin}
          prefillBrand={addBrand}
          onAdd={async (vin, brand, pkg) => {
            await api.highMobility.createVehicle({ vin, brand, packageType: pkg });
            toast.success(`Vehicle ${vin} added to HM fleet`);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}
