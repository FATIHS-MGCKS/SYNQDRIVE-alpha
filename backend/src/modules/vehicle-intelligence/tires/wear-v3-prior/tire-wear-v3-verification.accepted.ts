import type { TireEvidenceSource } from '@prisma/client';
import type { WheelPos } from '../tire-evidence-provenance';
import {
  isGroundTruthEvidenceSource,
  mapLegacyMeasurementSourceToEvidence,
} from '../tire-evidence-source';
import {
  filterMeasurementsForMountPeriod,
  type MountPeriodWindow,
} from './tire-wear-v3-prior.lifecycle';
import type { TireWearV3WheelVerificationState } from './tire-wear-v3-verification.types';

export interface RawTreadMeasurementRow {
  id: string;
  measuredAt: Date;
  odometerAtMeasurement: number | null;
  frontLeftMm: number | null;
  frontRightMm: number | null;
  rearLeftMm: number | null;
  rearRightMm: number | null;
  source: string;
  evidenceSource: TireEvidenceSource | null;
}

export interface AcceptedVerificationMeasurement {
  id: string;
  measuredAt: Date;
  odometerKm: number;
  wheelsWithTread: WheelPos[];
}

const WHEEL_FIELDS: { pos: WheelPos; field: keyof RawTreadMeasurementRow }[] = [
  { pos: 'FL', field: 'frontLeftMm' },
  { pos: 'FR', field: 'frontRightMm' },
  { pos: 'RL', field: 'rearLeftMm' },
  { pos: 'RR', field: 'rearRightMm' },
];

export function resolveMeasurementEvidenceSource(
  row: RawTreadMeasurementRow,
): TireEvidenceSource | null {
  if (row.evidenceSource != null) {
    return row.evidenceSource;
  }
  return mapLegacyMeasurementSourceToEvidence(row.source);
}

/** Model-projected calibration rows must not reset verification cadence. */
export function isVerificationExcludedLegacySource(source: string): boolean {
  const normalized = source.trim().toLowerCase();
  return (
    normalized === 'calibration' ||
    normalized === 'ai_estimate' ||
    normalized === 'ai_agent'
  );
}

export function isAcceptedVerificationMeasurement(
  row: RawTreadMeasurementRow,
): { accepted: boolean; flags: string[] } {
  const flags: string[] = [];
  if (isVerificationExcludedLegacySource(row.source)) {
    flags.push('VERIFICATION_SOURCE_EXCLUDED');
    return { accepted: false, flags };
  }

  const evidence = resolveMeasurementEvidenceSource(row);
  if (!isGroundTruthEvidenceSource(evidence)) {
    flags.push('VERIFICATION_NOT_GROUND_TRUTH');
    return { accepted: false, flags };
  }

  if (
    row.odometerAtMeasurement == null ||
    !Number.isFinite(row.odometerAtMeasurement)
  ) {
    flags.push('VERIFICATION_ODOMETER_MISSING');
    return { accepted: false, flags };
  }

  const wheels = wheelsWithTreadFromRow(row);
  if (wheels.length === 0) {
    flags.push('VERIFICATION_NO_TREAD_VALUES');
    return { accepted: false, flags };
  }

  return { accepted: true, flags };
}

export function wheelsWithTreadFromRow(row: RawTreadMeasurementRow): WheelPos[] {
  const out: WheelPos[] = [];
  for (const { pos, field } of WHEEL_FIELDS) {
    const v = row[field];
    if (v != null && Number.isFinite(v)) {
      out.push(pos);
    }
  }
  return out;
}

export function listAcceptedVerificationMeasurements(
  rows: RawTreadMeasurementRow[],
  mountPeriod: MountPeriodWindow | null,
): AcceptedVerificationMeasurement[] {
  const inPeriod = filterMeasurementsForMountPeriod(rows, mountPeriod);
  const accepted: AcceptedVerificationMeasurement[] = [];

  for (const row of inPeriod) {
    const check = isAcceptedVerificationMeasurement(row);
    if (!check.accepted) continue;
    accepted.push({
      id: row.id,
      measuredAt: row.measuredAt,
      odometerKm: row.odometerAtMeasurement!,
      wheelsWithTread: wheelsWithTreadFromRow(row),
    });
  }

  return accepted.sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
}

export function latestAcceptedVerificationMeasurement(
  accepted: AcceptedVerificationMeasurement[],
): AcceptedVerificationMeasurement | null {
  if (accepted.length === 0) return null;
  return accepted[accepted.length - 1]!;
}

export function buildPerWheelVerificationState(
  accepted: AcceptedVerificationMeasurement[],
): TireWearV3WheelVerificationState[] {
  const covered = new Set<WheelPos>();
  for (const row of accepted) {
    for (const w of row.wheelsWithTread) {
      covered.add(w);
    }
  }
  return (['FL', 'FR', 'RL', 'RR'] as WheelPos[]).map((position) => ({
    position,
    hasAcceptedVerification: covered.has(position),
  }));
}
