import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  Exp021MaturationShadowAttemptImmutabilityError,
  Exp021MaturationShadowFamilyIdentityError,
  Exp021MaturationShadowStratumSemanticMismatchError,
} from './reference-capture-exp021-maturation-shadow.errors';
import {
  extractStratumImmutableAttributes,
  findStratumImmutableAttributeMismatches,
} from './reference-capture-exp021-maturation-shadow-stratum-attributes.lib';
import { EXP021_MATURATION_SHADOW_MAX_TRANSPORT_RETRIES } from './reference-capture-exp021-maturation-shadow.constants';
import type {
  Exp021MaturationShadowAttemptRawFacts,
  Exp021MaturationShadowFamilyIdentity,
  Exp021MaturationShadowStratumIdentity,
  Exp021MaturationShadowStratumImmutableAttributes,
} from './reference-capture-exp021-maturation-shadow.types';
import {
  assertAttemptParentAuthority,
  assertCanonicalQueryGeometryMs,
  assertFamilyScheduleMatchesPersisted,
  assertFamilyScheduleSemanticallyValid,
  assertPlannedAgeOnFamilySchedule,
  assertProviderOutcomeConsistency,
  assertStratumAlignsWithFamily,
} from './reference-capture-exp021-maturation-shadow-validation.lib';

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const EXP021_ACTIVE_FAMILY_CAP_LOCK_KEY = 90210021;
const MAX_PROVIDER_ATTEMPTS_PER_SLOT = 1 + EXP021_MATURATION_SHADOW_MAX_TRANSPORT_RETRIES;

