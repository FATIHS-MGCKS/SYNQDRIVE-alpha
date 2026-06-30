import {
  BEHAVIOR_CATEGORY_ORDER,
  countBehaviorEventsByCategory,
  type BehaviorCategoryKey,
} from './behavior-category.utils';
import type { TripBehaviorEvent } from './trips.types';

const BAR_TONE: Record<BehaviorCategoryKey, string> = {
  ACCELERATION: 'bg-amber-500/70',
  BRAKING: 'bg-orange-500/65',
  CORNERING: 'bg-sky-500/65',
  ABUSE: 'bg-rose-500/70',
};

const BAR_TRACK: Record<BehaviorCategoryKey, string> = {
  ACCELERATION: 'bg-amber-500/12',
  BRAKING: 'bg-orange-500/12',
  CORNERING: 'bg-sky-500/12',
  ABUSE: 'bg-rose-500/12',
};

interface TripBehaviorCategoryBarsProps {
  events: TripBehaviorEvent[];
}

export function TripBehaviorCategoryBars({ events }: TripBehaviorCategoryBarsProps) {
  const counts = countBehaviorEventsByCategory(events);
  const max = Math.max(1, ...BEHAVIOR_CATEGORY_ORDER.map(({ key }) => counts[key]));

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {BEHAVIOR_CATEGORY_ORDER.map(({ key, label }) => {
        const count = counts[key];
        const widthPct = count > 0 ? Math.max(8, (count / max) * 100) : 0;

        return (
          <div key={key} className="min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="truncate font-medium text-muted-foreground">{label}</span>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">{count}</span>
            </div>
            <div className={`h-1.5 overflow-hidden rounded-full ${BAR_TRACK[key]}`}>
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${BAR_TONE[key]}`}
                style={{ width: `${widthPct}%`, opacity: count > 0 ? 1 : 0.35 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
