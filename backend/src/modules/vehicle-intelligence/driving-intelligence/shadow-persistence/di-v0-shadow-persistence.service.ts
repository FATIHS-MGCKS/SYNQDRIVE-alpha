import { Injectable } from '@nestjs/common';
import type { DiV0ShadowRun } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { DiV0TripComputeOutput } from '../core/types';
import type { DiV0VersionTuple } from '../core/versions';
import { mapComputeOutputToPersistRows } from './di-v0-shadow-mapper';
import { DiV0ShadowPersistenceRepository } from './di-v0-shadow-persistence.repository';
import type { DiV0ShadowRunIdentity } from './di-v0-shadow-types';

export interface PersistDiV0ShadowRunInput {
  identity: DiV0ShadowRunIdentity;
  computeOutput: DiV0TripComputeOutput;
  versions: DiV0VersionTuple;
}

/**
 * Persists pre-computed DI V0 shadow outputs only — no provider fetch, no kinematic recompute.
 */
@Injectable()
export class DiV0ShadowPersistenceService {
  constructor(
    private readonly repository: DiV0ShadowPersistenceRepository,
    private readonly prisma: PrismaService,
  ) {}

  async persistCompletedRun(input: PersistDiV0ShadowRunInput): Promise<DiV0ShadowRun> {
    const rows = mapComputeOutputToPersistRows(input.computeOutput, input.versions);
    const run = await this.repository.createOrGetRun(input.identity);
    if (run.status === 'COMPLETED') {
      return run;
    }
    if (run.status === 'FAILED') {
      throw new Error('DI_V0_SHADOW_RUN_PREVIOUSLY_FAILED');
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const latest = await tx.diV0ShadowRun.findUnique({ where: { id: run.id } });
          if (latest?.status === 'COMPLETED') {
            return latest;
          }
          if (latest?.status === 'FAILED') {
            throw new Error('DI_V0_SHADOW_RUN_PREVIOUSLY_FAILED');
          }
          try {
            await this.repository.markRunRunning(run.id, tx);
          } catch (markError) {
            const raced = await tx.diV0ShadowRun.findUnique({ where: { id: run.id } });
            if (raced?.status === 'COMPLETED') {
              return raced;
            }
            throw markError;
          }
          await this.repository.insertIntervalBatch(run, rows, input.versions, tx);
          return await this.repository.completeRun(run.id, tx);
        },
        { timeout: 120_000 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      const latest = await this.prisma.diV0ShadowRun.findUnique({ where: { id: run.id } });
      if (latest?.status === 'RUNNING') {
        await this.repository.markRunFailed(run.id, 'PERSISTENCE_FAILED', message);
      }
      throw error;
    }
  }

  async getRunByTripVersion(identity: DiV0ShadowRunIdentity): Promise<DiV0ShadowRun | null> {
    return this.repository.findRunByTripVersionTuple(identity);
  }

  async loadIntervalsForReplay(shadowRunId: string) {
    return this.repository.listIntervalsByRunOrdered(shadowRunId);
  }
}
