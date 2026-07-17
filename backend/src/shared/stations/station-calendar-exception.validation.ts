import { BadRequestException } from '@nestjs/common';
import {
  StationCalendarExceptionType,
  StationCalendarRecurrenceKind,
} from '@prisma/client';
import {
  defaultPriorityForCalendarExceptionType,
  isClosureCalendarExceptionType,
  isOpeningOverrideCalendarExceptionType,
  StationCalendarExceptionConflict,
  StationCalendarExceptionInput,
  StationCalendarExceptionRecord,
  StationCalendarExceptionSlot,
  StationCalendarExceptionValidationCode,
} from './station-calendar-exception.contract';
import { slotsHaveOverlap } from './station-opening-hours.validation';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function parseCalendarDate(value: string): Date {
  if (!ISO_DATE_RE.test(value)) {
    throw new BadRequestException({
      message: 'calendarDate must be an ISO date (YYYY-MM-DD)',
      code: StationCalendarExceptionValidationCode.INVALID_DATE,
    });
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException({
      message: 'calendarDate is not a valid calendar date',
      code: StationCalendarExceptionValidationCode.INVALID_DATE,
    });
  }
  return date;
}

export function assertValidMonthDay(monthDay: string): void {
  if (!MONTH_DAY_RE.test(monthDay)) {
    throw new BadRequestException({
      message: 'monthDay must use MM-DD format',
      code: StationCalendarExceptionValidationCode.INVALID_MONTH_DAY,
    });
  }
}

export function normalizeCalendarExceptionSlots(
  slots: StationCalendarExceptionSlot[] | null | undefined,
): StationCalendarExceptionSlot[] | null {
  if (!slots || slots.length === 0) return null;
  return slots.map((slot) => ({ open: slot.open, close: slot.close }));
}

export function assertValidCalendarExceptionShape(input: StationCalendarExceptionInput): void {
  const recurrenceKind = input.recurrenceKind ?? StationCalendarRecurrenceKind.NONE;
  if (recurrenceKind === StationCalendarRecurrenceKind.NONE) {
    if (!input.calendarDate) {
      throw new BadRequestException({
        message: 'calendarDate is required when recurrenceKind is NONE',
        code: StationCalendarExceptionValidationCode.INVALID_STRUCTURE,
      });
    }
    parseCalendarDate(input.calendarDate);
  } else if (recurrenceKind === StationCalendarRecurrenceKind.YEARLY) {
    if (!input.monthDay) {
      throw new BadRequestException({
        message: 'monthDay is required when recurrenceKind is YEARLY',
        code: StationCalendarExceptionValidationCode.INVALID_STRUCTURE,
      });
    }
    assertValidMonthDay(input.monthDay);
  }

  const closedAllDay = input.closedAllDay ?? false;
  const slots = normalizeCalendarExceptionSlots(input.slots ?? null);

  switch (input.type) {
    case StationCalendarExceptionType.STATION_CLOSURE:
      if (!closedAllDay || slots) {
        throw new BadRequestException({
          message: 'STATION_CLOSURE must be closedAllDay without slots',
          code: StationCalendarExceptionValidationCode.INVALID_TYPE_SHAPE,
        });
      }
      return;
    case StationCalendarExceptionType.REGIONAL_HOLIDAY:
      if (!input.regionCode?.trim()) {
        throw new BadRequestException({
          message: 'REGIONAL_HOLIDAY requires an explicit regionCode',
          code: StationCalendarExceptionValidationCode.REGION_CODE_REQUIRED,
        });
      }
      if (!closedAllDay || slots) {
        throw new BadRequestException({
          message: 'REGIONAL_HOLIDAY must be closedAllDay without slots',
          code: StationCalendarExceptionValidationCode.INVALID_TYPE_SHAPE,
        });
      }
      return;
    case StationCalendarExceptionType.SPECIAL_OPENING:
    case StationCalendarExceptionType.MODIFIED_HOURS:
      if (closedAllDay || !slots?.length) {
        throw new BadRequestException({
          message: `${input.type} requires slots and cannot be closedAllDay`,
          code: StationCalendarExceptionValidationCode.SLOTS_REQUIRED,
        });
      }
      if (slotsHaveOverlap(slots)) {
        throw new BadRequestException({
          message: 'calendar exception slots must not overlap',
          code: StationCalendarExceptionValidationCode.CONFLICT,
        });
      }
      return;
    case StationCalendarExceptionType.OPERATIONAL_EXCEPTION:
      if (closedAllDay && slots?.length) {
        throw new BadRequestException({
          message: 'OPERATIONAL_EXCEPTION cannot be closedAllDay with slots',
          code: StationCalendarExceptionValidationCode.INVALID_TYPE_SHAPE,
        });
      }
      if (!closedAllDay && !slots?.length) {
        throw new BadRequestException({
          message: 'OPERATIONAL_EXCEPTION requires closedAllDay or slots',
          code: StationCalendarExceptionValidationCode.SLOTS_REQUIRED,
        });
      }
      if (slots && slotsHaveOverlap(slots)) {
        throw new BadRequestException({
          message: 'calendar exception slots must not overlap',
          code: StationCalendarExceptionValidationCode.CONFLICT,
        });
      }
      return;
    default:
      throw new BadRequestException({
        message: 'Unsupported calendar exception type',
        code: StationCalendarExceptionValidationCode.INVALID_STRUCTURE,
      });
  }
}

