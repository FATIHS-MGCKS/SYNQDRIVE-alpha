import type { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';

export type HmObservationReadDb = PrismaService | Prisma.TransactionClient;

export async function runHmObservationInReadOnlyTransaction<T>(
  prisma: PrismaService,
  fn: (tx: HmObservationReadDb) => Promise<T>,
): Promise<T | 'OBSERVATION_DB_CONSISTENCY_UNAVAILABLE'> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return await fn(tx);
      },
      { timeout: 12_000, maxWait: 4_000 },
    );
  } catch {
    return 'OBSERVATION_DB_CONSISTENCY_UNAVAILABLE';
  }
}