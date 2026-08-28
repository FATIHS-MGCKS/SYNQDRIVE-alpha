import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import { assessRefuelMovementPlausibility } from './energy-events-refuel-plausibility';

export function assessPlausibilityFlags(
  segment: DimoEnergyEventSegment,
): string[] {
  const flags: string[] = [];

  if (segment.mechanism === 'refuel') {
    const liters = segment.fuelDeltaLiters ?? 0;
    const percent = segment.fuelDeltaPercent ?? 0;
    if (liters > 100) flags.push('refuel_liters_implausibly_large');
    if (percent > 90) flags.push('refuel_percent_implausibly_large');
    if (
      liters > 2 &&
      percent > 20 &&
      liters < percent / 10
    ) {
      flags.push('fuel_signal_contradiction');
    }
    if (
      percent > 20 &&
      liters > 0 &&
      liters < 2 &&
      (segment.fuelStartLiters != null || segment.fuelEndLiters != null)
    ) {
      flags.push('fuel_signal_contradiction');
    }
    if (segment.durationSeconds > 2 * 60 * 60) {
      flags.push('refuel_duration_very_long');
    }
    flags.push(...assessRefuelMovementPlausibility(segment));
    if (
      (segment.fuelDeltaLiters == null || segment.fuelDeltaLiters <= 0) &&
      (segment.fuelDeltaPercent == null || segment.fuelDeltaPercent <= 0)
    ) {
      flags.push('refuel_missing_fuel_evidence');
    }
  } else {
    const soc = segment.socDeltaPercent ?? 0;
    if (soc > 100) flags.push('recharge_soc_impossible');
    if (segment.durationSeconds < 60 && soc < 2) {
      flags.push('recharge_very_short_low_soc');
    }
    if (segment.durationSeconds > 48 * 60 * 60) {
      flags.push('recharge_session_very_long');
    }
    if (
      soc > 0 &&
      segment.energyDeltaKwh != null &&
      segment.energyDeltaKwh <= 0
    ) {
      flags.push('recharge_soc_energy_contradiction');
    }
  }

  return flags;
}

export function detectOverlappingDuplicates(
  segments: DimoEnergyEventSegment[],
): Set<string> {
  const flagged = new Set<string>();
  const sorted = [...segments].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (prev.mechanism !== next.mechanism) continue;
    const gapMs =
      new Date(next.startTime).getTime() - new Date(prev.startTime).getTime();
    if (gapMs < 5 * 60 * 1000) {
      flagged.add(prev.segmentId);
      flagged.add(next.segmentId);
    }
  }

  return flagged;
}
