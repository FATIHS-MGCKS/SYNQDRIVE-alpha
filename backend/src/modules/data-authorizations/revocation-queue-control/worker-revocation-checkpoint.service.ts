import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DenySwitchService } from '../deny-switch/deny-switch.service';
import { AUTHORIZATION_DECISION_ACTION } from '../authorization-decision-engine/authorization-decision.constants';
import { ScheduledJobRevocationService } from './scheduled-job-revocation.service';
import { WorkerRuntimeHealthService } from './worker-runtime-health.service';
import {
  REVOCATION_CHECKPOINT,
  REVOCATION_CHECKPOINT_REASON,
} from './revocation-queue-control.constants';
import type {
  WorkerRevocationCheckpointInput,
  WorkerRevocationCheckpointResult,
} from './revocation-queue-control.types';

/**
 * Safe checkpoint for running/retrying workers — re-evaluates deny switch before persist or external egress.
 */
@Injectable()
export class WorkerRevocationCheckpointService {
  private readonly logger = new Logger(WorkerRevocationCheckpointService.name);

  constructor(
    @Inject(forwardRef(() => DenySwitchService))
    private readonly denySwitch: DenySwitchService,
    private readonly prisma: PrismaService,
    @Optional() private readonly scheduledJobs?: ScheduledJobRevocationService,
    @Optional() private readonly runtimeHealth?: WorkerRuntimeHealthService,
  ) {}

  async assertMayProceed(
    input: WorkerRevocationCheckpointInput,
  ): Promise<WorkerRevocationCheckpointResult> {
    const checkpoint = input.checkpoint;

    if (this.runtimeHealth && !this.runtimeHealth.isWorkerCompliant()) {
      return {
        allowed: false,
        reasonCode: REVOCATION_CHECKPOINT_REASON.WORKER_POLICY_ENGINE_OUTDATED,
        checkpoint,
      };
    }

    if (this.scheduledJobs) {
      const paused = await this.scheduledJobs.isAnySchedulerPaused(input.organizationId);
      if (paused && input.checkpoint === REVOCATION_CHECKPOINT.PRE_ENQUEUE) {
        return {
          allowed: false,
          reasonCode: REVOCATION_CHECKPOINT_REASON.SCHEDULER_PAUSED,
          checkpoint,
        };
      }
    }

    const deny = this.denySwitch.evaluate({
      organizationId: input.organizationId,
      action:
        input.checkpoint === REVOCATION_CHECKPOINT.PRE_EXTERNAL
          ? AUTHORIZATION_DECISION_ACTION.SHARE
          : AUTHORIZATION_DECISION_ACTION.INGEST,
      processingActivityId: input.processingActivityId ?? undefined,
      enforcementPolicyId: input.enforcementPolicyId ?? undefined,
      consentId: input.consentId ?? undefined,
      resourceType: input.vehicleId ? 'VEHICLE' : undefined,
      resourceId: input.vehicleId ?? undefined,
    });

    if (deny?.denied) {
      this.logger.warn(
        `Worker checkpoint denied org=${input.organizationId} checkpoint=${checkpoint} reason=${REVOCATION_CHECKPOINT_REASON.DENY_SWITCH_ACTIVE}`,
      );
      return {
        allowed: false,
        reasonCode: REVOCATION_CHECKPOINT_REASON.DENY_SWITCH_ACTIVE,
        checkpoint,
      };
    }

    if (input.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!vehicle) {
        return {
          allowed: false,
          reasonCode: REVOCATION_CHECKPOINT_REASON.ORG_SCOPE_MISMATCH,
          checkpoint,
        };
      }
    }

    return { allowed: true, checkpoint };
  }

  async assertMayProceedForVehicleJob(
    vehicleId: string,
    checkpoint: WorkerRevocationCheckpointInput['checkpoint'],
    correlationId?: string,
  ): Promise<WorkerRevocationCheckpointResult> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle?.organizationId) {
      return {
        allowed: false,
        reasonCode: REVOCATION_CHECKPOINT_REASON.ORG_SCOPE_MISMATCH,
        checkpoint,
      };
    }
    return this.assertMayProceed({
      organizationId: vehicle.organizationId,
      vehicleId,
      checkpoint,
      correlationId,
    });
  }
}
