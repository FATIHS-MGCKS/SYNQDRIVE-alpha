import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X, Loader2, Search, MapPin, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import type {
  Station,
  StationUpsertPayload,
  StationOpeningHours,
  StationMapboxSuggestion,
} from '../../../lib/api';
import {
  WEEKDAYS,
  defaultWeeklyHours,
  parseOpeningHours,
  stationStatusTone,
} from '../../lib/stationUtils';
import {
  STATION_FORM_RADIUS_DEFAULT,
  STATION_FORM_RADIUS_MAX,
  STATION_FORM_RADIUS_MIN,
  STATION_FORM_TIMEZONE_OPTIONS,
} from '../../lib/station-form.constants';
import {
  firstStationFormErrorField,
  formatStationTimezonePreview,
  hasStationFormAfterHoursKeyboxWarning,
  validateStationForm,
  type StationFormFieldErrors,
} from '../../lib/station-form.validation';
import { Button } from '../../../components/ui/button';
import { StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { StationsFormCapabilities } from '../../lib/stations-v2-ui-capabilities';

export type StationFormValues = {
  name: string;
  code: string;
  type: Station['type'];
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
    radiusMeters: STATION_FORM_RADIUS_DEFAULT,
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
    radiusMeters: station.radiusMeters ?? station.geofenceRadiusMeters ?? STATION_FORM_RADIUS_DEFAULT,
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

export function toStationFormPayload(form: StationFormValues, isCreate: boolean): StationUpsertPayload {
  const lat = form.latitude.trim() ? Number(form.latitude) : null;
  const lng = form.longitude.trim() ? Number(form.longitude) : null;
  const cap = form.capacity.trim() ? Number(form.capacity) : null;
  return {
    name: form.name.trim(),
    code: form.code.trim() || null,
    type: form.type,
    ...(isCreate ? { status: 'ACTIVE' as const } : {}),
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

type MapboxSuggestionWithToken = StationMapboxSuggestion & { sessionToken: string };

type Props = {
  open: boolean;
  station?: Station | null;
  saving?: boolean;
  lifecycleLoading?: boolean;
  orgId: string;
  formCapabilities?: StationsFormCapabilities;
  onClose: () => void;
  onSubmit: (payload: StationUpsertPayload) => Promise<void>;
  onActivate?: () => Promise<void>;
  onDeactivate?: () => Promise<void>;
};

const DEFAULT_FORM_CAPABILITIES: StationsFormCapabilities = {
  canSubmit: true,
  canEditMasterData: true,
  canManageOperations: true,
  canManageTeam: true,
  canActivate: false,
  canDeactivate: false,
  canUseMapboxSearch: true,
  readOnly: false,
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-[color:var(--status-critical)]">
      {message}
    </p>
  );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="text-sm font-semibold text-foreground">
      {children}
    </h3>
  );
}

export function StationFormModal({
  open,
  station,
  saving,
  lifecycleLoading,
  orgId,
  formCapabilities = DEFAULT_FORM_CAPABILITIES,
  onClose,
  onSubmit,
  onActivate,
  onDeactivate,
}: Props) {
  const { t, locale } = useLanguage();
  const formTitleId = useId();
  const [form, setForm] = useState<StationFormValues>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<StationFormFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [mapboxQuery, setMapboxQuery] = useState('');
  const [suggestions, setSuggestions] = useState<MapboxSuggestionWithToken[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [prefilledFromMapbox, setPrefilledFromMapbox] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const firstErrorRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(station ? fromStation(station) : emptyForm());
    setFieldErrors({});
    setSubmitError(null);
    setMapboxQuery('');
    setSuggestions([]);
    setSearchLoading(false);
    setSearchError(false);
    setShowSuggestions(false);
    setPrefilledFromMapbox(false);
  }, [open, station]);

  useEffect(() => () => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
  }, []);

  useEffect(() => {
    if (firstStationFormErrorField(fieldErrors) && firstErrorRef.current) {
      firstErrorRef.current.focus();
    }
  }, [fieldErrors]);

  if (!open) return null;

  const isCreate = !station;
  const caps = formCapabilities;
  const masterDisabled = !caps.canEditMasterData;
  const opsDisabled = !caps.canManageOperations;
  const teamDisabled = !caps.canManageTeam;
  const afterHoursKeyboxWarning = hasStationFormAfterHoursKeyboxWarning(form);
  const timezonePreview = formatStationTimezonePreview(form.timezone, locale === 'de' ? 'de-DE' : 'en-GB');
  const timezoneInList = STATION_FORM_TIMEZONE_OPTIONS.some((opt) => opt.value === form.timezone);

  const inputClass = (invalid?: boolean) =>
    `w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed ${
      invalid
        ? 'border-[color:var(--status-critical)] focus:border-[color:var(--status-critical)] focus:ring-[color:var(--status-critical-soft)]'
        : 'border-border/70 focus:border-[color:var(--brand)] focus:ring-[color:var(--brand-soft)]'
    }`;
  const labelClass = 'block text-[11px] font-semibold mb-1 uppercase tracking-wider text-muted-foreground';
  const sectionClass = 'surface-premium rounded-xl p-4 space-y-3';

  const registerFirstError = (field: string) => (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => {
    if (firstStationFormErrorField(fieldErrors) === field && el) {
      firstErrorRef.current = el;
    }
  };

  const handleMapboxQueryChange = (value: string) => {
    setMapboxQuery(value);
    setSearchError(false);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.trim().length < 3 || !orgId) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    setShowSuggestions(true);
    searchTimeout.current = setTimeout(() => {
      api.stations
        .searchMapbox(orgId, value.trim())
        .then((res) => {
          const token = res.sessionToken;
          setSuggestions((res.suggestions ?? []).map((s) => ({ ...s, sessionToken: token })));
          setSearchError(false);
        })
        .catch(() => {
          setSuggestions([]);
          setSearchError(true);
        })
        .finally(() => setSearchLoading(false));
    }, 350);
  };

  const handleSelectSuggestion = async (sug: MapboxSuggestionWithToken) => {
    setShowSuggestions(false);
    setSuggestions([]);
    if (!orgId || !sug.sessionToken) {
      setForm((prev) => ({ ...prev, name: prev.name || sug.name }));
      return;
    }
    const prefill = await api.stations
      .mapboxRetrieve(orgId, sug.mapboxId, sug.sessionToken)
      .catch(() => null);
    setMapboxQuery('');
    if (prefill) {
      setForm((prev) => ({
        ...prev,
        name: prev.name.trim() ? prev.name : sug.name || prev.name,
        address: prefill.street ?? prev.address,
        postalCode: prefill.postalCode ?? prev.postalCode,
        city: prefill.city ?? prev.city,
        country: prefill.country ?? prev.country,
        phone: prefill.phone ?? prev.phone,
        latitude:
          prefill.coordinatesAccepted !== false && prefill.latitude != null
            ? String(prefill.latitude)
            : prev.latitude,
        longitude:
          prefill.coordinatesAccepted !== false && prefill.longitude != null
            ? String(prefill.longitude)
            : prev.longitude,
      }));
      setPrefilledFromMapbox(true);
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.coordinates;
        delete next.address;
        delete next.postalCode;
        delete next.city;
        delete next.country;
        return next;
      });
    } else {
      setForm((prev) => ({ ...prev, name: prev.name || sug.name }));
    }
  };

  const set = <K extends keyof StationFormValues>(key: K, value: StationFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[String(key)];
      if (key === 'latitude' || key === 'longitude') delete next.coordinates;
      return next;
    });
  };

  const setDay = (day: string, patch: Partial<StationOpeningHours[string]>) => {
    setForm((prev) => ({
      ...prev,
      openingHours: {
        ...prev.openingHours,
        [day]: { ...prev.openingHours[day], ...patch },
      },
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[`openingHours.${day}`];
      return next;
    });
  };

  const handleReturnEnabledChange = (checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      returnEnabled: checked,
      afterHoursReturnEnabled: checked ? prev.afterHoursReturnEnabled : false,
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.returnEnabled;
      delete next.afterHoursReturnEnabled;
      return next;
    });
  };

  const handleSave = async () => {
    const errors = validateStationForm(form, (key) => t(key as TranslationKey));
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitError(t('stations.form.errorSummary'));
      return;
    }
    setFieldErrors({});
    setSubmitError(null);
    try {
      await onSubmit(toStationFormPayload(form, isCreate));
      toast.success(station ? t('stations.form.saved') : t('stations.form.created'));
      onClose();
    } catch (e) {
      setSubmitError((e as Error).message || t('stations.form.saveFailed'));
    }
  };

  const handleLifecycle = async (action: 'activate' | 'deactivate') => {
    setSubmitError(null);
    try {
      if (action === 'activate' && onActivate) await onActivate();
      if (action === 'deactivate' && onDeactivate) await onDeactivate();
    } catch (e) {
      setSubmitError((e as Error).message || t('stations.form.lifecycleFailed'));
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label={t('common.cancel')} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={formTitleId}
        className="relative w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-background border border-border shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 gap-3">
          <div className="min-w-0">
            <h2 id={formTitleId} className="text-base font-semibold text-foreground">
              {station ? t('stations.form.editTitle') : t('stations.form.createTitle')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('stations.form.subtitle')}</p>
            {station && (
              <div className="mt-2">
                <StatusChip tone={stationStatusTone(station.status)} dot>
                  {t(`stations.status.${station.status}`)}
                </StatusChip>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted/60 shrink-0" aria-label={t('common.cancel')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {submitError && (
            <div role="alert" className="text-sm text-[color:var(--status-critical)] bg-[color:var(--status-critical-soft)] rounded-lg px-3 py-2">
              {submitError}
            </div>
          )}

          <section className={sectionClass} aria-labelledby="station-form-basic">
            <SectionHeading id="station-form-basic">{t('stations.form.sectionBasic')}</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="station-name">{t('stations.form.name')} *</label>
                <input
                  id="station-name"
                  ref={registerFirstError('name')}
                  className={inputClass(!!fieldErrors.name)}
                  disabled={masterDisabled}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby={fieldErrors.name ? 'station-name-error' : undefined}
                  autoComplete="organization"
                />
                <FieldError id="station-name-error" message={fieldErrors.name} />
              </div>
              <div>
                <label className={labelClass} htmlFor="station-code">{t('stations.form.code')}</label>
                <input id="station-code" className={inputClass()} disabled={masterDisabled} value={form.code} onChange={(e) => set('code', e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="station-type">{t('stations.form.type')}</label>
                <select
                  id="station-type"
                  className={inputClass()}
                  disabled={masterDisabled}
                  value={form.type}
                  onChange={(e) => set('type', e.target.value as Station['type'])}
                >
                  {(['MAIN', 'BRANCH', 'PARKING', 'PARTNER', 'TEMPORARY'] as const).map((v) => (
                    <option key={v} value={v}>{t(`stations.type.${v}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="station-phone">{t('stations.form.phone')}</label>
                <input id="station-phone" className={inputClass()} disabled={masterDisabled} value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" />
              </div>
              <div>
                <label className={labelClass} htmlFor="station-email">{t('stations.form.email')}</label>
                <input
                  id="station-email"
                  ref={registerFirstError('email')}
                  className={inputClass(!!fieldErrors.email)}
                  type="email"
                  disabled={masterDisabled}
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? 'station-email-error' : undefined}
                  autoComplete="email"
                />
                <FieldError id="station-email-error" message={fieldErrors.email} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="station-contact">{t('stations.form.contact')}</label>
                <input id="station-contact" className={inputClass()} disabled={teamDisabled} value={form.managerName} onChange={(e) => set('managerName', e.target.value)} />
              </div>
            </div>
          </section>

          <section className={sectionClass} aria-labelledby="station-form-address">
            <SectionHeading id="station-form-address">{t('stations.form.sectionAddress')}</SectionHeading>
            {caps.canUseMapboxSearch && (
              <div>
                <label className={labelClass} htmlFor="station-mapbox">{t('stations.form.searchLabel')}</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
                  <input
                    id="station-mapbox"
                    className={`${inputClass()} pl-9`}
                    value={mapboxQuery}
                    onChange={(e) => handleMapboxQueryChange(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder={t('stations.form.searchPlaceholder')}
                    autoComplete="off"
                  />
                  {searchLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" aria-hidden />
                  )}
                  {showSuggestions && (
                    <ul className="sq-overlay absolute z-20 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg list-none m-0 p-0">
                      {searchLoading && suggestions.length === 0 ? (
                        <li className="px-3 py-2.5 text-xs text-muted-foreground">{t('stations.form.searching')}</li>
                      ) : searchError ? (
                        <li className="px-3 py-2.5 text-xs text-[color:var(--status-critical)]">{t('stations.form.searchError')}</li>
                      ) : suggestions.length === 0 && mapboxQuery.trim().length >= 3 ? (
                        <li className="px-3 py-2.5 text-xs text-muted-foreground">{t('stations.form.searchEmpty')}</li>
                      ) : (
                        suggestions.map((s) => (
                          <li key={s.mapboxId}>
                            <button
                              type="button"
                              onMouseDown={() => void handleSelectSuggestion(s)}
                              className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition hover:bg-muted min-h-[44px]"
                            >
                              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[color:var(--brand)]" aria-hidden />
                              <span className="min-w-0">
                                <span className="block text-xs font-medium text-foreground truncate">{s.name}</span>
                                <span className="block text-[10px] text-muted-foreground truncate">
                                  {s.placeFormatted ?? s.fullAddress}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {prefilledFromMapbox ? t('stations.form.searchPrefilled') : t('stations.form.searchHint')}
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="station-address">{t('stations.form.address')} *</label>
                <input
                  id="station-address"
                  ref={registerFirstError('address')}
                  className={inputClass(!!fieldErrors.address)}
                  disabled={masterDisabled}
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  aria-invalid={!!fieldErrors.address}
                  aria-describedby={fieldErrors.address ? 'station-address-error' : undefined}
                  autoComplete="street-address"
                />
                <FieldError id="station-address-error" message={fieldErrors.address} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="station-address2">{t('stations.form.addressLine2')}</label>
                <input id="station-address2" className={inputClass()} disabled={masterDisabled} value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="station-postal">{t('stations.form.postalCode')} *</label>
                <input
                  id="station-postal"
                  ref={registerFirstError('postalCode')}
                  className={inputClass(!!fieldErrors.postalCode)}
                  disabled={masterDisabled}
                  value={form.postalCode}
                  onChange={(e) => set('postalCode', e.target.value)}
                  aria-invalid={!!fieldErrors.postalCode}
                  aria-describedby={fieldErrors.postalCode ? 'station-postal-error' : undefined}
                  autoComplete="postal-code"
                />
                <FieldError id="station-postal-error" message={fieldErrors.postalCode} />
              </div>
              <div>
                <label className={labelClass} htmlFor="station-city">{t('stations.form.city')} *</label>
                <input
                  id="station-city"
                  ref={registerFirstError('city')}
                  className={inputClass(!!fieldErrors.city)}
                  disabled={masterDisabled}
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  aria-invalid={!!fieldErrors.city}
                  aria-describedby={fieldErrors.city ? 'station-city-error' : undefined}
                  autoComplete="address-level2"
                />
                <FieldError id="station-city-error" message={fieldErrors.city} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="station-country">{t('stations.form.country')} *</label>
                <input
                  id="station-country"
                  ref={registerFirstError('country')}
                  className={inputClass(!!fieldErrors.country)}
                  disabled={masterDisabled}
                  value={form.country}
                  onChange={(e) => set('country', e.target.value)}
                  aria-invalid={!!fieldErrors.country}
                  aria-describedby={fieldErrors.country ? 'station-country-error' : undefined}
                  autoComplete="country-name"
                />
                <FieldError id="station-country-error" message={fieldErrors.country} />
              </div>
              <div className="sm:col-span-2">
                <fieldset className="border-0 p-0 m-0 min-w-0">
                  <legend className={labelClass}>{t('stations.form.coordinates')}</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      ref={registerFirstError('coordinates')}
                      className={inputClass(!!fieldErrors.coordinates)}
                      disabled={masterDisabled}
                      value={form.latitude}
                      onChange={(e) => set('latitude', e.target.value)}
                      placeholder={t('stations.form.latitude')}
                      inputMode="decimal"
                      aria-invalid={!!fieldErrors.coordinates}
                      aria-describedby={fieldErrors.coordinates ? 'station-coords-error' : 'station-coords-hint'}
                    />
                    <input
                      className={inputClass(!!fieldErrors.coordinates)}
                      disabled={masterDisabled}
                      value={form.longitude}
                      onChange={(e) => set('longitude', e.target.value)}
                      placeholder={t('stations.form.longitude')}
                      inputMode="decimal"
                      aria-invalid={!!fieldErrors.coordinates}
                    />
                  </div>
                  <FieldError id="station-coords-error" message={fieldErrors.coordinates} />
                  <p id="station-coords-hint" className="text-xs text-muted-foreground mt-1">{t('stations.form.coordinatesHint')}</p>
                </fieldset>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="station-geofence">
                  {t('stations.form.geofence')} ({STATION_FORM_RADIUS_MIN}–{STATION_FORM_RADIUS_MAX} m)
                </label>
                <input
                  id="station-geofence"
                  type="range"
                  min={STATION_FORM_RADIUS_MIN}
                  max={STATION_FORM_RADIUS_MAX}
                  step={25}
                  value={form.radiusMeters ?? STATION_FORM_RADIUS_DEFAULT}
                  disabled={opsDisabled}
                  onChange={(e) => set('radiusMeters', Number(e.target.value))}
                  className="w-full min-h-[44px]"
                  aria-valuemin={STATION_FORM_RADIUS_MIN}
                  aria-valuemax={STATION_FORM_RADIUS_MAX}
                  aria-valuenow={form.radiusMeters ?? STATION_FORM_RADIUS_DEFAULT}
                  aria-describedby={fieldErrors.radiusMeters ? 'station-radius-error' : undefined}
                />
                <p className="text-xs text-muted-foreground mt-1">{form.radiusMeters ?? STATION_FORM_RADIUS_DEFAULT} m</p>
                <FieldError id="station-radius-error" message={fieldErrors.radiusMeters} />
              </div>
            </div>
          </section>

          <section className={sectionClass} aria-labelledby="station-form-operations">
            <SectionHeading id="station-form-operations">{t('stations.form.sectionOperations')}</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <label className="flex items-start gap-2 min-h-[44px]">
                <input type="checkbox" className="mt-1 shrink-0" disabled={opsDisabled} checked={form.pickupEnabled} onChange={(e) => set('pickupEnabled', e.target.checked)} />
                <span>{t('stations.form.pickupEnabled')}</span>
              </label>
              <label className="flex items-start gap-2 min-h-[44px]">
                <input type="checkbox" className="mt-1 shrink-0" disabled={opsDisabled} checked={form.returnEnabled} onChange={(e) => handleReturnEnabledChange(e.target.checked)} />
                <span>{t('stations.form.returnEnabled')}</span>
              </label>
              <label className="flex items-start gap-2 min-h-[44px]">
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  disabled={opsDisabled || !form.returnEnabled}
                  checked={form.afterHoursReturnEnabled}
                  onChange={(e) => set('afterHoursReturnEnabled', e.target.checked)}
                  aria-invalid={!!fieldErrors.afterHoursReturnEnabled}
                  aria-describedby="station-after-hours-help"
                />
                <span>{t('stations.form.afterHours')}</span>
              </label>
              <label className="flex items-start gap-2 min-h-[44px]">
                <input type="checkbox" className="mt-1 shrink-0" disabled={opsDisabled} checked={form.keyBoxAvailable} onChange={(e) => set('keyBoxAvailable', e.target.checked)} />
                <span>{t('stations.form.keyBox')}</span>
              </label>
            </div>
            <FieldError id="station-after-hours-error" message={fieldErrors.afterHoursReturnEnabled} />
            <p id="station-after-hours-help" className="text-xs text-muted-foreground">
              {t('stations.form.afterHoursKeyboxHint')}
            </p>
            {afterHoursKeyboxWarning && (
              <div role="status" className="flex items-start gap-2 rounded-lg border border-[color:var(--status-watch)]/35 bg-[color:var(--status-watch)]/[0.06] px-3 py-2 text-xs text-muted-foreground">
                <AlertCircle className="w-4 h-4 shrink-0 text-[color:var(--status-watch)] mt-0.5" aria-hidden />
                <span>{t('stations.form.afterHoursKeyboxWarning')}</span>
              </div>
            )}
            <div>
              <label className={labelClass} htmlFor="station-timezone">{t('stations.form.timezone')}</label>
              <select
                id="station-timezone"
                ref={registerFirstError('timezone')}
                className={inputClass(!!fieldErrors.timezone)}
                disabled={opsDisabled}
                value={timezoneInList ? form.timezone : form.timezone || 'Europe/Berlin'}
                onChange={(e) => set('timezone', e.target.value)}
                aria-invalid={!!fieldErrors.timezone}
                aria-describedby="station-timezone-help"
              >
                {STATION_FORM_TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)} ({opt.value})
                  </option>
                ))}
                {!timezoneInList && form.timezone ? (
                  <option value={form.timezone}>{form.timezone}</option>
                ) : null}
              </select>
              <p id="station-timezone-help" className="text-xs text-muted-foreground mt-1">
                {timezonePreview
                  ? t('stations.form.timezonePreview', { preview: timezonePreview })
                  : t('stations.form.timezoneHelp')}
              </p>
              <FieldError id="station-timezone-error" message={fieldErrors.timezone} />
            </div>
          </section>

          <section className={sectionClass} aria-labelledby="station-form-hours">
            <SectionHeading id="station-form-hours">{t('stations.form.sectionHours')}</SectionHeading>
            <div className="space-y-2" role="group" aria-label={t('stations.form.sectionHours')}>
              {WEEKDAYS.map((day) => {
                const slot = form.openingHours[day] ?? {};
                const closed = !!slot.closed;
                const dayError = fieldErrors[`openingHours.${day}`];
                return (
                  <div key={day}>
                    <div className="grid grid-cols-1 sm:grid-cols-[88px_1fr_1fr_auto] gap-2 items-center text-sm">
                      <span className="text-muted-foreground font-medium">{t(`stations.form.day.${day}`)}</span>
                      <input
                        type="time"
                        disabled={closed || opsDisabled}
                        className={inputClass(!!dayError)}
                        value={slot.open ?? '08:00'}
                        onChange={(e) => setDay(day, { open: e.target.value, closed: false })}
                        aria-invalid={!!dayError}
                        aria-label={`${t(`stations.form.day.${day}`)} ${t('stations.form.openFrom')}`}
                      />
                      <input
                        type="time"
                        disabled={closed || opsDisabled}
                        className={inputClass(!!dayError)}
                        value={slot.close ?? '18:00'}
                        onChange={(e) => setDay(day, { close: e.target.value, closed: false })}
                        aria-invalid={!!dayError}
                        aria-label={`${t(`stations.form.day.${day}`)} ${t('stations.form.openUntil')}`}
                      />
                      <label className="flex items-center gap-1.5 text-xs whitespace-nowrap min-h-[44px]">
                        <input
                          type="checkbox"
                          disabled={opsDisabled}
                          checked={closed}
                          onChange={(e) => setDay(day, { closed: e.target.checked })}
                        />
                        {t('stations.form.closed')}
                      </label>
                    </div>
                    {dayError ? (
                      <p className="mt-1 text-xs text-[color:var(--status-critical)]" role="alert">{dayError}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className={sectionClass} aria-labelledby="station-form-capacity">
            <SectionHeading id="station-form-capacity">{t('stations.form.sectionCapacity')}</SectionHeading>
            <div>
              <label className={labelClass} htmlFor="station-capacity">{t('stations.form.capacity')}</label>
              <input
                id="station-capacity"
                ref={registerFirstError('capacity')}
                className={inputClass(!!fieldErrors.capacity)}
                disabled={opsDisabled}
                value={form.capacity}
                onChange={(e) => set('capacity', e.target.value)}
                inputMode="numeric"
                aria-invalid={!!fieldErrors.capacity}
                aria-describedby="station-capacity-hint"
              />
              <p id="station-capacity-hint" className="text-xs text-muted-foreground mt-1">{t('stations.form.capacityHint')}</p>
              <FieldError id="station-capacity-error" message={fieldErrors.capacity} />
            </div>
          </section>

          <section className={sectionClass} aria-labelledby="station-form-advanced">
            <SectionHeading id="station-form-advanced">{t('stations.form.sectionAdvanced')}</SectionHeading>
            <div className="space-y-3">
              <div>
                <label className={labelClass} htmlFor="station-handover">{t('stations.form.handoverInstructions')}</label>
                <textarea id="station-handover" className={`${inputClass()} min-h-[72px]`} disabled={opsDisabled} value={form.handoverInstructions} onChange={(e) => set('handoverInstructions', e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="station-return-notes">{t('stations.form.returnInstructions')}</label>
                <textarea id="station-return-notes" className={`${inputClass()} min-h-[72px]`} disabled={opsDisabled} value={form.returnInstructions} onChange={(e) => set('returnInstructions', e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="station-internal-notes">{t('stations.form.internalNotes')}</label>
                <textarea id="station-internal-notes" className={`${inputClass()} min-h-[72px]`} disabled={opsDisabled} value={form.internalNotes} onChange={(e) => set('internalNotes', e.target.value)} />
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 border-t border-border/60 bg-muted/20">
          <div className="flex flex-wrap gap-2">
            {caps.canActivate && onActivate && (
              <Button type="button" variant="neutral" disabled={lifecycleLoading || saving} onClick={() => void handleLifecycle('activate')}>
                {lifecycleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('stations.form.activate')}
              </Button>
            )}
            {caps.canDeactivate && onDeactivate && (
              <Button type="button" variant="neutral" disabled={lifecycleLoading || saving} onClick={() => void handleLifecycle('deactivate')}>
                {lifecycleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('stations.form.deactivate')}
              </Button>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" onClick={onClose} variant="neutral">
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={saving || lifecycleLoading || !caps.canSubmit} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
