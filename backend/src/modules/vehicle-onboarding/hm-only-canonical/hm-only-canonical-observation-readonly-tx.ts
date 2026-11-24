import { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';

export type HmObservationReadDb = PrismaService | Prisma.TransactionClient;

export const HM_OBSERVATION_TX_TIMEOUT_MS = 12_000;
export const HM_OBSERVATION_TX_MAX_WAIT_MS = 4_000;

export const HM_OBSERVATION_PRISMA_ISOLATION = Prisma.TransactionIsolationLevel.RepeatableRead;

export async function assertHmObservationTransactionReadOnly(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const [roRows, isoRows] = await Promise.all([
    tx.$queryRaw<{ transaction_read_only: string }[]>`SHOW transaction_read_only`,
    tx.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`,
  ]);
  const readOnly = roRows[0]?.transaction_read_only?.toLowerCase();
  const isolation = isoRows[0]?.transaction_isolation?.toLowerCase() ?? '';
  if (readOnly !== 'on') {
    throw new Error(`HM observation read-only guard failed: transaction_read_only=${readOnly ?? 'unknown'}`);
  }
  if (!isolation.includes('repeatable')) {
    throw new Error(`HM observation isolation guard failed: transaction_isolation=${isolation || 'unknown'}`);
  }
}

export async function runHmObservationInReadOnlyTransaction<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T | 'OBSERVATION_DB_CONSISTENCY_UNAVAILABLE'> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        await assertHmObservationTransactionReadOnly(tx);
        return await fn(tx);
      },
      {
        isolationLevel: HM_OBSERVATION_PRISMA_ISOLATION,
        timeout: HM_OBSERVATION_TX_TIMEOUT_MS,
        maxWait: HM_OBSERVATION_TX_MAX_WAIT_MS,
      },
    );
  } catch {
    return 'OBSERVATION_DB_CONSISTENCY_UNAVAILABLE';
  }
}