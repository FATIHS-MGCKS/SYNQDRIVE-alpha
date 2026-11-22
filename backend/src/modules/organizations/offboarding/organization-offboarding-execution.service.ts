import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationOffboardingJobStatus,
  OrganizationStatus,
  VehicleProviderConsentStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
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
  ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_CONFLICT_CODE,
  ORGANIZATION_OFFBOARDING_EXECUTION_REVALIDATE_BLOCKED_CODE,
  ORGANIZATION_OFFBOARDING_NO_PREPARED_JOB_CODE,
  ORGANIZATION_OFFBOARDING_PROVIDER_QUIESCE_INCOMPLETE_CODE,
  ORGANIZATION_OFFBOARDING_VEHICLE_BATCH_BLOCKED_CODE,
} from './organization-offboarding-execution.policy';
import {
  isExecutionLeaseActive,
  mintExecutionLease,
  releaseExecutionLease,
} from './organization-offboarding-execution.lease';
import {
  ORGANIZATION_OFFBOARDING_EXECUTION_PHASES,
  isPhaseComplete,
  type OrganizationOffboardingExecutionPhase,
} from './organization-offboarding-execution.phases';
import {
  parseExecutionProgress,
  toProgressJson,
  type OrganizationOffboardingExecutionProgress,
  type ProviderFinalizationState,
} from './organization-offboarding-execution.progress';
import type { OrganizationOffboardingJobView } from './organization-offboarding.types';
import { ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES } from './organization-offboard-preflight.reason-codes';

export type OrganizationOffboardingExecutionResult = OrganizationOffboardingJobView & {
  executionIdempotentReplay: boolean;
  executionProgress: OrganizationOffboardingExecutionProgress;
};

