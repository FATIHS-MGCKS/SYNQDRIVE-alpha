import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '../../dimo/dimo-segments.service';
import { MisuseCaseRulesService } from './misuse-case-rules.service';
import { MisuseCasePersistenceHelper } from './misuse-case-persistence.helper';
import { gateMisuseCandidatesByCategoryEvidenceStrength } from './misuse-case-category-evidence-strength/misuse-case-category-evidence-strength.gate';
import {
  resolveAttribution,
  type ContextAnchor,
  type TripEvaluationContext,
} from './misuse-case.types';
import type { EventContextAssessment } from '../event-context/event-context-assessment.types';

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

    const contextAnchors = await this.loadContextAnchors(trip.events);

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
      contextAnchors,
    };

    const attribution = resolveAttribution(context.trip);

    const candidates = gateMisuseCandidatesByCategoryEvidenceStrength(
      this.rules.evaluate(context),
      attribution,
    );

    const analysisRun = await this.prisma.drivingAnalysisRun.findFirst({
      where: {
        tripId: trip.id,
        organizationId,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    });

    const upsertContext = {
      tripEndTime: trip.endTime,
      behaviorEventCount: trip.behaviorEvents.length,
      drivingEventCount: trip.events.length,
      contextAnchorCount: contextAnchors.length,
      dimoSafetyEventCount: dimoSafetyEvents.length,
      dtcEventCount: dtcEvents.length,
      analysisRunId: analysisRun?.id ?? null,
    };

    let written = 0;
    for (const { candidate } of candidates) {
      await this.persistence.upsertCandidate(
        organizationId,
        trip.vehicleId,
        trip.id,
        candidate,
        attribution,
        upsertContext,
      );
      written++;
    }

    if (written > 0) {
      this.logger.log(`Misuse cases for trip ${tripId}: ${written} candidate(s) upserted`);
    }
    return written;
  }

  /**
   * Collect Event Context Assessments anchored inside the trip — from native
   * DrivingEvent.metadataJson.contextAssessment. Only well-formed assessments are
   * returned; classification gating happens in the pure rules layer.
   */
  private async loadContextAnchors(
    drivingEvents: Array<{ id: string; recordedAt: Date; metadataJson: unknown }>,
  ): Promise<ContextAnchor[]> {
    const anchors: ContextAnchor[] = [];

    for (const ev of drivingEvents) {
      const assessment = this.readAssessment(
        (ev.metadataJson as Record<string, unknown> | null)?.contextAssessment,
      );
      if (assessment) {
        anchors.push({
          source: 'DRIVING_EVENT',
          anchorId: ev.id,
          occurredAt: ev.recordedAt,
          assessment,
        });
      }
    }

    return anchors;
  }

  private readAssessment(value: unknown): EventContextAssessment | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<EventContextAssessment>;
    if (
      typeof candidate.status !== 'string' ||
      typeof candidate.anchorType !== 'string' ||
      !Array.isArray(candidate.preliminaryClassifications)
    ) {
      return null;
    }
    return candidate as EventContextAssessment;
  }
}
