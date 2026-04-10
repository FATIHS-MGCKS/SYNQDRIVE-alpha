import { useState, useEffect, useMemo } from 'react';
import {
  Shield, Search, Filter, ChevronDown, ChevronRight, X, CheckCircle2,
  XCircle, Clock, AlertCircle, Eye, ShieldOff, ShieldCheck, Building2,
  Car, Database, Globe, FileText, Zap, CreditCard, Package, Truck,
  Lock, ArrowLeft, Calendar, User, Info, RotateCcw,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';

interface DataAuthorizationEntry {
  id: string;
  organizationId: string;
  requestingEntity: string;
  moduleOrigin: string;
  purpose: string;
  scope: string;
  scopeKey: string;
  dataCategories: string[];
  destination: string;
  vehicleIds: string[] | null;
  accessPattern: string;
  accessPatternKey: string;
  status: string;
  statusKey: string;
  grantedById: string | null;
  grantedByName: string | null;
  grantedAt: string | null;
  revokedById: string | null;
  revokedByName: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  active: number;
  revoked: number;
  pending: number;
  expired: number;
}

const MODULE_ICONS: Record<string, typeof Shield> = {
  Insurance: Shield,
  'Parts & Accessories': Package,
  'Fuel Cards': CreditCard,
  'Vehicle Brokerage': Truck,
  Telematics: Zap,
  'Fleet Connectivity': Globe,
  Analytics: Database,
};

const MODULE_COLORS: Record<string, { bg: string; bgDark: string; text: string; textDark: string }> = {
  Insurance: { bg: 'bg-blue-50', bgDark: 'bg-blue-500/15', text: 'text-blue-600', textDark: 'text-blue-400' },
  'Parts & Accessories': { bg: 'bg-orange-50', bgDark: 'bg-orange-500/15', text: 'text-orange-600', textDark: 'text-orange-400' },
  'Fuel Cards': { bg: 'bg-emerald-50', bgDark: 'bg-emerald-500/15', text: 'text-emerald-600', textDark: 'text-emerald-400' },
  'Vehicle Brokerage': { bg: 'bg-purple-50', bgDark: 'bg-purple-500/15', text: 'text-purple-600', textDark: 'text-purple-400' },
  Telematics: { bg: 'bg-cyan-50', bgDark: 'bg-cyan-500/15', text: 'text-cyan-600', textDark: 'text-cyan-400' },
  'Fleet Connectivity': { bg: 'bg-indigo-50', bgDark: 'bg-indigo-500/15', text: 'text-indigo-600', textDark: 'text-indigo-400' },
  Analytics: { bg: 'bg-violet-50', bgDark: 'bg-violet-500/15', text: 'text-violet-600', textDark: 'text-violet-400' },
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; bgDark: string }> = {
  ACTIVE: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', bgDark: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  REVOKED: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 text-red-700 border-red-200', bgDark: 'bg-red-500/15 text-red-400 border-red-500/30' },
  PENDING: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50 text-amber-700 border-amber-200', bgDark: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  EXPIRED: { icon: AlertCircle, color: 'text-gray-400', bg: 'bg-gray-50 text-gray-600 border-gray-200', bgDark: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
};

