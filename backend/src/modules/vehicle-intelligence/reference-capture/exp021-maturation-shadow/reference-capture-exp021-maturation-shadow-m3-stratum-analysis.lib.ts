import { FINAL_SHADOW_OBSERVED_UNION_LABEL } from './reference-capture-exp021-maturation-shadow-m3.constants';
import {
  isNegativeAvailabilitySuccess,
  isProviderErrorAttempt,
  isProviderSuccessAttempt,
  sortAttemptsByActualAge,
} from './reference-capture-exp021-maturation-shadow-m3-attempt-selection.lib';
import {
  dedupeBucketLoci,
  groupBucketLociByField,
  reconstructBucketLociFromAttempt,
} from './reference-capture-exp021-maturation-shadow-m3-bucket-locus.lib';
import {
  buildSemanticCohortId,
  isStratumEligible,
  resolveActivityClassFromJson,
} from './reference-capture-exp021-maturation-shadow-m3-eligibility.lib';
import { medianP25P75, minMax } from './reference-capture-exp021-maturation-shadow-m3-statistics.lib';
import type {
  Exp021MaturationShadowM3AvailabilityTransition,
  Exp021MaturationShadowM3CensoringClass,
  Exp021MaturationShadowM3FamilyInput,
  Exp021MaturationShadowM3MaturationObservation,
  Exp021MaturationShadowM3StratumAnalysis,
  Exp021MaturationShadowM3StratumInput,
} from './reference-capture-exp021-maturation-shadow-m3.types';

function unionLoci(existing: Set<string>, loci: string[]): Set<string> {
  const next = new Set(existing);
  for (const locus of loci) next.add(locus);
  return next;
}

function deriveAvailabilityTransition(input: {
  familyId: string;
  stratum: Exp021MaturationShadowM3StratumInput;
  sortedSuccesses: Array<{ attemptId: string; actualAgeMs: number; uniqueCount: number; isError: boolean }>;
  providerErrorAgesMs: number[];
}): Exp021MaturationShadowM3AvailabilityTransition {
  const { stratum, sortedSuccesses, providerErrorAgesMs } = input;
  const activityClass = resolveActivityClassFromJson(stratum.activityClassificationJson);
  const semanticCohortId = buildSemanticCohortId(stratum);

  let lastNegativeAgeMs: number | null = null;
  let firstPositiveAgeMs: number | null = null;
  let firstNonZeroActualAgeMs: number | null = null;

  for (const obs of sortedSuccesses) {
    if (obs.isError) continue;
    if (obs.uniqueCount === 0) {
      lastNegativeAgeMs = obs.actualAgeMs;
    } else if (obs.uniqueCount > 0) {
      if (firstPositiveAgeMs == null) firstPositiveAgeMs = obs.actualAgeMs;
      if (firstNonZeroActualAgeMs == null) firstNonZeroActualAgeMs = obs.actualAgeMs;
    }
  }

  let censoringClass: Exp021MaturationShadowM3CensoringClass;
  let lowerBoundExclusiveMs: number | null = null;
  let upperBoundInclusiveMs: number | null = null;

  const hasProviderSuccess = sortedSuccesses.some((o) => !o.isError);
  if (!hasProviderSuccess) {
    censoringClass = 'NO_VALID_PROVIDER_EVIDENCE';
  } else if (lastNegativeAgeMs != null && firstPositiveAgeMs != null) {
    censoringClass = 'INTERVAL_CENSORED';
    lowerBoundExclusiveMs = lastNegativeAgeMs;
    upperBoundInclusiveMs = firstPositiveAgeMs;
  } else if (lastNegativeAgeMs == null && firstPositiveAgeMs != null) {
    censoringClass = 'LEFT_CENSORED';
    upperBoundInclusiveMs = firstPositiveAgeMs;
  } else if (lastNegativeAgeMs != null && firstPositiveAgeMs == null) {
    censoringClass = 'RIGHT_CENSORED';
    lowerBoundExclusiveMs = lastNegativeAgeMs;
  } else {
    censoringClass = 'NO_VALID_PROVIDER_EVIDENCE';
  }

  return {
    windowFamilyId: input.familyId,
    windowStratumId: stratum.id,
    signalLane: stratum.signalLane,
    queryGeometryMs: stratum.queryGeometryMs,
    activityClass,
    semanticCohortId,
    lastNegativeAgeMs,
    firstPositiveAgeMs,
    firstNonZeroActualAgeMs,
    lowerBoundExclusiveMs,
    upperBoundInclusiveMs,
    censoringClass,
    providerErrorAgesMs: [...providerErrorAgesMs].sort((a, b) => a - b),
  };
}

