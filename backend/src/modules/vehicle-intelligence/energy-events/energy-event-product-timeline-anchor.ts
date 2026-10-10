import { EnergyEventKind } from '@prisma/client';
import type { EnergyEventDto } from './energy-events.types';

const ENVELOPE_TOLERANCE_MS = 15 * 60 * 1000;

export type EnergyEventAnchorRow = {
  kind: EnergyEventKind;
  startTime: Date;
  endTime: Date;
  fuelLevelRiseStart: Date | null;
  fuelLevelRiseEnd: Date | null;
};

export type ParsedRefuelRise =
  | { ok: true; start: Date; end: Date }
  | { ok: false; reason: 'missing' | 'invalid' | 'inconsistent' };

export function parseRefuelFuelLevelRiseRow(row: EnergyEventAnchorRow): ParsedRefuelRise {
  if (row.kind !== EnergyEventKind.REFUEL) {
    return { ok: false, reason: 'missing' };
  }
  const start = row.fuelLevelRiseStart;
  const end = row.fuelLevelRiseEnd;
  if (!start || !end) {
    return { ok: false, reason: 'missing' };
  }
  if (end.getTime() < start.getTime()) {
    return { ok: false, reason: 'invalid' };
  }
  if (
    start.getTime() < row.startTime.getTime() - ENVELOPE_TOLERANCE_MS ||
    end.getTime() > row.endTime.getTime() + ENVELOPE_TOLERANCE_MS
  ) {
    return { ok: false, reason: 'inconsistent' };
  }
  return { ok: true, start, end };
}

/** Product timeline anchor — matches frontend `energyEventTimelineAnchorIso`. */
export function resolveEnergyEventProductTimelineAnchor(row: EnergyEventAnchorRow): Date {
  if (row.kind === EnergyEventKind.REFUEL) {
    const rise = parseRefuelFuelLevelRiseRow(row);
    if (rise.ok) {
      return rise.start;
    }
  }
  return row.startTime;
}

export function resolveEnergyEventProductTimelineAnchorFromDto(dto: EnergyEventDto): Date {
  return resolveEnergyEventProductTimelineAnchor({
    kind: dto.kind,
    startTime: new Date(dto.startTime),
    endTime: new Date(dto.endTime),
    fuelLevelRiseStart: dto.fuelLevelRiseStart ? new Date(dto.fuelLevelRiseStart) : null,
    fuelLevelRiseEnd: dto.fuelLevelRiseEnd ? new Date(dto.fuelLevelRiseEnd) : null,
  });
}

export function isEnergyEventProductAnchorInWindow(
  anchor: Date,
  from?: Date,
  to?: Date,
): boolean {
  if (from && anchor.getTime() < from.getTime()) return false;
  if (to && anchor.getTime() > to.getTime()) return false;
  return true;
}

export function filterEnergyEventDtosByProductTimelineAnchor(
  events: EnergyEventDto[],
  options: { from?: Date; to?: Date },
): EnergyEventDto[] {
  if (!options.from && !options.to) return events;
  return events.filter((dto) =>
    isEnergyEventProductAnchorInWindow(
      resolveEnergyEventProductTimelineAnchorFromDto(dto),
      options.from,
      options.to,
    ),
  );
}

function boundedRange(from?: Date, to?: Date) {
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}

/**
 * Bounded Prisma where for product reads: widen candidate fetch, then post-filter on product anchor.
 * - REFUEL with rise in window
 * - REFUEL without rise: envelope start in window (fallback)
 * - REFUEL with rise present but envelope in window (invalid/inconsistent rise → post-filter uses envelope)
 * - RECHARGE: envelope start in window (unchanged)
 */
export function buildEnergyEventProductReadListWhere(
  vehicleId: string,
  options: { from?: Date; to?: Date },
) {
  if (!options.from && !options.to) {
    return { vehicleId };
  }
  const range = boundedRange(options.from, options.to);
  return {
    vehicleId,
    OR: [
      { fuelLevelRiseStart: range },
      {
        kind: EnergyEventKind.REFUEL,
        fuelLevelRiseStart: null,
        startTime: range,
      },
      {
        kind: EnergyEventKind.REFUEL,
        fuelLevelRiseStart: { not: null },
        startTime: range,
      },
      {
        kind: EnergyEventKind.RECHARGE,
        startTime: range,
      },
    ],
  };
}
