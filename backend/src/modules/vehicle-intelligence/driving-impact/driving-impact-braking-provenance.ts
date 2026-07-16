/**
 * Driving Impact braking kinematic provenance (P42).
 *
 * Separates provider-classified braking counts from measured/reconstructed
 * kinematics vs severity-derived ESTIMATED_PROXY deceleration and end speeds.
 */

import { DrivingEventType } from '@prisma/client';
import {
  meanBrakeEnergyPerKm as computeMeanBrakeEnergyPerKm,
  percentile95,
} from './driving-impact-scorer';
import type { DrivingImpactHealthEligibility } from './driving-impact-provenance';

export const BRAKING_PROVENANCE_VERSION = 'braking-provenance-v1';

/** How end speed was derived for a braking row. */
export type BrakingEndSpeedSource =
  | 'RECONSTRUCTED'
  | 'MEASURED_DELTA'
  | 'ESTIMATED_PROXY'
  | 'NONE';

/** How peak deceleration was derived for a braking row. */
export type BrakingDecelSource = 'RECONSTRUCTED' | 'ESTIMATED_PROXY' | 'NONE';

export type ClassifiedBrakingRow = {
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  peakDecelMs2: number | null;
  endSpeedSource: BrakingEndSpeedSource;
  decelSource: BrakingDecelSource;
  /** Native provider harsh/extreme classification — counts stay provider-truth. */
  providerClassified: boolean;
};

export type NativeDrivingEventBrakingInput = {
  eventType: DrivingEventType | string;
  speedKmh: number | null;
  severity: number | null;
  deltaKmh: number | null;
};

export type HfBrakingRowInput = {
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  peakValue: number | null;
};

export type BrakingStatistics = {
  p95NegativeDecel: number;
  p95NegativeDecelMeasured: number;
  p95NegativeDecelProxy: number;
  meanBrakeEnergyPerKm: number;
  meanBrakeEnergyProxyPerKm: number;
  stopDensity: number;
  highSpeedBrakeShare: number;
  reconstructedKinematicCount: number;
  measuredDeltaKinematicCount: number;
  proxyKinematicCount: number;
  proxyKinematicShare: number;
};

export type BrakingProvenanceSummary = {
  version: string;
  p95NegativeDecelMeasured: number;
  p95NegativeDecelProxy: number;
  meanBrakeEnergyProxyPerKm: number;
  proxyKinematicShare: number;
  reconstructedKinematicCount: number;
  measuredDeltaKinematicCount: number;
  proxyKinematicCount: number;
};

const END_SPEED_PROXY_FACTOR = 0.72;

function isExtremeBraking(eventType: string): boolean {
  return eventType === DrivingEventType.EXTREME_BRAKING;
}

/** Severity-derived deceleration proxy for native provider events (ESTIMATED_PROXY). */
export function synthesizeNativeBrakeDecelProxy(
  eventType: string,
  severity: number | null,
): number {
  return isExtremeBraking(eventType)
    ? Math.min(12, 7.5 + (severity ?? 0.9) * 4)
    : Math.min(9, 4.5 + (severity ?? 0.6) * 5);
}

/** Proxy end speed — only for proxy energy, never treated as measured. */
export function synthesizeProxyEndSpeedKmh(startSpeedKmh: number): number {
  return Math.max(0, startSpeedKmh * END_SPEED_PROXY_FACTOR);
}

export function mapNativeDrivingEventToBrakingRow(
  event: NativeDrivingEventBrakingInput,
): ClassifiedBrakingRow {
  const start = event.speedKmh ?? null;
  let end: number | null = null;
  let endSpeedSource: BrakingEndSpeedSource = 'NONE';

  if (start != null && event.deltaKmh != null) {
    end = Math.max(0, start - event.deltaKmh);
    endSpeedSource = 'MEASURED_DELTA';
  }

  return {
    startSpeedKmh: start,
    endSpeedKmh: end,
    peakDecelMs2: synthesizeNativeBrakeDecelProxy(event.eventType, event.severity),
    endSpeedSource,
    decelSource: 'ESTIMATED_PROXY',
    providerClassified: true,
  };
}

export function mapHfBrakingRow(row: HfBrakingRowInput): ClassifiedBrakingRow {
  return {
    startSpeedKmh: row.startSpeedKmh,
    endSpeedKmh: row.endSpeedKmh,
    peakDecelMs2: row.peakValue,
    endSpeedSource: row.endSpeedKmh != null ? 'RECONSTRUCTED' : 'NONE',
    decelSource: row.peakValue != null && row.peakValue > 0 ? 'RECONSTRUCTED' : 'NONE',
    providerClassified: false,
  };
}

function hasTrustworthyEndSpeed(row: ClassifiedBrakingRow): boolean {
  return (
    row.endSpeedSource === 'RECONSTRUCTED' || row.endSpeedSource === 'MEASURED_DELTA'
  );
}

function energyEligibleRows(rows: ClassifiedBrakingRow[]): Array<{
  startSpeedKmh: number;
  endSpeedKmh: number;
}> {
  return rows
    .filter(
      (row) =>
        row.startSpeedKmh != null &&
        row.endSpeedKmh != null &&
        hasTrustworthyEndSpeed(row),
    )
    .map((row) => ({
      startSpeedKmh: row.startSpeedKmh!,
      endSpeedKmh: row.endSpeedKmh!,
    }));
}

