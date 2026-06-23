import { Icon } from '../ui/Icon';
import { SUMMARY_COPY } from './trips-view-ui';
import type { TripsPeriodSummary } from './utils/tripSummary';
import { formatTripDistance, formatTripDuration } from './utils/tripFormatters';

interface TripsSummaryBarProps {
  summary: TripsPeriodSummary;
  loading?: boolean;
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
    <div className="trips-kpi-tile min-w-0 flex-1">
      <p className="trips-kpi-tile__label">{label}</p>
      <p className={`trips-kpi-tile__value tabular-nums ${accentClass}`}>{value}</p>
      {hint && <p className="trips-kpi-tile__hint">{hint}</p>}
    </div>
  );
}

export function TripsSummaryBar({ summary, loading }: TripsSummaryBarProps) {
  if (loading && summary.tripCount === 0) {
    return (
      <div className="trips-summary-bar mb-4 sm:mb-5 animate-pulse">
        <div className="h-[72px] rounded-2xl bg-muted/40 border border-border/40" />
      </div>
    );
  }

  if (summary.tripCount === 0) return null;

  const dataQualityLabel =
    summary.limitedDataCount > 0
      ? `${summary.limitedDataCount} eingeschränkt`
      : 'Gut';

  return (
    <section className="trips-summary-bar mb-4 sm:mb-5" aria-label={SUMMARY_COPY.ariaLabel}>
      <div className="trips-summary-bar__inner">
        <KpiTile
          label={SUMMARY_COPY.trips}
          value={String(summary.tripCount)}
          hint={summary.ongoingCount > 0 ? `${summary.ongoingCount} aktiv` : undefined}
        />
        <div className="trips-summary-bar__divider hidden sm:block" aria-hidden />
        <KpiTile
          label={SUMMARY_COPY.distance}
          value={formatTripDistance(summary.totalKm)}
        />
        <div className="trips-summary-bar__divider hidden sm:block" aria-hidden />
        <KpiTile
          label={SUMMARY_COPY.duration}
          value={formatTripDuration(summary.totalMinutes)}
        />
        <div className="trips-summary-bar__divider hidden md:block" aria-hidden />
        <KpiTile
          label={SUMMARY_COPY.notable}
          value={String(summary.notableEvents)}
          accent={summary.notableEvents > 0 ? 'watch' : 'muted'}
        />
        <div className="trips-summary-bar__divider hidden lg:block" aria-hidden />
        <KpiTile
          label={SUMMARY_COPY.private}
          value={String(summary.privateCount)}
          accent={summary.privateCount > 0 ? 'default' : 'muted'}
        />
        {summary.unlinkedCount > 0 && (
          <>
            <div className="trips-summary-bar__divider hidden lg:block" aria-hidden />
            <KpiTile
              label={SUMMARY_COPY.unlinked}
              value={String(summary.unlinkedCount)}
              accent="watch"
            />
          </>
        )}
        <div className="trips-summary-bar__divider hidden xl:block" aria-hidden />
        <KpiTile
          label={SUMMARY_COPY.dataQuality}
          value={dataQualityLabel}
          accent={summary.limitedDataCount > 0 ? 'watch' : 'default'}
        />
      </div>
      {summary.notableEvents > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-700/90 dark:text-amber-400/90">
          <Icon name="alert-triangle" className="w-3 h-3 shrink-0" />
          {SUMMARY_COPY.notableHint(summary.notableEvents)}
        </p>
      )}
    </section>
  );
}
