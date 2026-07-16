import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildStartProxySessionIdempotencyKey } from '../lv-start-proxy/battery-start-proxy.policy';
import type { BatteryV2JobPayload, BatteryV2JobType } from './battery-v2-job.types';
import { validateBatteryV2JobIdempotencyKey } from './battery-v2-job-idempotency.validation';
import { BatteryV2VehicleLockService } from './battery-v2-vehicle-lock.service';

export interface BatteryV2JobExecutionInput<T extends BatteryV2JobType> {
  jobType: T;
  payload: BatteryV2JobPayload<T>;
  handler: () => Promise<void>;
}

export interface BatteryV2JobExecutionResult {
  skipped: boolean;
  skipReason?: 'already_completed';
}

@Injectable()
export class BatteryV2IdempotentExecutionService {
  private readonly logger = new Logger(BatteryV2IdempotentExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleLock: BatteryV2VehicleLockService,
  ) {}

  async execute<T extends BatteryV2JobType>(
    input: BatteryV2JobExecutionInput<T>,
  ): Promise<BatteryV2JobExecutionResult> {
    const { jobType, payload, handler } = input;
    validateBatteryV2JobIdempotencyKey(jobType, payload.idempotencyKey);

    const scope = this.vehicleLock.scopeForJobType(jobType);
    const lock = await this.vehicleLock.acquire(payload.vehicleId, scope);

    try {
      if (await this.isJobAlreadyCompleted(jobType, payload)) {
        this.logger.debug(
          `Battery V2 job skipped (idempotent): type=${jobType} key=${payload.idempotencyKey}`,
        );
        return { skipped: true, skipReason: 'already_completed' };
      }

      this.logger.debug(
        `Battery V2 job executing: type=${jobType} vehicle=${payload.vehicleId} key=${payload.idempotencyKey} correlation=${payload.correlationId}`,
      );
      await handler();

      return { skipped: false };
    } finally {
      await this.vehicleLock.release(lock);
    }
  }

  private async isJobAlreadyCompleted(
    jobType: BatteryV2JobType,
    payload: BatteryV2JobPayload,
  ): Promise<boolean> {
    const { organizationId, vehicleId, idempotencyKey } = payload;

    switch (jobType) {
      case 'BATTERY_OBSERVATION_CLASSIFY':
        if (idempotencyKey.startsWith('hv-snap:')) {
          const hv = await this.prisma.hvBatteryHealthSnapshot.findUnique({
            where: {
              vehicleId_idempotencyKey: { vehicleId, idempotencyKey },
            },
            select: { id: true },
          });
          return hv != null;
        }
        if (idempotencyKey.startsWith('battery-obs:')) {
          const lv = await this.prisma.batteryMeasurement.findUnique({
            where: {
              organizationId_vehicleId_idempotencyKey: {
                organizationId,
                vehicleId,
                idempotencyKey,
              },
            },
            select: { id: true },
          });
          return lv != null;
        }
        return false;
      case 'BATTERY_START_PROXY_EXTRACT': {
        const tripId = (payload as BatteryV2JobPayload<'BATTERY_START_PROXY_EXTRACT'>).tripId;
        const existing = await this.prisma.batteryMeasurementSession.findFirst({
          where: {
            organizationId,
            vehicleId,
            idempotencyKey: buildStartProxySessionIdempotencyKey(tripId),
          },
          select: { id: true },
        });
        return existing != null;
      }
      case 'BATTERY_ASSESSMENT_RECOMPUTE': {
        const existing = await this.prisma.batteryAssessment.findUnique({
          where: { vehicleId_idempotencyKey: { vehicleId, idempotencyKey } },
          select: { id: true },
        });
        return existing != null;
      }
      case 'BATTERY_PUBLICATION_UPDATE': {
        const existing = await this.prisma.batteryPublication.findUnique({
          where: {
            organizationId_vehicleId_idempotencyKey: {
              organizationId,
              vehicleId,
              idempotencyKey,
            },
          },
          select: { id: true },
        });
        return existing != null;
      }
      case 'HV_RECHARGE_SESSION_RECONCILE':
        // Allow re-runs for ongoing completion and late provider updates.
        return false;
      case 'HV_CAPACITY_SHADOW_RECOMPUTE': {
        const existing = await this.prisma.hvCapacityObservation.findUnique({
          where: { vehicleId_idempotencyKey: { vehicleId, idempotencyKey } },
          select: { id: true },
        });
        return existing != null;
      }
      case 'BATTERY_REST_TARGET_EVALUATE': {
        const restPayload = payload as BatteryV2JobPayload<'BATTERY_REST_TARGET_EVALUATE'>;
        const restTargetType = restPayload.restTargetType ?? 'REST_60M';
        const measurementType =
          restTargetType === 'REST_6H' ? 'REST_6H' : 'REST_60M';

        if (restPayload.sourceEntityId) {
          const measurement = await this.prisma.batteryMeasurement.findFirst({
            where: {
              organizationId,
              sessionId: restPayload.sourceEntityId,
              type: measurementType,
            },
            select: { id: true },
          });
          if (measurement) return true;
        }

        const session = restPayload.restWindowId
          ? await this.prisma.batteryMeasurementSession.findFirst({
              where: {
                organizationId,
                vehicleId,
                idempotencyKey: restPayload.restWindowId,
              },
              select: { metadata: true },
            })
          : null;

        if (session?.metadata && typeof session.metadata === 'object') {
          const meta = session.metadata as Record<string, unknown>;
          const targets = meta.scheduledTargets as Record<string, { status?: string }> | undefined;
          const entry = targets?.[restTargetType === 'REST_6H' ? 'REST_6H' : 'REST_60M'];
          if (
            entry?.status === 'COMPLETED' ||
            entry?.status === 'CANCELLED' ||
            entry?.status === 'PENDING_EVALUATION'
          ) {
            return true;
          }
        }

        return false;
      }
      default:
        return false;
    }
  }
}
