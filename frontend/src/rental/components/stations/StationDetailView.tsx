import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Car,
  Calendar,
  Clock,
  MapPin,
  Phone,
  Mail,
  Star,
  Users,
} from 'lucide-react';
import type { FeatureCollection, Point } from 'geojson';
import { toast } from 'sonner';
import {
  api,
  type Station,
  type StationBookingRow,
  type StationFleetVehicle,
  type StationOverviewStats,
} from '../../../lib/api';
import { MapboxMap } from '../../../components/MapboxMap';
import type { FleetMapFeatureProperties } from '../../stores/useFleetMapStore';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  PageHeader,
  MetricCard,
  StatusChip,
  EmptyState,
  ErrorState,
  SkeletonCard,
  SkeletonMetricGrid,
} from '../../../components/patterns';
import {
  formatStationAddress,
  formatOpeningHoursSummary,
  getStationWarnings,
  parseOpeningHours,
  stationStatusTone,
  stationTypeTone,
  WEEKDAYS,
} from '../../lib/stationUtils';
import { StationFormModal } from './StationFormModal';
import { StationAssignVehicleModal } from './StationAssignVehicleModal';

const EMPTY_FLEET_GEOJSON: FeatureCollection<Point, FleetMapFeatureProperties> = {
  type: 'FeatureCollection',
  features: [],
};

type DetailTab = 'overview' | 'fleet' | 'bookings' | 'staff' | 'rules' | 'handover';

