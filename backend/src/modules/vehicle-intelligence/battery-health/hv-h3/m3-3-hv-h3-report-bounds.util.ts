import { M3_3_HV_H3_MAX_POINTS_PER_SERIES_DEFAULT, M3_3_HV_H3_MAX_POINTS_PER_SERIES_HARD } from './m3-3-hv-h3.constants';

export class M3_3HvH3InvalidMaxPointsError extends Error {
  constructor(public readonly value: number | undefined) {
    super(
      `M3.3-HV-H3: invalid maxPointsPerSeries=${String(value)}; must be a finite integer >= 1`,
    );
    this.name = 'M3_3HvH3InvalidMaxPointsError';
  }
}

/** Reject zero/negative; clamp above hard max to hard (operator policy). */
export function resolveM3_3HvH3MaxPointsPerSeries(value: number | undefined): number {
  const raw = value ?? M3_3_HV_H3_MAX_POINTS_PER_SERIES_DEFAULT;
  if (!Number.isFinite(raw) || raw < 1) {
    throw new M3_3HvH3InvalidMaxPointsError(value);
  }
  return Math.min(Math.floor(raw), M3_3_HV_H3_MAX_POINTS_PER_SERIES_HARD);
}
