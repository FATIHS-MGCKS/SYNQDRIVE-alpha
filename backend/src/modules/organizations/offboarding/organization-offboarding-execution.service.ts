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
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { acquireOrgSessionWriteLock } from '@modules/auth/refresh-token-session-concurrency';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { VehicleOnboardingError } from '@modules/vehicle-onboarding/errors/vehicle-onboarding.errors';
import { VehicleOnboardingOffboardService } from '@modules/vehicle-onboarding/services/vehicle-onboarding-offboard.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  acquirePgAdvisoryXactLock,
  organizationOffboardingExecuteLockKey,
} from '@shared/database/pg-advisory-lock.util';
import { OrganizationOffboardPreflightService } from './organization-offboard-preflight.service';
import type { OrganizationOffboardExecuteRequest } from './organization-offboarding-execute.validation';
import {
  assertOrganizationOffboardingExecutionAdmitted,
  ORGANIZATION_OFFBOARDING_EXECUTION_CONFLICT_CODE,
  ORGANIZATION_OFFBOARDING_EXECUTION_IN_PROGRESS_CODE,
  ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_CONFLICT_CODE,
  ORGANIZATION_OFFBOARDING_EXECUTION_REVALIDATE_BLOCKED_CODE,
  ORGANIZATION_OFFBOARDING_NO_PREPARED_JOB_CODE,
  ORGANIZATION_OFFBOARDING_PROVIDER_QUIESCE_INCOMPLETE_CODE,
  ORGANIZATION_OFFBOARDING_VEHICLE_BATCH_BLOCKED_CODE,
} from './organization-offboarding-execution.policy';
import {
  executionLeaseTtlMs,
  isExecutionLeaseActive,
  mintExecutionLease,
} from './organization-offboarding-execution.lease';
import {
  persistJobUnderActiveLease,
  releaseJobLeaseUnderActiveToken,
  requireActiveLeaseToken,
  type OffboardingJobLeaseRow,
} from './organization-offboarding-execution.lease-persist';
import {
  ORGANIZATION_OFFBOARDING_EXECUTION_PHASES,
  isPhaseComplete,
  type OrganizationOffboardingExecutionPhase,
} from './organization-offboarding-execution.phases';
import { mergeOffboardingProgressPreservingDimoOperatorFields } from './organization-offboarding-dimo-progress-preservation';
import {
  parseExecutionProgress,
  toProgressJson,
  type OrganizationOffboardingExecutionProgress,
} from './organization-offboarding-execution.progress';
import { mapOffboardingJobToExecutionResult } from './organization-offboarding-job-view.mapper';
import { providerAllowsArchiveAdmission } from './organization-offboarding-provider-admission.util';
import { OrganizationOffboardingProviderDisconnectService } from './organization-offboarding-provider-disconnect.service';
import type { OrganizationOffboardingJobView } from './organization-offboarding.types';
import { ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES } from './organization-offboard-preflight.reason-codes';

export type OrganizationOffboardingExecutionResult = OrganizationOffboardingJobView & {
  executionIdempotentReplay: boolean;
  executionProgress: OrganizationOffboardingExecutionProgress;
};

type JobRow = OffboardingJobLeaseRow;

function jobToView(row: JobRow, executionReplay: boolean): OrganizationOffboardingExecutionResult {
  return mapOffboardingJobToExecutionResult(row, executionReplay);
}

function withPhaseCompleted(
  progress: OrganizationOffboardingExecutionProgress,
  phase: OrganizationOffboardingExecutionPhase,
): OrganizationOffboardingExecutionProgress {
  return {
    ...progress,
    phasesCompleted: [...new Set([...progress.phasesCompleted, phase])],
  };
}

