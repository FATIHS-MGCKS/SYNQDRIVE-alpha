import { useCallback, useEffect, useMemo, useState } from 'react';
import { Car, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  api,
  type StationFleetGroupKey,
  type StationFleetReadModel,
  type StationFleetVehicleRow,
} from '../../../lib/api';
import { StatusChip } from '../../../components/patterns';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  STATION_FLEET_GROUP_ORDER,
  fleetHasAnyVehicles,
  formatFleetConfirmationAt,
  formatFleetStationRef,
  mergeFleetGroupPage,
} from '../../lib/station-fleet-read-model.utils';
import { resolveStationTabFetchState } from '../../lib/station-view-state';
import { StationFetchStateBoundary } from './StationViewStateBoundary';
import { cn } from '../../../components/ui/utils';

interface StationFleetTabProps {
  stationId: string;
  onOpenVehicle?: (vehicleId: string) => void;
}

export function StationFleetTab({ stationId, onOpenVehicle }: StationFleetTabProps) {
  const { orgId } = useRentalOrg();
  const { t, locale } = useLanguage();
  const [model, setModel] = useState<StationFleetReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<StationFleetGroupKey | 'all'>('all');

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const loadFleet = useCallback(
    async (options?: {
      group?: StationFleetGroupKey;
      page?: number;
      mergeGroup?: StationFleetGroupKey;
    }) => {
      if (!orgId) return;
      setLoading(true);
      setError(null);
      try {
        const activeGroup =
          options?.group ?? (groupFilter === 'all' ? undefined : groupFilter);
        const result = await api.stations.fleet(orgId, stationId, {
          search: search || undefined,
          group: activeGroup,
          page: options?.page ?? 1,
          pageSize: 10,
        });
        setModel((current) =>
          options?.mergeGroup
            ? mergeFleetGroupPage(current, result, options.mergeGroup)
            : result,
        );
      } catch (e) {
        setError(e);
        if (!options?.mergeGroup) setModel(null);
      } finally {
        setLoading(false);
      }
    },
    [groupFilter, orgId, search, stationId, t],
  );

  useEffect(() => {
    void loadFleet();
  }, [loadFleet]);

  const visibleGroups = useMemo(() => {
    if (!model) return [];
    if (groupFilter === 'all') return model.groups;
    return model.groups.filter((group) => group.key === groupFilter);
  }, [groupFilter, model]);

  const handleGroupPageChange = async (group: StationFleetGroupKey, page: number) => {
    await loadFleet({ group, page, mergeGroup: group });
  };

  const fetchResolution = useMemo(
    () =>
      resolveStationTabFetchState({
        loading,
        error,
        itemCount: model && fleetHasAnyVehicles(model) ? 1 : 0,
        fallbackMessage: t('stations.detail.fleetError'),
      }),
    [error, loading, model, t],
  );

  const blockingFetch =
    fetchResolution.kind === 'loading' ||
    fetchResolution.kind === 'permission_denied' ||
    fetchResolution.kind === 'not_found' ||
    fetchResolution.kind === 'api_error';

  if (blockingFetch) {
    return (
      <StationFetchStateBoundary
        resolution={fetchResolution}
        onRetry={() => void loadFleet()}
        loadingSkeleton="card"
        emptyIcon={<Car className="w-8 h-8" />}
        emptyTitleKey="stations.detail.fleetEmptyTitle"
        emptyDescriptionKey="stations.detail.fleetEmptyDescription"
      >
        {null}
      </StationFetchStateBoundary>
    );
  }

  const emptyTitleKey = search
    ? 'stations.detail.fleetSearchEmptyTitle'
    : 'stations.detail.fleetEmptyTitle';
  const emptyDescriptionKey = search
    ? 'stations.detail.fleetSearchEmptyDescription'
    : 'stations.detail.fleetEmptyDescription';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('stations.detail.fleetSearchPlaceholder')}
            aria-label={t('stations.a11y.searchFleet')}
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={groupFilter === 'all'}
            label={t('stations.detail.fleetFilterAll')}
            onClick={() => setGroupFilter('all')}
          />
          {STATION_FLEET_GROUP_ORDER.map((key) => (
            <FilterChip
              key={key}
              active={groupFilter === key}
              label={t(`stations.detail.fleetGroup.${key}` as TranslationKey)}
              count={model?.groups.find((group) => group.key === key)?.total}
              onClick={() => setGroupFilter(key)}
            />
          ))}
        </div>
      </div>

      {error && model ? (
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.04] px-4 py-3 text-sm text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
        >
          <span>{error instanceof Error ? error.message : t('stations.detail.fleetError')}</span>
          <button type="button" className="text-xs font-semibold underline shrink-0" onClick={() => void loadFleet()}>
            {t('stations.partialData.retry')}
          </button>
        </div>
      ) : null}

      <StationFetchStateBoundary
        resolution={fetchResolution}
        onRetry={() => void loadFleet()}
        emptyIcon={<Car className="w-8 h-8" />}
        emptyTitleKey={emptyTitleKey}
        emptyDescriptionKey={emptyDescriptionKey}
      >
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <FleetGroupSection
              key={group.key}
              group={group}
              locale={locale}
              loading={loading}
              t={t}
              onOpenVehicle={onOpenVehicle}
              onPageChange={(page) => void handleGroupPageChange(group.key, page)}
            />
          ))}
        </div>
      </StationFetchStateBoundary>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
        active
          ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/10 text-[color:var(--brand)]'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {count != null ? ` (${count})` : ''}
    </button>
  );
}

