import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildAssessmentJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';
import { BatteryV2JobDeadLetterService } from '../jobs/battery-v2-job-dead-letter.service';
import { BatteryV2JobProducerService } from '../jobs/battery-v2-job-producer.service';
import { formatBatteryV2PipelineLog } from '../observability/battery-v2-pipeline-observability.util';
import type { LvRestAssessmentHandoffMetadata } from './lv-rest-assessment-handoff.metadata';
import {
  LV_REST_ASSESSMENT_HANDOFF_OUTCOME,
  LV_REST_ASSESSMENT_HANDOFF_REARM_REASON,
  LV_REST_ASSESSMENT_HANDOFF_STATUS,
  mergeSessionAssessmentHandoffMetadata,
  readAssessmentHandoffFromTargetMetadata,
  type LvRestAssessmentHandoffOutcome,
} from './lv-rest-assessment-handoff.metadata';
import {
  buildCanonicalLvAssessmentHandoffJobKey,
  isCanonicalRestAssessmentHandoffEligible,
  isRestAssessmentHandoffReconciliationTerminalCandidate,
  restTargetTypeForMeasurementType,
} from './lv-rest-assessment-handoff.policy';
import { mutateLvRestSessionMetadata } from './lv-rest-session-metadata.mutation';
import { isLegacyPersistence54000HandoffFailure } from './lv-rest-assessment-handoff-failure.policy';
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
      existingHandoff?.status === LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED &&
      existingHandoff.measurementId === measurement.id
    ) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'terminal_failed',
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

    if (
      await this.jobProducer.hasAssessDispatchConflict(input.vehicleId, idempotencyKey)
    ) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'vehicle_assess_job_live',
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

  /**
   * Reconciliation inspection path: attempt handoff repair, then durably record
   * fairness metadata for stable skip outcomes that otherwise remain at queue front.
   */
  async reconcileAssessmentHandoff(
    input: EnsureLvRestAssessmentHandoffInput,
  ): Promise<EnsureLvRestAssessmentHandoffResult> {
    const attemptedAt = new Date();
    await this.tryRearmFailedHandoffIfEligible(input);
    const result = await this.ensureAssessmentHandoff(input);

    if (this.shouldRecordReconciliationInspection(result)) {
      await this.touchReconciliationFairness({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        restTargetType: input.restTargetType,
        measurementId: input.measurementId,
        idempotencyKey: result.idempotencyKey,
        attemptedAt,
      });
    }

    return result;
  }

  /** Advance durable fairness cursor without attempting enqueue (repair budget exhausted). */
  async touchReconciliationFairness(input: {
    organizationId: string;
    sessionId: string;
    restTargetType: LvRestTargetType;
    measurementId: string;
    idempotencyKey: string;
    attemptedAt?: Date;
  }): Promise<void> {
    await this.touchReconciliationFairnessState({
      ...input,
      attemptedAt: input.attemptedAt ?? new Date(),
    });
  }

  /**
   * Fail-closed terminalization for reconciliation rows that retain sourceObservationId
   * but are not VALID (contaminated/missed). Prevents vehicle-level assess enqueue that
   * could publish from unrelated fresh evidence on the same vehicle.
   */
  async terminalizeIneligibleReconciliationCandidate(input: {
    organizationId: string;
    vehicleId: string;
    sessionId: string;
    restTargetType: LvRestTargetType;
    measurementId: string;
  }): Promise<void> {
    const measurement = await this.prisma.batteryMeasurement.findFirst({
      where: {
        id: input.measurementId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        sessionId: input.sessionId,
      },
    });
    if (!measurement) return;

    const measurementTargetType = restTargetTypeForMeasurementType(measurement.type);
    if (!measurementTargetType || measurementTargetType !== input.restTargetType) {
      return;
    }

    if (!isRestAssessmentHandoffReconciliationTerminalCandidate(measurement)) {
      return;
    }

    const session = await this.prisma.batteryMeasurementSession.findFirst({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
      },
    });
    if (!session) return;

    const existing = readAssessmentHandoffFromTargetMetadata(
      session.metadata,
      input.restTargetType,
    );
    if (existing?.measurementId && existing.measurementId !== input.measurementId) {
      return;
    }
    if (
      existing?.status === LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED &&
      existing.measurementId === input.measurementId
    ) {
      return;
    }
    if (
      existing?.status === LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED &&
      existing.measurementId === input.measurementId
    ) {
      return;
    }

    const idempotencyKey = buildCanonicalLvAssessmentHandoffJobKey({
      vehicleId: input.vehicleId,
      measurementId: input.measurementId,
    });
    const now = new Date().toISOString();

    await this.persistHandoffState({
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      restTargetType: input.restTargetType,
      handoffPatch: {
        measurementId: input.measurementId,
        idempotencyKey,
        status: LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED,
        outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.POLICY_SKIPPED,
        executedAt: now,
        lastAttemptAt: now,
      },
    });

    this.logger.debug(
      formatBatteryV2PipelineLog({
        component: 'assessment-handoff',
        event: 'assessment_handoff_ineligible_terminalized',
        status: 'completed',
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        correlationId: input.measurementId,
      }),
    );
  }

  async acknowledgeExecuted(input: {
    organizationId: string;
    vehicleId: string;
    measurementId: string;
    outcome: LvRestAssessmentHandoffOutcome;
  }): Promise<void> {
    await this.acknowledgeTerminalHandoff({
      ...input,
      status: LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED,
      executedAt: new Date().toISOString(),
    });
  }

  /**
   * Terminal handoff for non-retryable assess failures — prevents indefinite ENQUEUED + DLQ.
   */
  async acknowledgeTerminalFailure(input: {
    organizationId: string;
    vehicleId: string;
    measurementId: string;
    outcome: LvRestAssessmentHandoffOutcome;
    failedAt?: Date;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    await this.acknowledgeTerminalHandoff({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      measurementId: input.measurementId,
      outcome: input.outcome,
      status: LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED,
      executedAt: (input.failedAt ?? new Date()).toISOString(),
      failureHistory: {
        outcome: input.outcome,
        failedAt: (input.failedAt ?? new Date()).toISOString(),
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      },
    });
  }

  /**
   * Explicit FAILED → ENQUEUED rearm after repaired root cause and DLQ clearance.
   */
  async rearmFailedAssessmentHandoff(input: {
    organizationId: string;
    sessionId: string;
    restTargetType: LvRestTargetType;
    measurementId: string;
    idempotencyKey: string;
    rearmReason: (typeof LV_REST_ASSESSMENT_HANDOFF_REARM_REASON)[keyof typeof LV_REST_ASSESSMENT_HANDOFF_REARM_REASON];
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.persistHandoffState({
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      restTargetType: input.restTargetType,
      handoffPatch: {
        measurementId: input.measurementId,
        idempotencyKey: input.idempotencyKey,
        status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
        rearmReason: input.rearmReason,
        rearmedAt: now,
        lastAttemptAt: now,
      },
    });
  }

  private async tryRearmFailedHandoffIfEligible(
    input: EnsureLvRestAssessmentHandoffInput,
  ): Promise<void> {
    const session = await this.prisma.batteryMeasurementSession.findFirst({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
      },
    });
    if (!session) return;

    const existing = readAssessmentHandoffFromTargetMetadata(
      session.metadata,
      input.restTargetType,
    );
    if (
      existing?.status !== LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED ||
      existing.measurementId !== input.measurementId ||
      !isLegacyPersistence54000HandoffFailure(existing)
    ) {
      return;
    }

    const idempotencyKey = buildCanonicalLvAssessmentHandoffJobKey({
      vehicleId: input.vehicleId,
      measurementId: input.measurementId,
    });
    if (await this.deadLetters.isDeadLetter('BATTERY_ASSESSMENT_RECOMPUTE', idempotencyKey)) {
      return;
    }

    await this.rearmFailedAssessmentHandoff({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      restTargetType: input.restTargetType,
      measurementId: input.measurementId,
      idempotencyKey,
      rearmReason: LV_REST_ASSESSMENT_HANDOFF_REARM_REASON.LEGACY_PERSISTENCE_54000,
    });
  }

  private async acknowledgeTerminalHandoff(input: {
    organizationId: string;
    vehicleId: string;
    measurementId: string;
    outcome: LvRestAssessmentHandoffOutcome;
    status:
      | typeof LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED
      | typeof LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED;
    executedAt: string;
    failureHistory?: LvRestAssessmentHandoffMetadata['failureHistory'];
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
        status: input.status,
        outcome: input.outcome,
        executedAt: input.executedAt,
        lastAttemptAt: now,
        failureHistory: input.failureHistory ?? undefined,
      },
    });

    this.logger.debug(
      formatBatteryV2PipelineLog({
        component: 'assessment-handoff',
        event:
          input.status === LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED
            ? 'assessment_handoff_failed'
            : 'assessment_handoff_executed',
        status: 'completed',
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        correlationId: input.measurementId,
      }),
    );
  }

  private shouldRecordReconciliationInspection(
    result: EnsureLvRestAssessmentHandoffResult,
  ): boolean {
    if (result.enqueued) return false;
    if (result.reason === 'enqueue_suppressed') return false;
    if (result.reason === 'measurement_not_found') return false;
    if (result.reason === 'measurement_not_handoff_eligible') return false;
    if (result.reason === 'session_not_found') return false;
    return true;
  }

  private async touchReconciliationFairnessState(input: {
    organizationId: string;
    sessionId: string;
    restTargetType: LvRestTargetType;
    measurementId: string;
    idempotencyKey: string;
    attemptedAt: Date;
  }): Promise<void> {
    const session = await this.prisma.batteryMeasurementSession.findFirst({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
      },
    });
    if (!session) return;

    const existing = readAssessmentHandoffFromTargetMetadata(
      session.metadata,
      input.restTargetType,
    );

    await this.persistHandoffState({
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      restTargetType: input.restTargetType,
      handoffPatch: {
        measurementId: input.measurementId,
        idempotencyKey: input.idempotencyKey,
        status: existing?.status ?? LV_REST_ASSESSMENT_HANDOFF_STATUS.MISSING,
        lastAttemptAt: input.attemptedAt.toISOString(),
      },
    });
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
