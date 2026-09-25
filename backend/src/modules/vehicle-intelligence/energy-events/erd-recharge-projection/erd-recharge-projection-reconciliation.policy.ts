import type { VehicleEnergyEvent } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { ErdRechargeProjectionDraft } from './erd-recharge-projection-mapper';
import { ERD_RECHARGE_PHYSICAL_PROJECTION_KEY_PREFIX } from './erd-recharge-projection.constants';

/** Projection-owned mutable fields (E5.2 same-authority reconciliation). */
export const ERD_RECHARGE_PROJECTION_MUTABLE_FIELD_NAMES = [
  'dimoSegmentId',
  'startTime',
  'endTime',
  'durationSeconds',
  'startLatitude',
  'startLongitude',
  'endLatitude',
  'endLongitude',
  'socDeltaPercent',
  'energyDeltaKwh',
  'odometerStartKm',
  'odometerEndKm',
  'confidence',
  'rawDetectionMeta',
] as const;

export type ErdRechargeProjectionMutableFieldName =
  (typeof ERD_RECHARGE_PROJECTION_MUTABLE_FIELD_NAMES)[number];

function jsonEqual(a: unknown, b: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((entry) => normalize(entry));
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const normalized = normalize(record[key]);
      if (normalized === null) continue;
      out[key] = normalized;
    }
    return out;
  };
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function floatEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  const left = a ?? null;
  const right = b ?? null;
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < 1e-9;
}

function datesEqual(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

export function readAnchorSegmentFingerprintFromVee(row: VehicleEnergyEvent): string | null {
  const meta = row.rawDetectionMeta;
  if (meta != null && typeof meta === 'object') {
    const anchor = (meta as { anchorSegmentFingerprint?: unknown }).anchorSegmentFingerprint;
    if (typeof anchor === 'string' && anchor.trim() !== '') {
      return anchor;
    }
  }
  if (row.sourceEventKey?.startsWith(ERD_RECHARGE_PHYSICAL_PROJECTION_KEY_PREFIX)) {
    const suffix = row.sourceEventKey.slice(ERD_RECHARGE_PHYSICAL_PROJECTION_KEY_PREFIX.length);
    const colon = suffix.indexOf(':');
    if (colon > 0 && colon < suffix.length - 1) {
      return suffix.slice(colon + 1);
    }
  }
  return null;
}

export function listProjectionDraftPersistedMismatches(
  row: VehicleEnergyEvent,
  draft: ErdRechargeProjectionDraft,
): string[] {
  const mismatches: string[] = [];
  if (row.dimoSegmentId !== draft.dimoSegmentId) {
    mismatches.push(`dimoSegmentId row=${row.dimoSegmentId} draft=${draft.dimoSegmentId}`);
  }
  if (!datesEqual(row.startTime, draft.startTime)) {
    mismatches.push(`startTime row=${row.startTime.toISOString()} draft=${draft.startTime.toISOString()}`);
  }
  if (!datesEqual(row.endTime, draft.endTime)) {
    mismatches.push(`endTime row=${row.endTime.toISOString()} draft=${draft.endTime.toISOString()}`);
  }
  if (row.durationSeconds !== draft.durationSeconds) {
    mismatches.push(`durationSeconds row=${row.durationSeconds} draft=${draft.durationSeconds}`);
  }
  if (!floatEqual(row.startLatitude, draft.startLatitude)) {
    mismatches.push(`startLatitude row=${row.startLatitude} draft=${draft.startLatitude}`);
  }
  if (!floatEqual(row.startLongitude, draft.startLongitude)) {
    mismatches.push(`startLongitude row=${row.startLongitude} draft=${draft.startLongitude}`);
  }
  if (!floatEqual(row.endLatitude, draft.endLatitude)) {
    mismatches.push(`endLatitude row=${row.endLatitude} draft=${draft.endLatitude}`);
  }
  if (!floatEqual(row.endLongitude, draft.endLongitude)) {
    mismatches.push(`endLongitude row=${row.endLongitude} draft=${draft.endLongitude}`);
  }
  if (!floatEqual(row.socDeltaPercent, draft.socDeltaPercent)) {
    mismatches.push(`socDeltaPercent row=${row.socDeltaPercent} draft=${draft.socDeltaPercent}`);
  }
  if (!floatEqual(row.energyDeltaKwh, draft.energyDeltaKwh)) {
    mismatches.push(`energyDeltaKwh row=${row.energyDeltaKwh} draft=${draft.energyDeltaKwh}`);
  }
  if (!floatEqual(row.odometerStartKm, draft.odometerStartKm)) {
    mismatches.push(`odometerStartKm row=${row.odometerStartKm} draft=${draft.odometerStartKm}`);
  }
  if (!floatEqual(row.odometerEndKm, draft.odometerEndKm)) {
    mismatches.push(`odometerEndKm row=${row.odometerEndKm} draft=${draft.odometerEndKm}`);
  }
  if (row.confidence !== draft.confidence) {
    mismatches.push(`confidence row=${row.confidence} draft=${draft.confidence}`);
  }
  if (!jsonEqual(row.rawDetectionMeta, draft.rawDetectionMeta)) {
    mismatches.push(
      `rawDetectionMeta row=${JSON.stringify(row.rawDetectionMeta)} draft=${JSON.stringify(draft.rawDetectionMeta)}`,
    );
  }
  return mismatches;
}

export function projectionDraftMatchesPersistedRow(
  row: VehicleEnergyEvent,
  draft: ErdRechargeProjectionDraft,
): boolean {
  return listProjectionDraftPersistedMismatches(row, draft).length === 0;
}

export function buildProjectionReconcileUpdate(
  draft: ErdRechargeProjectionDraft,
): {
  dimoSegmentId: string | null;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  confidence: VehicleEnergyEvent['confidence'];
  rawDetectionMeta: Prisma.InputJsonValue;
} {
  return {
    dimoSegmentId: draft.dimoSegmentId,
    startTime: draft.startTime,
    endTime: draft.endTime,
    durationSeconds: draft.durationSeconds,
    startLatitude: draft.startLatitude,
    startLongitude: draft.startLongitude,
    endLatitude: draft.endLatitude,
    endLongitude: draft.endLongitude,
    socDeltaPercent: draft.socDeltaPercent,
    energyDeltaKwh: draft.energyDeltaKwh,
    odometerStartKm: draft.odometerStartKm,
    odometerEndKm: draft.odometerEndKm,
    confidence: draft.confidence,
    rawDetectionMeta: draft.rawDetectionMeta as Prisma.InputJsonValue,
  };
}

/** E5.3 — reassign canonical session pointer while preserving immutable projection identity. */
export function buildProjectionHandoffUpdate(
  draft: ErdRechargeProjectionDraft,
  newCanonicalChargeSessionId: string,
) {
  return {
    ...buildProjectionReconcileUpdate(draft),
    canonicalChargeSessionId: newCanonicalChargeSessionId,
  };
}
