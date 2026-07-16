import type { DrivingAnalysisStageKey, DrivingAnalysisStageStatus } from '@prisma/client';
import { CRITICAL_STAGE_KEYS } from './driving-analysis-stage.dependencies';
import { DRIVING_ANALYSIS_STAGE_KEYS, type DerivedRunAnalysisResult } from './driving-analysis-stage.types';

const TERMINAL = new Set<DrivingAnalysisStageStatus>(['COMPLETED', 'FAILED', 'SKIPPED']);

/**
 * Derives global analysis run status from per-stage statuses.
 * Partial results are preserved when some stages are terminal and others pending.
 */
export function deriveRunAnalysisStatus(
  stages: Array<{ stageKey: DrivingAnalysisStageKey; status: DrivingAnalysisStageStatus }>,
): DerivedRunAnalysisResult {
  const stageSummary: Record<string, DrivingAnalysisStageStatus> = {};
  let completedStageCount = 0;
  let terminalStageCount = 0;
  let failedStageCount = 0;
  let pendingOrInProgress = 0;

  for (const key of DRIVING_ANALYSIS_STAGE_KEYS) {
    const row = stages.find((s) => s.stageKey === key);
    const status = row?.status ?? 'PENDING';
    stageSummary[key] = status;

    if (status === 'COMPLETED' || status === 'SKIPPED') {
      completedStageCount += 1;
    }
    if (TERMINAL.has(status)) {
      terminalStageCount += 1;
    }
    if (status === 'FAILED') {
      failedStageCount += 1;
    }
    if (status === 'PENDING' || status === 'IN_PROGRESS') {
      pendingOrInProgress += 1;
    }
  }

  const hasCriticalFailure = stages.some(
    (s) => CRITICAL_STAGE_KEYS.has(s.stageKey) && s.status === 'FAILED',
  );

  let status: DerivedRunAnalysisResult['status'];
  if (hasCriticalFailure) {
    status = 'FAILED';
  } else if (terminalStageCount === DRIVING_ANALYSIS_STAGE_KEYS.length) {
    status = 'COMPLETED';
  } else if (completedStageCount > 0 && pendingOrInProgress > 0) {
    status = 'PARTIAL';
  } else if (pendingOrInProgress > 0) {
    status = 'IN_PROGRESS';
  } else if (failedStageCount > 0) {
    status = 'FAILED';
  } else {
    status = 'PENDING';
  }

  return {
    status,
    stageSummary,
    completedStageCount,
    terminalStageCount,
    failedStageCount,
  };
}
