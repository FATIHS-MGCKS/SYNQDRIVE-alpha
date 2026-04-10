import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Wrench, CheckCircle, XCircle, Clock, Shield, Lock, Unlock,
  Building2, FileText, RefreshCw, Loader2, ChevronRight,
  AlertTriangle, ArrowLeft, Eye, Settings,
  ChevronDown, Search,
} from 'lucide-react';
import { api } from '../../lib/api';

/* ───── Type definitions ───── */

interface Partner {
  id: string;
  provider: string;
  name: string;
  category: string;
  globalStatus: string;
  description: string;
  capabilities: string[];
  connectedOrgsCount: number;
}

interface PartnerDetail {
  id: string;
  provider: string;
  name: string;
  category: string;
  globalStatus: string;
  description: string;
  capabilities: string[];
  defaultScopes: string[];
  createdAt: string;
  assignments: AssignmentDetail[];
  authorizations: AuthDetail[];
  caseStats: Record<string, number>;
  recentCases: CaseSummary[];
}

interface AssignmentDetail {
  id: string;
  organizationId: string;
  orgName: string;
  status: string;
  mode: string;
  enabledFeatures: string[];
  connectedAt: string | null;
  createdAt: string;
}

interface AuthDetail {
  id: string;
  organizationId: string;
  orgName: string;
  status: string;
  grantedScopes: string[];
  missingScopes: string[];
  isComplete: boolean;
  grantedBy: string | null;
  grantedAt: string | null;
  revokedAt: string | null;
  notes: string | null;
}

interface CaseSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  orgName: string;
  vehiclePlate: string | null;
  createdAt: string;
}

interface AdminStats {
  totalPartners: number;
  activeAssignments: number;
  grantedAuths: number;
  totalCases: number;
  activeCases: number;
}

interface AuthSummaryEntry {
  organizationId: string;
  orgName: string;
  assignmentStatus: string;
  assignmentMode: string;
  authStatus: string;
  grantedScopes: string[];
  missingScopes: string[];
  isComplete: boolean;
  isBlocked: boolean;
  blockReason: string | null;
}

interface OrgOption {
  id: string;
  companyName: string;
}

type AdminTab = 'overview' | 'partners' | 'assignments' | 'data-auth' | 'cases';

/* ───── Constants ───── */

const STATUS_BADGE: Record<string, { label: string; cls: string; icon?: typeof CheckCircle }> = {
  ACTIVE:         { label: 'Active',         cls: 'bg-emerald-500/10 text-emerald-500', icon: CheckCircle },
  PREPARED:       { label: 'Prepared',       cls: 'bg-amber-500/10 text-amber-500',     icon: Clock },
  INACTIVE:       { label: 'Inactive',       cls: 'bg-gray-500/10 text-gray-400',       icon: XCircle },
  GRANTED:        { label: 'Granted',        cls: 'bg-emerald-500/10 text-emerald-500', icon: Unlock },
  REVOKED:        { label: 'Revoked',        cls: 'bg-red-500/10 text-red-400',         icon: Lock },
  PENDING:        { label: 'Pending',        cls: 'bg-amber-500/10 text-amber-500',     icon: Clock },
  SUSPENDED:      { label: 'Suspended',      cls: 'bg-orange-500/10 text-orange-400',   icon: AlertTriangle },
  NOT_CONFIGURED: { label: 'Not configured', cls: 'bg-gray-500/10 text-gray-400',       icon: Settings },
  PARTIAL:        { label: 'Partial',        cls: 'bg-amber-500/10 text-amber-500',     icon: AlertTriangle },
};

const CASE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  REQUESTED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  BOOKED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  CANCELLED: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const MODE_LABELS: Record<string, string> = {
  MANUAL_ONLY: 'Manual only',
  PREPARED: 'Prepared',
  ACTIVE: 'Active',
  READ_ONLY: 'Read only',
  FULL_ACCESS: 'Full access',
};

/* ───── Component ───── */

