import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Car,
  Clock,
  MapPin,
  Star,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  type Station,
  type StationActivityEntry,
  type StationOperationsDto,
  type StationOperationsTimelineEntry,
  type StationSummaryReadModel,
  type StationTeamDto,
} from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useStationsV2Permissions } from '../../hooks/useStationsV2Permissions';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  PageHeader,
  StatusChip,
  EmptyState,
} from '../../../components/patterns';
import {
  formatStationAddress,
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
import {
  extractStationPartialData,
  resolveStationContextBanners,
  resolveStationFetchState,
  resolveStationTabFetchState,
} from '../../lib/station-view-state';
import { StationContextBanners, StationFetchStateBoundary } from './StationViewStateBoundary';
import { StationFormModal } from './StationFormModal';
import { StationVehicleWorkflowMenu } from './StationVehicleWorkflowMenu';
import { StationOverviewTab } from './StationOverviewTab';
import { StationFleetTab } from './StationFleetTab';

interface StationDetailViewProps {
  stationId: string;
  initialStation?: Station | null;
  initialTab?: StationDetailTab;
  onBack: () => void;
  onTabChange?: (tab: StationDetailTab) => void;
  onOpenBooking?: (bookingId: string) => void;
  onOpenVehicle?: (vehicleId: string) => void;
  isDarkMode?: boolean;
}

export function StationDetailView({
  stationId,
  initialStation,
  initialTab = 'overview',
  onBack,
  onTabChange,
  onOpenBooking,
  onOpenVehicle,
  isDarkMode: _isDarkMode = false,
}: StationDetailViewProps) {
  const { orgId } = useRentalOrg();
  const { t } = useLanguage();
  const { status: permStatus, capabilities, forStation, formCapabilities, isReadOnly } = useStationsV2Permissions();

  const [station, setStation] = useState<Station | null>(initialStation ?? null);
  const [summary, setSummary] = useState<StationSummaryReadModel | null>(null);
  const [team, setTeam] = useState<StationTeamDto | null>(null);
  const [timeline, setTimeline] = useState<StationOperationsTimelineEntry[]>([]);
  const [operations, setOperations] = useState<StationOperationsDto | null>(null);
  const [activity, setActivity] = useState<StationActivityEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [summaryError, setSummaryError] = useState<unknown | null>(null);
  const [tabError, setTabError] = useState<unknown | null>(null);
  const [activeTab, setActiveTab] = useState<StationDetailTab>(initialTab);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);

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
    setSummaryError(null);
    loadedTabsRef.current = new Set();
    setTimeline([]);
    setOperations(null);
    setActivity([]);
    setTeam(null);

    try {
      const stationResult = await api.stations.get(orgId, stationId);
      setStation(stationResult);
    } catch (e) {
      setStation(null);
      setSummary(null);
      setError(e);
      setLoading(false);
      return;
    }

    try {
      const summaryResult = await api.stations.summary(orgId, stationId);
      setSummary(summaryResult);
    } catch (e) {
      setSummary(null);
      setSummaryError(e);
    } finally {
      setLoading(false);
    }
  }, [orgId, stationId]);

  const loadTabData = useCallback(
    async (tab: StationDetailTab) => {
      if (!orgId) return;
      const dataKey = tabRequiresDataLoad(tab);
      if (!dataKey) return;
      if (loadedTabsRef.current.has(dataKey)) return;

      setTabLoading(true);
      setTabError(null);
      try {
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
        setTabError(e);
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

  const warnings = useMemo(
    () => (summary ? getStationWarningsFromSummary(summary) : []),
    [summary],
  );

  const address = station ? formatStationAddress(station) : '';
  const hours = station ? parseOpeningHours(station.openingHours) : null;

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

  const handleActivate = async () => {
    if (!orgId || !station || !stationCaps.canActivate) return;
    setLifecycleLoading(true);
    try {
      const updated = await api.stations.activate(orgId, station.id);
      setStation(updated);
      toast.success(t('stations.form.activated'));
      await loadCore();
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!orgId || !station || !stationCaps.canDeactivate) return;
    setLifecycleLoading(true);
    try {
      const updated = await api.stations.deactivate(orgId, station.id);
      setStation(updated);
      toast.success(t('stations.form.deactivated'));
      setFormOpen(false);
      await loadCore();
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    } finally {
      setLifecycleLoading(false);
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

  const coreFetchResolution = useMemo(
    () =>
      resolveStationFetchState({
        loading,
        error,
        hasData: !!station,
        permissionDenied: permStatus === 'ready' && !capabilities.canRead,
        fallbackMessage: t('stations.errorLoad'),
      }),
    [capabilities.canRead, error, loading, permStatus, station, t],
  );

  const contextBanners = useMemo(
    () =>
      resolveStationContextBanners({
        station,
        summary,
        partialData: extractStationPartialData(summary?.partialData),
        evaluatedAt: summary?.lastCalculatedAt,
      }),
    [station, summary],
  );

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

  if (
    coreFetchResolution.kind === 'loading' ||
    coreFetchResolution.kind === 'permission_denied' ||
    coreFetchResolution.kind === 'not_found' ||
    coreFetchResolution.kind === 'api_error'
  ) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-4">
        <StationFetchStateBoundary
          resolution={coreFetchResolution}
          onRetry={() => void loadCore()}
          loadingSkeleton="metrics"
          emptyTitleKey="stations.empty.title"
          emptyDescriptionKey="stations.empty.description"
        >
          {null}
        </StationFetchStateBoundary>
        {coreFetchResolution.kind === 'api_error' || coreFetchResolution.kind === 'not_found' ? (
          <button type="button" onClick={handleBack} className="block mx-auto text-xs text-muted-foreground">
            ← {t('stations.detail.back')}
          </button>
        ) : null}
      </div>
    );
  }

  if (!station) return null;

  const canEdit = stationCaps.canEditMasterData || stationCaps.canManageOperations;

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {isReadOnly && (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {t('stations.permissions.readOnlyBanner')}
        </div>
      )}
      <StationContextBanners banners={contextBanners} onRetry={() => void loadCore()} />
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
            {(stationCaps.canManageHomeFleet || stationCaps.canManageCurrentLocation || stationCaps.canManageTransfers) && (
              <StationVehicleWorkflowMenu
                station={station}
                onSaved={() => {
                  void loadCore();
                }}
              />
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

      {activeTab === 'overview' && (
        <StationOverviewTab
          station={station}
          summary={summary}
          summaryLoading={loading && !summary}
          summaryError={summaryError}
          onNavigateTab={selectTab}
          onRetrySummary={() => void loadCore()}
        />
      )}

      {activeTab === 'fleet' && (
        <StationFleetTab stationId={stationId} onOpenVehicle={onOpenVehicle} />
      )}

      {activeTab === 'schedule' && (
        <ScheduleTab
          entries={timeline}
          loading={tabLoading}
          error={tabError}
          onOpenBooking={onOpenBooking}
          onRetry={() => void loadTabData('schedule')}
          t={t}
        />
      )}

      {activeTab === 'operations' && (
        <OperationsTab
          station={station}
          hours={hours}
          operations={operations}
          loading={tabLoading}
          error={tabError}
          onRetry={() => void loadTabData('operations')}
          t={t}
        />
      )}

      {activeTab === 'team' && (
        <TeamTab
          team={team}
          loading={tabLoading}
          error={tabError}
          onRetry={() => void loadTabData('team')}
          t={t}
        />
      )}

      {activeTab === 'activity' && stationCaps.canViewActivity && (
        <ActivityTab
          activity={activity}
          loading={tabLoading}
          error={tabError}
          onRetry={() => void loadTabData('activity')}
          t={t}
        />
      )}

      <StationFormModal
        open={formOpen}
        station={station}
        saving={saving}
        lifecycleLoading={lifecycleLoading}
        orgId={orgId}
        formCapabilities={formCapabilities(station, false)}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSave}
        onActivate={() => handleActivate()}
        onDeactivate={() => handleDeactivate()}
      />
    </div>
  );
}



function ScheduleTab({
  entries,
  loading,
  error,
  onOpenBooking,
  onRetry,
  t,
}: {
  entries: StationOperationsTimelineEntry[];
  loading: boolean;
  error: unknown | null;
  onOpenBooking?: (id: string) => void;
  onRetry?: () => void;
  t: (k: TranslationKey) => string;
}) {
  const resolution = resolveStationTabFetchState({
    loading,
    error,
    itemCount: entries.length,
    fallbackMessage: t('stations.detail.tabError'),
  });

  return (
    <StationFetchStateBoundary
      resolution={resolution}
      onRetry={onRetry}
      emptyIcon={<Calendar className="w-8 h-8" />}
      emptyTitleKey="stations.detail.scheduleEmptyTitle"
      emptyDescriptionKey="stations.detail.scheduleEmptyDescription"
    >
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
    </StationFetchStateBoundary>
  );
}

function OperationsTab({
  station,
  hours,
  operations,
  loading,
  error,
  onRetry,
  t,
}: {
  station: Station;
  hours: ReturnType<typeof parseOpeningHours> | null;
  operations: StationOperationsDto | null;
  loading: boolean;
  error: unknown | null;
  onRetry?: () => void;
  t: (k: TranslationKey) => string;
}) {
  const liveOpsResolution = resolveStationFetchState({
    loading: loading && !operations,
    error,
    hasData: !!operations,
    fallbackMessage: t('stations.detail.tabError'),
  });

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
      <StationFetchStateBoundary
        resolution={liveOpsResolution}
        onRetry={onRetry}
        loadingSkeleton="card"
        emptyTitleKey="stations.detail.operationsEmptyTitle"
        emptyDescriptionKey="stations.detail.operationsEmptyDescription"
      >
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
        ) : (
          <div />
        )}
      </StationFetchStateBoundary>

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
  error,
  onRetry,
  t,
}: {
  team: StationTeamDto | null;
  loading: boolean;
  error: unknown | null;
  onRetry?: () => void;
  t: (k: TranslationKey) => string;
}) {
  const resolution = resolveStationTabFetchState({
    loading,
    error,
    itemCount: team?.staff.length ?? 0,
    fallbackMessage: t('stations.detail.tabError'),
  });

  return (
    <StationFetchStateBoundary
      resolution={resolution}
      onRetry={onRetry}
      emptyIcon={<Users className="w-8 h-8" />}
      emptyTitleKey="stations.detail.teamEmptyTitle"
      emptyDescriptionKey="stations.detail.teamEmptyDescription"
    >
    <div className="surface-premium overflow-hidden">
      <ul className="divide-y divide-border">
        {team?.staff.map((member) => (
          <li key={member.id} className="px-4 py-3 text-sm flex items-center justify-between gap-2">
            <span className="font-medium">{member.name}</span>
            <span className="text-xs text-muted-foreground">{member.role ?? '—'}</span>
          </li>
        ))}
      </ul>
    </div>
    </StationFetchStateBoundary>
  );
}

function ActivityTab({
  activity,
  loading,
  error,
  onRetry,
  t,
}: {
  activity: StationActivityEntry[];
  loading: boolean;
  error: unknown | null;
  onRetry?: () => void;
  t: (k: TranslationKey) => string;
}) {
  const resolution = resolveStationTabFetchState({
    loading,
    error,
    itemCount: activity.length,
    fallbackMessage: t('stations.detail.tabError'),
  });

  return (
    <StationFetchStateBoundary
      resolution={resolution}
      onRetry={onRetry}
      emptyIcon={<Clock className="w-8 h-8" />}
      emptyTitleKey="stations.detail.activityEmptyTitle"
      emptyDescriptionKey="stations.detail.activityEmptyDescription"
    >
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
    </StationFetchStateBoundary>
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