export function analyzeStratum(
  family: Exp021MaturationShadowM3FamilyInput,
  stratum: Exp021MaturationShadowM3StratumInput,
): Exp021MaturationShadowM3StratumAnalysis {
  const { eligible, exclusions } = isStratumEligible(family, stratum);
  const activityClass = resolveActivityClassFromJson(stratum.activityClassificationJson);
  const semanticCohortId = buildSemanticCohortId(stratum);

  const sortedAttempts = sortAttemptsByActualAge(stratum.attempts);
  const providerErrorAgesMs: number[] = [];
  let providerAttempts = 0;
  let providerSuccesses = 0;
  let providerErrors = 0;
  let successfulZeroObservations = 0;
  let successfulNonZeroObservations = 0;
  const providerErrorClassDistribution: Record<string, number> = {};
  const providerStatusDistribution: Record<string, number> = {};

  let finalUnion = new Set<string>();
  const perFieldFinalUnion: Record<string, Set<string>> = {};

  const successObservationsForAvailability: Array<{
    attemptId: string;
    actualAgeMs: number;
    uniqueCount: number;
    isError: boolean;
  }> = [];

  const maturationObservations: Exp021MaturationShadowM3MaturationObservation[] = [];
  let cumulativeUnion = new Set<string>();

  for (const attempt of sortedAttempts) {
    providerAttempts += 1;
    const statusKey = attempt.providerStatus ?? 'UNKNOWN';
    providerStatusDistribution[statusKey] = (providerStatusDistribution[statusKey] ?? 0) + 1;

    if (isProviderErrorAttempt(attempt)) {
      providerErrors += 1;
      providerErrorAgesMs.push(attempt.actualAgeMs);
      const errClass = attempt.providerErrorClass ?? 'UNKNOWN_ERROR';
      providerErrorClassDistribution[errClass] = (providerErrorClassDistribution[errClass] ?? 0) + 1;
      successObservationsForAvailability.push({
        attemptId: attempt.id,
        actualAgeMs: attempt.actualAgeMs,
        uniqueCount: 0,
        isError: true,
      });
      continue;
    }

    providerSuccesses += 1;
    const reconstruction = reconstructBucketLociFromAttempt({
      bucketLocusManifestJson: attempt.bucketLocusManifestJson,
      bucketLocusIdentityVersion: attempt.bucketLocusIdentityVersion,
      uniqueBucketLocusCount: attempt.uniqueBucketLocusCount,
    });
    const uniqueCount = reconstruction.uniqueCount;

    if (isNegativeAvailabilitySuccess(attempt) || uniqueCount === 0) {
      successfulZeroObservations += 1;
    } else {
      successfulNonZeroObservations += 1;
    }

    successObservationsForAvailability.push({
      attemptId: attempt.id,
      actualAgeMs: attempt.actualAgeMs,
      uniqueCount,
      isError: false,
    });

    finalUnion = unionLoci(finalUnion, reconstruction.loci);
    const byField = groupBucketLociByField(reconstruction.loci);
    for (const [field, loci] of Object.entries(byField)) {
      perFieldFinalUnion[field] = unionLoci(perFieldFinalUnion[field] ?? new Set(), loci);
    }
  }

  const finalShadowObservedUnionLoci = dedupeBucketLoci([...finalUnion]);
  const finalShadowObservedUnionCount = finalShadowObservedUnionLoci.length;
  const perFieldFinalObservedUnion: Record<string, string[]> = {};
  for (const [field, set] of Object.entries(perFieldFinalUnion)) {
    perFieldFinalObservedUnion[field] = dedupeBucketLoci([...set]);
  }

  cumulativeUnion = new Set<string>();
  for (const attempt of sortedAttempts) {
    if (!isProviderSuccessAttempt(attempt)) continue;

    const reconstruction = reconstructBucketLociFromAttempt({
      bucketLocusManifestJson: attempt.bucketLocusManifestJson,
      bucketLocusIdentityVersion: attempt.bucketLocusIdentityVersion,
      uniqueBucketLocusCount: attempt.uniqueBucketLocusCount,
    });

    const priorUnion = new Set(cumulativeUnion);
    const newLoci = reconstruction.loci.filter((l) => !priorUnion.has(l));
    cumulativeUnion = unionLoci(cumulativeUnion, reconstruction.loci);

    const coverageRatio =
      finalShadowObservedUnionCount === 0
        ? null
        : cumulativeUnion.size / finalShadowObservedUnionCount;

    maturationObservations.push({
      attemptId: attempt.id,
      plannedAgeMs: attempt.plannedAgeMs,
      actualAgeMs: attempt.actualAgeMs,
      schedulerDriftMs: attempt.schedulerDriftMs,
      providerOutcomeClass: attempt.providerOutcomeClass,
      reconstructedUniqueBucketLocusCount: reconstruction.uniqueCount,
      newBucketLociVsPriorAge: newLoci.length,
      cumulativeBucketLocusUnionCount: cumulativeUnion.size,
      bucketLocusCoverageRatioVsFinalObservedUnion: coverageRatio,
      payloadRevisionCount: attempt.payloadRevisionCount,
      changedPayloadLocusCount: attempt.changedPayloadLocusCount,
    });
  }

  const availabilityTransition = deriveAvailabilityTransition({
    familyId: family.id,
    stratum,
    sortedSuccesses: successObservationsForAvailability,
    providerErrorAgesMs,
  });

  const driftByPlanned = new Map<number, { actual: number[]; drift: number[] }>();
  for (const attempt of sortedAttempts) {
    const bucket = driftByPlanned.get(attempt.plannedAgeMs) ?? { actual: [], drift: [] };
    bucket.actual.push(attempt.actualAgeMs);
    bucket.drift.push(attempt.schedulerDriftMs);
    driftByPlanned.set(attempt.plannedAgeMs, bucket);
  }

  const schedulerDriftByPlannedAge = [...driftByPlanned.entries()]
    .sort(([a], [b]) => a - b)
    .map(([plannedAgeMs, values]) => {
      const driftStats = medianP25P75(values.drift);
      const driftRange = minMax(values.drift);
      return {
        plannedAgeMs,
        actualAgeMsValues: [...values.actual].sort((a, b) => a - b),
        schedulerDriftMsValues: [...values.drift].sort((a, b) => a - b),
        medianDriftMs: driftStats.median,
        p25DriftMs: driftStats.p25,
        p75DriftMs: driftStats.p75,
        minDriftMs: driftRange.min,
        maxDriftMs: driftRange.max,
      };
    });

  return {
    windowStratumId: stratum.id,
    windowFamilyId: family.id,
    signalLane: stratum.signalLane,
    queryGeometryMs: stratum.queryGeometryMs,
    activityClass,
    semanticCohortId,
    eligible,
    exclusions,
    finalShadowObservedUnionLabel: FINAL_SHADOW_OBSERVED_UNION_LABEL,
    finalShadowObservedUnionLoci: finalShadowObservedUnionLoci,
    finalShadowObservedUnionCount,
    perFieldFinalObservedUnion,
    maturationObservations,
    availabilityTransition,
    providerQuality: {
      providerAttempts,
      providerSuccesses,
      providerErrors,
      providerErrorRate: providerAttempts > 0 ? providerErrors / providerAttempts : null,
      providerErrorClassDistribution,
      providerStatusDistribution,
      successfulZeroObservations,
      successfulNonZeroObservations,
    },
    schedulerDriftByPlannedAge,
  };
}

