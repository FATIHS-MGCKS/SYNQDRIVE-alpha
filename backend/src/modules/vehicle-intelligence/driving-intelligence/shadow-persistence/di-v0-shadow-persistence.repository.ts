import { Injectable } from '@nestjs/common';
import type { DiV0ShadowRun, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import { buildDiV0ShadowRunIdempotencyKey } from './di-v0-shadow-idempotency';
import type {
  DiV0ShadowCompletionCounts,
  DiV0ShadowPersistedIntervalInput,
  DiV0ShadowRunIdentity,
  DiV0ShadowRunStatus,
} from './di-v0-shadow-types';
import { validateShadowIntervalRow, validateShadowSourceFamily } from './di-v0-shadow-validation';

const INTERVAL_BATCH_SIZE = 500;

@Injectable()
export class DiV0ShadowPersistenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRunByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<DiV0ShadowRun | null> {
    return this.prisma.diV0ShadowRun.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    });
  }

  async findRunByTripVersionTuple(
    identity: DiV0ShadowRunIdentity,
  ): Promise<DiV0ShadowRun | null> {
    return this.prisma.diV0ShadowRun.findFirst({
      where: {
        tripId: identity.tripId,
        structuralVersion: identity.versions.structuralVersion,
        estimatorVersion: identity.versions.estimatorVersion,
        calibrationVersion: identity.versions.calibrationVersion,
        sourceFamilyPolicyVersion: identity.versions.sourceFamilyPolicyVersion,
        inputEvidenceVersion: identity.inputEvidenceVersion,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOrGetRun(identity: DiV0ShadowRunIdentity): Promise<DiV0ShadowRun> {
    validateShadowSourceFamily(identity.sourceFamily);
    const idempotencyKey = buildDiV0ShadowRunIdempotencyKey(identity);
    const existing = await this.findRunByIdempotencyKey(identity.organizationId, idempotencyKey);
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.diV0ShadowRun.create({
        data: {
          organizationId: identity.organizationId,
          vehicleId: identity.vehicleId,
          tripId: identity.tripId,
          sourceFamily: identity.sourceFamily,
          structuralVersion: identity.versions.structuralVersion,
          estimatorVersion: identity.versions.estimatorVersion,
          calibrationVersion: identity.versions.calibrationVersion,
          sourceFamilyPolicyVersion: identity.versions.sourceFamilyPolicyVersion,
          inputEvidenceVersion: identity.inputEvidenceVersion,
          idempotencyKey,
          status: 'PENDING',
        },
      });
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        const raced = await this.findRunByIdempotencyKey(identity.organizationId, idempotencyKey);
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  async markRunRunning(runId: string): Promise<DiV0ShadowRun> {
    return this.prisma.diV0ShadowRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date(), failureCode: null, failureDetailSafe: null },
    });
  }

  async markRunFailed(
    runId: string,
    failureCode: string,
    failureDetailSafe: string,
  ): Promise<DiV0ShadowRun> {
    return this.prisma.diV0ShadowRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureCode,
        failureDetailSafe: failureDetailSafe.slice(0, 500),
      },
    });
  }

  async completeRun(runId: string, counts: DiV0ShadowCompletionCounts): Promise<DiV0ShadowRun> {
    const run = await this.prisma.diV0ShadowRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new Error('DI_V0_SHADOW_RUN_NOT_FOUND');
    }
    if (run.status === 'COMPLETED') {
      return run;
    }
    if (run.status === 'FAILED') {
      throw new Error('DI_V0_SHADOW_RUN_ALREADY_FAILED');
    }
    const persisted = await this.prisma.diV0ShadowInterval.count({ where: { shadowRunId: runId } });
    if (persisted !== counts.intervalCount) {
      throw new Error('DI_V0_SHADOW_INTERVAL_COUNT_MISMATCH');
    }
    return this.prisma.diV0ShadowRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        intervalCount: counts.intervalCount,
        numericSpeedCount: counts.numericSpeedCount,
        abstentionCount: counts.abstentionCount,
        conflictCount: counts.conflictCount,
      },
    });
  }

  async insertIntervalBatch(
    run: DiV0ShadowRun,
    rows: DiV0ShadowPersistedIntervalInput[],
    versions: {
      structuralVersion: string;
      estimatorVersion: string;
      calibrationVersion: string;
      sourceFamilyPolicyVersion: string;
    },
  ): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    for (const row of rows) {
      validateShadowIntervalRow(row);
    }
    let inserted = 0;
    for (let offset = 0; offset < rows.length; offset += INTERVAL_BATCH_SIZE) {
      const chunk = rows.slice(offset, offset + INTERVAL_BATCH_SIZE);
      const data: Prisma.DiV0ShadowIntervalCreateManyInput[] = chunk.map((row) => ({
        shadowRunId: run.id,
        organizationId: run.organizationId,
        vehicleId: run.vehicleId,
        tripId: run.tripId,
        intervalStart: row.intervalStart,
        intervalEnd: row.intervalEnd,
        referenceTime: row.referenceTime,
        motionState: row.motionState,
        positionState: row.positionState,
        causalPositionState: row.causalPositionState,
        estimatedSpeedKmh: row.estimatedSpeedKmh,
        speedRangeMinKmh: row.speedRangeMinKmh,
        speedRangeMaxKmh: row.speedRangeMaxKmh,
        speedEvidenceState: row.speedEvidenceState,
        temporalConfidence: row.temporalConfidence,
        valueConfidence: row.valueConfidence,
        sourceRelation: row.sourceRelation,
        claimLevel: row.claimLevel,
        abstentionReason: row.abstentionReason,
        evidenceSources: row.evidenceSources,
        sourceQualityFlags: row.sourceQualityFlags,
        supportIntervalStart: row.supportIntervalStart,
        supportIntervalEnd: row.supportIntervalEnd,
        derivationMethod: row.derivationMethod,
        derivationVersion: row.derivationVersion,
        structuralVersion: versions.structuralVersion,
        estimatorVersion: versions.estimatorVersion,
        calibrationVersion: versions.calibrationVersion,
        sourceFamilyPolicyVersion: versions.sourceFamilyPolicyVersion,
        provenance: row.provenance as Prisma.InputJsonValue,
        legacyComparison: (row.legacyComparison ?? undefined) as Prisma.InputJsonValue | undefined,
      }));
      const result = await this.prisma.diV0ShadowInterval.createMany({ data, skipDuplicates: true });
      inserted += result.count;
    }
    return inserted;
  }

  async listIntervalsByRunOrdered(shadowRunId: string) {
    return this.prisma.diV0ShadowInterval.findMany({
      where: { shadowRunId },
      orderBy: { intervalStart: 'asc' },
    });
  }

  async deleteRunForTest(shadowRunId: string): Promise<void> {
    await this.prisma.diV0ShadowInterval.deleteMany({ where: { shadowRunId } });
    await this.prisma.diV0ShadowRun.deleteMany({ where: { id: shadowRunId } });
  }
}

export function isTerminalShadowRunStatus(status: string): boolean {
  return status === 'COMPLETED' || status === 'FAILED';
}

export type { DiV0ShadowRunStatus };
