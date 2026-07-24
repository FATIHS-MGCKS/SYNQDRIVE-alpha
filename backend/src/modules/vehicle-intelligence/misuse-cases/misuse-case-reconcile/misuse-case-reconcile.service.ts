import { Injectable, Logger, Optional } from '@nestjs/common';
import { MisuseCaseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DrivingBehaviorEnforcementService } from '@modules/data-authorizations/driving-behavior-enforcement/driving-behavior-enforcement.service';
import {
  DRIVING_BEHAVIOR_DATA_CATEGORY,
  DRIVING_BEHAVIOR_PATH,
  DRIVING_BEHAVIOR_PURPOSE,
  DRIVING_BEHAVIOR_SERVICE_IDENTITY,
} from '@modules/data-authorizations/driving-behavior-enforcement/driving-behavior-enforcement.constants';
import { DimoSegmentsService } from '../../../dimo/dimo-segments.service';
import { recalculateMisuseCaseEvidenceCounts } from '../misuse-case-evidence-count/misuse-case-evidence-count';
import {
  buildMisuseCaseFingerprintPair,
  buildMisuseCaseScope,
} from '../misuse-case-fingerprint/misuse-case-fingerprint';
import { gateMisuseCandidatesByCategoryEvidenceStrength } from '../misuse-case-category-evidence-strength/misuse-case-category-evidence-strength.gate';
import { MisuseCasePersistenceHelper } from '../misuse-case-persistence.helper';
import { MisuseCaseRulesService } from '../misuse-case-rules.service';
import {
  resolveAttribution,
  type ContextAnchor,
  type TripEvaluationContext,
} from '../misuse-case.types';
import type { MisuseCaseUpsertContext } from '../misuse-case-upsert.types';
import type { EventContextAssessment } from '../../event-context/event-context-assessment.types';
import {
  MISUSE_RECONCILE_RESOLUTION_REASON,
  MISUSE_CASE_RECONCILE_VERSION,
  RECONCILE_RESOLVABLE_STATUSES,
} from './misuse-case-reconcile.config';
import type {
  MisuseCaseReconcileInput,
  MisuseCaseReconcileResult,
} from './misuse-case-reconcile.types';

type LoadedTrip = NonNullable<Awaited<ReturnType<MisuseCaseReconcileService['loadTripBundle']>>>;

@Injectable()
export class MisuseCaseReconcileService {
  private readonly logger = new Logger(MisuseCaseReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoSegments: DimoSegmentsService,
    private readonly rules: MisuseCaseRulesService,
    private readonly persistence: MisuseCasePersistenceHelper,
    @Optional() private readonly behaviorEnforcement?: DrivingBehaviorEnforcementService,
  ) {}

