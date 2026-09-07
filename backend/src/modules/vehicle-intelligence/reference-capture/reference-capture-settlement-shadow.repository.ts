import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReferenceCaptureSettlementShadowProbeType,
  ReferenceCaptureSettlementShadowScheduleStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class ReferenceCaptureSettlementShadowRepository {
  constructor(private readonly prisma: PrismaService) {}

  findExperimentBySessionId(sessionId: string) {
    return this.prisma.referenceCaptureSettlementShadowExperiment.findUnique({
      where: { sessionId },
      include: { schedules: true },
    });
  }

  createExperiment(input: {
    experimentId: string;
    sessionId: string;
    organizationId: string;
    vehicleId: string;
    tokenId: number;
    calibrationSeriesId?: string | null;
    metadataJson?: Prisma.InputJsonValue;
  }) {
    return this.prisma.referenceCaptureSettlementShadowExperiment.create({
      data: {
        experimentId: input.experimentId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tokenId: input.tokenId,
        calibrationSeriesId: input.calibrationSeriesId ?? null,
        status: 'ACTIVE',
        metadataJson: input.metadataJson ?? {},
      },
    });
  }

  updateExperimentTripBinding(
    experimentId: string,
    input: {
      vehicleTripId: string;
      tripStartTime: Date;
      tripEndTime: Date;
    },
  ) {
    return this.prisma.referenceCaptureSettlementShadowExperiment.update({
      where: { id: experimentId },
      data: {
        vehicleTripId: input.vehicleTripId,
        tripStartTime: input.tripStartTime,
        tripEndTime: input.tripEndTime,
      },
    });
  }

  updateLastSyncedPhaseCount(experimentId: string, count: number) {
    return this.prisma.referenceCaptureSettlementShadowExperiment.update({
      where: { id: experimentId },
      data: { lastSyncedPhaseCount: count },
    });
  }

  async createSchedulesIfAbsent(
    schedules: Array<{
      experimentId: string;
      sessionId: string;
      organizationId: string;
      vehicleId: string;
      tokenId: number;
      probeId: string;
      probeType: ReferenceCaptureSettlementShadowProbeType;
      phase: string | null;
      sourceIntervalStart: Date;
      sourceIntervalEnd: Date;
      queryFrom: Date;
      queryTo: Date;
      aggregationInterval: string;
      scheduledAgeMs: number;
      scheduledAt: Date;
      idempotencyKey: string;
    }>,
  ): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;
    for (const row of schedules) {
      try {
        await this.prisma.referenceCaptureSettlementShadowSchedule.create({ data: row });
        created += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }
    return { created, skipped };
  }

  findScheduleById(scheduleId: string) {
    return this.prisma.referenceCaptureSettlementShadowSchedule.findUnique({
      where: { id: scheduleId },
      include: { observation: true },
    });
  }

  findDuePendingSchedules(now: Date, limit = 100) {
    return this.prisma.referenceCaptureSettlementShadowSchedule.findMany({
      where: {
        status: ReferenceCaptureSettlementShadowScheduleStatus.PENDING,
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    });
  }

  findRecoverableSchedules(now: Date, limit = 200) {
    return this.prisma.referenceCaptureSettlementShadowSchedule.findMany({
      where: {
        status: {
          in: [
            ReferenceCaptureSettlementShadowScheduleStatus.PENDING,
            ReferenceCaptureSettlementShadowScheduleStatus.EXECUTING,
          ],
        },
        scheduledAt: { lte: now },
        observation: { is: null },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    });
  }

  updateBullJobId(scheduleId: string, bullJobId: string) {
    return this.prisma.referenceCaptureSettlementShadowSchedule.update({
      where: { id: scheduleId },
      data: { bullJobId },
    });
  }

  markExecuting(scheduleId: string) {
    return this.prisma.referenceCaptureSettlementShadowSchedule.update({
      where: { id: scheduleId },
      data: {
        status: ReferenceCaptureSettlementShadowScheduleStatus.EXECUTING,
        attemptCount: { increment: 1 },
      },
    });
  }

  markCompleted(scheduleId: string, executedAt: Date) {
    return this.prisma.referenceCaptureSettlementShadowSchedule.update({
      where: { id: scheduleId },
      data: {
        status: ReferenceCaptureSettlementShadowScheduleStatus.COMPLETED,
        executedAt,
        lastError: null,
      },
    });
  }

  markFailed(scheduleId: string, error: string) {
    return this.prisma.referenceCaptureSettlementShadowSchedule.update({
      where: { id: scheduleId },
      data: {
        status: ReferenceCaptureSettlementShadowScheduleStatus.FAILED,
        lastError: error,
      },
    });
  }

  markSkipped(scheduleId: string, reason: string) {
    return this.prisma.referenceCaptureSettlementShadowSchedule.update({
      where: { id: scheduleId },
      data: {
        status: ReferenceCaptureSettlementShadowScheduleStatus.SKIPPED,
        lastError: reason,
      },
    });
  }

  resetExecutingToPending(scheduleId: string) {
    return this.prisma.referenceCaptureSettlementShadowSchedule.updateMany({
      where: {
        id: scheduleId,
        status: ReferenceCaptureSettlementShadowScheduleStatus.EXECUTING,
      },
      data: {
        status: ReferenceCaptureSettlementShadowScheduleStatus.PENDING,
        bullJobId: null,
      },
    });
  }

  createObservation(input: {
    scheduleId: string;
    experimentId: string;
    sessionId: string;
    organizationId: string;
    vehicleId: string;
    tokenId: number;
    probeId: string;
    probeType: ReferenceCaptureSettlementShadowProbeType;
    phase: string | null;
    sourceIntervalStart: Date;
    sourceIntervalEnd: Date;
    scheduledAgeMs: number;
    actualAgeMs: number;
    scheduleDriftMs: number;
    requestStartedAt: Date;
    requestCompletedAt: Date;
    queryFrom: Date;
    queryTo: Date;
    aggregationInterval: string;
    providerRequestStatus: string;
    providerError: string | null;
    rawRowCount: number;
    responseHash: string;
    observationJson: Prisma.InputJsonValue;
  }) {
    return this.prisma.referenceCaptureSettlementShadowObservation.create({ data: input });
  }

  countPendingBySession(sessionId: string) {
    return this.prisma.referenceCaptureSettlementShadowSchedule.count({
      where: {
        sessionId,
        status: ReferenceCaptureSettlementShadowScheduleStatus.PENDING,
      },
    });
  }

  deleteExperimentArtifactsForSession(sessionId: string) {
    return this.prisma.referenceCaptureSettlementShadowExperiment.deleteMany({
      where: { sessionId },
    });
  }
}
