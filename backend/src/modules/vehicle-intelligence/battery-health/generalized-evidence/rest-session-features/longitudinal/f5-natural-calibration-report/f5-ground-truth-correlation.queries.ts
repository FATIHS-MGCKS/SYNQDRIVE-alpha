import type { PrismaClient } from '@prisma/client';
import { F5_MAX_GROUND_TRUTH_ROWS_PER_REPORT } from './f5-ground-truth-correlation.constants';
import type { F5GroundTruthRowForCorrelation } from './f5-ground-truth-correlation.types';

type ReadOnlyTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export async function loadGroundTruthRowsForF5Report(
  tx: ReadOnlyTx,
  input: {
    asOf: Date;
    organizationIds: string[];
  },
): Promise<F5GroundTruthRowForCorrelation[]> {
  if (input.organizationIds.length === 0) {
    return [];
  }

  const rows = await tx.batteryGroundTruthEvent.findMany({
    where: {
      organizationId: { in: input.organizationIds },
      createdAt: { lte: input.asOf },
      effectiveAt: { lte: input.asOf },
    },
    select: {
      id: true,
      organizationId: true,
      vehicleId: true,
      groundTruthType: true,
      batteryScope: true,
      effectiveAt: true,
      createdAt: true,
      verificationStatus: true,
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