export function ServiceMaintenanceAdminView({ isDarkMode }: { isDarkMode: boolean }) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail view state
  const [detailProvider, setDetailProvider] = useState<string | null>(null);
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const [authSummary, setAuthSummary] = useState<AuthSummaryEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'info' | 'assignments' | 'authorization' | 'cases'>('info');

  // Grant auth modal
  const [grantModal, setGrantModal] = useState<{ orgId: string; orgName: string; partnerId: string; defaultScopes: string[] } | null>(null);
  const [grantScopes, setGrantScopes] = useState<string[]>([]);
  const [grantNotes, setGrantNotes] = useState('');
  const [grantSubmitting, setGrantSubmitting] = useState(false);

  // Assign modal
  const [assignModal, setAssignModal] = useState<{ partnerId: string; partnerName: string } | null>(null);
  const [assignOrgId, setAssignOrgId] = useState('');
  const [assignMode, setAssignMode] = useState('MANUAL_ONLY');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgSearch, setOrgSearch] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, c] = await Promise.all([
        api.servicePartnersAdmin.list(),
        api.servicePartnersAdmin.stats(),
        api.servicePartnersAdmin.cases(30),
      ]);
      setPartners(p ?? []);
      setStats(s);
      setCases(c ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openDetail = useCallback(async (provider: string) => {
    setDetailProvider(provider);
    setDetailLoading(true);
    setDetailTab('info');
    try {
      const d = await api.servicePartnersAdmin.detail(provider);
      setDetail(d);
      if (d?.id) {
        const summary = await api.servicePartnersAdmin.authSummary(d.id);
        setAuthSummary(summary ?? []);
      }
    } catch { /* silent */ }
    setDetailLoading(false);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailProvider(null);
    setDetail(null);
    setAuthSummary([]);
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!detailProvider) return;
    await openDetail(detailProvider);
  }, [detailProvider, openDetail]);

  const handleSeed = async () => {
    await api.servicePartnersAdmin.seed();
    fetchAll();
  };

  // Grant auth
  const openGrantModal = (orgId: string, orgName: string, partnerId: string, defaultScopes: string[]) => {
    setGrantModal({ orgId, orgName, partnerId, defaultScopes });
    setGrantScopes([...defaultScopes]);
    setGrantNotes('');
  };

  const submitGrant = async () => {
    if (!grantModal) return;
    setGrantSubmitting(true);
    try {
      await api.servicePartnersAdmin.grantAuth(grantModal.orgId, grantModal.partnerId, grantScopes, 'master_admin', grantNotes || undefined);
      setGrantModal(null);
      await refreshDetail();
    } catch { /* silent */ }
    setGrantSubmitting(false);
  };

  const handleRevoke = async (orgId: string, partnerId: string) => {
    try {
      await api.servicePartnersAdmin.revokeAuth(orgId, partnerId);
      await refreshDetail();
    } catch { /* silent */ }
  };

  // Assign org
  const openAssignModal = async (partnerId: string, partnerName: string) => {
    setAssignModal({ partnerId, partnerName });
    setAssignOrgId('');
    setAssignMode('MANUAL_ONLY');
    try {
      const res = await api.organizations.list({ limit: 200 });
      setOrgs((res?.data ?? []).map((o: any) => ({ id: o.id, companyName: o.companyName ?? o.name ?? o.id })));
    } catch { setOrgs([]); }
  };

  const submitAssign = async () => {
    if (!assignModal || !assignOrgId) return;
    setAssignSubmitting(true);
    try {
      await api.servicePartnersAdmin.adminAssign(assignOrgId, assignModal.partnerId, assignMode);
      setAssignModal(null);
      await refreshDetail();
    } catch { /* silent */ }
    setAssignSubmitting(false);
  };

  const filteredOrgs = useMemo(() => {
    if (!orgSearch) return orgs;
    const q = orgSearch.toLowerCase();
    return orgs.filter((o) => o.companyName.toLowerCase().includes(q) || o.id.includes(q));
  }, [orgs, orgSearch]);

  /* ───── Style helpers ───── */
  const cardClass = `rounded-xl border ${isDarkMode ? 'bg-[#1a1a2e] border-white/[0.06]' : 'bg-white border-gray-200'} p-5`;
  const headingClass = `text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`;
  const subClass = `text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const labelClass = `text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`;
  const valueClass = `text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`;
  const rowBg = isDarkMode ? 'bg-white/[0.03]' : 'bg-gray-50';
  const inputClass = `w-full px-3 py-2 rounded-lg text-sm border ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-gray-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'}`;

  const tabBtnClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${active
      ? isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-900 text-white'
      : isDarkMode ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`;

  const btnPrimary = `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isDarkMode ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-gray-900 text-white hover:bg-gray-800'}`;
  const btnSecondary = `px-3 py-1.5 text-xs rounded-lg ${isDarkMode ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`;
  const btnDanger = `px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20`;

  const badge = (status: string) => {
    const cfg = STATUS_BADGE[status] ?? STATUS_BADGE.INACTIVE;
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
  };

  const scopeTag = (scope: string, variant: 'granted' | 'missing') => (
    <span key={scope} className={`px-2 py-0.5 rounded text-[10px] font-mono ${
      variant === 'granted'
        ? isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
        : isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'
    }`}>{scope}</span>
  );

  /* ───── Loading ───── */
  if (loading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <Loader2 className={`w-6 h-6 animate-spin ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
      </div>
    );
  }

  /* ───── Partner Detail View ───── */
  if (detailProvider) {
    if (detailLoading || !detail) {
      return (
        <div className="flex-1 p-6 flex items-center justify-center">
          <Loader2 className={`w-6 h-6 animate-spin ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
        </div>
      );
    }

    const isEuromaster = detail.provider === 'EUROMASTER';
    const totalCases = Object.values(detail.caseStats).reduce((a, b) => a + b, 0);
    const blockedOrgs = authSummary.filter((a) => a.isBlocked);

    return (
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={closeDetail} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isEuromaster ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
            <Wrench className={`w-5 h-5 ${isEuromaster ? 'text-red-500' : 'text-yellow-500'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{detail.name}</h1>
              {badge(detail.globalStatus)}
            </div>
            <p className={subClass}>{detail.description}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => openAssignModal(detail.id, detail.name)} className={btnSecondary}>Assign Org</button>
            <button onClick={refreshDetail} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Enforcement warnings */}
        {blockedOrgs.length > 0 && (
          <div className={`rounded-xl border px-4 py-3 ${isDarkMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-amber-400' : 'text-amber-800'}`}>
                  {blockedOrgs.length} organization{blockedOrgs.length > 1 ? 's' : ''} blocked from using {detail.name}
                </p>
                <div className="mt-1 space-y-0.5">
                  {blockedOrgs.slice(0, 5).map((b) => (
                    <p key={b.organizationId} className={`text-xs ${isDarkMode ? 'text-amber-500/70' : 'text-amber-700'}`}>
                      {b.orgName}: {b.blockReason}
                    </p>
                  ))}
                  {blockedOrgs.length > 5 && (
                    <p className={`text-xs ${isDarkMode ? 'text-amber-500/50' : 'text-amber-600'}`}>
                      +{blockedOrgs.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Assignments', value: detail.assignments.length, icon: Building2 },
            { label: 'Authorizations', value: detail.authorizations.filter((a) => a.status === 'GRANTED').length, icon: Shield },
            { label: 'Total Cases', value: totalCases, icon: FileText },
            { label: 'Capabilities', value: detail.capabilities.length, icon: Wrench },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className={cardClass}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <p className={labelClass}>{label}</p>
              </div>
              <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Detail tabs */}
        <div className="flex gap-2 flex-wrap">
          {(['info', 'assignments', 'authorization', 'cases'] as const).map((t) => (
            <button key={t} onClick={() => setDetailTab(t)} className={tabBtnClass(detailTab === t)}>
              {t === 'info' ? 'Configuration' : t === 'assignments' ? 'Org Assignments' : t === 'authorization' ? 'Data Authorization' : 'Service Cases'}
            </button>
          ))}
        </div>

        {/* Info tab */}
        {detailTab === 'info' && (
          <div className="space-y-4">
            <div className={cardClass}>
              <h3 className={headingClass + ' mb-4'}>Partner Configuration</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p className={labelClass}>Provider</p><p className={valueClass}>{detail.provider}</p></div>
                <div><p className={labelClass}>Category</p><p className={valueClass}>{detail.category.replace(/_/g, ' ')}</p></div>
                <div><p className={labelClass}>Global Status</p><div className="mt-1">{badge(detail.globalStatus)}</div></div>
                <div><p className={labelClass}>Created</p><p className={valueClass}>{new Date(detail.createdAt).toLocaleDateString()}</p></div>
                <div><p className={labelClass}>Required Scopes</p><p className={valueClass}>{detail.defaultScopes.length}</p></div>
              </div>
            </div>

            <div className={cardClass}>
              <h3 className={headingClass + ' mb-3'}>Capabilities</h3>
              <div className="flex flex-wrap gap-1.5">
                {detail.capabilities.map((cap) => (
                  <span key={cap} className={`px-2 py-0.5 rounded text-xs ${isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                    {cap.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>

            <div className={cardClass}>
              <h3 className={headingClass + ' mb-3'}>Required Data Scopes</h3>
              <p className={`${subClass} mb-3`}>These scopes must be granted per organization for full integration functionality.</p>
              <div className="flex flex-wrap gap-1.5">
                {detail.defaultScopes.map((s) => scopeTag(s, 'granted'))}
              </div>
            </div>

            {Object.keys(detail.caseStats).length > 0 && (
              <div className={cardClass}>
                <h3 className={headingClass + ' mb-3'}>Case Distribution</h3>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {Object.entries(detail.caseStats).map(([status, count]) => (
                    <div key={status} className="text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-1 ${CASE_STATUS_COLORS[status] ?? ''}`}>
                        {status.replace(/_/g, ' ')}
                      </span>
                      <p className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Assignments tab */}
        {detailTab === 'assignments' && (
          <div className={cardClass}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={headingClass}>Organization Assignments</h3>
              <button onClick={() => openAssignModal(detail.id, detail.name)} className={btnSecondary}>+ Assign</button>
            </div>
            {detail.assignments.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                <p className={subClass}>No organizations assigned yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {detail.assignments.map((a) => {
                  const auth = detail.authorizations.find((au) => au.organizationId === a.organizationId);
                  const authBlocked = !auth || auth.status !== 'GRANTED' || auth.missingScopes.length > 0;
                  return (
                    <div key={a.id} className={`px-4 py-3 rounded-lg ${rowBg}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Building2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <div>
                            <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{a.orgName}</p>
                            <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {MODE_LABELS[a.mode] ?? a.mode}
                              {a.connectedAt && ` · since ${new Date(a.connectedAt).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {badge(a.status)}
                          {authBlocked && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-500">
                              <Lock className="w-3 h-3" /> Auth incomplete
                            </span>
                          )}
                        </div>
                      </div>
                      {authBlocked && (
                        <div className={`mt-2 flex items-center justify-between text-xs ${isDarkMode ? 'text-amber-500/70' : 'text-amber-700'}`}>
                          <span>
                            {!auth ? 'No data authorization configured' : auth.missingScopes.length > 0 ? `Missing ${auth.missingScopes.length} scope(s)` : `Authorization ${auth.status.toLowerCase()}`}
                          </span>
                          <button
                            onClick={() => openGrantModal(a.organizationId, a.orgName, detail.id, detail.defaultScopes)}
                            className="underline hover:no-underline"
                          >
                            Grant authorization
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Authorization tab */}
        {detailTab === 'authorization' && (
          <div className="space-y-4">
            {/* Auth summary */}
            {authSummary.length > 0 && (
              <div className={cardClass}>
                <div className="flex items-center gap-2 mb-4">
                  <Shield className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                  <h3 className={headingClass}>Authorization Enforcement Summary</h3>
                </div>
                <div className="space-y-2">
                  {authSummary.map((entry) => (
                    <div key={entry.organizationId} className={`flex items-center justify-between px-4 py-3 rounded-lg ${rowBg}`}>
                      <div className="flex items-center gap-3">
                        {entry.isComplete ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                        <div>
                          <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{entry.orgName}</p>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {entry.grantedScopes.length}/{detail.defaultScopes.length} scopes · {MODE_LABELS[entry.assignmentMode] ?? entry.assignmentMode}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.isComplete ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500">Fully authorized</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500">{entry.blockReason}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-org auth detail */}
            <div className={cardClass}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={headingClass}>Data Authorizations</h3>
              </div>
              {detail.authorizations.length === 0 ? (
                <div className="text-center py-8">
                  <Lock className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={subClass}>No data authorizations configured</p>
                  <p className={`${labelClass} mt-1`}>Assign organizations first, then grant data authorization scopes.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {detail.authorizations.map((auth) => (
                    <div key={auth.id} className={`rounded-lg ${rowBg} p-4`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {auth.isComplete ? <Unlock className="w-4 h-4 text-emerald-500" /> : <Lock className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />}
                          <div>
                            <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{auth.orgName}</p>
                            <p className={labelClass}>
                              {auth.grantedScopes.length} granted
                              {auth.missingScopes.length > 0 && ` · ${auth.missingScopes.length} missing`}
                              {auth.grantedBy && ` · by ${auth.grantedBy}`}
                              {auth.grantedAt && ` · ${new Date(auth.grantedAt).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {badge(auth.isComplete ? 'GRANTED' : auth.status === 'GRANTED' ? 'PARTIAL' : auth.status)}
                          <button
                            onClick={() => openGrantModal(auth.organizationId, auth.orgName, detail.id, detail.defaultScopes)}
                            className={btnSecondary}
                          >
                            Edit
                          </button>
                          {auth.status === 'GRANTED' && (
                            <button onClick={() => handleRevoke(auth.organizationId, detail.id)} className={btnDanger}>
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Scope visualization */}
                      <div className="space-y-2">
                        {auth.grantedScopes.length > 0 && (
                          <div>
                            <p className={`${labelClass} mb-1`}>Granted scopes</p>
                            <div className="flex flex-wrap gap-1">{auth.grantedScopes.map((s) => scopeTag(s, 'granted'))}</div>
                          </div>
                        )}
                        {auth.missingScopes.length > 0 && (
                          <div>
                            <p className={`${labelClass} mb-1`}>Missing scopes</p>
                            <div className="flex flex-wrap gap-1">{auth.missingScopes.map((s) => scopeTag(s, 'missing'))}</div>
                          </div>
                        )}
                      </div>

                      {auth.notes && (
                        <p className={`${labelClass} mt-2 italic`}>Note: {auth.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cases tab */}
        {detailTab === 'cases' && (
          <div className={cardClass}>
            <h3 className={headingClass + ' mb-4'}>Recent Service Cases</h3>
            {detail.recentCases.length === 0 ? (
              <div className="text-center py-8">
                <FileText className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                <p className={subClass}>No service cases yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {detail.recentCases.map((sc) => (
                  <div key={sc.id} className={`flex items-center justify-between px-4 py-3 rounded-lg ${rowBg}`}>
                    <div className="flex items-center gap-3">
                      <FileText className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <div>
                        <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{sc.title}</p>
                        <p className={labelClass}>{sc.orgName} · {sc.vehiclePlate ?? 'Fleet'} · {sc.type.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_COLORS[sc.status] ?? ''}`}>
                        {sc.status.replace(/_/g, ' ')}
                      </span>
                      <span className={labelClass}>{new Date(sc.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ───── Main Overview ───── */
  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Service & Maintenance — Admin</h1>
          <p className={subClass}>Central oversight for service partner integrations, assignments, and data authorization</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSeed} className={btnSecondary}>Seed Partners</button>
          <button onClick={fetchAll} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Partners', value: stats.totalPartners, icon: Wrench },
            { label: 'Active Assignments', value: stats.activeAssignments, icon: Building2 },
            { label: 'Data Authorizations', value: stats.grantedAuths, icon: Shield },
            { label: 'Total Cases', value: stats.totalCases, icon: FileText },
            { label: 'Active Cases', value: stats.activeCases, icon: Clock },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className={cardClass}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <p className={labelClass}>{label}</p>
              </div>
              <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['overview', 'partners', 'assignments', 'data-auth', 'cases'] as AdminTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tabBtnClass(tab === t)}>
            {t === 'overview' ? 'Overview' : t === 'partners' ? 'Partners' : t === 'assignments' ? 'Org Assignments' : t === 'data-auth' ? 'Data Authorization' : 'Service Cases'}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-3">
          {partners.map((p) => {
            const isEuromaster = p.provider === 'EUROMASTER';
            return (
              <button key={p.id} onClick={() => openDetail(p.provider)} className={`${cardClass} w-full text-left hover:ring-1 ${isDarkMode ? 'hover:ring-white/10' : 'hover:ring-gray-300'} transition-all`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isEuromaster ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
                      <Wrench className={`w-5 h-5 ${isEuromaster ? 'text-red-500' : 'text-yellow-500'}`} />
                    </div>
                    <div>
                      <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{p.name}</h3>
                      <p className={`text-xs ${subClass}`}>{p.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {badge(p.globalStatus)}
                    <span className={labelClass}>{p.connectedOrgsCount} org{p.connectedOrgsCount !== 1 ? 's' : ''}</span>
                    <ChevronRight className={`w-4 h-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(p.capabilities as string[]).map((cap) => (
                    <span key={cap} className={`px-2 py-0.5 rounded text-[10px] ${isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      {cap.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
          {partners.length === 0 && (
            <div className="text-center py-12">
              <Wrench className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={subClass}>No service partners configured</p>
              <button onClick={handleSeed} className={`${btnSecondary} mt-3`}>Seed default partners</button>
            </div>
          )}
        </div>
      )}

      {/* Partners */}
      {tab === 'partners' && (
        <div className="grid gap-4 md:grid-cols-2">
          {partners.map((p) => {
            const isEuromaster = p.provider === 'EUROMASTER';
            return (
              <div key={p.id} className={cardClass}>
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isEuromaster ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
                    <Wrench className={`w-5 h-5 ${isEuromaster ? 'text-red-500' : 'text-yellow-500'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{p.name}</h3>
                      {badge(p.globalStatus)}
                    </div>
                    <p className={`text-xs ${subClass} mt-1`}>{p.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                  <div><p className={labelClass}>Category</p><p className={valueClass}>{p.category.replace(/_/g, ' ')}</p></div>
                  <div><p className={labelClass}>Connected Orgs</p><p className={valueClass}>{p.connectedOrgsCount}</p></div>
                  <div><p className={labelClass}>Provider</p><p className={valueClass}>{p.provider}</p></div>
                  <div><p className={labelClass}>Capabilities</p><p className={valueClass}>{(p.capabilities as string[]).length}</p></div>
                </div>
                <button onClick={() => openDetail(p.provider)} className={`${btnPrimary} w-full flex items-center justify-center gap-2`}>
                  <Eye className="w-4 h-4" /> View Detail
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Assignments */}
      {tab === 'assignments' && <AssignmentsListView isDarkMode={isDarkMode} cardClass={cardClass} headingClass={headingClass} subClass={subClass} labelClass={labelClass} rowBg={rowBg} badge={badge} />}

      {/* Data Auth */}
      {tab === 'data-auth' && <DataAuthListView isDarkMode={isDarkMode} cardClass={cardClass} headingClass={headingClass} subClass={subClass} labelClass={labelClass} rowBg={rowBg} badge={badge} scopeTag={scopeTag} />}

      {/* Cases */}
      {tab === 'cases' && (
        <div className={cardClass}>
          <h2 className={headingClass + ' mb-4'}>Recent Service Cases</h2>
          {cases.length === 0 ? (
            <div className="text-center py-8">
              <FileText className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={subClass}>No service cases yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cases.map((sc: any) => (
                <div key={sc.id} className={`flex items-center justify-between px-4 py-3 rounded-lg ${rowBg}`}>
                  <div className="flex items-center gap-3">
                    <FileText className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <div>
                      <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{sc.title}</p>
                      <p className={labelClass}>
                        {sc.organization?.companyName ?? '—'} · {sc.partner?.name ?? '—'} · {sc.vehicle?.licensePlate ?? 'Fleet'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_COLORS[sc.status] ?? ''}`}>
                      {(sc.status ?? '').replace(/_/g, ' ')}
                    </span>
                    <span className={labelClass}>{sc.createdAt ? new Date(sc.createdAt).toLocaleDateString() : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───── Grant Auth Modal ───── */}
      {grantModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setGrantModal(null)} />
          <div className={`relative w-full max-w-lg rounded-2xl border p-6 ${isDarkMode ? 'bg-[#1a1a2e] border-white/10' : 'bg-white border-gray-200'}`}>
            <h2 className={headingClass + ' mb-1'}>Grant Data Authorization</h2>
            <p className={subClass + ' mb-4'}>{grantModal.orgName}</p>

            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {grantModal.defaultScopes.map((scope) => {
                const checked = grantScopes.includes(scope);
                return (
                  <label key={scope} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${rowBg} hover:ring-1 ${isDarkMode ? 'hover:ring-white/10' : 'hover:ring-gray-300'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setGrantScopes((prev) => checked ? prev.filter((s) => s !== scope) : [...prev, scope])}
                      className="rounded"
                    />
                    <span className={`text-sm font-mono ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{scope}</span>
                  </label>
                );
              })}
            </div>

            <div className="mb-4">
              <label className={labelClass + ' block mb-1'}>Notes (optional)</label>
              <input value={grantNotes} onChange={(e) => setGrantNotes(e.target.value)} placeholder="Compliance reference, admin notes..." className={inputClass} />
            </div>

            <div className="flex items-center justify-between">
              <p className={labelClass}>{grantScopes.length}/{grantModal.defaultScopes.length} scopes selected</p>
              <div className="flex gap-2">
                <button onClick={() => setGrantModal(null)} className={btnSecondary}>Cancel</button>
                <button onClick={() => setGrantScopes([...grantModal.defaultScopes])} className={btnSecondary}>Select all</button>
                <button onClick={submitGrant} disabled={grantSubmitting || grantScopes.length === 0} className={`${btnPrimary} disabled:opacity-50`}>
                  {grantSubmitting ? 'Granting…' : 'Grant'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───── Assign Org Modal ───── */}
      {assignModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAssignModal(null)} />
          <div className={`relative w-full max-w-md rounded-2xl border p-6 ${isDarkMode ? 'bg-[#1a1a2e] border-white/10' : 'bg-white border-gray-200'}`}>
            <h2 className={headingClass + ' mb-1'}>Assign Organization</h2>
            <p className={subClass + ' mb-4'}>to {assignModal.partnerName}</p>

            <div className="mb-3">
              <label className={labelClass + ' block mb-1'}>Search organization</label>
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                <input value={orgSearch} onChange={(e) => setOrgSearch(e.target.value)} placeholder="Name or ID..." className={`${inputClass} pl-9`} />
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
              {filteredOrgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setAssignOrgId(o.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    assignOrgId === o.id
                      ? isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-900 text-white'
                      : isDarkMode ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="font-medium">{o.companyName}</span>
                  <span className={`ml-2 text-xs ${assignOrgId === o.id ? 'opacity-70' : isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>{o.id.slice(0, 8)}…</span>
                </button>
              ))}
              {filteredOrgs.length === 0 && <p className={`${subClass} text-center py-4`}>No organizations found</p>}
            </div>

            <div className="mb-4">
              <label className={labelClass + ' block mb-1'}>Mode</label>
              <div className="flex gap-2">
                {['MANUAL_ONLY', 'ACTIVE', 'FULL_ACCESS'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setAssignMode(m)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${
                      assignMode === m
                        ? isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-900 text-white'
                        : isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setAssignModal(null)} className={btnSecondary}>Cancel</button>
              <button onClick={submitAssign} disabled={assignSubmitting || !assignOrgId} className={`${btnPrimary} disabled:opacity-50`}>
                {assignSubmitting ? 'Assigning…' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───── Assignments List sub-component ───── */

function AssignmentsListView({ isDarkMode, cardClass, headingClass, subClass, labelClass, rowBg, badge }: {
  isDarkMode: boolean; cardClass: string; headingClass: string; subClass: string; labelClass: string; rowBg: string;
  badge: (s: string) => JSX.Element;
}) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const a = await api.servicePartnersAdmin.assignments();
        setAssignments(a ?? []);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className={`w-5 h-5 animate-spin ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /></div>;

  return (
    <div className={cardClass}>
      <h2 className={headingClass + ' mb-4'}>Organization Assignments</h2>
      {assignments.length === 0 ? (
        <div className="text-center py-8">
          <Building2 className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={subClass}>No partner assignments yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map((a: any) => (
            <div key={a.id} className={`flex items-center justify-between px-4 py-3 rounded-lg ${rowBg}`}>
              <div className="flex items-center gap-3">
                <Building2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <div>
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{a.orgName}</p>
                  <p className={labelClass}>{a.partnerName} · {(MODE_LABELS[a.mode] ?? a.mode)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {badge(a.status)}
                {a.connectedAt && <span className={labelClass}>since {new Date(a.connectedAt).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───── Data Auth List sub-component ───── */

function DataAuthListView({ isDarkMode, cardClass, headingClass, subClass, labelClass, rowBg, badge, scopeTag }: {
  isDarkMode: boolean; cardClass: string; headingClass: string; subClass: string; labelClass: string; rowBg: string;
  badge: (s: string) => JSX.Element;
  scopeTag: (scope: string, variant: 'granted' | 'missing') => JSX.Element;
}) {
  const [dataAuths, setDataAuths] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.servicePartnersAdmin.dataAuthorizations();
        setDataAuths(d ?? []);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className={`w-5 h-5 animate-spin ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /></div>;

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2 mb-4">
        <Shield className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
        <h2 className={headingClass}>Data Authorization Overview</h2>
      </div>
      {dataAuths.length === 0 ? (
        <div className="text-center py-8">
          <Lock className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={subClass}>No data authorizations configured</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dataAuths.map((d: any) => (
            <div key={d.id}>
              <button
                onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg ${rowBg} hover:ring-1 ${isDarkMode ? 'hover:ring-white/10' : 'hover:ring-gray-300'} transition-all`}
              >
                <div className="flex items-center gap-3">
                  {d.status === 'GRANTED' ? <Unlock className="w-4 h-4 text-emerald-500" /> : <Lock className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />}
                  <div className="text-left">
                    <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{d.orgName}</p>
                    <p className={labelClass}>{d.partnerName} · {(d.grantedScopes as string[]).length} scopes</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {badge(d.status)}
                  {d.grantedAt && <span className={labelClass}>{new Date(d.grantedAt).toLocaleDateString()}</span>}
                  <ChevronDown className={`w-4 h-4 transition-transform ${expanded === d.id ? 'rotate-180' : ''} ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                </div>
              </button>
              {expanded === d.id && (
                <div className={`px-4 py-3 mt-1 rounded-lg ${isDarkMode ? 'bg-white/[0.02]' : 'bg-gray-50'}`}>
                  <div className="flex flex-wrap gap-1">
                    {(d.grantedScopes as string[]).map((s: string) => scopeTag(s, 'granted'))}
                  </div>
                  {d.grantedBy && <p className={`${labelClass} mt-2`}>Granted by: {d.grantedBy}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
