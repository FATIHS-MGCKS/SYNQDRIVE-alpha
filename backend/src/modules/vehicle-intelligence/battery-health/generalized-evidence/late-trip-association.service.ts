import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  BatteryGeneralizedEvidenceClass,
  BatteryRestSessionAnchorType,
  BatteryRestSessionEndReason,
  BatteryRestSessionStatus,
  TripStatus,
} from '@prisma/client';
import { isBatteryV2GeneralizedEvidenceEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  LATE_TRIP_ASSOCIATION_ENDED_SESSION_LOOKBACK_MS,
  TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS,
} from './generalized-evidence.constants';
import { recordLateTripAssociation } from './generalized-evidence.metrics';
import { GeneralizedEvidenceRepository } from './generalized-evidence.repository';

const ASSOCIABLE_ACTIVE_STATUSES: BatteryRestSessionStatus[] = [
  BatteryRestSessionStatus.CANDIDATE,
  BatteryRestSessionStatus.RESTING,
  BatteryRestSessionStatus.CONFIRMED,
];

@Injectable()
export class LateTripAssociationService {
  private readonly logger = new Logger(LateTripAssociationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: GeneralizedEvidenceRepository,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  /**
   * Read-only Trip Detection consumption — does not mutate trip FSM.
   */
  async associatePendingSessions(vehicleId: string): Promise<number> {
    if (!isBatteryV2GeneralizedEvidenceEnabled()) {
      return 0;
    }
    return this.associateUnlinkedSessionsForVehicle(vehicleId);
  }

  /** Trip-finalization repair path (BATTERY_LV_REST_SESSION_OPEN / reconciliation). */
  async associateAfterTripFinalization(input: {
    vehicleId: string;
    tripId: string;
    tripEndedAt: Date;
  }): Promise<number> {
    if (!isBatteryV2GeneralizedEvidenceEnabled()) {
      return 0;
    }
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: {
        id: input.tripId,
        vehicleId: input.vehicleId,
        tripStatus: TripStatus.COMPLETED,
      },
      select: { id: true, endTime: true },
    });
    if (!trip?.endTime) return 0;

    const sessions = await this.findUnlinkedSessions(input.vehicleId);
    let linked = 0;
    for (const session of sessions) {
      if (!this.anchorMatchesTripEnd(session.anchorAt, trip.endTime)) continue;
      await this.linkSessionToTrip(session.id, input.vehicleId, trip.id, trip.endTime, session.sessionStatus);
      linked += 1;
    }
    return linked;
  }

  private async associateUnlinkedSessionsForVehicle(vehicleId: string): Promise<number> {
    const sessions = await this.findUnlinkedSessions(vehicleId);
    let linked = 0;
    for (const session of sessions) {
      const trip = await this.findCompletedTripForAnchor(vehicleId, session.anchorAt);
      if (!trip) continue;
      await this.linkSessionToTrip(
        session.id,
        vehicleId,
        trip.id,
        trip.endTime ?? session.anchorAt,
        session.sessionStatus,
      );
      linked += 1;
    }
    return linked;
  }

  private async findUnlinkedSessions(vehicleId: string) {
    const endedSince = new Date(Date.now() - LATE_TRIP_ASSOCIATION_ENDED_SESSION_LOOKBACK_MS);
    return this.prisma.batteryRestSession.findMany({
      where: {
        vehicleId,
        confirmedTripId: null,
        OR: [
          { sessionStatus: { in: ASSOCIABLE_ACTIVE_STATUSES } },
          {
            sessionStatus: BatteryRestSessionStatus.ENDED,
            endReason: { not: BatteryRestSessionEndReason.INVALIDATED },
            endedAt: { gte: endedSince },
          },
        ],
      },
      orderBy: { anchorAt: 'desc' },
      take: 10,
    });
  }

  private async linkSessionToTrip(
    sessionId: string,
    vehicleId: string,
    tripId: string,
    confirmedAt: Date,
    sessionStatus: BatteryRestSessionStatus,
  ) {
    const session = await this.prisma.batteryRestSession.findUnique({
      where: { id: sessionId },
      select: { candidateTripId: true },
    });

    await this.repository.updateRestSession(sessionId, {
      confirmedTrip: { connect: { id: tripId } },
      ...(session?.candidateTripId
        ? {}
        : { candidateTrip: { connect: { id: tripId } } }),
      anchorType: BatteryRestSessionAnchorType.TRIP_END_CONFIRMED,
      sessionStatus:
        sessionStatus === BatteryRestSessionStatus.CANDIDATE
          ? BatteryRestSessionStatus.CONFIRMED
          : sessionStatus,
      confirmedAt,
    });

    await this.prisma.batteryGeneralizedEvidenceObservation.updateMany({
      where: {
        vehicleId,
        restSessionId: sessionId,
        tripId: null,
      },
      data: { tripId },
    });

    recordLateTripAssociation(this.metrics);
    this.logger.debug(
      `late trip association vehicle=${vehicleId} session=${sessionId} trip=${tripId}`,
    );
  }

  private anchorMatchesTripEnd(anchorAt: Date, tripEnd: Date): boolean {
    return Math.abs(anchorAt.getTime() - tripEnd.getTime()) <= TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS;
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
