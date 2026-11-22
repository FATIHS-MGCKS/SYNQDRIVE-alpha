import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationOffboardingJobStatus,
  OrganizationStatus,
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

    const row = await this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock(tx, organizationOffboardingFinalizeLockKey(organizationId));

      const job = await tx.organizationOffboardingJob.findFirst({
        where: { id: request.jobId, organizationId },
      });
      if (!job) {
        throw new NotFoundException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_JOB_BINDING_CODE,
          message: 'Offboarding job not found for this organization',
        });
      }

      if (job.status === OrganizationOffboardingJobStatus.COMPLETED) {
        const progress = parseExecutionProgress(job.progressJson);
        if (progress.finalize?.idempotencyKey === request.idempotencyKey) {
          return job;
        }
      }

      if (
        job.status !== OrganizationOffboardingJobStatus.RETRYABLE ||
        job.phase !== 'READY_FOR_ARCHIVE' ||
        !isPhaseComplete(parseExecutionProgress(job.progressJson), 'READY_FOR_ARCHIVE')
      ) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
          message: 'Offboarding job is not ready for archival finalization',
          jobStatus: job.status,
          phase: job.phase,
        });
      }

      const progress = parseExecutionProgress(job.progressJson);
      if (progress.finalize?.idempotencyKey && progress.finalize.idempotencyKey !== request.idempotencyKey) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_CONFLICT_CODE,
          message: 'Another finalization idempotency key is already bound to this job',
        });
      }
      if (progress.finalize?.inProgress && progress.finalize.idempotencyKey === request.idempotencyKey) {
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

      const inProgressProgress: OrganizationOffboardingExecutionProgress = {
        ...progress,
        finalize: {
          idempotencyKey: request.idempotencyKey,
          claimedAt: progress.finalize?.claimedAt ?? new Date().toISOString(),
          actorUserId,
          inProgress: true,
        },
      };
      return tx.organizationOffboardingJob.update({
        where: { id: job.id },
        data: { progressJson: toProgressJson(inProgressProgress) },
      });
    });

    const assessment = await this.providerDisconnect.assessOrganization(organizationId);
    const snapshot = await this.preflight.assess(organizationId, {
      excludeOffboardingJobId: row.id,
    });

    if (snapshot.hardBlockers.length > 0) {
      await this.markFinalizeBlocked(row.id, request, snapshot.hardBlockers.join(','), actorUserId, organizationId);
      throw new ConflictException({
        code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
        message: 'Finalization blocked by organization preflight',
        hardBlockers: snapshot.hardBlockers,
      });
    }

    let progress = parseExecutionProgress(row.progressJson);
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

    if (!providerAllowsArchiveAdmission(progress)) {
      await this.persistProgress(row.id, {
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

    const completed = await this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock(tx, organizationOffboardingFinalizeLockKey(organizationId));
      const latest = await tx.organizationOffboardingJob.findUniqueOrThrow({ where: { id: row.id } });
      const latestOrg = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { status: true },
      });
      if (!latestOrg || latestOrg.status !== OrganizationStatus.SUSPENDED) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
          message: 'Organization status changed before archival commit',
        });
      }

      const closedAt = new Date();
      const finalizedProgress: OrganizationOffboardingExecutionProgress = {
        ...parseExecutionProgress(latest.progressJson),
        ...progress,
        finalize: {
          idempotencyKey: request.idempotencyKey,
          claimedAt: progress.finalize?.claimedAt ?? closedAt.toISOString(),
          actorUserId,
          inProgress: false,
          completedAt: closedAt.toISOString(),
        },
        archived: { organizationStatus: OrganizationStatus.ARCHIVED, archivedAt: closedAt.toISOString() },
      };

      await tx.organization.update({
        where: { id: organizationId },
        data: { status: OrganizationStatus.ARCHIVED },
      });

      return tx.organizationOffboardingJob.update({
        where: { id: row.id },
        data: {
          status: OrganizationOffboardingJobStatus.COMPLETED,
          phase: 'READY_FOR_ARCHIVE',
          completedAt: closedAt,
          lastErrorCode: null,
          progressJson: toProgressJson(finalizedProgress),
        },
      });
    });

    await this.masterAudit.record({
      auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
      actorUserId,
      targetOrganizationId: organizationId,
      entityId: completed.id,
      correlationId: completed.correlationId,
      description: 'Organization offboarding archival finalization completed',
      reasonCode: 'ORG_OFFBOARDING_ARCHIVED',
      route: 'POST /admin/organizations/:organizationId/offboarding/finalize',
      httpMethod: 'POST',
      httpStatus: 200,
      metadata: {
        jobId: completed.id,
        idempotencyKey: request.idempotencyKey,
      },
      level: 'INFO',
    });

    const finalRow = await this.prisma.organizationOffboardingJob.findUniqueOrThrow({
      where: { id: completed.id },
    });
    return mapOffboardingJobToExecutionResult(finalRow, true);
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

  private async persistProgress(jobId: string, progress: OrganizationOffboardingExecutionProgress): Promise<void> {
    await this.prisma.organizationOffboardingJob.update({
      where: { id: jobId },
      data: {
        progressJson: toProgressJson(progress),
        lastErrorCode: progress.finalize?.lastErrorCode ?? ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
        status: OrganizationOffboardingJobStatus.RETRYABLE,
      },
    });
  }

  private async markFinalizeBlocked(
    jobId: string,
    request: OrganizationOffboardFinalizeRequest,
    detail: string,
    actorUserId: string,
    organizationId: string,
  ): Promise<void> {
    const job = await this.prisma.organizationOffboardingJob.findUniqueOrThrow({ where: { id: jobId } });
    const progress = parseExecutionProgress(job.progressJson);
    await this.persistProgress(jobId, {
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