export function calendarExceptionAppliesOnDate(
  record: Pick<
    StationCalendarExceptionRecord,
    'recurrenceKind' | 'calendarDate' | 'monthDay'
  >,
  targetDate: string,
): boolean {
  if (record.recurrenceKind === StationCalendarRecurrenceKind.YEARLY) {
    if (!record.monthDay) return false;
    return targetDate.slice(5) === record.monthDay;
  }
  if (!record.calendarDate) return false;
  return record.calendarDate.slice(0, 10) === targetDate;
}

export function calendarExceptionsOverlap(
  left: Pick<
    StationCalendarExceptionRecord | StationCalendarExceptionInput,
    'recurrenceKind' | 'calendarDate' | 'monthDay'
  >,
  right: Pick<
    StationCalendarExceptionRecord | StationCalendarExceptionInput,
    'recurrenceKind' | 'calendarDate' | 'monthDay'
  >,
): boolean {
  const leftKind = left.recurrenceKind ?? StationCalendarRecurrenceKind.NONE;
  const rightKind = right.recurrenceKind ?? StationCalendarRecurrenceKind.NONE;

  if (leftKind === StationCalendarRecurrenceKind.YEARLY && rightKind === StationCalendarRecurrenceKind.YEARLY) {
    return !!left.monthDay && left.monthDay === right.monthDay;
  }

  if (leftKind === StationCalendarRecurrenceKind.YEARLY && rightKind === StationCalendarRecurrenceKind.NONE) {
    return !!left.monthDay && !!right.calendarDate && right.calendarDate.slice(5) === left.monthDay;
  }

  if (leftKind === StationCalendarRecurrenceKind.NONE && rightKind === StationCalendarRecurrenceKind.YEARLY) {
    return calendarExceptionsOverlap(right, left);
  }

  return !!left.calendarDate && left.calendarDate === right.calendarDate;
}

export function detectCalendarExceptionConflicts(
  existing: StationCalendarExceptionRecord[],
  candidate: StationCalendarExceptionInput,
  options: { excludeId?: string } = {},
): StationCalendarExceptionConflict[] {
  const conflicts: StationCalendarExceptionConflict[] = [];

  for (const existingRecord of existing) {
    if (options.excludeId && existingRecord.id === options.excludeId) continue;
    if (existingRecord.status !== 'ACTIVE') continue;

    if (!calendarExceptionsOverlap(candidate, existingRecord)) continue;

    const candidateIsClosure = isClosureCalendarExceptionType(candidate.type);
    const existingIsSpecialOpening =
      existingRecord.type === StationCalendarExceptionType.SPECIAL_OPENING;
    const candidateIsSpecialOpening =
      candidate.type === StationCalendarExceptionType.SPECIAL_OPENING;

    if (candidateIsClosure && existingIsSpecialOpening) {
      conflicts.push({
        code: StationCalendarExceptionValidationCode.CLOSURE_OVERRIDES_SPECIAL_OPENING,
        message:
          'A closure cannot be added on a day with an active SPECIAL_OPENING; cancel the special opening first',
        conflictingExceptionId: existingRecord.id,
      });
      continue;
    }

    if (
      candidateIsSpecialOpening &&
      isClosureCalendarExceptionType(existingRecord.type)
    ) {
      continue;
    }

    if (
      candidate.type === existingRecord.type &&
      candidate.recurrenceKind === existingRecord.recurrenceKind
    ) {
      conflicts.push({
        code: StationCalendarExceptionValidationCode.DUPLICATE_ACTIVE_RULE,
        message: `An active ${candidate.type} rule already exists for this calendar day`,
        conflictingExceptionId: existingRecord.id,
      });
      continue;
    }

    if (
      isOpeningOverrideCalendarExceptionType(candidate.type) &&
      isOpeningOverrideCalendarExceptionType(existingRecord.type)
    ) {
      conflicts.push({
        code: StationCalendarExceptionValidationCode.CONFLICT,
        message: 'Only one opening override rule may apply per calendar day',
        conflictingExceptionId: existingRecord.id,
      });
    }
  }

  return conflicts;
}

export function assertNoCalendarExceptionConflicts(
  existing: StationCalendarExceptionRecord[],
  candidate: StationCalendarExceptionInput,
  options: { excludeId?: string } = {},
): void {
  const conflicts = detectCalendarExceptionConflicts(existing, candidate, options);
  if (conflicts.length > 0) {
    throw new BadRequestException({
      message: conflicts[0]?.message ?? 'Calendar exception conflict',
      code: conflicts[0]?.code ?? StationCalendarExceptionValidationCode.CONFLICT,
      conflicts,
    });
  }
}

export function buildCalendarExceptionWriteData(
  input: StationCalendarExceptionInput,
): {
  type: StationCalendarExceptionType;
  title: string;
  description: string | null;
  recurrenceKind: StationCalendarRecurrenceKind;
  calendarDate: Date | null;
  monthDay: string | null;
  closedAllDay: boolean;
  slots: StationCalendarExceptionSlot[] | null;
  regionCode: string | null;
  priority: number;
} {
  assertValidCalendarExceptionShape(input);
  const recurrenceKind = input.recurrenceKind ?? StationCalendarRecurrenceKind.NONE;
  return {
    type: input.type,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    recurrenceKind,
    calendarDate:
      recurrenceKind === StationCalendarRecurrenceKind.NONE && input.calendarDate
        ? parseCalendarDate(input.calendarDate)
        : null,
    monthDay:
      recurrenceKind === StationCalendarRecurrenceKind.YEARLY
        ? input.monthDay ?? null
        : null,
    closedAllDay: input.closedAllDay ?? false,
    slots: normalizeCalendarExceptionSlots(input.slots ?? null),
    regionCode: input.regionCode?.trim() || null,
    priority: defaultPriorityForCalendarExceptionType(input.type),
  };
}
