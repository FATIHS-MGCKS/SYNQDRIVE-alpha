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
import { PageHeader, DataTable, MetricCard, DataCard, EmptyState, StatusChip, SectionHeader } from '../../components/patterns';
import { api } from '../../lib/api';
import type {
  PartsProviderSummary,
  PartsDisclosureTemplate,
  PartsAuthorizationLogEntry,
  PartsConnectionTestResult,
  PartsHealthOverview,
} from '../../lib/api';

/* ── Design-system token helpers ── */
const CARD = 'sq-card overflow-hidden';
const INPUT =
  'w-full px-4 py-2.5 rounded-xl border border-border bg-muted/50 text-sm text-foreground transition-colors outline-none focus:border-[color:var(--brand)] placeholder:text-muted-foreground';
const LABEL = 'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';
const HEAD = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';
const TAB_BAR = 'sq-tab-bar flex gap-1 p-1 rounded-2xl overflow-x-auto w-fit';
const TAB_ACTIVE = 'sq-tab-active flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap';
const TAB_IDLE = 'sq-tab flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap text-muted-foreground hover:text-foreground';


interface PartsAccessoriesAdminViewProps {}

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

export function PartsAccessoriesAdminView() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Parts & Accessories — Admin"
        icon={<Truck className="w-4 h-4" />}
      />

      <div className={TAB_BAR}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === t.id ? TAB_ACTIVE : TAB_IDLE
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'providers' && <ProvidersTab />}
      {activeTab === 'disclosures' && <DisclosuresTab />}
      {activeTab === 'authlog' && <AuthLogTab />}
      {activeTab === 'health' && <HealthTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 1 — Overview
   ═══════════════════════════════════════════════ */
function OverviewTab() {
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

  if (loading) return <LoadingSpinner />;
  if (!health) return <ErrorCard message="Failed to load overview data." onRetry={load} />;

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
          <div key={s.label} className={`${CARD} p-5`}>
            <p className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>{s.label}</p>
            <p className={`text-2xl font-bold mt-2 ${s.color ?? ('text-foreground')}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-6`}>
        <h3 className={`text-sm font-bold mb-4 text-foreground`}>Provider Status</h3>
        <div className="space-y-3">
          {health.providers.map(p => (
            <div
              key={p.id}
              className={`flex items-center justify-between py-3 px-4 rounded-xl ${
                'bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[p.healthStatus] ?? STATUS_DOT.unknown}`} />
                <span className={`text-sm font-semibold text-foreground`}>{p.displayName}</span>
                <span className={`text-xs text-muted-foreground`}>{p.key}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className={'text-muted-foreground'}>
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
function ProvidersTab() {
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

  if (loading) return <LoadingSpinner />;

  const rowBg = (i: number) =>
    i % 2 === 0
      ? 'bg-muted/50'
      : '';

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b border-border`}>
                {['Name', 'Key', 'Status', 'Categories', 'Integration', 'Environment', 'Health', 'Last Test', 'Actions'].map(h => (
                  <th key={h} className={`text-left px-5 py-3.5 ${HEAD}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providers.map((p, i) => (
                <tr key={p.id} className={`border-b border-border '' transition-colors`}>
                  <td className={`px-5 py-3 font-semibold text-foreground`}>{p.displayName}</td>
                  <td className={`px-5 py-3 font-mono text-xs text-muted-foreground`}>{p.key}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                      p.isEnabled
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : 'sq-chip-neutral'
                    }`}>
                      {p.isEnabled ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      {p.isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(p.supportedCategories ?? []).map((c: string) => (
                        <span key={c} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          'sq-tone-brand'
                        }`}>{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className={`px-5 py-3 text-xs text-muted-foreground`}>{p.integrationType}</td>
                  <td className={`px-5 py-3 text-xs capitalize text-muted-foreground`}>{p.environmentMode ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`w-2.5 h-2.5 rounded-full inline-block ${STATUS_DOT[p.healthStatus] ?? STATUS_DOT.unknown}`} />
                  </td>
                  <td className={`px-5 py-3 text-xs text-muted-foreground`}>{formatDate(p.lastTestedAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(p)} className={`p-1.5 rounded-lg transition-colors hover:bg-muted`}>
                        <Settings2 className={`w-4 h-4 text-muted-foreground`} />
                      </button>
                      <button
                        onClick={() => handleTest(p.id)}
                        disabled={testingId === p.id}
                        className={`p-1.5 rounded-lg transition-colors hover:bg-muted`}
                      >
                        {testingId === p.id
                          ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                          : <TestTube className={`w-4 h-4 text-muted-foreground`} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {providers.length === 0 && (
                <tr><td colSpan={9} className={`px-5 py-10 text-center text-sm text-muted-foreground`}>No providers configured.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Test result toast */}
      {testResult && (
        <div className={`${CARD} p-4 flex items-center gap-3`}>
          {testResult.success
            ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            : <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
          <div className="flex-1">
            <p className={`text-sm font-semibold text-foreground`}>
              {testResult.success ? 'Connection successful' : 'Connection failed'}
            </p>
            {testResult.message && <p className={`text-xs mt-0.5 text-muted-foreground`}>{testResult.message}</p>}
          </div>
          <span className={`text-xs font-mono text-muted-foreground`}>{testResult.latencyMs}ms</span>
          <button onClick={() => setTestResult(null)} className={`p-1 rounded-lg hover:bg-muted`}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit panel */}
      {editId && (
        <div className={`${CARD} p-6 space-y-5`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-base font-bold text-foreground`}>Edit Provider</h3>
            <button onClick={() => setEditId(null)} className={`p-1.5 rounded-lg hover:bg-muted`}>
              <X className={`w-4 h-4 text-muted-foreground`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={LABEL}>Display Name</label>
              <input className={INPUT} value={editData.displayName} onChange={e => setEditData(d => ({ ...d, displayName: e.target.value }))} />
            </div>
            <div>
              <label className={LABEL}>Environment</label>
              <select className={INPUT} value={editData.environmentMode} onChange={e => setEditData(d => ({ ...d, environmentMode: e.target.value }))}>
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={LABEL}>Description</label>
              <textarea className={`${INPUT} min-h-[72px] resize-y`} value={editData.description} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))} />
            </div>
            <div>
              <label className={LABEL}>Timeout (ms)</label>
              <input type="number" className={INPUT} value={editData.timeoutMs} onChange={e => setEditData(d => ({ ...d, timeoutMs: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={LABEL}>Max Retries</label>
              <input type="number" className={INPUT} value={editData.maxRetries} onChange={e => setEditData(d => ({ ...d, maxRetries: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={LABEL}>Ranking Weight</label>
              <input type="number" step="0.1" className={INPUT} value={editData.rankingWeight} onChange={e => setEditData(d => ({ ...d, rankingWeight: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={LABEL}>Enabled</label>
              <button
                onClick={() => setEditData(d => ({ ...d, isEnabled: !d.isEnabled }))}
                className={`mt-1 flex items-center gap-2 text-sm font-bold ${editData.isEnabled ? 'text-emerald-500' : 'text-muted-foreground'}`}
              >
                {editData.isEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                {editData.isEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div>
            <label className={LABEL}>Supported Categories</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                    (editData.supportedCategories ?? []).includes(cat)
                      ? 'sq-tone-brand border-border'
                      : 'bg-muted/50 border-border text-muted-foreground'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setEditId(null)} className="sq-3d-btn sq-3d-btn--neutral px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="sq-3d-btn sq-3d-btn--primary flex items-center gap-2 px-5 py-2 text-sm font-semibold disabled:opacity-50">
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
function DisclosuresTab() {
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

  if (loading) return <LoadingSpinner />;

  const rowBg = (i: number) => i % 2 === 0 ? ('bg-muted/50') : '';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="sq-3d-btn sq-3d-btn--primary flex items-center gap-2 px-4 py-2 text-sm font-semibold">
          <Plus className="w-4 h-4" /> New Disclosure
        </button>
      </div>

      {showForm && (
        <div className={`${CARD} p-6 space-y-5`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-base font-bold text-foreground`}>{editId ? 'Edit Disclosure' : 'New Disclosure'}</h3>
            <button onClick={resetForm} className={`p-1.5 rounded-lg hover:bg-muted`}>
              <X className={`w-4 h-4 text-muted-foreground`} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className={LABEL}>Title</label>
              <input className={INPUT} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Disclosure title…" />
            </div>
            <div className="md:col-span-2">
              <label className={LABEL}>Body</label>
              <textarea className={`${INPUT} min-h-[120px] resize-y`} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Disclosure text shown to users…" />
            </div>
            <div>
              <label className={LABEL}>Provider Key (optional)</label>
              <input className={INPUT} value={form.providerKey} onChange={e => setForm(f => ({ ...f, providerKey: e.target.value }))} placeholder="e.g. tirendo" />
            </div>
            <div>
              <label className={LABEL}>Category (optional)</label>
              <select className={INPUT} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Active</label>
              <button
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`mt-1 flex items-center gap-2 text-sm font-bold ${form.isActive ? 'text-emerald-500' : 'text-muted-foreground'}`}
              >
                {form.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                {form.isActive ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={resetForm} className="sq-3d-btn sq-3d-btn--neutral px-4 py-2 text-sm font-semibold">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title || !form.body} className="sq-3d-btn sq-3d-btn--primary flex items-center gap-2 px-5 py-2 text-sm font-semibold disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b border-border`}>
                {['Title', 'Provider Key', 'Category', 'Version', 'Active', 'Effective From', 'Actions'].map(h => (
                  <th key={h} className={`text-left px-5 py-3.5 ${HEAD}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {disclosures.map((d, i) => (
                <tr key={d.id} className={`border-b border-border ''`}>
                  <td className={`px-5 py-3 font-semibold text-foreground`}>{d.title}</td>
                  <td className={`px-5 py-3 font-mono text-xs text-muted-foreground`}>{d.providerKey ?? '—'}</td>
                  <td className={`px-5 py-3 text-xs text-muted-foreground`}>{d.category ?? 'All'}</td>
                  <td className={`px-5 py-3 text-xs font-mono text-muted-foreground`}>v{d.version}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ${
                      d.isActive ? 'bg-emerald-500/15 text-emerald-600' : 'sq-chip-neutral'
                    }`}>{d.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className={`px-5 py-3 text-xs text-muted-foreground`}>{formatDate(d.effectiveFrom)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => openEdit(d)} className={`p-1.5 rounded-lg transition-colors hover:bg-muted`}>
                      <Settings2 className={`w-4 h-4 text-muted-foreground`} />
                    </button>
                  </td>
                </tr>
              ))}
              {disclosures.length === 0 && (
                <tr><td colSpan={7} className={`px-5 py-10 text-center text-sm text-muted-foreground`}>No disclosure templates.</td></tr>
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
function AuthLogTab() {
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
    return map[status] ?? ('sq-chip-neutral');
  };

  const rowBg = (i: number) => i % 2 === 0 ? ('bg-muted/50') : '';

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className={`${CARD} p-4`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <input type="date" className={INPUT} value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1); }} placeholder="From" />
          <input type="date" className={INPUT} value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1); }} placeholder="To" />
          <input className={INPUT} value={filterProvider} onChange={e => { setFilterProvider(e.target.value); setPage(1); }} placeholder="Provider key…" />
          <select className={INPUT} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <select className={INPUT} value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b border-border`}>
                  {['', 'Date', 'Organization', 'User', 'Vehicle', 'Provider', 'Category', 'Status', 'Correlation ID'].map(h => (
                    <th key={h} className={`text-left px-5 py-3.5 ${HEAD}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <>
                    <tr
                      key={r.id}
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      className={`border-b border-border '' cursor-pointer transition-colors hover:bg-muted/50`}
                    >
                      <td className="px-3 py-3">
                        {expandedId === r.id
                          ? <ChevronUp className={`w-4 h-4 text-muted-foreground`} />
                          : <ChevronDown className={`w-4 h-4 text-muted-foreground`} />}
                      </td>
                      <td className={`px-5 py-3 text-xs text-muted-foreground`}>{formatDate(r.confirmedAt)}</td>
                      <td className={`px-5 py-3 text-xs font-mono truncate max-w-[120px] text-muted-foreground`}>{r.organizationId.slice(0, 8)}…</td>
                      <td className={`px-5 py-3 text-xs font-mono truncate max-w-[120px] text-muted-foreground`}>{r.userId.slice(0, 8)}…</td>
                      <td className={`px-5 py-3 text-xs font-mono truncate max-w-[120px] text-muted-foreground`}>{r.vehicleId.slice(0, 8)}…</td>
                      <td className={`px-5 py-3 text-xs font-semibold text-muted-foreground`}>{r.providerDisplayName}</td>
                      <td className={`px-5 py-3 text-xs text-muted-foreground`}>{r.category}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${statusBadge(r.executionStatus)}`}>{r.executionStatus}</span>
                      </td>
                      <td className={`px-5 py-3 text-[10px] font-mono text-muted-foreground`}>{r.correlationId.slice(0, 12)}…</td>
                    </tr>
                    {expandedId === r.id && (
                      <tr key={`${r.id}-detail`} className={'bg-muted/50'}>
                        <td colSpan={9} className="px-8 py-5">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                            <Detail label="Organization ID" value={r.organizationId} />
                            <Detail label="User ID" value={r.userId} />
                            <Detail label="Vehicle ID" value={r.vehicleId} />
                            <Detail label="Provider Key" value={r.providerKey} />
                            <Detail label="Notice Version" value={`v${r.noticeVersion}`} />
                            <Detail label="Correlation ID" value={r.correlationId} />
                            <Detail label="Confirmed At" value={formatDate(r.confirmedAt)} />
                            <Detail label="Created At" value={formatDate(r.createdAt)} />
                            <Detail label="Execution Status" value={r.executionStatus} />
                            {r.executionFailureReason && (
                              <div className="col-span-full">
                                <Detail label="Failure Reason" value={r.executionFailureReason} />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className={`px-5 py-10 text-center text-sm text-muted-foreground`}>No authorization log entries found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className={`flex items-center justify-between px-5 py-3 border-t border-border`}>
            <span className={`text-xs text-muted-foreground`}>{total} total entries</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 hover:bg-muted`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className={`text-xs font-semibold text-muted-foreground`}>
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 hover:bg-muted`}
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
function HealthTab() {
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

  if (loading) return <LoadingSpinner />;
  if (!health) return <ErrorCard message="Failed to load health data." onRetry={load} />;

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
            <div key={p.id} className={`${CARD} p-6 space-y-4`}>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className={`text-sm font-bold text-foreground`}>{p.displayName}</h4>
                  <p className={`text-xs mt-0.5 font-mono text-muted-foreground`}>{p.key}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${healthColor(p.healthStatus)} flex items-center justify-center shadow-lg`}>
                  {p.healthStatus === 'healthy' && <CheckCircle className="w-5 h-5 text-white" />}
                  {p.healthStatus === 'degraded' && <AlertTriangle className="w-5 h-5 text-white" />}
                  {p.healthStatus !== 'healthy' && p.healthStatus !== 'degraded' && <XCircle className="w-5 h-5 text-white" />}
                </div>
              </div>

              <div className={`text-center py-4 rounded-xl bg-muted/50`}>
                <p className={`text-2xl font-black bg-gradient-to-br ${healthColor(p.healthStatus)} bg-clip-text text-transparent`}>
                  {healthLabel(p.healthStatus)}
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className={'text-muted-foreground'}>Last Tested</span>
                  <span className={'text-muted-foreground'}>{formatDate(p.lastTestedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={'text-muted-foreground'}>Last Success</span>
                  <span className="text-emerald-500">{formatDate(p.lastSuccessAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={'text-muted-foreground'}>Last Failure</span>
                  <span className="text-red-500">{formatDate(p.lastFailureAt)}</span>
                </div>
                {p.lastFailureReason && (
                  <div className={`mt-2 p-2.5 rounded-lg text-xs sq-tone-critical`}>
                    {p.lastFailureReason}
                  </div>
                )}
              </div>

              {result && (
                <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                  result.success
                    ? 'sq-tone-success'
                    : 'sq-tone-critical'
                }`}>
                  {result.success ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  <span className="flex-1">{result.success ? 'OK' : result.message}</span>
                  <span className="font-mono">{result.latencyMs}ms</span>
                </div>
              )}

              <button
                onClick={() => handleTest(p.id)}
                disabled={testingId === p.id}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors border border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
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
        <div className={`${CARD} p-6`}>
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className={`text-sm font-bold text-foreground`}>
              Recent Errors — last 24 hours
            </h3>
          </div>
          <p className={`text-sm text-muted-foreground`}>
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
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className={`w-6 h-6 animate-spin text-muted-foreground`} />
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={`${CARD} p-8 text-center space-y-3`}>
      <AlertTriangle className={`w-8 h-8 mx-auto text-[color:var(--status-watch)]`} />
      <p className={`text-sm font-medium text-muted-foreground`}>{message}</p>
      <button onClick={onRetry} className="sq-3d-btn sq-3d-btn--primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold">
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string;  }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>{label}</p>
      <p className={`text-xs font-mono break-all text-foreground`}>{value}</p>
    </div>
  );
}