const DATA_CATEGORY_LABELS: Record<string, string> = {
  vehicle_identity: 'Fahrzeugidentität',
  vin_license: 'VIN / Kennzeichen',
  insurance_data: 'Versicherungsdaten',
  telematics_usage: 'Telematik-Nutzungsdaten',
  trip_data: 'Fahrtdaten',
  maintenance_data: 'Wartungsdaten',
  fleet_condition: 'Fahrzeugzustand',
  document_data: 'Dokumenten-Daten',
  booking_data: 'Buchungsdaten',
  customer_data: 'Kundendaten',
  financial_data: 'Finanzdaten',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

interface Props {
  isDarkMode: boolean;
  canWrite?: boolean;
}

export function DataAuthorizationTab({ isDarkMode, canWrite = true }: Props) {
  const { orgId } = useRentalOrg();
  const [authorizations, setAuthorizations] = useState<DataAuthorizationEntry[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, revoked: 0, pending: 0, expired: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [selectedAuth, setSelectedAuth] = useState<DataAuthorizationEntry | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const cardClass = `rounded-2xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-3 py-2.5 rounded-xl border text-xs transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400'} outline-none`;

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [list, st] = await Promise.all([
        api.dataAuthorizations.list(orgId),
        api.dataAuthorizations.stats(orgId),
      ]);
      setAuthorizations(list);
      setStats(st);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, [orgId]);

  const filtered = useMemo(() => {
    let result = authorizations;
    if (statusFilter !== 'all') result = result.filter(a => a.statusKey === statusFilter);
    if (moduleFilter !== 'all') result = result.filter(a => a.moduleOrigin === moduleFilter);
    if (scopeFilter !== 'all') result = result.filter(a => a.scopeKey === scopeFilter);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(a =>
        a.requestingEntity.toLowerCase().includes(q) ||
        a.purpose.toLowerCase().includes(q) ||
        a.destination.toLowerCase().includes(q) ||
        a.moduleOrigin.toLowerCase().includes(q)
      );
    }
    return result;
  }, [authorizations, statusFilter, moduleFilter, scopeFilter, searchTerm]);

  const modules = useMemo(() => [...new Set(authorizations.map(a => a.moduleOrigin))], [authorizations]);

  const handleRevoke = async (id: string) => {
    if (!orgId) return;
    try {
      await api.dataAuthorizations.revoke(orgId, id);
      setShowRevokeConfirm(null);
      if (selectedAuth?.id === id) {
        const updated = await api.dataAuthorizations.get(orgId, id);
        setSelectedAuth(updated);
      }
      load();
    } catch { /* ignore */ }
  };

  const handleGrant = async (id: string) => {
    if (!orgId) return;
    try {
      await api.dataAuthorizations.grant(orgId, id);
      if (selectedAuth?.id === id) {
        const updated = await api.dataAuthorizations.get(orgId, id);
        setSelectedAuth(updated);
      }
      load();
    } catch { /* ignore */ }
  };

  // ─── Detail View ──────────────────────────────────────────────

  if (selectedAuth) {
    const sc = STATUS_CONFIG[selectedAuth.statusKey] || STATUS_CONFIG.PENDING;
    const StatusIcon = sc.icon;
    const mc = MODULE_COLORS[selectedAuth.moduleOrigin];
    const ModIcon = MODULE_ICONS[selectedAuth.moduleOrigin] || Database;

    return (
      <div className="space-y-5">
        <button onClick={() => setSelectedAuth(null)} className={`flex items-center gap-2 text-xs font-medium ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>
          <ArrowLeft className="w-4 h-4" /> Zurück zur Übersicht
        </button>

        <div className={`${cardClass} p-6`}>
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${mc ? (isDarkMode ? mc.bgDark : mc.bg) : (isDarkMode ? 'bg-neutral-800' : 'bg-gray-100')}`}>
                <ModIcon className={`w-6 h-6 ${mc ? (isDarkMode ? mc.textDark : mc.text) : textSecondary}`} />
              </div>
              <div>
                <h2 className={`text-lg font-bold ${textPrimary}`}>{selectedAuth.requestingEntity}</h2>
                <p className={`text-xs ${textSecondary} mt-0.5`}>{selectedAuth.moduleOrigin} — {selectedAuth.purpose}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${isDarkMode ? sc.bgDark : sc.bg}`}>
                <StatusIcon className={`w-3.5 h-3.5 inline mr-1.5 -mt-0.5 ${sc.color}`} />
                {selectedAuth.status}
              </span>
              {canWrite && selectedAuth.statusKey === 'ACTIVE' && (
                <button onClick={() => setShowRevokeConfirm(selectedAuth.id)} className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-xl text-xs font-medium hover:bg-red-700 transition-colors">
                  <ShieldOff className="w-4 h-4" /> Widerrufen
                </button>
              )}
              {canWrite && selectedAuth.statusKey === 'PENDING' && (
                <button onClick={() => handleGrant(selectedAuth.id)} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-medium hover:bg-emerald-700 transition-colors">
                  <ShieldCheck className="w-4 h-4" /> Genehmigen
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <DetailSection isDarkMode={isDarkMode} title="Autorisierungs-Details">
              <DetailRow isDarkMode={isDarkMode} label="Referenz-ID" value={selectedAuth.id.slice(0, 8).toUpperCase()} />
              <DetailRow isDarkMode={isDarkMode} label="Anfragende Stelle" value={selectedAuth.requestingEntity} />
              <DetailRow isDarkMode={isDarkMode} label="Empfänger" value={selectedAuth.destination} />
              <DetailRow isDarkMode={isDarkMode} label="Modul / Herkunft" value={selectedAuth.moduleOrigin} />
              <DetailRow isDarkMode={isDarkMode} label="Zweck" value={selectedAuth.purpose} />
              <DetailRow isDarkMode={isDarkMode} label="Zugriffsmuster" value={selectedAuth.accessPattern} />
            </DetailSection>

            <DetailSection isDarkMode={isDarkMode} title="Umfang & Geltungsbereich">
              <DetailRow isDarkMode={isDarkMode} label="Geltungsbereich" value={selectedAuth.scope} icon={selectedAuth.scopeKey === 'VEHICLE' ? <Car className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />} />
              {selectedAuth.vehicleIds && (selectedAuth.vehicleIds as string[]).length > 0 && (
                <DetailRow isDarkMode={isDarkMode} label="Fahrzeuge" value={`${(selectedAuth.vehicleIds as string[]).length} Fahrzeug(e)`} />
              )}
              {selectedAuth.expiresAt && (
                <DetailRow isDarkMode={isDarkMode} label="Gültig bis" value={formatDate(selectedAuth.expiresAt)} />
              )}
            </DetailSection>

            <DetailSection isDarkMode={isDarkMode} title="Autorisierte Datenkategorien">
              <div className="flex flex-wrap gap-2 mt-1">
                {(selectedAuth.dataCategories as string[]).map((cat, i) => (
                  <span key={i} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                    {DATA_CATEGORY_LABELS[cat] || cat}
                  </span>
                ))}
              </div>
            </DetailSection>

            <DetailSection isDarkMode={isDarkMode} title="Lebenszyklus">
              <DetailRow isDarkMode={isDarkMode} label="Erstellt am" value={formatDate(selectedAuth.createdAt)} />
              {selectedAuth.grantedAt && (
                <DetailRow isDarkMode={isDarkMode} label="Genehmigt am" value={formatDate(selectedAuth.grantedAt)} />
              )}
              {selectedAuth.grantedByName && (
                <DetailRow isDarkMode={isDarkMode} label="Genehmigt von" value={selectedAuth.grantedByName} icon={<User className="w-3.5 h-3.5" />} />
              )}
              {selectedAuth.revokedAt && (
                <DetailRow isDarkMode={isDarkMode} label="Widerrufen am" value={formatDate(selectedAuth.revokedAt)} />
              )}
              {selectedAuth.revokedByName && (
                <DetailRow isDarkMode={isDarkMode} label="Widerrufen von" value={selectedAuth.revokedByName} icon={<User className="w-3.5 h-3.5" />} />
              )}
            </DetailSection>
          </div>

          {selectedAuth.notes && (
            <div className={`mt-6 p-4 rounded-xl border ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700' : 'bg-gray-50 border-gray-200'}`}>
              <p className={`text-xs font-semibold mb-1 ${textSecondary}`}>Notizen</p>
              <p className={`text-xs ${textPrimary}`}>{selectedAuth.notes}</p>
            </div>
          )}
        </div>

        {showRevokeConfirm === selectedAuth.id && (
          <RevokeConfirmDialog isDarkMode={isDarkMode} entity={selectedAuth.requestingEntity} onConfirm={() => handleRevoke(selectedAuth.id)} onCancel={() => setShowRevokeConfirm(null)} />
        )}
      </div>
    );
  }

  // ─── List View ────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Datenautorisierung</h2>
          <p className={`text-xs mt-1 ${textSecondary}`}>Verwalten Sie alle erteilten Datenzugriffe und -freigaben für Ihr Unternehmen</p>
        </div>
        {canWrite && (
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25">
            <Shield className="w-4 h-4" /> Autorisierung erstellen
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard isDarkMode={isDarkMode} label="Gesamt" value={stats.total} icon={<Database className="w-4 h-4" />} color="blue" />
        <StatCard isDarkMode={isDarkMode} label="Aktiv" value={stats.active} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
        <StatCard isDarkMode={isDarkMode} label="Ausstehend" value={stats.pending} icon={<Clock className="w-4 h-4" />} color="amber" />
        <StatCard isDarkMode={isDarkMode} label="Widerrufen" value={stats.revoked} icon={<XCircle className="w-4 h-4" />} color="red" />
        <StatCard isDarkMode={isDarkMode} label="Abgelaufen" value={stats.expired} icon={<AlertCircle className="w-4 h-4" />} color="gray" />
      </div>

      {/* Filters */}
      <div className={`${cardClass} p-4`}>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Suche nach Empfänger, Modul, Zweck..." className={`${inputClass} pl-9`} />
          </div>
          <FilterSelect isDarkMode={isDarkMode} value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: 'Alle Status' }, { value: 'ACTIVE', label: 'Aktiv' }, { value: 'PENDING', label: 'Ausstehend' }, { value: 'REVOKED', label: 'Widerrufen' }, { value: 'EXPIRED', label: 'Abgelaufen' }]} />
          {modules.length > 0 && (
            <FilterSelect isDarkMode={isDarkMode} value={moduleFilter} onChange={setModuleFilter} options={[{ value: 'all', label: 'Alle Module' }, ...modules.map(m => ({ value: m, label: m }))]} />
          )}
          <FilterSelect isDarkMode={isDarkMode} value={scopeFilter} onChange={setScopeFilter} options={[{ value: 'all', label: 'Alle Bereiche' }, { value: 'ORGANIZATION', label: 'Organisation' }, { value: 'VEHICLE', label: 'Fahrzeug' }]} />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className={`${cardClass} p-12 text-center`}>
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className={`text-xs ${textSecondary}`}>Autorisierungen werden geladen...</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState isDarkMode={isDarkMode} hasFilters={statusFilter !== 'all' || moduleFilter !== 'all' || scopeFilter !== 'all' || !!searchTerm} total={authorizations.length} />
      ) : (
        <div className="space-y-2">
          {filtered.map(auth => (
            <AuthorizationRow key={auth.id} auth={auth} isDarkMode={isDarkMode} onSelect={() => setSelectedAuth(auth)} onRevoke={canWrite ? () => setShowRevokeConfirm(auth.id) : undefined} />
          ))}
        </div>
      )}

      {showRevokeConfirm && (
        <RevokeConfirmDialog isDarkMode={isDarkMode} entity={authorizations.find(a => a.id === showRevokeConfirm)?.requestingEntity || ''} onConfirm={() => { handleRevoke(showRevokeConfirm); }} onCancel={() => setShowRevokeConfirm(null)} />
      )}

      {showCreateModal && (
        <CreateAuthorizationModal isDarkMode={isDarkMode} orgId={orgId} onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); load(); }} />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function StatCard({ isDarkMode, label, value, icon, color }: { isDarkMode: boolean; label: string; value: number; icon: React.ReactNode; color: string }) {
  const colors: Record<string, { bg: string; bgDark: string; text: string; textDark: string }> = {
    blue: { bg: 'bg-blue-50', bgDark: 'bg-blue-500/15', text: 'text-blue-600', textDark: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-50', bgDark: 'bg-emerald-500/15', text: 'text-emerald-600', textDark: 'text-emerald-400' },
    amber: { bg: 'bg-amber-50', bgDark: 'bg-amber-500/15', text: 'text-amber-600', textDark: 'text-amber-400' },
    red: { bg: 'bg-red-50', bgDark: 'bg-red-500/15', text: 'text-red-600', textDark: 'text-red-400' },
    gray: { bg: 'bg-gray-50', bgDark: 'bg-gray-500/15', text: 'text-gray-600', textDark: 'text-gray-400' },
  };
  const c = colors[color] || colors.blue;
  return (
    <div className={`rounded-2xl p-4 shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${isDarkMode ? c.bgDark : c.bg}`}>
          <span className={isDarkMode ? c.textDark : c.text}>{icon}</span>
        </div>
        <div>
          <p className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{value}</p>
          <p className={`text-[11px] font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ isDarkMode, value, onChange, options }: { isDarkMode: boolean; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`px-3 py-2.5 rounded-xl border text-xs font-medium transition-all outline-none cursor-pointer ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-700'}`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function AuthorizationRow({ auth, isDarkMode, onSelect, onRevoke }: { auth: DataAuthorizationEntry; isDarkMode: boolean; onSelect: () => void; onRevoke?: () => void }) {
  const sc = STATUS_CONFIG[auth.statusKey] || STATUS_CONFIG.PENDING;
  const StatusIcon = sc.icon;
  const mc = MODULE_COLORS[auth.moduleOrigin];
  const ModIcon = MODULE_ICONS[auth.moduleOrigin] || Database;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`rounded-2xl p-4 shadow-sm border transition-all duration-200 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] cursor-pointer ${isDarkMode ? 'bg-neutral-900 border-neutral-700 hover:border-neutral-600/70' : 'bg-white border-gray-200 hover:border-gray-300'}`} onClick={onSelect}>
      <div className="flex items-center gap-4">
        <div className={`p-2.5 rounded-xl shrink-0 ${mc ? (isDarkMode ? mc.bgDark : mc.bg) : (isDarkMode ? 'bg-neutral-800' : 'bg-gray-100')}`}>
          <ModIcon className={`w-5 h-5 ${mc ? (isDarkMode ? mc.textDark : mc.text) : textSecondary}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-semibold truncate ${textPrimary}`}>{auth.requestingEntity}</p>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${isDarkMode ? sc.bgDark : sc.bg}`}>
              {auth.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-[11px] ${textSecondary}`}>{auth.moduleOrigin}</span>
            <span className={`text-[11px] ${textSecondary}`}>·</span>
            <span className={`text-[11px] ${textSecondary}`}>{auth.purpose}</span>
            <span className={`text-[11px] ${textSecondary}`}>·</span>
            <span className={`text-[11px] ${textSecondary}`}>{auth.scope}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right mr-2">
            <p className={`text-[11px] font-medium ${textSecondary}`}>{auth.accessPattern}</p>
            <p className={`text-[10px] ${textSecondary}`}>{formatDate(auth.grantedAt || auth.createdAt)}</p>
          </div>
          {(auth.dataCategories as string[]).length > 0 && (
            <span className={`px-2 py-1 rounded-lg text-[10px] font-medium ${isDarkMode ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
              {(auth.dataCategories as string[]).length} Kategorie{(auth.dataCategories as string[]).length !== 1 ? 'n' : ''}
            </span>
          )}
          {onRevoke && auth.statusKey === 'ACTIVE' && (
            <button onClick={e => { e.stopPropagation(); onRevoke(); }} className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-red-500/15 text-gray-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`} title="Widerrufen">
              <ShieldOff className="w-4 h-4" />
            </button>
          )}
          <ChevronRight className={`w-4 h-4 ${textSecondary}`} />
        </div>
      </div>
    </div>
  );
}

