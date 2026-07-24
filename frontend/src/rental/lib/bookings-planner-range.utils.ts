import {
  type HalfOpenUtcRange,
  todayDateOnlyInZone,
  zonedCalendarMonthRange,
  zonedPartsFromInstant,
  zonedStartOfDayToUtc,
  zonedWeekRangeForDateOnly,
} from '../../lib/datetime';
import type { BookingPlannerView } from '../components/bookings/bookingTypes';

export interface PlannerVisibleRangeInput {
  view: BookingPlannerView;
  timelineRange: 'week' | 'month';
  calendarMonth: number;
  calendarYear: number;
  timelineAnchorDateOnly: string;
  timeZone: string;
  weekStartsOn: number;
}

/** Single source of truth for planner fetch + render windows. */
export function resolvePlannerVisibleRange(input: PlannerVisibleRangeInput): HalfOpenUtcRange {
  if (input.view === 'calendar') {
    return zonedCalendarMonthRange(input.calendarYear, input.calendarMonth, input.timeZone);
  }
  if (input.timelineRange === 'week') {
    return zonedWeekRangeForDateOnly(
      input.timelineAnchorDateOnly,
      input.timeZone,
      input.weekStartsOn,
    );
  }
  const anchorParts = zonedPartsFromInstant(
    zonedStartOfDayToUtc(input.timelineAnchorDateOnly, input.timeZone),
    input.timeZone,
  );
  return zonedCalendarMonthRange(anchorParts.year, anchorParts.month - 1, input.timeZone);
}

export function defaultTimelineAnchorDateOnly(timeZone: string): string {
  return todayDateOnlyInZone(timeZone);
}
