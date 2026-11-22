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
  ORGANIZATION_OFFBOARDING_EXECUTION_REVALIDATE_BLOCKED_CODE,
  ORGANIZATION_OFFBOARDING_NO_PREPARED_JOB_CODE,
  ORGANIZATION_OFFBOARDING_PROVIDER_QUIESCE_INCOMPLETE_CODE,
  ORGANIZATION_OFFBOARDING_VEHICLE_BATCH_BLOCKED_CODE,
} from './organization-offboarding-execution.policy';
import {
  ORGANIZATION_OFFBOARDING_EXECUTION_PHASES,
  isPhaseComplete,
  type OrganizationOffboardingExecutionPhase,
} from './organization-offboarding-execution.phases';
import {
  parseExecutionProgress,
  toProgressJson,
  type OrganizationOffboardingExecutionProgress,
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

    const job = await this.claimJob(organizationId, request, actorUserId);
    let progress = parseExecutionProgress(job.progressJson);

    const executionReplay =
      progress.execution?.idempotencyKey === request.idempotencyKey &&
      job.phase === 'READY_FOR_ARCHIVE' &&
      isPhaseComplete(progress, 'READY_FOR_ARCHIVE');

    if (executionReplay) {
      return jobToView(job, true);
    }

    let row = job;
    for (const phase of ORGANIZATION_OFFBOARDING_EXECUTION_PHASES) {
      if (isPhaseComplete(progress, phase)) {
        continue;
      }
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
      if (outcome.halt) {
        break;
      }
    }

    void this.masterAudit.record({
      auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
      actorUserId,
      targetOrganizationId: organizationId,
      entityId: row.id,
      correlationId: row.correlationId,
      description: 'Organization offboarding execution run',
      reasonCode: 'ORG_OFFBOARDING_EXECUTION',
      route: 'POST /admin/organizations/:organizationId/offboarding/execute',
      httpMethod: 'POST',
      httpStatus: 200,
      metadata: {
        phase: row.phase,
        status: row.status,
        phasesCompletedCount: progress.phasesCompleted.length,
      },
      level: row.status === OrganizationOffboardingJobStatus.RETRYABLE ? 'WARN' : 'INFO',
    });

    return jobToView(row, false);
  }

  private async claimJob(
    organizationId: string,
    request: OrganizationOffboardExecuteRequest,
    actorUserId: string,
  ): Promise<JobRow> {
    return this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock(tx, organizationOffboardingExecuteLockKey(organizationId));
      const job = await tx.organizationOffboardingJob.findFirst({
        where: {
          organizationId,
          status: { in: [...ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!job) {
        throw new NotFoundException({
          code: ORGANIZATION_OFFBOARDING_NO_PREPARED_JOB_CODE,
          message: 'No prepared offboarding job exists for this organization',
        });
      }

      const progress = parseExecutionProgress(job.progressJson);
      if (
        progress.execution?.idempotencyKey &&
        progress.execution.idempotencyKey !== request.idempotencyKey
      ) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_EXECUTION_CONFLICT_CODE,
          message: 'Another execution idempotency key is already bound to this job',
        });
      }

      const nextProgress: OrganizationOffboardingExecutionProgress = {
        ...progress,
        execution: {
          idempotencyKey: request.idempotencyKey,
          claimedAt: progress.execution?.claimedAt ?? new Date().toISOString(),
          actorUserId,
          lastRunAt: new Date().toISOString(),
        },
      };

      return tx.organizationOffboardingJob.update({
        where: { id: job.id },
        data: { progressJson: toProgressJson(nextProgress) },
      });
    });
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
  }> {
    const { phase, job, organizationId, actorUserId } = ctx;
    let progress = ctx.progress;
    let status: OrganizationOffboardingJobStatus = ctx.job.status;
    let lastErrorCode: string | null = null;
    let halt = false;

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
            progress: {
              ...progress,
              phasesCompleted: [...new Set([...progress.phasesCompleted, phase])],
            },
            phase,
            status: OrganizationOffboardingJobStatus.RETRYABLE,
            lastErrorCode: ORGANIZATION_OFFBOARDING_EXECUTION_REVALIDATE_BLOCKED_CODE,
            halt: true,
          };
        }
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
        break;
      }
      case 'REVOKE_ORG_SESSIONS': {
        const revokedRefreshTokenCount =
          await this.refreshTokens.revokeAllActiveForOrganization(organizationId);
        const memberships = await this.prisma.organizationMembership.findMany({
          where: { organizationId },
          select: { id: true },
        });
        for (const membership of memberships) {
          await this.prisma.organizationMembership.update({
            where: { id: membership.id },
            data: { membershipVersion: { increment: 1 } },
          });
        }
        progress = {
          ...progress,
          sessions: {
            revokedRefreshTokenCount,
            membershipVersionsBumped: memberships.length,
          },
        };
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
              progress: {
                ...progress,
                vehicleBatch: {
                  processedVehicleIds: [...processed],
                  blockedVehicleId: vehicle.id,
                  blockedReasonCode: reason,
                },
                phasesCompleted: [...new Set([...progress.phasesCompleted, phase])],
              },
              phase,
              status: OrganizationOffboardingJobStatus.RETRYABLE,
              lastErrorCode: ORGANIZATION_OFFBOARDING_VEHICLE_BATCH_BLOCKED_CODE,
              halt: true,
            };
          }
        }
        progress = { ...progress, vehicleBatch: { processedVehicleIds: [...processed] } };
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
        const localQuiesceIncomplete =
          activeProviderConsentCount > 0 || connectedDimoVehicleCount > 0;
        progress = {
          ...progress,
          providerQuiesce: {
            activeProviderConsentCount,
            connectedDimoVehicleCount,
            externalProviderDisconnect: 'NOT_AVAILABLE_P6D3',
            localQuiesceIncomplete,
          },
        };
        if (localQuiesceIncomplete) {
          status = OrganizationOffboardingJobStatus.RETRYABLE;
          lastErrorCode = ORGANIZATION_OFFBOARDING_PROVIDER_QUIESCE_INCOMPLETE_CODE;
          halt = true;
          progress = {
            ...progress,
            phasesCompleted: [...new Set([...progress.phasesCompleted, 'PROVIDER_QUIESCE' as const])],
          };
          return { progress, phase: 'PROVIDER_QUIESCE', status, lastErrorCode, halt };
        }
        break;
      }
      case 'READY_FOR_ARCHIVE': {
        progress = {
          ...progress,
          readyForArchive: { markedAt: new Date().toISOString() },
        };
        status = OrganizationOffboardingJobStatus.RETRYABLE;
        lastErrorCode = null;
        break;
      }
      default:
        break;
    }

    progress = {
      ...progress,
      phasesCompleted: [...new Set([...progress.phasesCompleted, phase])],
    };

    return {
      progress,
      phase,
      status,
      lastErrorCode,
      halt,
    };
  }
}