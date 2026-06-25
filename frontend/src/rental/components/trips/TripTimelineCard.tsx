import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';
import { TripMetricRow } from './TripMetricRow';
import { TripStatusBadge } from './TripStatusBadge';
import type { OperationalChip, TripTimelineTrip } from './timeline.types';
import { hasAbuseSuspicion } from './timeline.utils';

interface TripTimelineCardProps {
  trip: TripTimelineTrip;
  isSelected: boolean;
  isDark: boolean;
  chips: OperationalChip[];
  onSelect: () => void;
  children?: ReactNode;
}

const CHIP_TONE: Record<OperationalChip['tone'], Parameters<typeof TripStatusBadge>[0]['tone']> = {
  neutral: 'neutral',
  info: 'info',
  watch: 'watch',
  critical: 'critical',
  private: 'private',
  success: 'success',
};

const MAX_VISIBLE_CHIPS = 3;

export function TripTimelineCard({
  trip,
  isSelected,
  chips,
  onSelect,
  children,
}: TripTimelineCardProps) {
  const flagged = hasAbuseSuspicion(trip);
  const visibleChips = chips.slice(0, MAX_VISIBLE_CHIPS);

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
        'trips-timeline-card rounded-xl border transition-[border-color,box-shadow,background-color,transform] duration-200 cursor-pointer overflow-hidden',
        'hover:shadow-[var(--shadow-1)] active:scale-[0.995] motion-reduce:active:scale-100',
        isSelected
          ? 'trips-timeline-card--selected border-[color:var(--brand)]/35 bg-[color:color-mix(in_srgb,var(--brand)_7%,var(--card))] shadow-[var(--shadow-1)] ring-1 ring-[color:var(--brand)]/10'
          : flagged
            ? 'border-red-500/12 bg-card/90 hover:border-red-500/22'
            : 'border-border/50 bg-card/75 hover:border-border/80 hover:bg-card',
      )}
    >
      <div className="px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="flex items-start justify-between gap-3">
          <TripMetricRow trip={trip} />
          <div
            className={cn(
              'mt-0.5 shrink-0 rounded-full p-1.5 transition-all duration-200',
              isSelected
                ? 'text-[color:var(--brand)] bg-[color:var(--brand-soft)] rotate-0'
                : 'text-muted-foreground',
            )}
          >
            <Icon
              name="chevron-down"
              className={cn('w-4 h-4 transition-transform duration-200', isSelected && '-rotate-180')}
            />
          </div>
        </div>

        {visibleChips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {visibleChips.map((chip) => (
              <TripStatusBadge key={chip.key} label={chip.label} tone={CHIP_TONE[chip.tone]} />
            ))}
          </div>
        )}
      </div>

      {isSelected && children}
    </article>
  );
}
