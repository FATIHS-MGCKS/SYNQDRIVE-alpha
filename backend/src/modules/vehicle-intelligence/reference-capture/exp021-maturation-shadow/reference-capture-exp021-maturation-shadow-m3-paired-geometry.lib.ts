import { medianP25P75 } from './reference-capture-exp021-maturation-shadow-m3-statistics.lib';
import type {
  Exp021MaturationShadowM3PairedGeometryObservation,
  Exp021MaturationShadowM3StratumAnalysis,
} from './reference-capture-exp021-maturation-shadow-m3.types';

export function buildPairedGeometryObservations(
  familyId: string,
  stratumAnalyses: Exp021MaturationShadowM3StratumAnalysis[],
): Exp021MaturationShadowM3PairedGeometryObservation[] {
  const byLane = new Map<string, Exp021MaturationShadowM3StratumAnalysis[]>();
  for (const analysis of stratumAnalyses) {
    if (!analysis.eligible) continue;
    const key = analysis.signalLane;
    const bucket = byLane.get(key) ?? [];
    bucket.push(analysis);
    byLane.set(key, bucket);
  }

  const paired: Exp021MaturationShadowM3PairedGeometryObservation[] = [];

  for (const [signalLane, analyses] of byLane.entries()) {
    const s60 = analyses.find((a) => a.queryGeometryMs === 60_000);
    const s90 = analyses.find((a) => a.queryGeometryMs === 90_000);
    if (!s60 || !s90) continue;

    const drift60 = s60.schedulerDriftByPlannedAge.flatMap((r) => r.schedulerDriftMsValues);
    const drift90 = s90.schedulerDriftByPlannedAge.flatMap((r) => r.schedulerDriftMsValues);

    paired.push({
      windowFamilyId: familyId,
      signalLane: signalLane as Exp021MaturationShadowM3PairedGeometryObservation['signalLane'],
      semanticCohortId60: s60.semanticCohortId,
      semanticCohortId90: s90.semanticCohortId,
      activityClass60: s60.activityClass,
      activityClass90: s90.activityClass,
      firstNonZeroActualAgeMs60: s60.availabilityTransition.firstNonZeroActualAgeMs,
      firstNonZeroActualAgeMs90: s90.availabilityTransition.firstNonZeroActualAgeMs,
      transition60: {
        censoringClass: s60.availabilityTransition.censoringClass,
        lowerBoundExclusiveMs: s60.availabilityTransition.lowerBoundExclusiveMs,
        upperBoundInclusiveMs: s60.availabilityTransition.upperBoundInclusiveMs,
        providerErrorAgesMs: s60.availabilityTransition.providerErrorAgesMs,
      },
      transition90: {
        censoringClass: s90.availabilityTransition.censoringClass,
        lowerBoundExclusiveMs: s90.availabilityTransition.lowerBoundExclusiveMs,
        upperBoundInclusiveMs: s90.availabilityTransition.upperBoundInclusiveMs,
        providerErrorAgesMs: s90.availabilityTransition.providerErrorAgesMs,
      },
      coverageByActualAgeMs60: s60.maturationObservations.map((o) => ({
        actualAgeMs: o.actualAgeMs,
        coverageRatio: o.bucketLocusCoverageRatioVsFinalObservedUnion,
      })),
      coverageByActualAgeMs90: s90.maturationObservations.map((o) => ({
        actualAgeMs: o.actualAgeMs,
        coverageRatio: o.bucketLocusCoverageRatioVsFinalObservedUnion,
      })),
      schedulerDriftSummary60: (() => {
        const stats = medianP25P75(drift60);
        return { medianMs: stats.median, p25Ms: stats.p25, p75Ms: stats.p75 };
      })(),
      schedulerDriftSummary90: (() => {
        const stats = medianP25P75(drift90);
        return { medianMs: stats.median, p25Ms: stats.p25, p75Ms: stats.p75 };
      })(),
    });
  }

  return paired.sort((a, b) => a.signalLane.localeCompare(b.signalLane));
}
