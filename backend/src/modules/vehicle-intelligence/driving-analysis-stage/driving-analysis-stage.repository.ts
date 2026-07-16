import { Injectable, NotFoundException } from '@nestjs/common';
import type { DrivingAnalysisStageKey, DrivingAnalysisStageStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildStageInputFingerprint } from './driving-analysis-stage.fingerprint';
import {
  DRIVING_ANALYSIS_STAGE_KEYS,
  type DrivingAnalysisStageSnapshot,
  type InitializeStagesForRunInput,
  type InitializeStagesForRunResult,
  type StageFingerprintContext,
} from './driving-analysis-stage.types';

@Injectable()
export class DrivingAnalysisStageRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByRun(organizationId: string, analysisRunId: string) {
    return this.prisma.drivingAnalysisStage.findMany({
      where: { organizationId, analysisRunId },
      orderBy: { stageKey: 'asc' },
    });
  }

  findByRunAndKey(
    organizationId: string,
    analysisRunId: string,
    stageKey: DrivingAnalysisStageKey,
  ) {
    return this.prisma.drivingAnalysisStage.findFirst({
      where: { organizationId, analysisRunId, stageKey },
    });
  }

  findCompletedByFingerprint(
    organizationId: string,
    stageKey: DrivingAnalysisStageKey,
    modelVersion: string,
    inputFingerprint: string,
  ) {
    return this.prisma.drivingAnalysisStage.findFirst({
      where: {
        organizationId,
        stageKey,
        modelVersion,
        inputFingerprint,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
    });
  }

  async initializeStagesForRun(
    input: InitializeStagesForRunInput,
  ): Promise<InitializeStagesForRunResult> {
    const existing = await this.findByRun(input.organizationId, input.analysisRunId);
    if (existing.length > 0) {
      return {
        stages: existing.map(toSnapshot),
        preservedCount: existing.filter((s) => s.preservedFromStageId != null).length,
        pendingCount: existing.filter((s) => s.status === 'PENDING').length,
      };
    }

    const supersededStages = input.supersededRunId
      ? await this.findByRun(input.organizationId, input.supersededRunId)
      : [];

    const supersededByKey = new Map(
      supersededStages.map((s) => [s.stageKey, s]),
    );

    let preservedCount = 0;
    let pendingCount = 0;
    const created: DrivingAnalysisStageSnapshot[] = [];

    for (const stageKey of DRIVING_ANALYSIS_STAGE_KEYS) {
      const fingerprintCtx: StageFingerprintContext = {
        organizationId: input.organizationId,
        tripId: input.tripId,
        vehicleId: input.vehicleId,
        stageKey,
        modelVersion: input.modelVersion,
        capabilityVersion: input.capabilityVersion,
        tripEndTimeIso: input.tripEndTimeIso,
        waypointCount: input.waypointCount,
        behaviorEnrichmentStatus: input.behaviorEnrichmentStatus,
      };
      const inputFingerprint = buildStageInputFingerprint(fingerprintCtx);

      const prior = supersededByKey.get(stageKey);
      const targetedRecompute =
        input.recomputeStageKeys?.includes(stageKey) ?? false;

      const canPreserve =
        prior != null &&
        prior.status === 'COMPLETED' &&
        prior.modelVersion === input.modelVersion &&
        prior.inputFingerprint === inputFingerprint &&
        !targetedRecompute;

      const globalDedup = await this.findCompletedByFingerprint(
        input.organizationId,
        stageKey,
        input.modelVersion,
        inputFingerprint,
      );

      const preserveFrom = canPreserve ? prior : globalDedup;

      const status: DrivingAnalysisStageStatus = preserveFrom ? 'COMPLETED' : 'PENDING';
      if (preserveFrom) preservedCount += 1;
      else pendingCount += 1;

      const row = await this.prisma.drivingAnalysisStage.create({
        data: {
          organizationId: input.organizationId,
          analysisRunId: input.analysisRunId,
          stageKey,
          modelVersion: input.modelVersion,
          inputFingerprint,
          status,
          attemptCount: preserveFrom?.attemptCount ?? 0,
          startedAt: preserveFrom?.startedAt ?? null,
          completedAt: preserveFrom?.completedAt ?? (preserveFrom ? new Date() : null),
          preservedFromStageId: preserveFrom?.id ?? null,
        },
      });

      created.push(toSnapshot(row));
    }

    return { stages: created, preservedCount, pendingCount };
  }

  async markInProgress(
    organizationId: string,
    analysisRunId: string,
    stageKey: DrivingAnalysisStageKey,
  ) {
    const stage = await this.findByRunAndKey(organizationId, analysisRunId, stageKey);
    if (!stage) {
      throw new NotFoundException(`Stage ${stageKey} not found for run ${analysisRunId}`);
    }
    if (stage.status === 'COMPLETED' || stage.status === 'SKIPPED') {
      return stage;
    }

    return this.prisma.drivingAnalysisStage.update({
      where: { id: stage.id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: stage.startedAt ?? new Date(),
        attemptCount: { increment: 1 },
      },
    });
  }

  async markCompleted(
    organizationId: string,
    analysisRunId: string,
    stageKey: DrivingAnalysisStageKey,
  ) {
    const stage = await this.findByRunAndKey(organizationId, analysisRunId, stageKey);
    if (!stage) {
      throw new NotFoundException(`Stage ${stageKey} not found for run ${analysisRunId}`);
    }
    if (stage.status === 'COMPLETED' || stage.status === 'SKIPPED') {
      return stage;
    }

    return this.prisma.drivingAnalysisStage.update({
      where: { id: stage.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  async markFailed(
    organizationId: string,
    analysisRunId: string,
    stageKey: DrivingAnalysisStageKey,
    errorCode: string,
    errorMessage?: string | null,
  ) {
    const stage = await this.findByRunAndKey(organizationId, analysisRunId, stageKey);
    if (!stage) {
      throw new NotFoundException(`Stage ${stageKey} not found for run ${analysisRunId}`);
    }

    return this.prisma.drivingAnalysisStage.update({
      where: { id: stage.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorCode,
        errorMessage: errorMessage ?? null,
      },
    });
  }

  async markSkipped(
    organizationId: string,
    analysisRunId: string,
    stageKey: DrivingAnalysisStageKey,
    reason?: string | null,
  ) {
    const stage = await this.findByRunAndKey(organizationId, analysisRunId, stageKey);
    if (!stage) {
      throw new NotFoundException(`Stage ${stageKey} not found for run ${analysisRunId}`);
    }

    return this.prisma.drivingAnalysisStage.update({
      where: { id: stage.id },
      data: {
        status: 'SKIPPED',
        completedAt: new Date(),
        errorMessage: reason ?? null,
      },
    });
  }
}

function toSnapshot(row: {
  stageKey: DrivingAnalysisStageKey;
  status: DrivingAnalysisStageStatus;
  modelVersion: string;
  inputFingerprint: string;
  attemptCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  preservedFromStageId: string | null;
}): DrivingAnalysisStageSnapshot {
  return {
    stageKey: row.stageKey,
    status: row.status,
    modelVersion: row.modelVersion,
    inputFingerprint: row.inputFingerprint,
    attemptCount: row.attemptCount,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    preservedFromStageId: row.preservedFromStageId,
  };
}
