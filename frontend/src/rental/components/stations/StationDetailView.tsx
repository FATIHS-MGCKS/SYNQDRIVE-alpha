import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Car,
  Clock,
  Mail,
  MapPin,
  Phone,
  Star,
  Users,
} from 'lucide-react';
import type { FeatureCollection, Point } from 'geojson';
import { toast } from 'sonner';
import {
  api,
  type Station,
  type StationActivityEntry,
  type StationFleetVehicle,
  type StationOperationsDto,
  type StationOperationsTimelineEntry,
  type StationSummaryReadModel,
  type StationTeamDto,
} from '../../../lib/api';
import { MapboxMap } from '../../../components/MapboxMap';
import type { FleetMapFeatureProperties } from '../../stores/useFleetMapStore';
import { useRentalOrg } from '../../RentalContext';
import { useStationsV2Permissions } from '../../hooks/useStationsV2Permissions';
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
  capacityStatusTone,
  getStationCardDisplayMetrics,
  openingStatusTone,
} from '../../lib/station-org-summaries.utils';
import {
  formatStationAddress,
  formatOpeningHoursSummary,
  getStationWarningsFromSummary,
  parseOpeningHours,
  stationStatusTone,
  stationTypeTone,
  WEEKDAYS,
} from '../../lib/stationUtils';
import {
  buildStationDetailTabDescriptors,
  tabRequiresDataLoad,
  type StationDetailTabDataKey,
} from './station-detail-tabs';
import {
  normalizeStationDetailTab,
  type StationDetailTab,
  writeStationDetailUrl,
} from './station-detail-navigation';
import { StationFormModal } from './StationFormModal';
import { StationAssignVehicleModal } from './StationAssignVehicleModal';

const EMPTY_FLEET_GEOJSON: FeatureCollection<Point, FleetMapFeatureProperties> = {
  type: 'FeatureCollection',
  features: [],
};

interface StationDetailViewProps {
  stationId: string;
  initialStation?: Station | null;
  initialTab?: StationDetailTab;
  onBack: () => void;
  onTabChange?: (tab: StationDetailTab) => void;
  onOpenBooking?: (bookingId: string) => void;
  isDarkMode?: boolean;
}

