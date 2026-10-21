import type { HvMeasurementQualitySessionResult } from './hv-measurement-quality.types';

export interface HvMeasurementCapacitySamples {
  qualifiedM3CapacitiesKwh: number[];
  exploratoryCapacitiesKwh: number[];
}

export function collectCapacitySamples(
  sessions: HvMeasurementQualitySessionResult[],
): HvMeasurementCapacitySamples {
  const qualifiedM3CapacitiesKwh: number[] = [];
  const exploratoryCapacitiesKwh: number[] = [];

  for (const session of sessions) {
    const kwh = session.m3EstimatedCapacityKwh;
    if (kwh == null || !Number.isFinite(kwh)) continue;
    if (session.m3GateEligible) {
      qualifiedM3CapacitiesKwh.push(kwh);
    } else {
      exploratoryCapacitiesKwh.push(kwh);
    }
  }

  return { qualifiedM3CapacitiesKwh, exploratoryCapacitiesKwh };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function computeQualifiedCapacityMedianKwh(
  sessions: HvMeasurementQualitySessionResult[],
): number | null {
  const { qualifiedM3CapacitiesKwh } = collectCapacitySamples(sessions);
  return median(qualifiedM3CapacitiesKwh);
}

export function computeExploratoryCapacityMedianKwh(
  sessions: HvMeasurementQualitySessionResult[],
): number | null {
  const { exploratoryCapacitiesKwh } = collectCapacitySamples(sessions);
  return median(exploratoryCapacitiesKwh);
}

export function countExploratoryMeasurements(
  sessions: HvMeasurementQualitySessionResult[],
): number {
  return sessions.filter((s) => s.qualityLevel !== 'Q1').length;
}

export function countPolicyValidatedMeasurements(
  sessions: HvMeasurementQualitySessionResult[],
): number {
  return sessions.filter((s) => s.m3GateEligible).length;
}

/** Vehicle score ignores Q1 history so stale exclusions do not dilute current quality. */
export function resolveVehicleQualityScore(
  sessions: HvMeasurementQualitySessionResult[],
): number {
  const scored = sessions.filter((s) => s.qualityLevel !== 'Q1');
  if (scored.length === 0) return 0;
  return Math.round(
    scored.reduce((sum, s) => sum + s.qualityScore, 0) / scored.length,
  );
}

export function resolveQualityLevelCounts(
  sessions: HvMeasurementQualitySessionResult[],
): Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number> {
  const counts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  for (const s of sessions) {
    counts[s.qualityLevel] += 1;
  }
  return counts;
}
