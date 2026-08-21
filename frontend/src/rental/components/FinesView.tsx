import { AlertCircle, Building2, Calendar, Car, Clock, DollarSign, MapPin, Tag, User } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useCallback, useRef } from 'react';

import { api } from '../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../RentalContext';
import { DocumentIntakeLaunchAiButton } from './documents/DocumentIntakeLaunchButton';
import {
  FINE_OFFENSE_TYPE_VALUES,
  FINE_STATUS_FILTER_OPTIONS,
  FINE_STATUS_VALUES,
  fineStatusStyle,
  formatFineAmount,
  formatFineDate,
  labelFineOffenseType,
  labelFineStatus,
  labelFineTaskStatus,
} from '../lib/fines-i18n';

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

export function FinesView({ isDarkMode }: { isDarkMode: boolean }) {
  const { t, locale } = useLanguage();
  const { orgId } = useRentalOrg();
  const [fines, setFines] = useState<Fine[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedFine, setSelectedFine] = useState<Fine | null>(null);

  const tp = isDarkMode ? 'text-white' : 'text-gray-900';
  const ts = isDarkMode ? 'text-muted-foreground' : 'text-gray-500';
  const card = `rounded-xl shadow-sm border ${isDarkMode ? 'surface-premium border-border' : 'bg-white border-gray-200'}`;
  const inputCls = `w-full px-4 py-3 rounded-xl border text-xs ${isDarkMode ? 'bg-muted border-border text-foreground placeholder:text-muted-foreground' : 'bg-background border-border text-foreground placeholder:text-muted-foreground'} outline-none`;

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
    } catch {
      setFines([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const filtered = fines.filter((f) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (
        !f.title.toLowerCase().includes(q) &&
        !f.fineNumber?.toLowerCase().includes(q) &&
        !f.location.toLowerCase().includes(q) &&
        !f.offenseType.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    return true;
  });

  const statusCount = (status: string) =>
    status === 'all' ? fines.length : fines.filter((fine) => fine.status === status).length;
  const openCount = fines.filter((fine) => fine.status !== 'RESOLVED' && fine.status !== 'CLOSED').length;
  const activeStatusLabel =
    statusFilter === 'all'
      ? t('fines.filters.allStatuses')
      : labelFineStatus(locale, statusFilter);
  const hasActiveFilters = Boolean(searchTerm) || statusFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setIsStatusOpen(false);
  };

  const tableHeaders = [
    t('fines.col.typeTitle'),
    t('fines.col.amount'),
    t('fines.col.date'),
    t('fines.col.vehicle'),
    t('fines.col.status'),
    t('fines.col.customer'),
    t('fines.col.task'),
  ];

  if (view === 'detail' && selectedFine) {
    return (
      <FineDetail
        isDarkMode={isDarkMode}
        fine={selectedFine}
        orgId={orgId || ''}
        onBack={() => {
          setView('list');
          setSelectedFine(null);
          load();
        }}
        onUpdate={(f) => setSelectedFine(f)}
        card={card}
        tp={tp}
        ts={ts}
        inputCls={inputCls}
      />
    );
  }

  if (view === 'create') {
    return (
      <CreateFineForm
        isDarkMode={isDarkMode}
        orgId={orgId || ''}
        vehicles={vehicles}
        onClose={() => setView('list')}
        onCreated={(f) => {
          setView('detail');
          setSelectedFine(f);
          load();
        }}
        card={card}
        tp={tp}
        ts={ts}
        inputCls={inputCls}
      />
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <div className="flex min-h-8 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">
            {t('fines.title')}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DocumentIntakeLaunchAiButton
            label={t('fines.aiUpload')}
            className="sq-press flex items-center gap-2 rounded-xl border border-border/60 surface-premium px-3 py-2 text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border"
            request={{
              optionalContextType: 'FINE',
              sourceSurface: 'fines_page',
              returnView: 'fines',
              documentTab: 'upload',
            }}
          />
          <button
            type="button"
            onClick={() => setView('create')}
            className="sq-press flex items-center gap-2 rounded-xl bg-[color:var(--brand)] px-3 py-2 text-[10px] font-semibold text-white shadow-[var(--shadow-1)] transition-all hover:opacity-90"
          >
            <Icon name="plus" className="h-4 w-4" />
            {t('fines.manualCreate')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          {
            label: t('fines.totalFines'),
            value: stats?.total ?? fines.length,
            helper: t('fines.metric.visibleCount', { count: filtered.length }),
            icon: AlertCircle,
            action: () => clearFilters(),
            active: !hasActiveFilters,
            tone: 'sq-tone-neutral',
          },
          {
            label: t('fines.totalAmount'),
            value: formatFineAmount(locale, stats?.totalAmountCents || 0),
            helper: t('fines.metric.openCases', { count: openCount }),
            icon: DollarSign,
            action: () => clearFilters(),
            active: false,
            tone: 'sq-tone-brand',
          },
          {
            label: labelFineStatus(locale, 'NEW'),
            value: stats?.new ?? statusCount('NEW'),
            helper: t('fines.metric.notProcessed'),
            icon: Clock,
            action: () => setStatusFilter(statusFilter === 'NEW' ? 'all' : 'NEW'),
            active: statusFilter === 'NEW',
            tone: (stats?.new ?? statusCount('NEW')) > 0 ? 'sq-tone-warning' : 'sq-tone-neutral',
          },
          {
            label: labelFineStatus(locale, 'RESOLVED'),
            value: stats?.resolved ?? statusCount('RESOLVED'),
            helper: t('fines.metric.forwardedCount', { count: statusCount('FORWARDED') }),
            icon: Tag,
            action: () => setStatusFilter(statusFilter === 'RESOLVED' ? 'all' : 'RESOLVED'),
            active: statusFilter === 'RESOLVED',
            tone: 'sq-tone-success',
          },
        ].map((metric) => {
          const MetricIcon = metric.icon;
          return (
            <button
              key={metric.label}
              type="button"
              onClick={metric.action}
              className={`group surface-premium sq-press rounded-2xl p-4 text-left shadow-[var(--shadow-1)] transition-all ${
                metric.active
                  ? 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_22%,transparent)]'
                  : 'hover:bg-muted/35'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 truncate text-[20px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
                    {metric.value}
                  </p>
                  <p className="mt-2 truncate text-[10px] font-medium text-muted-foreground">
                    {metric.helper}
                  </p>
                </div>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}>
                  <MetricIcon className="h-4 w-4" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon name="filter" className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">
                {t('fines.filters.title')}
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t('fines.filters.showing', { visible: filtered.length, total: fines.length })}
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
                {t('fines.filters.statusActive', { label: activeStatusLabel })}
              </button>
            )}
            {searchTerm && (
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                {t('fines.filters.searchActive')}
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
                {t('fines.filters.clear')}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Icon
              name="search"
              className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${isDarkMode ? 'text-muted-foreground' : 'text-muted-foreground'}`}
            />
            <input
              type="text"
              placeholder={t('fines.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full rounded-lg border py-2.5 pl-10 pr-4 text-xs outline-none transition-all ${
                isDarkMode
                  ? 'bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-brand/50'
                  : 'bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-brand'
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
                    ? 'bg-status-info-soft border-status-info/30 text-status-info'
                    : 'bg-status-info-soft border-status-info/25 text-status-info'
                  : isDarkMode
                    ? 'surface-premium border-neutral-700 text-gray-300 hover:surface-premium'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{activeStatusLabel}</span>
              <Icon
                name="chevron-down"
                className={`h-3.5 w-3.5 transition-transform ${isStatusOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isStatusOpen && (
              <div
                className={`absolute right-0 top-full z-50 mt-2 min-w-[230px] overflow-hidden rounded-lg border shadow-xl sm:left-0 sm:right-auto ${
                  isDarkMode ? 'surface-premium border-border' : 'bg-white border-gray-200'
                }`}
              >
                {FINE_STATUS_FILTER_OPTIONS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setStatusFilter(status);
                      setIsStatusOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                      status === statusFilter
                        ? isDarkMode
                          ? 'bg-brand-soft text-brand'
                          : 'bg-status-info-soft text-status-info'
                        : isDarkMode
                          ? 'text-foreground/85 hover:bg-muted'
                          : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>
                      {status === 'all'
                        ? t('fines.filters.allStatuses')
                        : labelFineStatus(locale, status)}
                    </span>
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

      <div className="surface-premium rounded-2xl overflow-hidden shadow-[var(--shadow-1)]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Icon name="loader-2" className={`w-5 h-5 animate-spin ${ts}`} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="alert-circle" className={`w-10 h-10 mx-auto mb-3 ${ts} opacity-40`} />
            <p className={`text-sm font-medium ${tp}`}>{t('fines.noFines')}</p>
            <p className={`text-xs mt-1 ${ts}`}>
              {searchTerm || statusFilter !== 'all'
                ? t('fines.empty.tryOtherFilters')
                : t('fines.empty.firstFineHint')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className={isDarkMode ? 'bg-muted/50' : 'bg-muted/50'}>
                  {tableHeaders.map((h) => (
                    <th
                      key={h}
                      className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${ts}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-border/30' : 'divide-gray-100'}`}>
                {filtered.map((f) => {
                  const st = fineStatusStyle(f.status);
                  return (
                    <tr
                      key={f.id}
                      onClick={() => openDetail(f)}
                      className={`cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-muted/40' : 'hover:bg-gray-50/60'}`}
                    >
                      <td className="px-4 py-3">
                        <p className={`text-xs font-semibold ${tp}`}>{f.title}</p>
                        <p className={`text-[10px] ${ts}`}>
                          {f.offenseType
                            ? labelFineOffenseType(locale, f.offenseType)
                            : t('fines.emptyValue')}
                          {f.fineNumber ? ` · #${f.fineNumber}` : ''}
                        </p>
                      </td>
                      <td className={`px-4 py-3 text-xs font-bold ${tp}`}>
                        {formatFineAmount(locale, f.amountCents, f.currency)}
                      </td>
                      <td className={`px-4 py-3 text-[11px] ${ts}`}>
                        {formatFineDate(locale, f.offenseDate)}
                      </td>
                      <td className={`px-4 py-3 text-[11px] ${ts}`}>
                        {f.vehicleId ? `${f.vehicleId.slice(0, 8)}...` : t('fines.emptyValue')}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{' '}
                          {labelFineStatus(locale, f.status)}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-[11px] ${ts}`}>
                        {f.customerId ? (
                          <span className="text-emerald-500 font-medium">{t('fines.assigned')}</span>
                        ) : (
                          t('fines.emptyValue')
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {f.tasks && f.tasks.length > 0 ? (
                          <span
                            className={`text-[10px] font-medium ${f.tasks[0].status === 'DONE' ? 'text-green-500' : 'text-amber-500'}`}
                          >
                            {labelFineTaskStatus(locale, f.tasks[0].status)}
                          </span>
                        ) : (
                          t('fines.emptyValue')
                        )}
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

function CreateFineForm({
  isDarkMode,
  orgId,
  vehicles,
  onClose,
  onCreated,
  card,
  tp,
  ts,
  inputCls,
}: {
  isDarkMode: boolean;
  orgId: string;
  vehicles: any[];
  onClose: () => void;
  onCreated: (f: Fine) => void;
  card: string;
  tp: string;
  ts: string;
  inputCls: string;
}) {
  const { t, locale } = useLanguage();
  const [form, setForm] = useState({
    title: '',
    offenseType: '',
    fineNumber: '',
    issuingAuthority: '',
    description: '',
    offenseDate: '',
    receivedDate: '',
    location: '',
    amountCents: 0,
    currency: 'EUR',
    dueDate: '',
    vehicleId: '',
    notes: '',
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
    } catch {
      setSaving(false);
    }
  };

  const set = (k: string, v: string | number) => setForm((prev) => ({ ...prev, [k]: v }));

  const labelCls = `block text-[11px] font-semibold mb-1.5 ${ts} uppercase tracking-wider`;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={onClose} className={`flex items-center gap-1 text-xs font-medium ${ts} transition-colors`}>
        <Icon name="chevron-left" className="w-4 h-4" /> {t('common.back')}
      </button>

      <div className={`${card} p-6`}>
        <h2 className={`text-base font-bold ${tp} mb-5`}>{t('fines.createTitle')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>{t('fines.form.titleOffense')}</label>
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputCls}
              placeholder={t('fines.form.titlePlaceholder')}
            />
          </div>
          <div>
            <label className={labelCls}>{t('fines.form.offenseType')}</label>
            <select
              value={form.offenseType}
              onChange={(e) => set('offenseType', e.target.value)}
              className={inputCls}
            >
              <option value="">{t('fines.form.selectPlaceholder')}</option>
              {FINE_OFFENSE_TYPE_VALUES.map((offenseType) => (
                <option key={offenseType} value={offenseType}>
                  {labelFineOffenseType(locale, offenseType)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('fines.fineNumber')}</label>
            <input
              value={form.fineNumber}
              onChange={(e) => set('fineNumber', e.target.value)}
              className={inputCls}
              placeholder={t('fines.form.caseNumberPlaceholder')}
            />
          </div>
          <div>
            <label className={labelCls}>{t('fines.form.amountEur')}</label>
            <input
              type="number"
              step="0.01"
              value={form.amountCents ? (form.amountCents / 100).toFixed(2) : ''}
              onChange={(e) => set('amountCents', Math.round(parseFloat(e.target.value || '0') * 100))}
              className={inputCls}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelCls}>{t('fines.form.authority')}</label>
            <input
              value={form.issuingAuthority}
              onChange={(e) => set('issuingAuthority', e.target.value)}
              className={inputCls}
              placeholder={t('fines.form.authorityPlaceholder')}
            />
          </div>
          <div>
            <label className={labelCls}>{t('fines.form.offenseDate')}</label>
            <input
              type="date"
              value={form.offenseDate}
              onChange={(e) => set('offenseDate', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{t('fines.form.receivedDate')}</label>
            <input
              type="date"
              value={form.receivedDate}
              onChange={(e) => set('receivedDate', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{t('fines.form.dueDate')}</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{t('fines.form.location')}</label>
            <input
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              className={inputCls}
              placeholder={t('fines.form.locationPlaceholder')}
            />
          </div>
          <div>
            <label className={labelCls}>{t('fines.form.vehicle')}</label>
            <select
              value={form.vehicleId}
              onChange={(e) => set('vehicleId', e.target.value)}
              className={inputCls}
            >
              <option value="">{t('fines.form.selectPlaceholder')}</option>
              {vehicles.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} – {v.licensePlate || v.vin?.slice(-6)}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{t('fines.form.descriptionNotes')}</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder={t('fines.form.descriptionPlaceholder')}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{t('fines.form.documentImage')}</label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleImage} className="hidden" />
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt={t('fines.form.previewAlt')} className="h-24 rounded-xl object-cover" />
                <button
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                  }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                >
                  <Icon name="x" className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-xs font-medium transition-colors ${isDarkMode ? 'border-border text-muted-foreground' : 'border-gray-300 text-gray-500'}`}
              >
                <Icon name="image" className="w-4 h-4" /> {t('fines.form.attachDocument')}
              </button>
            )}
          </div>
        </div>

        <div
          className="flex justify-end gap-3 mt-6 pt-4 border-t"
          style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' }}
        >
          <button onClick={onClose} className="sq-3d-btn sq-3d-btn--neutral px-4 py-2.5 text-xs font-semibold">
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title || !form.amountCents}
            className="sq-3d-btn sq-3d-btn--primary flex items-center gap-2 px-5 py-2.5 text-xs font-semibold disabled:opacity-50"
          >
            {saving ? (
              <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Icon name="plus" className="w-3.5 h-3.5" />
            )}{' '}
            {t('fines.createSubmit')}
          </button>
        </div>
      </div>
    </div>
  );
}

function FineDetail({
  isDarkMode,
  fine,
  orgId,
  onBack,
  onUpdate,
  card,
  tp,
  ts,
  inputCls,
}: {
  isDarkMode: boolean;
  fine: Fine;
  orgId: string;
  onBack: () => void;
  onUpdate: (f: Fine) => void;
  card: string;
  tp: string;
  ts: string;
  inputCls: string;
}) {
  const { t, locale } = useLanguage();
  const [changingStatus, setChangingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(fine.notes || '');

  const st = fineStatusStyle(fine.status);

  const changeStatus = async (status: string) => {
    setShowStatusMenu(false);
    setChangingStatus(true);
    try {
      const updated = await api.fines.update(orgId, fine.id, { status });
      onUpdate(updated);
    } catch {
      /* ignore */
    } finally {
      setChangingStatus(false);
    }
  };

  const saveNotes = async () => {
    try {
      const updated = await api.fines.update(orgId, fine.id, { notes });
      onUpdate(updated);
      setEditingNotes(false);
    } catch {
      /* ignore */
    }
  };

  const row = (label: string, value: string | React.ReactNode, icon?: React.ElementType) => {
    const RowIcon = icon;
    return (
      <div className="flex items-start gap-3 py-2.5">
        {RowIcon && <RowIcon className={`w-4 h-4 mt-0.5 ${ts} shrink-0`} />}
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] ${ts} uppercase tracking-wider font-semibold`}>{label}</p>
          <div className={`text-xs mt-0.5 ${tp}`}>{value || t('fines.emptyValue')}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button onClick={onBack} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
        <Icon name="chevron-left" className="w-4 h-4" /> {t('common.back')}
      </button>

      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {fine.fineNumber && (
                <span className={`text-xs font-bold ${isDarkMode ? 'text-brand' : 'text-brand'}`}>
                  #{fine.fineNumber}
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {labelFineStatus(locale, fine.status)}
              </span>
            </div>
            <h2 className={`text-base font-bold ${tp}`}>{fine.title}</h2>
            <p className={`text-xs mt-1 ${ts}`}>
              {fine.offenseType ? labelFineOffenseType(locale, fine.offenseType) : t('fines.emptyValue')} ·{' '}
              {formatFineAmount(locale, fine.amountCents, fine.currency)}
            </p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              disabled={changingStatus}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${isDarkMode ? 'border-border text-foreground/85 hover:bg-muted' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              {changingStatus ? (
                <Icon name="loader-2" className="w-3 h-3 animate-spin" />
              ) : (
                <Icon name="edit-3" className="w-3 h-3" />
              )}{' '}
              {t('fines.detail.changeStatus')}
            </button>
            {showStatusMenu && (
              <div
                className={`absolute right-0 top-full mt-1 z-20 w-48 rounded-xl border shadow-xl overflow-hidden ${isDarkMode ? 'bg-popover border-border' : 'bg-white border-gray-200'}`}
              >
                {FINE_STATUS_VALUES.map((key) => (
                  <button
                    key={key}
                    onClick={() => changeStatus(key)}
                    className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${isDarkMode ? 'hover:bg-muted text-foreground/85' : 'hover:bg-gray-50 text-gray-700'} ${fine.status === key ? 'font-bold' : ''}`}
                  >
                    {labelFineStatus(locale, key)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>
            {t('fines.detail.fineDetails')}
          </h3>
          <div className={`divide-y ${isDarkMode ? 'divide-border/30' : 'divide-gray-100'}`}>
            {row(
              t('fines.col.amount'),
              <span className="font-bold text-sm">
                {formatFineAmount(locale, fine.amountCents, fine.currency)}
              </span>,
              DollarSign,
            )}
            {row(
              t('fines.detail.offenseType'),
              fine.offenseType ? labelFineOffenseType(locale, fine.offenseType) : t('fines.emptyValue'),
              Tag,
            )}
            {row(t('fines.detail.authority'), fine.issuingAuthority, Building2)}
            {row(t('fines.detail.offenseDate'), formatFineDate(locale, fine.offenseDate), Calendar)}
            {row(t('fines.detail.receivedDate'), formatFineDate(locale, fine.receivedDate), Clock)}
            {row(t('fines.detail.dueDate'), formatFineDate(locale, fine.dueDate), AlertCircle)}
            {row(t('fines.detail.location'), fine.location, MapPin)}
          </div>
        </div>

        <div className="space-y-4">
          <div className={`${card} p-5`}>
            <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>
              {t('fines.detail.assignment')}
            </h3>
            <div className={`divide-y ${isDarkMode ? 'divide-border/30' : 'divide-gray-100'}`}>
              {row(
                t('fines.detail.vehicle'),
                fine.vehicleId ? (
                  <span className="font-mono text-[11px]">{fine.vehicleId.slice(0, 12)}...</span>
                ) : (
                  t('fines.emptyValue')
                ),
                Car,
              )}
              {row(
                t('fines.detail.booking'),
                fine.bookingId ? (
                  <span className="text-emerald-500 font-medium">{t('fines.detail.autoAssigned')}</span>
                ) : (
                  <span className={ts}>{t('fines.detail.notAssigned')}</span>
                ),
                Calendar,
              )}
              {row(
                t('fines.detail.customerDriver'),
                fine.customerId ? (
                  <span className="text-emerald-500 font-medium">{t('fines.detail.autoAssigned')}</span>
                ) : (
                  <span className={ts}>{t('fines.detail.notAssigned')}</span>
                ),
                User,
              )}
            </div>
          </div>

          {fine.tasks && fine.tasks.length > 0 && (
            <div className={`${card} p-5`}>
              <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>
                {t('fines.detail.linkedTask')}
              </h3>
              {fine.tasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${isDarkMode ? 'border-border/30 bg-muted/30' : 'border-gray-100 bg-gray-50/50'}`}
                >
                  <Icon
                    name="list-todo"
                    className={`w-4 h-4 ${task.status === 'DONE' ? 'text-green-500' : 'text-amber-500'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium ${tp} truncate`}>{task.title}</p>
                    <p className={`text-[10px] ${ts}`}>{labelFineTaskStatus(locale, task.status)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {fine.imageUrl && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>{t('fines.detail.document')}</h3>
          <img
            src={fine.imageUrl}
            alt={t('fines.detail.documentAlt')}
            className="max-h-64 rounded-xl object-contain cursor-pointer hover:opacity-90"
            onClick={() => window.open(fine.imageUrl!, '_blank')}
          />
        </div>
      )}

      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-xs font-bold ${tp} uppercase tracking-wider`}>
            {t('fines.detail.internalNotes')}
          </h3>
          {!editingNotes && (
            <button
              onClick={() => setEditingNotes(true)}
              className={`text-[11px] font-medium ${isDarkMode ? 'text-brand' : 'text-brand'}`}
            >
              {t('common.edit')}
            </button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder={t('fines.detail.notesPlaceholder')}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setEditingNotes(false);
                  setNotes(fine.notes || '');
                }}
                className="sq-3d-btn sq-3d-btn--neutral px-3 py-1.5 text-xs font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button onClick={saveNotes} className="sq-3d-btn sq-3d-btn--primary px-3 py-1.5 text-xs font-semibold">
                {t('common.save')}
              </button>
            </div>
          </div>
        ) : (
          <p className={`text-xs ${fine.notes ? tp : ts}`}>
            {fine.notes || t('fines.detail.noNotes')}
          </p>
        )}
      </div>

      {fine.description && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-2 uppercase tracking-wider`}>
            {t('fines.detail.description')}
          </h3>
          <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-foreground/85' : 'text-gray-700'}`}>
            {fine.description}
          </p>
        </div>
      )}
    </div>
  );
}