export function StationDetailView({
  stationId,
  initialStation,
  initialTab = 'overview',
  onBack,
  onTabChange,
  onOpenBooking,
  isDarkMode = false,
}: StationDetailViewProps) {
  const { orgId } = useRentalOrg();
  const { t } = useLanguage();
  const { status: permStatus, capabilities, forStation, formCapabilities, isReadOnly } = useStationsV2Permissions();

  const [station, setStation] = useState<Station | null>(initialStation ?? null);
  const [summary, setSummary] = useState<StationSummaryReadModel | null>(null);
  const [team, setTeam] = useState<StationTeamDto | null>(null);
  const [fleet, setFleet] = useState<StationFleetVehicle[]>([]);
  const [timeline, setTimeline] = useState<StationOperationsTimelineEntry[]>([]);
  const [operations, setOperations] = useState<StationOperationsDto | null>(null);
  const [activity, setActivity] = useState<StationActivityEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StationDetailTab>(initialTab);
  const [formOpen, setFormOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadedTabsRef = useRef<Set<StationDetailTabDataKey>>(new Set());

  const stationCaps = useMemo(() => forStation(station), [forStation, station]);
  const tabDescriptors = useMemo(
    () => buildStationDetailTabDescriptors(stationCaps, team),
    [stationCaps, team],
  );
  const visibleTabs = useMemo(() => tabDescriptors.map((tab) => tab.key), [tabDescriptors]);

  useEffect(() => {
    setActiveTab((current) => normalizeStationDetailTab(current, visibleTabs));
  }, [visibleTabs]);

  useEffect(() => {
    setActiveTab(normalizeStationDetailTab(initialTab, visibleTabs));
  }, [initialTab, stationId, visibleTabs]);

  const selectTab = useCallback(
    (tab: StationDetailTab) => {
      const normalized = normalizeStationDetailTab(tab, visibleTabs);
      setActiveTab(normalized);
      onTabChange?.(normalized);
      writeStationDetailUrl(stationId, normalized, 'push');
    },
    [onTabChange, stationId, visibleTabs],
  );

  const loadCore = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    loadedTabsRef.current = new Set();
    try {
      const [stationResult, summaryResult] = await Promise.all([
        api.stations.get(orgId, stationId),
        api.stations.summary(orgId, stationId),
      ]);
      setStation(stationResult);
      setSummary(summaryResult);
      setFleet([]);
      setTimeline([]);
      setOperations(null);
      setActivity([]);
      setTeam(null);
    } catch (e) {
      setError((e as Error).message || t('stations.errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [orgId, stationId, t]);

  const loadTabData = useCallback(
    async (tab: StationDetailTab) => {
      if (!orgId) return;
      const dataKey = tabRequiresDataLoad(tab);
      if (!dataKey) return;
      if (loadedTabsRef.current.has(dataKey)) return;

      setTabLoading(true);
      setTabError(null);
      try {
        if (dataKey === 'fleet') {
          const rows = await api.stations.fleet(orgId, stationId);
          setFleet(Array.isArray(rows) ? rows : []);
        }
        if (dataKey === 'schedule') {
          const model = await api.stations.operationsTimeline(orgId, stationId, {
            page: 1,
            pageSize: 50,
            sortOrder: 'asc',
          });
          setTimeline(model.entries ?? []);
        }
        if (dataKey === 'operations') {
          const ops = await api.stations.operations(orgId, stationId);
          setOperations(ops);
        }
        if (dataKey === 'team') {
          const teamResult = await api.stations.team(orgId, stationId);
          setTeam(teamResult);
        }
        if (dataKey === 'activity' && stationCaps.canViewActivity) {
          const rows = await api.stations.activity(orgId, stationId);
          setActivity(Array.isArray(rows) ? rows : []);
        }
        loadedTabsRef.current.add(dataKey);
      } catch (e) {
        setTabError((e as Error).message || t('stations.detail.tabError'));
      } finally {
        setTabLoading(false);
      }
    },
    [orgId, stationCaps.canViewActivity, stationId, t],
  );

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const metrics = useMemo(() => getStationCardDisplayMetrics(summary ?? undefined), [summary]);
  const warnings = useMemo(
    () => (summary ? getStationWarningsFromSummary(summary) : []),
    [summary],
  );

  const address = station ? formatStationAddress(station) : '';
  const hours = station ? parseOpeningHours(station.openingHours) : null;

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
      loadedTabsRef.current.delete('operations');
      await loadCore();
      if (activeTab === 'operations') void loadTabData('operations');
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

  const handleBack = () => {
    onBack();
  };

  if (permStatus === 'ready' && !capabilities.canRead) {
    return (
      <EmptyState
        icon={<MapPin className="w-8 h-8" />}
        title={t('stations.permissions.noAccessTitle')}
        description={t('stations.permissions.noAccessDescription')}
      />
    );
  }

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
        <button type="button" onClick={handleBack} className="mt-4 block mx-auto text-xs text-muted-foreground">
          ← {t('stations.detail.back')}
        </button>
      </div>
    );
  }

  if (!station) return null;

  const canEdit = stationCaps.canEditMasterData || stationCaps.canManageOperations;
  const openingTone = openingStatusTone(metrics.openingStatus);
  const capacityTone = capacityStatusTone(metrics.capacityStatus);

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {isReadOnly && (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {t('stations.permissions.readOnlyBanner')}
        </div>
      )}
      {station.status === 'ARCHIVED' && (
        <div className="rounded-xl border border-[color:var(--status-watch)]/35 bg-[color:var(--status-watch)]/[0.04] px-4 py-3 text-sm text-muted-foreground">
          {t('stations.detail.archivedBanner')}
        </div>
      )}
      <PageHeader
        variant="full"
        eyebrow={(
          <button type="button" onClick={handleBack} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
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
            {stationCaps.canManageHomeFleet && (
              <button type="button" onClick={() => setAssignOpen(true)} className="sq-press px-3 py-2 rounded-xl text-[10px] font-semibold border border-border surface-premium">
                {t('stations.action.assignVehicle')}
              </button>
            )}
            {stationCaps.canSetPrimary && !station.isPrimary && (
              <button type="button" onClick={() => void handleSetPrimary()} className="sq-press px-3 py-2 rounded-xl text-[10px] font-semibold border border-border surface-premium">
                {t('stations.action.setPrimary')}
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={() => setFormOpen(true)} className="sq-press px-3 py-2 rounded-xl text-[10px] font-semibold sq-tone-brand">
                {t('stations.action.edit')}
              </button>
            )}
          </div>
        )}
      />

      {warnings.length > 0 && (
        <div className="surface-premium p-3 flex flex-wrap gap-2 items-start">
          <AlertTriangle className="w-4 h-4 text-[color:var(--status-watch)] shrink-0 mt-0.5" />
          {warnings.map((w) => (
            <StatusChip key={w} tone="warning">{t(`stations.warning.${w}`)}</StatusChip>
          ))}
        </div>
      )}

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 min-w-max sq-tab-bar p-1" role="tablist" aria-label={t('stations.detail.tabList')}>
          {tabDescriptors.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => selectTab(tab.key)}
              className={`sq-tab px-3 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap ${
                activeTab === tab.key ? 'sq-tab--active' : ''
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {tabError ? (
        <div className="rounded-xl border border-[color:var(--status-watch)]/35 bg-[color:var(--status-watch)]/[0.04] px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>{tabError}</span>
          <button type="button" className="text-xs font-semibold underline" onClick={() => void loadTabData(activeTab)}>
            {t('stations.partialData.retry')}
          </button>
        </div>
      ) : null}

      {activeTab === 'overview' && (
        <OverviewTab
          station={station}
          metrics={metrics}
          openingTone={openingTone}
          capacityTone={capacityTone}
          hours={hours}
          mapCenter={mapCenter}
          summaryIncomplete={metrics.partialDataIncomplete}
          isDarkMode={isDarkMode}
          onOpenSchedule={() => selectTab('schedule')}
          t={t}
        />
      )}

      {activeTab === 'fleet' && (
        <FleetTab fleet={fleet} loading={tabLoading} t={t} />
      )}

      {activeTab === 'schedule' && (
        <ScheduleTab
          entries={timeline}
          loading={tabLoading}
          onOpenBooking={onOpenBooking}
          t={t}
        />
      )}

      {activeTab === 'operations' && (
        <OperationsTab
          station={station}
          hours={hours}
          operations={operations}
          loading={tabLoading}
          t={t}
        />
      )}

      {activeTab === 'team' && (
        <TeamTab team={team} loading={tabLoading} t={t} />
      )}

      {activeTab === 'activity' && stationCaps.canViewActivity && (
        <ActivityTab activity={activity} loading={tabLoading} t={t} />
      )}

      <StationFormModal
        open={formOpen}
        station={station}
        saving={saving}
        orgId={orgId}
        formCapabilities={formCapabilities(station, false)}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSave}
      />
      {stationCaps.canManageHomeFleet && (
        <StationAssignVehicleModal
          station={assignOpen ? station : null}
          onClose={() => setAssignOpen(false)}
          onSaved={() => {
            loadedTabsRef.current.delete('fleet');
            void loadCore();
            void loadTabData('fleet');
          }}
        />
      )}
    </div>
  );
}

function OverviewTab({
  station,
  metrics,
  openingTone,
  capacityTone,
  hours,
  mapCenter,
  summaryIncomplete,
  isDarkMode,
  onOpenSchedule,
  t,
}: {
  station: Station;
  metrics: ReturnType<typeof getStationCardDisplayMetrics>;
  openingTone: ReturnType<typeof openingStatusTone>;
  capacityTone: ReturnType<typeof capacityStatusTone>;
  hours: ReturnType<typeof parseOpeningHours> | null;
  mapCenter?: [number, number];
  summaryIncomplete: boolean;
  isDarkMode: boolean;
  onOpenSchedule: () => void;
  t: (k: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const formatMetric = (value: number | '—') => (value === '—' ? '—' : String(value));
  const openingLabel =
    metrics.openingStatusLabel ??
    (metrics.openingStatus
      ? t(`stations.openingStatus.${metrics.openingStatus}` as const)
      : t('stations.openingStatus.UNKNOWN'));
  const capacityLabel = metrics.capacityKnown && metrics.capacityStatus
    ? t(`stations.capacityStatus.${metrics.capacityStatus}` as const)
    : t('stations.card.capacityUnknown');

  return (
    <div className="space-y-4 animate-fade-up">
      {summaryIncomplete ? (
        <div className="rounded-xl border border-[color:var(--status-watch)]/35 bg-[color:var(--status-watch)]/[0.04] px-4 py-3 text-sm text-muted-foreground">
          {t('stations.partialData.banner')}
        </div>
      ) : null}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label={t('stations.card.homeFleet')} value={formatMetric(metrics.homeFleet)} icon={<Car className="w-4 h-4" />} />
        <MetricCard label={t('stations.card.onSite')} value={formatMetric(metrics.onSite)} icon={<MapPin className="w-4 h-4" />} />
        <MetricCard label={t('stations.card.pickups')} value={formatMetric(metrics.todayPickups)} icon={<Calendar className="w-4 h-4" />} />
        <MetricCard label={t('stations.card.returns')} value={formatMetric(metrics.todayReturns)} icon={<Calendar className="w-4 h-4" />} />
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusChip tone={openingTone}>
          <Clock className="mr-0.5 inline h-3 w-3" />
          {openingLabel}
        </StatusChip>
        <StatusChip tone={capacityTone}>{capacityLabel}</StatusChip>
        {metrics.operationalWarningCount > 0 ? (
          <StatusChip tone="watch">
            {t('stations.card.operationalWarnings', { count: metrics.operationalWarningCount })}
          </StatusChip>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="surface-premium p-4 space-y-3">
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
          <button type="button" onClick={onOpenSchedule} className="text-xs font-semibold text-[color:var(--brand)] hover:underline">
            {t('stations.detail.openSchedule')}
          </button>
        </div>

        <div className="surface-premium overflow-hidden min-h-[220px]">
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
    </div>
  );
}

function FleetTab({ fleet, loading, t }: { fleet: StationFleetVehicle[]; loading: boolean; t: (k: TranslationKey) => string }) {
  if (loading) return <SkeletonCard className="h-48 w-full" />;
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
    <div className="surface-premium overflow-hidden">
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

function ScheduleTab({
  entries,
  loading,
  onOpenBooking,
  t,
}: {
  entries: StationOperationsTimelineEntry[];
  loading: boolean;
  onOpenBooking?: (id: string) => void;
  t: (k: TranslationKey) => string;
}) {
  if (loading) return <SkeletonCard className="h-48 w-full" />;
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Calendar className="w-8 h-8" />}
        title={t('stations.detail.scheduleEmptyTitle')}
        description={t('stations.detail.scheduleEmptyDescription')}
      />
    );
  }

  return (
    <div className="surface-premium overflow-hidden">
      <ul className="divide-y divide-border">
        {entries.map((entry) => (
          <li key={entry.id} className="px-4 py-3 text-sm">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip tone={entry.ruleWarning ? 'watch' : 'neutral'}>
                    {t(`stations.timeline.type.${entry.type}` as TranslationKey)}
                  </StatusChip>
                  {entry.actionRequired ? (
                    <StatusChip tone="warning">{t('stations.detail.timelineActionRequired')}</StatusChip>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.stationLocalTime}
                  {entry.references.bookingLabel ? ` · ${entry.references.bookingLabel}` : ''}
                  {entry.references.vehicleLabel ? ` · ${entry.references.vehicleLabel}` : ''}
                </p>
              </div>
              {entry.references.bookingId && onOpenBooking ? (
                <button
                  type="button"
                  onClick={() => onOpenBooking(entry.references.bookingId!)}
                  className="text-xs font-semibold text-[color:var(--brand)] hover:underline shrink-0"
                >
                  {t('stations.action.openBooking')}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OperationsTab({
  station,
  hours,
  operations,
  loading,
  t,
}: {
  station: Station;
  hours: ReturnType<typeof parseOpeningHours> | null;
  operations: StationOperationsDto | null;
  loading: boolean;
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

  const blocks = [
    { title: t('stations.form.handoverInstructions'), text: station.handoverInstructions },
    { title: t('stations.form.returnInstructions'), text: station.returnInstructions },
    { title: t('stations.form.internalNotes'), text: station.internalNotes ?? station.notes },
  ];

  return (
    <div className="space-y-4">
      {loading && !operations ? <SkeletonCard className="h-32 w-full" /> : null}
      {operations ? (
        <div className="surface-premium p-4 space-y-3">
          <h3 className="text-sm font-semibold">{t('stations.detail.liveOperations')}</h3>
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="neutral">{operations.openingStatus.label}</StatusChip>
            <StatusChip tone="neutral">{operations.capacityStatus.label}</StatusChip>
            <StatusChip tone="neutral">{operations.pickupCapability.label}</StatusChip>
            <StatusChip tone="neutral">{operations.returnCapability.label}</StatusChip>
          </div>
          {operations.operationalWarnings.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {operations.operationalWarnings.map((warning) => (
                <StatusChip key={warning.code} tone={warning.severity === 'error' ? 'critical' : 'watch'}>
                  {warning.message}
                </StatusChip>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="surface-premium p-4 space-y-3">
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
        <div className="surface-premium p-4">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {blocks.map((b) => (
          <div key={b.title} className="surface-premium p-4">
            <h3 className="text-sm font-semibold mb-2">{b.title}</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{b.text?.trim() || '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamTab({
  team,
  loading,
  t,
}: {
  team: StationTeamDto | null;
  loading: boolean;
  t: (k: TranslationKey) => string;
}) {
  if (loading && !team) return <SkeletonCard className="h-48 w-full" />;
  if (!team || team.staff.length === 0) {
    return (
      <EmptyState
        icon={<Users className="w-8 h-8" />}
        title={t('stations.detail.teamEmptyTitle')}
        description={t('stations.detail.teamEmptyDescription')}
      />
    );
  }

  return (
    <div className="surface-premium overflow-hidden">
      <ul className="divide-y divide-border">
        {team.staff.map((member) => (
          <li key={member.id} className="px-4 py-3 text-sm flex items-center justify-between gap-2">
            <span className="font-medium">{member.name}</span>
            <span className="text-xs text-muted-foreground">{member.role ?? '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityTab({
  activity,
  loading,
  t,
}: {
  activity: StationActivityEntry[];
  loading: boolean;
  t: (k: TranslationKey) => string;
}) {
  if (loading) return <SkeletonCard className="h-48 w-full" />;
  if (activity.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="w-8 h-8" />}
        title={t('stations.detail.activityEmptyTitle')}
        description={t('stations.detail.activityEmptyDescription')}
      />
    );
  }
  return (
    <div className="surface-premium overflow-hidden">
      <ul className="divide-y divide-border">
        {activity.map((entry) => (
          <li key={entry.id} className="px-4 py-3 text-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div>
                <p className="font-medium">{entry.action}</p>
                {entry.description ? <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p> : null}
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {entry.userName ? `${entry.userName} · ` : ''}
                {new Date(entry.createdAt).toLocaleString()}
              </div>
            </div>
          </li>
        ))}
      </ul>
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
