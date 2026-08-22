import { useMemo } from 'react';
import { cn } from '../../../../components/ui/utils';
import type { DashboardUtilizationDay } from '../../../lib/dashboard-utilization.types';
import {
  utilizationHeatmapCellClass,
  utilizationHeatmapTone,
} from './utilizationHeatmapTone';

interface UtilizationMonthCalendarProps {
  year: number;
  month: number;
  days: readonly DashboardUtilizationDay[];
  weekdayLabels: readonly string[];
  dayAriaLabel: (dateLabel: string, utilizationPercent: number | null) => string;
  className?: string;
}

function mondayFirstOffset(year: number, month: number): number {
  const day = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

export function UtilizationMonthCalendar({
  year,
  month,
  days,
  weekdayLabels,
  dayAriaLabel,
  className,
}: UtilizationMonthCalendarProps) {
  const dayMap = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = mondayFirstOffset(year, month);

  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, date });
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1 grid grid-cols-7 gap-0.5 lg:mb-0.5 lg:gap-px">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-muted-foreground lg:py-0 lg:text-[8px]"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 lg:gap-px" role="grid" aria-readonly="true">
        {cells.map((cell, index) => {
          if (!cell) {
            return <div key={`empty-${index}`} role="gridcell" aria-hidden />;
          }
          const entry = dayMap.get(cell.date);
          const percent = entry?.utilizationPercent ?? null;
          const tone = utilizationHeatmapTone(percent);
          const dateLabel = new Date(`${cell.date}T12:00:00.000Z`).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          });
          return (
            <button
              key={cell.date}
              type="button"
              role="gridcell"
              tabIndex={0}
              aria-label={dayAriaLabel(dateLabel, percent)}
              className={cn(
                'flex aspect-square min-h-[1.75rem] min-w-0 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums transition-colors motion-reduce:transition-none',
                'lg:aspect-auto lg:h-[1.125rem] lg:max-h-[1.125rem] lg:min-h-[1.125rem] lg:rounded-sm lg:text-[8px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
                utilizationHeatmapCellClass(tone),
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
