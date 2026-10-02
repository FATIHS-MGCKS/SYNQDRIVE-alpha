import { Exp021CanaryLiveWindowActivationState, Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { CanaryArmLedgerRow } from './reference-capture-exp021-canary-live-window-activation.arm.lib';

export async function lockCanaryActivationLedgerRow(
  prisma: PrismaService | Prisma.TransactionClient,
  ledgerId: string,
): Promise<CanaryArmLedgerRow> {
  await prisma.$executeRaw`
    SELECT id FROM exp021_canary_live_window_activation_ledgers
    WHERE id = ${ledgerId}
    FOR UPDATE
  `;
  const row = await prisma.exp021CanaryLiveWindowActivationLedger.findUnique({
    where: { id: ledgerId },
  });
  if (!row) {
    throw new Error(`Canary activation ledger ${ledgerId} not found`);
  }
  return {
    id: row.id,
    vehicleTripId: row.vehicleTripId,
    state: row.state,
    studyRunId: row.studyRunId,
    sessionId: row.sessionId,
  };
}

export async function patchCanaryActivationLedger(
  prisma: PrismaService | Prisma.TransactionClient,
  ledgerId: string,
  patch: {
    state?: Exp021CanaryLiveWindowActivationState;
    studyRunId?: string | null;
    sessionId?: string | null;
    failureReason?: string | null;
  },
): Promise<CanaryArmLedgerRow> {
  const row = await prisma.exp021CanaryLiveWindowActivationLedger.update({
    where: { id: ledgerId },
    data: patch,
  });
  return {
    id: row.id,
    vehicleTripId: row.vehicleTripId,
    state: row.state,
    studyRunId: row.studyRunId,
    sessionId: row.sessionId,
  };
}
