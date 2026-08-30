import type { TranslationKey } from '../../i18n/translations/en';
import type { EnergyEvent } from '../../../lib/api';

export const TRIPS_ENERGY_I18N_KEYS = [
  'trips.energy.refuel.detected',
  'trips.energy.refuel.signalChangeMinutes',
  'trips.energy.refuel.detectionWindow',
  'trips.energy.refuel.kindLabel',
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

export function shouldShowRefuelEnvelopeDuration(event: EnergyEvent): boolean {
  return event.kind === 'REFUEL';
}

/** REFUEL cards must never use detection-envelope duration as implicit pump time. */
export function refuelDisplaysEnvelopeAsDuration(event: EnergyEvent): boolean {
  if (event.kind !== 'REFUEL') return false;
  if (event.fuelLevelRiseDurationSeconds != null) return false;
  return false;
}