function proxyEnergyEligibleRows(rows: ClassifiedBrakingRow[]): Array<{
  startSpeedKmh: number;
  endSpeedKmh: number;
}> {
  return rows
    .filter((row) => row.startSpeedKmh != null && row.startSpeedKmh > 5)
    .map((row) => {
      const start = row.startSpeedKmh!;
      const end =
        row.endSpeedSource === 'MEASURED_DELTA' || row.endSpeedSource === 'RECONSTRUCTED'
          ? row.endSpeedKmh!
          : synthesizeProxyEndSpeedKmh(start);
      return { startSpeedKmh: start, endSpeedKmh: end };
    })
    .filter((row) => row.endSpeedKmh != null);
}

export function computeBrakingStatistics(
  rows: ClassifiedBrakingRow[],
  distanceKm: number,
  options: {
    stopSpeedThresholdKmh: number;
    highSpeedBrakeThresholdKmh: number;
  },
): BrakingStatistics {
  const reconstructedKinematicCount = rows.filter(
    (row) => row.decelSource === 'RECONSTRUCTED',
  ).length;
  const measuredDeltaKinematicCount = rows.filter(
    (row) => row.endSpeedSource === 'MEASURED_DELTA',
  ).length;
  const proxyKinematicCount = rows.filter(
    (row) => row.decelSource === 'ESTIMATED_PROXY',
  ).length;

  const kinematicTotal =
    reconstructedKinematicCount + measuredDeltaKinematicCount + proxyKinematicCount;
  const proxyKinematicShare =
    kinematicTotal > 0
      ? Math.round((proxyKinematicCount / kinematicTotal) * 1000) / 1000
      : 0;

  const measuredDecelValues = rows
    .filter((row) => row.decelSource === 'RECONSTRUCTED' && (row.peakDecelMs2 ?? 0) > 0)
    .map((row) => row.peakDecelMs2!);

  const proxyDecelValues = rows
    .filter((row) => row.decelSource === 'ESTIMATED_PROXY' && (row.peakDecelMs2 ?? 0) > 0)
    .map((row) => row.peakDecelMs2!);

  const p95NegativeDecelMeasured = percentile95(measuredDecelValues);
  const p95NegativeDecelProxy = percentile95(proxyDecelValues);
  const p95NegativeDecel =
    measuredDecelValues.length > 0 ? p95NegativeDecelMeasured : p95NegativeDecelProxy;

  const highSpeedBrakeCount = rows.filter(
    (row) => (row.startSpeedKmh ?? 0) >= options.highSpeedBrakeThresholdKmh,
  ).length;
  const highSpeedBrakeShare =
    rows.length > 0
      ? Math.round((highSpeedBrakeCount / rows.length) * 100) / 100
      : 0;

  const stopCount = rows.filter(
    (row) =>
      hasTrustworthyEndSpeed(row) &&
      (row.endSpeedKmh ?? 99) < options.stopSpeedThresholdKmh,
  ).length;
  const stopDensity =
    distanceKm > 0 ? Math.round((stopCount / distanceKm) * 100) / 100 : 0;

  const meanBrakeEnergyPerKm = computeMeanBrakeEnergyPerKm(
    energyEligibleRows(rows),
    distanceKm,
  );
  const meanBrakeEnergyProxyPerKm = computeMeanBrakeEnergyPerKm(
    proxyEnergyEligibleRows(rows),
    distanceKm,
  );

  return {
    p95NegativeDecel,
    p95NegativeDecelMeasured,
    p95NegativeDecelProxy,
    meanBrakeEnergyPerKm,
    meanBrakeEnergyProxyPerKm,
    stopDensity,
    highSpeedBrakeShare,
    reconstructedKinematicCount,
    measuredDeltaKinematicCount,
    proxyKinematicCount,
    proxyKinematicShare,
  };
}

export function buildBrakingProvenanceSummary(
  stats: BrakingStatistics,
): BrakingProvenanceSummary {
  return {
    version: BRAKING_PROVENANCE_VERSION,
    p95NegativeDecelMeasured: stats.p95NegativeDecelMeasured,
    p95NegativeDecelProxy: stats.p95NegativeDecelProxy,
    meanBrakeEnergyProxyPerKm: stats.meanBrakeEnergyProxyPerKm,
    proxyKinematicShare: stats.proxyKinematicShare,
    reconstructedKinematicCount: stats.reconstructedKinematicCount,
    measuredDeltaKinematicCount: stats.measuredDeltaKinematicCount,
    proxyKinematicCount: stats.proxyKinematicCount,
  };
}

const ELIGIBILITY_RANK: Record<DrivingImpactHealthEligibility, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  NONE: 0,
};

const RANK_TO_ELIGIBILITY: DrivingImpactHealthEligibility[] = [
  'NONE',
  'LOW',
  'MEDIUM',
  'HIGH',
];

/** Reduce evidence strength when brake kinematics are mostly ESTIMATED_PROXY. */
export function reduceHealthEligibilityForBrakeProxy(
  eligibility: DrivingImpactHealthEligibility,
  proxyKinematicShare: number,
): DrivingImpactHealthEligibility {
  if (proxyKinematicShare < 0.5 || eligibility === 'NONE') {
    return eligibility;
  }
  const reduced = Math.max(0, ELIGIBILITY_RANK[eligibility] - 1);
  return RANK_TO_ELIGIBILITY[reduced];
}
