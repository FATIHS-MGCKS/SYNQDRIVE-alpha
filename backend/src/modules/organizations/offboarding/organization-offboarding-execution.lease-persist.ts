import { ConflictException } from '@nestjs/common';
import type { OrganizationOffboardingJobStatus } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_CONFLICT_CODE,
  ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_EXPIRED_CODE,
} from './organization-offboarding-execution.policy';
import { isExecutionLeaseActive, executionLeaseTtlMs, releaseExecutionLease } from './organization-offboarding-execution.lease';
import {
  parseExecutionProgress,
  toProgressJson,
  type OrganizationOffboardingExecutionProgress,
} from './organization-offboarding-execution.progress';

export type OffboardingJobLeaseRow = {
  id: string;
  organizationId: string;
  idempotencyKey: string;
  status: OrganizationOffboardingJobStatus;
  phase: string;
  correlationId: string;
  requestedByUserId: string | null;
  requestedAt: Date;
  completedAt: Date | null;
  lastErrorCode: string | null;
  preflightSnapshot: unknown;
  progressJson: unknown;
};

export function requireActiveLeaseToken(
  progress: OrganizationOffboardingExecutionProgress,
  leaseToken: string,
): void {
  if (progress.executionLease?.token !== leaseToken) {
    throw new ConflictException({
      code: ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_CONFLICT_CODE,
      message: 'Execution lease lost — stale executor fenced out',
    });
  }
  if (!isExecutionLeaseActive(progress)) {
    throw new ConflictException({
      code: ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_EXPIRED_CODE,
      message: 'Execution lease expired',
    });
  }
}

function renewLeaseExpiry(
  progress: OrganizationOffboardingExecutionProgress,
): OrganizationOffboardingExecutionProgress {
  const lease = progress.executionLease;
  if (!lease) {
    return progress;
  }
  return {
    ...progress,
    executionLease: {
      ...lease,
      expiresAt: new Date(Date.now() + executionLeaseTtlMs()).toISOString(),
    },
  };
}

async function lockJobRow(
  tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  jobId: string,
): Promise<OffboardingJobLeaseRow> {
  await tx.$executeRaw`SELECT id FROM organization_offboarding_jobs WHERE id = ${jobId} FOR UPDATE`;
  return tx.organizationOffboardingJob.findUniqueOrThrow({
    where: { id: jobId },
  });
}

/** Atomic CAS: progress + phase fields only persist when the stored lease token still matches. */
export async function persistJobUnderActiveLease(
  prisma: PrismaService,
  input: {
    jobId: string;
    leaseToken: string;
    progress: OrganizationOffboardingExecutionProgress;
    phase: string;
    status: OrganizationOffboardingJobStatus;
    lastErrorCode: string | null;
  },
): Promise<OffboardingJobLeaseRow> {
  return prisma.$transaction(async (tx) => {
    const row = await lockJobRow(tx, input.jobId);
    const stored = parseExecutionProgress(row.progressJson);
    requireActiveLeaseToken(stored, input.leaseToken);
    const merged: OrganizationOffboardingExecutionProgress = renewLeaseExpiry({
      ...stored,
      ...input.progress,
      executionLease: stored.executionLease,
      execution: stored.execution ?? input.progress.execution,
    });
    return tx.organizationOffboardingJob.update({
      where: { id: input.jobId },
      data: {
        progressJson: toProgressJson(merged),
        phase: input.phase,
        status: input.status,
        lastErrorCode: input.lastErrorCode,
      },
    });
  });
}

/** Atomic lease release — stale executors cannot clear another holder's lease. */
export async function releaseJobLeaseUnderActiveToken(
  prisma: PrismaService,
  jobId: string,
  leaseToken: string,
): Promise<OrganizationOffboardingExecutionProgress> {
  return prisma.$transaction(async (tx) => {
    const row = await lockJobRow(tx, jobId);
    const stored = parseExecutionProgress(row.progressJson);
    requireActiveLeaseToken(stored, leaseToken);
    const cleared = releaseExecutionLease(stored);
    await tx.organizationOffboardingJob.update({
      where: { id: jobId },
      data: { progressJson: toProgressJson(cleared) },
    });
    return cleared;
  });
}