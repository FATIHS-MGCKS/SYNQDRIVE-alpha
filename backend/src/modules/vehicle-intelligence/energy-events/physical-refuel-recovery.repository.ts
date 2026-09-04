import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import { computeOrphanCreatedAtRange } from './physical-refuel-orphan-range.util';
import { isV2CoordinateEligibleForEnrichment } from './physical-refuel-coordinate.policy';

export interface PhysicalRefuelRecoveryWorkItem {
  vehicleId: string;
  triggerEventId: string;
  reason:
    | 'orphan_refuel'
    | 'settlement_due'
    | 'lost_enqueue'
    | 'coordinate_retry';
}

export interface PhysicalRefuelRecoveryQuota {
  settlementDue: number;
  orphanRefuel: number;
  lostEnqueue: number;
  coordinateRetry: number;
}

export function computePhysicalRefuelRecoveryQuota(batchSize: number): PhysicalRefuelRecoveryQuota {
  const settlementDue = Math.max(1, Math.ceil(batchSize * 0.35));
  const orphanRefuel = Math.max(1, Math.ceil(batchSize * 0.25));
  const lostEnqueue = Math.max(1, Math.ceil(batchSize * 0.2));
  const coordinateRetry = Math.max(0, batchSize - settlementDue - orphanRefuel - lostEnqueue);
  return { settlementDue, orphanRefuel, lostEnqueue, coordinateRetry };
}

export async function findPhysicalRefuelRecoveryWork(
  prisma: PrismaClient,
  params: {
    batchSize: number;
    asOf: Date;
    v2OwnershipCutoverAt: Date;
    orphanLookbackFrom: Date;
  },
): Promise<PhysicalRefuelRecoveryWorkItem[]> {
  const work: PhysicalRefuelRecoveryWorkItem[] = [];
  const seenVehicles = new Set<string>();
  const quota = computePhysicalRefuelRecoveryQuota(params.batchSize);

  const pushWork = (item: PhysicalRefuelRecoveryWorkItem) => {
    if (seenVehicles.has(item.vehicleId)) return false;
    if (work.length >= params.batchSize) return false;
    seenVehicles.add(item.vehicleId);
    work.push(item);
    return true;
  };

  const dueReconciliations = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: {
      finalityState: {
        in: [PhysicalRefuelFinalityState.PROVISIONAL, PhysicalRefuelFinalityState.SETTLING],
      },
      nextReconciliationAt: { lte: params.asOf },
    },
    orderBy: { nextReconciliationAt: 'asc' },
    take: quota.settlementDue,
    select: { vehicleId: true, energyEventId: true },
  });

  for (const row of dueReconciliations) {
    pushWork({
      vehicleId: row.vehicleId,
      triggerEventId: row.energyEventId,
      reason: 'settlement_due',
    });
  }

  if (work.length >= params.batchSize) return work;

  const orphanCreatedAt = computeOrphanCreatedAtRange({
    v2OwnershipCutoverAt: params.v2OwnershipCutoverAt,
    orphanLookbackFrom: params.orphanLookbackFrom,
    asOf: params.asOf,
  });

  const orphans = await prisma.vehicleEnergyEvent.findMany({
    where: {
      kind: EnergyEventKind.REFUEL,
      createdAt: orphanCreatedAt,
      refuelReconciliation: { is: null },
    },
    orderBy: { createdAt: 'asc' },
    take: quota.orphanRefuel,
    select: { id: true, vehicleId: true },
  });

  for (const row of orphans) {
    pushWork({
      vehicleId: row.vehicleId,
      triggerEventId: row.id,
      reason: 'orphan_refuel',
    });
  }

  if (work.length >= params.batchSize) return work;

  const lostEnqueue = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: {
      enrichmentEligible: true,
      enrichmentEnqueuedAt: null,
      finalityState: {
        in: [
          PhysicalRefuelFinalityState.FINAL_CANONICAL,
          PhysicalRefuelFinalityState.FINAL_DISTINCT,
        ],
      },
      coordinateLatitude: { not: null },
      coordinateSource: { not: null },
      energyEvent: {
        fuelStationEnrichment: { is: null },
      },
    },
    orderBy: { reconciledAt: 'asc' },
    take: quota.lostEnqueue,
    select: { vehicleId: true, energyEventId: true, coordinateLatitude: true, coordinateLongitude: true, coordinateSource: true },
  });

  for (const row of lostEnqueue) {
    if (
      !isV2CoordinateEligibleForEnrichment({
        latitude: row.coordinateLatitude,
        longitude: row.coordinateLongitude,
        source: row.coordinateSource,
      })
    ) {
      continue;
    }
    pushWork({
      vehicleId: row.vehicleId,
      triggerEventId: row.energyEventId,
      reason: 'lost_enqueue',
    });
  }

  if (work.length >= params.batchSize) return work;

  const coordinateRetry = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: {
      enrichmentEligible: true,
      enrichmentEnqueuedAt: null,
      finalityState: {
        in: [
          PhysicalRefuelFinalityState.FINAL_CANONICAL,
          PhysicalRefuelFinalityState.FINAL_DISTINCT,
        ],
      },
      energyEvent: {
        fuelStationEnrichment: { is: null },
      },
      OR: [{ nextCoordinateRetryAt: null }, { nextCoordinateRetryAt: { lte: params.asOf } }],
    },
    orderBy: [{ nextCoordinateRetryAt: 'asc' }, { reconciledAt: 'asc' }],
    take: quota.coordinateRetry,
    select: { vehicleId: true, energyEventId: true },
  });

  for (const row of coordinateRetry) {
    pushWork({
      vehicleId: row.vehicleId,
      triggerEventId: row.energyEventId,
      reason: 'coordinate_retry',
    });
  }

  return work;
}

