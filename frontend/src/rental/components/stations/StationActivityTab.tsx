import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock, Filter, Search } from 'lucide-react';
import {
  api,
  type StationActivityEntry,
  type StationActivityQueryParams,
} from '../../../lib/api';
import { StatusChip } from '../../../components/patterns';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { resolveStationTabFetchState } from '../../lib/station-view-state';
import { StationFetchStateBoundary } from './StationViewStateBoundary';

interface StationActivityTabProps {
  stationId: string;
}

export function StationActivityTab({ stationId }: StationActivityTabProps) {
  const { orgId } = useRentalOrg();
  const { t, locale } = useLanguage();
  const [entries, setEntries] = useState<StationActivityEntry[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const loadActivity = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const params: StationActivityQueryParams = {
        search: search || undefined,
        action: actionFilter || undefined,
        limit: 50,
      };
      const model = await api.stations.activity(orgId, stationId, params);
      setEntries(model.entries ?? []);
      setAvailableActions(model.filters?.actions ?? []);
    } catch (e) {
      setError(e);
      setEntries([]);
      setAvailableActions([]);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, orgId, search, stationId]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const resolution = useMemo(
    () =>
      resolveStationTabFetchState({
        loading,
        error,
        itemCount: entries.length,
        fallbackMessage: t('stations.detail.activityError'),
      }),
    [entries.length, error, loading, t],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t('stations.detail.activityTitle')}</h3>
          <p className="text-xs text-muted-foreground mt-1">{t('stations.detail.activityDescription')}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <label className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('stations.detail.activitySearchPlaceholder')}
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </label>
          <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden />
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="bg-transparent outline-none min-w-[120px]"
            >
              <option value="">{t('stations.detail.activityFilterAllActions')}</option>
              {availableActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <StationFetchStateBoundary
        resolution={resolution}
        onRetry={() => void loadActivity()}
        emptyIcon={<Clock className="w-8 h-8" />}
        emptyTitleKey="stations.detail.activityEmptyTitle"
        emptyDescriptionKey="stations.detail.activityEmptyDescription"
      >
        <div className="surface-premium overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3 font-semibold">{t('stations.detail.activityActor')}</th>
                  <th className="p-3 font-semibold">{t('stations.detail.activityAction')}</th>
                  <th className="p-3 font-semibold">{t('stations.detail.activityChange')}</th>
                  <th className="p-3 font-semibold">{t('stations.detail.activityWhen')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <ActivityDesktopRow key={entry.id} entry={entry} locale={locale} t={t} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-border">
            {entries.map((entry) => (
              <ActivityMobileCard key={entry.id} entry={entry} locale={locale} t={t} />
            ))}
          </div>
        </div>
      </StationFetchStateBoundary>
    </div>
  );
}

function ActivityDesktopRow({
  entry,
  locale,
  t,
}: {
  entry: StationActivityEntry;
  locale: string;
  t: (key: TranslationKey) => string;
}) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="p-3 font-medium">{entry.actor.displayName}</td>
      <td className="p-3">
        <StatusChip tone="neutral">{entry.actionLabel}</StatusChip>
      </td>
      <td className="p-3 text-xs text-muted-foreground">
        <ActivityChange entry={entry} t={t} />
      </td>
      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
        {formatActivityTimestamp(entry.createdAt, locale)}
      </td>
    </tr>
  );
}

function ActivityMobileCard({
  entry,
  locale,
  t,
}: {
  entry: StationActivityEntry;
  locale: string;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{entry.actor.displayName}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatActivityTimestamp(entry.createdAt, locale)}
          </div>
        </div>
        <StatusChip tone="neutral">{entry.actionLabel}</StatusChip>
      </div>
      <ActivityChange entry={entry} t={t} />
      {entry.description ? (
        <p className="text-xs text-muted-foreground">{entry.description}</p>
      ) : null}
    </div>
  );
}

function ActivityChange({
  entry,
  t,
}: {
  entry: StationActivityEntry;
  t: (key: TranslationKey) => string;
}) {
  if (entry.fromLabel || entry.toLabel) {
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        <span>{entry.fromLabel ?? '—'}</span>
        <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
        <span>{entry.toLabel ?? '—'}</span>
      </span>
    );
  }

  if (entry.changeSummary) {
    return <span>{entry.changeSummary}</span>;
  }

  return <span>{entry.description ?? t('stations.detail.activityNoDetails')}</span>;
}

function formatActivityTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
