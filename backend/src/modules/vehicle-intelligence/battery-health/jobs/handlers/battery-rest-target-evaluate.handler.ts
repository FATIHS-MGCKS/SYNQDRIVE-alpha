import { Injectable, Logger } from '@nestjs/common';
import {
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isBatteryV2RestShadowEnabled } from '@config/battery-health-v2.config';
import { BatteryV2ProviderError } from '../battery-v2-job.errors';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryRestTargetEvaluatePayload } from '../battery-v2-job.types';
import { BatteryV2JobObservabilityService } from '../battery-v2-job-observability.service';
import { LvRestWindowState } from '../../battery-v2-domain';
import { BatteryRestTargetEvaluationService } from '../../lv-rest-window/battery-rest-target-evaluation.service';
import { measurementTypeForRestTarget } from '../../lv-rest-window/battery-rest-target-evaluation';
import {
  isCanonicalRestAssessmentHandoffEligible,
  isSyntheticRestMissedMeasurement,
  isSyntheticRestStatusMeasurement,
  readRestMeasurementTerminalReason,
} from '../../lv-rest-window/lv-rest-assessment-handoff.policy';
import { LvRestAssessmentHandoffService } from '../../lv-rest-window/lv-rest-assessment-handoff.service';
import { mutateLvRestSessionMetadata } from '../../lv-rest-window/lv-rest-session-metadata.mutation';
import {
  LV_REST_TARGET_JOB_STATUS,
  LV_REST_TARGET_TYPES,
  mergeLvRestTargetJobMetadata,
  readLvRestWindowSessionMetadata,
} from '../../lv-rest-window/lv-rest-window-target.metadata';
import { mapSessionStatusToLvRestWindowState } from '../../lv-rest-window/lv-rest-window.state-machine';

