import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';

export interface PhysicalRefuelRecoveryWorkItem {
  vehicleId: string;
  triggerEventId: string;
  reason:
    | 'orphan_refuel'
    | 'settlement_due'
    | 'lost_enqueue'
    | 'coordinate_hold';
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

  const dueReconciliations = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: {
      finalityState: {
        in: [PhysicalRefuelFinalityState.PROVISIONAL, PhysicalRefuelFinalityState.SETTLING],
      },
      nextReconciliationAt: { lte: params.asOf },
    },
    orderBy: { nextReconciliationAt: 'asc' },
    take: params.batchSize,
    select: { vehicleId: true, energyEventId: true },
  });

  for (const row of dueReconciliations) {
    if (seenVehicles.has(row.vehicleId)) continue;
    seenVehicles.add(row.vehicleId);
    work.push({
      vehicleId: row.vehicleId,
      triggerEventId: row.energyEventId,
      reason: 'settlement_due',
    });
  }

  if (work.length >= params.batchSize) return work.slice(0, params.batchSize);

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
      energyEvent: {
        fuelStationEnrichment: { is: null },
      },
    },
    orderBy: { reconciledAt: 'asc' },
    take: params.batchSize - work.length,
    select: { vehicleId: true, energyEventId: true },
  });

  for (const row of lostEnqueue) {
    if (seenVehicles.has(row.vehicleId)) continue;
    seenVehicles.add(row.vehicleId);
    work.push({
      vehicleId: row.vehicleId,
      triggerEventId: row.energyEventId,
      reason: 'lost_enqueue',
    });
  }

  if (work.length >= params.batchSize) return work.slice(0, params.batchSize);

  const orphanWhere: Prisma.VehicleEnergyEventWhereInput = {
    kind: EnergyEventKind.REFUEL,
    createdAt: { gte: params.orphanLookbackFrom, lte: params.asOf },
    refuelReconciliation: { is: null },
  };

  const orphans = await prisma.vehicleEnergyEvent.findMany({
    where: {
      ...orphanWhere,
      createdAt: { gte: params.v2OwnershipCutoverAt },
    },
    orderBy: { createdAt: 'asc' },
    take: params.batchSize - work.length,
    select: { id: true, vehicleId: true },
  });

  for (const row of orphans) {
    if (seenVehicles.has(row.vehicleId)) continue;
    seenVehicles.add(row.vehicleId);
    work.push({
      vehicleId: row.vehicleId,
      triggerEventId: row.id,
      reason: 'orphan_refuel',
    });
  }

  return work.slice(0, params.batchSize);
}

export async function countPhysicalRefuelRecoveryBacklog(
  prisma: PrismaClient,
  asOf: Date,
  v2OwnershipCutoverAt: Date,
  orphanLookbackFrom: Date,
): Promise<Record<string, number>> {
  const [provisional, settling, insufficient, finalCanonical, finalDistinct, due, lostEnqueue, orphans, lateSibling, coordinateHold] =
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
          createdAt: {
            gte: new Date(Math.max(orphanLookbackFrom.getTime(), v2OwnershipCutoverAt.getTime())),
          },
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
  };
}
