import { EXP021_MANDATORY_AGES_MS } from './reference-capture-settlement-shadow.policy';
import {
  BucketValueSnapshots,
  compareValueSnapshots,
  hashBucketValueContent,
} from './reference-capture-settlement-shadow-value-snapshot';

export type CrossAgeObservationInput = {
  probeId: string;
  probeType: 'FIXED_INTERVAL' | 'WHOLE_TRIP';
  phase: string | null;
  scheduledAgeMs: number;
  providerRequestStatus: string;
  rawRowCount: number;
  uniqueBucketIdentities: string[];
  bucketValueSnapshots?: BucketValueSnapshots | null;
  valueContentHash?: string | null;
};

export type ProbeCrossAgeReport = {
  probeId: string;
  firstSuccessfulQueryAgeMs: number | null;
  canonicalBucketCountAtFirstSuccess: number | null;
  lastBucketAdditionAgeMs: number | null;
  bucketSetStableFromAgeMs: number | null;
  valueSetStableFromAgeMs: number | null;
  lastValueRevisionAgeMs: number | null;
  lateBucketCount: number;
  revisedValueCount: number;
  missingLaterBucketCount: number;
  queryFailureAgesMs: number[];
  zeroResultAgesMs: number[];
  bucketClassifications: Array<
    | 'BUCKET_ADDED_LATE'
    | 'BUCKET_STABLE_FROM_FIRST_SEEN'
    | 'VALUE_STABLE_FROM_FIRST_SEEN'
    | 'VALUE_REVISED'
    | 'BUCKET_MISSING_AT_LATER_AGE'
    | 'QUERY_FAILURE'
    | 'ZERO_RESULT'
    | 'NOT_COMPARABLE'
  >;
};

export type GlobalCrossAgeSummary = {
  allProbesBucketStableBy30: 'YES' | 'NO' | 'UNKNOWN';
  allProbesBucketStableBy60: 'YES' | 'NO' | 'UNKNOWN';
  allProbesValueStableBy30: 'YES' | 'NO' | 'UNKNOWN';
  allProbesValueStableBy60: 'YES' | 'NO' | 'UNKNOWN';
};

function isSuccessful(obs: CrossAgeObservationInput): boolean {
  return obs.rawRowCount > 0 && obs.providerRequestStatus === 'SUCCESS';
}

function isZeroResult(obs: CrossAgeObservationInput): boolean {
  return obs.rawRowCount === 0 || obs.providerRequestStatus === 'ZERO_RESULT';
}

function isQueryFailure(obs: CrossAgeObservationInput): boolean {
  return !isSuccessful(obs) && !isZeroResult(obs);
}

