import { ConflictException } from '@nestjs/common';
import {
  OrganizationOffboardingJobStatus,
  OrganizationStatus,
  type Prisma,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { DimoOwnerHandoffRecord } from './organization-offboarding-dimo-privilege.types';
import {
  parseExecutionProgress,
  toProgressJson,
  type OrganizationOffboardingExecutionProgress,
} from './organization-offboarding-execution.progress';
import { pickNewerDimoPrivilegeVerification } from './organization-offboarding-dimo-progress-preservation';
import { lockOffboardingJobRowForUpdate } from './organization-offboarding-execution.lease-persist';

type DimoVerificationBlock = NonNullable<
  OrganizationOffboardingExecutionProgress['dimoPrivilegeVerification']
>;

export type PersistDimoPrivilegeVerificationResult = {
  progress: OrganizationOffboardingExecutionProgress;
  verificationApplied: boolean;
  effectiveVerification: DimoVerificationBlock;
};

type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

async function assertDimoProgressMutationAllowed(
  tx: TxClient,
  organizationId: string,
  jobId: string,
): Promise<{ stored: OrganizationOffboardingExecutionProgress; jobStatus: OrganizationOffboardingJobStatus }> {
  const row = await lockOffboardingJobRowForUpdate(tx, jobId);
  if (row.organizationId !== organizationId) {
    throw new ConflictException({
      code: 'ORGANIZATION_OFFBOARDING_DIMO_PROGRESS_JOB_SCOPE',
      message: 'Job does not belong to organization',
    });
  }
  if (row.status === OrganizationOffboardingJobStatus.COMPLETED) {
    throw new ConflictException({
      code: 'ORGANIZATION_OFFBOARDING_DIMO_PROGRESS_JOB_TERMINAL',
      message: 'Offboarding job is terminal; DIMO progress cannot be mutated',
    });
  }
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  if (!org || org.status === OrganizationStatus.ARCHIVED) {
    throw new ConflictException({
      code: 'ORGANIZATION_OFFBOARDING_DIMO_PROGRESS_ORG_ARCHIVED',
      message: 'Organization is archived; DIMO progress cannot be mutated',
    });
  }
  return { stored: parseExecutionProgress(row.progressJson), jobStatus: row.status };
}

export async function persistDimoPrivilegeVerificationUnderLock(
  prisma: PrismaService,
  input: {
    organizationId: string;
    jobId: string;
    verification: DimoVerificationBlock;
  },
): Promise<PersistDimoPrivilegeVerificationResult> {
  return prisma.$transaction(async (tx) => {
    const { stored } = await assertDimoProgressMutationAllowed(tx, input.organizationId, input.jobId);
    const effectiveVerification = pickNewerDimoPrivilegeVerification(
      stored.dimoPrivilegeVerification,
      input.verification,
    ) as DimoVerificationBlock;
    const verificationApplied =
      !stored.dimoPrivilegeVerification ||
      effectiveVerification.verificationSnapshotReference === input.verification.verificationSnapshotReference;

    const merged: OrganizationOffboardingExecutionProgress = {
      ...stored,
      dimoPrivilegeVerification: effectiveVerification,
    };

    if (verificationApplied) {
      await tx.organizationOffboardingJob.update({
        where: { id: input.jobId },
        data: { progressJson: toProgressJson(merged) },
      });
    }

    return {
      progress: verificationApplied ? merged : stored,
      verificationApplied,
      effectiveVerification,
    };
  });
}

export async function persistDimoOwnerHandoffUnderLock(
  tx: TxClient,
  input: {
    organizationId: string;
    jobId: string;
    appendHandoff: DimoOwnerHandoffRecord;
    maxRecords: number;
    onDuplicateIdempotency: (existing: DimoOwnerHandoffRecord) => void;
  },
): Promise<{ progress: OrganizationOffboardingExecutionProgress; handoffs: DimoOwnerHandoffRecord[] }> {
  const { stored } = await assertDimoProgressMutationAllowed(tx, input.organizationId, input.jobId);
  const existingHandoffs = stored.dimoOwnerHandoffs ?? [];
  const replay = existingHandoffs.find((h) => h.idempotencyKey === input.appendHandoff.idempotencyKey);
  if (replay) {
    input.onDuplicateIdempotency(replay);
    return { progress: stored, handoffs: existingHandoffs };
  }

  const appendHandoff: DimoOwnerHandoffRecord = {
    ...input.appendHandoff,
    verificationSnapshotReference:
      input.appendHandoff.verificationSnapshotReference ??
      stored.dimoPrivilegeVerification?.verificationSnapshotReference ??
      null,
  };

  const mergedHandoffs = [...existingHandoffs, appendHandoff].slice(-input.maxRecords);
  const merged: OrganizationOffboardingExecutionProgress = {
    ...stored,
    dimoOwnerHandoffs: mergedHandoffs,
  };
  await tx.organizationOffboardingJob.update({
    where: { id: input.jobId },
    data: { progressJson: toProgressJson(merged) },
  });
  return { progress: merged, handoffs: mergedHandoffs };
}

export type OffboardingJobProgressRow = {
  progressJson: Prisma.JsonValue;
};