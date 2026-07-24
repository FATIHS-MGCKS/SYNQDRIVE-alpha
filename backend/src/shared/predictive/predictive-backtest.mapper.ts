import type {
  OrgPredictiveBacktestResult,
  OrgPredictiveDriftSnapshot,
  OrgPredictiveModelRegistry,
} from '@prisma/client';
import type { BacktestEvaluationResult } from '@synq/evaluations-insights/predictive/evaluations-backtest.contract';

export function mapBacktestResultRow(row: OrgPredictiveBacktestResult) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    backtestRunId: row.backtestRunId,
    modelFamily: row.modelFamily,
    modelKey: row.modelKey,
    modelVersion: row.modelVersion,
    horizonDays: row.horizonDays,
    scopeMode: row.scopeMode,
    scopeKey: row.scopeKey,
    status: row.status,
    metrics: row.metrics,
    baselineMetrics: row.baselineMetrics,
    releaseGates: row.releaseGates,
    gatesPassed: row.gatesPassed,
    foldCount: row.foldCount,
    evaluatedAt: row.evaluatedAt.toISOString(),
  };
}

export function mapModelRegistryRow(row: OrgPredictiveModelRegistry) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    modelFamily: row.modelFamily,
    modelKey: row.modelKey,
    modelVersion: row.modelVersion,
    featureSetVersion: row.featureSetVersion,
    scopeMode: row.scopeMode,
    scopeKey: row.scopeKey,
    horizonDays: row.horizonDays,
    status: row.status,
    backtestMetrics: row.backtestMetrics,
    releaseGates: row.releaseGates,
    lastBacktestAt: row.lastBacktestAt?.toISOString() ?? null,
    lastDriftAt: row.lastDriftAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    fallbackModelVersion: row.fallbackModelVersion,
    driftSeverity: row.driftSeverity,
    metadata: row.metadata,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapDriftSnapshotRow(row: OrgPredictiveDriftSnapshot) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    modelFamily: row.modelFamily,
    modelKey: row.modelKey,
    modelVersion: row.modelVersion,
    scopeKey: row.scopeKey,
    severity: row.severity,
    recommendedAction: row.recommendedAction,
    inputDrift: row.inputDrift,
    errorDrift: row.errorDrift,
    backtestBaseline: row.backtestBaseline,
    evaluatedAt: row.evaluatedAt.toISOString(),
  };
}

export function evaluationToResultCreate(
  organizationId: string,
  backtestRunId: string,
  evaluation: BacktestEvaluationResult,
) {
  const foldCount =
    evaluation.metrics && 'foldCount' in evaluation.metrics
      ? evaluation.metrics.foldCount
      : evaluation.foldRecords.length;

  return {
    organization: { connect: { id: organizationId } },
    backtestRun: { connect: { id: backtestRunId } },
    modelFamily: evaluation.modelFamily,
    modelKey: evaluation.modelKey,
    modelVersion: evaluation.modelVersion,
    horizonDays: evaluation.horizonDays,
    scopeMode: evaluation.scopeMode === 'GLOBAL_SEGMENT' ? 'GLOBAL_SEGMENT' : 'ORG_SPECIFIC',
    scopeKey: evaluation.scopeKey,
    status: evaluation.status,
    metrics: evaluation.metrics ?? {},
    baselineMetrics: evaluation.baselineMetrics ?? {},
    releaseGates: evaluation.gates,
    gatesPassed: evaluation.gatesPassed,
    foldCount,
    evaluatedAt: new Date(evaluation.evaluatedAt),
  };
}