function FleetGroupSection({
  group,
  locale,
  loading,
  t,
  onOpenVehicle,
  onPageChange,
}: {
  group: StationFleetReadModel['groups'][number];
  locale: string;
  loading: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onOpenVehicle?: (vehicleId: string) => void;
  onPageChange: (page: number) => void;
}) {
  if (group.total === 0) return null;

  return (
    <section className="surface-premium overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">
          {t(`stations.detail.fleetGroup.${group.key}` as TranslationKey)}
          <span className="ml-2 text-xs font-normal text-muted-foreground">({group.total})</span>
        </h3>
        {group.pagination.totalPages > 1 ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button
              type="button"
              disabled={group.pagination.page <= 1 || loading}
              onClick={() => onPageChange(group.pagination.page - 1)}
              className="rounded-md border border-border p-1 disabled:opacity-40"
              aria-label={t('stations.detail.fleetPrevPage')}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span>
              {group.pagination.page}/{group.pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={group.pagination.page >= group.pagination.totalPages || loading}
              onClick={() => onPageChange(group.pagination.page + 1)}
              className="rounded-md border border-border p-1 disabled:opacity-40"
              aria-label={t('stations.detail.fleetNextPage')}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="p-3 font-semibold">{t('stations.detail.col.plate')}</th>
              <th className="p-3 font-semibold">{t('stations.detail.col.vehicle')}</th>
              <th className="p-3 font-semibold">{t('stations.detail.fleetRuntimeState')}</th>
              <th className="p-3 font-semibold">{t('stations.detail.fleetHomeStation')}</th>
              <th className="p-3 font-semibold">{t('stations.detail.fleetCurrentStation')}</th>
              <th className="p-3 font-semibold">{t('stations.detail.fleetExpectedStation')}</th>
              <th className="p-3 font-semibold">{t('stations.detail.fleetPositionSource')}</th>
              <th className="p-3 font-semibold">{t('stations.detail.fleetLastConfirmation')}</th>
              <th className="p-3 font-semibold">{t('stations.detail.fleetNextAction')}</th>
            </tr>
          </thead>
          <tbody>
            {group.vehicles.map((vehicle) => (
              <FleetVehicleDesktopRow
                key={vehicle.id}
                vehicle={vehicle}
                locale={locale}
                t={t}
                onOpenVehicle={onOpenVehicle}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-border">
        {group.vehicles.map((vehicle) => (
          <FleetVehicleMobileCard
            key={vehicle.id}
            vehicle={vehicle}
            locale={locale}
            t={t}
            onOpenVehicle={onOpenVehicle}
          />
        ))}
      </div>
    </section>
  );
}

function formatRuntimeLabel(
  vehicle: StationFleetVehicleRow,
  t: (key: TranslationKey) => string,
): string {
  const key = `stations.detail.fleetRuntime.${vehicle.runtimeState}` as TranslationKey;
  const translated = t(key);
  return translated === key ? vehicle.runtimeStateLabel : translated;
}

function FleetVehicleDesktopRow({
  vehicle,
  locale,
  t,
  onOpenVehicle,
}: {
  vehicle: StationFleetVehicleRow;
  locale: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onOpenVehicle?: (vehicleId: string) => void;
}) {
  const vehicleLabel = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vehicleName || '—';
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="p-3 font-mono text-xs">{vehicle.licensePlate ?? '—'}</td>
      <td className="p-3">{vehicleLabel}</td>
      <td className="p-3">
        <StatusChip tone={runtimeTone(vehicle.runtimeState)}>
          {formatRuntimeLabel(vehicle, t)}
        </StatusChip>
      </td>
      <td className="p-3 text-xs max-w-[180px] truncate" title={formatFleetStationRef(vehicle.homeStation)}>{formatFleetStationRef(vehicle.homeStation)}</td>
      <td className="p-3 text-xs max-w-[180px] truncate" title={formatFleetStationRef(vehicle.currentStation)}>{formatFleetStationRef(vehicle.currentStation)}</td>
      <td className="p-3 text-xs">{formatFleetStationRef(vehicle.expectedStation)}</td>
      <td className="p-3 text-xs">
        {vehicle.positionSource
          ? t(`stations.detail.fleetPositionSourceValue.${vehicle.positionSource}` as TranslationKey)
          : '—'}
      </td>
      <td className="p-3 text-xs">{formatFleetConfirmationAt(vehicle.lastConfirmationAt, locale)}</td>
      <td className="p-3">
        {vehicle.nextAction ? (
          <button
            type="button"
            onClick={() => onOpenVehicle?.(vehicle.id)}
            className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
          >
            {t(`stations.detail.fleetNextActionCode.${vehicle.nextAction.code}` as TranslationKey)}
          </button>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

function FleetVehicleMobileCard({
  vehicle,
  locale,
  t,
  onOpenVehicle,
}: {
  vehicle: StationFleetVehicleRow;
  locale: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onOpenVehicle?: (vehicleId: string) => void;
}) {
  const vehicleLabel = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vehicleName || '—';
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xs font-semibold">{vehicle.licensePlate ?? '—'}</div>
          <div className="text-sm">{vehicleLabel}</div>
        </div>
        <StatusChip tone={runtimeTone(vehicle.runtimeState)}>
          {formatRuntimeLabel(vehicle, t)}
        </StatusChip>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Field label={t('stations.detail.fleetHomeStation')} value={formatFleetStationRef(vehicle.homeStation)} />
        <Field label={t('stations.detail.fleetCurrentStation')} value={formatFleetStationRef(vehicle.currentStation)} />
        <Field label={t('stations.detail.fleetExpectedStation')} value={formatFleetStationRef(vehicle.expectedStation)} />
        <Field
          label={t('stations.detail.fleetPositionSource')}
          value={
            vehicle.positionSource
              ? t(`stations.detail.fleetPositionSourceValue.${vehicle.positionSource}` as TranslationKey)
              : '—'
          }
        />
        <Field
          label={t('stations.detail.fleetLastConfirmation')}
          value={formatFleetConfirmationAt(vehicle.lastConfirmationAt, locale)}
        />
      </dl>
      {vehicle.nextAction ? (
        <button
          type="button"
          onClick={() => onOpenVehicle?.(vehicle.id)}
          className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
        >
          {t(`stations.detail.fleetNextActionCode.${vehicle.nextAction.code}` as TranslationKey)}
        </button>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium truncate" title={value}>{value}</dd>
    </div>
  );
}

function runtimeTone(status: string): 'success' | 'watch' | 'critical' | 'neutral' | 'info' {
  if (status === 'AVAILABLE') return 'success';
  if (status === 'RENTED' || status === 'RESERVED') return 'info';
  if (status === 'IN_SERVICE' || status === 'OUT_OF_SERVICE') return 'watch';
  return 'neutral';
}