function DetailSection({ isDarkMode, title, children }: { isDarkMode: boolean; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailRow({ isDarkMode, label, value, icon }: { isDarkMode: boolean; label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
      <div className="flex items-center gap-1.5">
        {icon && <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>{icon}</span>}
        <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{value}</span>
      </div>
    </div>
  );
}

function EmptyState({ isDarkMode, hasFilters, total }: { isDarkMode: boolean; hasFilters: boolean; total: number }) {
  return (
    <div className={`rounded-2xl p-12 shadow-sm border text-center ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${isDarkMode ? 'bg-blue-500/15' : 'bg-blue-50'}`}>
        <Shield className={`w-8 h-8 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
      </div>
      {hasFilters ? (
        <>
          <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Keine Ergebnisse</h3>
          <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} max-w-sm mx-auto`}>
            Keine Autorisierungen entsprechen Ihren aktuellen Filterkriterien. Passen Sie die Filter an oder setzen Sie die Suche zurück.
          </p>
        </>
      ) : (
        <>
          <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Keine Datenautorisierungen</h3>
          <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} max-w-md mx-auto`}>
            Noch keine Datenautorisierungen vorhanden. Wenn Ökosystem-Module wie Versicherung, Teile & Zubehör oder Tankkarten Datenzugriff anfordern, werden die Autorisierungen hier sichtbar und verwaltbar.
          </p>
          <div className={`mt-6 p-4 rounded-xl border max-w-lg mx-auto text-left ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700' : 'bg-blue-50/50 border-blue-200/50'}`}>
            <div className="flex items-start gap-3">
              <Info className={`w-4 h-4 mt-0.5 shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
              <div>
                <p className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>So funktioniert die Datenautorisierung</p>
                <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Wenn ein Ökosystem-Modul (z.B. Versicherung) Zugriff auf Ihre Organisations- oder Fahrzeugdaten benötigt, erscheint eine Autorisierungsanfrage. 
                  Hier sehen Sie alle erteilten, ausstehenden und widerrufenen Freigaben mit vollständigem Audit-Trail.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RevokeConfirmDialog({ isDarkMode, entity, onConfirm, onCancel }: { isDarkMode: boolean; entity: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-red-100">
            <ShieldOff className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Autorisierung widerrufen</h3>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Dieser Vorgang kann nicht rückgängig gemacht werden.</p>
          </div>
        </div>
        <p className={`text-xs mb-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Möchten Sie die Datenautorisierung für <strong>{entity}</strong> wirklich widerrufen? Der Datenzugriff wird sofort beendet. Die Autorisierung bleibt im Verlauf sichtbar.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className={`px-4 py-2.5 rounded-xl text-xs font-medium border transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
            Abbrechen
          </button>
          <button onClick={onConfirm} className="px-4 py-2.5 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors">
            Endgültig widerrufen
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Modal ───────────────────────────────────────────────

const MODULE_OPTIONS = [
  'Insurance', 'Parts & Accessories', 'Fuel Cards', 'Vehicle Brokerage',
  'Telematics', 'Fleet Connectivity', 'Analytics',
];

const CATEGORY_OPTIONS = [
  'vehicle_identity', 'vin_license', 'insurance_data', 'telematics_usage',
  'trip_data', 'maintenance_data', 'fleet_condition', 'document_data',
  'booking_data', 'customer_data', 'financial_data',
];

const ACCESS_PATTERNS = [
  { value: 'ONE_TIME', label: 'Einmalig' },
  { value: 'ONGOING', label: 'Fortlaufend' },
  { value: 'RECURRING', label: 'Wiederkehrend' },
  { value: 'EVENT_DRIVEN', label: 'Ereignisgesteuert' },
];

function CreateAuthorizationModal({ isDarkMode, orgId, onClose, onCreated }: { isDarkMode: boolean; orgId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    requestingEntity: '',
    moduleOrigin: MODULE_OPTIONS[0],
    purpose: '',
    scope: 'ORGANIZATION',
    dataCategories: [] as string[],
    destination: '',
    accessPattern: 'ONGOING',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-3 py-2.5 rounded-xl border text-xs transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400'} outline-none`;
  const labelClass = `block text-xs font-semibold mb-1.5 ${textSecondary}`;

  const toggleCategory = (cat: string) => {
    setForm(prev => ({
      ...prev,
      dataCategories: prev.dataCategories.includes(cat) ? prev.dataCategories.filter(c => c !== cat) : [...prev.dataCategories, cat],
    }));
  };

  const handleSubmit = async () => {
    if (!form.requestingEntity || !form.purpose || !form.destination || form.dataCategories.length === 0) return;
    setSaving(true);
    try {
      await api.dataAuthorizations.create(orgId, { ...form, status: 'ACTIVE' });
      onCreated();
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`} onClick={e => e.stopPropagation()} style={{ scrollbarWidth: 'thin' }}>
        <div className={`sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-blue-500/15' : 'bg-blue-50'}`}>
              <Shield className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
            </div>
            <div>
              <h3 className={`text-base font-bold ${textPrimary}`}>Neue Datenautorisierung</h3>
              <p className={`text-[11px] ${textSecondary}`}>Erstellen Sie eine neue Datenzugriffsfreigabe</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Anfragende Stelle *</label>
              <input value={form.requestingEntity} onChange={e => setForm(f => ({ ...f, requestingEntity: e.target.value }))} placeholder="z.B. DIMO Insurance GmbH" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Empfänger / Datenempfänger *</label>
              <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} placeholder="z.B. DIMO Insurance GmbH" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Modul / Herkunft</label>
              <select value={form.moduleOrigin} onChange={e => setForm(f => ({ ...f, moduleOrigin: e.target.value }))} className={inputClass}>
                {MODULE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Geltungsbereich</label>
              <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} className={inputClass}>
                <option value="ORGANIZATION">Organisation</option>
                <option value="VEHICLE">Fahrzeug</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Zweck der Autorisierung *</label>
            <input value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="z.B. Versicherungsangebote auf Basis von Fahrzeugdaten" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Zugriffsmuster</label>
            <div className="flex gap-2 flex-wrap">
              {ACCESS_PATTERNS.map(ap => (
                <button key={ap.value} onClick={() => setForm(f => ({ ...f, accessPattern: ap.value }))} className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${form.accessPattern === ap.value ? (isDarkMode ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-blue-50 border-blue-300 text-blue-700') : (isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-400 hover:border-neutral-600' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300')}`}>
                  {ap.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Autorisierte Datenkategorien *</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORY_OPTIONS.map(cat => (
                <button key={cat} onClick={() => toggleCategory(cat)} className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition-all ${form.dataCategories.includes(cat) ? (isDarkMode ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-blue-50 border-blue-300 text-blue-700') : (isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-400 hover:border-neutral-600' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300')}`}>
                  {DATA_CATEGORY_LABELS[cat] || cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Notizen (optional)</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Zusätzliche Informationen zur Autorisierung..." className={inputClass} />
          </div>
        </div>

        <div className={`sticky bottom-0 flex justify-end gap-3 px-6 py-4 border-t ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
          <button onClick={onClose} className={`px-4 py-2.5 rounded-xl text-xs font-medium border transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
            Abbrechen
          </button>
          <button onClick={handleSubmit} disabled={saving || !form.requestingEntity || !form.purpose || !form.destination || form.dataCategories.length === 0} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25">
            {saving ? 'Wird erstellt...' : 'Autorisierung erteilen'}
          </button>
        </div>
      </div>
    </div>
  );
}
