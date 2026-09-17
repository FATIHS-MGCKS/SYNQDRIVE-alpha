import {
  EXP021_MATURATION_SHADOW_M3_EXPORT_SCHEMA_VERSION,
  PRIMARY_SAMPLING_UNIT,
} from './reference-capture-exp021-maturation-shadow-m3.constants';
import {
  detectPrimaryCombinedCohortBlendingBlocked,
  detectSemanticCohortMismatchAcrossStrata,
} from './reference-capture-exp021-maturation-shadow-m3-eligibility.lib';
import { buildPairedGeometryObservations } from './reference-capture-exp021-maturation-shadow-m3-paired-geometry.lib';
import {
  buildPlannedAgeAttemptRecordsFromAnalyses,
  buildPlannedAgeStratumSummaries,
} from './reference-capture-exp021-maturation-shadow-m3-planned-age-summaries.lib';
import { analyzeStratum } from './reference-capture-exp021-maturation-shadow-m3-stratum-analysis.lib';
import { medianP25P75, wilsonScoreInterval } from './reference-capture-exp021-maturation-shadow-m3-statistics.lib';
import type {
  Exp021MaturationShadowM3AggregateCounts,
  Exp021MaturationShadowM3AnalysisResult,
  Exp021MaturationShadowM3AnalysisScope,
  Exp021MaturationShadowM3AttemptInput,
  Exp021MaturationShadowM3DescriptiveSummary,
  Exp021MaturationShadowM3FamilyInput,
} from './reference-capture-exp021-maturation-shadow-m3.types';

function matchesScope(family: Exp021MaturationShadowM3FamilyInput, scope: Exp021MaturationShadowM3AnalysisScope): boolean {
  if (scope.organizationId && family.organizationId !== scope.organizationId) return false;
  if (scope.vehicleId && family.vehicleId !== scope.vehicleId) return false;
  if (scope.tokenId != null && family.tokenId !== scope.tokenId) return false;
  if (scope.windowFamilyId && family.id !== scope.windowFamilyId) return false;
  if (scope.canonicalWindowToFrom && family.canonicalWindowTo < scope.canonicalWindowToFrom) return false;
  if (scope.canonicalWindowToTo && family.canonicalWindowTo > scope.canonicalWindowToTo) return false;
  return true;
}

function aggregateCountsFromStrata(
  stratumAnalyses: ReturnType<typeof analyzeStratum>[],
): Exp021MaturationShadowM3AggregateCounts {
  const eligibleAnalyses = stratumAnalyses.filter((s) => s.eligible);
  const eligibleFamilyIds = new Set(eligibleAnalyses.map((s) => s.windowFamilyId));

  let nValidProviderSuccessObservations = 0;
  let nProviderErrors = 0;
  let nSuccessfulZeroObservations = 0;
  let nSuccessfulNonZeroObservations = 0;

  for (const analysis of eligibleAnalyses) {
    nValidProviderSuccessObservations += analysis.providerQuality.providerSuccesses;
    nProviderErrors += analysis.providerQuality.providerErrors;
    nSuccessfulZeroObservations += analysis.providerQuality.successfulZeroObservations;
    nSuccessfulNonZeroObservations += analysis.providerQuality.successfulNonZeroObservations;
  }

  return {
    primarySamplingUnit: PRIMARY_SAMPLING_UNIT,
    nWindowFamilies: eligibleFamilyIds.size,
    nStrata: eligibleAnalyses.length,
    nValidProviderSuccessObservations,
    nProviderErrors,
    nSuccessfulZeroObservations,
    nSuccessfulNonZeroObservations,
  };
}

function diagnosticDescriptiveForStratum(
  analysis: ReturnType<typeof analyzeStratum>,
): Exp021MaturationShadowM3DescriptiveSummary {
  const denominator = analysis.providerQuality.providerSuccesses;
  const numerator = analysis.providerQuality.successfulNonZeroObservations;
  const wilson = wilsonScoreInterval(numerator, denominator);
  const coverageRatios = analysis.maturationObservations
    .map((o) => o.bucketLocusCoverageRatioVsFinalObservedUnion)
    .filter((v): v is number => v != null);
  const coverageStats = medianP25P75(coverageRatios);

  return {
    availabilityAmongProviderSuccesses: {
      numerator,
      denominator,
      observedProportion: denominator > 0 ? numerator / denominator : null,
      wilson95Lower: wilson?.lower ?? null,
      wilson95Upper: wilson?.upper ?? null,
    },
    bucketLocusCoverageRatio: {
      median: coverageStats.median,
      p25: coverageStats.p25,
      p75: coverageStats.p75,
      sampleCount: coverageRatios.length,
    },
  };
}

function buildAttemptsByStratumId(
  families: Exp021MaturationShadowM3FamilyInput[],
): Map<string, Exp021MaturationShadowM3AttemptInput[]> {
  const map = new Map<string, Exp021MaturationShadowM3AttemptInput[]>();
  for (const family of families) {
    for (const stratum of family.strata) {
      map.set(stratum.id, stratum.attempts);
    }
  }
  return map;
}

