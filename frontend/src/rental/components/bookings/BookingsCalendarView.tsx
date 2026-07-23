import { useMemo } from 'react';
import type { BookingUiRow } from '../../lib/entityMappers';
import {
  DEFAULT_ORG_TIMEZONE,
  overlapsHalfOpen,
  todayDateOnlyInZone,
  zonedDayRange,
} from '../../../lib/datetime';
import { BookingStatusBadge } from './bookingStatus';
import { bookingRef, parseIso, rowStatus, bookingStartIso, bookingEndIso } from './bookingUtils';

interface BookingsCalendarViewProps {
  rows: BookingUiRow[];
  month: number;
  year: number;
  timeZone?: string;
  selectedDay: number | null;
  onDayClick: (day: number | null) => void;
  onBookingClick: (id: string) => void;
  onMonthChange?: (month: number, year: number) => void;
}

export function BookingsCalendarView({
  rows,
  month,
  year,
  timeZone = DEFAULT_ORG_TIMEZONE,
  selectedDay,
  onDayClick,
  onBookingClick,
  onMonthChange,
}: BookingsCalendarViewProps) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const todayDateOnly = todayDateOnlyInZone(timeZone);

  const byDay = useMemo(() => {
    const map = new Map<number, BookingUiRow[]>();
    for (const row of rows) {
      const start = parseIso(bookingStartIso(row));
      const end = parseIso(bookingEndIso(row));
      if (!start || !end) continue;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateOnly = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayRange = zonedDayRange(dateOnly, timeZone);
        const dayStart = new Date(dayRange.from);
        const dayEnd = new Date(dayRange.to);
        if (overlapsHalfOpen(start, end, dayStart, dayEnd)) {
          const list = map.get(d) ?? [];
          list.push(row);
          map.set(d, list);
        }
      }
    }
    return map;
  }, [rows, month, year, daysInMonth, timeZone]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = new Date(year, month, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  return (
    <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-[12px] font-semibold">{monthLabel}</h3>
        {onMonthChange && (
          <div className="flex gap-1">
            <button
              type="button"
              className="px-2 py-1 text-[10px] rounded border border-border"
              onClick={() => {
                if (month === 0) onMonthChange(11, year - 1);
                else onMonthChange(month - 1, year);
              }}
            >
              ‹
            </button>
            <button
              type="button"
              className="px-2 py-1 text-[10px] rounded border border-border"
              onClick={() => {
                if (month === 11) onMonthChange(0, year + 1);
                else onMonthChange(month + 1, year);
              }}
            >
              ›
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-center text-[9px] font-semibold text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />;
          const list = byDay.get(day) ?? [];
          const dateOnly = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateOnly === todayDateOnly;
          const isSelected = selectedDay === day;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onDayClick(isSelected ? null : day)}
              className={`min-h-[72px] rounded-lg border p-1 text-left transition-colors ${
                isSelected
                  ? 'border-[color:var(--brand)] bg-[color:var(--brand-soft)]'
                  : isToday
                    ? 'border-[color:var(--brand)]/50 bg-muted/40'
                    : 'border-border/50 hover:bg-muted/30'
              }`}
            >
              <span className="text-[10px] font-semibold">{day}</span>
              <div className="mt-1 space-y-0.5">
                {list.slice(0, 2).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBookingClick(b.id);
                    }}
                    className="w-full text-left truncate text-[8px] px-1 py-0.5 rounded bg-muted/80 hover:bg-muted"
                  >
                    {bookingRef(b.id)}
                  </button>
                ))}
                {list.length > 2 && (
                  <span className="text-[8px] text-muted-foreground">+{list.length - 2}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {selectedDay != null && (byDay.get(selectedDay) ?? []).length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/60 space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">
            {selectedDay}. {monthLabel}
          </p>
          {(byDay.get(selectedDay) ?? []).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onBookingClick(b.id)}
              className="w-full flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-left hover:bg-muted/40"
            >
              <span className="text-[11px] font-medium">{bookingRef(b.id)} · {b.customer}</span>
              <BookingStatusBadge status={rowStatus(b)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
