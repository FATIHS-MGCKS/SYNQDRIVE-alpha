import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildAssessmentJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';
import { BatteryV2JobDeadLetterService } from '../jobs/battery-v2-job-dead-letter.service';
import { BatteryV2JobProducerService } from '../jobs/battery-v2-job-producer.service';
import { formatBatteryV2PipelineLog } from '../observability/battery-v2-pipeline-observability.util';
import {
  LV_REST_ASSESSMENT_HANDOFF_OUTCOME,
  LV_REST_ASSESSMENT_HANDOFF_STATUS,
  mergeSessionAssessmentHandoffMetadata,
  readAssessmentHandoffFromTargetMetadata,
  type LvRestAssessmentHandoffOutcome,
} from './lv-rest-assessment-handoff.metadata';
import {
  buildCanonicalLvAssessmentHandoffJobKey,
  isCanonicalRestAssessmentHandoffEligible,
  restTargetTypeForMeasurementType,
} from './lv-rest-assessment-handoff.policy';
import { mutateLvRestSessionMetadata } from './lv-rest-session-metadata.mutation';
import type { LvRestTargetType } from './lv-rest-window-target.metadata';

export interface EnsureLvRestAssessmentHandoffInput {
  organizationId: string;
  vehicleId: string;
  sessionId: string;
  restTargetType: LvRestTargetType;
  measurementId: string;
  correlationPrefix?: string;
}

export interface EnsureLvRestAssessmentHandoffResult {
  enqueued: boolean;
  skipped: boolean;
  reason?: string;
  jobId?: string | null;
  idempotencyKey: string;
}

@Injectable()
export class LvRestAssessmentHandoffService {
  private readonly logger = new Logger(LvRestAssessmentHandoffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobProducer: BatteryV2JobProducerService,
    private readonly deadLetters: BatteryV2JobDeadLetterService,
  ) {}

