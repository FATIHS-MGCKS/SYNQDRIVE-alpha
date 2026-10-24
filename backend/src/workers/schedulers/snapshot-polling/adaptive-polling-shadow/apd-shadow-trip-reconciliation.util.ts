import type { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  apdShadowLegacyTripEvidenceExcludedTripIdSet,
  isApdShadowLegacyTripEvidenceExclusionVehicle,
} from './apd-shadow-legacy-trip-evidence-exclusion.contract';

export function buildApdShadowReconciliationTripIntervalWhere(
  vehicleId: string,
  at: Date,
  options: { applyLegacyTripEvidenceExclusion: boolean },
): Prisma.VehicleTripWhereInput {
  const where: Prisma.VehicleTripWhereInput = {
    vehicleId,
    startTime: { lte: at },
    OR: [{ endTime: null }, { endTime: { gte: at } }],
  };
  if (
    options.applyLegacyTripEvidenceExclusion &&
    isApdShadowLegacyTripEvidenceExclusionVehicle(vehicleId)
  ) {
    where.id = { notIn: [...apdShadowLegacyTripEvidenceExcludedTripIdSet()] };
  }
  return where;
}

/**
 * Frozen PS1 semantics for APDS shadow: reconciliation when poll start is outside
 * vehicle_trips intervals, minus frozen invalid legacy development trip evidence.
 */
export async function isVehicleInActiveTripAtMs(
  prisma: PrismaService,
  vehicleId: string,
  atMs: number,
): Promise<boolean> {
  const at = new Date(atMs);
  const trip = await prisma.vehicleTrip.findFirst({
    where: buildApdShadowReconciliationTripIntervalWhere(vehicleId, at, {
      applyLegacyTripEvidenceExclusion: true,
    }),
    select: { id: true },
  });
  return trip != null;
}

/**
 * True when legacy excluded trips alone cover `atMs` but no other interval does.
 * Used for shadow observability only — does not change safety overlays.
 */
export async function apdShadowLegacyTripEvidenceExclusionRelievedReconciliationAtMs(
  prisma: PrismaService,
  vehicleId: string,
  atMs: number,
): Promise<boolean> {
  if (!isApdShadowLegacyTripEvidenceExclusionVehicle(vehicleId)) {
    return false;
  }
  const at = new Date(atMs);
  const withExclusion = await prisma.vehicleTrip.findFirst({
    where: buildApdShadowReconciliationTripIntervalWhere(vehicleId, at, {
      applyLegacyTripEvidenceExclusion: true,
    }),
    select: { id: true },
  });
  if (withExclusion != null) {
    return false;
  }
  const withoutExclusion = await prisma.vehicleTrip.findFirst({
    where: buildApdShadowReconciliationTripIntervalWhere(vehicleId, at, {
      applyLegacyTripEvidenceExclusion: false,
    }),
    select: { id: true },
  });
  return withoutExclusion != null;
}
