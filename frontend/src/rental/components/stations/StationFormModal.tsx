import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Station, StationUpsertPayload, StationOpeningHours } from '../../../lib/api';
import {
  WEEKDAYS,
  defaultWeeklyHours,
  parseOpeningHours,
} from '../../lib/stationUtils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

const RADIUS_MIN = 25;
const RADIUS_MAX = 5000;
const RADIUS_DEFAULT = 100;

export type StationFormValues = {
  name: string;
  code: string;
  type: Station['type'];
  status: Station['status'];
  isPrimary: boolean;
  address: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  managerName: string;
  latitude: string;
  longitude: string;
  radiusMeters: number | null;
  timezone: string;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  capacity: string;
  openingHours: StationOpeningHours;
  handoverInstructions: string;
  returnInstructions: string;
  internalNotes: string;
  notes: string;
};

function emptyForm(): StationFormValues {
  return {
    name: '',
    code: '',
    type: 'BRANCH',
    status: 'ACTIVE',
    isPrimary: false,
    address: '',
    addressLine2: '',
    postalCode: '',
    city: '',
    country: 'Deutschland',
    phone: '',
    email: '',
    managerName: '',
    latitude: '',
    longitude: '',
    radiusMeters: RADIUS_DEFAULT,
    timezone: 'Europe/Berlin',
    pickupEnabled: true,
    returnEnabled: true,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    capacity: '',
    openingHours: defaultWeeklyHours(),
    handoverInstructions: '',
    returnInstructions: '',
    internalNotes: '',
    notes: '',
  };
}

function fromStation(station: Station): StationFormValues {
  return {
    name: station.name,
    code: station.code ?? '',
    type: station.type ?? 'BRANCH',
    status: station.status,
    isPrimary: station.isPrimary ?? false,
    address: station.addressLine1 ?? station.address ?? '',
    addressLine2: station.addressLine2 ?? '',
    postalCode: station.postalCode ?? '',
    city: station.city ?? '',
    country: station.country ?? '',
    phone: station.phone ?? '',
    email: station.email ?? '',
    managerName: station.managerName ?? station.contactPerson ?? '',
    latitude: station.latitude != null ? String(station.latitude) : '',
    longitude: station.longitude != null ? String(station.longitude) : '',
    radiusMeters: station.radiusMeters ?? station.geofenceRadiusMeters ?? RADIUS_DEFAULT,
    timezone: station.timezone ?? 'Europe/Berlin',
    pickupEnabled: station.pickupEnabled ?? true,
    returnEnabled: station.returnEnabled ?? true,
    afterHoursReturnEnabled: station.afterHoursReturnEnabled ?? false,
    keyBoxAvailable: station.keyBoxAvailable ?? false,
    capacity: station.capacity != null ? String(station.capacity) : '',
    openingHours: parseOpeningHours(station.openingHours),
    handoverInstructions: station.handoverInstructions ?? '',
    returnInstructions: station.returnInstructions ?? '',
    internalNotes: station.internalNotes ?? '',
    notes: station.notes ?? '',
  };
}

function toPayload(form: StationFormValues): StationUpsertPayload {
  const lat = form.latitude.trim() ? Number(form.latitude) : null;
  const lng = form.longitude.trim() ? Number(form.longitude) : null;
  const cap = form.capacity.trim() ? Number(form.capacity) : null;
  return {
    name: form.name.trim(),
    code: form.code.trim() || null,
    type: form.type,
    status: form.status,
    isPrimary: form.isPrimary,
    address: form.address.trim() || null,
    addressLine2: form.addressLine2.trim() || null,
    postalCode: form.postalCode.trim() || null,
    city: form.city.trim() || null,
    country: form.country.trim() || null,
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    managerName: form.managerName.trim() || null,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    radiusMeters: form.radiusMeters,
    timezone: form.timezone.trim() || 'Europe/Berlin',
    pickupEnabled: form.pickupEnabled,
    returnEnabled: form.returnEnabled,
    afterHoursReturnEnabled: form.afterHoursReturnEnabled,
    keyBoxAvailable: form.keyBoxAvailable,
    capacity: cap != null && Number.isFinite(cap) ? Math.max(0, Math.round(cap)) : null,
    openingHours: form.openingHours,
    handoverInstructions: form.handoverInstructions.trim() || null,
    returnInstructions: form.returnInstructions.trim() || null,
    internalNotes: form.internalNotes.trim() || null,
    notes: form.notes.trim() || null,
  };
}

