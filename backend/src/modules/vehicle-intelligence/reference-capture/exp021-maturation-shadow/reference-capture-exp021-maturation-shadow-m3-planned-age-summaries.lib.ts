import {
  isProviderErrorAttempt,
  isProviderSuccessAttempt,
} from './reference-capture-exp021-maturation-shadow-m3-attempt-selection.lib';
import { medianP25P75, minMax, wilsonScoreInterval } from './reference-capture-exp021-maturation-shadow-m3-statistics.lib';
import type {
  Exp021MaturationShadowM3AttemptInput,
  Exp021MaturationShadowM3PlannedAgeAttemptRecord,
  Exp021MaturationShadowM3PlannedAgeStratumSummary,
  Exp021MaturationShadowM3StratumAnalysis,
} from './reference-capture-exp021-maturation-shadow-m3.types';

type PlannedAgeAccumulator = {
  signalLane: Exp021MaturationShadowM3PlannedAgeStratumSummary['signalLane'];
  queryGeometryMs: Exp021MaturationShadowM3PlannedAgeStratumSummary['queryGeometryMs'];
  activityClass: Exp021MaturationShadowM3PlannedAgeStratumSummary['activityClass'];
  semanticCohortId: string;
  plannedAgeMs: number;
  windowFamilyIds: Set<string>;
  logicalSlotKeys: Set<string>;
  nProviderSuccessObservations: number;
  nProviderErrors: number;
  nSuccessfulZero: number;
  nSuccessfulNonZero: number;
  actualAgeMsValues: number[];
  schedulerDriftMsValues: number[];
  coverageRatios: number[];
};

function groupKey(parts: {
  signalLane: string;
  queryGeometryMs: number;
  activityClass: string;
  semanticCohortId: string;
  plannedAgeMs: number;
}): string {
  return [
    parts.signalLane,
    parts.queryGeometryMs,
    parts.activityClass,
    parts.semanticCohortId,
    parts.plannedAgeMs,
  ].join('|');
}

function finalizeAccumulator(bucket: PlannedAgeAccumulator): Exp021MaturationShadowM3PlannedAgeStratumSummary {
  const wilson = wilsonScoreInterval(bucket.nSuccessfulNonZero, bucket.nProviderSuccessObservations);
  const coverageStats = medianP25P75(bucket.coverageRatios);
  const actualAgeStats = medianP25P75(bucket.actualAgeMsValues);
  const actualAgeRange = minMax(bucket.actualAgeMsValues);
  const driftStats = medianP25P75(bucket.schedulerDriftMsValues);
  const driftRange = minMax(bucket.schedulerDriftMsValues);

  return {
    summaryType: 'PLANNED_AGE_STRATUM',
    signalLane: bucket.signalLane,
    queryGeometryMs: bucket.queryGeometryMs,
    activityClass: bucket.activityClass,
    semanticCohortId: bucket.semanticCohortId,
    plannedAgeMs: bucket.plannedAgeMs,
    nWindowFamilies: bucket.windowFamilyIds.size,
    nLogicalSlots: bucket.logicalSlotKeys.size,
    nProviderSuccessObservations: bucket.nProviderSuccessObservations,
    nProviderErrors: bucket.nProviderErrors,
    nSuccessfulZero: bucket.nSuccessfulZero,
    nSuccessfulNonZero: bucket.nSuccessfulNonZero,
    availabilityAmongProviderSuccesses: {
      numerator: bucket.nSuccessfulNonZero,
      denominator: bucket.nProviderSuccessObservations,
      observedProportion:
        bucket.nProviderSuccessObservations > 0
          ? bucket.nSuccessfulNonZero / bucket.nProviderSuccessObservations
          : null,
      wilson95Lower: wilson?.lower ?? null,
      wilson95Upper: wilson?.upper ?? null,
    },
    bucketLocusCoverageRatio: {
      median: coverageStats.median,
      p25: coverageStats.p25,
      p75: coverageStats.p75,
      sampleCount: bucket.coverageRatios.length,
    },
    actualAgeMsDistribution: {
      median: actualAgeStats.median,
      p25: actualAgeStats.p25,
      p75: actualAgeStats.p75,
      min: actualAgeRange.min,
      max: actualAgeRange.max,
    },
    schedulerDriftMsDistribution: {
      median: driftStats.median,
      p25: driftStats.p25,
      p75: driftStats.p75,
      min: driftRange.min,
      max: driftRange.max,
    },
  };
}

