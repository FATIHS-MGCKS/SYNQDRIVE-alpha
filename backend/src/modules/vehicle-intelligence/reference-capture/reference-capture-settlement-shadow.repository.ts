import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReferenceCaptureSettlementShadowProbeType,
  ReferenceCaptureSettlementShadowScheduleStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS } from './reference-capture-settlement-shadow.constants';

export type SettlementShadowAbortTerminalizationResult = {
  schedulesSkipped: number;
  schedulesCompleted: number;
  terminalized: boolean;
};

@Injectable()
export class ReferenceCaptureSettlementShadowRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: Prisma.TransactionClient): PrismaService | Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  findExperimentBySessionId(sessionId: string) {
    return this.prisma.referenceCaptureSettlementShadowExperiment.findUnique({
      where: { sessionId },
      include: { schedules: true },
    });
  }

  findExperimentStatusById(experimentDbId: string) {
    return this.prisma.referenceCaptureSettlementShadowExperiment.findUnique({
      where: { id: experimentDbId },
      select: { status: true },
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
        status: REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE,
        metadataJson: input.metadataJson ?? {},
      },
    });
  }

  findActiveBullJobIdsForSession(sessionId: string): Promise<Array<{ id: string; bullJobId: string }>> {
    return this.prisma.referenceCaptureSettlementShadowSchedule.findMany({
      where: {
        sessionId,
        bullJobId: { not: null },
        status: {
          in: [
            ReferenceCaptureSettlementShadowScheduleStatus.PENDING,
            ReferenceCaptureSettlementShadowScheduleStatus.EXECUTING,
          ],
        },
      },
      select: { id: true, bullJobId: true },
    }) as Promise<Array<{ id: string; bullJobId: string }>>;
  }

  findAbortedSessionsWithActiveExperiments(limit = 50) {
    return this.prisma.referenceCaptureSettlementShadowExperiment.findMany({
      where: {
        status: REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE,
        session: { status: 'ABORTED' },
      },
      include: {
        session: {
          select: {
            organizationId: true,
            failureReason: true,
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Atomic DB unit for RC abort settlement cleanup. Must run inside prisma.$transaction.
   */
  async terminalizeAbortedSessionInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      sessionId: string;
      experimentDbId: string;
      abortReason: string;
      abortedAt: string;
      organizationId: string;
      existingMetadata: Prisma.JsonValue | null;
      skipReason: string;
    },
  ): Promise<SettlementShadowAbortTerminalizationResult> {
    const skipped = await tx.referenceCaptureSettlementShadowSchedule.updateMany({
      where: {
        sessionId: input.sessionId,
        status: {
          in: [
            ReferenceCaptureSettlementShadowScheduleStatus.PENDING,
            ReferenceCaptureSettlementShadowScheduleStatus.EXECUTING,
          ],
        },
        observation: { is: null },
      },
      data: {
        status: ReferenceCaptureSettlementShadowScheduleStatus.SKIPPED,
        lastError: input.skipReason,
        bullJobId: null,
      },
    });

    const completed = await tx.referenceCaptureSettlementShadowSchedule.updateMany({
      where: {
        sessionId: input.sessionId,
        status: {
          in: [
            ReferenceCaptureSettlementShadowScheduleStatus.PENDING,
            ReferenceCaptureSettlementShadowScheduleStatus.EXECUTING,
          ],
        },
        observation: { isNot: null },
      },
      data: {
        status: ReferenceCaptureSettlementShadowScheduleStatus.COMPLETED,
        lastError: null,
        bullJobId: null,
      },
    });

    const existingMeta =
      input.existingMetadata && typeof input.existingMetadata === 'object' && !Array.isArray(input.existingMetadata)
        ? (input.existingMetadata as Record<string, unknown>)
        : {};

    const terminalized = await tx.referenceCaptureSettlementShadowExperiment.updateMany({
      where: {
        id: input.experimentDbId,
        status: REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE,
      },
      data: {
        status: REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED,
        metadataJson: {
          ...existingMeta,
          terminalization: {
            reason: 'RC_SESSION_ABORTED',
            abortReason: input.abortReason,
            abortedAt: input.abortedAt,
            organizationId: input.organizationId,
          },
        },
      },
    });

    return {
      schedulesSkipped: skipped.count,
      schedulesCompleted: completed.count,
      terminalized: terminalized.count > 0,
    };
  }

  async terminalizeExperimentOnAbort(
    experimentDbId: string,
    input: {
      abortReason: string;
      abortedAt: string;
      organizationId: string;
      existingMetadata: Prisma.JsonValue | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const existingMeta =
      input.existingMetadata && typeof input.existingMetadata === 'object' && !Array.isArray(input.existingMetadata)
        ? (input.existingMetadata as Record<string, unknown>)
        : {};

    const updated = await this.client(tx).referenceCaptureSettlementShadowExperiment.updateMany({
      where: {
        id: experimentDbId,
        status: REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE,
      },
      data: {
        status: REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED,
        metadataJson: {
          ...existingMeta,
          terminalization: {
            reason: 'RC_SESSION_ABORTED',
            abortReason: input.abortReason,
            abortedAt: input.abortedAt,
            organizationId: input.organizationId,
          },
        },
      },
    });
    return updated.count > 0;
  }

  skipUnobservedSchedulesForSession(sessionId: string, skipReason: string, tx?: Prisma.TransactionClient) {
    return this.client(tx).referenceCaptureSettlementShadowSchedule.updateMany({
      where: {
        sessionId,
        status: {
          in: [
            ReferenceCaptureSettlementShadowScheduleStatus.PENDING,
            ReferenceCaptureSettlementShadowScheduleStatus.EXECUTING,
          ],
        },
        observation: { is: null },
      },
      data: {
        status: ReferenceCaptureSettlementShadowScheduleStatus.SKIPPED,
        lastError: skipReason,
        bullJobId: null,
      },
    });
  }

  completeObservedSchedulesForSession(sessionId: string, tx?: Prisma.TransactionClient) {
    return this.client(tx).referenceCaptureSettlementShadowSchedule.updateMany({
      where: {
        sessionId,
        status: {
          in: [
            ReferenceCaptureSettlementShadowScheduleStatus.PENDING,
            ReferenceCaptureSettlementShadowScheduleStatus.EXECUTING,
          ],
        },
        observation: { isNot: null },
      },
      data: {
        status: ReferenceCaptureSettlementShadowScheduleStatus.COMPLETED,
        lastError: null,
        bullJobId: null,
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
        experiment: {
          status: REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE,
        },
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

  async linkBullJobIdIfEligible(scheduleId: string, bullJobId: string): Promise<boolean> {
    const updated = await this.prisma.referenceCaptureSettlementShadowSchedule.updateMany({
      where: {
        id: scheduleId,
        status: ReferenceCaptureSettlementShadowScheduleStatus.PENDING,
        observation: { is: null },
        experiment: {
          status: REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE,
        },
      },
      data: { bullJobId },
    });
    return updated.count > 0;
  }

  async isScheduleEligibleForExecution(scheduleId: string): Promise<boolean> {
    const row = await this.prisma.referenceCaptureSettlementShadowSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        status: true,
        observation: { select: { id: true } },
        experiment: { select: { status: true } },
      },
    });
    if (!row || row.observation) return false;
    if (
      row.status === ReferenceCaptureSettlementShadowScheduleStatus.SKIPPED ||
      row.status === ReferenceCaptureSettlementShadowScheduleStatus.COMPLETED ||
      row.status === ReferenceCaptureSettlementShadowScheduleStatus.FAILED
    ) {
      return false;
    }
    return row.experiment.status === REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE;
  }

  clearBullJobId(scheduleId: string) {
    return this.prisma.referenceCaptureSettlementShadowSchedule.updateMany({
      where: { id: scheduleId },
      data: { bullJobId: null },
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

  async markExecutingIfEligible(scheduleId: string, experimentDbId: string): Promise<boolean> {
    const updated = await this.prisma.referenceCaptureSettlementShadowSchedule.updateMany({
      where: {
        id: scheduleId,
        status: ReferenceCaptureSettlementShadowScheduleStatus.PENDING,
        observation: { is: null },
        experiment: {
          id: experimentDbId,
          status: REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE,
        },
      },
      data: {
        status: ReferenceCaptureSettlementShadowScheduleStatus.EXECUTING,
        attemptCount: { increment: 1 },
      },
    });
    return updated.count > 0;
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

  async createObservationIfEligible(
    input: {
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
    },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.referenceCaptureSettlementShadowSchedule.findUnique({
        where: { id: input.scheduleId },
        include: {
          observation: { select: { id: true } },
          experiment: { select: { status: true } },
        },
      });
      if (!schedule || schedule.observation) {
        return false;
      }
      if (
        schedule.status === ReferenceCaptureSettlementShadowScheduleStatus.SKIPPED ||
        schedule.status === ReferenceCaptureSettlementShadowScheduleStatus.COMPLETED ||
        schedule.status === ReferenceCaptureSettlementShadowScheduleStatus.FAILED
      ) {
        return false;
      }
      if (schedule.experiment.status !== REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE) {
        return false;
      }
      await tx.referenceCaptureSettlementShadowObservation.create({ data: input });
      await tx.referenceCaptureSettlementShadowSchedule.update({
        where: { id: input.scheduleId },
        data: {
          status: ReferenceCaptureSettlementShadowScheduleStatus.COMPLETED,
          executedAt: input.requestCompletedAt,
          lastError: input.providerError,
          bullJobId: null,
        },
      });
      return true;
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

  findExperimentsMissingWholeTripShadow(limit = 20) {
    return this.prisma.referenceCaptureSettlementShadowExperiment.findMany({
      where: {
        session: { status: { in: ['COMPLETED', 'STOPPING'] } },
      },
      include: {
        session: {
          select: {
            id: true,
            organizationId: true,
            vehicleId: true,
            startedAt: true,
            stoppedAt: true,
            completedAt: true,
            status: true,
          },
        },
        schedules: {
          where: { probeType: 'WHOLE_TRIP' },
          select: { id: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit * 3,
    });
  }
}
