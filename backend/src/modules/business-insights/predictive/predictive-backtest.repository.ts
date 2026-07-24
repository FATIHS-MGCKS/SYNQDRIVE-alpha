import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  evaluationToResultCreate,
  mapBacktestResultRow,
  mapDriftSnapshotRow,
  mapModelRegistryRow,
} from '@shared/predictive/predictive-backtest.mapper';
import type { BacktestEvaluationResult, DriftEvaluationResult } from '@synq/evaluations-insights/predictive/evaluations-backtest.contract';

@Injectable()
export class PredictiveBacktestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(
    organizationId: string,
    data: { modelFamily: string; featureSetVersion: string; asOfDate: string; trigger?: string },
  ) {
    return this.prisma.orgPredictiveBacktestRun.create({
      data: {
        organizationId,
        modelFamily: data.modelFamily,
        featureSetVersion: data.featureSetVersion,
        asOfDate: data.asOfDate,
        status: 'PARTIAL',
        trigger: data.trigger ?? null,
      },
    });
  }

  async completeRun(
    runId: string,
    data: {
      status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
      modelsEvaluated: number;
      resultsWritten: number;
      errorMessage?: string;
    },
  ) {
    return this.prisma.orgPredictiveBacktestRun.update({
      where: { id: runId },
      data: {
        status: data.status,
        modelsEvaluated: data.modelsEvaluated,
        resultsWritten: data.resultsWritten,
        errorMessage: data.errorMessage ?? null,
        completedAt: new Date(),
      },
    });
  }

  async upsertResult(organizationId: string, runId: string, evaluation: BacktestEvaluationResult) {
    const data = evaluationToResultCreate(organizationId, runId, evaluation);
    const row = await this.prisma.orgPredictiveBacktestResult.upsert({
      where: {
        backtestRunId_modelKey_horizonDays_scopeKey: {
          backtestRunId: runId,
          modelKey: evaluation.modelKey,
          horizonDays: evaluation.horizonDays,
          scopeKey: evaluation.scopeKey,
        },
      },
      create: data as Prisma.OrgPredictiveBacktestResultCreateInput,
      update: {
        modelVersion: data.modelVersion,
        status: data.status,
        metrics: data.metrics as Prisma.InputJsonValue,
        baselineMetrics: data.baselineMetrics as Prisma.InputJsonValue,
        releaseGates: data.releaseGates as Prisma.InputJsonValue,
        gatesPassed: data.gatesPassed,
        foldCount: data.foldCount,
        evaluatedAt: data.evaluatedAt,
      },
    });
    return mapBacktestResultRow(row);
  }

  async upsertModelRegistry(
    organizationId: string,
    evaluation: BacktestEvaluationResult,
    driftSeverity?: string | null,
  ) {
    const status = evaluation.gatesPassed
      ? 'SHADOW'
      : evaluation.status === 'INSUFFICIENT_DATA'
        ? 'DRAFT'
        : 'DRAFT';

    const existing = await this.prisma.orgPredictiveModelRegistry.findUnique({
      where: {
        organizationId_modelFamily_modelKey_modelVersion_scopeKey_horizonDays: {
          organizationId,
          modelFamily: evaluation.modelFamily,
          modelKey: evaluation.modelKey,
          modelVersion: evaluation.modelVersion,
          scopeKey: evaluation.scopeKey,
          horizonDays: evaluation.horizonDays,
        },
      },
    });

    const nextStatus =
      existing?.status === 'APPROVED' && evaluation.gatesPassed
        ? 'APPROVED'
        : existing?.status === 'DISABLED' || existing?.status === 'ROLLED_BACK'
          ? existing.status
          : status;

    const row = await this.prisma.orgPredictiveModelRegistry.upsert({
      where: {
        organizationId_modelFamily_modelKey_modelVersion_scopeKey_horizonDays: {
          organizationId,
          modelFamily: evaluation.modelFamily,
          modelKey: evaluation.modelKey,
          modelVersion: evaluation.modelVersion,
          scopeKey: evaluation.scopeKey,
          horizonDays: evaluation.horizonDays,
        },
      },
      create: {
        organizationId,
        modelFamily: evaluation.modelFamily,
        modelKey: evaluation.modelKey,
        modelVersion: evaluation.modelVersion,
        featureSetVersion: evaluation.featureSetVersion,
        scopeMode: evaluation.scopeMode === 'GLOBAL_SEGMENT' ? 'GLOBAL_SEGMENT' : 'ORG_SPECIFIC',
        scopeKey: evaluation.scopeKey,
        horizonDays: evaluation.horizonDays,
        status: nextStatus,
        backtestMetrics: (evaluation.metrics ?? {}) as Prisma.InputJsonValue,
        releaseGates: evaluation.gates as Prisma.InputJsonValue,
        lastBacktestAt: new Date(evaluation.evaluatedAt),
        driftSeverity: (driftSeverity as 'STABLE' | 'WARNING' | 'CRITICAL' | null) ?? null,
      },
      update: {
        backtestMetrics: (evaluation.metrics ?? {}) as Prisma.InputJsonValue,
        releaseGates: evaluation.gates as Prisma.InputJsonValue,
        lastBacktestAt: new Date(evaluation.evaluatedAt),
        status: nextStatus,
        ...(driftSeverity
          ? { driftSeverity: driftSeverity as 'STABLE' | 'WARNING' | 'CRITICAL' }
          : {}),
      },
    });
    return mapModelRegistryRow(row);
  }

  async updateRegistryStatus(
    organizationId: string,
    modelKey: string,
    modelVersion: string,
    horizonDays: number,
    status: 'DRAFT' | 'SHADOW' | 'APPROVED' | 'DISABLED' | 'ROLLED_BACK',
    extra?: { driftSeverity?: string; disabledAt?: Date },
  ) {
    const row = await this.prisma.orgPredictiveModelRegistry.updateMany({
      where: { organizationId, modelKey, modelVersion, horizonDays },
      data: {
        status,
        ...(extra?.driftSeverity
          ? { driftSeverity: extra.driftSeverity as 'STABLE' | 'WARNING' | 'CRITICAL' }
          : {}),
        ...(extra?.disabledAt ? { disabledAt: extra.disabledAt } : {}),
        ...(status === 'APPROVED' ? { approvedAt: new Date() } : {}),
      },
    });
    return row;
  }

  async saveDriftSnapshot(organizationId: string, drift: DriftEvaluationResult, scopeKey = 'fleet') {
    const row = await this.prisma.orgPredictiveDriftSnapshot.create({
      data: {
        organizationId,
        modelFamily: drift.modelFamily,
        modelKey: drift.modelKey,
        modelVersion: drift.modelVersion,
        scopeKey,
        severity: drift.severity,
        recommendedAction: drift.recommendedAction,
        inputDrift: drift.inputDrift as Prisma.InputJsonValue,
        errorDrift: drift.errorDrift as Prisma.InputJsonValue,
        backtestBaseline: {} as Prisma.InputJsonValue,
        evaluatedAt: new Date(drift.evaluatedAt),
      },
    });
    return mapDriftSnapshotRow(row);
  }

  async listResults(
    organizationId: string,
    query: { modelKey?: string; horizonDays?: number; limit?: number },
  ) {
    const rows = await this.prisma.orgPredictiveBacktestResult.findMany({
      where: {
        organizationId,
        ...(query.modelKey ? { modelKey: query.modelKey } : {}),
        ...(query.horizonDays ? { horizonDays: query.horizonDays } : {}),
      },
      orderBy: { evaluatedAt: 'desc' },
      take: query.limit ?? 50,
    });
    return rows.map(mapBacktestResultRow);
  }

  async listRegistry(organizationId: string, query?: { modelKey?: string; status?: string }) {
    const rows = await this.prisma.orgPredictiveModelRegistry.findMany({
      where: {
        organizationId,
        ...(query?.modelKey ? { modelKey: query.modelKey } : {}),
        ...(query?.status
          ? { status: query.status as 'DRAFT' | 'SHADOW' | 'APPROVED' | 'DISABLED' | 'ROLLED_BACK' }
          : {}),
      },
      orderBy: [{ modelKey: 'asc' }, { horizonDays: 'asc' }],
    });
    return rows.map(mapModelRegistryRow);
  }

  async listDriftSnapshots(organizationId: string, query: { modelKey?: string; limit?: number } = {}) {
    const rows = await this.prisma.orgPredictiveDriftSnapshot.findMany({
      where: {
        organizationId,
        ...(query.modelKey ? { modelKey: query.modelKey } : {}),
      },
      orderBy: { evaluatedAt: 'desc' },
      take: query.limit ?? 20,
    });
    return rows.map(mapDriftSnapshotRow);
  }

  async getLatestBacktestRun(organizationId: string) {
    return this.prisma.orgPredictiveBacktestRun.findFirst({
      where: { organizationId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getRegistryEntry(
    organizationId: string,
    modelKey: string,
    horizonDays: number,
  ) {
    return this.prisma.orgPredictiveModelRegistry.findFirst({
      where: { organizationId, modelKey, horizonDays },
      orderBy: { lastBacktestAt: 'desc' },
    });
  }
}
