import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { M3_3_HV_H4_REPORT_TIMEOUT_MS } from './m3-3-hv-h4.constants';

export type HvH4ReadOnlyTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export async function assertHvH4TransactionReadOnly(tx: HvH4ReadOnlyTx): Promise<void> {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const rows = await tx.$queryRaw<{ transaction_read_only: string }[]>`
    SHOW transaction_read_only
  `;
  const value = rows[0]?.transaction_read_only?.toLowerCase();
  if (value !== 'on') {
    throw new Error(
      `M3.3-HV-H4 read-only guard failed: transaction_read_only=${value ?? 'unknown'}`,
    );
  }
}

export async function runM3_3HvH4ReadOnlyTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: HvH4ReadOnlyTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await assertHvH4TransactionReadOnly(tx);
      return fn(tx);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: M3_3_HV_H4_REPORT_TIMEOUT_MS,
    },
  );
}
