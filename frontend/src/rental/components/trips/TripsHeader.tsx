import { Icon } from '../ui/Icon';
import { SUMMARY_COPY, TIMELINE_COPY, tv } from './trips-view-ui';
import { formatSelectedPeriodLabel } from './utils/tripSummary';

interface TripsHeaderProps {
  selectedDate?: string;
  tripCount: number;
  notableEvents: number;
  loading?: boolean;
  syncing?: boolean;
  onRefresh?: () => void;
  onCheckMissing?: () => void;
  disabled?: boolean;
}

export function TripsHeader({
  selectedDate,
  tripCount,
  notableEvents,
  loading,
  syncing,
  onRefresh,
  onCheckMissing,
  disabled,
}: TripsHeaderProps) {
  const period = formatSelectedPeriodLabel(selectedDate);
  const busy = loading || syncing;

  return (
    <header className="mb-4 sm:mb-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {SUMMARY_COPY.eyebrow}
          </p>
          <h1 className="text-lg sm:text-xl font-semibold tracking-[-0.03em] text-foreground font-display truncate">
            {SUMMARY_COPY.title}
          </h1>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground/90">{period}</span>
            <span className="mx-1.5 opacity-30">·</span>
            <span className="tabular-nums">
              {tripCount} {tripCount === 1 ? 'Fahrt' : 'Fahrten'}
            </span>
            {notableEvents > 0 && (
              <>
                <span className="mx-1.5 opacity-30">·</span>
                <span className="font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                  {notableEvents} auffällig
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onCheckMissing && (
            <button
              type="button"
              onClick={onCheckMissing}
              disabled={disabled || busy}
              className={`${tv.actionBtn} ${tv.focusRing}`}
            >
              <Icon name="search" className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
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
              <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {TIMELINE_COPY.refreshTimeline}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
