import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '../../dimo/dimo-segments.service';
import { MisuseCaseRulesService } from './misuse-case-rules.service';
import { MisuseCasePersistenceHelper } from './misuse-case-evidence.service';
import { resolveAttribution, type TripEvaluationContext } from './misuse-case.types';

@Injectable()
export class MisuseCaseAggregatorService {
  private readonly logger = new Logger(MisuseCaseAggregatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoSegments: DimoSegmentsService,
    private readonly rules: MisuseCaseRulesService,
    private readonly persistence: MisuseCasePersistenceHelper,
  ) {}

  /**
   * Evaluate a completed trip after behavior enrichment AND trip assignment.
   * Idempotent — reprocessing updates existing cases by fingerprint.
   */
  async evaluateTrip(tripId: string): Promise<number> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      include: {
        vehicle: {
          select: {
            organizationId: true,
            dimoVehicle: { select: { tokenId: true } },
          },
        },
        behaviorEvents: true,
        events: true,
      },
    });

    if (!trip || !trip.endTime) return 0;
    const organizationId = trip.vehicle.organizationId;

    const dimoSafetyEvents =
      trip.vehicle.dimoVehicle?.tokenId != null
        ? await this.dimoSegments.fetchSafetyEvents(
            trip.vehicle.dimoVehicle.tokenId,
            trip.startTime,
            trip.endTime,
          )
        : [];

    const triggerWindowStart = trip.startTime;
    const dtcWindowEnd = new Date(trip.endTime.getTime() + 24 * 60 * 60 * 1000);
    const dtcEvents = await this.prisma.vehicleDtcEvent.findMany({
      where: {
        vehicleId: trip.vehicleId,
        firstSeenAt: { gte: triggerWindowStart, lte: dtcWindowEnd },
      },
    });

    const context: TripEvaluationContext = {
      trip: {
        id: trip.id,
        vehicleId: trip.vehicleId,
        organizationId,
        startTime: trip.startTime,
        endTime: trip.endTime,
        assignmentStatus: trip.assignmentStatus,
        assignmentSubjectType: trip.assignmentSubjectType,
        assignmentSubjectId: trip.assignmentSubjectId,
        assignedBookingId: trip.assignedBookingId,
        isPrivateTrip: trip.isPrivateTrip,
        kickdownCount: trip.kickdownCount,
        possibleImpactCount: trip.possibleImpactCount,
        coldEngineAbuseCount: trip.coldEngineAbuseCount,
        hardAccelerationCount: trip.hardAccelerationCount,
        hardBrakingCount: trip.hardBrakingCount,
        fullBrakingCount: trip.fullBrakingCount,
        abuseEvents: trip.abuseEvents,
      },
      behaviorEvents: trip.behaviorEvents,
      drivingEvents: trip.events,
      dimoSafetyEvents,
      dtcEvents,
    };

    const candidates = this.rules.evaluate(context);
    const attribution = resolveAttribution(context.trip);

    let written = 0;
    for (const candidate of candidates) {
      await this.persistence.upsertCandidate(
        organizationId,
        trip.vehicleId,
        trip.id,
        candidate,
        attribution,
      );
      written++;
    }

    if (written > 0) {
      this.logger.log(`Misuse cases for trip ${tripId}: ${written} candidate(s) upserted`);
    }
    return written;
  }
}
