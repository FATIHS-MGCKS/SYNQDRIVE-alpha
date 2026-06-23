import { Navigation } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { TIMELINE_COPY, tv } from './trips-view-ui';

export type TripTimelineEmptyVariant =
  | 'no-trips-in-range'
  | 'no-trips-yet'
  | 'no-vehicle'
  | 'load-error';

interface TripTimelineEmptyStateProps {
  variant: TripTimelineEmptyVariant;
  hint?: string;
  errorMessage?: string;
  onCheckMissing?: () => void;
  onRefresh?: () => void;
  checking?: boolean;
}

export function TripTimelineEmptyState({
  variant,
  hint,
  errorMessage,
  onCheckMissing,
  onRefresh,
  checking,
}: TripTimelineEmptyStateProps) {
  const title =
    variant === 'load-error'
      ? TIMELINE_COPY.errorLoad
      : variant === 'no-vehicle'
        ? TIMELINE_COPY.emptyNoVehicle
        : variant === 'no-trips-in-range'
          ? TIMELINE_COPY.emptyNoTripsRange
          : TIMELINE_COPY.emptyNoTripsYet;

  const subtitle =
    variant === 'load-error'
      ? errorMessage ?? TIMELINE_COPY.errorLoadHint
      : hint ?? (variant === 'no-trips-in-range' ? TIMELINE_COPY.emptyRangeHint : TIMELINE_COPY.emptyYetHint);

  const isError = variant === 'load-error';

  return (
    <div className="trips-empty-card py-10 sm:py-12 px-5 text-center">
      <div
        className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border ${
          isError
            ? 'border-destructive/25 bg-destructive/5 text-destructive'
            : 'border-border/50 bg-muted/30 text-muted-foreground'
        }`}
      >
        {isError ? (
          <Icon name="alert-circle" className="w-6 h-6" />
        ) : (
          <Navigation className="w-6 h-6" />
        )}
      </div>
      <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">{title}</p>
      {subtitle && (
        <p className="text-xs mt-2 text-muted-foreground max-w-md mx-auto leading-relaxed">{subtitle}</p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {onCheckMissing && variant !== 'load-error' && variant !== 'no-vehicle' && (
          <button
            type="button"
            onClick={onCheckMissing}
            disabled={checking}
            className={`${tv.actionBtnPrimary} disabled:opacity-50`}
          >
            <Icon name="search" className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {TIMELINE_COPY.checkMissingTrips}
          </button>
        )}
        {(onRefresh || variant === 'load-error') && onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={checking}
            className={`${tv.actionBtn} ${tv.focusRing} disabled:opacity-50`}
          >
            <Icon name="refresh-cw" className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {variant === 'load-error' ? TIMELINE_COPY.retryLoad : TIMELINE_COPY.refreshTimeline}
          </button>
        )}
      </div>
    </div>
  );
}
