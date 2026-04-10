import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Building2, Users, FileText, ScrollText, HeartPulse, Shield,
  Search, Plus, RefreshCw, Settings2, CheckCircle, XCircle, AlertTriangle,
  Loader2, ChevronLeft, ChevronRight, ToggleLeft, ToggleRight, Zap, Clock,
  Activity, X, Save, TestTube, ChevronDown, ChevronUp, Eye, Mail, Globe,
  Phone, User, Send, Target, Radio, BarChart3
} from 'lucide-react';
import { api } from '../../lib/api';
import type {
  InsuranceHealthOverview, InsuranceDisclosureTemplate, InsuranceInquiryTemplateEntry,
  InsurancePartnerContactEntry, InsuranceInquiryRow, InsuranceAuthorizationLogEntry,
  InsuranceConnectionTestResult,
} from '../../lib/api';

interface InsurancesAdminViewProps {
  isDarkMode: boolean;
}

type TabId = 'overview' | 'partners' | 'contacts' | 'disclosure-templates' | 'inquiry-templates' | 'inquiries' | 'health';

const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'partners', label: 'Partners', icon: Building2 },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'disclosure-templates', label: 'Disclosures', icon: FileText },
  { id: 'inquiry-templates', label: 'Inquiry Templates', icon: ScrollText },
  { id: 'inquiries', label: 'Inquiries', icon: Send },
  { id: 'health', label: 'Health', icon: HeartPulse },
];

const CHANNELS = ['EMAIL', 'API', 'WEBHOOK', 'MANUAL'] as const;
const INQUIRY_TYPES = ['QUOTE_REQUEST', 'POLICY_CHANGE', 'CLAIM_REPORT', 'RENEWAL', 'CANCELLATION'] as const;
const INSURANCE_MODELS = ['LIABILITY', 'COMPREHENSIVE', 'PARTIAL_COMPREHENSIVE', 'FLEET', 'GAP', 'BREAKDOWN'] as const;
const DATA_TYPES = ['TRIPS', 'DRIVING_SCORE', 'MILEAGE', 'DTC_CODES', 'BATTERY', 'TIRE_HEALTH', 'BRAKES', 'LOCATION'] as const;
const ENVIRONMENTS = ['SANDBOX', 'PRODUCTION'] as const;

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-emerald-500', HEALTHY: 'bg-emerald-500',
  degraded: 'bg-amber-500', DEGRADED: 'bg-amber-500',
  down: 'bg-red-500', DOWN: 'bg-red-500',
  unknown: 'bg-gray-400', UNKNOWN: 'bg-gray-400',
};

const STATUS_TEXT: Record<string, string> = {
  healthy: 'text-emerald-500', HEALTHY: 'text-emerald-500',
  degraded: 'text-amber-500', DEGRADED: 'text-amber-500',
  down: 'text-red-500', DOWN: 'text-red-500',
  unknown: 'text-gray-400', UNKNOWN: 'text-gray-400',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Spinner({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className={`w-7 h-7 animate-spin ${isDarkMode ? 'text-indigo-400' : 'text-indigo-500'}`} />
    </div>
  );
}

function ErrorBanner({ isDarkMode, card, message, onRetry }: { isDarkMode: boolean; card: string; message: string; onRetry: () => void }) {
  return (
    <div className={`${card} p-6 flex items-center gap-4`}>
      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
      <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} flex-1`}>{message}</p>
      <button onClick={onRetry} className="text-xs font-semibold text-indigo-500 hover:underline flex items-center gap-1">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${color}`}>{label}</span>;
}

