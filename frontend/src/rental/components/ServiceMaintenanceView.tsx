import { useCallback, useEffect, useState } from 'react';
import {
  Wrench, Shield, CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronRight, Plus, Settings, Lock, Unlock, ExternalLink,
  FileText, Calendar, Car, ArrowRight, Info, RefreshCw, Loader2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { EuromasterServiceRequestModal } from './euromaster/EuromasterServiceRequestModal';
import { EuromasterStatusBadge } from './euromaster/EuromasterStatusBadge';
import { useEuromasterIntegration } from './euromaster/useEuromasterIntegration';

interface ServicePartner {
  id: string;
  provider: string;
  name: string;
  category: string;
  globalStatus: string;
  description: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  capabilities: string[];
  connectedOrgsCount: number;
}

interface PartnerAssignment {
  id: string;
  partnerId: string;
  provider: string;
  partnerName: string;
  globalStatus: string;
  status: string;
  mode: string;
  enabledFeatures: string[];
  connectedAt: string | null;
}

interface ServiceCase {
  id: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  scheduledAt: string | null;
  createdAt: string;
  partner: { provider: string; name: string };
  vehicle: { id: string; licensePlate: string; make: string; model: string } | null;
}

interface DataAuth {
  id?: string;
  status: string;
  grantedScopes?: string[];
  defaultScopes?: string[];
  grantedAt?: string;
}

type ViewTab = 'partners' | 'cases' | 'data-auth';
type DetailPartner = 'EUROMASTER' | 'ADAC' | null;

const SCOPE_LABELS: Record<string, string> = {
  'vehicle_identity.read': 'Vehicle Identity',
  'vehicle_plate.read': 'License Plate',
  'vehicle_vin.read': 'VIN',
  'vehicle_mileage.read': 'Mileage',
  'vehicle_tire_data.read': 'Tire Data',
  'vehicle_health_data.read': 'Health Data',
  'vehicle_location.read': 'Location',
  'service_request.write': 'Create Service Requests',
  'service_request.read': 'Read Service Requests',
  'appointment.write': 'Create Appointments',
  'appointment.read': 'Read Appointments',
  'incident.write': 'Report Incidents',
  'contact_person.read': 'Contact Person',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  ACTIVE: { label: 'Active', color: 'text-emerald-500', icon: CheckCircle },
  PREPARED: { label: 'Prepared', color: 'text-amber-500', icon: Clock },
  INACTIVE: { label: 'Inactive', color: 'text-gray-400', icon: XCircle },
};

const CASE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  REQUESTED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  BOOKED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  CANCELLED: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

export function ServiceMaintenanceView({ isDarkMode }: { isDarkMode: boolean }) {
  const { orgId } = useRentalOrg();
  const emState = useEuromasterIntegration();
  const [tab, setTab] = useState<ViewTab>('partners');
  const [partners, setPartners] = useState<ServicePartner[]>([]);
  const [assignments, setAssignments] = useState<PartnerAssignment[]>([]);
  const [cases, setCases] = useState<ServiceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailPartner, setDetailPartner] = useState<DetailPartner>(null);
  const [dataAuths, setDataAuths] = useState<Record<string, DataAuth>>({});
  const [showNewCase, setShowNewCase] = useState(false);

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [p, a, c] = await Promise.all([
        api.servicePartners.list(orgId),
        api.servicePartners.assignments(orgId),
        api.servicePartners.cases(orgId),
      ]);
      setPartners(p ?? []);
      setAssignments(a ?? []);
      setCases(c ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDataAuth = useCallback(async (partnerId: string) => {
    if (!orgId) return;
    try {
      const auth = await api.servicePartners.getDataAuth(orgId, partnerId);
      setDataAuths((prev) => ({ ...prev, [partnerId]: auth }));
    } catch { /* silent */ }
  }, [orgId]);

  // Fetch data auth for all partners once loaded
  useEffect(() => {
    if (!orgId || partners.length === 0) return;
    partners.forEach((p) => fetchDataAuth(p.id));
  }, [orgId, partners, fetchDataAuth]);

  const handleAssignPartner = async (partnerId: string) => {
    if (!orgId) return;
    await api.servicePartners.assign(orgId, partnerId, 'MANUAL_ONLY');
    fetchData();
  };

  const handleGrantDataAuth = async (partnerId: string) => {
    if (!orgId) return;
    const auth = dataAuths[partnerId];
    const scopes = auth?.grantedScopes ?? auth?.defaultScopes ?? [];
    if (scopes.length === 0) {
      // Fetch default scopes from backend before granting
      try {
        const fresh = await api.servicePartners.getDataAuth(orgId, partnerId);
        const fallback = fresh?.defaultScopes ?? fresh?.grantedScopes ?? [];
        if (fallback.length > 0) {
          await api.servicePartners.grantDataAuth(orgId, partnerId, fallback, 'current-user');
          fetchDataAuth(partnerId);
          return;
        }
      } catch { /* silent */ }
      return;
    }
    await api.servicePartners.grantDataAuth(orgId, partnerId, scopes, 'current-user');
    fetchDataAuth(partnerId);
  };

  const handleRevokeDataAuth = async (partnerId: string) => {
    if (!orgId) return;
    await api.servicePartners.revokeDataAuth(orgId, partnerId);
    fetchDataAuth(partnerId);
  };

  const cardClass = `rounded-xl border ${isDarkMode ? 'bg-[#1a1a2e] border-white/[0.06]' : 'bg-white border-gray-200'} p-5`;
  const headingClass = `text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`;
  const subClass = `text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const tabBtnClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${active
      ? isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-900 text-white'
      : isDarkMode ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`;

  if (loading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <Loader2 className={`w-6 h-6 animate-spin ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
      </div>
    );
  }

  // Detail view for a specific partner
  if (detailPartner) {
    const partner = partners.find((p) => p.provider === detailPartner);
    const assignment = assignments.find((a) => a.provider === detailPartner);
    const auth = dataAuths[partner?.id ?? ''];
    const partnerCases = cases.filter((c) => c.partner.provider === detailPartner);
    const isEuromaster = detailPartner === 'EUROMASTER';

    return (
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailPartner(null)} className={`text-sm ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>
            ← Back
          </button>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isEuromaster ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
            <Wrench className={`w-5 h-5 ${isEuromaster ? 'text-red-500' : 'text-yellow-500'}`} />
          </div>
          <div>
            <h1 className={headingClass}>{partner?.name ?? detailPartner}</h1>
            <p className={subClass}>{partner?.description}</p>
          </div>
          {partner?.globalStatus && (
            <span className={`ml-auto px-3 py-1 rounded-full text-xs font-medium ${
              partner.globalStatus === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' :
              partner.globalStatus === 'PREPARED' ? 'bg-amber-500/10 text-amber-500' :
              'bg-gray-500/10 text-gray-400'
            }`}>
              {partner.globalStatus === 'ACTIVE' ? 'Active Integration' : partner.globalStatus === 'PREPARED' ? 'Prepared' : 'Inactive'}
            </span>
          )}
        </div>

        {/* Connection Status */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Connection Status</h2>
            {!assignment ? (
              <button onClick={() => partner && handleAssignPartner(partner.id)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                Enable Partner
              </button>
            ) : assignment.status === 'ACTIVE' ? (
              <span className="flex items-center gap-1.5 text-sm text-emerald-500">
                <CheckCircle className="w-4 h-4" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-gray-400">
                <XCircle className="w-4 h-4" /> Inactive
              </span>
            )}
          </div>
          {assignment && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Mode</p>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{assignment.mode.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Connected Since</p>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{assignment.connectedAt ? new Date(assignment.connectedAt).toLocaleDateString() : '—'}</p>
              </div>
              <div>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Features</p>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{assignment.enabledFeatures.length || 'Default'}</p>
              </div>
              <div>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Status</p>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{assignment.status}</p>
              </div>
            </div>
          )}
        </div>

        {/* Data Authorization */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lock className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              <h2 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Data Authorization</h2>
            </div>
            {auth?.status === 'GRANTED' ? (
              <button onClick={() => partner && handleRevokeDataAuth(partner.id)} className="px-3 py-1.5 text-xs text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/10">
                Revoke Access
              </button>
            ) : (
              <button
                onClick={() => partner && handleGrantDataAuth(partner.id)}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={!partner}
              >
                Grant Access
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(auth?.grantedScopes ?? auth?.defaultScopes ?? []).map((scope: string) => (
              <div key={scope} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                auth?.status === 'GRANTED'
                  ? isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                  : isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-50 text-gray-500'
              }`}>
                {auth?.status === 'GRANTED' ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {SCOPE_LABELS[scope] ?? scope}
              </div>
            ))}
          </div>
        </div>

        {/* Capabilities */}
        <div className={cardClass}>
          <h2 className={`font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Capabilities</h2>
          <div className="flex flex-wrap gap-2">
            {(partner?.capabilities ?? []).map((cap: string) => (
              <span key={cap} className={`px-3 py-1 rounded-full text-xs ${isDarkMode ? 'bg-white/5 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                {cap.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>

        {/* Service Cases */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Service Cases</h2>
            {isEuromaster && assignment?.status === 'ACTIVE' && (
              <button onClick={() => setShowNewCase(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                <Plus className="w-3 h-3" /> New Case
              </button>
            )}
          </div>
          {partnerCases.length === 0 ? (
            <p className={subClass}>No service cases yet</p>
          ) : (
            <div className="space-y-2">
              {partnerCases.map((sc) => (
                <div key={sc.id} className={`flex items-center justify-between px-4 py-3 rounded-lg ${isDarkMode ? 'bg-white/[0.03]' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <FileText className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <div>
                      <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{sc.title}</p>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        {sc.vehicle?.licensePlate ?? 'No vehicle'} · {new Date(sc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_COLORS[sc.status] ?? ''}`}>
                    {sc.status.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Euromaster integration status */}
        {isEuromaster && !emState.loading && (
          <div className={`${cardClass}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Integration Status</h2>
              <EuromasterStatusBadge mode={emState.modeSummary} size="md" isDarkMode={isDarkMode} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Enabled</p>
                <p className={`text-sm font-medium ${emState.access?.enabled ? 'text-emerald-500' : isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{emState.access?.enabled ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>API Mode</p>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{emState.access?.liveApiEnabled ? 'Live' : 'Manual'}</p>
              </div>
              <div>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Data Auth</p>
                <p className={`text-sm font-medium ${emState.access?.dataAuthGranted ? 'text-emerald-500' : 'text-amber-500'}`}>{emState.access?.dataAuthGranted ? 'Granted' : 'Required'}</p>
              </div>
              <div>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Scopes</p>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{emState.access?.grantedScopes?.length ?? 0}</p>
              </div>
            </div>
          </div>
        )}

        {!isEuromaster && (
          <div className={`${cardClass} border-dashed`}>
            <div className="flex items-center gap-3">
              <Info className={`w-5 h-5 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />
              <div>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>ADAC Integration — Prepared</p>
                <p className={subClass}>API scope and partnership details are being finalized. Configuration and service actions will become available once the integration is activated.</p>
              </div>
            </div>
          </div>
        )}

        {/* Euromaster new case modal */}
        {isEuromaster && (
          <EuromasterServiceRequestModal
            isDarkMode={isDarkMode}
            isOpen={showNewCase}
            onClose={() => setShowNewCase(false)}
            onSuccess={fetchData}
            prefill={{ context: 'partner-detail' }}
          />
        )}
      </div>
    );
  }

  // Main partner list view
  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Service & Maintenance</h1>
          <p className={subClass}>Manage service partners, data access, and maintenance workflows</p>
        </div>
        <button onClick={fetchData} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('partners')} className={tabBtnClass(tab === 'partners')}>Partners</button>
        <button onClick={() => setTab('cases')} className={tabBtnClass(tab === 'cases')}>Service Cases</button>
        <button onClick={() => setTab('data-auth')} className={tabBtnClass(tab === 'data-auth')}>Data Authorization</button>
      </div>

      {tab === 'partners' && (
        <div className="grid gap-4 md:grid-cols-2">
          {partners.map((partner) => {
            const assignment = assignments.find((a) => a.partnerId === partner.id);
            const statusCfg = STATUS_CONFIG[partner.globalStatus] ?? STATUS_CONFIG.INACTIVE;
            const StatusIcon = statusCfg.icon;
            const isEuromaster = partner.provider === 'EUROMASTER';
            return (
              <div
                key={partner.id}
                className={`${cardClass} cursor-pointer hover:ring-1 ${isDarkMode ? 'hover:ring-white/10' : 'hover:ring-gray-300'} transition-shadow`}
                onClick={() => setDetailPartner(partner.provider as DetailPartner)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isEuromaster ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
                      <Wrench className={`w-5 h-5 ${isEuromaster ? 'text-red-500' : 'text-yellow-500'}`} />
                    </div>
                    <div>
                      <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{partner.name}</h3>
                      <p className={`text-xs ${subClass}`}>{partner.description}</p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon className={`w-3.5 h-3.5 ${statusCfg.color}`} />
                    <span className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</span>
                  </div>
                  {assignment?.status === 'ACTIVE' ? (
                    <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Connected</span>
                  ) : (
                    <span className={`text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>Not connected</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(partner.capabilities as string[]).slice(0, 4).map((cap) => (
                    <span key={cap} className={`px-2 py-0.5 rounded text-[10px] ${isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      {cap.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {(partner.capabilities as string[]).length > 4 && (
                    <span className={`px-2 py-0.5 rounded text-[10px] ${isDarkMode ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
                      +{(partner.capabilities as string[]).length - 4} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'cases' && (
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Recent Service Cases</h2>
          </div>
          {cases.length === 0 ? (
            <div className="text-center py-10">
              <FileText className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={subClass}>No service cases yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cases.map((sc) => (
                <div key={sc.id} className={`flex items-center justify-between px-4 py-3 rounded-lg ${isDarkMode ? 'bg-white/[0.03]' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <FileText className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <div>
                      <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{sc.title}</p>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        {sc.partner.name} · {sc.vehicle?.licensePlate ?? 'Fleet'} · {new Date(sc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_COLORS[sc.status] ?? ''}`}>
                    {sc.status.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'data-auth' && (
        <div className="space-y-4">
          {partners.map((partner) => {
            const auth = dataAuths[partner.id];
            return (
              <div key={partner.id} className={cardClass}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Lock className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                    <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{partner.name}</h3>
                  </div>
                  {auth?.status === 'GRANTED' ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                      <Unlock className="w-3 h-3" /> Granted
                    </span>
                  ) : (
                    <span className={`flex items-center gap-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      <Lock className="w-3 h-3" /> Not granted
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {(auth?.grantedScopes ?? auth?.defaultScopes ?? []).map((scope: string) => (
                    <div key={scope} className={`px-3 py-1.5 rounded-lg text-xs ${
                      auth?.status === 'GRANTED'
                        ? isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                        : isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-50 text-gray-500'
                    }`}>
                      {SCOPE_LABELS[scope] ?? scope}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
