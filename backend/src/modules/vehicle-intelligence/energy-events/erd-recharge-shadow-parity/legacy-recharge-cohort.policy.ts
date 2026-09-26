import {
  EnergyEventKind,
  type Prisma,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';

/**
 * LEGACY_DIRECT_DIMO_RECHARGE cohort predicate.
 *
 * Matches rows written by EnergyEventsService.detectEnergyEvents → upsertSegment
 * (direct DIMO recharge persistence without canonical HvChargeSession authority).
 *
 * Excludes SYNQDRIVE_ERD_RECHARGE_PROJECTION and non-RECHARGE kinds (REFUEL).
 */
export function isLegacyDirectDimoRechargeRow(row: {
  kind: EnergyEventKind;
  detectionMechanism: string | null;
  canonicalChargeSessionId: string | null;
  detectionSource: VehicleEnergyEventDetectionSource | null;
  dimoSegmentId: string | null;
}): boolean {
  if (row.kind !== EnergyEventKind.RECHARGE) return false;
  if (row.detectionMechanism !== 'recharge') return false;
  if (row.canonicalChargeSessionId != null) return false;
  if (row.dimoSegmentId == null || row.dimoSegmentId.trim() === '') return false;
  if (
    row.detectionSource ===
    VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION
  ) {
    return false;
  }
  if (row.detectionSource == null) return true;
  return row.detectionSource === VehicleEnergyEventDetectionSource.DIMO_NATIVE;
}

export function buildLegacyDirectDimoRechargeWhere(input: {
  vehicleId: string;
  windowFrom: Date;
  windowTo: Date;
}): Prisma.VehicleEnergyEventWhereInput {
  return {
    vehicleId: input.vehicleId,
    kind: EnergyEventKind.RECHARGE,
    detectionMechanism: 'recharge',
    canonicalChargeSessionId: null,
    dimoSegmentId: { not: null },
    // Positive whitelist only — do NOT combine with NOT { detectionSource: … } because
    // SQL NULL semantics exclude detection_source IS NULL rows before OR can admit them.
    OR: [{ detectionSource: null }, { detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE }],
    startTime: { lte: input.windowTo },
    endTime: { gte: input.windowFrom },
  };
}