export function computePerFieldMaturation(
  stratumAnalysis: Exp021MaturationShadowM3StratumAnalysis,
  stratum: Exp021MaturationShadowM3StratumInput,
): Record<
  string,
  Array<{
    actualAgeMs: number;
    observedLoci: string[];
    newLociVsPrior: number;
    cumulativeFieldUnionCount: number;
    fieldCoverageVsFinalObservedUnion: number | null;
  }>
> {
  const finalByField = stratumAnalysis.perFieldFinalObservedUnion;
  const sortedAttempts = sortAttemptsByActualAge(stratum.attempts).filter(isProviderSuccessAttempt);
  const cumulativeByField: Record<string, Set<string>> = {};
  const result: Record<string, Array<{
    actualAgeMs: number;
    observedLoci: string[];
    newLociVsPrior: number;
    cumulativeFieldUnionCount: number;
    fieldCoverageVsFinalObservedUnion: number | null;
  }>> = {};

  for (const attempt of sortedAttempts) {
    const reconstruction = reconstructBucketLociFromAttempt({
      bucketLocusManifestJson: attempt.bucketLocusManifestJson,
      bucketLocusIdentityVersion: attempt.bucketLocusIdentityVersion,
      uniqueBucketLocusCount: attempt.uniqueBucketLocusCount,
    });
    const byField = groupBucketLociByField(reconstruction.loci);
    for (const [field, loci] of Object.entries(byField)) {
      const prior = cumulativeByField[field] ?? new Set<string>();
      const newLoci = loci.filter((l) => !prior.has(l));
      cumulativeByField[field] = unionLoci(prior, loci);
      const finalCount = (finalByField[field] ?? []).length;
      const row = {
        actualAgeMs: attempt.actualAgeMs,
        observedLoci: loci,
        newLociVsPrior: newLoci.length,
        cumulativeFieldUnionCount: cumulativeByField[field].size,
        fieldCoverageVsFinalObservedUnion: finalCount === 0 ? null : cumulativeByField[field].size / finalCount,
      };
      if (!result[field]) result[field] = [];
      result[field].push(row);
    }
  }

  return result;
}