@Injectable()
export class ReferenceCaptureExp021MaturationShadowRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: Prisma.TransactionClient): PrismaService | Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  private resolveExistingFamilySchedule<T extends { plannedAgesMsExact: number[]; policyDelayProbeMs: number }>(
    existing: T,
    proposed: { plannedAgesMsExact: number[]; policyDelayProbeMs: number },
  ): T {
    assertFamilyScheduleMatchesPersisted(existing, proposed);
    return existing;
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

    const scheduleSemantics = {
      plannedAgesMsExact: input.plannedAgesMsExact,
      policyDelayProbeMs: input.policyDelayProbeMs,
    };

    assertFamilyScheduleSemanticallyValid(scheduleSemantics);

    const existing = await db.exp021MaturationShadowWindowFamily.findUnique({ where: uniqueWhere });
    if (existing) {
      return this.resolveExistingFamilySchedule(existing, scheduleSemantics);
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
      return this.resolveExistingFamilySchedule(raced, scheduleSemantics);
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
    const queryGeometryMs = assertCanonicalQueryGeometryMs(input.queryGeometryMs);
    const uniqueWhere = {
      windowFamilyId_signalLane_queryGeometryMs: {
        windowFamilyId: input.windowFamilyId,
        signalLane: input.signalLane,
        queryGeometryMs,
      },
    };

    const family = await db.exp021MaturationShadowWindowFamily.findUnique({
      where: { id: input.windowFamilyId },
    });
    if (!family) {
      throw new Exp021MaturationShadowStratumSemanticMismatchError(
        `Window family not found: ${input.windowFamilyId}`,
      );
    }

    assertStratumAlignsWithFamily({
      familyCanonicalWindowTo: family.canonicalWindowTo,
      queryGeometryMs,
      windowFrom: input.windowFrom,
      windowTo: input.windowTo,
    });

    const existing = await db.exp021MaturationShadowWindow.findUnique({ where: uniqueWhere });
    if (existing) {
      assertStratumAlignsWithFamily({
        familyCanonicalWindowTo: family.canonicalWindowTo,
        queryGeometryMs: existing.queryGeometryMs,
        windowFrom: existing.windowFrom,
        windowTo: existing.windowTo,
      });
      const mismatches = findStratumImmutableAttributeMismatches(
        extractStratumImmutableAttributes(existing),
        input,
      );
      if (mismatches.length > 0) {
        throw new Exp021MaturationShadowStratumSemanticMismatchError(
          `Immutable stratum attribute mismatch for ${input.signalLane}/${queryGeometryMs}: ${mismatches.join(', ')}`,
        );
      }
      return existing;
    }

    try {
      return await db.exp021MaturationShadowWindow.create({
        data: {
          windowFamilyId: input.windowFamilyId,
          signalLane: input.signalLane,
          queryGeometryMs,
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
      assertStratumAlignsWithFamily({
        familyCanonicalWindowTo: family.canonicalWindowTo,
        queryGeometryMs: raced.queryGeometryMs,
        windowFrom: raced.windowFrom,
        windowTo: raced.windowTo,
      });
      const mismatches = findStratumImmutableAttributeMismatches(
        extractStratumImmutableAttributes(raced),
        input,
      );
      if (mismatches.length > 0) {
        throw new Exp021MaturationShadowStratumSemanticMismatchError(
          `Immutable stratum attribute mismatch for ${input.signalLane}/${queryGeometryMs}: ${mismatches.join(', ')}`,
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

    const stratum = await db.exp021MaturationShadowWindow.findUnique({
      where: { id: input.windowStratumId },
      include: { family: true },
    });
    if (!stratum) {
      throw new Exp021MaturationShadowStratumSemanticMismatchError(
        `Window stratum not found: ${input.windowStratumId}`,
      );
    }
    assertPlannedAgeOnFamilySchedule(stratum.family, input.plannedAgeMs);

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
    },
    tx?: Prisma.TransactionClient,
  ) {
    const run = async (client: Prisma.TransactionClient) => {
      const slot = await client.exp021MaturationShadowObservationSlot.findUnique({
        where: { id: input.observationSlotId },
        include: {
          stratum: {
            include: { family: true },
          },
        },
      });
      if (!slot) {
        throw new Exp021MaturationShadowAttemptImmutabilityError(
          `Observation slot not found: ${input.observationSlotId}`,
        );
      }

      await client.$executeRaw`
        SELECT id FROM exp021_maturation_shadow_observation_slots
        WHERE id = ${input.observationSlotId}
        FOR UPDATE
      `;

      assertProviderOutcomeConsistency({
        providerRequestSucceeded: input.rawFacts.providerRequestSucceeded,
        providerOutcomeClass: input.rawFacts.providerOutcomeClass,
        providerErrorClass: input.rawFacts.providerErrorClass,
        uniqueBucketLocusCount: input.rawFacts.uniqueBucketLocusCount,
      });

      const providerBucketCount =
        input.rawFacts.providerOutcomeClass === 'PROVIDER_ERROR'
          ? null
          : input.rawFacts.uniqueBucketLocusCount ?? null;

      const authority = assertAttemptParentAuthority({
        slotPlannedAgeMs: slot.plannedAgeMs,
        proposedPlannedAgeMs: input.rawFacts.plannedAgeMs,
        stratumQuerySemanticsHash: slot.stratum.querySemanticsHash,
        stratumSignalSetHash: slot.stratum.signalSetHash,
        proposedQuerySemanticsHash: input.rawFacts.querySemanticsHash,
        proposedSignalSetHash: input.rawFacts.signalSetHash,
        requestStartedAt: input.rawFacts.requestStartedAt,
        requestCompletedAt: input.rawFacts.requestCompletedAt,
        windowTo: slot.stratum.windowTo,
      });

      const maxOrdinal = await client.exp021MaturationShadowObservationAttempt.aggregate({
        where: { observationSlotId: input.observationSlotId },
        _max: { attemptOrdinal: true },
      });
      const attemptOrdinal = (maxOrdinal._max.attemptOrdinal ?? 0) + 1;

      return client.exp021MaturationShadowObservationAttempt.create({
        data: {
          observationSlotId: input.observationSlotId,
          attemptOrdinal,
          plannedAgeMs: slot.plannedAgeMs,
          actualAgeMs: authority.actualAgeMs,
          schedulerDriftMs: authority.schedulerDriftMs,
          requestStartedAt: input.rawFacts.requestStartedAt,
          requestCompletedAt: input.rawFacts.requestCompletedAt ?? null,
          runtimeBuildSha: input.rawFacts.runtimeBuildSha,
          querySemanticsHash: authority.querySemanticsHash,
          signalSetHash: authority.signalSetHash,
          providerRequestSucceeded: input.rawFacts.providerRequestSucceeded,
          providerOutcomeClass: input.rawFacts.providerOutcomeClass,
          providerStatus: input.rawFacts.providerStatus ?? null,
          providerErrorClass: input.rawFacts.providerErrorClass ?? null,
          uniqueBucketLocusCount: providerBucketCount,
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
          newBucketLociVsPriorAge: null,
          missingPriorBucketLociAtThisAge: null,
          cumulativeBucketLocusUnionCount: null,
          bucketLocusCoverageRatioVsFinalObservedUnion: null,
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

  async findObservationSlotById(observationSlotId: string) {
    return this.prisma.exp021MaturationShadowObservationSlot.findUnique({
      where: { id: observationSlotId },
      include: {
        attempts: { orderBy: { attemptOrdinal: 'asc' } },
        stratum: { include: { family: true } },
      },
    });
  }

  async linkBullJobIdIfAbsent(observationSlotId: string, bullJobId: string): Promise<boolean> {
    const updated = await this.prisma.exp021MaturationShadowObservationSlot.updateMany({
      where: {
        id: observationSlotId,
        bullJobId: null,
      },
      data: { bullJobId },
    });
    return updated.count > 0;
  }

  async clearBullJobId(observationSlotId: string): Promise<void> {
    await this.prisma.exp021MaturationShadowObservationSlot.updateMany({
      where: { id: observationSlotId },
      data: { bullJobId: null },
    });
  }

  async findSlotsMissingBullJob(limit = 500) {
    return this.findSlotsForReconciliation(limit);
  }

  async findSlotsForReconciliation(limit = 500) {
    const slotIds = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT s.id
      FROM exp021_maturation_shadow_observation_slots s
      JOIN exp021_maturation_shadow_windows w ON w.id = s.window_stratum_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM exp021_maturation_shadow_observation_attempts a
        WHERE a.observation_slot_id = s.id
          AND a.provider_request_succeeded = true
          AND a.provider_outcome_class <> 'PROVIDER_ERROR'
      )
      AND (
        SELECT COUNT(*)::int
        FROM exp021_maturation_shadow_observation_attempts a2
        WHERE a2.observation_slot_id = s.id
      ) < ${MAX_PROVIDER_ATTEMPTS_PER_SLOT}
      ORDER BY s.created_at ASC
      LIMIT ${limit}
    `;

    if (slotIds.length === 0) {
      return [];
    }

    return this.prisma.exp021MaturationShadowObservationSlot.findMany({
      where: { id: { in: slotIds.map((row) => row.id) } },
      include: {
        attempts: { orderBy: { attemptOrdinal: 'asc' } },
        stratum: { include: { family: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Active families = families with at least one non-terminal observation slot.
   * Terminal slot: successful attempt OR transport retry budget exhausted.
   */
  async countUnfinishedFamilies(tx?: Prisma.TransactionClient): Promise<number> {
    const db = this.client(tx);
    const rows = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT f.id)::bigint AS count
      FROM exp021_maturation_shadow_window_families f
      WHERE EXISTS (
        SELECT 1
        FROM exp021_maturation_shadow_windows w
        JOIN exp021_maturation_shadow_observation_slots s ON s.window_stratum_id = w.id
        WHERE w.window_family_id = f.id
          AND NOT EXISTS (
            SELECT 1
            FROM exp021_maturation_shadow_observation_attempts a
            WHERE a.observation_slot_id = s.id
              AND a.provider_request_succeeded = true
              AND a.provider_outcome_class <> 'PROVIDER_ERROR'
          )
          AND (
            SELECT COUNT(*)::int
            FROM exp021_maturation_shadow_observation_attempts a2
            WHERE a2.observation_slot_id = s.id
          ) < ${MAX_PROVIDER_ATTEMPTS_PER_SLOT}
      )
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async assertActiveFamilyCapacityForNewEnrollment(
    maxActiveFamilies: number,
    familyAlreadyExists: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (familyAlreadyExists) {
      return;
    }
    if (maxActiveFamilies <= 0) {
      throw new Exp021MaturationShadowFamilyIdentityError(
        'maxActiveFamilies must be a positive integer when EXP-021 maturation shadow is enabled',
      );
    }
    const active = await this.countUnfinishedFamilies(tx);
    if (active >= maxActiveFamilies) {
      throw new Exp021MaturationShadowFamilyIdentityError(
        `Active window-family cap reached (${maxActiveFamilies})`,
      );
    }
  }

  async withActiveFamilyAdmissionLock<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EXP021_ACTIVE_FAMILY_CAP_LOCK_KEY})`;
      return run(tx);
    });
  }

  async familyExistsForIdentity(
    identity: Exp021MaturationShadowFamilyIdentity,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const db = this.client(tx);
    const existing = await db.exp021MaturationShadowWindowFamily.findUnique({
      where: {
        organizationId_vehicleId_tokenId_canonicalWindowTo_shadowScheduleVersion: {
          organizationId: identity.organizationId,
          vehicleId: identity.vehicleId,
          tokenId: identity.tokenId,
          canonicalWindowTo: identity.canonicalWindowTo,
          shadowScheduleVersion: identity.shadowScheduleVersion,
        },
      },
      select: { id: true },
    });
    return existing != null;
  }

  async resolveAuthoritativeTokenId(
    organizationId: string,
    vehicleId: string,
    expectedTokenId: number,
  ): Promise<number> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });
    const authoritative = vehicle?.dimoVehicle?.tokenId;
    if (authoritative == null) {
      throw new Exp021MaturationShadowFamilyIdentityError(
        `No authoritative DIMO token for vehicle ${vehicleId}`,
      );
    }
    if (authoritative !== expectedTokenId) {
      throw new Exp021MaturationShadowFamilyIdentityError(
        `Token identity mismatch: expected ${expectedTokenId}, authoritative ${authoritative}`,
      );
    }
    return authoritative;
  }
}
