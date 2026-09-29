import type { PrismaClient } from '@prisma/client';
import { F5_MAX_GROUND_TRUTH_ROWS_PER_REPORT } from './f5-ground-truth-correlation.constants';
import type { F5GroundTruthRowForCorrelation } from './f5-ground-truth-correlation.types';

type ReadOnlyTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export type F5PrimaryCohortVehicleRef = {
  organizationId: string;
  vehicleId: string;
};

export async function loadGroundTruthRowsForF5Report(
  tx: ReadOnlyTx,
  input: {
    asOf: Date;
    cohortVehicles: F5PrimaryCohortVehicleRef[];
  },
): Promise<F5GroundTruthRowForCorrelation[]> {
  if (input.cohortVehicles.length === 0) {
    return [];
  }

  const rows = await tx.batteryGroundTruthEvent.findMany({
    where: {
      OR: input.cohortVehicles.map((v) => ({
        organizationId: v.organizationId,
        vehicleId: v.vehicleId,
      })),
      createdAt: { lte: input.asOf },
    },
    select: {
      id: true,
      organizationId: true,
      vehicleId: true,
      groundTruthType: true,
      batteryScope: true,
      sourceAuthority: true,
      effectiveAt: true,
      createdAt: true,
      verificationStatus: true,
      supersedesGroundTruthEventId: true,
      revocations: { select: { revokedAt: true } },
    },
    orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
    take: F5_MAX_GROUND_TRUTH_ROWS_PER_REPORT + 1,
  });

  if (rows.length > F5_MAX_GROUND_TRUTH_ROWS_PER_REPORT) {
    throw new Error(
      `F5 ground-truth row bound exceeded (${rows.length} > ${F5_MAX_GROUND_TRUTH_ROWS_PER_REPORT})`,
    );
  }

  return rows;
}
