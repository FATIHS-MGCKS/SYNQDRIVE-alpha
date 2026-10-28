import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Ds4DrivingImpactV2ComputeResultV1 } from './ds4-driving-impact-v2.engine';
import type { Ds4TripAssessmentComputeResultV1 } from './ds4-trip-assessment-v1.engine';
import { DS4_TRIP_ASSESSMENT_VERSION_V1 } from './ds4-trip-assessment-v1.contract';

export type Ds4AssessmentPersistResultV1 =
  | { outcome: 'inserted'; assessmentId: string; impactId: string }
  | { outcome: 'idempotent_duplicate'; assessmentId: string }
  | { outcome: 'superseded_skipped'; existingAssessmentId: string }
  | { outcome: 'sql_error'; message: string };

export class Ds4TripAssessmentRepositoryV1 {
  constructor(private readonly prisma: PrismaClient) {}

  async findLatestAssessmentForTrip(tripId: string): Promise<{ id: string; sourceMotionRunCreatedAt: Date } | null> {
    const row = await this.prisma.diV0Ds4TripAssessmentV1.findFirst({
      where: { tripId },
      orderBy: { computedAt: 'desc' },
      select: { id: true, sourceMotionRunCreatedAt: true },
    });
    return row;
  }

  async findByIdempotency(tripId: string, inputFingerprint: string): Promise<{ id: string } | null> {
    return this.prisma.diV0Ds4TripAssessmentV1.findFirst({
      where: {
        tripId,
        assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
        inputFingerprint,
      },
      select: { id: true },
    });
  }

  async persistAssessmentAndImpact(input: {
    scope: { organizationId: string; vehicleId: string; tripId: string };
    assessment: Ds4TripAssessmentComputeResultV1;
    impact: Ds4DrivingImpactV2ComputeResultV1;
    sourceMotionRunCreatedAt: Date;
    computedAt: Date;
  }): Promise<Ds4AssessmentPersistResultV1> {
    const existing = await this.findByIdempotency(input.scope.tripId, input.assessment.inputFingerprint);
    if (existing) {
      return { outcome: 'idempotent_duplicate', assessmentId: existing.id };
    }

    const latest = await this.findLatestAssessmentForTrip(input.scope.tripId);
    if (latest && latest.sourceMotionRunCreatedAt.getTime() > input.sourceMotionRunCreatedAt.getTime()) {
      return { outcome: 'superseded_skipped', existingAssessmentId: latest.id };
    }

    const assessmentId = randomUUID();
    const impactId = randomUUID();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.diV0Ds4TripAssessmentV1.create({
          data: {
            id: assessmentId,
            organizationId: input.scope.organizationId,
            vehicleId: input.scope.vehicleId,
            tripId: input.scope.tripId,
            assessmentVersion: input.assessment.assessmentVersion,
            sourceMotionRunId: input.assessment.sourceMotionRunId,
            pinnedSnapshotHash: input.assessment.completeness.pinnedSnapshotHash,
            combinedInputIdentity: input.assessment.completeness.combinedInputIdentity,
            eventRowContract: input.assessment.eventRowContract,
            speedAuthority: input.assessment.speedAuthority ?? 'C4_ONLY',
            inputFingerprint: input.assessment.inputFingerprint,
            computedAt: input.computedAt,
            assessmentStatus: input.assessment.assessmentStatus,
            evidenceQuality: input.assessment.evidenceQuality,
            reasonCodes: input.assessment.reasonCodes,
            completenessJson: input.assessment.completeness,
            eventSummariesJson: input.assessment.eventSummaries,
            processingErrorJson: input.assessment.processingError ?? Prisma.DbNull,
            sourceMotionRunCreatedAt: input.sourceMotionRunCreatedAt,
          },
        });
        await tx.diV0Ds4TripDrivingImpactV2.create({
          data: {
            id: impactId,
            organizationId: input.scope.organizationId,
            vehicleId: input.scope.vehicleId,
            tripId: input.scope.tripId,
            assessmentId,
            scoreAuthority: input.impact.scoreAuthority,
            modelVersion: input.impact.modelVersion,
            operationalLoadIndex: input.impact.operationalLoadIndex,
            scorePublicationStatus: input.impact.scorePublicationStatus,
            publicationReason: input.impact.publicationReason,
            evidenceCompletenessJson: input.impact.evidenceCompleteness,
            operationalLoadJson: input.impact.operationalLoad,
            sourceAssessmentFingerprint: input.impact.sourceAssessmentFingerprint,
            computedAt: input.computedAt,
          },
        });
      });
      return { outcome: 'inserted', assessmentId, impactId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('di_v0_ds4_trip_assessment_idempotency_uq') || message.includes('Unique constraint')) {
        const dup = await this.findByIdempotency(input.scope.tripId, input.assessment.inputFingerprint);
        if (dup) return { outcome: 'idempotent_duplicate', assessmentId: dup.id };
      }
      return { outcome: 'sql_error', message };
    }
  }

  async readLatestBundleForTrip(scope: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
  }): Promise<
    | {
        assessment: Awaited<ReturnType<PrismaClient['diV0Ds4TripAssessmentV1']['findFirst']>>;
        impact: Awaited<ReturnType<PrismaClient['diV0Ds4TripDrivingImpactV2']['findFirst']>>;
      }
    | null
  > {
    const assessment = await this.prisma.diV0Ds4TripAssessmentV1.findFirst({
      where: {
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        tripId: scope.tripId,
      },
      orderBy: { computedAt: 'desc' },
    });
    if (!assessment) return null;
    const impact = await this.prisma.diV0Ds4TripDrivingImpactV2.findUnique({
      where: { assessmentId: assessment.id },
    });
    return { assessment, impact };
  }
}
