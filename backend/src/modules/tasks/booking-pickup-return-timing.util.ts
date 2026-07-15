import { TaskPriority } from '@prisma/client';
import { DEFAULT_TARIFF_TIMEZONE, zonedDateOnly } from '@modules/pricing/tariff-instant.util';
import {
  BOOKING_PICKUP_TIMING_RULE,
  BOOKING_RETURN_TIMING_RULE,
} from './booking-pickup-return-timing.rules';

export interface BookingHandoverTiming {
  milestoneAt: Date;
  scheduledActivatesAt: Date;
  activatesAt: Date;
  dueDate: Date;
  timeZone: string;
  milestoneDateOnly: string;
  immediatelyActive: boolean;
  priority: TaskPriority;
  isOverdue: boolean;
}

function clampActivatesAt(scheduledActivatesAt: Date, now: Date): Date {
  return scheduledActivatesAt.getTime() <= now.getTime() ? now : scheduledActivatesAt;
}

function resolveHandoverPriority(
  milestoneAt: Date,
  now: Date,
  overduePriority: TaskPriority,
  criticalOverdueAfterMs: number,
): { priority: TaskPriority; isOverdue: boolean } {
  const overdueMs = now.getTime() - milestoneAt.getTime();
  if (overdueMs <= 0) {
    return { priority: 'NORMAL', isOverdue: false };
  }
  if (overdueMs >= criticalOverdueAfterMs) {
    return { priority: 'CRITICAL', isOverdue: true };
  }
  return { priority: overduePriority, isOverdue: true };
}

export function computeBookingPickupTiming(
  pickupAt: Date,
  now: Date,
  timeZone: string = DEFAULT_TARIFF_TIMEZONE,
): BookingHandoverTiming {
  const tz = timeZone.trim() || DEFAULT_TARIFF_TIMEZONE;
  const scheduledActivatesAt = new Date(
    pickupAt.getTime() - BOOKING_PICKUP_TIMING_RULE.activationLeadBeforePickupMs,
  );
  const activatesAt = clampActivatesAt(scheduledActivatesAt, now);
  const dueDate = new Date(pickupAt.getTime() - BOOKING_PICKUP_TIMING_RULE.dueLeadBeforePickupMs);
  const { priority, isOverdue } = resolveHandoverPriority(
    pickupAt,
    now,
    BOOKING_PICKUP_TIMING_RULE.overduePriority,
    BOOKING_PICKUP_TIMING_RULE.criticalOverdueAfterMs,
  );

  return {
    milestoneAt: pickupAt,
    scheduledActivatesAt,
    activatesAt,
    dueDate,
    timeZone: tz,
    milestoneDateOnly: zonedDateOnly(pickupAt, tz),
    immediatelyActive: scheduledActivatesAt.getTime() <= now.getTime(),
    priority,
    isOverdue,
  };
}

export function computeBookingReturnTiming(
  returnAt: Date,
  now: Date,
  timeZone: string = DEFAULT_TARIFF_TIMEZONE,
): BookingHandoverTiming {
  const tz = timeZone.trim() || DEFAULT_TARIFF_TIMEZONE;
  const scheduledActivatesAt = new Date(
    returnAt.getTime() - BOOKING_RETURN_TIMING_RULE.activationLeadBeforeReturnMs,
  );
  const activatesAt = clampActivatesAt(scheduledActivatesAt, now);
  const dueDate = new Date(returnAt.getTime() - BOOKING_RETURN_TIMING_RULE.dueLeadBeforeReturnMs);
  const { priority, isOverdue } = resolveHandoverPriority(
    returnAt,
    now,
    BOOKING_RETURN_TIMING_RULE.overduePriority,
    BOOKING_RETURN_TIMING_RULE.criticalOverdueAfterMs,
  );

  return {
    milestoneAt: returnAt,
    scheduledActivatesAt,
    activatesAt,
    dueDate,
    timeZone: tz,
    milestoneDateOnly: zonedDateOnly(returnAt, tz),
    immediatelyActive: scheduledActivatesAt.getTime() <= now.getTime(),
    priority,
    isOverdue,
  };
}

export function isSignificantBookingPickupReschedule(
  previousPickupAt: Date,
  nextPickupAt: Date,
): boolean {
  return (
    Math.abs(nextPickupAt.getTime() - previousPickupAt.getTime()) >=
    BOOKING_PICKUP_TIMING_RULE.significantRescheduleThresholdMs
  );
}

export function isSignificantBookingReturnReschedule(
  previousReturnAt: Date,
  nextReturnAt: Date,
): boolean {
  return (
    Math.abs(nextReturnAt.getTime() - previousReturnAt.getTime()) >=
    BOOKING_RETURN_TIMING_RULE.significantRescheduleThresholdMs
  );
}