type JobRow = {
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

function jobToView(row: JobRow, executionReplay: boolean): OrganizationOffboardingExecutionResult {
  const executionProgress = parseExecutionProgress(row.progressJson);
  return {
    jobId: row.id,
    organizationId: row.organizationId,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    phase: row.phase,
    correlationId: row.correlationId,
    requestedByUserId: row.requestedByUserId,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
    preflight: row.preflightSnapshot as OrganizationOffboardingJobView['preflight'],
    idempotentReplay: false,
    executionIdempotentReplay: executionReplay,
    executionProgress,
  };
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

function providerAllowsArchiveAdmission(
  progress: OrganizationOffboardingExecutionProgress,
): boolean {
  const state = progress.providerQuiesce?.finalizationState;
  return (
    state === 'NO_EXTERNAL_PROVIDER_DEPENDENCY' ||
    state === 'LOCAL_QUIESCE_CONFIRMED' ||
    state === 'EXTERNAL_DISCONNECT_CONFIRMED'
  );
}

@Injectable()
export class OrganizationOffboardingExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preflight: OrganizationOffboardPreflightService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly vehicleOffboard: VehicleOnboardingOffboardService,
    private readonly masterAudit: MasterAdminAuditService,
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

    const claim = await this.acquireExecutionLease(organizationId, request, actorUserId);
    let progress = claim.progress;
    let row = claim.job;
    const leaseToken = claim.leaseToken;

    const executionReplay =
      progress.execution?.idempotencyKey === request.idempotencyKey &&
      row.phase === 'READY_FOR_ARCHIVE' &&
      isPhaseComplete(progress, 'READY_FOR_ARCHIVE');

    if (executionReplay) {
      await this.releaseLease(row.id, progress);
      return jobToView(row, true);
    }

    try {
      for (const phase of ORGANIZATION_OFFBOARDING_EXECUTION_PHASES) {
        if (isPhaseComplete(progress, phase)) {
          continue;
        }
        if (phase === 'READY_FOR_ARCHIVE' && !providerAllowsArchiveAdmission(progress)) {
          break;
        }
        await this.assertHoldsLease(row.id, leaseToken);
        const outcome = await this.runPhase({
          phase,
          job: row,
          progress,
          organizationId,
          actorUserId,
        });
        progress = outcome.progress;
        row = await this.persistJob(
          row.id,
          progress,
          outcome.phase,
          outcome.status,
          outcome.lastErrorCode,
        );
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
      progress = await this.releaseLease(row.id, progress);
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
      if (
        leaseActive &&
        progress.executionLease?.executionIdempotencyKey !== request.idempotencyKey
      ) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_CONFLICT_CODE,
          message: 'An execution lease is already held for this organization',
          expiresAt: progress.executionLease?.expiresAt,
        });
      }

      if (
        !leaseActive ||
        progress.executionLease?.executionIdempotencyKey === request.idempotencyKey
      ) {
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
      }

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

  private async assertHoldsLease(jobId: string, leaseToken: string): Promise<void> {
    const row = await this.prisma.organizationOffboardingJob.findUnique({
      where: { id: jobId },
      select: { progressJson: true },
    });
    if (!row) {
      throw new NotFoundException('Offboarding job not found');
    }
    const progress = parseExecutionProgress(row.progressJson);
    if (progress.executionLease?.token !== leaseToken) {
      throw new ConflictException({
        code: ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_CONFLICT_CODE,
        message: 'Execution lease lost — stale executor fenced out',
      });
    }
  }

  private async releaseLease(
    jobId: string,
    progress: OrganizationOffboardingExecutionProgress,
  ): Promise<OrganizationOffboardingExecutionProgress> {
    const cleared = releaseExecutionLease(progress);
    await this.prisma.organizationOffboardingJob.update({
      where: { id: jobId },
      data: { progressJson: toProgressJson(cleared) },
    });
    return cleared;
  }

  private async persistJob(
    jobId: string,
    progress: OrganizationOffboardingExecutionProgress,
    phase: string,
    status: OrganizationOffboardingJobStatus,
    lastErrorCode: string | null,
  ): Promise<JobRow> {
    return this.prisma.organizationOffboardingJob.update({
      where: { id: jobId },
      data: {
        progressJson: toProgressJson(progress),
        phase,
        status,
        lastErrorCode,
      },
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
        if (!progress.sessions?.completedAt) {
          const revokedRefreshTokenCount =
            await this.refreshTokens.revokeAllActiveForOrganization(organizationId);
          const memberships = await this.prisma.organizationMembership.findMany({
            where: { organizationId },
            select: { id: true },
          });
          await this.prisma.organizationMembership.updateMany({
            where: { organizationId, id: { in: memberships.map((m) => m.id) } },
            data: { membershipVersion: { increment: 1 } },
          });
          progress = {
            ...progress,
            sessions: {
              completedAt: new Date().toISOString(),
              revokedRefreshTokenCount,
              membershipVersionsBumped: memberships.length,
            },
          };
        }
        progress = withPhaseCompleted(progress, phase);
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
        const activeProviderConsentCount = await this.prisma.vehicleProviderConsent.count({
          where: { organizationId, status: VehicleProviderConsentStatus.ACTIVE },
        });
        const connectedDimoVehicleCount = await this.prisma.vehicle.count({
          where: {
            organizationId,
            dimoVehicle: { connectionStatus: 'CONNECTED' },
          },
        });
        const hasExternalDependency =
          activeProviderConsentCount > 0 || connectedDimoVehicleCount > 0;
        let finalizationState: ProviderFinalizationState;
        if (!hasExternalDependency) {
          finalizationState = 'NO_EXTERNAL_PROVIDER_DEPENDENCY';
        } else {
          finalizationState = 'EXTERNAL_DISCONNECT_PENDING';
        }
        progress = {
          ...progress,
          providerQuiesce: {
            activeProviderConsentCount,
            connectedDimoVehicleCount,
            finalizationState,
          },
        };
        if (finalizationState === 'EXTERNAL_DISCONNECT_PENDING') {
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