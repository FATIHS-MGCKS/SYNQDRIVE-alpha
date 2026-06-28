import { Icon } from '../ui/Icon';
import { SUMMARY_COPY, TIMELINE_COPY, tv } from './trips-view-ui';
import type { TripsPeriodSummary } from './utils/tripSummary';
import { formatSelectedPeriodHeaderDate } from './utils/tripSummary';
import { formatTripDistance, formatTripDuration } from './utils/tripFormatters';

export interface TripsOverviewCardProps {
  selectedDate?: string;
  tripCount: number;
  summary: TripsPeriodSummary;
  loading?: boolean;
  syncing?: boolean;
  onRefresh?: () => void;
  onCheckMissing?: () => void;
  disabled?: boolean;
}

function KpiTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'default' | 'watch' | 'critical' | 'muted';
}) {
  const accentClass =
    accent === 'watch'
      ? 'text-amber-600 dark:text-amber-400'
      : accent === 'critical'
        ? 'text-red-600 dark:text-red-400'
        : accent === 'muted'
          ? 'text-muted-foreground'
          : 'text-foreground';

  return (
    <div className="trips-kpi-tile min-w-0">
      <p className="trips-kpi-tile__label">{label}</p>
      <p className={`trips-kpi-tile__value tabular-nums ${accentClass}`}>{value}</p>
      {hint && <p className="trips-kpi-tile__hint">{hint}</p>}
    </div>
  );
}

export function TripsOverviewCard({
  selectedDate,
  tripCount,
  summary,
  loading,
  syncing,
  onRefresh,
  onCheckMissing,
  disabled,
}: TripsOverviewCardProps) {
  const periodDate = formatSelectedPeriodHeaderDate(selectedDate);
  const busy = loading || syncing;
  const showKpis = summary.tripCount > 0 || (loading && tripCount === 0);

  return (
    <section
      className={`${tv.panel} mb-3 sm:mb-4`}
      aria-label={SUMMARY_COPY.ariaLabel}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="font-display text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-foreground sm:text-[24px] lg:text-[26px]">
              {SUMMARY_COPY.title}
            </h2>
            <span className="shrink-0 text-[12px] font-medium leading-snug text-muted-foreground sm:text-[13px]">
              {periodDate}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onCheckMissing && (
            <button
              type="button"
              onClick={onCheckMissing}
              disabled={disabled || busy}
              className={`${tv.actionBtn} ${tv.focusRing}`}
            >
              <Icon name="search" className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{TIMELINE_COPY.checkMissingTrips}</span>
              <span className="sm:hidden">{TIMELINE_COPY.checkMissingShort}</span>
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={disabled || busy}
              className={`${tv.actionBtnPrimary} ${tv.focusRing}`}
            >
              <Icon name="refresh-cw" className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {TIMELINE_COPY.refreshTimeline}
            </button>
          )}
        </div>
      </div>

      {showKpis && (
        <div
          className={`mt-3 border-t border-border/50 pt-3 ${
            loading && summary.tripCount === 0 ? 'animate-pulse' : ''
          }`}
        >
          {loading && summary.tripCount === 0 ? (
            <div className="h-[52px] rounded-xl bg-muted/40" />
          ) : (
            <div className="flex flex-wrap items-stretch gap-x-0 gap-y-2">
              <KpiTile
                label={SUMMARY_COPY.trips}
                value={String(summary.tripCount)}
                hint={summary.ongoingCount > 0 ? `${summary.ongoingCount} aktiv` : undefined}
              />
              <KpiTile label={SUMMARY_COPY.distance} value={formatTripDistance(summary.totalKm)} />
              <KpiTile label={SUMMARY_COPY.duration} value={formatTripDuration(summary.totalMinutes)} />
              <KpiTile
                label={SUMMARY_COPY.notable}
                value={String(summary.notableEvents)}
                accent={summary.notableEvents > 0 ? 'watch' : 'muted'}
              />
              <KpiTile
                label={SUMMARY_COPY.private}
                value={String(summary.privateCount)}
                accent={summary.privateCount > 0 ? 'default' : 'muted'}
              />
              {summary.unlinkedCount > 0 && (
                <KpiTile
                  label={SUMMARY_COPY.unlinked}
                  value={String(summary.unlinkedCount)}
                  accent="watch"
                />
              )}
            </div>
          )}
        </div>
      )}

      {summary.notableEvents > 0 && !loading && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-snug text-amber-700/90 dark:text-amber-400/90">
          <Icon name="alert-triangle" className="mt-px h-3 w-3 shrink-0" />
          {SUMMARY_COPY.notableHint(summary.notableEvents)}
        </p>
      )}
    </section>
  );
}
