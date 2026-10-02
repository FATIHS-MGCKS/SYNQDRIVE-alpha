import type { Exp021MaturationShadowM3AnalysisResult } from './reference-capture-exp021-maturation-shadow-m3.types';

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeysDeep(record[key]);
    }
    return sorted;
  }
  return value;
}

export function serializeM3AnalysisJson(
  analysis: Exp021MaturationShadowM3AnalysisResult,
  options: { deterministicGeneratedAt?: string } = {},
): string {
  const payload = {
    ...analysis,
    generatedAt: options.deterministicGeneratedAt ?? analysis.generatedAt,
  };
  return `${JSON.stringify(sortKeysDeep(payload), null, 2)}\n`;
}

function csvEscape(value: unknown): string {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function serializeM3TransitionsCsv(analysis: Exp021MaturationShadowM3AnalysisResult): string {
  const headers = [
    'windowFamilyId',
    'windowStratumId',
    'eligible',
    'exclusionReasons',
    'signalLane',
    'queryGeometryMs',
    'activityClass',
    'semanticCohortId',
    'lastNegativeAgeMs',
    'firstPositiveAgeMs',
    'firstNonZeroActualAgeMs',
    'lowerBoundExclusiveMs',
    'upperBoundInclusiveMs',
    'censoringClass',
    'providerErrorAgesMs',
  ];

  const rows = analysis.stratumAnalyses
    .map((s) => ({
      transition: s.availabilityTransition,
      eligible: s.eligible,
      exclusionReasons: s.exclusions.map((e) => e.reason),
    }))
    .sort((a, b) => {
      const familyCmp = a.transition.windowFamilyId.localeCompare(b.transition.windowFamilyId);
      if (familyCmp !== 0) return familyCmp;
      const laneCmp = a.transition.signalLane.localeCompare(b.transition.signalLane);
      if (laneCmp !== 0) return laneCmp;
      return a.transition.queryGeometryMs - b.transition.queryGeometryMs;
    })
    .map(({ transition: t, eligible, exclusionReasons }) =>
      [
        t.windowFamilyId,
        t.windowStratumId,
        eligible,
        JSON.stringify(exclusionReasons),
        t.signalLane,
        t.queryGeometryMs,
        t.activityClass,
        t.semanticCohortId,
        t.lastNegativeAgeMs,
        t.firstPositiveAgeMs,
        t.firstNonZeroActualAgeMs,
        t.lowerBoundExclusiveMs,
        t.upperBoundInclusiveMs,
        t.censoringClass,
        JSON.stringify(t.providerErrorAgesMs),
      ].map(csvEscape).join(','),
    );

  return `${headers.join(',')}\n${rows.join('\n')}\n`;
}

export function serializeM3EligibilityExclusionsCsv(analysis: Exp021MaturationShadowM3AnalysisResult): string {
  const headers = ['scope', 'id', 'reason'];
  const rows = analysis.eligibilityExclusions
    .sort((a, b) => {
      const scopeCmp = a.scope.localeCompare(b.scope);
      if (scopeCmp !== 0) return scopeCmp;
      return a.id.localeCompare(b.id);
    })
    .map((e) => [e.scope, e.id, e.reason].map(csvEscape).join(','));
  return `${headers.join(',')}\n${rows.join('\n')}\n`;
}

export function serializeM3PlannedAgeSummariesCsv(analysis: Exp021MaturationShadowM3AnalysisResult): string {
  const headers = [
    'summaryType',
    'signalLane',
    'queryGeometryMs',
    'activityClass',
    'semanticCohortId',
    'plannedAgeMs',
    'nWindowFamilies',
    'nLogicalSlots',
    'nProviderSuccessObservations',
    'nProviderErrors',
    'nSuccessfulZero',
    'nSuccessfulNonZero',
    'availabilityNumerator',
    'availabilityDenominator',
    'wilson95Lower',
    'wilson95Upper',
    'coverageMedian',
    'coverageP25',
    'coverageP75',
    'actualAgeMedian',
    'actualAgeP25',
    'actualAgeP75',
    'actualAgeMin',
    'actualAgeMax',
    'schedulerDriftMedian',
    'schedulerDriftP25',
    'schedulerDriftP75',
    'schedulerDriftMin',
    'schedulerDriftMax',
  ];

  const rows = analysis.plannedAgeStratumSummaries.map((s) =>
    [
      s.summaryType,
      s.signalLane,
      s.queryGeometryMs,
      s.activityClass,
      s.semanticCohortId,
      s.plannedAgeMs,
      s.nWindowFamilies,
      s.nLogicalSlots,
      s.nProviderSuccessObservations,
      s.nProviderErrors,
      s.nSuccessfulZero,
      s.nSuccessfulNonZero,
      s.availabilityAmongProviderSuccesses.numerator,
      s.availabilityAmongProviderSuccesses.denominator,
      s.availabilityAmongProviderSuccesses.wilson95Lower,
      s.availabilityAmongProviderSuccesses.wilson95Upper,
      s.bucketLocusCoverageRatio.median,
      s.bucketLocusCoverageRatio.p25,
      s.bucketLocusCoverageRatio.p75,
      s.actualAgeMsDistribution.median,
      s.actualAgeMsDistribution.p25,
      s.actualAgeMsDistribution.p75,
      s.actualAgeMsDistribution.min,
      s.actualAgeMsDistribution.max,
      s.schedulerDriftMsDistribution.median,
      s.schedulerDriftMsDistribution.p25,
      s.schedulerDriftMsDistribution.p75,
      s.schedulerDriftMsDistribution.min,
      s.schedulerDriftMsDistribution.max,
    ].map(csvEscape).join(','),
  );

  return `${headers.join(',')}\n${rows.join('\n')}\n`;
}

export function serializeM3PairedGeometryCsv(analysis: Exp021MaturationShadowM3AnalysisResult): string {
  const headers = [
    'windowFamilyId',
    'signalLane',
    'firstNonZeroActualAgeMs60',
    'firstNonZeroActualAgeMs90',
    'censoringClass60',
    'censoringClass90',
    'lowerBoundExclusiveMs60',
    'upperBoundInclusiveMs60',
    'lowerBoundExclusiveMs90',
    'upperBoundInclusiveMs90',
  ];

  const rows = analysis.pairedGeometryObservations
    .sort((a, b) => {
      const familyCmp = a.windowFamilyId.localeCompare(b.windowFamilyId);
      if (familyCmp !== 0) return familyCmp;
      return a.signalLane.localeCompare(b.signalLane);
    })
    .map((p) =>
      [
        p.windowFamilyId,
        p.signalLane,
        p.firstNonZeroActualAgeMs60,
        p.firstNonZeroActualAgeMs90,
        p.transition60.censoringClass,
        p.transition90.censoringClass,
        p.transition60.lowerBoundExclusiveMs,
        p.transition60.upperBoundInclusiveMs,
        p.transition90.lowerBoundExclusiveMs,
        p.transition90.upperBoundInclusiveMs,
      ].map(csvEscape).join(','),
    );

  return `${headers.join(',')}\n${rows.join('\n')}\n`;
}
