import { Prisma, type VehicleOnboardingCase } from '@prisma/client';
import { assertCaseTransitionAllowed } from '../policy/onboarding-case-transition.policy';

/** Clears authoritative VO-4 seal when readiness-relevant case data changes. */
export async function invalidateReadinessSealIfReady(
  tx: Prisma.TransactionClient,
  caseRow: Pick<VehicleOnboardingCase, 'id' | 'status'>,
): Promise<void> {
  if (caseRow.status !== 'READY_FOR_ACTIVATION') {
    return;
  }
  assertCaseTransitionAllowed('READY_FOR_ACTIVATION', 'IN_PROGRESS');
  await tx.vehicleOnboardingCase.update({
    where: { id: caseRow.id },
    data: {
      status: 'IN_PROGRESS',
      readinessSnapshotJson: Prisma.DbNull,
      readinessSnapshotVersion: 0,
      readinessProfileVersion: null,
    },
  });
}
