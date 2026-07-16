import type { DrivingAnalysisStageKey, DrivingAnalysisStageStatus } from '@prisma/client';
import { DRIVING_ANALYSIS_STAGE_KEYS } from './driving-analysis-stage.types';

/**
 * Explicit stage dependency graph.
 * Native Events and Route both depend only on Segment Validate — they may run in parallel.
 * Misuse depends only on Event Context (not Route).
 */
export const STAGE_DEPENDENCIES: Record<DrivingAnalysisStageKey, DrivingAnalysisStageKey[]> = {
  SEGMENT_VALIDATE: [],
  NATIVE_EVENTS: ['SEGMENT_VALIDATE'],
  ROUTE: ['SEGMENT_VALIDATE'],
  EVENT_CONTEXT: ['NATIVE_EVENTS'],
  DRIVING_IMPACT: ['NATIVE_EVENTS'],
  MISUSE_RECONCILE: ['EVENT_CONTEXT'],
  ASSESSABILITY: ['SEGMENT_VALIDATE'],
  ATTRIBUTION: ['SEGMENT_VALIDATE'],
  DECISION_SUMMARY: ['ASSESSABILITY', 'DRIVING_IMPACT', 'MISUSE_RECONCILE', 'ATTRIBUTION'],
  HEALTH_IMPACT_PUBLISH: ['DRIVING_IMPACT'],
};

const TERMINAL_STATUSES = new Set<DrivingAnalysisStageStatus>([
  'COMPLETED',
  'FAILED',
  'SKIPPED',
]);

export function isStageTerminal(status: DrivingAnalysisStageStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isDependencySatisfied(
  dependencyStatus: DrivingAnalysisStageStatus,
): boolean {
  return dependencyStatus === 'COMPLETED' || dependencyStatus === 'SKIPPED';
}

export function getStageDependencies(stageKey: DrivingAnalysisStageKey): DrivingAnalysisStageKey[] {
  return STAGE_DEPENDENCIES[stageKey] ?? [];
}

export type StageStatusMap = Map<DrivingAnalysisStageKey, DrivingAnalysisStageStatus>;

export function buildStageStatusMap(
  stages: Array<{ stageKey: DrivingAnalysisStageKey; status: DrivingAnalysisStageStatus }>,
): StageStatusMap {
  const map: StageStatusMap = new Map();
  for (const key of DRIVING_ANALYSIS_STAGE_KEYS) {
    map.set(key, 'PENDING');
  }
  for (const stage of stages) {
    map.set(stage.stageKey, stage.status);
  }
  return map;
}

/**
 * Returns stage keys whose dependencies are satisfied and status is PENDING.
 */
export function resolveReadyStageKeys(statusMap: StageStatusMap): DrivingAnalysisStageKey[] {
  const ready: DrivingAnalysisStageKey[] = [];

  for (const stageKey of DRIVING_ANALYSIS_STAGE_KEYS) {
    const status = statusMap.get(stageKey) ?? 'PENDING';
    if (status !== 'PENDING') continue;

    const deps = getStageDependencies(stageKey);
    const depsMet = deps.every((dep) =>
      isDependencySatisfied(statusMap.get(dep) ?? 'PENDING'),
    );
    if (depsMet) {
      ready.push(stageKey);
    }
  }

  return ready;
}

/** Critical stages — failure blocks the whole run. */
export const CRITICAL_STAGE_KEYS = new Set<DrivingAnalysisStageKey>([
  'SEGMENT_VALIDATE',
  'NATIVE_EVENTS',
]);
