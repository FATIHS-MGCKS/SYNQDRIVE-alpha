import { DEFAULT_TARIFF_TIMEZONE, zonedDateOnly } from '@modules/pricing/tariff-instant.util';
import { BOOKING_PREPARATION_TIMING_RULE } from './booking-preparation-timing.rules';

export interface BookingPreparationTiming {
  pickupAt: Date;
  /** Raw activation instant before clamping to `now`. */
  scheduledActivatesAt: Date;
  /** When the task becomes visible — `max(now, scheduledActivatesAt)`. */
  activatesAt: Date;
  dueDate: Date;
  timeZone: string;
  /** Pickup calendar date in org timezone (`YYYY-MM-DD`). */
  pickupDateOnly: string;
  /** True when pickup is inside the activation lead window. */
  immediatelyActive: boolean;
}

/**
 * Computes preparation timing from the booking pickup instant (`startDate`).
 * Pickup is an absolute UTC instant; org timezone is used for calendar metadata
 * and bucket alignment (DST-safe via IANA zone helpers).
 */
export function computeBookingPreparationTiming(
  pickupAt: Date,
  now: Date,
  timeZone: string = DEFAULT_TARIFF_TIMEZONE,
): BookingPreparationTiming {
  const tz = timeZone.trim() || DEFAULT_TARIFF_TIMEZONE;
  const { activationLeadBeforePickupMs, dueLeadBeforePickupMs } = BOOKING_PREPARATION_TIMING_RULE;

  const scheduledActivatesAt = new Date(pickupAt.getTime() - activationLeadBeforePickupMs);
  const activatesAt =
    scheduledActivatesAt.getTime() <= now.getTime() ? now : scheduledActivatesAt;
  const dueDate = new Date(pickupAt.getTime() - dueLeadBeforePickupMs);

  return {
    pickupAt,
    scheduledActivatesAt,
    activatesAt,
    dueDate,
    timeZone: tz,
    pickupDateOnly: zonedDateOnly(pickupAt, tz),
    immediatelyActive: scheduledActivatesAt.getTime() <= now.getTime(),
  };
}

export function isSignificantBookingPickupReschedule(
  previousPickupAt: Date,
  nextPickupAt: Date,
): boolean {
  return (
    Math.abs(nextPickupAt.getTime() - previousPickupAt.getTime()) >=
    BOOKING_PREPARATION_TIMING_RULE.significantRescheduleThresholdMs
  );
}
