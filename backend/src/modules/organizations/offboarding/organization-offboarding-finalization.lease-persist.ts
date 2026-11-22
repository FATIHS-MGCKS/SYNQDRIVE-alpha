import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  ORGANIZATION_OFFBOARDING_FINALIZE_LEASE_CONFLICT_CODE,
  ORGANIZATION_OFFBOARDING_FINALIZE_LEASE_EXPIRED_CODE,
} from './organization-offboarding-finalization.policy';
import {
  finalizeLeaseTtlMs,
  isFinalizeLeaseActive,
  releaseFinalizeLease,
} from './organization-offboarding-finalization.lease';
import {
  parseExecutionProgress,
  toProgressJson,
  type OrganizationOffboardingExecutionProgress,
} from './organization-offboarding-execution.progress';

export function requireActiveFinalizeLeaseToken(
  progress: OrganizationOffboardingExecutionProgress,
  leaseToken: string,
): void {
  if (progress.finalizeLease?.token !== leaseToken) {
    throw new ConflictException({
      code: ORGANIZATION_OFFBOARDING_FINALIZE_LEASE_CONFLICT_CODE,
      message: 'Finalization lease lost — stale finalizer fenced out',
    });
  }
  if (!isFinalizeLeaseActive(progress)) {
    throw new ConflictException({
      code: ORGANIZATION_OFFBOARDING_FINALIZE_LEASE_EXPIRED_CODE,
      message: 'Finalization lease expired',
    });
  }
}

export async function releaseFinalizeLeaseOnJob(
  prisma: PrismaService,
  jobId: string,
  leaseToken: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM organization_offboarding_jobs WHERE id = ${jobId} FOR UPDATE`;
    const row = await tx.organizationOffboardingJob.findUnique({ where: { id: jobId } });
    if (!row) return;
    const stored = parseExecutionProgress(row.progressJson);
    if (stored.finalizeLease?.token !== leaseToken) {
      return;
    }
    const cleared = releaseFinalizeLease(stored);
    await tx.organizationOffboardingJob.update({
      where: { id: jobId },
      data: { progressJson: toProgressJson(cleared) },
    });
  });
}