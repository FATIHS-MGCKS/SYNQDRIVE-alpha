import { AlertCircle, Building2, Calendar, Car, Clock, DollarSign, MapPin, Tag, User } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useCallback, useRef } from 'react';

import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';

interface Fine {
  id: string;
  fineNumber: string | null;
  title: string;
  description: string;
  offenseType: string;
  issuingAuthority: string;
  offenseDate: string | null;
  receivedDate: string | null;
  location: string;
  amountCents: number;
  currency: string;
  dueDate: string | null;
  status: string;
  vehicleId: string | null;
  bookingId: string | null;
  customerId: string | null;
  imageUrl: string | null;
  extractedData: any;
  notes: string;
  createdAt: string;
  tasks?: { id: string; title: string; status: string }[];
}

interface Stats {
  total: number;
  new: number;
  matched: number;
  forwarded: number;
  resolved: number;
  totalAmountCents: number;
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  NEW: { label: 'Neu', bg: 'bg-blue-500/15', text: 'text-blue-500', dot: 'bg-blue-500' },
  UNDER_REVIEW: { label: 'In Prüfung', bg: 'bg-amber-500/15', text: 'text-amber-500', dot: 'bg-amber-500' },
  MATCHED: { label: 'Zugeordnet', bg: 'bg-emerald-500/15', text: 'text-emerald-500', dot: 'bg-emerald-500' },
  FORWARDED: { label: 'Weitergeleitet', bg: 'bg-purple-500/15', text: 'text-purple-500', dot: 'bg-purple-500' },
  PENDING_RESPONSE: { label: 'Warte auf Antwort', bg: 'bg-orange-500/15', text: 'text-orange-500', dot: 'bg-orange-500' },
  RESOLVED: { label: 'Gelöst', bg: 'bg-green-500/15', text: 'text-green-600', dot: 'bg-green-600' },
  CLOSED: { label: 'Geschlossen', bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-400' },
};

const OFFENSE_TYPES = [
  'Geschwindigkeitsüberschreitung', 'Parkverstoß', 'Rotlichtverstoß', 'Mautgebühr',
  'Umweltzonenverstoß', 'Halteverstoß', 'Abstandsverstoß', 'Handyverstoß',
  'Sonstiges',
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatAmount(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100);
}

export function FinesView({ isDarkMode }: { isDarkMode: boolean }) {
  const { orgId } = useRentalOrg();
  const [fines, setFines] = useState<Fine[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [view, setView] = useState<'list' | 'create' | 'upload' | 'detail'>('list');
  const [selectedFine, setSelectedFine] = useState<Fine | null>(null);

  const tp = isDarkMode ? 'text-white' : 'text-gray-900';
  const ts = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const card = `rounded-xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;
  const inputCls = `w-full px-4 py-3 rounded-xl border text-xs ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} outline-none`;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [fList, fStats, vList] = await Promise.all([
        api.fines.list(orgId),
        api.fines.stats(orgId),
        api.vehicles.listByOrg(orgId).catch(() => []),
      ]);
      setFines(fList || []);
      setStats(fStats);
      setVehicles(Array.isArray(vList) ? vList : (vList as { data?: any[] })?.data || []);
    } catch { setFines([]); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (f: Fine) => {
    if (!orgId) return;
    try {
      const full = await api.fines.get(orgId, f.id);
      setSelectedFine(full);
      setView('detail');
    } catch {
      setSelectedFine(f);
      setView('detail');
    }
  };

  const filtered = fines.filter(f => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!f.title.toLowerCase().includes(q) && !f.fineNumber?.toLowerCase().includes(q) && !f.location.toLowerCase().includes(q) && !f.offenseType.toLowerCase().includes(q)) return false;
    }
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    return true;
  });

  const statusOptions = ['all', 'NEW', 'UNDER_REVIEW', 'MATCHED', 'FORWARDED', 'PENDING_RESPONSE', 'RESOLVED', 'CLOSED'];
  const statusCount = (status: string) =>
    status === 'all' ? fines.length : fines.filter(fine => fine.status === status).length;
  const openCount = fines.filter(fine => fine.status !== 'RESOLVED' && fine.status !== 'CLOSED').length;
  const activeStatusLabel = statusFilter === 'all' ? 'Alle Status' : STATUS_MAP[statusFilter]?.label || statusFilter;
  const hasActiveFilters = Boolean(searchTerm) || statusFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setIsStatusOpen(false);
  };

  // ── Detail view ──
  if (view === 'detail' && selectedFine) {
    return <FineDetail isDarkMode={isDarkMode} fine={selectedFine} orgId={orgId || ''} onBack={() => { setView('list'); setSelectedFine(null); load(); }} onUpdate={(f) => setSelectedFine(f)} card={card} tp={tp} ts={ts} inputCls={inputCls} />;
  }

  // ── Create form ──
  if (view === 'create') {
    return <CreateFineForm isDarkMode={isDarkMode} orgId={orgId || ''} vehicles={vehicles} onClose={() => setView('list')} onCreated={(f) => { setView('detail'); setSelectedFine(f); load(); }} card={card} tp={tp} ts={ts} inputCls={inputCls} />;
  }

  // ── AI Upload flow ──
  if (view === 'upload') {
    return <AIUploadFlow isDarkMode={isDarkMode} orgId={orgId || ''} vehicles={vehicles} onClose={() => setView('list')} onCreated={(f) => { setView('detail'); setSelectedFine(f); load(); }} card={card} tp={tp} ts={ts} inputCls={inputCls} />;
  }

  // ── Main list ──
  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex min-h-8 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] leading-[1.12] font-bold tracking-[-0.02em] text-foreground">
            Bußgelder
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView('upload')}
            className="sq-press flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border"
          >
            <Icon name="sparkles" className="h-4 w-4 text-purple-500" />
            KI-Upload
          </button>
          <button
            type="button"
            onClick={() => setView('create')}
            className="sq-press flex items-center gap-2 rounded-xl bg-[color:var(--brand)] px-3 py-2 text-[10px] font-semibold text-white shadow-[var(--shadow-1)] transition-all hover:opacity-90"
          >
            <Icon name="plus" className="h-4 w-4" />
            Manuell erfassen
          </button>
        </div>
      </div>

      {/* Segment metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          {
            label: 'Gesamt',
            value: stats?.total ?? fines.length,
            helper: `${filtered.length} aktuell sichtbar`,
            icon: AlertCircle,
            action: () => clearFilters(),
            active: !hasActiveFilters,
            tone: 'sq-tone-neutral',
          },
          {
            label: 'Betrag',
            value: formatAmount(stats?.totalAmountCents || 0),
            helper: `${openCount} offene Vorgänge`,
            icon: DollarSign,
            action: () => clearFilters(),
            active: false,
            tone: 'sq-tone-brand',
          },
          {
            label: 'Neu',
            value: stats?.new ?? statusCount('NEW'),
            helper: 'noch nicht bearbeitet',
            icon: Clock,
            action: () => setStatusFilter(statusFilter === 'NEW' ? 'all' : 'NEW'),
            active: statusFilter === 'NEW',
            tone: (stats?.new ?? statusCount('NEW')) > 0 ? 'sq-tone-warning' : 'sq-tone-neutral',
          },
          {
            label: 'Gelöst',
            value: stats?.resolved ?? statusCount('RESOLVED'),
            helper: `${statusCount('FORWARDED')} weitergeleitet`,
            icon: Tag,
            action: () => setStatusFilter(statusFilter === 'RESOLVED' ? 'all' : 'RESOLVED'),
            active: statusFilter === 'RESOLVED',
            tone: 'sq-tone-success',
          },
        ].map(metric => {
          const MetricIcon = metric.icon;
          return (
            <button
              key={metric.label}
              type="button"
              onClick={metric.action}
              className={`group sq-card sq-press rounded-2xl p-4 text-left shadow-[var(--shadow-1)] transition-all ${
                metric.active ? 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_22%,transparent)]' : 'hover:bg-muted/35'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 truncate text-[20px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
                    {metric.value}
                  </p>
                  <p className="mt-2 truncate text-[10px] font-medium text-muted-foreground">{metric.helper}</p>
                </div>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}>
                  <MetricIcon className="h-4 w-4" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon name="filter" className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Filters</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Showing {filtered.length} of {fines.length} fines
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-warning"
              >
                {activeStatusLabel} active ×
              </button>
            )}
            {searchTerm && (
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                Search active
              </span>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all ${
                  isDarkMode
                    ? 'bg-red-900/30 border-red-700/50 text-red-400 hover:bg-red-900/50'
                    : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                }`}
              >
                <Icon name="x" className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Icon name="search" className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              placeholder="Bußgeld, Nummer, Ort oder Verstoß suchen..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`w-full rounded-lg border py-2.5 pl-10 pr-4 text-xs outline-none transition-all ${
                isDarkMode
                  ? 'bg-neutral-800 border-neutral-700 text-gray-200 placeholder-gray-500 focus:border-blue-500/50'
                  : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-300'
              }`}
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsStatusOpen(!isStatusOpen)}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-all ${
                statusFilter !== 'all'
                  ? isDarkMode
                    ? 'bg-blue-900/30 border-blue-700/50 text-blue-400'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
                  : isDarkMode
                    ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-800'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{activeStatusLabel}</span>
              <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${isStatusOpen ? 'rotate-180' : ''}`} />
            </button>
            {isStatusOpen && (
              <div className={`absolute right-0 top-full z-50 mt-2 min-w-[230px] overflow-hidden rounded-lg border shadow-xl sm:left-0 sm:right-auto ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}>
                {statusOptions.map(status => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setStatusFilter(status);
                      setIsStatusOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                      status === statusFilter
                        ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                        : isDarkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{status === 'all' ? 'Alle Status' : STATUS_MAP[status]?.label || status}</span>
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums sq-tone-neutral">
                      {statusCount(status)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="sq-card rounded-2xl overflow-hidden shadow-[var(--shadow-1)]">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Icon name="loader-2" className={`w-5 h-5 animate-spin ${ts}`} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="alert-circle" className={`w-10 h-10 mx-auto mb-3 ${ts} opacity-40`} />
            <p className={`text-sm font-medium ${tp}`}>Keine Bußgelder gefunden</p>
            <p className={`text-xs mt-1 ${ts}`}>{searchTerm || statusFilter !== 'all' ? 'Versuchen Sie andere Filter.' : 'Erfassen Sie Ihr erstes Bußgeld über KI-Upload oder manuell.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className={isDarkMode ? 'bg-neutral-800/50' : 'bg-muted/50'}>
                  {['Typ / Titel', 'Betrag', 'Datum', 'Fahrzeug', 'Status', 'Kunde', 'Aufgabe'].map(h => (
                    <th key={h} className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${ts}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
                {filtered.map(f => {
                  const st = STATUS_MAP[f.status] || STATUS_MAP.NEW;
                  return (
                    <tr key={f.id} onClick={() => openDetail(f)} className={`cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-neutral-800/40' : 'hover:bg-gray-50/60'}`}>
                      <td className="px-4 py-3">
                        <p className={`text-xs font-semibold ${tp}`}>{f.title}</p>
                        <p className={`text-[10px] ${ts}`}>{f.offenseType || '—'}{f.fineNumber ? ` · #${f.fineNumber}` : ''}</p>
                      </td>
                      <td className={`px-4 py-3 text-xs font-bold ${tp}`}>{formatAmount(f.amountCents, f.currency)}</td>
                      <td className={`px-4 py-3 text-[11px] ${ts}`}>{formatDate(f.offenseDate)}</td>
                      <td className={`px-4 py-3 text-[11px] ${ts}`}>{f.vehicleId ? f.vehicleId.slice(0, 8) + '...' : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-[11px] ${ts}`}>{f.customerId ? <span className="text-emerald-500 font-medium">Zugeordnet</span> : '—'}</td>
                      <td className="px-4 py-3">
                        {f.tasks && f.tasks.length > 0 ? (
                          <span className={`text-[10px] font-medium ${f.tasks[0].status === 'DONE' ? 'text-green-500' : 'text-amber-500'}`}>
                            {f.tasks[0].status === 'DONE' ? 'Erledigt' : 'Offen'}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// MANUAL CREATE FORM
// ════════════════════════════════════════════════

function CreateFineForm({ isDarkMode, orgId, vehicles, onClose, onCreated, card, tp, ts, inputCls }: {
  isDarkMode: boolean; orgId: string; vehicles: any[]; onClose: () => void; onCreated: (f: Fine) => void;
  card: string; tp: string; ts: string; inputCls: string;
}) {
  const [form, setForm] = useState({
    title: '', offenseType: '', fineNumber: '', issuingAuthority: '', description: '',
    offenseDate: '', receivedDate: '', location: '', amountCents: 0, currency: 'EUR',
    dueDate: '', vehicleId: '', notes: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    const r = new FileReader();
    r.onload = () => setImagePreview(r.result as string);
    r.readAsDataURL(f);
  };

  const handleSubmit = async () => {
    if (!form.title || !form.amountCents) return;
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const res = await api.fines.uploadImage(orgId, imageFile);
        imageUrl = res.url;
      }
      const fine = await api.fines.create(orgId, { ...form, imageUrl });
      onCreated(fine);
    } catch { setSaving(false); }
  };

  const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));

  const labelCls = `block text-[11px] font-semibold mb-1.5 ${ts} uppercase tracking-wider`;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={onClose} className={`flex items-center gap-1 text-xs font-medium ${ts} transition-colors`}>
        <Icon name="chevron-left" className="w-4 h-4" /> Zurück
      </button>

      <div className={`${card} p-6`}>
        <h2 className={`text-base font-bold ${tp} mb-5`}>Bußgeld manuell erfassen</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Titel / Vergehen *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} placeholder="z. B. Geschwindigkeitsüberschreitung A81" />
          </div>
          <div>
            <label className={labelCls}>Vergehensart</label>
            <select value={form.offenseType} onChange={e => set('offenseType', e.target.value)} className={inputCls}>
              <option value="">Auswählen...</option>
              {OFFENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Aktenzeichen / Nr.</label>
            <input value={form.fineNumber} onChange={e => set('fineNumber', e.target.value)} className={inputCls} placeholder="Bußgeldnummer" />
          </div>
          <div>
            <label className={labelCls}>Betrag (EUR) *</label>
            <input type="number" step="0.01" value={form.amountCents ? (form.amountCents / 100).toFixed(2) : ''} onChange={e => set('amountCents', Math.round(parseFloat(e.target.value || '0') * 100))} className={inputCls} placeholder="0.00" />
          </div>
          <div>
            <label className={labelCls}>Behörde</label>
            <input value={form.issuingAuthority} onChange={e => set('issuingAuthority', e.target.value)} className={inputCls} placeholder="z. B. Stadt Stuttgart" />
          </div>
          <div>
            <label className={labelCls}>Tatdatum</label>
            <input type="date" value={form.offenseDate} onChange={e => set('offenseDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Eingangsdatum</label>
            <input type="date" value={form.receivedDate} onChange={e => set('receivedDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Fälligkeitsdatum</label>
            <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tatort</label>
            <input value={form.location} onChange={e => set('location', e.target.value)} className={inputCls} placeholder="Ort / Straße" />
          </div>
          <div>
            <label className={labelCls}>Fahrzeug</label>
            <select value={form.vehicleId} onChange={e => set('vehicleId', e.target.value)} className={inputCls}>
              <option value="">Auswählen...</option>
              {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.make} {v.model} – {v.licensePlate || v.vin?.slice(-6)}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Beschreibung / Notizen</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Zusätzliche Informationen..." />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Dokument / Bild</label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleImage} className="hidden" />
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="Preview" className="h-24 rounded-xl object-cover" />
                <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"><Icon name="x" className="w-3 h-3" /></button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-xs font-medium transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-400' : 'border-gray-300 text-gray-500'}`}>
                <Icon name="image" className="w-4 h-4" /> Bild/Dokument anhängen
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' }}>
          <button onClick={onClose} className={`px-4 py-2.5 rounded-xl text-xs font-semibold border ${isDarkMode ? 'border-neutral-700 text-gray-400' : 'border-gray-200 text-gray-600'}`}>Abbrechen</button>
          <button onClick={handleSubmit} disabled={saving || !form.title || !form.amountCents} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon name="plus" className="w-3.5 h-3.5" />} Bußgeld erfassen
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// AI UPLOAD FLOW
// ════════════════════════════════════════════════

function AIUploadFlow({ isDarkMode, orgId, vehicles, onClose, onCreated, card, tp, ts, inputCls }: {
  isDarkMode: boolean; orgId: string; vehicles: any[]; onClose: () => void; onCreated: (f: Fine) => void;
  card: string; tp: string; ts: string; inputCls: string;
}) {
  const [step, setStep] = useState<'upload' | 'analyzing' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const r = new FileReader();
    r.onload = () => setPreview(r.result as string);
    r.readAsDataURL(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    setFile(f);
    const r = new FileReader();
    r.onload = () => setPreview(r.result as string);
    r.readAsDataURL(f);
  };

  const runExtraction = async () => {
    if (!file) return;
    setStep('analyzing');
    try {
      const uploadRes = await api.fines.uploadImage(orgId, file);
      setImageUrl(uploadRes.url);
    } catch { /* continue even if upload fails for local preview */ }

    // No fine OCR/extraction service is wired yet. Previously this method
    // fabricated Aktenzeichen, amounts, location and dates via Math.random()
    // which is unsafe for a legal/regulatory record that directly drives
    // driver liability. Until a real extraction service is available, we
    // drop the user into manual-entry mode with sensible defaults.
    setExtracted({
      title: '',
      offenseType: '',
      fineNumber: '',
      issuingAuthority: '',
      amountCents: '',
      location: '',
      offenseDate: '',
      receivedDate: new Date().toISOString().split('T')[0],
    });
    setStep('review');
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const fine = await api.fines.create(orgId, {
        title: extracted.title || 'Bußgeld',
        offenseType: extracted.offenseType || '',
        fineNumber: extracted.fineNumber || '',
        issuingAuthority: extracted.issuingAuthority || '',
        amountCents: parseInt(extracted.amountCents || '0', 10),
        location: extracted.location || '',
        offenseDate: extracted.offenseDate || '',
        receivedDate: extracted.receivedDate || '',
        dueDate: extracted.dueDate || '',
        vehicleId: extracted.vehicleId || '',
        imageUrl,
        extractedData: extracted,
      });
      onCreated(fine);
    } catch { setSaving(false); }
  };

  const setEx = (k: string, v: string) => setExtracted(p => ({ ...p, [k]: v }));
  const labelCls = `block text-[11px] font-semibold mb-1.5 ${ts} uppercase tracking-wider`;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={onClose} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
        <Icon name="chevron-left" className="w-4 h-4" /> Zurück
      </button>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className={`${card} p-6`}>
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100/60'}`}>
              <Icon name="sparkles" className="w-4.5 h-4.5 text-purple-500" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${tp}`}>KI-gestützte Erfassung</h2>
              <p className={`text-xs ${ts}`}>Laden Sie ein Bußgelddokument hoch – die KI extrahiert die Daten automatisch.</p>
            </div>
          </div>

          <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => !file && fileRef.current?.click()}
            className={`relative p-8 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${isDarkMode ? 'border-neutral-700 hover:border-purple-500/50 bg-neutral-800/30' : 'border-gray-300 hover:border-purple-400 bg-gray-50/40'}`}
          >
            {preview ? (
              <div className="space-y-3">
                <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-xl object-contain" />
                <p className={`text-xs font-medium ${tp}`}>{file?.name}</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }} className="text-xs text-red-500 underline">Andere Datei wählen</button>
              </div>
            ) : (
              <div>
                <Icon name="upload" className={`w-8 h-8 mx-auto mb-3 ${ts} opacity-50`} />
                <p className={`text-sm font-medium ${tp}`}>Dokument hier ablegen</p>
                <p className={`text-xs mt-1 ${ts}`}>oder klicken zum Auswählen (Bild / PDF)</p>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-5">
            <button onClick={runExtraction} disabled={!file} className="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
              <Icon name="sparkles" className="w-3.5 h-3.5" /> Analysieren
            </button>
          </div>
        </div>
      )}

      {/* Step: Analyzing */}
      {step === 'analyzing' && (
        <div className={`${card} p-10 text-center`}>
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-ping" />
            <div className="absolute inset-0 rounded-full flex items-center justify-center bg-purple-500/15">
              <Icon name="sparkles" className="w-6 h-6 text-purple-500 animate-pulse" />
            </div>
          </div>
          <h3 className={`text-sm font-bold ${tp}`}>KI analysiert das Dokument...</h3>
          <p className={`text-xs mt-2 ${ts}`}>Bußgelddaten werden extrahiert. Einen Moment bitte.</p>
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <div className={`${card} p-6`}>
          <div className="flex items-center gap-2 mb-5">
            <Icon name="check-circle" className="w-5 h-5 text-emerald-500" />
            <h2 className={`text-base font-bold ${tp}`}>Extrahierte Daten prüfen</h2>
          </div>
          <p className={`text-xs mb-5 ${ts}`}>Bitte prüfen und korrigieren Sie die automatisch erkannten Werte, bevor Sie das Bußgeld erfassen.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Titel / Vergehen</label>
              <input value={extracted.title || ''} onChange={e => setEx('title', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Vergehensart</label>
              <select value={extracted.offenseType || ''} onChange={e => setEx('offenseType', e.target.value)} className={inputCls}>
                <option value="">Auswählen...</option>
                {OFFENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Aktenzeichen</label>
              <input value={extracted.fineNumber || ''} onChange={e => setEx('fineNumber', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Betrag (EUR)</label>
              <input type="number" step="0.01" value={extracted.amountCents ? (parseInt(extracted.amountCents, 10) / 100).toFixed(2) : ''} onChange={e => setEx('amountCents', String(Math.round(parseFloat(e.target.value || '0') * 100)))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Behörde</label>
              <input value={extracted.issuingAuthority || ''} onChange={e => setEx('issuingAuthority', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Tatdatum</label>
              <input type="date" value={extracted.offenseDate || ''} onChange={e => setEx('offenseDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Tatort</label>
              <input value={extracted.location || ''} onChange={e => setEx('location', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fahrzeug</label>
              <select value={extracted.vehicleId || ''} onChange={e => setEx('vehicleId', e.target.value)} className={inputCls}>
                <option value="">Auswählen...</option>
                {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.make} {v.model} – {v.licensePlate || v.vin?.slice(-6)}</option>)}
              </select>
            </div>
          </div>

          {preview && (
            <div className="mt-5 pt-4 border-t" style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' }}>
              <p className={`text-[11px] font-semibold mb-2 ${ts} uppercase tracking-wider`}>Quelldokument</p>
              <img src={preview} alt="Source" className="max-h-36 rounded-xl object-contain" />
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' }}>
            <button onClick={() => { setStep('upload'); setExtracted({}); }} className={`px-4 py-2.5 rounded-xl text-xs font-semibold border ${isDarkMode ? 'border-neutral-700 text-gray-400' : 'border-gray-200 text-gray-600'}`}>Zurück</button>
            <button onClick={handleConfirm} disabled={saving || !extracted.title} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
              {saving ? <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon name="check-circle" className="w-3.5 h-3.5" />} Bestätigen & erfassen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// FINE DETAIL
// ════════════════════════════════════════════════

function FineDetail({ isDarkMode, fine, orgId, onBack, onUpdate, card, tp, ts, inputCls }: {
  isDarkMode: boolean; fine: Fine; orgId: string;
  onBack: () => void; onUpdate: (f: Fine) => void;
  card: string; tp: string; ts: string; inputCls: string;
}) {
  const [changingStatus, setChangingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(fine.notes || '');

  const st = STATUS_MAP[fine.status] || STATUS_MAP.NEW;

  const changeStatus = async (status: string) => {
    setShowStatusMenu(false);
    setChangingStatus(true);
    try {
      const updated = await api.fines.update(orgId, fine.id, { status });
      onUpdate(updated);
    } catch { /* ignore */ }
    finally { setChangingStatus(false); }
  };

  const saveNotes = async () => {
    try {
      const updated = await api.fines.update(orgId, fine.id, { notes });
      onUpdate(updated);
      setEditingNotes(false);
    } catch { /* ignore */ }
  };

  const row = (label: string, value: string | React.ReactNode, icon?: React.ElementType) => {
    const Icon = icon;
    return (
      <div className="flex items-start gap-3 py-2.5">
        {Icon && <Icon className={`w-4 h-4 mt-0.5 ${ts} shrink-0`} />}
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] ${ts} uppercase tracking-wider font-semibold`}>{label}</p>
          <div className={`text-xs mt-0.5 ${tp}`}>{value || '—'}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button onClick={onBack} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
        <Icon name="chevron-left" className="w-4 h-4" /> Zurück
      </button>

      {/* Header card */}
      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {fine.fineNumber && <span className={`text-xs font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>#{fine.fineNumber}</span>}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
              </span>
            </div>
            <h2 className={`text-base font-bold ${tp}`}>{fine.title}</h2>
            <p className={`text-xs mt-1 ${ts}`}>{fine.offenseType} · {formatAmount(fine.amountCents, fine.currency)}</p>
          </div>
          <div className="relative">
            <button onClick={() => setShowStatusMenu(!showStatusMenu)} disabled={changingStatus} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
              {changingStatus ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="edit-3" className="w-3 h-3" />} Status
            </button>
            {showStatusMenu && (
              <div className={`absolute right-0 top-full mt-1 z-20 w-48 rounded-xl border shadow-xl overflow-hidden ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
                {Object.entries(STATUS_MAP).map(([key, val]) => (
                  <button key={key} onClick={() => changeStatus(key)} className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-300' : 'hover:bg-gray-50 text-gray-700'} ${fine.status === key ? 'font-bold' : ''}`}>
                    {val.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Bußgeld-Details</h3>
          <div className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
            {row('Betrag', <span className="font-bold text-sm">{formatAmount(fine.amountCents, fine.currency)}</span>, DollarSign)}
            {row('Vergehensart', fine.offenseType, Tag)}
            {row('Behörde', fine.issuingAuthority, Building2)}
            {row('Tatdatum', formatDate(fine.offenseDate), Calendar)}
            {row('Eingangsdatum', formatDate(fine.receivedDate), Clock)}
            {row('Fälligkeitsdatum', formatDate(fine.dueDate), AlertCircle)}
            {row('Tatort', fine.location, MapPin)}
          </div>
        </div>

        <div className="space-y-4">
          {/* Linking */}
          <div className={`${card} p-5`}>
            <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Zuordnung</h3>
            <div className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
              {row('Fahrzeug', fine.vehicleId ? <span className="font-mono text-[11px]">{fine.vehicleId.slice(0, 12)}...</span> : '—', Car)}
              {row('Buchung', fine.bookingId ? <span className="text-emerald-500 font-medium">Automatisch zugeordnet</span> : <span className={ts}>Nicht zugeordnet</span>, Calendar)}
              {row('Kunde / Fahrer', fine.customerId ? <span className="text-emerald-500 font-medium">Automatisch zugeordnet</span> : <span className={ts}>Nicht zugeordnet</span>, User)}
            </div>
          </div>

          {/* Task */}
          {fine.tasks && fine.tasks.length > 0 && (
            <div className={`${card} p-5`}>
              <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Verknüpfte Aufgabe</h3>
              {fine.tasks.map((t: any) => (
                <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isDarkMode ? 'border-neutral-700/30 bg-neutral-800/30' : 'border-gray-100 bg-gray-50/50'}`}>
                  <Icon name="list-todo" className={`w-4 h-4 ${t.status === 'DONE' ? 'text-green-500' : 'text-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium ${tp} truncate`}>{t.title}</p>
                    <p className={`text-[10px] ${ts}`}>{t.status === 'DONE' ? 'Erledigt' : t.status === 'IN_PROGRESS' ? 'In Bearbeitung' : 'Offen'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Document / image */}
      {fine.imageUrl && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Dokument</h3>
          <img src={fine.imageUrl} alt="Fine document" className="max-h-64 rounded-xl object-contain cursor-pointer hover:opacity-90" onClick={() => window.open(fine.imageUrl!, '_blank')} />
        </div>
      )}

      {/* Notes */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-xs font-bold ${tp} uppercase tracking-wider`}>Interne Notizen</h3>
          {!editingNotes && (
            <button onClick={() => setEditingNotes(true)} className={`text-[11px] font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Bearbeiten</button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-3">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Interne Anmerkungen..." />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setEditingNotes(false); setNotes(fine.notes || ''); }} className={`px-3 py-1.5 rounded-lg text-xs ${ts}`}>Abbrechen</button>
              <button onClick={saveNotes} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold">Speichern</button>
            </div>
          </div>
        ) : (
          <p className={`text-xs ${fine.notes ? tp : ts}`}>{fine.notes || 'Keine Notizen vorhanden.'}</p>
        )}
      </div>

      {/* Description */}
      {fine.description && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-2 uppercase tracking-wider`}>Beschreibung</h3>
          <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{fine.description}</p>
        </div>
      )}
    </div>
  );
}
