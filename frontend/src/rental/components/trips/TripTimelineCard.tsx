import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { TripMetricRow } from './TripMetricRow';
import type { TripBehaviorEvent, TripTimelineTrip } from './timeline.types';
import { hasAbuseSuspicion, isTripTimelineFlagged } from './timeline.utils';
import { cn } from '../../../components/ui/utils';

interface TripTimelineCardProps {
  trip: TripTimelineTrip;
  isSelected: boolean;
  isDark: boolean;
  dayTripNumber?: number;
  behaviorEvents?: TripBehaviorEvent[];
  onSelect: () => void;
  children?: ReactNode;
}

export function TripTimelineCard({
  trip,
  isSelected,
  dayTripNumber,
  behaviorEvents,
  onSelect,
  children,
}: TripTimelineCardProps) {
  const flagged = isTripTimelineFlagged(trip);

  return (
    <article
      role="button"
      tabIndex={0}
      aria-expanded={isSelected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'trips-timeline-card cursor-pointer overflow-hidden rounded-xl border transition-[border-color,box-shadow,background-color,transform] duration-200',
        'hover:shadow-[var(--shadow-1)] active:scale-[0.995] motion-reduce:active:scale-100',
        isSelected
          ? 'trips-timeline-card--selected border-[color:var(--brand)]/35 bg-[color:color-mix(in_srgb,var(--brand)_7%,var(--card))] shadow-[var(--shadow-1)] ring-1 ring-[color:var(--brand)]/10'
          : flagged
            ? 'border-red-500/12 surface-premium/90 hover:border-red-500/22'
            : 'border-border/50 surface-premium/75 hover:border-border/80 hover:surface-premium',
      )}
    >
      <div className="px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="flex items-start justify-between gap-3">
          <TripMetricRow
            trip={trip}
            dayTripNumber={dayTripNumber}
            behaviorEvents={behaviorEvents}
          />
          <div
            className={cn(
              'mt-0.5 shrink-0 rounded-full p-1.5 transition-all duration-200',
              isSelected
                ? 'rotate-0 bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                : 'text-muted-foreground',
            )}
          >
            <Icon
              name="chevron-down"
              className={cn('h-4 w-4 transition-transform duration-200', isSelected && '-rotate-180')}
            />
          </div>
        </div>
      </div>

      {isSelected && children}
    </article>
  );
}
