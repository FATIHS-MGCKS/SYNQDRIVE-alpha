import type { BookingUiStatus } from '../components/bookings/bookingStatus';
import {
  AVAILABILITY_OCCUPANCY_STATUSES,
  calculateFreeSlots,
  calculateVisibleBookedIntervals,
  formatSlotDurationLabel,
  getNextFreeSlot,
  type AvailabilityBookingInput,
  type AvailabilityRange,
  type FreeSlot,
  type UtilizationBreakdown,
} from './vehicle-availability-intelligence.utils';

const MS_DAY = 24 * 60 * 60 * 1000;

export type AvailabilityInsightTone = 'neutral' | 'info' | 'watch';

export interface AvailabilityInsight {
  id: string;
  tone: AvailabilityInsightTone;
  icon: string;
  message: string;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function findLargestFreeSlot(slots: FreeSlot[]): FreeSlot | null {
  if (slots.length === 0) return null;
  return slots.reduce((best, slot) => (slot.durationMs > best.durationMs ? slot : best));
}

function findGapBetweenBookingsInsight(
  bookings: AvailabilityBookingInput[],
  range: AvailabilityRange,
  now: number,
): AvailabilityInsight | null {
  const occupancy = bookings
    .filter((b) => AVAILABILITY_OCCUPANCY_STATUSES.includes(b.status))
    .filter((b) => b.endDate.getTime() > range.start.getTime() && b.startDate.getTime() < range.end.getTime())
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());

  for (let i = 0; i < occupancy.length - 1; i += 1) {
    const current = occupancy[i]!;
    const next = occupancy[i + 1]!;
    const gapStart = current.endDate.getTime();
    const gapEnd = next.startDate.getTime();
    const gapMs = gapEnd - gapStart;
    if (gapMs < MS_DAY) continue;
    if (gapEnd < now) continue;

    const label = formatSlotDurationLabel(gapMs);
    return {
      id: 'gap-between-bookings',
      tone: 'info',
      icon: 'calendar-range',
      message: `Freier Slot: ${label} zwischen Rückgabe und nächstem Pickup`,
    };
  }
  return null;
}

export function buildAvailabilityInsights(
  bookings: AvailabilityBookingInput[],
  range: AvailabilityRange,
  utilization: UtilizationBreakdown,
  now = Date.now(),
): AvailabilityInsight[] {
  const insights: AvailabilityInsight[] = [];
  const freeSlots = calculateFreeSlots(bookings, range);
  const nextFree = getNextFreeSlot(bookings, range, now);
  const largestFree = findLargestFreeSlot(freeSlots);

  if (utilization.occupancyPct >= 75) {
    insights.push({
      id: 'high-utilization',
      tone: utilization.occupancyPct >= 90 ? 'watch' : 'info',
      icon: 'gauge',
      message: `Hohe Auslastung: ${utilization.occupancyPct} % im gewählten Zeitraum`,
    });
  }

  const gapInsight = findGapBetweenBookingsInsight(bookings, range, now);
  if (gapInsight) {
    insights.push(gapInsight);
  } else if (largestFree && largestFree.durationMs >= 3 * MS_DAY) {
    insights.push({
      id: 'long-gap',
      tone: 'neutral',
      icon: 'calendar',
      message: `Lange Lücke: ${formatSlotDurationLabel(largestFree.durationMs)} frei ab ${formatShortDate(largestFree.start)}`,
    });
  } else if (nextFree && nextFree.durationMs >= MS_DAY) {
    insights.push({
      id: 'next-free-slot',
      tone: 'neutral',
      icon: 'calendar-clock',
      message: `Nächster freier Slot: ${formatSlotDurationLabel(nextFree.durationMs)} ab ${formatShortDate(nextFree.start)}`,
    });
  }

  if (utilization.freeMs > 0 && utilization.occupancyPct < 75) {
    const bookedIntervals = calculateVisibleBookedIntervals(bookings, range);
    if (bookedIntervals.length === 0) {
      insights.push({
        id: 'fully-free',
        tone: 'neutral',
        icon: 'check-circle-2',
        message: 'Fahrzeug im gewählten Zeitraum vollständig frei.',
      });
    }
  }

  const seen = new Set<string>();
  return insights.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