export async function countPhysicalRefuelRecoveryBacklog(
  prisma: PrismaClient,
  asOf: Date,
  v2OwnershipCutoverAt: Date,
  orphanLookbackFrom: Date,
): Promise<Record<string, number>> {
  const orphanCreatedAt = computeOrphanCreatedAtRange({
    v2OwnershipCutoverAt,
    orphanLookbackFrom,
    asOf,
  });

  const [provisional, settling, insufficient, finalCanonical, finalDistinct, due, lostEnqueue, orphans, lateSibling, coordinateHold, coordinateRetryDue] =
    await Promise.all([
      prisma.vehicleEnergyEventRefuelReconciliation.count({
        where: { finalityState: PhysicalRefuelFinalityState.PROVISIONAL },
      }),
      prisma.vehicleEnergyEventRefuelReconciliation.count({
        where: { finalityState: PhysicalRefuelFinalityState.SETTLING },
      }),
      prisma.vehicleEnergyEventRefuelReconciliation.count({
        where: { finalityState: PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE },
      }),
      prisma.vehicleEnergyEventRefuelReconciliation.count({
        where: { finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL },
      }),
      prisma.vehicleEnergyEventRefuelReconciliation.count({
        where: { finalityState: PhysicalRefuelFinalityState.FINAL_DISTINCT },
      }),
      prisma.vehicleEnergyEventRefuelReconciliation.count({
        where: {
          finalityState: {
            in: [PhysicalRefuelFinalityState.PROVISIONAL, PhysicalRefuelFinalityState.SETTLING],
          },
          nextReconciliationAt: { lte: asOf },
        },
      }),
      prisma.vehicleEnergyEventRefuelReconciliation.count({
        where: {
          enrichmentEligible: true,
          enrichmentEnqueuedAt: null,
          coordinateLatitude: { not: null },
          coordinateSource: { not: null },
          finalityState: {
            in: [
              PhysicalRefuelFinalityState.FINAL_CANONICAL,
              PhysicalRefuelFinalityState.FINAL_DISTINCT,
            ],
          },
        },
      }),
      prisma.vehicleEnergyEvent.count({
        where: {
          kind: EnergyEventKind.REFUEL,
          createdAt: orphanCreatedAt,
          refuelReconciliation: { is: null },
        },
      }),
      prisma.vehicleEnergyEventRefuelReconciliation.count({
        where: { lateSiblingConflict: true },
      }),
      prisma.vehicleEnergyEventRefuelReconciliation.count({
        where: {
          coordinateSelectionStatus: { not: null },
          enrichmentEligible: true,
          enrichmentEnqueuedAt: null,
        },
      }),
      prisma.vehicleEnergyEventRefuelReconciliation.count({
        where: {
          enrichmentEligible: true,
          enrichmentEnqueuedAt: null,
          finalityState: {
            in: [
              PhysicalRefuelFinalityState.FINAL_CANONICAL,
              PhysicalRefuelFinalityState.FINAL_DISTINCT,
            ],
          },
          OR: [{ nextCoordinateRetryAt: null }, { nextCoordinateRetryAt: { lte: asOf } }],
        },
      }),
    ]);

  return {
    provisional,
    settling,
    insufficientEvidence: insufficient,
    finalCanonical,
    finalDistinct,
    reconciliationDue: due,
    lostEnqueuePending: lostEnqueue,
    orphanRefuels: orphans,
    lateSiblingConflict: lateSibling,
    coordinateHold,
    coordinateRetryDue,
  };
}