  /**
   * DRIVING_MISUSE_RECONCILE — deterministic trip-level misuse reconciliation (P52).
   */
  async reconcileTrip(input: MisuseCaseReconcileInput): Promise<MisuseCaseReconcileResult> {
    if (this.behaviorEnforcement) {
      const trip = await this.prisma.vehicleTrip.findUnique({
        where: { id: input.tripId },
        select: { startTime: true },
      });
      const mayProfile = await this.behaviorEnforcement.mayProfile({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        dataCategory: DRIVING_BEHAVIOR_DATA_CATEGORY.DRIVING_BEHAVIOR,
        purpose: DRIVING_BEHAVIOR_PURPOSE.MISUSE_DETECTION,
        processingPath: DRIVING_BEHAVIOR_PATH.MISUSE_AGGREGATE,
        serviceIdentity: DRIVING_BEHAVIOR_SERVICE_IDENTITY.MISUSE_RECONCILE,
        correlationId: `misuse-reconcile:${input.tripId}`,
        tripId: input.tripId,
        effectiveTimestamp: trip?.startTime ?? null,
        isReprocess: input.trigger !== 'EVENT_CONTEXT',
      });
      if (!mayProfile) {
        this.logger.warn(`Misuse reconcile profile denied trip=${input.tripId}`);
        return this.emptyResult(input);
      }
    }

    const bundle = await this.loadTripBundle(input.tripId, input.organizationId);
    if (!bundle) {
      return this.emptyResult(input);
    }

    const analysisRunId = await this.resolveAnalysisRunId(
      input.organizationId,
      input.tripId,
      input.analysisRunId,
    );

    const rawCandidates = this.rules.evaluate(bundle.context);
    const gated = gateMisuseCandidatesByCategoryEvidenceStrength(
      rawCandidates,
      bundle.attribution,
    );

    const upsertContext: MisuseCaseUpsertContext = {
      ...bundle.upsertContext,
      analysisRunId,
    };

    const reconciledFingerprints = new Set<string>();
    let upserted = 0;
    let confirmedPreserved = 0;

    for (const { candidate } of gated) {
      const recalc = recalculateMisuseCaseEvidenceCounts(candidate.evidence);
      const fingerprints = buildMisuseCaseFingerprintPair({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        scope: buildMisuseCaseScope({
          tripId: input.tripId,
          bookingId: bundle.attribution.bookingId,
        }),
        category: candidate.category,
        caseType: candidate.type,
        attributionScope: bundle.attribution.attributionScope,
        evidence: recalc.qualifiedEvidence,
      });

      const existing = await this.prisma.misuseCase.findUnique({
        where: { fingerprint: fingerprints.caseFingerprint },
        select: { id: true, status: true },
      });

      const enrichedCandidate = {
        ...candidate,
        evidenceSummary: {
          ...(candidate.evidenceSummary ?? {}),
          misuseReconcile: {
            modelVersion: MISUSE_CASE_RECONCILE_VERSION,
            trigger: input.trigger,
            analysisRunId,
            evaluatedAt: new Date().toISOString(),
          },
        },
      };

      await this.persistence.upsertCandidate(
        input.organizationId,
        input.vehicleId,
        input.tripId,
        enrichedCandidate,
        bundle.attribution,
        upsertContext,
        { trigger: input.trigger },
      );

      reconciledFingerprints.add(fingerprints.caseFingerprint);
      upserted += 1;
      if (existing?.status === MisuseCaseStatus.CONFIRMED) {
        confirmedPreserved += 1;
      }
    }

    const resolved = await this.resolveStaleCases({
      organizationId: input.organizationId,
      tripId: input.tripId,
      reconciledFingerprints,
      trigger: input.trigger,
      analysisRunId,
    });

    const result: MisuseCaseReconcileResult = {
      modelVersion: MISUSE_CASE_RECONCILE_VERSION,
      trigger: input.trigger,
      analysisRunId,
      candidatesEvaluated: rawCandidates.length,
      candidatesGated: gated.length,
      upserted,
      resolved,
      confirmedPreserved,
      reconciledFingerprints: [...reconciledFingerprints],
      idempotent: true,
    };

    if (upserted > 0 || resolved > 0) {
      this.logger.log(
        `Misuse reconcile trip=${input.tripId} trigger=${input.trigger} ` +
          `upserted=${upserted} resolved=${resolved} gated=${gated.length}/${rawCandidates.length}`,
      );
    }

    return result;
  }

