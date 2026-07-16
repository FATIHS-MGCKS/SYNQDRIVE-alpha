import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripAnalysisCoordinatorService } from '../trips/trip-analysis-coordinator.service';
import type { DrivingImpactOutcome } from './driving-impact-outcome.types';

export interface DrivingImpactPersistPayload {
  create: Prisma.TripDrivingImpactUncheckedCreateInput;
  update: Prisma.TripDrivingImpactUncheckedUpdateInput;
  drivingScore: number;
}

@Injectable()
export class DrivingImpactStatusSyncService {
  private readonly logger = new Logger(DrivingImpactStatusSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly analysisCoordinator?: TripAnalysisCoordinatorService,
  ) {}

  /**
   * Atomically persist impact row + trip readiness status.
   * Retry-safe: upsert + deterministic status mapping produce the same terminal state.
   */
  async persistImpactWithStatus(
    tripId: string,
    payload: DrivingImpactPersistPayload,
    outcome: DrivingImpactOutcome,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.tripDrivingImpact.upsert({
        where: { tripId },
        create: payload.create,
        update: payload.update,
      });

      await tx.vehicleTrip.update({
        where: { id: tripId },
        data: { drivingScore: payload.drivingScore },
      });

      await this.analysisCoordinator?.applyDrivingImpactOutcome(tripId, outcome, tx);
    });

    this.logger.debug(
      `DrivingImpact status synced: trip=${tripId} status=${outcome.drivingImpactStatus} ` +
        `model=${outcome.modelVersion} calculatedAt=${outcome.calculatedAt?.toISOString() ?? 'n/a'}`,
    );
  }

  /** Status-only terminal update when no impact row is written (skip/failure). */
  async applyOutcomeWithoutImpactRow(
    tripId: string,
    outcome: DrivingImpactOutcome,
  ): Promise<void> {
    await this.analysisCoordinator?.applyDrivingImpactOutcome(tripId, outcome);
  }
}