function validateForm(form: StationFormValues, t: (k: TranslationKey) => string): string | null {
  if (!form.name.trim()) return t('stations.form.errorName');
  if (!form.address.trim()) return t('stations.form.errorAddress');
  if (!form.city.trim() || !form.postalCode.trim() || !form.country.trim()) {
    return t('stations.form.errorLocation');
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return t('stations.form.errorEmail');
  }
  if (form.capacity.trim()) {
    const cap = Number(form.capacity);
    if (!Number.isFinite(cap) || cap < 0) return t('stations.form.errorCapacity');
  }
  if (form.radiusMeters != null && (form.radiusMeters < RADIUS_MIN || form.radiusMeters > RADIUS_MAX)) {
    return t('stations.form.errorRadius');
  }
  const hasCoords = form.latitude.trim() && form.longitude.trim();
  if (hasCoords) {
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return t('stations.form.errorCoords');
  }
  return null;
}

type Props = {
  open: boolean;
  station?: Station | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: StationUpsertPayload) => Promise<void>;
};

export function StationFormModal({ open, station, saving, onClose, onSubmit }: Props) {
  const { t } = useLanguage();
  const [form, setForm] = useState<StationFormValues>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(station ? fromStation(station) : emptyForm());
    setError(null);
  }, [open, station]);

  if (!open) return null;

  const set = <K extends keyof StationFormValues>(key: K, value: StationFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setDay = (day: string, patch: Partial<StationOpeningHours[string]>) => {
    setForm((prev) => ({
      ...prev,
      openingHours: {
        ...prev.openingHours,
        [day]: { ...prev.openingHours[day], ...patch },
      },
    }));
  };

  const handleSave = async () => {
    const validationError = validateForm(form, t);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      await onSubmit(toPayload(form));
      toast.success(station ? t('stations.form.saved') : t('stations.form.created'));
      onClose();
    } catch (e) {
      setError((e as Error).message || t('stations.form.saveFailed'));
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-border/70 bg-card text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]';
  const labelClass = 'block text-[11px] font-semibold mb-1 uppercase tracking-wider text-muted-foreground';
  const sectionClass = 'sq-card rounded-xl p-4 space-y-3';

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-background border border-border shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {station ? t('stations.form.editTitle') : t('stations.form.createTitle')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('stations.form.subtitle')}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted/60">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="text-sm text-[color:var(--status-critical)] bg-[color:var(--status-critical-soft)] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className={sectionClass}>
            <h3 className="text-sm font-semibold">{t('stations.form.sectionBasic')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelClass}>{t('stations.form.name')} *</label>
                <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.code')}</label>
                <input className={inputClass} value={form.code} onChange={(e) => set('code', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.type')}</label>
                <select className={inputClass} value={form.type} onChange={(e) => set('type', e.target.value as Station['type'])}>
                  {(['MAIN', 'BRANCH', 'PARKING', 'PARTNER', 'TEMPORARY'] as const).map((v) => (
                    <option key={v} value={v}>{t(`stations.type.${v}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.status')}</label>
                <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value as Station['status'])}>
                  <option value="ACTIVE">{t('stations.status.ACTIVE')}</option>
                  <option value="INACTIVE">{t('stations.status.INACTIVE')}</option>
                  {station ? <option value="ARCHIVED">{t('stations.status.ARCHIVED')}</option> : null}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
                <input type="checkbox" checked={form.isPrimary} onChange={(e) => set('isPrimary', e.target.checked)} />
                {t('stations.form.isPrimary')}
              </label>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t('stations.form.address')} *</label>
                <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t('stations.form.addressLine2')}</label>
                <input className={inputClass} value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.postalCode')} *</label>
                <input className={inputClass} value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.city')} *</label>
                <input className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.country')} *</label>
                <input className={inputClass} value={form.country} onChange={(e) => set('country', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.phone')}</label>
                <input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.email')}</label>
                <input className={inputClass} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t('stations.form.contact')}</label>
                <input className={inputClass} value={form.managerName} onChange={(e) => set('managerName', e.target.value)} />
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h3 className="text-sm font-semibold">{t('stations.form.sectionLocation')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('stations.form.latitude')}</label>
                <input className={inputClass} value={form.latitude} onChange={(e) => set('latitude', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.longitude')}</label>
                <input className={inputClass} value={form.longitude} onChange={(e) => set('longitude', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t('stations.form.geofence')} ({RADIUS_MIN}–{RADIUS_MAX} m)</label>
                <input
                  type="range"
                  min={RADIUS_MIN}
                  max={RADIUS_MAX}
                  step={25}
                  value={form.radiusMeters ?? RADIUS_DEFAULT}
                  onChange={(e) => set('radiusMeters', Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">{form.radiusMeters ?? RADIUS_DEFAULT} m</p>
              </div>
              <p className="sm:col-span-2 text-xs text-muted-foreground">{t('stations.form.geocodeHint')}</p>
            </div>
          </div>

          <div className={sectionClass}>
            <h3 className="text-sm font-semibold">{t('stations.form.sectionRules')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {(
                [
                  ['pickupEnabled', t('stations.form.pickupEnabled')],
                  ['returnEnabled', t('stations.form.returnEnabled')],
                  ['afterHoursReturnEnabled', t('stations.form.afterHours')],
                  ['keyBoxAvailable', t('stations.form.keyBox')],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => set(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div>
                <label className={labelClass}>{t('stations.form.capacity')}</label>
                <input className={inputClass} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.timezone')}</label>
                <input className={inputClass} value={form.timezone} onChange={(e) => set('timezone', e.target.value)} />
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h3 className="text-sm font-semibold">{t('stations.form.sectionHours')}</h3>
            <div className="space-y-2">
              {WEEKDAYS.map((day) => {
                const slot = form.openingHours[day] ?? {};
                const closed = !!slot.closed;
                return (
                  <div key={day} className="grid grid-cols-[88px_1fr_1fr_auto] gap-2 items-center text-sm">
                    <span className="text-muted-foreground">{t(`stations.form.day.${day}`)}</span>
                    <input
                      type="time"
                      disabled={closed}
                      className={inputClass}
                      value={slot.open ?? '08:00'}
                      onChange={(e) => setDay(day, { open: e.target.value, closed: false })}
                    />
                    <input
                      type="time"
                      disabled={closed}
                      className={inputClass}
                      value={slot.close ?? '18:00'}
                      onChange={(e) => setDay(day, { close: e.target.value, closed: false })}
                    />
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={closed}
                        onChange={(e) => setDay(day, { closed: e.target.checked })}
                      />
                      {t('stations.form.closed')}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={sectionClass}>
            <h3 className="text-sm font-semibold">{t('stations.form.sectionNotes')}</h3>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>{t('stations.form.handoverInstructions')}</label>
                <textarea className={`${inputClass} min-h-[72px]`} value={form.handoverInstructions} onChange={(e) => set('handoverInstructions', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.returnInstructions')}</label>
                <textarea className={`${inputClass} min-h-[72px]`} value={form.returnInstructions} onChange={(e) => set('returnInstructions', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{t('stations.form.internalNotes')}</label>
                <textarea className={`${inputClass} min-h-[72px]`} value={form.internalNotes} onChange={(e) => set('internalNotes', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/60 bg-muted/20">
          <button type="button" onClick={onClose} className="sq-3d-btn sq-3d-btn--neutral px-4 py-2 text-sm rounded-lg">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="sq-3d-btn sq-3d-btn--primary px-4 py-2 text-sm rounded-lg inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
