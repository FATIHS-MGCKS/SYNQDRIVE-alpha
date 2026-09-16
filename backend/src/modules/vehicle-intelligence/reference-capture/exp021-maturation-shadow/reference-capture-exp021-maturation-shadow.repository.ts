import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  Exp021MaturationShadowAttemptImmutabilityError,
  Exp021MaturationShadowStratumSemanticMismatchError,
} from './reference-capture-exp021-maturation-shadow.errors';
import {
  extractStratumImmutableAttributes,
  findStratumImmutableAttributeMismatches,
} from './reference-capture-exp021-maturation-shadow-stratum-attributes.lib';
import type {
  Exp021MaturationShadowAttemptAnalyticalDerivatives,
  Exp021MaturationShadowAttemptRawFacts,
  Exp021MaturationShadowFamilyIdentity,
  Exp021MaturationShadowStratumIdentity,
  Exp021MaturationShadowStratumImmutableAttributes,
} from './reference-capture-exp021-maturation-shadow.types';

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class ReferenceCaptureExp021MaturationShadowRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: Prisma.TransactionClient): PrismaService | Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  /**
   * Canonical family reservation — enrollmentEventId is provenance only.
   * A different enrollmentEventId for the same scientific identity returns the existing family.
   */
  async reserveOrGetWindowFamily(
    input: Exp021MaturationShadowFamilyIdentity & {
      enrollmentEventId: string;
      plannedAgesMsExact: number[];
      policyDelayProbeMs: number;
      createdUnderRuntimeSha: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = this.client(tx);
    const uniqueWhere = {
      organizationId_vehicleId_tokenId_canonicalWindowTo_shadowScheduleVersion: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tokenId: input.tokenId,
        canonicalWindowTo: input.canonicalWindowTo,
        shadowScheduleVersion: input.shadowScheduleVersion,
      },
    };

    const existing = await db.exp021MaturationShadowWindowFamily.findUnique({ where: uniqueWhere });
    if (existing) {
      return existing;
    }

    try {
      return await db.exp021MaturationShadowWindowFamily.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          tokenId: input.tokenId,
          canonicalWindowTo: input.canonicalWindowTo,
          shadowScheduleVersion: input.shadowScheduleVersion,
          enrollmentEventId: input.enrollmentEventId,
          plannedAgesMsExact: input.plannedAgesMsExact,
          policyDelayProbeMs: input.policyDelayProbeMs,
          createdUnderRuntimeSha: input.createdUnderRuntimeSha,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
      const raced = await db.exp021MaturationShadowWindowFamily.findUnique({ where: uniqueWhere });
      if (!raced) {
        throw error;
      }
      return raced;
    }
  }

  /**
   * Canonical stratum creation — semantic drift fails closed (no second stratum).
   */
  async createWindowStratum(
    input: Exp021MaturationShadowStratumIdentity & Exp021MaturationShadowStratumImmutableAttributes,
    tx?: Prisma.TransactionClient,
  ) {
    const db = this.client(tx);
    const uniqueWhere = {
      windowFamilyId_signalLane_queryGeometryMs: {
        windowFamilyId: input.windowFamilyId,
        signalLane: input.signalLane,
        queryGeometryMs: input.queryGeometryMs,
      },
    };

    const existing = await db.exp021MaturationShadowWindow.findUnique({ where: uniqueWhere });
    if (existing) {
      const mismatches = findStratumImmutableAttributeMismatches(
        extractStratumImmutableAttributes(existing),
        input,
      );
      if (mismatches.length > 0) {
        throw new Exp021MaturationShadowStratumSemanticMismatchError(
          `Immutable stratum attribute mismatch for ${input.signalLane}/${input.queryGeometryMs}: ${mismatches.join(', ')}`,
        );
      }
      return existing;
    }

    try {
      return await db.exp021MaturationShadowWindow.create({
        data: {
          windowFamilyId: input.windowFamilyId,
          signalLane: input.signalLane,
          queryGeometryMs: input.queryGeometryMs,
          windowFrom: input.windowFrom,
          windowTo: input.windowTo,
          resolvedProviderFields: input.resolvedProviderFields,
          resolvedProviderFieldsCanonicalSorted: input.resolvedProviderFieldsCanonicalSorted,
          signalSetHash: input.signalSetHash,
          signalSetVersion: input.signalSetVersion,
          querySemanticsHash: input.querySemanticsHash,
          queryBuilderSemanticVersionOrHash: input.queryBuilderSemanticVersionOrHash,
          queryBoundarySemanticVersion: input.queryBoundarySemanticVersion,
          interval: input.interval,
          aggregation: input.aggregation,
          manifestIdentifier: input.manifestIdentifier ?? null,
          manifestHash: input.manifestHash ?? null,
          runtimeBuildShaAtEnrollment: input.runtimeBuildShaAtEnrollment,
          activityClassificationJson:
            input.activityClassificationJson != null ? input.activityClassificationJson : undefined,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
      const raced = await db.exp021MaturationShadowWindow.findUnique({ where: uniqueWhere });
      if (!raced) {
        throw error;
      }
      const mismatches = findStratumImmutableAttributeMismatches(
        extractStratumImmutableAttributes(raced),
        input,
      );
      if (mismatches.length > 0) {
        throw new Exp021MaturationShadowStratumSemanticMismatchError(
          `Immutable stratum attribute mismatch for ${input.signalLane}/${input.queryGeometryMs}: ${mismatches.join(', ')}`,
        );
      }
      return raced;
    }
  }

  async createObservationSlot(
    input: { windowStratumId: string; plannedAgeMs: number },
    tx?: Prisma.TransactionClient,
  ) {
    const db = this.client(tx);
    const uniqueWhere = {
      windowStratumId_plannedAgeMs: {
        windowStratumId: input.windowStratumId,
        plannedAgeMs: input.plannedAgeMs,
      },
    };

    const existing = await db.exp021MaturationShadowObservationSlot.findUnique({ where: uniqueWhere });
    if (existing) {
      return existing;
    }

    try {
      return await db.exp021MaturationShadowObservationSlot.create({
        data: {
          windowStratumId: input.windowStratumId,
          plannedAgeMs: input.plannedAgeMs,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
      const raced = await db.exp021MaturationShadowObservationSlot.findUnique({ where: uniqueWhere });
      if (!raced) {
        throw error;
      }
      return raced;
    }
  }

  /**
   * Create-only immutable attempt ledger.
   * Transport retry: same slot, new attempt, incremented attemptOrdinal.
   */
  async insertObservationAttempt(
    input: {
      observationSlotId: string;
      rawFacts: Exp021MaturationShadowAttemptRawFacts;
      analyticalDerivatives?: Exp021MaturationShadowAttemptAnalyticalDerivatives;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const run = async (client: Prisma.TransactionClient) => {
      await client.$executeRaw`
        SELECT id FROM exp021_maturation_shadow_observation_slots
        WHERE id = ${input.observationSlotId}
        FOR UPDATE
      `;

      const maxOrdinal = await client.exp021MaturationShadowObservationAttempt.aggregate({
        where: { observationSlotId: input.observationSlotId },
        _max: { attemptOrdinal: true },
      });
      const attemptOrdinal = (maxOrdinal._max.attemptOrdinal ?? 0) + 1;

      return client.exp021MaturationShadowObservationAttempt.create({
        data: {
          observationSlotId: input.observationSlotId,
          attemptOrdinal,
          plannedAgeMs: input.rawFacts.plannedAgeMs,
          actualAgeMs: input.rawFacts.actualAgeMs,
          schedulerDriftMs: input.rawFacts.schedulerDriftMs,
          requestStartedAt: input.rawFacts.requestStartedAt,
          requestCompletedAt: input.rawFacts.requestCompletedAt ?? null,
          runtimeBuildSha: input.rawFacts.runtimeBuildSha,
          querySemanticsHash: input.rawFacts.querySemanticsHash,
          signalSetHash: input.rawFacts.signalSetHash,
          providerRequestSucceeded: input.rawFacts.providerRequestSucceeded,
          providerOutcomeClass: input.rawFacts.providerOutcomeClass,
          providerStatus: input.rawFacts.providerStatus ?? null,
          providerErrorClass: input.rawFacts.providerErrorClass ?? null,
          uniqueBucketLocusCount: input.rawFacts.uniqueBucketLocusCount ?? null,
          uniqueTemporalBucketStartCount: input.rawFacts.uniqueTemporalBucketStartCount ?? null,
          perFieldRowCountJson: input.rawFacts.perFieldRowCountJson,
          perFieldBucketLocusCountJson: input.rawFacts.perFieldBucketLocusCountJson,
          firstProviderTimestamp: input.rawFacts.firstProviderTimestamp ?? null,
          lastProviderTimestamp: input.rawFacts.lastProviderTimestamp ?? null,
          bucketLocusManifestJson: input.rawFacts.bucketLocusManifestJson,
          bucketLocusIdentityVersion: input.rawFacts.bucketLocusIdentityVersion ?? null,
          duplicateCount: input.rawFacts.duplicateCount ?? null,
          payloadRevisionCount: input.rawFacts.payloadRevisionCount ?? null,
          changedPayloadLocusCount: input.rawFacts.changedPayloadLocusCount ?? null,
          nearestPriorAgeBucketDeltaMs: input.rawFacts.nearestPriorAgeBucketDeltaMs ?? null,
          newBucketLociVsPriorAge: input.analyticalDerivatives?.newBucketLociVsPriorAge ?? null,
          missingPriorBucketLociAtThisAge:
            input.analyticalDerivatives?.missingPriorBucketLociAtThisAge ?? null,
          cumulativeBucketLocusUnionCount:
            input.analyticalDerivatives?.cumulativeBucketLocusUnionCount ?? null,
          bucketLocusCoverageRatioVsFinalObservedUnion:
            input.analyticalDerivatives?.bucketLocusCoverageRatioVsFinalObservedUnion ?? null,
          queryProvenanceJson: input.rawFacts.queryProvenanceJson,
        },
      });
    };

    if (tx) {
      return run(tx);
    }

    return this.prisma.$transaction(run);
  }

  /**
   * Guardrail — attempts are create-only; updates are rejected at repository boundary.
   */
  async updateObservationAttempt(): Promise<never> {
    throw new Exp021MaturationShadowAttemptImmutabilityError(
      'Observation attempts are immutable; create a new attempt instead',
    );
  }
}