export function buildPlannedAgeStratumSummaries(
  attemptRecords: Exp021MaturationShadowM3PlannedAgeAttemptRecord[],
): Exp021MaturationShadowM3PlannedAgeStratumSummary[] {
  const groups = new Map<string, PlannedAgeAccumulator>();

  for (const record of attemptRecords) {
    const key = groupKey({
      signalLane: record.signalLane,
      queryGeometryMs: record.queryGeometryMs,
      activityClass: record.activityClass,
      semanticCohortId: record.semanticCohortId,
      plannedAgeMs: record.plannedAgeMs,
    });

    const bucket =
      groups.get(key) ??
      ({
        signalLane: record.signalLane,
        queryGeometryMs: record.queryGeometryMs,
        activityClass: record.activityClass,
        semanticCohortId: record.semanticCohortId,
        plannedAgeMs: record.plannedAgeMs,
        windowFamilyIds: new Set<string>(),
        logicalSlotKeys: new Set<string>(),
        nProviderSuccessObservations: 0,
        nProviderErrors: 0,
        nSuccessfulZero: 0,
        nSuccessfulNonZero: 0,
        actualAgeMsValues: [],
        schedulerDriftMsValues: [],
        coverageRatios: [],
      } satisfies PlannedAgeAccumulator);

    bucket.windowFamilyIds.add(record.windowFamilyId);
    bucket.logicalSlotKeys.add(`${record.windowStratumId}|${record.plannedAgeMs}`);

    bucket.actualAgeMsValues.push(record.actualAgeMs);
    bucket.schedulerDriftMsValues.push(record.schedulerDriftMs);

    if (isProviderErrorAttempt(record)) {
      bucket.nProviderErrors += 1;
    } else if (isProviderSuccessAttempt(record)) {
      bucket.nProviderSuccessObservations += 1;
      if (record.reconstructedUniqueBucketLocusCount === 0) {
        bucket.nSuccessfulZero += 1;
      } else {
        bucket.nSuccessfulNonZero += 1;
      }
      if (record.bucketLocusCoverageRatioVsFinalObservedUnion != null) {
        bucket.coverageRatios.push(record.bucketLocusCoverageRatioVsFinalObservedUnion);
      }
    }

    groups.set(key, bucket);
  }

  return [...groups.values()]
    .sort((a, b) => {
      const laneCmp = a.signalLane.localeCompare(b.signalLane);
      if (laneCmp !== 0) return laneCmp;
      if (a.queryGeometryMs !== b.queryGeometryMs) return a.queryGeometryMs - b.queryGeometryMs;
      if (a.activityClass !== b.activityClass) return a.activityClass.localeCompare(b.activityClass);
      if (a.semanticCohortId !== b.semanticCohortId) return a.semanticCohortId.localeCompare(b.semanticCohortId);
      return a.plannedAgeMs - b.plannedAgeMs;
    })
    .map(finalizeAccumulator);
}

export function buildPlannedAgeAttemptRecordsFromAnalyses(
  stratumAnalyses: Exp021MaturationShadowM3StratumAnalysis[],
  attemptsByStratumId: Map<string, Exp021MaturationShadowM3AttemptInput[]>,
  coverageByAttemptId: Map<string, number | null>,
  reconstructedCountByAttemptId: Map<string, number>,
): Exp021MaturationShadowM3PlannedAgeAttemptRecord[] {
  const records: Exp021MaturationShadowM3PlannedAgeAttemptRecord[] = [];

  for (const analysis of stratumAnalyses) {
    if (!analysis.eligible) continue;
    const attempts = attemptsByStratumId.get(analysis.windowStratumId) ?? [];
    for (const attempt of attempts) {
      records.push({
        windowFamilyId: analysis.windowFamilyId,
        windowStratumId: analysis.windowStratumId,
        signalLane: analysis.signalLane,
        queryGeometryMs: analysis.queryGeometryMs,
        activityClass: analysis.activityClass,
        semanticCohortId: analysis.semanticCohortId,
        plannedAgeMs: attempt.plannedAgeMs,
        observationSlotId: attempt.observationSlotId,
        actualAgeMs: attempt.actualAgeMs,
        schedulerDriftMs: attempt.schedulerDriftMs,
        providerRequestSucceeded: attempt.providerRequestSucceeded,
        providerOutcomeClass: attempt.providerOutcomeClass,
        reconstructedUniqueBucketLocusCount: reconstructedCountByAttemptId.get(attempt.id) ?? 0,
        bucketLocusCoverageRatioVsFinalObservedUnion: coverageByAttemptId.get(attempt.id) ?? null,
      });
    }
  }

  return records.sort((a, b) => {
    const familyCmp = a.windowFamilyId.localeCompare(b.windowFamilyId);
    if (familyCmp !== 0) return familyCmp;
    const stratumCmp = a.windowStratumId.localeCompare(b.windowStratumId);
    if (stratumCmp !== 0) return stratumCmp;
    if (a.plannedAgeMs !== b.plannedAgeMs) return a.plannedAgeMs - b.plannedAgeMs;
    return a.actualAgeMs - b.actualAgeMs;
  });
}
