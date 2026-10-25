import type { TireOdometerAnchorStatus } from '@prisma/client';
import type { TireWearV3MeasurementPoint } from './tire-wear-v3-prior.types';

export type MountPeriodWindow = {
  id: string | null;
  installedAt: Date;
  removedAt: Date | null;
  installedOdometerKm: number | null;
  odometerAnchorStatus: TireOdometerAnchorStatus | null;
};

export type LedgerRowForLifecycle = {
  tripId: string;
  distanceKm: number;
  revisionNumber: number;
  sourceFingerprint: string;
  tripStartedAt: Date;
};

export function resolveActiveMountPeriod(
  periods: MountPeriodWindow[],
  asOf: Date,
  setupFallback: {
    installedAt: Date | null;
    removedAt: Date | null;
    installedOdometerKm: number | null;
    odometerAnchorStatus: TireOdometerAnchorStatus | null;
  },
): MountPeriodWindow | null {
  const sorted = [...periods].sort(
    (a, b) => a.installedAt.getTime() - b.installedAt.getTime(),
  );
  const active = sorted.filter(
    (p) =>
      p.installedAt.getTime() <= asOf.getTime() &&
      (p.removedAt == null || p.removedAt.getTime() > asOf.getTime()),
  );
  if (active.length > 0) {
    return active[active.length - 1]!;
  }
  if (setupFallback.installedAt) {
    if (
      setupFallback.removedAt &&
      setupFallback.removedAt.getTime() <= asOf.getTime()
    ) {
      return null;
    }
    return {
      id: null,
      installedAt: setupFallback.installedAt,
      removedAt: setupFallback.removedAt,
      installedOdometerKm: setupFallback.installedOdometerKm,
      odometerAnchorStatus: setupFallback.odometerAnchorStatus,
    };
  }
  return null;
}

export function isInstantInMountPeriod(
  instant: Date,
  period: MountPeriodWindow,
): boolean {
  const t = instant.getTime();
  if (t < period.installedAt.getTime()) return false;
  if (period.removedAt != null && t >= period.removedAt.getTime()) return false;
  return true;
}

export function filterLedgerRowsForMountPeriod(
  rows: LedgerRowForLifecycle[],
  period: MountPeriodWindow | null,
): LedgerRowForLifecycle[] {
  if (!period) return [];
  return rows.filter((row) => isInstantInMountPeriod(row.tripStartedAt, period));
}

export function sumLedgerDistanceKm(rows: LedgerRowForLifecycle[]): number {
  return rows.reduce(
    (sum, row) => sum + (Number.isFinite(row.distanceKm) ? row.distanceKm : 0),
    0,
  );
}

export function stableLedgerContentDigest(rows: LedgerRowForLifecycle[]): string {
  const parts = rows
    .map(
      (r) =>
        `${r.tripId}:${r.revisionNumber}:${r.sourceFingerprint}:${r.distanceKm}`,
    )
    .sort();
  return parts.join('|');
}

export function filterMeasurementsForMountPeriod<
  T extends { measuredAt: Date },
>(measurements: T[], period: MountPeriodWindow | null): T[] {
  if (!period) return [];
  return measurements.filter((m) => isInstantInMountPeriod(m.measuredAt, period));
}

/**
 * Select the longest contiguous odometer segment (monotonic non-decreasing)
 * within one mount period for rate calibration.
 */
export function selectRateCalibrationSegment(
  points: TireWearV3MeasurementPoint[],
): { segment: TireWearV3MeasurementPoint[]; flags: string[] } {
  const flags: string[] = [];
  const withOdo = points
    .filter((p) => p.odometerKm != null && Number.isFinite(p.odometerKm))
    .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());

  if (withOdo.length < 2) {
    return { segment: withOdo, flags: ['RATE_INSUFFICIENT_POINTS'] };
  }

  let best: TireWearV3MeasurementPoint[] = [];
  let current: TireWearV3MeasurementPoint[] = [withOdo[0]!];

  for (let i = 1; i < withOdo.length; i += 1) {
    const prev = current[current.length - 1]!;
    const next = withOdo[i]!;
    if (next.odometerKm! < prev.odometerKm!) {
      flags.push('ODOMETER_NON_MONOTONIC_SEGMENT_SPLIT');
      if (current.length > best.length) best = [...current];
      current = [next];
      continue;
    }
    current.push(next);
  }
  if (current.length > best.length) best = current;

  if (withOdo.length > best.length) {
    flags.push('MEASUREMENTS_OUTSIDE_RATE_SEGMENT_EXCLUDED');
  }

  return { segment: best, flags };
}

export function validateOdometerContext(args: {
  anchorOdometerKm: number | null;
  currentOdometerKm: number | null;
  ledgerDistanceKm: number;
  measurementOdometers: number[];
}): { valid: boolean; flags: string[] } {
  const flags: string[] = [];
  const { anchorOdometerKm, currentOdometerKm, ledgerDistanceKm, measurementOdometers } =
    args;

  if (anchorOdometerKm == null || currentOdometerKm == null) {
    return { valid: false, flags: ['ODOMETER_CONTEXT_INCOMPLETE'] };
  }

  if (currentOdometerKm + 1 < anchorOdometerKm) {
    flags.push('ODOMETER_RETROGRADE_CURRENT_VS_ANCHOR');
    return { valid: false, flags };
  }

  const impliedMax = anchorOdometerKm + ledgerDistanceKm;
  if (currentOdometerKm > impliedMax + 50) {
    flags.push('ODOMETER_STALE_OR_JUMP_AHEAD_OF_LEDGER');
  }

  for (let i = 1; i < measurementOdometers.length; i += 1) {
    if (measurementOdometers[i]! < measurementOdometers[i - 1]! - 0.01) {
      flags.push('ODOMETER_RETROGRADE_MEASUREMENTS');
      return { valid: false, flags };
    }
  }

  for (const o of measurementOdometers) {
    if (o < anchorOdometerKm - 1) {
      flags.push('MEASUREMENT_BEFORE_ANCHOR');
      return { valid: false, flags };
    }
    if (o > currentOdometerKm + 1) {
      flags.push('MEASUREMENT_AHEAD_OF_CURRENT_ODOMETER');
      return { valid: false, flags };
    }
  }

  return { valid: true, flags };
}

export function hasRotationDuringMountPeriod(
  rotationEvents: Array<{ changedAt: Date }>,
  period: MountPeriodWindow,
): boolean {
  return rotationEvents.some((e) => isInstantInMountPeriod(e.changedAt, period));
}