@Injectable()
export class BatteryRestTargetEvaluateHandler
  implements BatteryV2JobHandler<'BATTERY_REST_TARGET_EVALUATE'>
{
  readonly jobType = 'BATTERY_REST_TARGET_EVALUATE' as const;
  private readonly logger = new Logger(BatteryRestTargetEvaluateHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluation: BatteryRestTargetEvaluationService,
    private readonly observability: BatteryV2JobObservabilityService,
    private readonly assessmentHandoff: LvRestAssessmentHandoffService,
  ) {}

  async handle(payload: BatteryRestTargetEvaluatePayload): Promise<void> {
    if (!isBatteryV2RestShadowEnabled()) {
      this.logger.debug(
        `REST target skipped (shadow disabled): vehicle=${payload.vehicleId} type=${payload.restTargetType}`,
      );
      return;
    }

    const restTargetType = this.normalizeRestTargetType(payload.restTargetType);
    const restWindowId = payload.restWindowId;
    if (!restWindowId) {
      throw new BatteryV2ProviderError(
        'REST target job missing restWindowId',
        { retryable: false, jobType: this.jobType },
      );
    }

    const session = await this.loadSession(payload, restWindowId);
    if (!session) {
      throw new BatteryV2ProviderError(
        'REST target session not found for rest window',
        { retryable: true, jobType: this.jobType },
      );
    }

    const metadataState = readLvRestWindowSessionMetadata(session.metadata);
    const fsmState =
      mapSessionStatusToLvRestWindowState(
        session.status,
        metadataState.lvRestWindowState ?? null,
      ) ?? null;

    const existingMeasurement = await this.findTargetMeasurement(
      payload.organizationId,
      session.id,
      restTargetType,
    );

    if (existingMeasurement) {
      return this.handleExistingMeasurementReplay({
        payload,
        session,
        restTargetType,
        existingMeasurement,
      });
    }

    if (this.shouldCancelForInvalidatedWindow(fsmState, session.status)) {
      await this.updateTargetMetadata(session.id, session.organizationId, restTargetType, {
        status: LV_REST_TARGET_JOB_STATUS.CANCELLED,
        completedAt: new Date().toISOString(),
        cancelReason: metadataState.invalidatedReason ?? 'rest_window_invalidated',
      });
      this.logger.debug(
        `REST target cancelled (invalidated window): vehicle=${payload.vehicleId} window=${restWindowId} type=${restTargetType}`,
      );
      return;
    }

    const result = await this.evaluation.evaluateAndPersist({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      session,
      restTargetType,
    });

    if (!result.ok) {
      if (result.retryable) {
        await this.updateTargetMetadata(session.id, session.organizationId, restTargetType, {
          status: LV_REST_TARGET_JOB_STATUS.PENDING_EVALUATION,
          lastAttemptAt: new Date().toISOString(),
        });
        this.logger.debug(
          `REST target evaluation deferred (pending evidence): vehicle=${payload.vehicleId} window=${restWindowId} type=${restTargetType} reason=${result.reason}`,
        );
        return;
      }
      if (result.missed) {
        this.recordShadowMetrics(restTargetType, result.quality ?? 'MISSED');
        await this.updateTargetMetadata(session.id, session.organizationId, restTargetType, {
          status: LV_REST_TARGET_JOB_STATUS.MISSED,
          completedAt: new Date().toISOString(),
          cancelReason: result.reason,
        });
        this.logger.debug(
          `REST target missed: vehicle=${payload.vehicleId} window=${restWindowId} type=${restTargetType} reason=${result.reason}`,
        );
        return;
      }
      if (result.quality) {
        this.recordShadowMetrics(restTargetType, result.quality);
      }
      await this.updateTargetMetadata(session.id, session.organizationId, restTargetType, {
        status: LV_REST_TARGET_JOB_STATUS.FAILED,
        completedAt: new Date().toISOString(),
        cancelReason: result.reason,
      });
      return;
    }

    this.recordShadowMetrics(restTargetType, result.quality);

    if (result.measurementId) {
      await this.assessmentHandoff.ensureAssessmentHandoff({
        organizationId: payload.organizationId,
        vehicleId: payload.vehicleId,
        sessionId: session.id,
        restTargetType,
        measurementId: result.measurementId,
        correlationPrefix: 'lv-rest-direct',
      });
    }

    await this.updateTargetMetadata(session.id, session.organizationId, restTargetType, {
      status: LV_REST_TARGET_JOB_STATUS.COMPLETED,
      completedAt: new Date().toISOString(),
    });
    this.logger.debug(
      `REST target measurement persisted: vehicle=${payload.vehicleId} window=${restWindowId} type=${restTargetType} measurement=${result.measurementId}`,
    );
  }

  private async handleExistingMeasurementReplay(input: {
    payload: BatteryRestTargetEvaluatePayload;
    session: { id: string; organizationId: string };
    restTargetType: typeof LV_REST_TARGET_TYPES.REST_60M | typeof LV_REST_TARGET_TYPES.REST_6H;
    existingMeasurement: NonNullable<Awaited<ReturnType<typeof this.findTargetMeasurement>>>;
  }): Promise<void> {
    const { payload, session, restTargetType, existingMeasurement } = input;

    if (isCanonicalRestAssessmentHandoffEligible(existingMeasurement)) {
      await this.assessmentHandoff.ensureAssessmentHandoff({
        organizationId: payload.organizationId,
        vehicleId: payload.vehicleId,
        sessionId: session.id,
        restTargetType,
        measurementId: existingMeasurement.id,
        correlationPrefix: 'lv-rest-replay',
      });
      await this.updateTargetMetadata(session.id, session.organizationId, restTargetType, {
        status: LV_REST_TARGET_JOB_STATUS.COMPLETED,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    if (isSyntheticRestMissedMeasurement(existingMeasurement)) {
      const reason =
        readRestMeasurementTerminalReason(existingMeasurement) ??
        'no_eligible_observation_in_target_window';
      await this.updateTargetMetadata(session.id, session.organizationId, restTargetType, {
        status: LV_REST_TARGET_JOB_STATUS.MISSED,
        completedAt: new Date().toISOString(),
        cancelReason: reason,
      });
      return;
    }

    if (isSyntheticRestStatusMeasurement(existingMeasurement)) {
      const reason =
        readRestMeasurementTerminalReason(existingMeasurement) ?? 'unsupported_profile';
      await this.updateTargetMetadata(session.id, session.organizationId, restTargetType, {
        status: LV_REST_TARGET_JOB_STATUS.FAILED,
        completedAt: new Date().toISOString(),
        cancelReason: reason,
      });
      return;
    }

    this.logger.warn(
      `REST target replay ignored unknown measurement classification: vehicle=${payload.vehicleId} session=${session.id} measurement=${existingMeasurement.id}`,
    );
  }

  private recordShadowMetrics(
    restTargetType: typeof LV_REST_TARGET_TYPES.REST_60M | typeof LV_REST_TARGET_TYPES.REST_6H,
    quality: import('@prisma/client').BatteryMeasurementQuality,
  ): void {
    this.observability.recordLvRestShadowMeasurement({
      targetType: restTargetType,
      quality,
    });
  }

  private normalizeRestTargetType(
    value: BatteryRestTargetEvaluatePayload['restTargetType'],
  ): typeof LV_REST_TARGET_TYPES.REST_60M | typeof LV_REST_TARGET_TYPES.REST_6H {
    return value === LV_REST_TARGET_TYPES.REST_6H
      ? LV_REST_TARGET_TYPES.REST_6H
      : LV_REST_TARGET_TYPES.REST_60M;
  }

  private async loadSession(
    payload: BatteryRestTargetEvaluatePayload,
    restWindowId: string,
  ) {
    if (payload.sourceEntityId) {
      const byId = await this.prisma.batteryMeasurementSession.findFirst({
        where: {
          id: payload.sourceEntityId,
          organizationId: payload.organizationId,
          vehicleId: payload.vehicleId,
          type: BatteryMeasurementSessionType.LV_REST_WINDOW,
        },
      });
      if (byId) return byId;
    }

    return this.prisma.batteryMeasurementSession.findFirst({
      where: {
        organizationId: payload.organizationId,
        vehicleId: payload.vehicleId,
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
        idempotencyKey: restWindowId,
      },
    });
  }

  private async findTargetMeasurement(
    organizationId: string,
    sessionId: string,
    restTargetType: typeof LV_REST_TARGET_TYPES.REST_60M | typeof LV_REST_TARGET_TYPES.REST_6H,
  ) {
    return this.prisma.batteryMeasurement.findFirst({
      where: {
        organizationId,
        sessionId,
        type: measurementTypeForRestTarget(restTargetType),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private shouldCancelForInvalidatedWindow(
    fsmState: LvRestWindowState | null,
    sessionStatus: BatteryMeasurementSessionStatus,
  ): boolean {
    if (fsmState === LvRestWindowState.INVALIDATED) return true;
    if (fsmState === LvRestWindowState.EXPIRED) return true;
    if (sessionStatus === BatteryMeasurementSessionStatus.INVALID) return true;
    if (sessionStatus === BatteryMeasurementSessionStatus.MISSED) return true;
    return false;
  }

  private async updateTargetMetadata(
    sessionId: string,
    organizationId: string,
    restTargetType: typeof LV_REST_TARGET_TYPES.REST_60M | typeof LV_REST_TARGET_TYPES.REST_6H,
    patch: Parameters<typeof mergeLvRestTargetJobMetadata>[2],
  ): Promise<void> {
    await mutateLvRestSessionMetadata(this.prisma, {
      sessionId,
      organizationId,
      mutate: (metadata) =>
        mergeLvRestTargetJobMetadata(metadata, restTargetType, patch),
    });
  }
}
