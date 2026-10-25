import type { NumericInterval } from './tire-wear-v3-prior.types';

/** Final tread depth presentation (mm). */
export function roundDisplayTreadMm(v: number): number {
  return Math.round(v * 100) / 100;
}

export function roundDisplayTreadInterval(interval: NumericInterval): NumericInterval {
  return {
    lo: roundDisplayTreadMm(interval.lo),
    hi: roundDisplayTreadMm(interval.hi),
  };
}

/** Wear rate presentation (mm per 1000 km). */
export function roundDisplayRateMmPer1000(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export function roundDisplayRateIntervalMmPer1000(
  interval: NumericInterval,
): NumericInterval {
  return {
    lo: roundDisplayRateMmPer1000(interval.lo),
    hi: roundDisplayRateMmPer1000(interval.hi),
  };
}

export function mmPerKmToDisplayPer1000(mmPerKm: number): number {
  return roundDisplayRateMmPer1000(mmPerKm * 1000);
}

export function intervalMmPerKmToDisplayPer1000(
  interval: NumericInterval,
): NumericInterval {
  return {
    lo: mmPerKmToDisplayPer1000(interval.lo),
    hi: mmPerKmToDisplayPer1000(interval.hi),
  };
}