export function InsurancesAdminView({ isDarkMode }: InsurancesAdminViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const card = `rounded-2xl shadow-sm border ${
    isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'
  }`;
  const inputCls = `w-full px-4 py-2.5 rounded-xl border text-sm transition-colors outline-none ${
    isDarkMode
      ? 'bg-neutral-800 border-neutral-700 text-gray-200 focus:border-indigo-500/60 placeholder:text-gray-600'
      : 'bg-gray-50 border-gray-200 text-gray-700 focus:border-indigo-400 placeholder:text-gray-400'
  }`;
  const labelCls = `block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const headCls = `text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`;

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className={`text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          Insurance — Admin
        </h1>
        <p className={`text-sm mt-1.5 font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Partner registry, templates, inquiry monitoring, and diagnostics
        </p>
      </div>

      <div className={`flex gap-1 p-1 rounded-2xl overflow-x-auto w-fit ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === t.id
                ? isDarkMode ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                : isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab isDarkMode={isDarkMode} card={card} />}
      {activeTab === 'partners' && <PartnersTab isDarkMode={isDarkMode} card={card} inputCls={inputCls} labelCls={labelCls} headCls={headCls} />}
      {activeTab === 'contacts' && <ContactsTab isDarkMode={isDarkMode} card={card} inputCls={inputCls} labelCls={labelCls} headCls={headCls} />}
      {activeTab === 'disclosure-templates' && <DisclosureTemplatesTab isDarkMode={isDarkMode} card={card} inputCls={inputCls} labelCls={labelCls} headCls={headCls} />}
      {activeTab === 'inquiry-templates' && <InquiryTemplatesTab isDarkMode={isDarkMode} card={card} inputCls={inputCls} labelCls={labelCls} headCls={headCls} />}
      {activeTab === 'inquiries' && <InquiriesTab isDarkMode={isDarkMode} card={card} inputCls={inputCls} headCls={headCls} />}
      {activeTab === 'health' && <HealthTab isDarkMode={isDarkMode} card={card} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 1 — Overview Dashboard
   ═══════════════════════════════════════════════ */
function OverviewTab({ isDarkMode, card }: { isDarkMode: boolean; card: string }) {
  const [health, setHealth] = useState<InsuranceHealthOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setHealth(await api.insurances.admin.health()); } catch { setHealth(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner isDarkMode={isDarkMode} />;
  if (!health) return <ErrorBanner isDarkMode={isDarkMode} card={card} message="Failed to load overview." onRetry={load} />;

  const stats: { label: string; value: number; color?: string; icon: typeof Shield }[] = [
    { label: 'Total Partners', value: health.totalPartners, icon: Building2 },
    { label: 'Active Partners', value: health.activePartners, icon: CheckCircle },
    { label: 'Healthy', value: health.healthyPartners, color: 'text-emerald-500', icon: HeartPulse },
    { label: 'Degraded', value: health.degradedPartners, color: 'text-amber-500', icon: AlertTriangle },
    { label: 'Down', value: health.downPartners, color: 'text-red-500', icon: XCircle },
    { label: 'Total Inquiries', value: health.totalInquiries, icon: Send },
    { label: 'Failures (24h)', value: health.recentFailures24h, color: health.recentFailures24h > 0 ? 'text-red-500' : undefined, icon: Activity },
    { label: 'Live Sharing', value: health.activeLiveSharingPermissions, icon: Radio },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`${card} p-5`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.color ?? (isDarkMode ? 'text-gray-600' : 'text-gray-300')}`} />
            </div>
            <p className={`text-2xl font-bold ${s.color ?? (isDarkMode ? 'text-white' : 'text-gray-900')}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className={`${card} p-6`}>
        <h3 className={`text-sm font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Partner Status</h3>
        <div className="space-y-2">
          {health.partners.map(p => (
            <div key={p.id} className={`flex items-center justify-between py-3 px-4 rounded-xl ${isDarkMode ? 'bg-neutral-900' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[p.healthStatus] ?? STATUS_DOT.unknown}`} />
                <span className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{p.displayName}</span>
                <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{p.key}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>{p.communicationChannel}</span>
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{p.isEnabled ? 'Enabled' : 'Disabled'}</span>
                <span className={`capitalize font-semibold ${STATUS_TEXT[p.healthStatus] ?? 'text-gray-400'}`}>{p.healthStatus}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 2 — Partners Registry
   ═══════════════════════════════════════════════ */
function PartnersTab({ isDarkMode, card, inputCls, labelCls, headCls }: { isDarkMode: boolean; card: string; inputCls: string; labelCls: string; headCls: string }) {
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<InsuranceConnectionTestResult | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setPartners(await api.insurances.admin.partners()); } catch { setPartners([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const blankForm = (): Record<string, any> => ({
    key: '', displayName: '', description: '', isEnabled: true,
    communicationChannel: 'EMAIL', supportedInquiryTypes: [], supportedInsuranceModels: [],
    acceptedHistoricalData: [], acceptedLiveData: [],
    supportsDynamicInsurance: false, supportsUsageBased: false, supportsKilometerBased: false, supportsDrivingScoreBased: false,
    slaInfo: '', environment: 'SANDBOX',
  });

  const openCreate = () => { setForm(blankForm()); setShowCreate(true); setEditId(null); };
  const openEdit = (p: any) => {
    setForm({
      key: p.key ?? '', displayName: p.displayName ?? '', description: p.description ?? '',
      isEnabled: p.isEnabled ?? false, communicationChannel: p.communicationChannel ?? 'EMAIL',
      supportedInquiryTypes: p.supportedInquiryTypes ?? [], supportedInsuranceModels: p.supportedInsuranceModels ?? [],
      acceptedHistoricalData: p.acceptedHistoricalData ?? [], acceptedLiveData: p.acceptedLiveData ?? [],
      supportsDynamicInsurance: p.supportsDynamicInsurance ?? false, supportsUsageBased: p.supportsUsageBased ?? false,
      supportsKilometerBased: p.supportsKilometerBased ?? false, supportsDrivingScoreBased: p.supportsDrivingScoreBased ?? false,
      slaInfo: p.slaInfo ?? '', environment: p.environment ?? 'SANDBOX',
    });
    setEditId(p.id);
    setShowCreate(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editId) await api.insurances.admin.updatePartner(editId, form);
      else await api.insurances.admin.createPartner(form);
      setEditId(null); setShowCreate(false); await load();
    } catch { /* keep form open */ }
    setSaving(false);
  };

  const handleTest = async (id: string) => {
    setTestingId(id); setTestResult(null);
    try { setTestResult(await api.insurances.admin.testPartner(id)); } catch { setTestResult({ success: false, latencyMs: 0, message: 'Connection failed', timestamp: new Date().toISOString() }); }
    setTestingId(null);
  };

  const toggleMulti = (field: string, value: string) => {
    const arr: string[] = form[field] ?? [];
    setForm(f => ({ ...f, [field]: arr.includes(value) ? arr.filter((v: string) => v !== value) : [...arr, value] }));
  };

  const filtered = partners.filter(p =>
    !search || p.displayName?.toLowerCase().includes(search.toLowerCase()) || p.key?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <Spinner isDarkMode={isDarkMode} />;

  const formOpen = showCreate || editId;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search partners..." className={`${inputCls} pl-10`} />
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> Add Partner
        </button>
        <button onClick={load} className={`p-2.5 rounded-xl border transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-400 hover:text-white' : 'border-gray-200 text-gray-400 hover:text-gray-700'}`}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {testResult && (
        <div className={`${card} p-4 flex items-center gap-3`}>
          {testResult.success ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
          <span className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
            {testResult.success ? 'Connection OK' : 'Connection failed'} — {testResult.latencyMs}ms {testResult.message && `· ${testResult.message}`}
          </span>
          <button onClick={() => setTestResult(null)} className="ml-auto"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
      )}

      {formOpen && (
        <div className={`${card} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{editId ? 'Edit Partner' : 'New Partner'}</h3>
            <button onClick={() => { setEditId(null); setShowCreate(false); }}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className={labelCls}>Key</label><input value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))} className={inputCls} placeholder="partner-key" /></div>
            <div><label className={labelCls}>Display Name</label><input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} className={inputCls} /></div>
            <div>
              <label className={labelCls}>Channel</label>
              <select value={form.communicationChannel} onChange={e => setForm(f => ({ ...f, communicationChannel: e.target.value }))} className={inputCls}>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div><label className={labelCls}>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className={inputCls} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Supported Inquiry Types</label>
              <div className="flex flex-wrap gap-1.5 mt-1">{INQUIRY_TYPES.map(t => (
                <button key={t} onClick={() => toggleMulti('supportedInquiryTypes', t)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${form.supportedInquiryTypes?.includes(t) ? 'bg-indigo-600 text-white border-indigo-600' : isDarkMode ? 'border-neutral-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>{t.replace(/_/g, ' ')}</button>
              ))}</div>
            </div>
            <div>
              <label className={labelCls}>Insurance Models</label>
              <div className="flex flex-wrap gap-1.5 mt-1">{INSURANCE_MODELS.map(m => (
                <button key={m} onClick={() => toggleMulti('supportedInsuranceModels', m)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${form.supportedInsuranceModels?.includes(m) ? 'bg-indigo-600 text-white border-indigo-600' : isDarkMode ? 'border-neutral-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>{m.replace(/_/g, ' ')}</button>
              ))}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Accepted Historical Data</label>
              <div className="flex flex-wrap gap-1.5 mt-1">{DATA_TYPES.map(d => (
                <button key={d} onClick={() => toggleMulti('acceptedHistoricalData', d)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${form.acceptedHistoricalData?.includes(d) ? 'bg-violet-600 text-white border-violet-600' : isDarkMode ? 'border-neutral-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>{d.replace(/_/g, ' ')}</button>
              ))}</div>
            </div>
            <div>
              <label className={labelCls}>Accepted Live Data</label>
              <div className="flex flex-wrap gap-1.5 mt-1">{DATA_TYPES.map(d => (
                <button key={d} onClick={() => toggleMulti('acceptedLiveData', d)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${form.acceptedLiveData?.includes(d) ? 'bg-violet-600 text-white border-violet-600' : isDarkMode ? 'border-neutral-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>{d.replace(/_/g, ' ')}</button>
              ))}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-5">
            {(['supportsDynamicInsurance', 'supportsUsageBased', 'supportsKilometerBased', 'supportsDrivingScoreBased'] as const).map(k => (
              <button key={k} onClick={() => setForm(f => ({ ...f, [k]: !f[k] }))} className="flex items-center gap-2">
                {form[k] ? <ToggleRight className="w-5 h-5 text-indigo-500" /> : <ToggleLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />}
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{k.replace(/^supports/, '').replace(/([A-Z])/g, ' $1').trim()}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className={labelCls}>SLA Info</label><input value={form.slaInfo} onChange={e => setForm(f => ({ ...f, slaInfo: e.target.value }))} className={inputCls} placeholder="e.g. 48h response" /></div>
            <div>
              <label className={labelCls}>Environment</label>
              <select value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))} className={inputCls}>
                {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={() => setForm(f => ({ ...f, isEnabled: !f.isEnabled }))} className="flex items-center gap-2">
                {form.isEnabled ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />}
                <span className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{form.isEnabled ? 'Enabled' : 'Disabled'}</span>
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setEditId(null); setShowCreate(false); }} className={`px-4 py-2 rounded-xl text-sm font-semibold ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                {['Name', 'Key', 'Enabled', 'Channel', 'Models', 'Health', 'Last Tested', 'Actions'].map(h => (
                  <th key={h} className={`px-5 py-3.5 text-left ${headCls}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className={`border-b transition-colors ${isDarkMode ? 'border-neutral-800 hover:bg-neutral-900' : 'border-gray-50 hover:bg-gray-50'}`}>
                  <td className={`px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{p.displayName}</td>
                  <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{p.key}</td>
                  <td className="px-5 py-3">{p.isEnabled ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-gray-400" />}</td>
                  <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{p.communicationChannel}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">{(p.supportedInsuranceModels ?? []).slice(0, 3).map((m: string) => (
                      <Badge key={m} label={m} color={isDarkMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-50 text-indigo-600'} />
                    ))}{(p.supportedInsuranceModels ?? []).length > 3 && <Badge label={`+${p.supportedInsuranceModels.length - 3}`} color={isDarkMode ? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-500'} />}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${STATUS_DOT[p.healthStatus] ?? STATUS_DOT.unknown}`} />
                      <span className={`text-xs font-semibold capitalize ${STATUS_TEXT[p.healthStatus] ?? 'text-gray-400'}`}>{p.healthStatus}</span>
                    </span>
                  </td>
                  <td className={`px-5 py-3 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{fmtDate(p.lastTestedAt ?? null)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(p)} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}><Settings2 className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button onClick={() => handleTest(p.id)} disabled={testingId === p.id} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}>
                        {testingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> : <TestTube className="w-3.5 h-3.5 text-gray-400" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className={`text-center py-12 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No partners found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 3 — Contacts
   ═══════════════════════════════════════════════ */
function ContactsTab({ isDarkMode, card, inputCls, labelCls, headCls }: { isDarkMode: boolean; card: string; inputCls: string; labelCls: string; headCls: string }) {
  const [partners, setPartners] = useState<any[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [contacts, setContacts] = useState<InsurancePartnerContactEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.insurances.admin.partners().then(setPartners).catch(() => setPartners([]));
  }, []);

  const loadContacts = useCallback(async (pid: string) => {
    if (!pid) { setContacts([]); return; }
    setLoading(true);
    try { setContacts(await api.insurances.admin.contacts(pid)); } catch { setContacts([]); }
    setLoading(false);
  }, []);

  useEffect(() => { if (selectedPartnerId) loadContacts(selectedPartnerId); }, [selectedPartnerId, loadContacts]);

  const blankContact = () => ({ insurancePartnerId: selectedPartnerId, fullName: '', roleTitle: '', department: '', email: '', phone: '', isPrimary: false, notes: '' });
  const openCreate = () => { setForm(blankContact()); setShowCreate(true); setEditId(null); };
  const openEdit = (c: InsurancePartnerContactEntry) => {
    setForm({ fullName: c.fullName, roleTitle: c.roleTitle ?? '', department: c.department ?? '', email: c.email ?? '', phone: c.phone ?? '', isPrimary: c.isPrimary, notes: c.notes ?? '' });
    setEditId(c.id); setShowCreate(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editId) await api.insurances.admin.updateContact(editId, form);
      else await api.insurances.admin.createContact({ ...form, insurancePartnerId: selectedPartnerId });
      setEditId(null); setShowCreate(false); await loadContacts(selectedPartnerId);
    } catch { /* keep form */ }
    setSaving(false);
  };

  const formOpen = showCreate || editId;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <select value={selectedPartnerId} onChange={e => setSelectedPartnerId(e.target.value)} className={inputCls}>
            <option value="">Select partner…</option>
            {partners.map((p: any) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </select>
        </div>
        {selectedPartnerId && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Contact
          </button>
        )}
      </div>

      {!selectedPartnerId && (
        <div className={`${card} p-12 text-center`}>
          <Users className={`w-8 h-8 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Select a partner to view contacts</p>
        </div>
      )}

      {selectedPartnerId && loading && <Spinner isDarkMode={isDarkMode} />}

      {formOpen && (
        <div className={`${card} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{editId ? 'Edit Contact' : 'New Contact'}</h3>
            <button onClick={() => { setEditId(null); setShowCreate(false); }}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className={labelCls}>Full Name</label><input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Role Title</label><input value={form.roleTitle} onChange={e => setForm(f => ({ ...f, roleTitle: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Department</label><input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className={labelCls}>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} /></div>
            <div className="flex items-end gap-3">
              <button onClick={() => setForm(f => ({ ...f, isPrimary: !f.isPrimary }))} className="flex items-center gap-2">
                {form.isPrimary ? <ToggleRight className="w-5 h-5 text-indigo-500" /> : <ToggleLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />}
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Primary Contact</span>
              </button>
            </div>
          </div>
          <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setEditId(null); setShowCreate(false); }} className={`px-4 py-2 rounded-xl text-sm font-semibold ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
          </div>
        </div>
      )}

      {selectedPartnerId && !loading && (
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                  {['Name', 'Role', 'Department', 'Email', 'Phone', 'Primary', 'Actions'].map(h => (
                    <th key={h} className={`px-5 py-3.5 text-left ${headCls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} className={`border-b transition-colors ${isDarkMode ? 'border-neutral-800 hover:bg-neutral-900' : 'border-gray-50 hover:bg-gray-50'}`}>
                    <td className={`px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{c.fullName}</td>
                    <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{c.roleTitle ?? '—'}</td>
                    <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{c.department ?? '—'}</td>
                    <td className="px-5 py-3"><span className={`flex items-center gap-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}><Mail className="w-3.5 h-3.5" />{c.email ?? '—'}</span></td>
                    <td className="px-5 py-3"><span className={`flex items-center gap-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}><Phone className="w-3.5 h-3.5" />{c.phone ?? '—'}</span></td>
                    <td className="px-5 py-3">{c.isPrimary ? <Badge label="Primary" color="bg-indigo-500/20 text-indigo-400" /> : <span className="text-gray-500">—</span>}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => openEdit(c)} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}><Settings2 className="w-3.5 h-3.5 text-gray-400" /></button>
                    </td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr><td colSpan={7} className={`text-center py-12 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No contacts found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 4 — Disclosure Templates
   ═══════════════════════════════════════════════ */
function DisclosureTemplatesTab({ isDarkMode, card, inputCls, labelCls, headCls }: { isDarkMode: boolean; card: string; inputCls: string; labelCls: string; headCls: string }) {
  const [templates, setTemplates] = useState<InsuranceDisclosureTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTemplates(await api.insurances.admin.disclosureTemplates()); } catch { setTemplates([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const blankForm = () => ({ title: '', body: '', insurerKey: '', inquiryType: '', isActive: true });
  const openCreate = () => { setForm(blankForm()); setShowCreate(true); setEditId(null); };
  const openEdit = (t: InsuranceDisclosureTemplate) => {
    setForm({ title: t.title, body: t.body, insurerKey: t.insurerKey ?? '', inquiryType: t.inquiryType ?? '', isActive: t.isActive });
    setEditId(t.id); setShowCreate(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, insurerKey: form.insurerKey || null, inquiryType: form.inquiryType || null };
      if (editId) await api.insurances.admin.updateDisclosureTemplate(editId, payload);
      else await api.insurances.admin.createDisclosureTemplate(payload);
      setEditId(null); setShowCreate(false); await load();
    } catch { /* keep form */ }
    setSaving(false);
  };

  if (loading) return <Spinner isDarkMode={isDarkMode} />;

  const formOpen = showCreate || editId;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> New Disclosure Template
        </button>
        <button onClick={load} className={`p-2.5 rounded-xl border transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-400 hover:text-white' : 'border-gray-200 text-gray-400 hover:text-gray-700'}`}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {formOpen && (
        <div className={`${card} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{editId ? 'Edit Disclosure' : 'New Disclosure'}</h3>
            <button onClick={() => { setEditId(null); setShowCreate(false); }}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className={labelCls}>Title</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Insurer Key (optional)</label><input value={form.insurerKey} onChange={e => setForm(f => ({ ...f, insurerKey: e.target.value }))} className={inputCls} placeholder="Leave empty for global" /></div>
            <div><label className={labelCls}>Inquiry Type (optional)</label><input value={form.inquiryType} onChange={e => setForm(f => ({ ...f, inquiryType: e.target.value }))} className={inputCls} placeholder="Leave empty for all types" /></div>
          </div>
          <div><label className={labelCls}>Body</label><textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={6} className={inputCls} placeholder="Disclosure / consent notice text…" /></div>
          <div className="flex items-center gap-4">
            <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} className="flex items-center gap-2">
              {form.isActive ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />}
              <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{form.isActive ? 'Active' : 'Inactive'}</span>
            </button>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setEditId(null); setShowCreate(false); }} className={`px-4 py-2 rounded-xl text-sm font-semibold ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
          </div>
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                {['Title', 'Version', 'Insurer Key', 'Inquiry Type', 'Active', 'Effective From', 'Actions'].map(h => (
                  <th key={h} className={`px-5 py-3.5 text-left ${headCls}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} className={`border-b transition-colors ${isDarkMode ? 'border-neutral-800 hover:bg-neutral-900' : 'border-gray-50 hover:bg-gray-50'}`}>
                  <td className={`px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.title}</td>
                  <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>v{t.version}</td>
                  <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.insurerKey ?? 'Global'}</td>
                  <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.inquiryType ?? 'All'}</td>
                  <td className="px-5 py-3">{t.isActive ? <Badge label="Active" color="bg-emerald-500/20 text-emerald-400" /> : <Badge label="Inactive" color={isDarkMode ? 'bg-neutral-800 text-gray-500' : 'bg-gray-100 text-gray-400'} />}</td>
                  <td className={`px-5 py-3 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{fmtDate(t.effectiveFrom)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => openEdit(t)} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}><Settings2 className="w-3.5 h-3.5 text-gray-400" /></button>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr><td colSpan={7} className={`text-center py-12 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No disclosure templates found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 5 — Inquiry Templates
   ═══════════════════════════════════════════════ */
function InquiryTemplatesTab({ isDarkMode, card, inputCls, labelCls, headCls }: { isDarkMode: boolean; card: string; inputCls: string; labelCls: string; headCls: string }) {
  const [templates, setTemplates] = useState<InsuranceInquiryTemplateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTemplates(await api.insurances.admin.inquiryTemplates()); } catch { setTemplates([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const blankForm = () => ({ subjectTemplate: '', bodyTemplate: '', insurerKey: '', inquiryType: '', isActive: true });
  const openCreate = () => { setForm(blankForm()); setShowCreate(true); setEditId(null); };
  const openEdit = (t: InsuranceInquiryTemplateEntry) => {
    setForm({ subjectTemplate: t.subjectTemplate, bodyTemplate: t.bodyTemplate, insurerKey: t.insurerKey ?? '', inquiryType: t.inquiryType ?? '', isActive: t.isActive });
    setEditId(t.id); setShowCreate(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, insurerKey: form.insurerKey || null, inquiryType: form.inquiryType || null };
      if (editId) await api.insurances.admin.updateInquiryTemplate(editId, payload);
      else await api.insurances.admin.createInquiryTemplate(payload);
      setEditId(null); setShowCreate(false); await load();
    } catch { /* keep form */ }
    setSaving(false);
  };

  if (loading) return <Spinner isDarkMode={isDarkMode} />;

  const formOpen = showCreate || editId;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> New Inquiry Template
        </button>
        <button onClick={load} className={`p-2.5 rounded-xl border transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-400 hover:text-white' : 'border-gray-200 text-gray-400 hover:text-gray-700'}`}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {formOpen && (
        <div className={`${card} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{editId ? 'Edit Template' : 'New Template'}</h3>
            <button onClick={() => { setEditId(null); setShowCreate(false); }}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2"><label className={labelCls}>Subject Template</label><input value={form.subjectTemplate} onChange={e => setForm(f => ({ ...f, subjectTemplate: e.target.value }))} className={inputCls} placeholder="Insurance inquiry for {{make}} {{model}} ({{year}})" /></div>
            <div>
              <label className={labelCls}>Inquiry Type</label>
              <select value={form.inquiryType} onChange={e => setForm(f => ({ ...f, inquiryType: e.target.value }))} className={inputCls}>
                <option value="">All types</option>
                {INQUIRY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Body Template</label>
            <textarea value={form.bodyTemplate} onChange={e => setForm(f => ({ ...f, bodyTemplate: e.target.value }))} rows={8} className={inputCls} placeholder="Use placeholders: {{make}}, {{model}}, {{year}}, {{vin}}, {{inquiryType}}, {{driverName}}, {{mileage}}" />
            <p className={`text-[11px] mt-1.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              Available: {'{{make}}, {{model}}, {{year}}, {{vin}}, {{inquiryType}}, {{driverName}}, {{mileage}}, {{licensePlate}}'}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelCls}>Insurer Key (optional)</label><input value={form.insurerKey} onChange={e => setForm(f => ({ ...f, insurerKey: e.target.value }))} className={inputCls} placeholder="Leave empty for global" /></div>
            <div className="flex items-end">
              <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} className="flex items-center gap-2">
                {form.isActive ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />}
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{form.isActive ? 'Active' : 'Inactive'}</span>
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setEditId(null); setShowCreate(false); }} className={`px-4 py-2 rounded-xl text-sm font-semibold ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
          </div>
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                {['Subject', 'Inquiry Type', 'Insurer Key', 'Version', 'Active', 'Actions'].map(h => (
                  <th key={h} className={`px-5 py-3.5 text-left ${headCls}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} className={`border-b transition-colors ${isDarkMode ? 'border-neutral-800 hover:bg-neutral-900' : 'border-gray-50 hover:bg-gray-50'}`}>
                  <td className={`px-5 py-3 font-semibold max-w-xs truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.subjectTemplate}</td>
                  <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.inquiryType ?? 'All'}</td>
                  <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.insurerKey ?? 'Global'}</td>
                  <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>v{t.version}</td>
                  <td className="px-5 py-3">{t.isActive ? <Badge label="Active" color="bg-emerald-500/20 text-emerald-400" /> : <Badge label="Inactive" color={isDarkMode ? 'bg-neutral-800 text-gray-500' : 'bg-gray-100 text-gray-400'} />}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => openEdit(t)} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}><Settings2 className="w-3.5 h-3.5 text-gray-400" /></button>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr><td colSpan={6} className={`text-center py-12 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No inquiry templates found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 6 — Inquiry Monitoring
   ═══════════════════════════════════════════════ */
function InquiriesTab({ isDarkMode, card, inputCls, headCls }: { isDarkMode: boolean; card: string; inputCls: string; headCls: string }) {
  const [rows, setRows] = useState<InsuranceInquiryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: '20' };
      if (statusFilter) params.status = statusFilter;
      if (orgFilter) params.organizationId = orgFilter;
      const res = await api.insurances.admin.inquiries(params);
      setRows(res.rows); setTotal(res.total);
    } catch { setRows([]); setTotal(0); }
    setLoading(false);
  }, [page, statusFilter, orgFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  const deliveryColor = (s: string) => {
    if (s === 'DELIVERED' || s === 'SENT') return 'text-emerald-500';
    if (s === 'FAILED') return 'text-red-500';
    if (s === 'PENDING') return 'text-amber-500';
    return isDarkMode ? 'text-gray-400' : 'text-gray-500';
  };

  const statusColor = (s: string) => {
    if (s === 'COMPLETED' || s === 'SENT') return 'bg-emerald-500/20 text-emerald-400';
    if (s === 'FAILED' || s === 'ERROR') return 'bg-red-500/20 text-red-400';
    if (s === 'PENDING' || s === 'IN_PROGRESS') return 'bg-amber-500/20 text-amber-400';
    return isDarkMode ? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-500';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className={inputCls}>
            <option value="">All statuses</option>
            {['PENDING', 'IN_PROGRESS', 'SENT', 'COMPLETED', 'FAILED', 'ERROR'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <input value={orgFilter} onChange={e => { setOrgFilter(e.target.value); setPage(1); }} placeholder="Filter by Organization ID…" className={inputCls} />
        </div>
        <button onClick={load} className={`p-2.5 rounded-xl border transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-400 hover:text-white' : 'border-gray-200 text-gray-400 hover:text-gray-700'}`}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? <Spinner isDarkMode={isDarkMode} /> : (
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                  {['Type', 'Vehicle', 'Status', 'Recipients', 'Delivery', 'Created', ''].map(h => (
                    <th key={h} className={`px-5 py-3.5 text-left ${headCls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <>
                    <tr key={r.id} className={`border-b transition-colors cursor-pointer ${isDarkMode ? 'border-neutral-800 hover:bg-neutral-900' : 'border-gray-50 hover:bg-gray-50'}`} onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                      <td className={`px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{r.inquiryType.replace(/_/g, ' ')}</td>
                      <td className={`px-5 py-3 text-xs font-mono ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{r.vehicleId.slice(0, 8)}…</td>
                      <td className="px-5 py-3"><Badge label={r.status} color={statusColor(r.status)} /></td>
                      <td className={`px-5 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{r.recipients?.length ?? 0}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1.5">{(r.recipients ?? []).slice(0, 3).map(rec => (
                          <span key={rec.id} className={`text-[10px] font-bold ${deliveryColor(rec.deliveryStatus)}`}>{rec.deliveryStatus}</span>
                        ))}</div>
                      </td>
                      <td className={`px-5 py-3 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{fmtDate(r.createdAt)}</td>
                      <td className="px-5 py-3">{expandedId === r.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}</td>
                    </tr>
                    {expandedId === r.id && (
                      <tr key={`${r.id}-detail`} className={isDarkMode ? 'bg-neutral-950' : 'bg-gray-50/30'}>
                        <td colSpan={7} className="px-5 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                            <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Org: </span><span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>{r.organizationId.slice(0, 8)}…</span></div>
                            <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Correlation: </span><span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>{r.correlationId.slice(0, 12)}…</span></div>
                            <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Models: </span><span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>{(r.selectedInsuranceModels ?? []).join(', ') || '—'}</span></div>
                            <div><span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>User: </span><span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>{r.userId.slice(0, 8)}…</span></div>
                          </div>
                          {(r.recipients ?? []).length > 0 && (
                            <div className="space-y-1.5">
                              <p className={`text-[11px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Recipients</p>
                              {r.recipients.map(rec => (
                                <div key={rec.id} className={`flex items-center gap-3 text-xs py-1.5 px-3 rounded-lg ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}>
                                  <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>{rec.insurerId.slice(0, 8)}…</span>
                                  <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>{rec.channelType}</span>
                                  <span className={`font-bold ${deliveryColor(rec.deliveryStatus)}`}>{rec.deliveryStatus}</span>
                                  <span className={isDarkMode ? 'text-gray-600' : 'text-gray-400'}>{fmtDate(rec.sentAt)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className={`text-center py-12 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No inquiries found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={`flex items-center justify-between px-5 py-3 border-t ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
              <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{total} total inquiries</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className={`p-1.5 rounded-lg disabled:opacity-30 ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}><ChevronLeft className="w-4 h-4 text-gray-400" /></button>
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={`p-1.5 rounded-lg disabled:opacity-30 ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}><ChevronRight className="w-4 h-4 text-gray-400" /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 7 — Health & Diagnostics
   ═══════════════════════════════════════════════ */
function HealthTab({ isDarkMode, card }: { isDarkMode: boolean; card: string }) {
  const [health, setHealth] = useState<InsuranceHealthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setHealth(await api.insurances.admin.health()); } catch { setHealth(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTest = async (id: string) => {
    setTestingId(id);
    try { await api.insurances.admin.testPartner(id); } catch { /* handled by reload */ }
    setTestingId(null);
    await load();
  };

  if (loading) return <Spinner isDarkMode={isDarkMode} />;
  if (!health) return <ErrorBanner isDarkMode={isDarkMode} card={card} message="Failed to load health data." onRetry={load} />;

  const summary = [
    { label: 'Healthy', value: health.healthyPartners, color: 'text-emerald-500', dot: 'bg-emerald-500' },
    { label: 'Degraded', value: health.degradedPartners, color: 'text-amber-500', dot: 'bg-amber-500' },
    { label: 'Down', value: health.downPartners, color: 'text-red-500', dot: 'bg-red-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex gap-6">
          {summary.map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${s.dot}`} />
              <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
              <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={load} className={`p-2.5 rounded-xl border transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-400 hover:text-white' : 'border-gray-200 text-gray-400 hover:text-gray-700'}`}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {health.partners.map(p => {
          const statusDot = STATUS_DOT[p.healthStatus] ?? STATUS_DOT.unknown;
          const statusTxt = STATUS_TEXT[p.healthStatus] ?? 'text-gray-400';

          return (
            <div key={p.id} className={`${card} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full ${statusDot}`} />
                  <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{p.displayName}</span>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${statusTxt}`}>{p.healthStatus}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Channel</span>
                  <p className={`font-semibold mt-0.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{p.communicationChannel}</p>
                </div>
                <div>
                  <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Enabled</span>
                  <p className={`font-semibold mt-0.5 ${p.isEnabled ? 'text-emerald-500' : 'text-gray-500'}`}>{p.isEnabled ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Last Tested</span>
                  <p className={`font-semibold mt-0.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{fmtDate(p.lastTestedAt)}</p>
                </div>
                <div>
                  <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Last Success</span>
                  <p className={`font-semibold mt-0.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{fmtDate(p.lastSuccessAt)}</p>
                </div>
                <div>
                  <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Last Failure</span>
                  <p className={`font-semibold mt-0.5 ${p.lastFailureAt ? 'text-red-400' : isDarkMode ? 'text-gray-600' : 'text-gray-300'}`}>{fmtDate(p.lastFailureAt)}</p>
                </div>
                {p.lastFailureReason && (
                  <div className="col-span-2">
                    <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Failure Reason</span>
                    <p className="font-semibold mt-0.5 text-red-400 truncate">{p.lastFailureReason}</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleTest(p.id)}
                disabled={testingId === p.id}
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-colors ${
                  isDarkMode ? 'bg-neutral-800 hover:bg-neutral-700 text-gray-300' : 'bg-gray-50 hover:bg-gray-100 text-gray-600'
                } disabled:opacity-50`}
              >
                {testingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
                Test Connection
              </button>
            </div>
          );
        })}
      </div>

      {health.partners.length === 0 && (
        <div className={`${card} p-12 text-center`}>
          <HeartPulse className={`w-8 h-8 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No partners configured yet.</p>
        </div>
      )}
    </div>
  );
}
