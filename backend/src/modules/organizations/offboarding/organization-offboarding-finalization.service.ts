import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationOffboardingJobStatus,
  OrganizationStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  acquirePgAdvisoryXactLock,
  organizationOffboardingFinalizeLockKey,
} from '@shared/database/pg-advisory-lock.util';
import { OrganizationOffboardPreflightService } from './organization-offboard-preflight.service';
import type { OrganizationOffboardFinalizeRequest } from './organization-offboarding-finalize.validation';
import {
  assertOrganizationOffboardingFinalizationAdmitted,
  ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
  ORGANIZATION_OFFBOARDING_FINALIZE_CONFLICT_CODE,
  ORGANIZATION_OFFBOARDING_FINALIZE_IN_PROGRESS_CODE,
  ORGANIZATION_OFFBOARDING_FINALIZE_JOB_BINDING_CODE,
  ORGANIZATION_OFFBOARDING_FINALIZE_LEASE_CONFLICT_CODE,
  ORGANIZATION_OFFBOARDING_FINALIZE_MOCK_INADMISSIBLE_CODE,
} from './organization-offboarding-finalization.policy';
import { isPhaseComplete } from './organization-offboarding-execution.phases';
import {
  parseExecutionProgress,
  toProgressJson,
  type OrganizationOffboardingExecutionProgress,
} from './organization-offboarding-execution.progress';
import { providerAllowsArchiveAdmission } from './organization-offboarding-provider-admission.util';
import { OrganizationOffboardingProviderDisconnectService } from './organization-offboarding-provider-disconnect.service';
import type { OrganizationOffboardingExecutionResult } from './organization-offboarding-execution.service';
import { mapOffboardingJobToExecutionResult } from './organization-offboarding-job-view.mapper';
import { ORGANIZATION_OFFBOARDING_PROVIDER_QUIESCE_INCOMPLETE_CODE } from './organization-offboarding-execution.policy';
import {
  isFinalizeLeaseActive,
  mintFinalizeLease,
  releaseFinalizeLease,
} from './organization-offboarding-finalization.lease';
import {
  releaseFinalizeLeaseOnJob,
  requireActiveFinalizeLeaseToken,
} from './organization-offboarding-finalization.lease-persist';
import { isOrganizationOffboardingProviderMockAllowed } from './organization-offboarding-provider-mock.policy';