  async ensureAssessmentHandoff(
    input: EnsureLvRestAssessmentHandoffInput,
  ): Promise<EnsureLvRestAssessmentHandoffResult> {
    const measurement = await this.prisma.batteryMeasurement.findFirst({
      where: {
        id: input.measurementId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        sessionId: input.sessionId,
      },
    });

    if (!measurement) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'measurement_not_found',
        idempotencyKey: buildCanonicalLvAssessmentHandoffJobKey({
          vehicleId: input.vehicleId,
          measurementId: input.measurementId,
        }),
      };
    }

    if (!isCanonicalRestAssessmentHandoffEligible(measurement)) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'measurement_not_handoff_eligible',
        idempotencyKey: buildCanonicalLvAssessmentHandoffJobKey({
          vehicleId: input.vehicleId,
          measurementId: input.measurementId,
        }),
      };
    }

    const idempotencyKey = buildCanonicalLvAssessmentHandoffJobKey({
      vehicleId: input.vehicleId,
      measurementId: measurement.id,
    });

    const session = await this.prisma.batteryMeasurementSession.findFirst({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
      },
    });
    if (!session) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'session_not_found',
        idempotencyKey,
      };
    }

    const existingHandoff = readAssessmentHandoffFromTargetMetadata(
      session.metadata,
      input.restTargetType,
    );
    if (
      existingHandoff?.status === LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED &&
      existingHandoff.measurementId === measurement.id
    ) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'already_executed',
        idempotencyKey,
      };
    }

    if (
      existingHandoff?.status === LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED &&
      existingHandoff.measurementId === measurement.id &&
      existingHandoff.idempotencyKey === idempotencyKey
    ) {
      const live = await this.jobProducer.hasLiveJob(idempotencyKey);
      if (live) {
        return {
          enqueued: false,
          skipped: true,
          reason: 'already_enqueued_live',
          idempotencyKey,
          jobId: existingHandoff.bullJobId ?? null,
        };
      }
    }

    if (
      await this.deadLetters.isDeadLetter('BATTERY_ASSESSMENT_RECOMPUTE', idempotencyKey)
    ) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'dead_letter',
        idempotencyKey,
      };
    }

    const now = new Date();
    const correlationPrefix = input.correlationPrefix ?? 'lv-rest-handoff';
    const jobId = await this.jobProducer.enqueue('BATTERY_ASSESSMENT_RECOMPUTE', {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      idempotencyKey,
      assessmentType: 'LV_HEALTH',
      inputVersion: measurement.id,
      sourceEntityId: measurement.id,
      requestedAt: now.toISOString(),
      correlationId: `${correlationPrefix}:${input.vehicleId}:${measurement.id}`,
    });

    if (!jobId) {
      await this.persistHandoffState({
        sessionId: input.sessionId,
        organizationId: input.organizationId,
        restTargetType: input.restTargetType,
        handoffPatch: {
          measurementId: measurement.id,
          idempotencyKey,
          status: existingHandoff?.status ?? LV_REST_ASSESSMENT_HANDOFF_STATUS.MISSING,
          lastAttemptAt: now.toISOString(),
        },
      });
      return {
        enqueued: false,
        skipped: true,
        reason: 'enqueue_suppressed',
        idempotencyKey,
      };
    }

    await this.persistHandoffState({
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      restTargetType: input.restTargetType,
      handoffPatch: {
        measurementId: measurement.id,
        idempotencyKey,
        status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
        enqueuedAt: now.toISOString(),
        lastAttemptAt: now.toISOString(),
        bullJobId: jobId,
      },
    });

    this.logger.log(
      formatBatteryV2PipelineLog({
        component: 'assessment-handoff',
        event: 'assessment_handoff_enqueued',
        status: 'completed',
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        jobType: 'BATTERY_ASSESSMENT_RECOMPUTE',
        correlationId: `${correlationPrefix}:${measurement.id}`,
      }),
    );

    return {
      enqueued: true,
      skipped: false,
      jobId,
      idempotencyKey,
    };
  }

  async acknowledgeExecuted(input: {
    organizationId: string;
    vehicleId: string;
    measurementId: string;
    outcome: LvRestAssessmentHandoffOutcome;
  }): Promise<void> {
    const measurement = await this.prisma.batteryMeasurement.findFirst({
      where: {
        id: input.measurementId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
    });
    if (!measurement?.sessionId) return;
    if (!isCanonicalRestAssessmentHandoffEligible(measurement)) return;

    const restTargetType = restTargetTypeForMeasurementType(measurement.type);
    if (!restTargetType) return;

    const session = await this.prisma.batteryMeasurementSession.findFirst({
      where: {
        id: measurement.sessionId,
        organizationId: input.organizationId,
      },
    });
    if (!session) return;

    const now = new Date().toISOString();
    const idempotencyKey = buildAssessmentJobIdempotencyKey({
      vehicleId: input.vehicleId,
      assessmentType: 'LV_HEALTH',
      inputVersion: measurement.id,
    });

    await this.persistHandoffState({
      sessionId: measurement.sessionId,
      organizationId: input.organizationId,
      restTargetType,
      handoffPatch: {
        measurementId: measurement.id,
        idempotencyKey,
        status: LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED,
        outcome: input.outcome,
        executedAt: now,
        lastAttemptAt: now,
      },
    });

    this.logger.debug(
      formatBatteryV2PipelineLog({
        component: 'assessment-handoff',
        event: 'assessment_handoff_executed',
        status: 'completed',
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        correlationId: input.measurementId,
      }),
    );
  }

  private async persistHandoffState(input: {
    sessionId: string;
    organizationId: string;
    restTargetType: LvRestTargetType;
    handoffPatch: Parameters<typeof mergeSessionAssessmentHandoffMetadata>[2];
  }): Promise<void> {
    await mutateLvRestSessionMetadata(this.prisma, {
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      mutate: (metadata) =>
        mergeSessionAssessmentHandoffMetadata(
          metadata,
          input.restTargetType,
          input.handoffPatch,
        ),
    });
  }
}

export function mapAssessmentRecomputeOutcome(input: {
  ok: boolean;
  unsupportedProfile?: boolean;
  persistedAssessmentIds?: string[];
}): LvRestAssessmentHandoffOutcome {
  if (input.ok) {
    return LV_REST_ASSESSMENT_HANDOFF_OUTCOME.ASSESSMENT_PERSISTED;
  }
  if (input.unsupportedProfile) {
    return LV_REST_ASSESSMENT_HANDOFF_OUTCOME.UNSUPPORTED;
  }
  return LV_REST_ASSESSMENT_HANDOFF_OUTCOME.POLICY_SKIPPED;
}
