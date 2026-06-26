import { ArrowDownLeft, ArrowUpRight, Building2, Calendar, CheckCircle, Clock, DollarSign, FileText, Receipt, Tag, User } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

import { api } from '../../lib/api';
import { SupportContextButton } from '../../components/support/SupportContextButton';
import { useRentalOrg } from '../RentalContext';
import type { Invoice, InvoiceStats } from './invoices/invoiceTypes';
import {
  STATUS_MAP,
  isOutgoing,
  formatAmount,
  formatDate,
  displayNumber,
  canIssue,
  canMarkSent,
  canRecordPayment,
} from './invoices/invoiceUtils';
import { InvoiceExtractionUpload } from './invoices/InvoiceExtractionUpload';

const TYPE_MAP: Record<string, { label: string; icon: typeof ArrowUpRight; color: string }> = {
  OUTGOING_BOOKING: { label: 'Buchungsrechnung', icon: ArrowUpRight, color: 'text-blue-500' },
  OUTGOING_MANUAL: { label: 'Ausgangsrechnung', icon: ArrowUpRight, color: 'text-emerald-500' },
  OUTGOING_FINAL: { label: 'Schlussrechnung', icon: ArrowUpRight, color: 'text-cyan-500' },
  INCOMING_VENDOR: { label: 'Eingangsrechnung', icon: ArrowDownLeft, color: 'text-amber-500' },
  INCOMING_UPLOADED: { label: 'Hochgeladen', icon: ArrowDownLeft, color: 'text-purple-500' },
};

const TEMPLATES = [
  { id: 'standard', name: 'Standard-Rechnung', description: 'Allgemeine Ausgangsrechnung' },
  { id: 'booking', name: 'Buchungsrechnung', description: 'Für Fahrzeugmietbuchungen' },
  { id: 'damage', name: 'Schadensrechnung', description: 'Für Schadensfälle / Selbstbeteiligung' },
  { id: 'extra', name: 'Zusatzleistungen', description: 'Zusätzliche Services & Gebühren' },
];
interface InvoicesViewProps { isDarkMode: boolean; }

