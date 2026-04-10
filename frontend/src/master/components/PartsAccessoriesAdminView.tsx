import {
  LayoutDashboard,
  Truck,
  FileText,
  ScrollText,
  HeartPulse,
  Search,
  Plus,
  RefreshCw,
  Settings2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Zap,
  Shield,
  Clock,
  Activity,
  X,
  Save,
  TestTube,
  ChevronDown,
  ChevronUp,
  Eye,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import type {
  PartsProviderSummary,
  PartsDisclosureTemplate,
  PartsAuthorizationLogEntry,
  PartsConnectionTestResult,
  PartsHealthOverview,
} from '../../lib/api';

interface PartsAccessoriesAdminViewProps {
  isDarkMode: boolean;
}

type TabId = 'overview' | 'providers' | 'disclosures' | 'authlog' | 'health';

const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'providers', label: 'Providers', icon: Truck },
  { id: 'disclosures', label: 'Disclosures', icon: FileText },
  { id: 'authlog', label: 'Authorization Log', icon: ScrollText },
  { id: 'health', label: 'Health', icon: HeartPulse },
];

const CATEGORIES = ['TIRES', 'PARTS', 'ACCESSORIES'] as const;

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  down: 'bg-red-500',
  unknown: 'bg-gray-400',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function PartsAccessoriesAdminView({ isDarkMode }: PartsAccessoriesAdminViewProps) {
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
          Parts &amp; Accessories — Admin
        </h1>
        <p className={`text-sm mt-1.5 font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Provider management, disclosures, authorization audit, and diagnostics
        </p>
      </div>

      {/* Tab bar */}
      <div className={`flex gap-1 p-1 rounded-2xl overflow-x-auto w-fit ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === t.id
                ? isDarkMode
                  ? 'bg-neutral-700 text-white shadow-sm'
                  : 'bg-white text-gray-900 shadow-sm'
                : isDarkMode
                  ? 'text-gray-400 hover:text-gray-300'
                  : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab isDarkMode={isDarkMode} card={card} />}
      {activeTab === 'providers' && <ProvidersTab isDarkMode={isDarkMode} card={card} inputCls={inputCls} labelCls={labelCls} headCls={headCls} />}
      {activeTab === 'disclosures' && <DisclosuresTab isDarkMode={isDarkMode} card={card} inputCls={inputCls} labelCls={labelCls} headCls={headCls} />}
      {activeTab === 'authlog' && <AuthLogTab isDarkMode={isDarkMode} card={card} inputCls={inputCls} headCls={headCls} />}
      {activeTab === 'health' && <HealthTab isDarkMode={isDarkMode} card={card} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 1 — Overview
   ═══════════════════════════════════════════════ */
function OverviewTab({ isDarkMode, card }: { isDarkMode: boolean; card: string }) {
  const [health, setHealth] = useState<PartsHealthOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await api.partsAccessories.admin.health());
    } catch { setHealth(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner isDarkMode={isDarkMode} />;
  if (!health) return <ErrorCard isDarkMode={isDarkMode} card={card} message="Failed to load overview data." onRetry={load} />;

  const stats: { label: string; value: number; color?: string }[] = [
    { label: 'Total Providers', value: health.totalProviders },
    { label: 'Active Providers', value: health.activeProviders },
    { label: 'Healthy', value: health.healthyProviders, color: 'text-emerald-500' },
    { label: 'Degraded', value: health.degradedProviders, color: 'text-amber-500' },
    { label: 'Down', value: health.downProviders, color: 'text-red-500' },
    { label: 'Total Authorizations', value: health.totalAuthorizations },
    { label: 'Recent Errors (24h)', value: health.recentErrors24h, color: health.recentErrors24h > 0 ? 'text-red-500' : undefined },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`${card} p-5`}>
            <p className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{s.label}</p>
            <p className={`text-2xl font-bold mt-2 ${s.color ?? (isDarkMode ? 'text-white' : 'text-gray-900')}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className={`${card} p-6`}>
        <h3 className={`text-sm font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Provider Status</h3>
        <div className="space-y-3">
          {health.providers.map(p => (
            <div
              key={p.id}
              className={`flex items-center justify-between py-3 px-4 rounded-xl ${
                isDarkMode ? 'bg-neutral-900' : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[p.healthStatus] ?? STATUS_DOT.unknown}`} />
                <span className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{p.displayName}</span>
                <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{p.key}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>
                  {p.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <span className={`capitalize font-semibold ${
                  p.healthStatus === 'healthy' ? 'text-emerald-500' : p.healthStatus === 'degraded' ? 'text-amber-500' : 'text-red-500'
                }`}>
                  {p.healthStatus}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 2 — Providers
   ═══════════════════════════════════════════════ */
function ProvidersTab({ isDarkMode, card, inputCls, labelCls, headCls }: { isDarkMode: boolean; card: string; inputCls: string; labelCls: string; headCls: string }) {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<PartsConnectionTestResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProviders(await api.partsAccessories.admin.providers()); } catch { setProviders([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (p: any) => {
    setEditId(p.id);
    setEditData({
      displayName: p.displayName ?? '',
      description: p.description ?? '',
      isEnabled: p.isEnabled ?? false,
      environmentMode: p.environmentMode ?? 'sandbox',
      supportedCategories: p.supportedCategories ?? [],
      timeoutMs: p.timeoutMs ?? 10000,
      maxRetries: p.maxRetries ?? 3,
      rankingWeight: p.rankingWeight ?? 1,
    });
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      await api.partsAccessories.admin.updateProvider(editId, editData);
      setEditId(null);
      await load();
    } catch { /* keep panel open */ }
    setSaving(false);
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await api.partsAccessories.admin.testProvider(id);
      setTestResult(res);
    } catch { setTestResult({ success: false, latencyMs: 0, message: 'Connection test failed', timestamp: new Date().toISOString() }); }
    setTestingId(null);
  };

  const toggleCategory = (cat: string) => {
    const cats: string[] = editData.supportedCategories ?? [];
    setEditData(d => ({
      ...d,
      supportedCategories: cats.includes(cat) ? cats.filter((c: string) => c !== cat) : [...cats, cat],
    }));
  };

  if (loading) return <LoadingSpinner isDarkMode={isDarkMode} />;

  const rowBg = (i: number) =>
    i % 2 === 0
      ? isDarkMode ? 'bg-neutral-950' : 'bg-gray-50'
      : '';

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
                {['Name', 'Key', 'Status', 'Categories', 'Integration', 'Environment', 'Health', 'Last Test', 'Actions'].map(h => (
                  <th key={h} className={`text-left px-5 py-3.5 ${headCls}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providers.map((p, i) => (
                <tr key={p.id} className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'} ${rowBg(i)} transition-colors`}>
                  <td className={`px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{p.displayName}</td>
                  <td className={`px-5 py-3 font-mono text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{p.key}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                      p.isEnabled
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : isDarkMode ? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {p.isEnabled ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      {p.isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(p.supportedCategories ?? []).map((c: string) => (
                        <span key={c} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isDarkMode ? 'bg-indigo-500/15 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
                        }`}>{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className={`px-5 py-3 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{p.integrationType}</td>
                  <td className={`px-5 py-3 text-xs capitalize ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{p.environmentMode ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`w-2.5 h-2.5 rounded-full inline-block ${STATUS_DOT[p.healthStatus] ?? STATUS_DOT.unknown}`} />
                  </td>
                  <td className={`px-5 py-3 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatDate(p.lastTestedAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(p)} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}>
                        <Settings2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                      </button>
                      <button
                        onClick={() => handleTest(p.id)}
                        disabled={testingId === p.id}
                        className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}
                      >
                        {testingId === p.id
                          ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                          : <TestTube className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {providers.length === 0 && (
                <tr><td colSpan={9} className={`px-5 py-10 text-center text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No providers configured.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Test result toast */}
      {testResult && (
        <div className={`${card} p-4 flex items-center gap-3`}>
          {testResult.success
            ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            : <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
          <div className="flex-1">
            <p className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              {testResult.success ? 'Connection successful' : 'Connection failed'}
            </p>
            {testResult.message && <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{testResult.message}</p>}
          </div>
          <span className={`text-xs font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{testResult.latencyMs}ms</span>
          <button onClick={() => setTestResult(null)} className={`p-1 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit panel */}
      {editId && (
        <div className={`${card} p-6 space-y-5`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Edit Provider</h3>
            <button onClick={() => setEditId(null)} className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}>
              <X className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Display Name</label>
              <input className={inputCls} value={editData.displayName} onChange={e => setEditData(d => ({ ...d, displayName: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Environment</label>
              <select className={inputCls} value={editData.environmentMode} onChange={e => setEditData(d => ({ ...d, environmentMode: e.target.value }))}>
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Description</label>
              <textarea className={`${inputCls} min-h-[72px] resize-y`} value={editData.description} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Timeout (ms)</label>
              <input type="number" className={inputCls} value={editData.timeoutMs} onChange={e => setEditData(d => ({ ...d, timeoutMs: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={labelCls}>Max Retries</label>
              <input type="number" className={inputCls} value={editData.maxRetries} onChange={e => setEditData(d => ({ ...d, maxRetries: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={labelCls}>Ranking Weight</label>
              <input type="number" step="0.1" className={inputCls} value={editData.rankingWeight} onChange={e => setEditData(d => ({ ...d, rankingWeight: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={labelCls}>Enabled</label>
              <button
                onClick={() => setEditData(d => ({ ...d, isEnabled: !d.isEnabled }))}
                className={`mt-1 flex items-center gap-2 text-sm font-bold ${editData.isEnabled ? 'text-emerald-500' : isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
              >
                {editData.isEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                {editData.isEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Supported Categories</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                    (editData.supportedCategories ?? []).includes(cat)
                      ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-500'
                      : isDarkMode
                        ? 'bg-neutral-900 border-neutral-800 text-gray-400'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setEditId(null)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 3 — Disclosures
   ═══════════════════════════════════════════════ */
function DisclosuresTab({ isDarkMode, card, inputCls, labelCls, headCls }: { isDarkMode: boolean; card: string; inputCls: string; labelCls: string; headCls: string }) {
  const [disclosures, setDisclosures] = useState<PartsDisclosureTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', body: '', providerKey: '', category: '', isActive: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDisclosures(await api.partsAccessories.admin.disclosures()); } catch { setDisclosures([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({ title: '', body: '', providerKey: '', category: '', isActive: true });
    setEditId(null);
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (d: PartsDisclosureTemplate) => {
    setEditId(d.id);
    setForm({
      title: d.title,
      body: d.body,
      providerKey: d.providerKey ?? '',
      category: d.category ?? '',
      isActive: d.isActive,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        title: form.title,
        body: form.body,
        isActive: form.isActive,
        providerKey: form.providerKey || null,
        category: form.category || null,
      };
      if (editId) {
        await api.partsAccessories.admin.updateDisclosure(editId, payload);
      } else {
        await api.partsAccessories.admin.createDisclosure(payload);
      }
      resetForm();
      await load();
    } catch { /* keep form open */ }
    setSaving(false);
  };

  if (loading) return <LoadingSpinner isDarkMode={isDarkMode} />;

  const rowBg = (i: number) => i % 2 === 0 ? (isDarkMode ? 'bg-neutral-950' : 'bg-gray-50') : '';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:shadow-xl transition-all">
          <Plus className="w-4 h-4" /> New Disclosure
        </button>
      </div>

      {showForm && (
        <div className={`${card} p-6 space-y-5`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{editId ? 'Edit Disclosure' : 'New Disclosure'}</h3>
            <button onClick={resetForm} className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}>
              <X className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className={labelCls}>Title</label>
              <input className={inputCls} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Disclosure title…" />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Body</label>
              <textarea className={`${inputCls} min-h-[120px] resize-y`} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Disclosure text shown to users…" />
            </div>
            <div>
              <label className={labelCls}>Provider Key (optional)</label>
              <input className={inputCls} value={form.providerKey} onChange={e => setForm(f => ({ ...f, providerKey: e.target.value }))} placeholder="e.g. tirendo" />
            </div>
            <div>
              <label className={labelCls}>Category (optional)</label>
              <select className={inputCls} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Active</label>
              <button
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`mt-1 flex items-center gap-2 text-sm font-bold ${form.isActive ? 'text-emerald-500' : isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
              >
                {form.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                {form.isActive ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={resetForm} className={`px-4 py-2 rounded-xl text-sm font-semibold ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title || !form.body} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
                {['Title', 'Provider Key', 'Category', 'Version', 'Active', 'Effective From', 'Actions'].map(h => (
                  <th key={h} className={`text-left px-5 py-3.5 ${headCls}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {disclosures.map((d, i) => (
                <tr key={d.id} className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'} ${rowBg(i)}`}>
                  <td className={`px-5 py-3 font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{d.title}</td>
                  <td className={`px-5 py-3 font-mono text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{d.providerKey ?? '—'}</td>
                  <td className={`px-5 py-3 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{d.category ?? 'All'}</td>
                  <td className={`px-5 py-3 text-xs font-mono ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>v{d.version}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ${
                      d.isActive ? 'bg-emerald-500/15 text-emerald-600' : isDarkMode ? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-500'
                    }`}>{d.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className={`px-5 py-3 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatDate(d.effectiveFrom)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => openEdit(d)} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}>
                      <Settings2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                    </button>
                  </td>
                </tr>
              ))}
              {disclosures.length === 0 && (
                <tr><td colSpan={7} className={`px-5 py-10 text-center text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No disclosure templates.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 4 — Authorization Log
   ═══════════════════════════════════════════════ */
function AuthLogTab({ isDarkMode, card, inputCls, headCls }: { isDarkMode: boolean; card: string; inputCls: string; headCls: string }) {
  const [rows, setRows] = useState<PartsAuthorizationLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [filterProvider, setFilterProvider] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (filterProvider) params.providerKey = filterProvider;
      if (filterStatus) params.executionStatus = filterStatus;
      if (filterCategory) params.category = filterCategory;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      const res = await api.partsAccessories.admin.authorizationLogs(params);
      setRows(res.rows);
      setTotal(res.total);
    } catch { setRows([]); setTotal(0); }
    setLoading(false);
  }, [page, pageSize, filterProvider, filterStatus, filterCategory, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'bg-emerald-500/15 text-emerald-600',
      pending: 'bg-amber-500/15 text-amber-600',
      failed: 'bg-red-500/15 text-red-600',
    };
    return map[status] ?? (isDarkMode ? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-500');
  };

  const rowBg = (i: number) => i % 2 === 0 ? (isDarkMode ? 'bg-neutral-950' : 'bg-gray-50') : '';

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className={`${card} p-4`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <input type="date" className={inputCls} value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1); }} placeholder="From" />
          <input type="date" className={inputCls} value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1); }} placeholder="To" />
          <input className={inputCls} value={filterProvider} onChange={e => { setFilterProvider(e.target.value); setPage(1); }} placeholder="Provider key…" />
          <select className={inputCls} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <select className={inputCls} value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading ? <LoadingSpinner isDarkMode={isDarkMode} /> : (
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
                  {['', 'Date', 'Organization', 'User', 'Vehicle', 'Provider', 'Category', 'Status', 'Correlation ID'].map(h => (
                    <th key={h} className={`text-left px-5 py-3.5 ${headCls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <>
                    <tr
                      key={r.id}
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'} ${rowBg(i)} cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-neutral-900' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-3 py-3">
                        {expandedId === r.id
                          ? <ChevronUp className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          : <ChevronDown className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />}
                      </td>
                      <td className={`px-5 py-3 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{formatDate(r.confirmedAt)}</td>
                      <td className={`px-5 py-3 text-xs font-mono truncate max-w-[120px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{r.organizationId.slice(0, 8)}…</td>
                      <td className={`px-5 py-3 text-xs font-mono truncate max-w-[120px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{r.userId.slice(0, 8)}…</td>
                      <td className={`px-5 py-3 text-xs font-mono truncate max-w-[120px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{r.vehicleId.slice(0, 8)}…</td>
                      <td className={`px-5 py-3 text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{r.providerDisplayName}</td>
                      <td className={`px-5 py-3 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{r.category}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${statusBadge(r.executionStatus)}`}>{r.executionStatus}</span>
                      </td>
                      <td className={`px-5 py-3 text-[10px] font-mono ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>{r.correlationId.slice(0, 12)}…</td>
                    </tr>
                    {expandedId === r.id && (
                      <tr key={`${r.id}-detail`} className={isDarkMode ? 'bg-neutral-900' : 'bg-indigo-50'}>
                        <td colSpan={9} className="px-8 py-5">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                            <Detail label="Organization ID" value={r.organizationId} isDarkMode={isDarkMode} />
                            <Detail label="User ID" value={r.userId} isDarkMode={isDarkMode} />
                            <Detail label="Vehicle ID" value={r.vehicleId} isDarkMode={isDarkMode} />
                            <Detail label="Provider Key" value={r.providerKey} isDarkMode={isDarkMode} />
                            <Detail label="Notice Version" value={`v${r.noticeVersion}`} isDarkMode={isDarkMode} />
                            <Detail label="Correlation ID" value={r.correlationId} isDarkMode={isDarkMode} />
                            <Detail label="Confirmed At" value={formatDate(r.confirmedAt)} isDarkMode={isDarkMode} />
                            <Detail label="Created At" value={formatDate(r.createdAt)} isDarkMode={isDarkMode} />
                            <Detail label="Execution Status" value={r.executionStatus} isDarkMode={isDarkMode} />
                            {r.executionFailureReason && (
                              <div className="col-span-full">
                                <Detail label="Failure Reason" value={r.executionFailureReason} isDarkMode={isDarkMode} />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className={`px-5 py-10 text-center text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No authorization log entries found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className={`flex items-center justify-between px-5 py-3 border-t ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
            <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{total} total entries</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'}`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 5 — Health
   ═══════════════════════════════════════════════ */
function HealthTab({ isDarkMode, card }: { isDarkMode: boolean; card: string }) {
  const [health, setHealth] = useState<PartsHealthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, PartsConnectionTestResult>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setHealth(await api.partsAccessories.admin.health()); } catch { setHealth(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await api.partsAccessories.admin.testProvider(id);
      setTestResults(prev => ({ ...prev, [id]: res }));
    } catch {
      setTestResults(prev => ({ ...prev, [id]: { success: false, latencyMs: 0, message: 'Test failed', timestamp: new Date().toISOString() } }));
    }
    setTestingId(null);
  };

  if (loading) return <LoadingSpinner isDarkMode={isDarkMode} />;
  if (!health) return <ErrorCard isDarkMode={isDarkMode} card={card} message="Failed to load health data." onRetry={load} />;

  const healthColor = (status: string) => {
    if (status === 'healthy') return 'from-emerald-500 to-emerald-600';
    if (status === 'degraded') return 'from-amber-500 to-amber-600';
    return 'from-red-500 to-red-600';
  };

  const healthLabel = (status: string) => {
    if (status === 'healthy') return 'Healthy';
    if (status === 'degraded') return 'Degraded';
    return 'Down';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {health.providers.map(p => {
          const result = testResults[p.id];
          return (
            <div key={p.id} className={`${card} p-6 space-y-4`}>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{p.displayName}</h4>
                  <p className={`text-xs mt-0.5 font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{p.key}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${healthColor(p.healthStatus)} flex items-center justify-center shadow-lg`}>
                  {p.healthStatus === 'healthy' && <CheckCircle className="w-5 h-5 text-white" />}
                  {p.healthStatus === 'degraded' && <AlertTriangle className="w-5 h-5 text-white" />}
                  {p.healthStatus !== 'healthy' && p.healthStatus !== 'degraded' && <XCircle className="w-5 h-5 text-white" />}
                </div>
              </div>

              <div className={`text-center py-4 rounded-xl ${isDarkMode ? 'bg-neutral-900' : 'bg-gray-50'}`}>
                <p className={`text-2xl font-black bg-gradient-to-br ${healthColor(p.healthStatus)} bg-clip-text text-transparent`}>
                  {healthLabel(p.healthStatus)}
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Last Tested</span>
                  <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>{formatDate(p.lastTestedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Last Success</span>
                  <span className="text-emerald-500">{formatDate(p.lastSuccessAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>Last Failure</span>
                  <span className="text-red-500">{formatDate(p.lastFailureAt)}</span>
                </div>
                {p.lastFailureReason && (
                  <div className={`mt-2 p-2.5 rounded-lg text-xs ${isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'}`}>
                    {p.lastFailureReason}
                  </div>
                )}
              </div>

              {result && (
                <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                  result.success
                    ? isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                    : isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'
                }`}>
                  {result.success ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  <span className="flex-1">{result.success ? 'OK' : result.message}</span>
                  <span className="font-mono">{result.latencyMs}ms</span>
                </div>
              )}

              <button
                onClick={() => handleTest(p.id)}
                disabled={testingId === p.id}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                  isDarkMode
                    ? 'border-neutral-700 text-gray-300 hover:bg-white/[0.04]'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                } disabled:opacity-40`}
              >
                {testingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
                Test Connection
              </button>
            </div>
          );
        })}
      </div>

      {/* Recent errors summary */}
      {health.recentErrors24h > 0 && (
        <div className={`${card} p-6`}>
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Recent Errors — last 24 hours
            </h3>
          </div>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {health.recentErrors24h} error{health.recentErrors24h !== 1 ? 's' : ''} detected across all providers.
            Check the Authorization Log tab for detailed failure entries.
          </p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Shared helpers
   ═══════════════════════════════════════════════ */
function LoadingSpinner({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className={`w-6 h-6 animate-spin ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
    </div>
  );
}

function ErrorCard({ isDarkMode, card, message, onRetry }: { isDarkMode: boolean; card: string; message: string; onRetry: () => void }) {
  return (
    <div className={`${card} p-8 text-center space-y-3`}>
      <AlertTriangle className={`w-8 h-8 mx-auto ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />
      <p className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{message}</p>
      <button onClick={onRetry} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:shadow-xl transition-all">
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    </div>
  );
}

function Detail({ label, value, isDarkMode }: { label: string; value: string; isDarkMode: boolean }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-xs font-mono break-all ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{value}</p>
    </div>
  );
}
