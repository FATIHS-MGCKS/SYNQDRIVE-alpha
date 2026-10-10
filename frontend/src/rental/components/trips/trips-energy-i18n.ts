import type { TranslationKey } from '../../../i18n/translations/en';
import type { EnergyEvent } from '../../../lib/api';
import { formatTimeHm, parseRefuelFuelLevelRise } from './utils/refuelTimelineTime';

export const TRIPS_ENERGY_I18N_KEYS = [
  'trips.energy.refuel.detected',
  'trips.energy.refuel.signalChangeMinutes',
  'trips.energy.refuel.detectionWindow',
  'trips.energy.refuel.approximateObservedTime',
  'trips.energy.refuel.fuelLevelRiseInterval',
  'trips.energy.refuel.timeUndetermined',
  'trips.energy.refuel.kindLabel',
  'trips.energy.refuel.stationPossible',
  'trips.energy.refuel.stationAmbiguous',
  'trips.energy.refuel.stationResolving',
  'trips.energy.recharge.kindLabel',
  'trips.energy.recharge.durationMinutes',
] as const satisfies readonly TranslationKey[];

export function formatRefuelSignalChangeMinutes(
  fuelLevelRiseDurationSeconds: number,
): number {
  return Math.max(1, Math.round(fuelLevelRiseDurationSeconds / 60));
}

export function formatRechargeDurationMinutes(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds / 60));
}

export function refuelPrimaryFuelDelta(event: EnergyEvent): string | null {
  if (event.fuelDeltaLiters != null) {
    return `+${event.fuelDeltaLiters.toFixed(1)} L`;
  }
  return null;
}

export function refuelSecondaryFuelDelta(event: EnergyEvent): string | null {
  if (event.fuelDeltaPercent != null) {
    return `+${event.fuelDeltaPercent.toFixed(0)} %`;
  }
  return null;
}

export type RefuelObservedTimePresentation =
  | { mode: 'approximate'; primaryTimeLabel: string; intervalFrom: string; intervalTo: string }
  | { mode: 'undetermined' };

export function buildRefuelObservedTimePresentation(
  event: EnergyEvent,
  locale: string,
): RefuelObservedTimePresentation {
  const rise = parseRefuelFuelLevelRise(event);
  if (!rise.ok) {
    return { mode: 'undetermined' };
  }
  return {
    mode: 'approximate',
    primaryTimeLabel: formatTimeHm(rise.start, locale),
    intervalFrom: formatTimeHm(rise.start, locale),
    intervalTo: formatTimeHm(rise.end, locale),
  };
}

/** Calendar date for REFUEL card header — follows observed rise when valid. */
export function refuelCardDateIso(event: EnergyEvent): string {
  const rise = parseRefuelFuelLevelRise(event);
  if (rise.ok) {
    return rise.start.toISOString();
  }
  return event.startTime;
}

export function formatDetectionEnvelopeTimes(event: EnergyEvent, locale: string): {
  from: string;
  to: string;
} {
  const from = new Date(event.startTime);
  const to = new Date(event.endTime);
  return {
    from: formatTimeHm(from, locale),
    to: formatTimeHm(to, locale),
  };
}