  /** Legacy entry — delegates to reconcile with LEGACY_AGGREGATOR trigger. */
  async evaluateTrip(tripId: string): Promise<number> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { vehicleId: true, vehicle: { select: { organizationId: true } } },
    });
    if (!trip) return 0;

    const result = await this.reconcileTrip({
      organizationId: trip.vehicle.organizationId,
      vehicleId: trip.vehicleId,
      tripId,
      trigger: 'LEGACY_AGGREGATOR',
    });
    return result.upserted;
  }

  private emptyResult(input: MisuseCaseReconcileInput): MisuseCaseReconcileResult {
    return {
      modelVersion: MISUSE_CASE_RECONCILE_VERSION,
      trigger: input.trigger,
      analysisRunId: input.analysisRunId ?? null,
      candidatesEvaluated: 0,
      candidatesGated: 0,
      upserted: 0,
      resolved: 0,
      confirmedPreserved: 0,
      reconciledFingerprints: [],
      idempotent: true,
    };
  }

  private async resolveAnalysisRunId(
    organizationId: string,
    tripId: string,
    preferredRunId?: string | null,
  ): Promise<string | null> {
    if (preferredRunId) {
      const preferred = await this.prisma.drivingAnalysisRun.findFirst({
        where: { id: preferredRunId, organizationId, tripId },
        select: { id: true },
      });
      if (preferred) return preferred.id;
    }

    const latest = await this.prisma.drivingAnalysisRun.findFirst({
      where: {
        organizationId,
        tripId,
        analysisType: 'TRIP_ENRICHMENT',
        status: { in: ['COMPLETED', 'IN_PROGRESS'] },
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    return latest?.id ?? null;
  }

  private async resolveStaleCases(input: {
    organizationId: string;
    tripId: string;
    reconciledFingerprints: Set<string>;
    trigger: MisuseCaseReconcileInput['trigger'];
    analysisRunId: string | null;
  }): Promise<number> {
    const stale = await this.prisma.misuseCase.findMany({
      where: {
        organizationId: input.organizationId,
        tripId: input.tripId,
        status: { in: [...RECONCILE_RESOLVABLE_STATUSES] },
        ...(input.reconciledFingerprints.size > 0
          ? { fingerprint: { notIn: [...input.reconciledFingerprints] } }
          : {}),
      },
      select: {
        id: true,
        fingerprint: true,
        evidenceSummary: true,
      },
    });

    if (stale.length === 0) return 0;

    const now = new Date();
    for (const row of stale) {
      const summary = (row.evidenceSummary as Record<string, unknown> | null) ?? {};
      await this.prisma.misuseCase.update({
        where: { id: row.id },
        data: {
          status: MisuseCaseStatus.RESOLVED,
          decisionEligibility: 'NOT_ELIGIBLE',
          informationalOnly: true,
          resolvedAt: now,
          resolutionReason: MISUSE_RECONCILE_RESOLUTION_REASON,
          evidenceSummary: {
            ...summary,
            misuseReconcile: {
              modelVersion: MISUSE_CASE_RECONCILE_VERSION,
              trigger: input.trigger,
              analysisRunId: input.analysisRunId,
              action: 'RESOLVED_STALE',
              evaluatedAt: now.toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      });
    }

    return stale.length;
  }

  async loadTripBundle(tripId: string, organizationId: string): Promise<{
    context: TripEvaluationContext;
    attribution: ReturnType<typeof resolveAttribution>;
    upsertContext: Omit<MisuseCaseUpsertContext, 'analysisRunId'>;
  } | null> {
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

    if (!trip || !trip.endTime || trip.vehicle.organizationId !== organizationId) {
      return null;
    }

    const dimoSafetyEvents =
      trip.vehicle.dimoVehicle?.tokenId != null
        ? await this.dimoSegments.fetchSafetyEvents(
            trip.vehicle.dimoVehicle.tokenId,
            trip.startTime,
            trip.endTime,
          )
        : [];

    const dtcEvents = await this.prisma.vehicleDtcEvent.findMany({
      where: {
        vehicleId: trip.vehicleId,
        firstSeenAt: {
          gte: trip.startTime,
          lte: new Date(trip.endTime.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    });

    const contextAnchors = this.loadContextAnchors(trip.events);

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
        bookingLinkSource: trip.bookingLinkSource,
        bookingCustomerId: trip.bookingCustomerId,
        assignedDriverId: trip.assignedDriverId,
        actualDriverId: trip.actualDriverId,
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

    return {
      context,
      attribution: resolveAttribution(context.trip),
      upsertContext: {
        tripEndTime: trip.endTime,
        behaviorEventCount: trip.behaviorEvents.length,
        drivingEventCount: trip.events.length,
        contextAnchorCount: contextAnchors.length,
        dimoSafetyEventCount: dimoSafetyEvents.length,
        dtcEventCount: dtcEvents.length,
      },
    };
  }

  loadContextAnchors(
    drivingEvents: Array<{ id: string; recordedAt: Date; metadataJson: unknown }>,
  ): ContextAnchor[] {
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
