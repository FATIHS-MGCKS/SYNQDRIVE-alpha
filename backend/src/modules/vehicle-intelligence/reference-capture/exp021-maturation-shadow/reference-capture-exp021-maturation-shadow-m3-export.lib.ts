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
    .map((s) => s.availabilityTransition)
    .sort((a, b) => {
      const familyCmp = a.windowFamilyId.localeCompare(b.windowFamilyId);
      if (familyCmp !== 0) return familyCmp;
      const laneCmp = a.signalLane.localeCompare(b.signalLane);
      if (laneCmp !== 0) return laneCmp;
      return a.queryGeometryMs - b.queryGeometryMs;
    })
    .map((t) =>
      [
        t.windowFamilyId,
        t.windowStratumId,
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
