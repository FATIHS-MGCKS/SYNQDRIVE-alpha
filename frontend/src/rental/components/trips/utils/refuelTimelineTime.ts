import type { EnergyEvent } from '../../../../lib/api';

export type ParsedRefuelRise =
  | { ok: true; start: Date; end: Date }
  | { ok: false; reason: 'missing' | 'invalid' | 'inconsistent' };

const ENVELOPE_TOLERANCE_MS = 15 * 60 * 1000;

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Validates persisted fuel-rise observation timestamps for REFUEL display and sort. */
export function parseRefuelFuelLevelRise(event: EnergyEvent): ParsedRefuelRise {
  if (event.kind !== 'REFUEL') {
    return { ok: false, reason: 'missing' };
  }
  const start = parseIso(event.fuelLevelRiseStart);
  const end = parseIso(event.fuelLevelRiseEnd);
  if (!start || !end) {
    return { ok: false, reason: 'missing' };
  }
  if (end.getTime() < start.getTime()) {
    return { ok: false, reason: 'invalid' };
  }
  const envStart = parseIso(event.startTime);
  const envEnd = parseIso(event.endTime);
  if (envStart && envEnd) {
    if (
      start.getTime() < envStart.getTime() - ENVELOPE_TOLERANCE_MS ||
      end.getTime() > envEnd.getTime() + ENVELOPE_TOLERANCE_MS
    ) {
      return { ok: false, reason: 'inconsistent' };
    }
  }
  return { ok: true, start, end };
}

/** Timeline sort / day grouping anchor — observed rise when valid, else detection envelope start. */
export function energyEventTimelineAnchorIso(event: EnergyEvent): string {
  if (event.kind === 'REFUEL') {
    const rise = parseRefuelFuelLevelRise(event);
    if (rise.ok) {
      return rise.start.toISOString();
    }
  }
  return event.startTime;
}

export function formatTimeHm(date: Date, locale: string, timeZone?: string): string {
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
}
