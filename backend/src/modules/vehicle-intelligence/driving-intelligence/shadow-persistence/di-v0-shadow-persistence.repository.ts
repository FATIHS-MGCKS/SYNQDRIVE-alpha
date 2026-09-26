import { Injectable } from '@nestjs/common';
import type { DiV0ShadowRun, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import { deriveCompletionCountsFromPersistedIntervals } from './di-v0-shadow-completion';
import { buildDiV0ShadowRunIdempotencyKey } from './di-v0-shadow-idempotency';
import { canTransitionRunStatus, isDiV0ShadowRunStatus } from './di-v0-shadow-run-status';
import { assertShadowRunTripIdentity } from './di-v0-shadow-tenant';
import type {
  DiV0ShadowPersistedIntervalInput,
  DiV0ShadowRunIdentity,
  DiV0ShadowRunStatus,
} from './di-v0-shadow-types';
import { validateShadowIntervalRow, validateShadowSourceFamily } from './di-v0-shadow-validation';

const INTERVAL_BATCH_SIZE = 500;

export type DiV0ShadowPrismaClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class DiV0ShadowPersistenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: DiV0ShadowPrismaClient): DiV0ShadowPrismaClient {
    return tx ?? this.prisma;
  }

  async findRunByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
    tx?: DiV0ShadowPrismaClient,
  ): Promise<DiV0ShadowRun | null> {
    return this.client(tx).diV0ShadowRun.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    });
  }

  async findRunByTripVersionTuple(
    identity: DiV0ShadowRunIdentity,
    tx?: DiV0ShadowPrismaClient,
  ): Promise<DiV0ShadowRun | null> {
    return this.client(tx).diV0ShadowRun.findFirst({
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

  async createOrGetRun(
    identity: DiV0ShadowRunIdentity,
    tx?: DiV0ShadowPrismaClient,
  ): Promise<DiV0ShadowRun> {
    validateShadowSourceFamily(identity.sourceFamily);
    await assertShadowRunTripIdentity(this.client(tx), identity);

    const idempotencyKey = buildDiV0ShadowRunIdempotencyKey(identity);
    const existing = await this.findRunByIdempotencyKey(identity.organizationId, idempotencyKey, tx);
    if (existing) {
      return existing;
    }
    try {
      return await this.client(tx).diV0ShadowRun.create({
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
        const raced = await this.findRunByIdempotencyKey(identity.organizationId, idempotencyKey, tx);
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  async markRunRunning(runId: string, tx?: DiV0ShadowPrismaClient): Promise<DiV0ShadowRun> {
    const db = this.client(tx);
    const run = await db.diV0ShadowRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new Error('DI_V0_SHADOW_RUN_NOT_FOUND');
    }
    if (!isDiV0ShadowRunStatus(run.status)) {
      throw new Error('DI_V0_SHADOW_INVALID_RUN_STATUS');
    }
    if (run.status === 'RUNNING') {
      return run;
    }
    if (!canTransitionRunStatus(run.status, 'RUNNING')) {
      throw new Error(`DI_V0_SHADOW_ILLEGAL_RUN_STATUS_TRANSITION:${run.status}->RUNNING`);
    }
    const updated = await db.diV0ShadowRun.updateMany({
      where: { id: runId, status: run.status },
      data: { status: 'RUNNING', startedAt: new Date(), failureCode: null, failureDetailSafe: null },
    });
    if (updated.count !== 1) {
      const current = await db.diV0ShadowRun.findUnique({ where: { id: runId } });
      if (current?.status === 'RUNNING') {
        return current;
      }
      if (current?.status === 'COMPLETED') {
        throw new Error('DI_V0_SHADOW_RUN_ALREADY_COMPLETED');
      }
      throw new Error('DI_V0_SHADOW_RUN_STATUS_RACE');
    }
    return db.diV0ShadowRun.findUniqueOrThrow({ where: { id: runId } });
  }

  async markRunFailed(
    runId: string,
    failureCode: string,
    failureDetailSafe: string,
    tx?: DiV0ShadowPrismaClient,
  ): Promise<DiV0ShadowRun> {
    const db = this.client(tx);
    const run = await db.diV0ShadowRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new Error('DI_V0_SHADOW_RUN_NOT_FOUND');
    }
    if (run.status === 'FAILED') {
      return run;
    }
    if (!canTransitionRunStatus(run.status, 'FAILED')) {
      throw new Error(`DI_V0_SHADOW_ILLEGAL_RUN_STATUS_TRANSITION:${run.status}->FAILED`);
    }
    const updated = await db.diV0ShadowRun.updateMany({
      where: { id: runId, status: 'RUNNING' },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureCode,
        failureDetailSafe: failureDetailSafe.slice(0, 500),
      },
    });
    if (updated.count !== 1) {
      throw new Error('DI_V0_SHADOW_RUN_STATUS_RACE');
    }
    return db.diV0ShadowRun.findUniqueOrThrow({ where: { id: runId } });
  }

  async completeRun(runId: string, tx?: DiV0ShadowPrismaClient): Promise<DiV0ShadowRun> {
    const db = this.client(tx);
    const run = await db.diV0ShadowRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new Error('DI_V0_SHADOW_RUN_NOT_FOUND');
    }
    if (run.status === 'COMPLETED') {
      return run;
    }
    if (!canTransitionRunStatus(run.status, 'COMPLETED')) {
      throw new Error(`DI_V0_SHADOW_ILLEGAL_RUN_STATUS_TRANSITION:${run.status}->COMPLETED`);
    }

    const intervals = await db.diV0ShadowInterval.findMany({
      where: { shadowRunId: runId },
      select: { estimatedSpeedKmh: true, abstentionReason: true, sourceRelation: true },
    });
    const counts = deriveCompletionCountsFromPersistedIntervals(intervals);
    if (counts.intervalCount === 0) {
      throw new Error('DI_V0_SHADOW_CANNOT_COMPLETE_WITHOUT_INTERVALS');
    }

    const updated = await db.diV0ShadowRun.updateMany({
      where: { id: runId, status: 'RUNNING' },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        intervalCount: counts.intervalCount,
        numericSpeedCount: counts.numericSpeedCount,
        abstentionCount: counts.abstentionCount,
        conflictCount: counts.conflictCount,
      },
    });
    if (updated.count !== 1) {
      const current = await db.diV0ShadowRun.findUnique({ where: { id: runId } });
      if (current?.status === 'COMPLETED') {
        return current;
      }
      throw new Error('DI_V0_SHADOW_RUN_STATUS_RACE');
    }
    return db.diV0ShadowRun.findUniqueOrThrow({ where: { id: runId } });
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
    tx?: DiV0ShadowPrismaClient,
  ): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    for (const row of rows) {
      validateShadowIntervalRow(row);
    }
    const db = this.client(tx);
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
      const result = await db.diV0ShadowInterval.createMany({ data, skipDuplicates: true });
      inserted += result.count;
    }
    return inserted;
  }

  async listIntervalsByRunOrdered(shadowRunId: string, tx?: DiV0ShadowPrismaClient) {
    return this.client(tx).diV0ShadowInterval.findMany({
      where: { shadowRunId },
      orderBy: { intervalStart: 'asc' },
    });
  }

  async deleteRunForTest(shadowRunId: string, tx?: DiV0ShadowPrismaClient): Promise<void> {
    const db = this.client(tx);
    await db.diV0ShadowInterval.deleteMany({ where: { shadowRunId } });
    await db.diV0ShadowRun.deleteMany({ where: { id: shadowRunId } });
  }
}

export function isTerminalShadowRunStatus(status: string): boolean {
  return status === 'COMPLETED' || status === 'FAILED';
}

export type { DiV0ShadowRunStatus };
