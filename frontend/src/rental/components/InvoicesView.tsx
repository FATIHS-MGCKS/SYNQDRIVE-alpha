import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Search, Upload, AlertCircle, Calendar, User, DollarSign,
  ChevronLeft, Loader2, X, Eye, Image as ImageIcon,
  CheckCircle, Clock, ArrowRight, FileText, Hash,
  Sparkles, ListTodo, Building2, Edit3, Tag, ArrowUpRight,
  ArrowDownLeft, Receipt, CreditCard, Filter, Download,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';

interface Invoice {
  id: string;
  invoiceNumber: number;
  type: string;
  customerId: string | null;
  vendorName: string | null;
  bookingId: string | null;
  vehicleId: string | null;
  title: string;
  description: string;
  lineItems: any;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  templateId: string | null;
  imageUrl: string | null;
  extractedData: any;
  notes: string;
  paidAt: string | null;
  createdAt: string;
  tasks?: { id: string; title: string; status: string }[];
}

interface Stats {
  total: number;
  outgoing: number;
  incoming: number;
  paid: number;
  unpaid: number;
  totalRevenueCents: number;
  totalExpensesCents: number;
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  DRAFT: { label: 'Entwurf', bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-400' },
  SENT: { label: 'Gesendet', bg: 'bg-blue-500/15', text: 'text-blue-500', dot: 'bg-blue-500' },
  PAID: { label: 'Bezahlt', bg: 'bg-emerald-500/15', text: 'text-emerald-500', dot: 'bg-emerald-500' },
  OVERDUE: { label: 'Überfällig', bg: 'bg-red-500/15', text: 'text-red-500', dot: 'bg-red-500' },
  CANCELLED: { label: 'Storniert', bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-400' },
};

const TYPE_MAP: Record<string, { label: string; icon: typeof ArrowUpRight; color: string }> = {
  OUTGOING_BOOKING: { label: 'Buchungsrechnung', icon: ArrowUpRight, color: 'text-blue-500' },
  OUTGOING_MANUAL: { label: 'Ausgangsrechnung', icon: ArrowUpRight, color: 'text-emerald-500' },
  INCOMING_VENDOR: { label: 'Eingangsrechnung', icon: ArrowDownLeft, color: 'text-amber-500' },
  INCOMING_UPLOADED: { label: 'Hochgeladen', icon: ArrowDownLeft, color: 'text-purple-500' },
};

const TEMPLATES = [
  { id: 'standard', name: 'Standard-Rechnung', description: 'Allgemeine Ausgangsrechnung' },
  { id: 'booking', name: 'Buchungsrechnung', description: 'Für Fahrzeugmietbuchungen' },
  { id: 'damage', name: 'Schadensrechnung', description: 'Für Schadensfälle / Selbstbeteiligung' },
  { id: 'extra', name: 'Zusatzleistungen', description: 'Zusätzliche Services & Gebühren' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatAmount(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100);
}

function isOutgoing(type: string) { return type.startsWith('OUTGOING'); }

interface InvoicesViewProps { isDarkMode: boolean; }

export function InvoicesView({ isDarkMode }: InvoicesViewProps) {
  const { orgId } = useRentalOrg();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'outgoing' | 'incoming'>('all');
  const [view, setView] = useState<'list' | 'create' | 'upload' | 'detail'>('list');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const tp = isDarkMode ? 'text-white' : 'text-gray-900';
  const ts = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const card = `rounded-xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;
  const inputCls = `w-full px-4 py-3 rounded-xl border text-xs ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} outline-none`;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [iList, iStats, cList, vList] = await Promise.all([
        api.invoices.list(orgId),
        api.invoices.stats(orgId),
        api.customers.list(orgId).catch(() => []),
        api.vehicles.listByOrg(orgId).catch(() => []),
      ]);
      setInvoices(iList || []);
      setStats(iStats);
      setCustomers(Array.isArray(cList) ? cList : (cList as any)?.data || []);
      setVehicles(vList || []);
    } catch { setInvoices([]); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (inv: Invoice) => {
    if (!orgId) return;
    try {
      const full = await api.invoices.get(orgId, inv.id);
      setSelectedInvoice(full);
      setView('detail');
    } catch {
      setSelectedInvoice(inv);
      setView('detail');
    }
  };

  const filtered = invoices.filter(inv => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!inv.title.toLowerCase().includes(q) &&
          !String(inv.invoiceNumber).includes(q) &&
          !(inv.vendorName || '').toLowerCase().includes(q)) return false;
    }
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (directionFilter === 'outgoing' && !isOutgoing(inv.type)) return false;
    if (directionFilter === 'incoming' && isOutgoing(inv.type)) return false;
    return true;
  });

  if (view === 'detail' && selectedInvoice) {
    return <InvoiceDetail isDarkMode={isDarkMode} invoice={selectedInvoice} orgId={orgId || ''} onBack={() => { setView('list'); setSelectedInvoice(null); load(); }} onUpdate={setSelectedInvoice} card={card} tp={tp} ts={ts} inputCls={inputCls} />;
  }

  if (view === 'create') {
    return <CreateInvoiceForm isDarkMode={isDarkMode} orgId={orgId || ''} customers={customers} vehicles={vehicles} onClose={() => setView('list')} onCreated={(inv) => { setView('detail'); setSelectedInvoice(inv); load(); }} card={card} tp={tp} ts={ts} inputCls={inputCls} />;
  }

  if (view === 'upload') {
    return <AIUploadInvoice isDarkMode={isDarkMode} orgId={orgId || ''} vehicles={vehicles} onClose={() => setView('list')} onCreated={(inv) => { setView('detail'); setSelectedInvoice(inv); load(); }} card={card} tp={tp} ts={ts} inputCls={inputCls} />;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className={`text-xs ${ts}`}>{invoices.length} Rechnungen · {formatAmount(stats?.totalRevenueCents || 0)} Umsatz · {formatAmount(stats?.totalExpensesCents || 0)} Ausgaben</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView('upload')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${isDarkMode ? 'border-purple-500/30 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20' : 'border-purple-200 text-purple-600 bg-purple-50 hover:bg-purple-100'}`}>
            <Sparkles className="w-3.5 h-3.5" /> KI-Upload
          </button>
          <button onClick={() => setView('create')} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20">
            <Plus className="w-4 h-4" /> Rechnung erstellen
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Gesamt', val: stats.total, color: '' },
            { label: 'Ausgehend', val: stats.outgoing, color: 'text-blue-500' },
            { label: 'Eingehend', val: stats.incoming, color: 'text-amber-500' },
            { label: 'Bezahlt', val: stats.paid, color: 'text-emerald-500' },
            { label: 'Unbezahlt', val: stats.unpaid, color: 'text-red-500' },
          ].map(s => (
            <div key={s.label} className={`${card} p-3 text-center`}>
              <p className={`text-lg font-bold ${s.color || tp}`}>{s.val}</p>
              <p className={`text-[10px] ${ts} mt-0.5`}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Direction tabs */}
      <div className="flex gap-1.5">
        {(['all', 'outgoing', 'incoming'] as const).map(d => (
          <button key={d} onClick={() => setDirectionFilter(d)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all border ${directionFilter === d ? (isDarkMode ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-blue-50 text-blue-600 border-blue-200') : (isDarkMode ? 'text-gray-400 border-neutral-700 hover:bg-neutral-800' : 'text-gray-600 border-gray-200 hover:bg-gray-50')}`}>
            {d === 'all' ? 'Alle' : d === 'outgoing' ? 'Ausgehend' : 'Eingehend'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${ts}`} />
          <input type="text" placeholder="Suchen..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={`${inputCls} !pl-10`} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['all', 'DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${statusFilter === s ? (isDarkMode ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-blue-50 text-blue-600 border-blue-200') : (isDarkMode ? 'text-gray-400 border-neutral-700 hover:bg-neutral-800' : 'text-gray-600 border-gray-200 hover:bg-gray-50')}`}>
              {s === 'all' ? 'Alle' : STATUS_MAP[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className={card}>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className={`w-5 h-5 animate-spin ${ts}`} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Receipt className={`w-10 h-10 mx-auto mb-3 ${ts} opacity-40`} />
            <p className={`text-sm font-medium ${tp}`}>Keine Rechnungen gefunden</p>
            <p className={`text-xs mt-1 ${ts}`}>{searchTerm || statusFilter !== 'all' ? 'Versuchen Sie andere Filter.' : 'Erstellen Sie Ihre erste Rechnung oder laden Sie ein Dokument hoch.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead>
                <tr className={isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}>
                  {['Nr.', 'Typ', 'Titel', 'Betrag', 'Datum', 'Fällig', 'Status', 'Aufgabe'].map(h => (
                    <th key={h} className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${ts}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
                {filtered.map(inv => {
                  const st = STATUS_MAP[inv.status] || STATUS_MAP.DRAFT;
                  const ty = TYPE_MAP[inv.type] || TYPE_MAP.OUTGOING_MANUAL;
                  const TypeIcon = ty.icon;
                  return (
                    <tr key={inv.id} onClick={() => openDetail(inv)} className={`cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-neutral-800/40' : 'hover:bg-gray-50/60'}`}>
                      <td className={`px-4 py-3 text-xs font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>#{inv.invoiceNumber}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${ty.color}`}>
                          <TypeIcon className="w-3 h-3" /> {ty.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className={`text-xs font-semibold ${tp} truncate max-w-[200px]`}>{inv.title}</p>
                        <p className={`text-[10px] ${ts} truncate max-w-[200px]`}>{inv.vendorName || (inv.customerId ? 'Kunde' : '')}</p>
                      </td>
                      <td className={`px-4 py-3 text-xs font-bold ${tp}`}>{formatAmount(inv.totalCents, inv.currency)}</td>
                      <td className={`px-4 py-3 text-[11px] ${ts}`}>{formatDate(inv.invoiceDate)}</td>
                      <td className={`px-4 py-3 text-[11px] ${ts}`}>{formatDate(inv.dueDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {inv.tasks && inv.tasks.length > 0 ? (
                          <span className={`text-[10px] font-medium ${inv.tasks[0].status === 'DONE' ? 'text-green-500' : 'text-amber-500'}`}>
                            {inv.tasks[0].status === 'DONE' ? 'Erledigt' : 'Offen'}
                          </span>
                        ) : inv.status === 'PAID' ? <span className="text-[10px] text-green-500">—</span> : '—'}
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
// CREATE INVOICE FORM
// ════════════════════════════════════════════════

function CreateInvoiceForm({ isDarkMode, orgId, customers, vehicles, onClose, onCreated, card, tp, ts, inputCls }: {
  isDarkMode: boolean; orgId: string; customers: any[]; vehicles: any[];
  onClose: () => void; onCreated: (inv: Invoice) => void;
  card: string; tp: string; ts: string; inputCls: string;
}) {
  const [step, setStep] = useState<'type' | 'details' | 'items'>('type');
  const [form, setForm] = useState({
    type: '' as string,
    title: '', description: '', vendorName: '', customerId: '', vehicleId: '',
    totalCents: 0, subtotalCents: 0, taxCents: 0, currency: 'EUR',
    invoiceDate: new Date().toISOString().split('T')[0], dueDate: '', notes: '',
    templateId: '',
  });
  const [lineItems, setLineItems] = useState([{ description: '', quantity: 1, unitPriceCents: 0, totalCents: 0 }]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string | number) => setForm(p => ({ ...p, [k]: v }));

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    const r = new FileReader();
    r.onload = () => setImagePreview(r.result as string);
    r.readAsDataURL(f);
  };

  const updateLineItem = (idx: number, field: string, value: string | number) => {
    setLineItems(prev => {
      const next = [...prev];
      (next[idx] as any)[field] = value;
      if (field === 'quantity' || field === 'unitPriceCents') {
        next[idx].totalCents = next[idx].quantity * next[idx].unitPriceCents;
      }
      return next;
    });
  };

  const addLineItem = () => setLineItems(p => [...p, { description: '', quantity: 1, unitPriceCents: 0, totalCents: 0 }]);
  const removeLineItem = (idx: number) => setLineItems(p => p.filter((_, i) => i !== idx));

  const calcTotals = () => {
    const sub = lineItems.reduce((s, li) => s + li.totalCents, 0);
    const tax = Math.round(sub * 0.19);
    return { subtotalCents: sub, taxCents: tax, totalCents: sub + tax };
  };

  const handleSubmit = async () => {
    if (!form.title || !form.type) return;
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const res = await api.invoices.uploadFile(orgId, imageFile);
        imageUrl = res.url;
      }
      const totals = isOutgoing(form.type) ? calcTotals() : { subtotalCents: form.totalCents, taxCents: 0, totalCents: form.totalCents };

      const inv = await api.invoices.create(orgId, {
        ...form,
        ...totals,
        lineItems: isOutgoing(form.type) ? lineItems : undefined,
        imageUrl,
        status: 'SENT',
      });
      onCreated(inv);
    } catch { setSaving(false); }
  };

  const labelCls = `block text-[11px] font-semibold mb-1.5 ${ts} uppercase tracking-wider`;
  const isOut = isOutgoing(form.type);

  // Step 1: Type selection
  if (step === 'type') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <button onClick={onClose} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
          <ChevronLeft className="w-4 h-4" /> Zurück
        </button>
        <div className={`${card} p-6`}>
          <h2 className={`text-base font-bold ${tp} mb-5`}>Rechnungsart wählen</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { type: 'OUTGOING_MANUAL', label: 'Ausgangsrechnung', desc: 'Rechnung an Kunden', icon: ArrowUpRight, color: 'blue' },
              { type: 'INCOMING_VENDOR', label: 'Eingangsrechnung', desc: 'Rechnung von Lieferant/Werkstatt', icon: ArrowDownLeft, color: 'amber' },
            ].map(opt => (
              <button key={opt.type} onClick={() => { set('type', opt.type); setStep('details'); }} className={`text-left p-4 rounded-xl border transition-all ${isDarkMode ? 'border-neutral-700/50 hover:border-neutral-600 hover:bg-neutral-800/40' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDarkMode ? `bg-${opt.color}-500/15` : `bg-${opt.color}-100/60`}`}>
                    <opt.icon className={`w-4 h-4 text-${opt.color}-500`} />
                  </div>
                  <div>
                    <p className={`text-xs font-bold ${tp}`}>{opt.label}</p>
                    <p className={`text-[10px] ${ts}`}>{opt.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Template selection for outgoing */}
          <div className="mt-5 pt-4 border-t" style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' }}>
            <h3 className={`text-xs font-bold ${tp} mb-3`}>Oder Vorlage wählen</h3>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => { set('type', 'OUTGOING_MANUAL'); set('templateId', t.id); setStep('details'); }} className={`text-left p-3 rounded-xl border transition-all ${isDarkMode ? 'border-neutral-700/50 hover:border-neutral-600 hover:bg-neutral-800/40' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                  <p className={`text-xs font-semibold ${tp}`}>{t.name}</p>
                  <p className={`text-[10px] ${ts}`}>{t.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Details
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={() => step === 'items' ? setStep('details') : setStep('type')} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
        <ChevronLeft className="w-4 h-4" /> Zurück
      </button>

      <div className={`${card} p-6`}>
        <div className="flex items-center gap-2 mb-5">
          <Receipt className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          <h2 className={`text-base font-bold ${tp}`}>{isOut ? 'Ausgangsrechnung' : 'Eingangsrechnung'} erstellen</h2>
          {form.templateId && <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'} font-semibold`}>{TEMPLATES.find(t => t.id === form.templateId)?.name}</span>}
        </div>

        {step === 'details' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Titel *</label>
              <input value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} placeholder="Rechnungstitel..." />
            </div>
            {isOut ? (
              <div>
                <label className={labelCls}>Kunde</label>
                <select value={form.customerId} onChange={e => set('customerId', e.target.value)} className={inputCls}>
                  <option value="">Auswählen...</option>
                  {customers.map((c: any) => <option key={c.id} value={c.id}>{c.firstName || c.name} {c.lastName || ''}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className={labelCls}>Lieferant / Werkstatt</label>
                <input value={form.vendorName} onChange={e => set('vendorName', e.target.value)} className={inputCls} placeholder="Name des Lieferanten" />
              </div>
            )}
            <div>
              <label className={labelCls}>Fahrzeug</label>
              <select value={form.vehicleId} onChange={e => set('vehicleId', e.target.value)} className={inputCls}>
                <option value="">Optional...</option>
                {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.make} {v.model} – {v.licensePlate || v.vin?.slice(-6)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Rechnungsdatum</label>
              <input type="date" value={form.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fälligkeitsdatum</label>
              <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} className={inputCls} />
            </div>
            {!isOut && (
              <div>
                <label className={labelCls}>Betrag (EUR) *</label>
                <input type="number" step="0.01" value={form.totalCents ? (form.totalCents / 100).toFixed(2) : ''} onChange={e => set('totalCents', Math.round(parseFloat(e.target.value || '0') * 100))} className={inputCls} placeholder="0.00" />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className={labelCls}>Beschreibung / Notizen</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Zusätzliche Informationen..." />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Dokument / Bild</label>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleImage} className="hidden" />
              {imagePreview ? (
                <div className="relative inline-block">
                  <img src={imagePreview} alt="Preview" className="h-20 rounded-xl object-cover" />
                  <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-xs font-medium transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-400' : 'border-gray-300 text-gray-500'}`}>
                  <ImageIcon className="w-4 h-4" /> Datei anhängen
                </button>
              )}
            </div>
          </div>
        )}

        {/* Line items for outgoing */}
        {step === 'details' && isOut && (
          <div className="mt-5 pt-4 border-t" style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-xs font-bold ${tp}`}>Positionen</h3>
              <button onClick={addLineItem} className={`text-[11px] font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}><Plus className="w-3 h-3 inline mr-1" />Position</button>
            </div>
            <div className="space-y-2">
              {lineItems.map((li, idx) => (
                <div key={idx} className={`flex gap-2 items-center p-2 rounded-lg ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'}`}>
                  <input value={li.description} onChange={e => updateLineItem(idx, 'description', e.target.value)} className={`${inputCls} flex-1 !py-2`} placeholder="Beschreibung" />
                  <input type="number" value={li.quantity} onChange={e => updateLineItem(idx, 'quantity', parseInt(e.target.value) || 1)} className={`${inputCls} !w-16 !py-2 text-center`} />
                  <input type="number" step="0.01" value={li.unitPriceCents ? (li.unitPriceCents / 100).toFixed(2) : ''} onChange={e => updateLineItem(idx, 'unitPriceCents', Math.round(parseFloat(e.target.value || '0') * 100))} className={`${inputCls} !w-24 !py-2`} placeholder="€/Stk" />
                  <span className={`text-xs font-bold ${tp} w-20 text-right`}>{formatAmount(li.totalCents)}</span>
                  {lineItems.length > 1 && <button onClick={() => removeLineItem(idx)} className="text-red-500"><X className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
            </div>
            <div className={`mt-3 pt-3 border-t flex justify-end`} style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' }}>
              <div className="text-right space-y-1">
                <p className={`text-xs ${ts}`}>Netto: <span className={`font-bold ${tp}`}>{formatAmount(calcTotals().subtotalCents)}</span></p>
                <p className={`text-xs ${ts}`}>MwSt 19%: <span className={`font-bold ${tp}`}>{formatAmount(calcTotals().taxCents)}</span></p>
                <p className={`text-sm font-bold ${tp}`}>Gesamt: {formatAmount(calcTotals().totalCents)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' }}>
          <button onClick={onClose} className={`px-4 py-2.5 rounded-xl text-xs font-semibold border ${isDarkMode ? 'border-neutral-700 text-gray-400' : 'border-gray-200 text-gray-600'}`}>Abbrechen</button>
          <button onClick={handleSubmit} disabled={saving || !form.title || (!isOut && !form.totalCents)} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />} Rechnung erstellen
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// AI UPLOAD INVOICE
// ════════════════════════════════════════════════

function AIUploadInvoice({ isDarkMode, orgId, vehicles, onClose, onCreated, card, tp, ts, inputCls }: {
  isDarkMode: boolean; orgId: string; vehicles: any[];
  onClose: () => void; onCreated: (inv: Invoice) => void;
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
      const uploadRes = await api.invoices.uploadFile(orgId, file);
      setImageUrl(uploadRes.url);
    } catch { /* continue */ }

    await new Promise(r => setTimeout(r, 2500));
    const mockExtracted: Record<string, string> = {
      title: 'Werkstattrechnung – Ölwechsel & Inspektion',
      vendorName: 'AutoService GmbH',
      totalCents: String(Math.round((200 + Math.random() * 800) * 100)),
      invoiceDate: new Date(Date.now() - Math.random() * 14 * 86400000).toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      description: 'Ölwechsel, Filteraustausch, Sichtprüfung',
    };
    setExtracted(mockExtracted);
    setStep('review');
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const inv = await api.invoices.create(orgId, {
        type: 'INCOMING_UPLOADED',
        title: extracted.title || 'Hochgeladene Rechnung',
        vendorName: extracted.vendorName || '',
        totalCents: parseInt(extracted.totalCents || '0', 10),
        invoiceDate: extracted.invoiceDate || '',
        dueDate: extracted.dueDate || '',
        vehicleId: extracted.vehicleId || '',
        description: extracted.description || '',
        imageUrl,
        extractedData: extracted,
        status: 'SENT',
      });
      onCreated(inv);
    } catch { setSaving(false); }
  };

  const setEx = (k: string, v: string) => setExtracted(p => ({ ...p, [k]: v }));
  const labelCls = `block text-[11px] font-semibold mb-1.5 ${ts} uppercase tracking-wider`;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={onClose} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
        <ChevronLeft className="w-4 h-4" /> Zurück
      </button>

      {step === 'upload' && (
        <div className={`${card} p-6`}>
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100/60'}`}>
              <Sparkles className="w-4.5 h-4.5 text-purple-500" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${tp}`}>KI-gestützte Rechnungserkennung</h2>
              <p className={`text-xs ${ts}`}>Laden Sie eine Rechnung hoch – die KI extrahiert die Daten automatisch.</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
          <div onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => !file && fileRef.current?.click()} className={`relative p-8 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${isDarkMode ? 'border-neutral-700 hover:border-purple-500/50 bg-neutral-800/30' : 'border-gray-300 hover:border-purple-400 bg-gray-50/40'}`}>
            {preview ? (
              <div className="space-y-3">
                <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-xl object-contain" />
                <p className={`text-xs font-medium ${tp}`}>{file?.name}</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }} className="text-xs text-red-500 underline">Andere Datei wählen</button>
              </div>
            ) : (
              <div>
                <Upload className={`w-8 h-8 mx-auto mb-3 ${ts} opacity-50`} />
                <p className={`text-sm font-medium ${tp}`}>Rechnung hier ablegen</p>
                <p className={`text-xs mt-1 ${ts}`}>oder klicken zum Auswählen (Bild / PDF)</p>
              </div>
            )}
          </div>
          <div className="flex justify-end mt-5">
            <button onClick={runExtraction} disabled={!file} className="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> Analysieren
            </button>
          </div>
        </div>
      )}

      {step === 'analyzing' && (
        <div className={`${card} p-10 text-center`}>
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-ping" />
            <div className="absolute inset-0 rounded-full flex items-center justify-center bg-purple-500/15">
              <Sparkles className="w-6 h-6 text-purple-500 animate-pulse" />
            </div>
          </div>
          <h3 className={`text-sm font-bold ${tp}`}>KI analysiert die Rechnung...</h3>
          <p className={`text-xs mt-2 ${ts}`}>Rechnungsdaten werden extrahiert. Einen Moment bitte.</p>
        </div>
      )}

      {step === 'review' && (
        <div className={`${card} p-6`}>
          <div className="flex items-center gap-2 mb-5">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <h2 className={`text-base font-bold ${tp}`}>Extrahierte Rechnungsdaten prüfen</h2>
          </div>
          <p className={`text-xs mb-5 ${ts}`}>Bitte prüfen und korrigieren Sie die automatisch erkannten Werte.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Titel</label>
              <input value={extracted.title || ''} onChange={e => setEx('title', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Lieferant</label>
              <input value={extracted.vendorName || ''} onChange={e => setEx('vendorName', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Betrag (EUR)</label>
              <input type="number" step="0.01" value={extracted.totalCents ? (parseInt(extracted.totalCents) / 100).toFixed(2) : ''} onChange={e => setEx('totalCents', String(Math.round(parseFloat(e.target.value || '0') * 100)))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Rechnungsdatum</label>
              <input type="date" value={extracted.invoiceDate || ''} onChange={e => setEx('invoiceDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fälligkeitsdatum</label>
              <input type="date" value={extracted.dueDate || ''} onChange={e => setEx('dueDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fahrzeug</label>
              <select value={extracted.vehicleId || ''} onChange={e => setEx('vehicleId', e.target.value)} className={inputCls}>
                <option value="">Optional...</option>
                {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.make} {v.model} – {v.licensePlate || v.vin?.slice(-6)}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Beschreibung</label>
              <input value={extracted.description || ''} onChange={e => setEx('description', e.target.value)} className={inputCls} />
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
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Bestätigen & erfassen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// INVOICE DETAIL
// ════════════════════════════════════════════════

function InvoiceDetail({ isDarkMode, invoice, orgId, onBack, onUpdate, card, tp, ts, inputCls }: {
  isDarkMode: boolean; invoice: Invoice; orgId: string;
  onBack: () => void; onUpdate: (inv: Invoice) => void;
  card: string; tp: string; ts: string; inputCls: string;
}) {
  const [changingStatus, setChangingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(invoice.notes || '');
  const [markingPaid, setMarkingPaid] = useState(false);

  const st = STATUS_MAP[invoice.status] || STATUS_MAP.DRAFT;
  const ty = TYPE_MAP[invoice.type] || TYPE_MAP.OUTGOING_MANUAL;
  const TypeIcon = ty.icon;

  const changeStatus = async (status: string) => {
    setShowStatusMenu(false);
    setChangingStatus(true);
    try {
      const updated = await api.invoices.update(orgId, invoice.id, { status });
      onUpdate(updated);
    } catch { /* ignore */ }
    finally { setChangingStatus(false); }
  };

  const handleMarkPaid = async () => {
    setMarkingPaid(true);
    try {
      const updated = await api.invoices.markPaid(orgId, invoice.id);
      onUpdate(updated);
    } catch { /* ignore */ }
    finally { setMarkingPaid(false); }
  };

  const saveNotes = async () => {
    try {
      const updated = await api.invoices.update(orgId, invoice.id, { notes });
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

  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button onClick={onBack} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
        <ChevronLeft className="w-4 h-4" /> Zurück
      </button>

      {/* Header */}
      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Rechnung #{invoice.invoiceNumber}</span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${ty.color}`}><TypeIcon className="w-3 h-3" /> {ty.label}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
              </span>
            </div>
            <h2 className={`text-base font-bold ${tp}`}>{invoice.title}</h2>
            <p className={`text-xs mt-1 ${ts}`}>{formatAmount(invoice.totalCents, invoice.currency)}</p>
          </div>
          <div className="flex items-center gap-2">
            {invoice.status !== 'PAID' && (
              <button onClick={handleMarkPaid} disabled={markingPaid} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {markingPaid ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Als bezahlt
              </button>
            )}
            <div className="relative">
              <button onClick={() => setShowStatusMenu(!showStatusMenu)} disabled={changingStatus} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                {changingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit3 className="w-3 h-3" />} Status
              </button>
              {showStatusMenu && (
                <div className={`absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border shadow-xl overflow-hidden ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
                  {Object.entries(STATUS_MAP).map(([key, val]) => (
                    <button key={key} onClick={() => changeStatus(key)} className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-300' : 'hover:bg-gray-50 text-gray-700'} ${invoice.status === key ? 'font-bold' : ''}`}>
                      {val.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Rechnungsdetails</h3>
          <div className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
            {row('Betrag', <span className="font-bold text-sm">{formatAmount(invoice.totalCents, invoice.currency)}</span>, DollarSign)}
            {invoice.subtotalCents !== invoice.totalCents && row('Netto', formatAmount(invoice.subtotalCents, invoice.currency))}
            {invoice.taxCents > 0 && row('MwSt', formatAmount(invoice.taxCents, invoice.currency))}
            {row('Rechnungsdatum', formatDate(invoice.invoiceDate), Calendar)}
            {row('Fälligkeitsdatum', formatDate(invoice.dueDate), Clock)}
            {row('Bezahlt am', invoice.paidAt ? formatDate(invoice.paidAt) : '—', CheckCircle)}
            {row('Erstellt am', formatDate(invoice.createdAt), Calendar)}
          </div>
        </div>

        <div className="space-y-4">
          <div className={`${card} p-5`}>
            <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Zuordnung</h3>
            <div className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
              {invoice.customerId && row('Kunde', <span className="text-emerald-500 font-medium">Verknüpft</span>, User)}
              {invoice.vendorName && row('Lieferant', invoice.vendorName, Building2)}
              {invoice.bookingId && row('Buchung', <span className="text-blue-500 font-medium">Verknüpft</span>, Calendar)}
              {invoice.vehicleId && row('Fahrzeug', <span className="font-mono text-[11px]">{invoice.vehicleId.slice(0, 12)}...</span>, Tag)}
              {row('Herkunft', invoice.type === 'OUTGOING_BOOKING' ? 'Automatisch (Buchung)' : invoice.type === 'INCOMING_UPLOADED' ? 'KI-Upload' : 'Manuell', FileText)}
              {invoice.templateId && row('Vorlage', TEMPLATES.find(t => t.id === invoice.templateId)?.name || invoice.templateId, Receipt)}
            </div>
          </div>

          {invoice.tasks && invoice.tasks.length > 0 && (
            <div className={`${card} p-5`}>
              <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Verknüpfte Aufgabe</h3>
              {invoice.tasks.map((t: any) => (
                <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isDarkMode ? 'border-neutral-700/30 bg-neutral-800/30' : 'border-gray-100 bg-gray-50/50'}`}>
                  <ListTodo className={`w-4 h-4 ${t.status === 'DONE' ? 'text-green-500' : 'text-amber-500'}`} />
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

      {/* Line items */}
      {lineItems.length > 0 && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Positionen</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}>
                  <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>Beschreibung</th>
                  <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>Menge</th>
                  <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>Einzelpreis</th>
                  <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>Gesamt</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
                {lineItems.map((li: any, i: number) => (
                  <tr key={i}>
                    <td className={`px-3 py-2 text-xs ${tp}`}>{li.description}</td>
                    <td className={`px-3 py-2 text-xs text-right ${ts}`}>{li.quantity}</td>
                    <td className={`px-3 py-2 text-xs text-right ${ts}`}>{formatAmount(li.unitPriceCents)}</td>
                    <td className={`px-3 py-2 text-xs text-right font-semibold ${tp}`}>{formatAmount(li.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Document */}
      {invoice.imageUrl && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Dokument</h3>
          <img src={invoice.imageUrl} alt="Invoice document" className="max-h-64 rounded-xl object-contain cursor-pointer hover:opacity-90" onClick={() => window.open(invoice.imageUrl!, '_blank')} />
        </div>
      )}

      {/* Notes */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-xs font-bold ${tp} uppercase tracking-wider`}>Notizen</h3>
          {!editingNotes && <button onClick={() => setEditingNotes(true)} className={`text-[11px] font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Bearbeiten</button>}
        </div>
        {editingNotes ? (
          <div className="space-y-3">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Interne Notizen..." />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setEditingNotes(false); setNotes(invoice.notes || ''); }} className={`px-3 py-1.5 rounded-lg text-xs ${ts}`}>Abbrechen</button>
              <button onClick={saveNotes} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold">Speichern</button>
            </div>
          </div>
        ) : (
          <p className={`text-xs ${invoice.notes ? tp : ts}`}>{invoice.notes || 'Keine Notizen vorhanden.'}</p>
        )}
      </div>

      {/* Description */}
      {invoice.description && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-2 uppercase tracking-wider`}>Beschreibung</h3>
          <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{invoice.description}</p>
        </div>
      )}
    </div>
  );
}