export function analyzeExp021MaturationShadowM3(input: {
  families: Exp021MaturationShadowM3FamilyInput[];
  scope: Exp021MaturationShadowM3AnalysisScope;
  allowSemanticCohortBlending?: boolean;
}): Exp021MaturationShadowM3AnalysisResult {
  const scopedFamilies = input.families
    .filter((family) => matchesScope(family, input.scope))
    .sort((a, b) => a.id.localeCompare(b.id));

  const allStrata = scopedFamilies.flatMap((family) =>
    family.strata
      .filter((stratum) => {
        if (input.scope.signalLane && stratum.signalLane !== input.scope.signalLane) return false;
        if (input.scope.queryGeometryMs && stratum.queryGeometryMs !== input.scope.queryGeometryMs) return false;
        return true;
      })
      .map((stratum) => ({ family, stratum })),
  );

  const cohortCheck = detectSemanticCohortMismatchAcrossStrata(allStrata.map((s) => s.stratum));
  const combinedCohortCheck = detectPrimaryCombinedCohortBlendingBlocked(allStrata.map((s) => s.stratum));
  const semanticBlocked =
    (cohortCheck.mismatch || combinedCohortCheck.blocked) && !input.allowSemanticCohortBlending;

  const stratumAnalyses = scopedFamilies
    .flatMap((family) =>
      family.strata
        .filter((stratum) => {
          if (input.scope.signalLane && stratum.signalLane !== input.scope.signalLane) return false;
          if (input.scope.queryGeometryMs && stratum.queryGeometryMs !== input.scope.queryGeometryMs) return false;
          if (input.scope.activityClass) {
            const activity = stratum.activityClassificationJson as { class?: string } | null;
            const cls = activity?.class ?? 'UNKNOWN_ACTIVITY';
            if (cls !== input.scope.activityClass) return false;
          }
          return true;
        })
        .map((stratum) => analyzeStratum(family, stratum)),
    )
    .sort((a, b) => a.windowStratumId.localeCompare(b.windowStratumId));

  const eligibilityExclusions = stratumAnalyses.flatMap((s) => s.exclusions);

  const pairedGeometryObservations = scopedFamilies.flatMap((family) => {
    const familyAnalyses = stratumAnalyses.filter((s) => s.windowFamilyId === family.id && s.eligible);
    return buildPairedGeometryObservations(family.id, familyAnalyses);
  });

  const aggregateCounts = aggregateCountsFromStrata(stratumAnalyses);

  const coverageByAttemptId = new Map<string, number | null>();
  const reconstructedCountByAttemptId = new Map<string, number>();
  for (const analysis of stratumAnalyses) {
    for (const observation of analysis.maturationObservations) {
      coverageByAttemptId.set(observation.attemptId, observation.bucketLocusCoverageRatioVsFinalObservedUnion);
      reconstructedCountByAttemptId.set(observation.attemptId, observation.reconstructedUniqueBucketLocusCount);
    }
  }

  const plannedAgeAttemptRecords = buildPlannedAgeAttemptRecordsFromAnalyses(
    stratumAnalyses,
    buildAttemptsByStratumId(scopedFamilies),
    coverageByAttemptId,
    reconstructedCountByAttemptId,
  );
  const plannedAgeStratumSummaries = buildPlannedAgeStratumSummaries(plannedAgeAttemptRecords);

  const diagnosticDescriptiveByStratum: Exp021MaturationShadowM3AnalysisResult['diagnosticDescriptiveByStratum'] = {};
  for (const analysis of stratumAnalyses) {
    if (!analysis.eligible) continue;
    diagnosticDescriptiveByStratum[analysis.windowStratumId] = {
      ...diagnosticDescriptiveForStratum(analysis),
      perStratumN: {
        primarySamplingUnit: PRIMARY_SAMPLING_UNIT,
        nWindowFamilies: 1,
        nStrata: 1,
        nValidProviderSuccessObservations: analysis.providerQuality.providerSuccesses,
        nProviderErrors: analysis.providerQuality.providerErrors,
        nSuccessfulZeroObservations: analysis.providerQuality.successfulZeroObservations,
        nSuccessfulNonZeroObservations: analysis.providerQuality.successfulNonZeroObservations,
      },
    };
  }

  return {
    exportSchemaVersion: EXP021_MATURATION_SHADOW_M3_EXPORT_SCHEMA_VERSION,
    generatedAt: new Date(0).toISOString(),
    scope: input.scope,
    aggregateCounts,
    eligibilityExclusions,
    stratumAnalyses,
    pairedGeometryObservations,
    plannedAgeStratumSummaries,
    diagnosticDescriptiveByStratum,
    semanticCohortMismatchBlocked: semanticBlocked,
    semanticCohortMismatchReason: semanticBlocked
      ? (cohortCheck.reason ?? combinedCohortCheck.reason)
      : null,
  };
}
