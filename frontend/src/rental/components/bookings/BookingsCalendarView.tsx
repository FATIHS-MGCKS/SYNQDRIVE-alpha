import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookingUiRow } from '../../lib/entityMappers';
import {
  buildOrgCalendarGrid,
  DEFAULT_ORG_TIMEZONE,
  todayDateOnlyInZone,
  weekdayLabelsForLocale,
  zonedDayRange,
} from '../../../lib/datetime';
import { bookingOverlapsHalfOpenWindow } from './bookingPlannerOverlap';
import { BookingStatusBadge } from './bookingStatus';
import { bookingRef, rowStatus } from './bookingUtils';
import {
  BOOKING_FOCUS_RING,
  bookingChipAriaLabel,
  bookingPlannerNavButtonClass,
} from './bookings-a11y';

interface BookingsCalendarViewProps {
  rows: BookingUiRow[];
  month: number;
  year: number;
  timeZone?: string;
  locale?: string;
  weekStartsOn?: number;
  selectedDay: number | null;
  selectedBookingId: string | null;
  onDayClick: (day: number | null) => void;
  onBookingClick: (id: string) => void;
  onMonthChange?: (month: number, year: number) => void;
}

export function BookingsCalendarView({
  rows,
  month,
  year,
  timeZone = DEFAULT_ORG_TIMEZONE,
  locale = 'de-DE',
  weekStartsOn,
  selectedDay,
  selectedBookingId,
  onDayClick,
  onBookingClick,
  onMonthChange,
}: BookingsCalendarViewProps) {
  const resolvedWeekStart = weekStartsOn ?? (locale.startsWith('en-US') ? 0 : 1);
  const todayDateOnly = todayDateOnlyInZone(timeZone);
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusedDay, setFocusedDay] = useState<number | null>(null);

  const cells = useMemo(
    () => buildOrgCalendarGrid(year, month, timeZone, resolvedWeekStart),
    [year, month, timeZone, resolvedWeekStart],
  );

  const weekdayLabels = useMemo(
    () => weekdayLabelsForLocale(locale, resolvedWeekStart),
    [locale, resolvedWeekStart],
  );

  const daySlices = useMemo(() => {
    return cells
      .filter((c): c is { day: number; dateOnly: string } => c.day != null && c.dateOnly != null)
      .map((c) => {
        const range = zonedDayRange(c.dateOnly, timeZone);
        return {
          day: c.day,
          start: new Date(range.from),
          end: new Date(range.to),
        };
      });
  }, [cells, timeZone]);

  const byDay = useMemo(() => {
    const map = new Map<number, BookingUiRow[]>();
    for (const slice of daySlices) {
      const list: BookingUiRow[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        if (!bookingOverlapsHalfOpenWindow(row, slice.start, slice.end)) continue;
        seen.add(row.id);
        list.push(row);
      }
      map.set(slice.day, list);
    }
    return map;
  }, [rows, daySlices]);

  const selectableDays = useMemo(
    () => daySlices.map((s) => s.day),
    [daySlices],
  );

  useEffect(() => {
    if (selectedDay != null) setFocusedDay(selectedDay);
  }, [selectedDay, month, year]);

  const moveFocus = useCallback(
    (currentDay: number, delta: number) => {
      const idx = selectableDays.indexOf(currentDay);
      if (idx < 0) return;
      const next = selectableDays[idx + delta];
      if (next == null) return;
      setFocusedDay(next);
      const el = gridRef.current?.querySelector<HTMLElement>(`[data-cal-day="${next}"]`);
      el?.focus();
    },
    [selectableDays],
  );

  const handleDayKeyDown = useCallback(
    (day: number, event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          moveFocus(day, -1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          moveFocus(day, 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveFocus(day, -7);
          break;
        case 'ArrowDown':
          event.preventDefault();
          moveFocus(day, 7);
          break;
        case 'Home':
          event.preventDefault();
          if (selectableDays[0] != null) {
            setFocusedDay(selectableDays[0]);
            gridRef.current?.querySelector<HTMLElement>(`[data-cal-day="${selectableDays[0]}"]`)?.focus();
          }
          break;
        case 'End': {
          event.preventDefault();
          const last = selectableDays[selectableDays.length - 1];
          if (last != null) {
            setFocusedDay(last);
            gridRef.current?.querySelector<HTMLElement>(`[data-cal-day="${last}"]`)?.focus();
          }
          break;
        }
        case 'Enter':
        case ' ':
          event.preventDefault();
          onDayClick(selectedDay === day ? null : day);
          break;
        default:
          break;
      }
    },
    [moveFocus, onDayClick, selectableDays, selectedDay],
  );

  const monthLabel = new Date(year, month, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

  const goMonth = (delta: number) => {
    if (!onMonthChange) return;
    const nextMonth = month + delta;
    if (nextMonth < 0) onMonthChange(11, year - 1);
    else if (nextMonth > 11) onMonthChange(0, year + 1);
    else onMonthChange(nextMonth, year);
  };

  return (
    <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-[12px] font-semibold">{monthLabel}</h3>
        {onMonthChange && (
          <div className="flex gap-1" role="group" aria-label="Monat wechseln">
            <button
              type="button"
              className={bookingPlannerNavButtonClass()}
              aria-label="Vorheriger Monat"
              onClick={() => goMonth(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className={bookingPlannerNavButtonClass()}
              aria-label="Nächster Monat"
              onClick={() => goMonth(1)}
            >
              ›
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1" role="row">
        {weekdayLabels.map((d) => (
          <div
            key={d}
            role="columnheader"
            className="text-center text-[9px] font-semibold text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>
      <div
        ref={gridRef}
        className="grid grid-cols-7 gap-1"
        role="grid"
        aria-label={`Kalender ${monthLabel}`}
      >
        {cells.map((cell, idx) => {
          if (cell.day == null) return <div key={`e-${idx}`} role="gridcell" aria-hidden />;
          const day = cell.day;
          const list = byDay.get(day) ?? [];
          const isToday = cell.dateOnly === todayDateOnly;
          const isSelected = selectedDay === day;
          const isFocused = focusedDay === day;
          const visibleInCell = list.slice(0, 1);
          const overflowCount = Math.max(0, list.length - visibleInCell.length);

          return (
            <div
              key={day}
              role="gridcell"
              data-cal-day={day}
              tabIndex={isFocused || (focusedDay == null && day === 1) ? 0 : -1}
              aria-selected={isSelected}
              aria-label={`Tag ${day}${isToday ? ', heute' : ''}${list.length ? `, ${list.length} Buchung${list.length === 1 ? '' : 'en'}` : ''}`}
              onKeyDown={(e) => handleDayKeyDown(day, e)}
              onFocus={() => setFocusedDay(day)}
              onClick={() => onDayClick(isSelected ? null : day)}
              className={`min-h-[72px] rounded-lg border p-1 text-left transition-colors cursor-pointer ${BOOKING_FOCUS_RING} ${
                isSelected
                  ? 'border-[color:var(--brand)] bg-[color:var(--brand-soft)]'
                  : isToday
                    ? 'border-[color:var(--brand)]/50 bg-muted/40'
                    : 'border-border/50 hover:bg-muted/30'
              }`}
            >
              <span className="text-[10px] font-semibold block px-0.5">{day}</span>
              <div className="mt-1 space-y-0.5" role="list" aria-label={`Buchungen am ${day}.`}>
                {visibleInCell.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    role="listitem"
                    aria-label={bookingChipAriaLabel(bookingRef(b.id), b.customer)}
                    aria-pressed={selectedBookingId === b.id}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onBookingClick(b.id);
                    }}
                    className={`w-full text-left truncate text-[9px] sm:text-[8px] px-1 min-h-9 sm:min-h-7 flex items-center rounded hover:bg-muted ${BOOKING_FOCUS_RING} ${
                      selectedBookingId === b.id ? 'bg-muted ring-1 ring-[color:var(--brand)]' : 'bg-muted/80'
                    }`}
                  >
                    {bookingRef(b.id)}
                  </button>
                ))}
                {overflowCount > 0 && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDayClick(day);
                    }}
                    className={`w-full text-left text-[9px] text-muted-foreground px-1 min-h-9 sm:min-h-7 flex items-center rounded hover:bg-muted/60 ${BOOKING_FOCUS_RING}`}
                    aria-label={`${overflowCount} weitere Buchung${overflowCount === 1 ? '' : 'en'} am ${day}. Tag auswählen`}
                  >
                    +{overflowCount}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {selectedDay != null && (byDay.get(selectedDay) ?? []).length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/60 space-y-2" role="region" aria-label={`Buchungen am ${selectedDay}. ${monthLabel}`}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">
            {selectedDay}. {monthLabel}
          </p>
          {(byDay.get(selectedDay) ?? []).map((b) => (
            <button
              key={b.id}
              type="button"
              aria-label={bookingChipAriaLabel(bookingRef(b.id), b.customer)}
              aria-pressed={selectedBookingId === b.id}
              onClick={() => onBookingClick(b.id)}
              className={`w-full flex items-center justify-between gap-2 rounded-lg border px-2 min-h-11 text-left hover:bg-muted/40 ${BOOKING_FOCUS_RING} ${
                selectedBookingId === b.id
                  ? 'border-[color:var(--brand)] bg-[color:var(--brand-soft)]'
                  : 'border-border/60'
              }`}
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