@Injectable()
export class OrganizationOffboardingFinalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preflight: OrganizationOffboardPreflightService,
    private readonly providerDisconnect: OrganizationOffboardingProviderDisconnectService,
    private readonly masterAudit: MasterAdminAuditService,
  ) {}

  async finalize(
    organizationId: string,
    request: OrganizationOffboardFinalizeRequest,
    actorUserId: string | null,
  ): Promise<OrganizationOffboardingExecutionResult> {
    assertOrganizationOffboardingFinalizationAdmitted();
    if (!actorUserId) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_OFFBOARDING_FINALIZATION_ACTOR_REQUIRED',
        message: 'Authenticated master admin actor is required',
      });
    }

    const replay = await this.tryIdempotentReplay(organizationId, request);
    if (replay) {
      return replay;
    }

    const claim = await this.acquireFinalizeLease(organizationId, request, actorUserId);
    const leaseToken = claim.leaseToken;
    let completed = false;

    try {
      const assessment = await this.providerDisconnect.assessOrganization(organizationId);
      const snapshot = await this.preflight.assess(organizationId, {
        excludeOffboardingJobId: claim.jobId,
      });

      if (snapshot.hardBlockers.length > 0) {
        await this.markFinalizeBlocked(
          claim.jobId,
          leaseToken,
          request,
          snapshot.hardBlockers.join(','),
          actorUserId,
          organizationId,
        );
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
          message: 'Finalization blocked by organization preflight',
          hardBlockers: snapshot.hardBlockers,
        });
      }

      let progress = parseExecutionProgress(
        (
          await this.prisma.organizationOffboardingJob.findUniqueOrThrow({
            where: { id: claim.jobId },
          })
        ).progressJson,
      );
      progress = {
        ...progress,
        providerQuiesce: {
          activeProviderConsentCount: assessment.activeProviderConsentCount,
          connectedDimoVehicleCount: assessment.connectedDimoVehicleCount,
          historicalProviderConsentCount: assessment.historicalProviderConsentCount,
          everHadDimoVehicleLink: assessment.everHadDimoVehicleLink,
          finalizationState: assessment.finalizationState,
          providerEvidence: {
            dimo: assessment.dimo,
            hm: assessment.hm,
            assessedAt: new Date().toISOString(),
          },
        },
      };

      this.assertProviderEvidenceAdmissible(progress);

      if (!providerAllowsArchiveAdmission(progress)) {
        await this.persistProgressUnderLease(claim.jobId, leaseToken, {
          ...progress,
          finalize: {
            idempotencyKey: request.idempotencyKey,
            claimedAt: progress.finalize?.claimedAt ?? new Date().toISOString(),
            actorUserId,
            inProgress: false,
            lastErrorCode: ORGANIZATION_OFFBOARDING_PROVIDER_QUIESCE_INCOMPLETE_CODE,
          },
        });
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_PROVIDER_QUIESCE_INCOMPLETE_CODE,
          message: 'Provider disconnect evidence is incomplete; organization remains SUSPENDED',
          retryable: true,
          providerQuiesce: progress.providerQuiesce,
        });
      }

      const row = await this.commitArchival({
        organizationId,
        request,
        actorUserId,
        jobId: claim.jobId,
        leaseToken,
        progress,
        preflightHardBlockers: snapshot.hardBlockers,
      });
      completed = true;

      await this.masterAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        actorUserId,
        targetOrganizationId: organizationId,
        entityId: row.id,
        correlationId: row.correlationId,
        description: 'Organization offboarding archival finalization completed',
        reasonCode: 'ORG_OFFBOARDING_ARCHIVED',
        route: 'POST /admin/organizations/:organizationId/offboarding/finalize',
        httpMethod: 'POST',
        httpStatus: 200,
        metadata: {
          jobId: row.id,
          idempotencyKey: request.idempotencyKey,
        },
        level: 'INFO',
      });

      return mapOffboardingJobToExecutionResult(row, true);
    } finally {
      if (!completed) {
        await releaseFinalizeLeaseOnJob(this.prisma, claim.jobId, leaseToken).catch(() => undefined);
      }
    }
  }

  private assertProviderEvidenceAdmissible(progress: OrganizationOffboardingExecutionProgress): void {
    if (isOrganizationOffboardingProviderMockAllowed()) {
      return;
    }
    const dimo = progress.providerQuiesce?.providerEvidence?.dimo as { evidenceSource?: string } | undefined;
    const hm = progress.providerQuiesce?.providerEvidence?.hm as { evidenceSource?: string } | undefined;
    if (dimo?.evidenceSource === 'MOCK' || hm?.evidenceSource === 'MOCK') {
      throw new ConflictException({
        code: ORGANIZATION_OFFBOARDING_FINALIZE_MOCK_INADMISSIBLE_CODE,
        message: 'Mock provider confirmation cannot authorize ARCHIVED in production',
      });
    }
  }

  private async acquireFinalizeLease(
    organizationId: string,
    request: OrganizationOffboardFinalizeRequest,
    actorUserId: string,
  ): Promise<{ jobId: string; leaseToken: string }> {
    const job = await this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock(tx, organizationOffboardingFinalizeLockKey(organizationId));

      const row = await tx.organizationOffboardingJob.findFirst({
        where: { id: request.jobId, organizationId },
      });
      if (!row) {
        throw new NotFoundException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_JOB_BINDING_CODE,
          message: 'Offboarding job not found for this organization',
        });
      }

      if (
        row.status !== OrganizationOffboardingJobStatus.RETRYABLE ||
        row.phase !== 'READY_FOR_ARCHIVE' ||
        !isPhaseComplete(parseExecutionProgress(row.progressJson), 'READY_FOR_ARCHIVE')
      ) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
          message: 'Offboarding job is not ready for archival finalization',
          jobStatus: row.status,
          phase: row.phase,
        });
      }

      let progress = parseExecutionProgress(row.progressJson);

      if (
        progress.finalize?.idempotencyKey &&
        progress.finalize.idempotencyKey !== request.idempotencyKey
      ) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_CONFLICT_CODE,
          message: 'Another finalization idempotency key is already bound to this job',
        });
      }

      if (isFinalizeLeaseActive(progress)) {
        if (progress.finalizeLease?.finalizeIdempotencyKey !== request.idempotencyKey) {
          throw new ConflictException({
            code: ORGANIZATION_OFFBOARDING_FINALIZE_LEASE_CONFLICT_CODE,
            message: 'Another finalization lease is already active for this organization',
          });
        }
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_IN_PROGRESS_CODE,
          message: 'Finalization is already in progress for this idempotency key',
        });
      }

      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { status: true },
      });
      if (!org || org.status !== OrganizationStatus.SUSPENDED) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
          message: 'Organization must be SUSPENDED before archival finalization',
        });
      }

      progress = mintFinalizeLease(progress, request.idempotencyKey);
      progress = {
        ...progress,
        finalize: {
          ...progress.finalize!,
          actorUserId,
        },
      };

      return tx.organizationOffboardingJob.update({
        where: { id: row.id },
        data: { progressJson: toProgressJson(progress) },
      });
    });

    const progress = parseExecutionProgress(job.progressJson);
    const leaseToken = progress.finalizeLease?.token;
    if (!leaseToken) {
      throw new ConflictException({
        code: ORGANIZATION_OFFBOARDING_FINALIZE_LEASE_CONFLICT_CODE,
        message: 'Failed to acquire finalization lease',
      });
    }
    return { jobId: job.id, leaseToken };
  }

  private async commitArchival(input: {
    organizationId: string;
    request: OrganizationOffboardFinalizeRequest;
    actorUserId: string;
    jobId: string;
    leaseToken: string;
    progress: OrganizationOffboardingExecutionProgress;
    preflightHardBlockers: string[];
  }) {
    if (input.preflightHardBlockers.length > 0) {
      throw new ConflictException({
        code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
        message: 'Preflight hard blockers present at archival commit',
      });
    }

    const freshSnapshot = await this.preflight.assess(input.organizationId, {
      excludeOffboardingJobId: input.jobId,
    });
    if (freshSnapshot.hardBlockers.length > 0) {
      throw new ConflictException({
        code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
        message: 'Final commit preflight blocked archival',
        hardBlockers: freshSnapshot.hardBlockers,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock(tx, organizationOffboardingFinalizeLockKey(input.organizationId));
      await tx.$executeRaw`SELECT id FROM organization_offboarding_jobs WHERE id = ${input.jobId} FOR UPDATE`;

      const latest = await tx.organizationOffboardingJob.findUnique({ where: { id: input.jobId } });
      if (!latest || latest.id !== input.request.jobId || latest.organizationId !== input.organizationId) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_JOB_BINDING_CODE,
          message: 'Job binding failed at archival commit',
        });
      }

      const stored = parseExecutionProgress(latest.progressJson);
      requireActiveFinalizeLeaseToken(stored, input.leaseToken);

      if (
        latest.status !== OrganizationOffboardingJobStatus.RETRYABLE ||
        latest.phase !== 'READY_FOR_ARCHIVE' ||
        !isPhaseComplete(stored, 'READY_FOR_ARCHIVE')
      ) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
          message: 'Job is no longer READY_FOR_ARCHIVE at commit',
        });
      }

      const latestOrg = await tx.organization.findUnique({
        where: { id: input.organizationId },
        select: { status: true },
      });
      if (!latestOrg || latestOrg.status !== OrganizationStatus.SUSPENDED) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
          message: 'Organization must remain SUSPENDED through archival commit',
        });
      }

      const activeRegistryVehicles = await tx.vehicle.count({
        where: {
          organizationId: input.organizationId,
          registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
        },
      });
      if (activeRegistryVehicles > 0) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
          message: 'Active registry vehicles remain at archival commit',
        });
      }

      const mergedProgress: OrganizationOffboardingExecutionProgress = {
        ...stored,
        ...input.progress,
        finalizeLease: stored.finalizeLease,
      };
      this.assertProviderEvidenceAdmissible(mergedProgress);
      if (!providerAllowsArchiveAdmission(mergedProgress)) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_PROVIDER_QUIESCE_INCOMPLETE_CODE,
          message: 'Provider evidence invalid at archival commit',
        });
      }

      const closedAt = new Date();
      const finalizedProgress = releaseFinalizeLease({
        ...mergedProgress,
        finalize: {
          idempotencyKey: input.request.idempotencyKey,
          claimedAt: mergedProgress.finalize?.claimedAt ?? closedAt.toISOString(),
          actorUserId: input.actorUserId,
          inProgress: false,
          completedAt: closedAt.toISOString(),
        },
        archived: {
          organizationStatus: OrganizationStatus.ARCHIVED,
          archivedAt: closedAt.toISOString(),
        },
      });

      await tx.organization.update({
        where: { id: input.organizationId },
        data: { status: OrganizationStatus.ARCHIVED },
      });

      return tx.organizationOffboardingJob.update({
        where: { id: input.jobId },
        data: {
          status: OrganizationOffboardingJobStatus.COMPLETED,
          phase: 'READY_FOR_ARCHIVE',
          completedAt: closedAt,
          lastErrorCode: null,
          progressJson: toProgressJson(finalizedProgress),
        },
      });
    });
  }

  private async tryIdempotentReplay(
    organizationId: string,
    request: OrganizationOffboardFinalizeRequest,
  ): Promise<OrganizationOffboardingExecutionResult | null> {
    const job = await this.prisma.organizationOffboardingJob.findFirst({
      where: { id: request.jobId, organizationId },
    });
    if (!job || job.status !== OrganizationOffboardingJobStatus.COMPLETED) {
      return null;
    }
    const progress = parseExecutionProgress(job.progressJson);
    if (progress.finalize?.idempotencyKey !== request.idempotencyKey) {
      return null;
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    });
    if (org?.status !== OrganizationStatus.ARCHIVED) {
      return null;
    }
    return mapOffboardingJobToExecutionResult(job, true);
  }

  private async persistProgressUnderLease(
    jobId: string,
    leaseToken: string,
    progress: OrganizationOffboardingExecutionProgress,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM organization_offboarding_jobs WHERE id = ${jobId} FOR UPDATE`;
      const row = await tx.organizationOffboardingJob.findUniqueOrThrow({ where: { id: jobId } });
      const stored = parseExecutionProgress(row.progressJson);
      requireActiveFinalizeLeaseToken(stored, leaseToken);
      const merged = releaseFinalizeLease({
        ...stored,
        ...progress,
        finalizeLease: stored.finalizeLease,
      });
      await tx.organizationOffboardingJob.update({
        where: { id: jobId },
        data: {
          progressJson: toProgressJson(merged),
          lastErrorCode: progress.finalize?.lastErrorCode ?? ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
          status: OrganizationOffboardingJobStatus.RETRYABLE,
        },
      });
    });
  }

  private async markFinalizeBlocked(
    jobId: string,
    leaseToken: string,
    request: OrganizationOffboardFinalizeRequest,
    detail: string,
    actorUserId: string,
    organizationId: string,
  ): Promise<void> {
    const job = await this.prisma.organizationOffboardingJob.findUniqueOrThrow({ where: { id: jobId } });
    const progress = parseExecutionProgress(job.progressJson);
    await this.persistProgressUnderLease(jobId, leaseToken, {
      ...progress,
      finalize: {
        idempotencyKey: request.idempotencyKey,
        claimedAt: progress.finalize?.claimedAt ?? new Date().toISOString(),
        actorUserId,
        inProgress: false,
        lastErrorCode: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
        lastBlockedDetail: detail,
      },
    });
    await this.masterAudit.record({
      auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
      actorUserId,
      targetOrganizationId: organizationId,
      entityId: jobId,
      correlationId: job.correlationId,
      description: 'Organization offboarding finalization blocked',
      reasonCode: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
      route: 'POST /admin/organizations/:organizationId/offboarding/finalize',
      httpMethod: 'POST',
      httpStatus: 409,
      metadata: { detail },
      level: 'WARN',
    });
  }
}