export function analyzeProbeCrossAge(observations: CrossAgeObservationInput[]): ProbeCrossAgeReport {
  const sorted = [...observations].sort((a, b) => a.scheduledAgeMs - b.scheduledAgeMs);
  const probeId = sorted[0]?.probeId ?? 'unknown';

  const queryFailureAgesMs = sorted.filter(isQueryFailure).map((o) => o.scheduledAgeMs);
  const zeroResultAgesMs = sorted.filter(isZeroResult).map((o) => o.scheduledAgeMs);
  const successes = sorted.filter(isSuccessful);

  const firstSuccess = successes[0] ?? null;
  const firstSuccessfulQueryAgeMs = firstSuccess?.scheduledAgeMs ?? null;
  const canonicalBucketCountAtFirstSuccess = firstSuccess
    ? firstSuccess.uniqueBucketIdentities.length
    : null;

  let lastBucketAdditionAgeMs: number | null = null;
  let bucketSetStableFromAgeMs: number | null = null;
  let valueSetStableFromAgeMs: number | null = null;
  let lastValueRevisionAgeMs: number | null = null;
  let lateBucketCount = 0;
  let revisedValueCount = 0;
  let missingLaterBucketCount = 0;

  const bucketClassifications: ProbeCrossAgeReport['bucketClassifications'] = [];
  let priorIdentitySet: string[] = [];
  let priorSnapshots: BucketValueSnapshots = {};

  for (const obs of successes) {
    const identityCmp = compareIdentitySets(obs.uniqueBucketIdentities, priorIdentitySet);
    const isFirstSuccess = priorIdentitySet.length === 0;
    if (identityCmp.added.length > 0 && !isFirstSuccess) {
      lastBucketAdditionAgeMs = obs.scheduledAgeMs;
      lateBucketCount += identityCmp.added.length;
      bucketClassifications.push('BUCKET_ADDED_LATE');
    } else if (identityCmp.added.length > 0 && isFirstSuccess) {
      lastBucketAdditionAgeMs = obs.scheduledAgeMs;
    }
    if (identityCmp.removed.length > 0) {
      missingLaterBucketCount += identityCmp.removed.length;
      bucketClassifications.push('BUCKET_MISSING_AT_LATER_AGE');
    }
    if (
      bucketSetStableFromAgeMs == null &&
      priorIdentitySet.length > 0 &&
      identityCmp.added.length === 0 &&
      identityCmp.removed.length === 0
    ) {
      bucketSetStableFromAgeMs = obs.scheduledAgeMs;
    } else if (bucketSetStableFromAgeMs == null && priorIdentitySet.length === 0) {
      bucketSetStableFromAgeMs = obs.scheduledAgeMs;
    }

    const currentSnapshots = obs.bucketValueSnapshots ?? {};
    if (Object.keys(currentSnapshots).length > 0 && Object.keys(priorSnapshots).length > 0) {
      const valueCmp = compareValueSnapshots(currentSnapshots, priorSnapshots);
      if (valueCmp.revisionCount > 0) {
        lastValueRevisionAgeMs = obs.scheduledAgeMs;
        revisedValueCount += valueCmp.revisionCount;
        bucketClassifications.push('VALUE_REVISED');
      } else if (valueSetStableFromAgeMs == null) {
        valueSetStableFromAgeMs = obs.scheduledAgeMs;
      }
      if (valueCmp.revisionCount === 0 && valueCmp.stableBucketIdentities.length > 0) {
        bucketClassifications.push('VALUE_STABLE_FROM_FIRST_SEEN');
      }
    } else if (Object.keys(currentSnapshots).length > 0) {
      bucketClassifications.push('NOT_COMPARABLE');
    }

    priorIdentitySet = obs.uniqueBucketIdentities;
    priorSnapshots = currentSnapshots;
  }

  if (zeroResultAgesMs.length > 0) bucketClassifications.push('ZERO_RESULT');
  if (queryFailureAgesMs.length > 0) bucketClassifications.push('QUERY_FAILURE');
  if (successes.length > 0 && lateBucketCount === 0) {
    bucketClassifications.push('BUCKET_STABLE_FROM_FIRST_SEEN');
  }

  return {
    probeId,
    firstSuccessfulQueryAgeMs,
    canonicalBucketCountAtFirstSuccess,
    lastBucketAdditionAgeMs,
    bucketSetStableFromAgeMs,
    valueSetStableFromAgeMs,
    lastValueRevisionAgeMs,
    lateBucketCount,
    revisedValueCount,
    missingLaterBucketCount,
    queryFailureAgesMs,
    zeroResultAgesMs,
    bucketClassifications: [...new Set(bucketClassifications)],
  };
}

function compareIdentitySets(current: string[], prior: string[]): {
  added: string[];
  removed: string[];
} {
  const priorSet = new Set(prior);
  const currentSet = new Set(current);
  return {
    added: current.filter((id) => !priorSet.has(id)),
    removed: prior.filter((id) => !currentSet.has(id)),
  };
}

export function analyzeGlobalCrossAge(probes: ProbeCrossAgeReport[]): GlobalCrossAgeSummary {
  if (probes.length === 0) {
    return {
      allProbesBucketStableBy30: 'UNKNOWN',
      allProbesBucketStableBy60: 'UNKNOWN',
      allProbesValueStableBy30: 'UNKNOWN',
      allProbesValueStableBy60: 'UNKNOWN',
    };
  }

  const bucketStableBy = (ageMs: number): 'YES' | 'NO' | 'UNKNOWN' => {
    const withSuccess = probes.filter((p) => p.firstSuccessfulQueryAgeMs != null);
    if (withSuccess.length === 0) return 'UNKNOWN';
    const allStable = withSuccess.every(
      (p) =>
        p.bucketSetStableFromAgeMs != null && p.bucketSetStableFromAgeMs <= ageMs,
    );
    return allStable ? 'YES' : 'NO';
  };

  const valueStableBy = (ageMs: number): 'YES' | 'NO' | 'UNKNOWN' => {
    const withValue = probes.filter((p) => p.valueSetStableFromAgeMs != null);
    if (withValue.length === 0) return 'UNKNOWN';
    const allStable = withValue.every(
      (p) => p.valueSetStableFromAgeMs != null && p.valueSetStableFromAgeMs <= ageMs,
    );
    return allStable ? 'YES' : 'NO';
  };

  return {
    allProbesBucketStableBy30: bucketStableBy(30_000),
    allProbesBucketStableBy60: bucketStableBy(60_000),
    allProbesValueStableBy30: valueStableBy(30_000),
    allProbesValueStableBy60: valueStableBy(60_000),
  };
}

export function enrichObservationWithValueMetrics(obs: CrossAgeObservationInput): {
  valueContentHash: string | null;
} {
  if (!obs.bucketValueSnapshots || Object.keys(obs.bucketValueSnapshots).length === 0) {
    return { valueContentHash: null };
  }
  return { valueContentHash: hashBucketValueContent(obs.bucketValueSnapshots) };
}

export const CROSS_AGE_MANDATORY_AGES_MS = [...EXP021_MANDATORY_AGES_MS];
