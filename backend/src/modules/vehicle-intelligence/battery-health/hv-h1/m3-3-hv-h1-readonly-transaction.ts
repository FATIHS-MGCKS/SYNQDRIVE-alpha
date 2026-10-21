import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

export type HvH1ReadOnlyTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export async function assertHvH1TransactionReadOnly(tx: HvH1ReadOnlyTx): Promise<void> {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const rows = await tx.$queryRaw<{ transaction_read_only: string }[]>`
    SHOW transaction_read_only
  `;
  const value = rows[0]?.transaction_read_only?.toLowerCase();
  if (value !== 'on') {
    throw new Error(
      `M3.3-HV-H1 read-only guard failed: transaction_read_only=${value ?? 'unknown'}`,
    );
  }
}

export async function runM3_3HvH1ReadOnlyTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: HvH1ReadOnlyTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await assertHvH1TransactionReadOnly(tx);
      return fn(tx);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 60_000,
    },
  );
}