@Injectable()
export class OrganizationOffboardingExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preflight: OrganizationOffboardPreflightService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly vehicleOffboard: VehicleOnboardingOffboardService,
    private readonly masterAudit: MasterAdminAuditService,
    private readonly providerDisconnect: OrganizationOffboardingProviderDisconnectService,
  ) {}

  async execute(
    organizationId: string,
    request: OrganizationOffboardExecuteRequest,
    actorUserId: string | null,
  ): Promise<OrganizationOffboardingExecutionResult> {
    assertOrganizationOffboardingExecutionAdmitted();
    if (!actorUserId) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_OFFBOARDING_EXECUTION_ACTOR_REQUIRED',
        message: 'Authenticated master admin actor is required',
      });
    }

    const preparedRow = await this.findActivePreparedJob(organizationId);
    if (preparedRow) {
      const preparedProgress = parseExecutionProgress(preparedRow.progressJson);
      if (
        preparedProgress.execution?.idempotencyKey === request.idempotencyKey &&
        preparedRow.phase === 'READY_FOR_ARCHIVE' &&
        isPhaseComplete(preparedProgress, 'READY_FOR_ARCHIVE')
      ) {
        return jobToView(preparedRow, true);
      }
    }

    const claim = await this.acquireExecutionLease(organizationId, request, actorUserId);
    let progress = claim.progress;
    let row = claim.job;
    const leaseToken = claim.leaseToken;

    try {
      for (const phase of ORGANIZATION_OFFBOARDING_EXECUTION_PHASES) {
        if (isPhaseComplete(progress, phase)) {
          continue;
        }
        if (phase === 'READY_FOR_ARCHIVE' && !providerAllowsArchiveAdmission(progress)) {
          break;
        }
        let outcome = await this.runPhase({
          phase,
          job: row,
          progress,
          organizationId,
          actorUserId,
        });
        if (phase === 'REVOKE_ORG_SESSIONS' && !outcome.halt && !outcome.progress.sessions?.completedAt) {
          const sessionsProgress = await this.completeSessionsUnderActiveLease(
            organizationId,
            row.id,
            leaseToken,
            outcome.progress,
          );
          outcome = {
            ...outcome,
            progress: withPhaseCompleted(sessionsProgress, phase),
            phaseSuccess: true,
          };
        }
        row = await persistJobUnderActiveLease(this.prisma, {
          jobId: row.id,
          leaseToken,
          progress: outcome.progress,
          phase: outcome.phase,
          status: outcome.status,
          lastErrorCode: outcome.lastErrorCode,
        });
        progress = outcome.progress;
        await this.recordPhaseAudit({
          actorUserId,
          organizationId,
          job: row,
          phase: outcome.phase,
          success: outcome.phaseSuccess,
          reasonCode: outcome.lastErrorCode,
          leaseFence: progress.executionLease?.fence,
        });
        if (outcome.halt) {
          break;
        }
      }
    } finally {
      try {
        await releaseJobLeaseUnderActiveToken(this.prisma, row.id, leaseToken);
      } catch {
        // Stale executor — successor may already own the lease.
      }
      row = await this.prisma.organizationOffboardingJob.findUniqueOrThrow({
        where: { id: row.id },
      });
    }

    await this.recordPhaseAudit({
      actorUserId,
      organizationId,
      job: row,
      phase: row.phase,
      success: row.phase === 'READY_FOR_ARCHIVE',
      reasonCode: row.lastErrorCode,
      leaseFence: parseExecutionProgress(row.progressJson).executionLease?.fence,
      summary: true,
    });

    return jobToView(row, false);
  }

  private async findActivePreparedJob(organizationId: string): Promise<JobRow | null> {
    return this.prisma.organizationOffboardingJob.findFirst({
      where: {
        organizationId,
        status: { in: [...ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async acquireExecutionLease(
    organizationId: string,
    request: OrganizationOffboardExecuteRequest,
    actorUserId: string,
  ): Promise<{ job: JobRow; progress: OrganizationOffboardingExecutionProgress; leaseToken: string }> {
    const job = await this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock(tx, organizationOffboardingExecuteLockKey(organizationId));
      const row = await tx.organizationOffboardingJob.findFirst({
        where: {
          organizationId,
          status: { in: [...ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!row) {
        throw new NotFoundException({
          code: ORGANIZATION_OFFBOARDING_NO_PREPARED_JOB_CODE,
          message: 'No prepared offboarding job exists for this organization',
        });
      }

      let progress = parseExecutionProgress(row.progressJson);

      if (
        progress.execution?.idempotencyKey &&
        progress.execution.idempotencyKey !== request.idempotencyKey
      ) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_EXECUTION_CONFLICT_CODE,
          message: 'Another execution idempotency key is already bound to this job',
        });
      }

      const leaseActive = isExecutionLeaseActive(progress);
      if (leaseActive) {
        if (progress.executionLease?.executionIdempotencyKey !== request.idempotencyKey) {
          throw new ConflictException({
            code: ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_CONFLICT_CODE,
            message: 'An execution lease is already held for this organization',
            expiresAt: progress.executionLease?.expiresAt,
          });
        }
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_EXECUTION_IN_PROGRESS_CODE,
          message: 'Execution is already in progress for this idempotency key',
          expiresAt: progress.executionLease?.expiresAt,
        });
      }

      progress = mintExecutionLease(
        {
          ...progress,
          execution: {
            idempotencyKey: request.idempotencyKey,
            claimedAt: progress.execution?.claimedAt ?? new Date().toISOString(),
            actorUserId,
            lastRunAt: new Date().toISOString(),
          },
        },
        request.idempotencyKey,
      );

      return tx.organizationOffboardingJob.update({
        where: { id: row.id },
        data: { progressJson: toProgressJson(progress) },
      });
    });

    const progress = parseExecutionProgress(job.progressJson);
    const leaseToken = progress.executionLease?.token;
    if (!leaseToken) {
      throw new ConflictException({
        code: ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_CONFLICT_CODE,
        message: 'Failed to acquire execution lease',
      });
    }
    return { job, progress, leaseToken };
  }

  private async completeSessionsUnderActiveLease(
    organizationId: string,
    jobId: string,
    leaseToken: string,
    workingProgress: OrganizationOffboardingExecutionProgress,
  ): Promise<OrganizationOffboardingExecutionProgress> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM organization_offboarding_jobs WHERE id = ${jobId} FOR UPDATE`;
      const row = await tx.organizationOffboardingJob.findUniqueOrThrow({ where: { id: jobId } });
      const stored = parseExecutionProgress(row.progressJson);
      requireActiveLeaseToken(stored, leaseToken);

      if (stored.sessions?.completedAt) {
        return { ...workingProgress, sessions: stored.sessions };
      }

      await acquireOrgSessionWriteLock(tx, organizationId);

      const revokedRefreshTokenCount = await tx.refreshToken
        .updateMany({
          where: {
            organizationId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            revokedAt: new Date(),
            revocationReason: 'ORG_OFFBOARDING_SESSIONS_REVOKED',
          },
        })
        .then((r) => r.count);

      const memberships = await tx.organizationMembership.findMany({
        where: { organizationId },
        select: { id: true },
      });
      if (memberships.length > 0) {
        await tx.organizationMembership.updateMany({
          where: { organizationId, id: { in: memberships.map((m) => m.id) } },
          data: { membershipVersion: { increment: 1 } },
        });
      }

      const sessions = {
        completedAt: new Date().toISOString(),
        revokedRefreshTokenCount,
        membershipVersionsBumped: memberships.length,
      };

      const merged: OrganizationOffboardingExecutionProgress = mergeOffboardingProgressPreservingDimoOperatorFields(
        stored,
        {
          ...stored,
          ...workingProgress,
          sessions,
          executionLease: stored.executionLease,
        },
      );
      if (stored.executionLease) {
        merged.executionLease = {
          ...stored.executionLease,
          expiresAt: new Date(Date.now() + executionLeaseTtlMs()).toISOString(),
        };
      }

      await tx.organizationOffboardingJob.update({
        where: { id: jobId },
        data: { progressJson: toProgressJson(merged) },
      });
      return merged;
    });
  }

  private async recordPhaseAudit(input: {
    actorUserId: string;
    organizationId: string;
    job: JobRow;
    phase: string;
    success: boolean;
    reasonCode: string | null;
    leaseFence?: number;
    summary?: boolean;
  }): Promise<void> {
    await this.masterAudit.record({
      auditAction: input.success
        ? MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION
        : MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
      actorUserId: input.actorUserId,
      targetOrganizationId: input.organizationId,
      entityId: input.job.id,
      correlationId: input.job.correlationId,
      description: input.summary
        ? 'Organization offboarding execution run finished'
        : `Organization offboarding execution phase ${input.phase}`,
      reasonCode: input.reasonCode ?? (input.success ? 'ORG_OFFBOARDING_EXECUTION_PHASE_OK' : null),
      route: 'POST /admin/organizations/:organizationId/offboarding/execute',
      httpMethod: 'POST',
      httpStatus: input.success ? 200 : 409,
      metadata: {
        phase: input.phase,
        jobStatus: input.job.status,
        leaseFence: input.leaseFence ?? null,
        summary: input.summary ?? false,
      },
      level: input.success ? 'INFO' : 'WARN',
    });
  }

  private async runPhase(ctx: {
    phase: OrganizationOffboardingExecutionPhase;
    job: JobRow;
    progress: OrganizationOffboardingExecutionProgress;
    organizationId: string;
    actorUserId: string;
  }): Promise<{
    progress: OrganizationOffboardingExecutionProgress;
    phase: string;
    status: OrganizationOffboardingJobStatus;
    lastErrorCode: string | null;
    halt: boolean;
    phaseSuccess: boolean;
  }> {
    const { phase, job, organizationId, actorUserId } = ctx;
    let progress = ctx.progress;
    let status: OrganizationOffboardingJobStatus = ctx.job.status;
    let lastErrorCode: string | null = null;
    let halt = false;
    let phaseSuccess = false;

    switch (phase) {
      case 'REVALIDATE': {
        const snapshot = await this.preflight.assess(organizationId, {
          excludeOffboardingJobId: job.id,
          suspendAdmissionOnly: true,
        });
        const blocking = snapshot.hardBlockers.filter(
          (c) =>
            c !== 'ONGOING_TRIP' &&
            c !== 'ACTIVE_RENTAL_BOOKING' &&
            c !== 'RELEVANT_COMMITTED_BOOKING' &&
            c !== 'VEHICLE_OFFBOARD_BLOCKED',
        );
        if (blocking.length > 0) {
          return {
            progress,
            phase,
            status: OrganizationOffboardingJobStatus.RETRYABLE,
            lastErrorCode: ORGANIZATION_OFFBOARDING_EXECUTION_REVALIDATE_BLOCKED_CODE,
            halt: true,
            phaseSuccess: false,
          };
        }
        progress = withPhaseCompleted(progress, phase);
        phaseSuccess = true;
        break;
      }
      case 'SUSPEND': {
        const org = await this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { status: true },
        });
        if (!org) {
          throw new NotFoundException('Organization not found');
        }
        if (org.status === OrganizationStatus.PENDING || org.status === OrganizationStatus.ARCHIVED) {
          return {
            progress,
            phase,
            status: OrganizationOffboardingJobStatus.RETRYABLE,
            lastErrorCode: 'INVALID_ORGANIZATION_STATUS',
            halt: true,
            phaseSuccess: false,
          };
        }
        if (org.status === OrganizationStatus.ACTIVE) {
          await this.prisma.organization.update({
            where: { id: organizationId },
            data: { status: OrganizationStatus.SUSPENDED },
          });
          progress = {
            ...progress,
            suspend: { completedAt: new Date().toISOString(), priorStatus: 'ACTIVE' },
          };
        } else if (!progress.suspend) {
          progress = {
            ...progress,
            suspend: { completedAt: new Date().toISOString(), priorStatus: 'SUSPENDED' },
          };
        }
        progress = withPhaseCompleted(progress, phase);
        phaseSuccess = true;
        break;
      }
      case 'REVOKE_ORG_SESSIONS': {
        if (progress.sessions?.completedAt) {
          progress = withPhaseCompleted(progress, phase);
        }
        phaseSuccess = true;
        break;
      }
      case 'VEHICLE_OFFBOARD_BATCH': {
        const processed = new Set(progress.vehicleBatch?.processedVehicleIds ?? []);
        const vehicles = await this.prisma.vehicle.findMany({
          where: { organizationId, registryLifecycle: VehicleRegistryLifecycle.ACTIVE },
          orderBy: { id: 'asc' },
          select: { id: true },
        });
        for (const vehicle of vehicles) {
          if (processed.has(vehicle.id)) continue;
          try {
            await this.vehicleOffboard.offboardVehicle({
              organizationId,
              vehicleId: vehicle.id,
              reason: 'ADMINISTRATIVE_OFFBOARD',
              actorUserId,
              idempotencyKey: `org-offboard-exec:${job.id}:vehicle:${vehicle.id}`,
            });
            processed.add(vehicle.id);
            progress = {
              ...progress,
              vehicleBatch: {
                processedVehicleIds: [...processed],
                blockedVehicleId: undefined,
                blockedReasonCode: undefined,
              },
            };
          } catch (error) {
            const reason =
              error instanceof VehicleOnboardingError ? error.code : 'VEHICLE_OFFBOARD_FAILED';
            progress = {
              ...progress,
              vehicleBatch: {
                processedVehicleIds: [...processed],
                blockedVehicleId: vehicle.id,
                blockedReasonCode: reason,
              },
            };
            return {
              progress,
              phase,
              status: OrganizationOffboardingJobStatus.RETRYABLE,
              lastErrorCode: ORGANIZATION_OFFBOARDING_VEHICLE_BATCH_BLOCKED_CODE,
              halt: true,
              phaseSuccess: false,
            };
          }
        }
        progress = withPhaseCompleted(progress, phase);
        phaseSuccess = true;
        break;
      }
      case 'PROVIDER_QUIESCE': {
        const assessment = await this.providerDisconnect.assessOrganization(organizationId);
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
          return {
            progress,
            phase,
            status: OrganizationOffboardingJobStatus.RETRYABLE,
            lastErrorCode: ORGANIZATION_OFFBOARDING_PROVIDER_QUIESCE_INCOMPLETE_CODE,
            halt: true,
            phaseSuccess: false,
          };
        }
        progress = withPhaseCompleted(progress, phase);
        phaseSuccess = true;
        break;
      }
      case 'READY_FOR_ARCHIVE': {
        if (!providerAllowsArchiveAdmission(progress)) {
          return {
            progress,
            phase: 'PROVIDER_QUIESCE',
            status: OrganizationOffboardingJobStatus.RETRYABLE,
            lastErrorCode: ORGANIZATION_OFFBOARDING_PROVIDER_QUIESCE_INCOMPLETE_CODE,
            halt: true,
            phaseSuccess: false,
          };
        }
        progress = {
          ...withPhaseCompleted(progress, phase),
          readyForArchive: { markedAt: new Date().toISOString() },
        };
        status = OrganizationOffboardingJobStatus.RETRYABLE;
        lastErrorCode = null;
        phaseSuccess = true;
        break;
      }
      default:
        break;
    }

    return {
      progress,
      phase,
      status,
      lastErrorCode,
      halt,
      phaseSuccess,
    };
  }
}