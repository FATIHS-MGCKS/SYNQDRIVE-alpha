import { Injectable, Logger, Optional } from '@nestjs/common';
import { BatteryRestSessionAnchorType, BatteryRestSessionStatus, TripStatus } from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS } from './generalized-evidence.constants';
import { recordLateTripAssociation } from './generalized-evidence.metrics';
import { GeneralizedEvidenceRepository } from './generalized-evidence.repository';

@Injectable()
export class LateTripAssociationService {
  private readonly logger = new Logger(LateTripAssociationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: GeneralizedEvidenceRepository,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  /**
   * Read-only Trip Detection consumption: link open rest sessions to COMPLETED trips
   * when anchor aligns — does not mutate trip FSM.
   */
  async associatePendingSessions(vehicleId: string): Promise<number> {
    const sessions = await this.prisma.batteryRestSession.findMany({
      where: {
        vehicleId,
        sessionStatus: { in: ['CANDIDATE', 'RESTING', 'CONFIRMED'] },
        confirmedTripId: null,
      },
      orderBy: { anchorAt: 'desc' },
      take: 5,
    });

    let linked = 0;
    for (const session of sessions) {
      const trip = await this.findCompletedTripForAnchor(vehicleId, session.anchorAt);
      if (!trip) continue;

      await this.repository.updateRestSession(session.id, {
        confirmedTrip: { connect: { id: trip.id } },
        candidateTrip: session.candidateTripId
          ? undefined
          : { connect: { id: trip.id } },
        anchorType: BatteryRestSessionAnchorType.TRIP_END_CONFIRMED,
        sessionStatus:
          session.sessionStatus === BatteryRestSessionStatus.CANDIDATE
            ? BatteryRestSessionStatus.CONFIRMED
            : session.sessionStatus,
        confirmedAt: trip.endTime ?? session.anchorAt,
      });

      await this.prisma.batteryGeneralizedEvidenceObservation.updateMany({
        where: {
          vehicleId,
          restSessionId: session.id,
          tripId: null,
        },
        data: { tripId: trip.id },
      });

      recordLateTripAssociation(this.metrics);
      linked += 1;
      this.logger.debug(
        `late trip association vehicle=${vehicleId} session=${session.id} trip=${trip.id}`,
      );
    }

    return linked;
  }

  private async findCompletedTripForAnchor(vehicleId: string, anchorAt: Date) {
    const anchorMs = anchorAt.getTime();
    const candidates = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        tripStatus: TripStatus.COMPLETED,
        endTime: {
          gte: new Date(anchorMs - TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS),
          lte: new Date(anchorMs + TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS),
        },
      },
      select: { id: true, endTime: true },
      orderBy: { endTime: 'desc' },
      take: 5,
    });
    if (candidates.length === 0) return null;
    const exact = candidates.find(
      (t) => t.endTime && Math.abs(t.endTime.getTime() - anchorMs) < 1_000,
    );
    return exact ?? (candidates.length === 1 ? candidates[0] : null);
  }
}