export function InvoicesView({ isDarkMode }: InvoicesViewProps) {
  const { orgId } = useRentalOrg();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'outgoing' | 'incoming'>('all');
  const [isDirectionOpen, setIsDirectionOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
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
      const [iList, iStats, cList, vList, venList] = await Promise.all([
        api.invoices.list(orgId),
        api.invoices.stats(orgId),
        api.customers.list(orgId).catch(() => []),
        api.vehicles.listByOrg(orgId).catch(() => []),
        api.vendors.list(orgId).catch(() => []),
      ]);
      setInvoices(Array.isArray(iList) ? iList : (iList as { data?: any[] })?.data || []);
      setStats(iStats);
      setCustomers(Array.isArray(cList) ? cList : (cList as any)?.data || []);
      setVehicles(Array.isArray(vList) ? vList : (vList as { data?: any[] })?.data || []);
      setVendors(Array.isArray(venList) ? venList : []);
    } catch {
      toast.error('Rechnungen konnten nicht geladen werden');
      setInvoices([]);
    }
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
      toast.error('Rechnungsdetails konnten nicht geladen werden');
      setSelectedInvoice(inv);
      setView('detail');
    }
  };

  const filtered = invoices.filter(inv => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!inv.title.toLowerCase().includes(q) &&
          !displayNumber(inv).toLowerCase().includes(q) &&
          !(inv.vendorName || '').toLowerCase().includes(q)) return false;
    }
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (directionFilter === 'outgoing' && !isOutgoing(inv.type)) return false;
    if (directionFilter === 'incoming' && isOutgoing(inv.type)) return false;
    return true;
  });

  const statusCount = (status: string) =>
    status === 'all' ? invoices.length : invoices.filter(inv => inv.status === status).length;
  const directionCount = (direction: typeof directionFilter) =>
    direction === 'all'
      ? invoices.length
      : direction === 'outgoing'
        ? invoices.filter(inv => isOutgoing(inv.type)).length
        : invoices.filter(inv => !isOutgoing(inv.type)).length;
  const unpaidCount = stats?.unpaid ?? 0;
  const overdueCount = stats?.overdue ?? invoices.filter((inv) => inv.status === 'OVERDUE').length;
  const activeDirectionLabel =
    directionFilter === 'all' ? 'Alle Richtungen' : directionFilter === 'outgoing' ? 'Ausgehend' : 'Eingehend';
  const activeStatusLabel = statusFilter === 'all' ? 'Alle Status' : STATUS_MAP[statusFilter]?.label || statusFilter;
  const hasActiveFilters = Boolean(searchTerm) || statusFilter !== 'all' || directionFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDirectionFilter('all');
    setIsDirectionOpen(false);
    setIsStatusOpen(false);
  };

  if (view === 'detail' && selectedInvoice) {
    return <InvoiceDetail isDarkMode={isDarkMode} invoice={selectedInvoice} orgId={orgId || ''} onBack={() => { setView('list'); setSelectedInvoice(null); load(); }} onUpdate={setSelectedInvoice} card={card} tp={tp} ts={ts} inputCls={inputCls} />;
  }

  if (view === 'create') {
    return <CreateInvoiceForm isDarkMode={isDarkMode} orgId={orgId || ''} customers={customers} vehicles={vehicles} vendors={vendors} onClose={() => setView('list')} onCreated={(inv) => { setView('detail'); setSelectedInvoice(inv); load(); }} card={card} tp={tp} ts={ts} inputCls={inputCls} />;
  }

  if (view === 'upload') {
    return (
      <InvoiceExtractionUpload
        isDarkMode={isDarkMode}
        orgId={orgId || ''}
        vehicles={vehicles}
        onClose={() => setView('list')}
        onCreated={(inv) => {
          setView('detail');
          setSelectedInvoice(inv);
          load();
        }}
        card={card}
        tp={tp}
        ts={ts}
      />
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex min-h-8 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">
            Rechnungen
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
            Rechnung erstellen
          </button>
        </div>
      </div>

      {/* Segment metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          {
            label: 'Gesamt',
            value: stats?.total ?? invoices.length,
            helper: `${filtered.length} aktuell sichtbar`,
            icon: Receipt,
            action: () => clearFilters(),
            active: !hasActiveFilters,
            tone: 'sq-tone-neutral',
          },
          {
            label: 'Umsatz',
            value: formatAmount(stats?.totalRevenueCents || 0),
            helper: `${directionCount('outgoing')} Ausgangsrechnungen`,
            icon: ArrowUpRight,
            action: () => setDirectionFilter('outgoing'),
            active: directionFilter === 'outgoing',
            tone: 'sq-tone-brand',
          },
          {
            label: 'Ausgaben',
            value: formatAmount(stats?.totalExpensesCents || 0),
            helper: `${directionCount('incoming')} Eingangsrechnungen`,
            icon: ArrowDownLeft,
            action: () => setDirectionFilter('incoming'),
            active: directionFilter === 'incoming',
            tone: 'sq-tone-warning',
          },
          {
            label: 'Unbezahlt',
            value: unpaidCount,
            helper: `${overdueCount} überfällig`,
            icon: Clock,
            action: () => setStatusFilter(statusFilter === 'OVERDUE' ? 'all' : 'OVERDUE'),
            active: statusFilter === 'OVERDUE',
            tone: unpaidCount > 0 ? 'sq-tone-critical' : 'sq-tone-success',
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
                Showing {filtered.length} of {invoices.length} invoices
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {directionFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setDirectionFilter('all')}
                className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-brand"
              >
                {activeDirectionLabel} active ×
              </button>
            )}
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
              placeholder="Rechnung, Nummer oder Lieferant suchen..."
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
              onClick={() => { setIsDirectionOpen(!isDirectionOpen); setIsStatusOpen(false); }}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-all ${
                directionFilter !== 'all'
                  ? isDarkMode
                    ? 'bg-blue-900/30 border-blue-700/50 text-blue-400'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
                  : isDarkMode
                    ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-800'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{activeDirectionLabel}</span>
              <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${isDirectionOpen ? 'rotate-180' : ''}`} />
            </button>
            {isDirectionOpen && (
              <div className={`absolute left-0 top-full z-50 mt-2 min-w-[210px] overflow-hidden rounded-lg border shadow-xl ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}>
                {([
                  { value: 'all' as const, label: 'Alle Richtungen' },
                  { value: 'outgoing' as const, label: 'Ausgehend' },
                  { value: 'incoming' as const, label: 'Eingehend' },
                ]).map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setDirectionFilter(option.value);
                      setIsDirectionOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                      option.value === directionFilter
                        ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                        : isDarkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{option.label}</span>
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums sq-tone-neutral">
                      {directionCount(option.value)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => { setIsStatusOpen(!isStatusOpen); setIsDirectionOpen(false); }}
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
              <div className={`absolute right-0 top-full z-50 mt-2 min-w-[210px] overflow-hidden rounded-lg border shadow-xl sm:left-0 sm:right-auto ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}>
                {['all', 'DRAFT', 'ISSUED', 'SENT', 'NEEDS_REVIEW', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'].map(status => (
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
            <Icon name="receipt" className={`w-10 h-10 mx-auto mb-3 ${ts} opacity-40`} />
            <p className={`text-sm font-medium ${tp}`}>Keine Rechnungen gefunden</p>
            <p className={`text-xs mt-1 ${ts}`}>{searchTerm || statusFilter !== 'all' ? 'Versuchen Sie andere Filter.' : 'Erstellen Sie Ihre erste Rechnung oder laden Sie ein Dokument hoch.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead>
                <tr className={isDarkMode ? 'bg-neutral-800/50' : 'bg-muted/50'}>
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
                      <td className={`px-4 py-3 text-xs font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{displayNumber(inv)}</td>
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

function CreateInvoiceForm({ isDarkMode, orgId, customers, vehicles, vendors, onClose, onCreated, card, tp, ts, inputCls }: {
  isDarkMode: boolean; orgId: string; customers: any[]; vehicles: any[]; vendors: any[];
  onClose: () => void; onCreated: (inv: Invoice) => void;
  card: string; tp: string; ts: string; inputCls: string;
}) {
  const [step, setStep] = useState<'type' | 'details' | 'items'>('type');
  const [form, setForm] = useState({
    type: '' as string,
    title: '', description: '', vendorId: '', vendorName: '', customerId: '', vehicleId: '',
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
      const structuredLineItems = isOutgoing(form.type)
        ? lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitPriceNetCents: li.unitPriceCents,
            taxRate: 19,
          }))
        : undefined;

      const inv = await api.invoices.create(orgId, {
        type: form.type,
        title: form.title,
        description: form.description,
        vendorId: form.vendorId || undefined,
        vendorName: form.vendorName || undefined,
        customerId: form.customerId || undefined,
        vehicleId: form.vehicleId || undefined,
        notes: form.notes,
        templateId: form.templateId || undefined,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || undefined,
        currency: form.currency,
        lineItems: structuredLineItems,
        totalCents: isOutgoing(form.type) ? undefined : form.totalCents,
        imageUrl,
      });
      onCreated(inv);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Rechnung konnte nicht erstellt werden');
    } finally { setSaving(false); }
  };

  const labelCls = `block text-[11px] font-semibold mb-1.5 ${ts} uppercase tracking-wider`;
  const isOut = isOutgoing(form.type);

  // Step 1: Type selection
  if (step === 'type') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <button onClick={onClose} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
          <Icon name="chevron-left" className="w-4 h-4" /> Zurück
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
        <Icon name="chevron-left" className="w-4 h-4" /> Zurück
      </button>

      <div className={`${card} p-6`}>
        <div className="flex items-center gap-2 mb-5">
          <Icon name="receipt" className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
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
                <select value={form.vendorId} onChange={e => {
                  const id = e.target.value;
                  const ven = vendors.find((v: any) => v.id === id);
                  setForm(p => ({ ...p, vendorId: id, vendorName: ven ? ven.name : p.vendorName }));
                }} className={inputCls}>
                  <option value="">Manuell eingeben…</option>
                  {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                {!form.vendorId && (
                  <input value={form.vendorName} onChange={e => set('vendorName', e.target.value)} className={`${inputCls} mt-2`} placeholder="Name des Lieferanten" />
                )}
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
                  <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"><Icon name="x" className="w-3 h-3" /></button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-xs font-medium transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-400' : 'border-gray-300 text-gray-500'}`}>
                  <Icon name="image" className="w-4 h-4" /> Datei anhängen
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
              <button onClick={addLineItem} className={`text-[11px] font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}><Icon name="plus" className="w-3 h-3 inline mr-1" />Position</button>
            </div>
            <div className="space-y-2">
              {lineItems.map((li, idx) => (
                <div key={idx} className={`flex gap-2 items-center p-2 rounded-lg ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'}`}>
                  <input value={li.description} onChange={e => updateLineItem(idx, 'description', e.target.value)} className={`${inputCls} flex-1 !py-2`} placeholder="Beschreibung" />
                  <input type="number" value={li.quantity} onChange={e => updateLineItem(idx, 'quantity', parseInt(e.target.value, 10) || 1)} className={`${inputCls} !w-16 !py-2 text-center`} />
                  <input type="number" step="0.01" value={li.unitPriceCents ? (li.unitPriceCents / 100).toFixed(2) : ''} onChange={e => updateLineItem(idx, 'unitPriceCents', Math.round(parseFloat(e.target.value || '0') * 100))} className={`${inputCls} !w-24 !py-2`} placeholder="€/Stk" />
                  <span className={`text-xs font-bold ${tp} w-20 text-right`}>{formatAmount(li.totalCents)}</span>
                  {lineItems.length > 1 && <button onClick={() => removeLineItem(idx)} className="text-red-500"><Icon name="x" className="w-3.5 h-3.5" /></button>}
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
          <button onClick={onClose} className="sq-3d-btn sq-3d-btn--neutral px-4 py-2.5 text-xs font-semibold">Abbrechen</button>
          <button onClick={handleSubmit} disabled={saving || !form.title || (!isOut && !form.totalCents)} className="sq-3d-btn sq-3d-btn--primary flex items-center gap-2 px-5 py-2.5 text-xs font-semibold disabled:opacity-50">
            {saving ? <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon name="receipt" className="w-3.5 h-3.5" />} Rechnung erstellen
          </button>
        </div>
      </div>
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
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(invoice.notes || '');
  const [issuing, setIssuing] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const st = STATUS_MAP[invoice.status] || STATUS_MAP.DRAFT;
  const ty = TYPE_MAP[invoice.type] || TYPE_MAP.OUTGOING_MANUAL;
  const TypeIcon = ty.icon;
  const outstanding = invoice.outstandingCents ?? Math.max(0, invoice.totalCents - (invoice.paidCents ?? 0));
  const paidCents = invoice.paidCents ?? 0;

  const refreshInvoice = async () => {
    setRefreshing(true);
    try {
      const fresh = await api.invoices.get(orgId, invoice.id);
      onUpdate(fresh);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Rechnung konnte nicht aktualisiert werden');
    } finally {
      setRefreshing(false);
    }
  };

  const handleIssue = async () => {
    setIssuing(true);
    try {
      const updated = await api.invoices.issue(orgId, invoice.id);
      onUpdate(updated);
      toast.success('Rechnung ausgestellt', { description: displayNumber(updated) });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ausstellen fehlgeschlagen');
    } finally {
      setIssuing(false);
    }
  };

  const handleMarkSent = async () => {
    setMarkingSent(true);
    try {
      const updated = await api.invoices.markSent(orgId, invoice.id);
      onUpdate(updated);
      toast.success('Als gesendet markiert');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Status konnte nicht gesetzt werden');
    } finally {
      setMarkingSent(false);
    }
  };

  const handleMarkPaid = async () => {
    setMarkingPaid(true);
    try {
      const updated = await api.invoices.markPaid(orgId, invoice.id);
      onUpdate(updated);
      toast.success('Vollständig bezahlt erfasst');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Zahlung konnte nicht erfasst werden');
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleRecordPayment = async () => {
    const amountCents = Math.round(parseFloat(paymentAmount || '0') * 100);
    if (!amountCents || amountCents < 1) {
      toast.error('Bitte einen gültigen Betrag eingeben');
      return;
    }
    setRecordingPayment(true);
    try {
      const updated = await api.invoices.recordPayment(orgId, invoice.id, {
        amountCents,
        method: paymentMethod,
        reference: paymentReference || undefined,
      });
      onUpdate(updated);
      setShowPaymentForm(false);
      setPaymentAmount('');
      setPaymentReference('');
      toast.success('Zahlung erfasst');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Zahlung konnte nicht erfasst werden');
    } finally {
      setRecordingPayment(false);
    }
  };

  const saveNotes = async () => {
    try {
      const updated = await api.invoices.update(orgId, invoice.id, { notes });
      onUpdate(updated);
      setEditingNotes(false);
      toast.success('Notizen gespeichert');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Notizen konnten nicht gespeichert werden');
    }
  };

  const row = (label: string, value: string | React.ReactNode, icon?: React.ElementType) => {
    const RowIcon = icon;
    return (
      <div className="flex items-start gap-3 py-2.5">
        {RowIcon && <RowIcon className={`w-4 h-4 mt-0.5 ${ts} shrink-0`} />}
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] ${ts} uppercase tracking-wider font-semibold`}>{label}</p>
          <div className={`text-xs mt-0.5 ${tp}`}>{value || '—'}</div>
        </div>
      </div>
    );
  };

  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  const payments = invoice.payments ?? [];
  const showIssue = canIssue(invoice.status, invoice.type);
  const showMarkSent = canMarkSent(invoice.status, invoice.type);
  const showPayments = canRecordPayment(invoice.status) && outstanding > 0 && invoice.status !== 'PAID';

  const disabledBtn = 'sq-3d-btn sq-3d-btn--neutral flex items-center gap-1.5 px-3 py-2 text-xs font-semibold opacity-50 cursor-not-allowed';
  const actionBtn = 'sq-3d-btn sq-3d-btn--neutral flex items-center gap-1.5 px-3 py-2 text-xs font-semibold';

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button type="button" onClick={onBack} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
        <Icon name="chevron-left" className="w-4 h-4" /> Zurück
      </button>

      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                {displayNumber(invoice)}
              </span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${ty.color}`}>
                <TypeIcon className="w-3 h-3" /> {ty.label}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
              </span>
            </div>
            <h2 className={`text-base font-bold ${tp}`}>{invoice.title}</h2>
            <p className={`text-xs mt-1 ${ts}`}>
              Gesamt {formatAmount(invoice.totalCents, invoice.currency)}
              {paidCents > 0 && (
                <span className="ml-2">
                  · Bezahlt {formatAmount(paidCents, invoice.currency)}
                  {outstanding > 0 && ` · Offen ${formatAmount(outstanding, invoice.currency)}`}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <SupportContextButton
              kind="invoice"
              contextData={{
                invoiceId: invoice.id,
                invoiceNumber: displayNumber(invoice),
                amountCents: invoice.totalCents,
                status: invoice.status,
                title: invoice.title,
              }}
            />
            {showIssue && (
              <button type="button" onClick={handleIssue} disabled={issuing} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {issuing ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="file-text" className="w-3 h-3" />}
                Ausstellen
              </button>
            )}
            {isOutgoing(invoice.type) && invoice.status !== 'DRAFT' && (
              showMarkSent ? (
                <button type="button" onClick={handleMarkSent} disabled={markingSent} className={actionBtn} title="Manuell als gesendet markieren (kein E-Mail-Versand)">
                  {markingSent ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="send" className="w-3 h-3" />}
                  Als gesendet
                </button>
              ) : invoice.status === 'SENT' ? null : (
                <button type="button" disabled className={disabledBtn} title="Zuerst ausstellen">
                  <Icon name="send" className="w-3 h-3" /> Als gesendet
                </button>
              )
            )}
            {showPayments && (
              <>
                <button type="button" onClick={() => { setShowPaymentForm(!showPaymentForm); setPaymentAmount((outstanding / 100).toFixed(2)); }} className={actionBtn}>
                  <Icon name="dollar-sign" className="w-3 h-3" /> Zahlung erfassen
                </button>
                <button type="button" onClick={handleMarkPaid} disabled={markingPaid} className="sq-3d-btn sq-3d-btn--success flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  {markingPaid ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="check-circle" className="w-3 h-3" />}
                  Rest bezahlen
                </button>
              </>
            )}
            <button type="button" onClick={refreshInvoice} disabled={refreshing} className={actionBtn} title="Aktualisieren">
              {refreshing ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="refresh-cw" className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {showPaymentForm && (
          <div className={`mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-3 ${isDarkMode ? 'border-neutral-700/50' : 'border-gray-100'}`}>
            <div>
              <label className={`block text-[10px] font-semibold mb-1 ${ts}`}>Betrag (EUR)</label>
              <input type="number" step="0.01" min="0" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={`block text-[10px] font-semibold mb-1 ${ts}`}>Methode</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                <option value="BANK_TRANSFER">Überweisung</option>
                <option value="CASH">Bar</option>
                <option value="CARD">Karte</option>
                <option value="STRIPE">Stripe</option>
                <option value="OTHER">Sonstige</option>
              </select>
            </div>
            <div>
              <label className={`block text-[10px] font-semibold mb-1 ${ts}`}>Referenz</label>
              <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className={inputCls} placeholder="optional" />
            </div>
            <div className="sm:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowPaymentForm(false)} className="sq-3d-btn sq-3d-btn--neutral px-3 py-2 text-xs font-semibold">Abbrechen</button>
              <button type="button" onClick={handleRecordPayment} disabled={recordingPayment} className="sq-3d-btn sq-3d-btn--primary px-4 py-2 text-xs font-semibold disabled:opacity-50">
                {recordingPayment ? 'Speichern…' : 'Zahlung buchen'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Rechnungsdetails</h3>
          <div className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
            {row('Betrag', <span className="font-bold text-sm">{formatAmount(invoice.totalCents, invoice.currency)}</span>, DollarSign)}
            {invoice.subtotalCents !== invoice.totalCents && row('Netto', formatAmount(invoice.subtotalCents, invoice.currency))}
            {invoice.taxCents > 0 && row('MwSt', formatAmount(invoice.taxCents, invoice.currency))}
            {paidCents > 0 && row('Bezahlt', formatAmount(paidCents, invoice.currency), CheckCircle)}
            {outstanding > 0 && invoice.status !== 'PAID' && row('Offen', <span className="font-semibold text-amber-500">{formatAmount(outstanding, invoice.currency)}</span>, Clock)}
            {row('Rechnungsdatum', formatDate(invoice.invoiceDate), Calendar)}
            {row('Fälligkeitsdatum', formatDate(invoice.dueDate), Clock)}
            {invoice.issuedAt && row('Ausgestellt am', formatDate(invoice.issuedAt), FileText)}
            {invoice.sentAt && row('Gesendet am', formatDate(invoice.sentAt), FileText)}
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
              {invoice.vehicleId && row('Fahrzeug', <span className="font-mono text-[11px]">{invoice.vehicleId.slice(0, 12)}…</span>, Tag)}
              {row(
                'Herkunft',
                invoice.type === 'OUTGOING_BOOKING'
                  ? 'Automatisch (Buchung)'
                  : invoice.type === 'INCOMING_UPLOADED' || invoice.documentExtractionId
                    ? 'Document Extraction'
                    : 'Manuell',
                FileText,
              )}
              {invoice.templateId && row('Vorlage', TEMPLATES.find((t) => t.id === invoice.templateId)?.name || invoice.templateId, Receipt)}
            </div>
          </div>

          <div className={`${card} p-5`}>
            <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Dokumente</h3>
            <div className="space-y-2">
              {invoice.generatedDocumentId ? (
                <p className={`text-xs ${tp}`}>Generiertes Dokument verknüpft ({invoice.generatedDocumentId.slice(0, 8)}…)</p>
              ) : (
                <button type="button" disabled className={disabledBtn} title="Dokumentengenerierung noch nicht verbunden">
                  <Icon name="file-text" className="w-3 h-3" /> PDF generieren
                </button>
              )}
              <button type="button" disabled className={disabledBtn} title="E-Mail-Versand noch nicht verbunden">
                <Icon name="mail" className="w-3 h-3" /> Per E-Mail senden
              </button>
              {invoice.documentExtractionId && (
                <p className={`text-[10px] ${ts}`}>Extraktion: {invoice.documentExtractionId.slice(0, 12)}…</p>
              )}
            </div>
          </div>

          {invoice.tasks && invoice.tasks.length > 0 && (
            <div className={`${card} p-5`}>
              <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Verknüpfte Aufgabe</h3>
              {invoice.tasks.map((t) => (
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

      {payments.length > 0 && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Zahlungen</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}>
                  <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>Datum</th>
                  <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>Methode</th>
                  <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>Betrag</th>
                  <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>Referenz</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className={`px-3 py-2 text-xs ${tp}`}>{formatDate(p.paidAt)}</td>
                    <td className={`px-3 py-2 text-xs ${ts}`}>{p.method}</td>
                    <td className={`px-3 py-2 text-xs text-right font-semibold ${tp}`}>{formatAmount(p.amountCents, invoice.currency)}</td>
                    <td className={`px-3 py-2 text-xs ${ts}`}>{p.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lineItems.length > 0 && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Positionen</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}>
                  <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>Beschreibung</th>
                  <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>Menge</th>
                  <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>Einzelpreis (netto)</th>
                  <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>MwSt</th>
                  <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>Gesamt</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
                {lineItems.map((li, i) => {
                  const unit = li.unitPriceNetCents ?? li.unitPriceCents ?? 0;
                  const gross = li.grossCents ?? li.totalCents ?? unit * (li.quantity || 1);
                  return (
                    <tr key={i}>
                      <td className={`px-3 py-2 text-xs ${tp}`}>{li.description}</td>
                      <td className={`px-3 py-2 text-xs text-right ${ts}`}>{li.quantity}</td>
                      <td className={`px-3 py-2 text-xs text-right ${ts}`}>{formatAmount(unit)}</td>
                      <td className={`px-3 py-2 text-xs text-right ${ts}`}>{li.taxRate != null ? `${li.taxRate}%` : '—'}</td>
                      <td className={`px-3 py-2 text-xs text-right font-semibold ${tp}`}>{formatAmount(gross)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {invoice.imageUrl && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Anhang</h3>
          <button type="button" onClick={() => window.open(invoice.imageUrl!, '_blank')} className={`text-xs font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            Dokument öffnen
          </button>
        </div>
      )}

      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-xs font-bold ${tp} uppercase tracking-wider`}>Notizen</h3>
          {!editingNotes && (
            <button type="button" onClick={() => setEditingNotes(true)} className={`text-[11px] font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
              Bearbeiten
            </button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-3">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Interne Notizen..." />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setEditingNotes(false); setNotes(invoice.notes || ''); }} className="sq-3d-btn sq-3d-btn--neutral px-3 py-1.5 text-xs font-semibold">Abbrechen</button>
              <button type="button" onClick={saveNotes} className="sq-3d-btn sq-3d-btn--primary px-3 py-1.5 text-xs font-semibold">Speichern</button>
            </div>
          </div>
        ) : (
          <p className={`text-xs ${invoice.notes ? tp : ts}`}>{invoice.notes || 'Keine Notizen vorhanden.'}</p>
        )}
      </div>

      {invoice.description && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-2 uppercase tracking-wider`}>Beschreibung</h3>
          <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{invoice.description}</p>
        </div>
      )}
    </div>
  );
}
