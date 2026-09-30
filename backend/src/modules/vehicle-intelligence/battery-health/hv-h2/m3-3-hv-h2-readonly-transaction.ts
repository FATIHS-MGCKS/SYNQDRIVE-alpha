import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { M3_3_HV_H2_REPORT_TIMEOUT_MS } from './m3-3-hv-h2.constants';

export type HvH2ReadOnlyTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export async function assertHvH2TransactionReadOnly(tx: HvH2ReadOnlyTx): Promise<void> {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const rows = await tx.$queryRaw<{ transaction_read_only: string }[]>`
    SHOW transaction_read_only
  `;
  const value = rows[0]?.transaction_read_only?.toLowerCase();
  if (value !== 'on') {
    throw new Error(
      `M3.3-HV-H2 read-only guard failed: transaction_read_only=${value ?? 'unknown'}`,
    );
  }
}

export async function runM3_3HvH2ReadOnlyTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: HvH2ReadOnlyTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await assertHvH2TransactionReadOnly(tx);
      return fn(tx);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: M3_3_HV_H2_REPORT_TIMEOUT_MS,
    },
  );
}