interface StationDetailViewProps {
  stationId: string;
  initialStation?: Station | null;
  onBack: () => void;
  onOpenBooking?: (bookingId: string) => void;
  isDarkMode?: boolean;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isPastEnd(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

export function StationDetailView({
  stationId,
  initialStation,
  onBack,
  onOpenBooking,
  isDarkMode = false,
}: StationDetailViewProps) {
  const { orgId } = useRentalOrg();
  const { t } = useLanguage();

  const [station, setStation] = useState<Station | null>(initialStation ?? null);
  const [stats, setStats] = useState<StationOverviewStats | null>(null);
  const [fleet, setFleet] = useState<StationFleetVehicle[]>([]);
  const [bookings, setBookings] = useState<StationBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [formOpen, setFormOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'overview', label: t('stations.detail.tab.overview') },
    { key: 'fleet', label: t('stations.detail.tab.fleet') },
    { key: 'bookings', label: t('stations.detail.tab.bookings') },
    { key: 'staff', label: t('stations.detail.tab.staff') },
    { key: 'rules', label: t('stations.detail.tab.rules') },
    { key: 'handover', label: t('stations.detail.tab.handover') },
  ];

  const loadCore = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, o] = await Promise.all([
        api.stations.get(orgId, stationId),
        api.stations.overviewStats(orgId, stationId),
      ]);
      setStation(s);
      setStats(o);
    } catch (e) {
      setError((e as Error).message || t('stations.errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [orgId, stationId, t]);

  const loadTabData = useCallback(async () => {
    if (!orgId) return;
    setTabLoading(true);
    try {
      if (activeTab === 'fleet' || activeTab === 'overview') {
        const rows = await api.stations.fleet(orgId, stationId);
        setFleet(Array.isArray(rows) ? rows : []);
      }
      if (activeTab === 'bookings' || activeTab === 'overview') {
        const rows = await api.stations.bookings(orgId, stationId);
        setBookings(Array.isArray(rows) ? rows : []);
      }
    } catch {
      /* tab-level errors shown inline */
    } finally {
      setTabLoading(false);
    }
  }, [orgId, stationId, activeTab]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadTabData();
  }, [loadTabData]);

  const warnings = useMemo(
    () => (station ? getStationWarnings(station, stats) : []),
    [station, stats],
  );

  const address = station ? formatStationAddress(station) : '';
  const hours = station ? parseOpeningHours(station.openingHours) : null;

  const bookingGroups = useMemo(() => {
    const todayPickups = bookings.filter((b) => b.pickupStationId === stationId && isToday(b.startDate));
    const todayReturns = bookings.filter((b) => b.returnStationId === stationId && isToday(b.endDate));
    const upcoming = bookings.filter((b) => new Date(b.startDate).getTime() > Date.now());
    const overdueReturns = bookings.filter(
      (b) => b.returnStationId === stationId && isPastEnd(b.endDate) && !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes((b.status || '').toUpperCase()),
    );
    const oneWay = bookings.filter((b) => b.isOneWayRental);
    const diffReturn = bookings.filter((b) => b.pickupStationId === stationId && b.returnStationId && b.returnStationId !== stationId);
    return { todayPickups, todayReturns, upcoming, overdueReturns, oneWay, diffReturn };
  }, [bookings, stationId]);

  const mapCenter = useMemo((): [number, number] | undefined => {
    if (station?.longitude != null && station?.latitude != null) {
      return [station.longitude, station.latitude];
    }
    return undefined;
  }, [station]);

  const handleSave = async (payload: Parameters<typeof api.stations.create>[1]) => {
    if (!orgId || !station) return;
    setSaving(true);
    try {
      const updated = await api.stations.update(orgId, station.id, payload);
      setStation(updated);
      setFormOpen(false);
      toast.success(t('stations.form.saved'));
      void loadCore();
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrimary = async () => {
    if (!orgId || !station) return;
    try {
      const updated = await api.stations.setPrimary(orgId, station.id);
      setStation(updated);
      toast.success(t('stations.setPrimaryDone'));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading && !station) {
    return (
      <div className="space-y-4 max-w-[1400px] mx-auto">
        <SkeletonCard className="h-16 w-full" />
        <SkeletonMetricGrid count={4} />
        <SkeletonCard className="h-64 w-full" />
      </div>
    );
  }

  if (error && !station) {
    return (
      <div className="max-w-lg mx-auto py-8">
        <ErrorState title={t('stations.detail.errorTitle')} description={error} onRetry={() => void loadCore()} />
        <button type="button" onClick={onBack} className="mt-4 block mx-auto text-xs text-muted-foreground">
          ← {t('stations.detail.back')}
        </button>
      </div>
    );
  }

  if (!station) return null;

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <PageHeader
        variant="full"
        eyebrow={(
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('view.stations')}
          </button>
        )}
        title={station.name}
        description={(
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {station.code && <span className="font-mono">{station.code}</span>}
            {address && <><span>·</span><span>{address}</span></>}
          </span>
        )}
        status={(
          <div className="flex flex-wrap gap-1.5">
            <StatusChip tone={stationStatusTone(station.status)} dot>
              {t(`stations.status.${station.status}`)}
            </StatusChip>
            <StatusChip tone={stationTypeTone(station.type)}>
              {t(`stations.type.${station.type}`)}
            </StatusChip>
            {station.isPrimary && (
              <StatusChip tone="info" icon={<Star className="w-3 h-3" />}>
                {t('stations.primary')}
              </StatusChip>
            )}
          </div>
        )}
        actions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAssignOpen(true)} className="sq-press px-3 py-2 rounded-xl text-[10px] font-semibold border border-border bg-card">
              {t('stations.action.assignVehicle')}
            </button>
            {!station.isPrimary && (
              <button type="button" onClick={() => void handleSetPrimary()} className="sq-press px-3 py-2 rounded-xl text-[10px] font-semibold border border-border bg-card">
                {t('stations.action.setPrimary')}
              </button>
            )}
            <button type="button" onClick={() => setFormOpen(true)} className="sq-press px-3 py-2 rounded-xl text-[10px] font-semibold sq-tone-brand">
              {t('stations.action.edit')}
            </button>
          </div>
        )}
      />

      {warnings.length > 0 && (
        <div className="sq-card p-3 flex flex-wrap gap-2 items-start">
          <AlertTriangle className="w-4 h-4 text-[color:var(--status-watch)] shrink-0 mt-0.5" />
          {warnings.map((w) => (
            <StatusChip key={w} tone="warning">{t(`stations.warning.${w}`)}</StatusChip>
          ))}
        </div>
      )}

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 min-w-max sq-tab-bar p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`sq-tab px-3 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap ${
                activeTab === tab.key ? 'sq-tab--active' : ''
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label={t('stations.kpi.vehicles')} value={stats?.totalVehicles ?? station.vehicleCount} icon={<Car className="w-4 h-4" />} loading={!stats} />
            <MetricCard label={t('stations.kpi.available')} value={stats?.availableVehicles ?? '—'} loading={!stats} />
            <MetricCard label={t('stations.kpi.todayPickups')} value={stats?.todayPickups ?? '—'} loading={!stats} />
            <MetricCard label={t('stations.kpi.todayReturns')} value={stats?.todayReturns ?? '—'} loading={!stats} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="sq-card p-4 space-y-3">
              <h3 className="text-sm font-semibold">{t('stations.detail.contact')}</h3>
              <dl className="space-y-2 text-sm">
                {station.phone && (
                  <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-muted-foreground" /><span>{station.phone}</span></div>
                )}
                {station.email && (
                  <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-muted-foreground" /><span>{station.email}</span></div>
                )}
                {(station.managerName || station.contactPerson) && (
                  <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-muted-foreground" /><span>{station.managerName ?? station.contactPerson}</span></div>
                )}
                {!station.phone && !station.email && !station.managerName && !station.contactPerson && (
                  <p className="text-xs text-muted-foreground">—</p>
                )}
              </dl>
              <h3 className="text-sm font-semibold pt-2">{t('stations.detail.hours')}</h3>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                {hours ? formatOpeningHoursSummary(hours) : '—'}
              </p>
            </div>

            <div className="sq-card overflow-hidden min-h-[220px]">
              {mapCenter ? (
                <MapboxMap
                  center={mapCenter}
                  zoom={14}
                  fleetGeoJson={EMPTY_FLEET_GEOJSON}
                  stations={[{
                    id: station.id,
                    name: station.name,
                    latitude: station.latitude,
                    longitude: station.longitude,
                    radiusMeters: station.radiusMeters ?? station.geofenceRadiusMeters,
                  }]}
                  className="w-full h-[220px] lg:h-full min-h-[220px]"
                  isDarkMode={isDarkMode}
                  interactive
                />
              ) : (
                <EmptyState
                  compact
                  icon={<MapPin className="w-6 h-6" />}
                  title={t('stations.warning.missingCoordinates')}
                  description={t('stations.form.geocodeHint')}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <BookingMiniList title={t('stations.detail.todayPickups')} rows={bookingGroups.todayPickups} onOpen={onOpenBooking} />
            <BookingMiniList title={t('stations.detail.todayReturns')} rows={bookingGroups.todayReturns} onOpen={onOpenBooking} />
          </div>
        </div>
      )}

      {activeTab === 'fleet' && (
        <FleetTab fleet={fleet} loading={tabLoading} t={t} />
      )}

      {activeTab === 'bookings' && (
        <BookingsTab groups={bookingGroups} loading={tabLoading} onOpen={onOpenBooking} t={t} />
      )}

      {activeTab === 'staff' && (
        <EmptyState
          icon={<Users className="w-8 h-8" />}
          title={t('stations.detail.staffEmptyTitle')}
          description={t('stations.detail.staffEmptyDescription')}
        />
      )}

      {activeTab === 'rules' && (
        <RulesTab station={station} hours={hours} t={t} />
      )}

      {activeTab === 'handover' && (
        <HandoverTab station={station} t={t} />
      )}

      <StationFormModal open={formOpen} station={station} saving={saving} orgId={orgId} onClose={() => setFormOpen(false)} onSubmit={handleSave} />
      <StationAssignVehicleModal
        station={assignOpen ? station : null}
        onClose={() => setAssignOpen(false)}
        onSaved={() => { void loadCore(); void loadTabData(); }}
      />
    </div>
  );
}

function BookingMiniList({
  title,
  rows,
  onOpen,
}: {
  title: string;
  rows: StationBookingRow[];
  onOpen?: (id: string) => void;
}) {
  return (
    <div className="sq-card p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 5).map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onOpen?.(b.id)}
                className="w-full text-left text-xs flex justify-between gap-2 hover:bg-muted/40 rounded-lg px-2 py-1.5"
              >
                <span className="font-medium truncate">{b.customerName}</span>
                <span className="text-muted-foreground shrink-0">{b.vehicleLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FleetTab({ fleet, loading, t }: { fleet: StationFleetVehicle[]; loading: boolean; t: (k: TranslationKey) => string }) {
  if (loading) {
    return <SkeletonCard className="h-48 w-full" />;
  }
  if (fleet.length === 0) {
    return (
      <EmptyState
        icon={<Car className="w-8 h-8" />}
        title={t('stations.detail.fleetEmptyTitle')}
        description={t('stations.detail.fleetEmptyDescription')}
      />
    );
  }
  return (
    <div className="sq-card overflow-hidden">
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="p-3 font-semibold">{t('stations.detail.col.plate')}</th>
              <th className="p-3 font-semibold">{t('stations.detail.col.vehicle')}</th>
              <th className="p-3 font-semibold">{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {fleet.map((v) => (
              <tr key={v.id} className="border-b border-border/50 last:border-0">
                <td className="p-3 font-mono text-xs">{v.licensePlate ?? '—'}</td>
                <td className="p-3">{[v.make, v.model].filter(Boolean).join(' ') || v.vehicleName || '—'}</td>
                <td className="p-3"><StatusChip tone="neutral">{v.status}</StatusChip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y divide-border">
        {fleet.map((v) => (
          <div key={v.id} className="p-3 space-y-1">
            <div className="font-mono text-xs font-semibold">{v.licensePlate ?? '—'}</div>
            <div className="text-sm">{[v.make, v.model].filter(Boolean).join(' ') || v.vehicleName}</div>
            <StatusChip tone="neutral">{v.status}</StatusChip>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingsTab({
  groups,
  loading,
  onOpen,
  t,
}: {
  groups: {
    todayPickups: StationBookingRow[];
    todayReturns: StationBookingRow[];
    upcoming: StationBookingRow[];
    overdueReturns: StationBookingRow[];
    oneWay: StationBookingRow[];
    diffReturn: StationBookingRow[];
  };
  loading: boolean;
  onOpen?: (id: string) => void;
  t: (k: TranslationKey) => string;
}) {
  if (loading) return <SkeletonCard className="h-48 w-full" />;

  const sections = [
    { key: 'todayPickups', label: t('stations.detail.todayPickups'), rows: groups.todayPickups },
    { key: 'todayReturns', label: t('stations.detail.todayReturns'), rows: groups.todayReturns },
    { key: 'upcoming', label: t('stations.detail.upcoming'), rows: groups.upcoming },
    { key: 'overdue', label: t('stations.detail.overdue'), rows: groups.overdueReturns },
    { key: 'oneWay', label: t('stations.detail.oneWay'), rows: groups.oneWay },
    { key: 'diffReturn', label: t('stations.detail.diffReturn'), rows: groups.diffReturn },
  ];

  const hasAny = sections.some((s) => s.rows.length > 0);
  if (!hasAny) {
    return (
      <EmptyState
        icon={<Calendar className="w-8 h-8" />}
        title={t('stations.detail.bookingsEmptyTitle')}
        description={t('stations.detail.bookingsEmptyDescription')}
      />
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) =>
        section.rows.length === 0 ? null : (
          <div key={section.key} className="sq-card p-4">
            <h3 className="text-sm font-semibold mb-3">{section.label}</h3>
            <ul className="space-y-2">
              {section.rows.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onOpen?.(b.id)}
                    className="w-full text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-lg px-2 py-2 hover:bg-muted/40 text-sm"
                  >
                    <span className="font-medium">{b.customerName}</span>
                    <span className="text-xs text-muted-foreground">
                      {b.vehicleLabel} · {new Date(b.startDate).toLocaleDateString()} – {new Date(b.endDate).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}

function RulesTab({
  station,
  hours,
  t,
}: {
  station: Station;
  hours: ReturnType<typeof parseOpeningHours> | null;
  t: (k: TranslationKey) => string;
}) {
  const dayLabels: Record<string, string> = {
    monday: t('stations.form.day.monday'),
    tuesday: t('stations.form.day.tuesday'),
    wednesday: t('stations.form.day.wednesday'),
    thursday: t('stations.form.day.thursday'),
    friday: t('stations.form.day.friday'),
    saturday: t('stations.form.day.saturday'),
    sunday: t('stations.form.day.sunday'),
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="sq-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">{t('stations.detail.rules')}</h3>
        <ul className="text-sm space-y-2">
          <RuleRow label={t('stations.form.pickupEnabled')} value={station.pickupEnabled} />
          <RuleRow label={t('stations.form.returnEnabled')} value={station.returnEnabled} />
          <RuleRow label={t('stations.form.afterHours')} value={station.afterHoursReturnEnabled} />
          <RuleRow label={t('stations.form.keyBox')} value={station.keyBoxAvailable} />
          {station.capacity != null && (
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t('stations.form.capacity')}</span>
              <span className="font-medium">{station.capacity}</span>
            </li>
          )}
          {station.timezone && (
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t('stations.form.timezone')}</span>
              <span className="font-medium">{station.timezone}</span>
            </li>
          )}
        </ul>
      </div>
      <div className="sq-card p-4">
        <h3 className="text-sm font-semibold mb-3">{t('stations.form.sectionHours')}</h3>
        {!hours || ('legacyText' in hours && hours.legacyText) ? (
          <p className="text-sm text-muted-foreground">
            {'legacyText' in (hours ?? {}) && hours?.legacyText ? String(hours.legacyText) : '—'}
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {WEEKDAYS.map((day) => {
              const slot = hours[day];
              const label = dayLabels[day] ?? day;
              if (!slot || slot.closed) {
                return (
                  <li key={day} className="flex justify-between">
                    <span>{label}</span>
                    <span className="text-muted-foreground">{t('stations.form.closed')}</span>
                  </li>
                );
              }
              return (
                <li key={day} className="flex justify-between">
                  <span>{label}</span>
                  <span className="font-mono text-xs">{slot.open} – {slot.close}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function RuleRow({ label, value }: { label: string; value: boolean }) {
  return (
    <li className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <StatusChip tone={value ? 'success' : 'neutral'}>{value ? '✓' : '—'}</StatusChip>
    </li>
  );
}

function HandoverTab({ station, t }: { station: Station; t: (k: TranslationKey) => string }) {
  const blocks = [
    { title: t('stations.form.handoverInstructions'), text: station.handoverInstructions },
    { title: t('stations.form.returnInstructions'), text: station.returnInstructions },
    { title: t('stations.form.internalNotes'), text: station.internalNotes ?? station.notes },
  ];
  const hasContent = blocks.some((b) => b.text?.trim());
  if (!hasContent) {
    return (
      <EmptyState
        title={t('stations.detail.handoverEmptyTitle')}
        description={t('stations.detail.handoverEmptyDescription')}
        action={(
          <p className="text-xs text-muted-foreground">{t('stations.detail.handoverHint')}</p>
        )}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {blocks.map((b) => (
        <div key={b.title} className="sq-card p-4">
          <h3 className="text-sm font-semibold mb-2">{b.title}</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{b.text?.trim() || '—'}</p>
        </div>
      ))}
    </div>
  );
}
