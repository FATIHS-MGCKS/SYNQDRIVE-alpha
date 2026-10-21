import { buildExp021BucketIdentity } from './reference-capture-settlement-shadow-bucket-identity';
import { EXP021_MANDATORY_AGES_MS } from './reference-capture-settlement-shadow.policy';
import {
  compareValueSnapshots,
  type BucketValueSnapshots,
} from './reference-capture-settlement-shadow-value-snapshot';
import {
  extractNativeGapsFromOrderedTimestamps,
  type NativeGapLedgerEntry,
} from './reference-capture-exp021-native-gap-reconstruction';
import { canonicalizeOrderedNativeTemporalBucketStarts } from './reference-capture-native-temporal-evidence.lib';

export type SettlementObservationJoinInput = {
  scheduledAgeMs: number;
  providerRequestStatus: string;
  rawRowCount: number;
  uniqueBucketIdentities: string[];
  bucketValueSnapshots?: BucketValueSnapshots | null;
  valueContentHash?: string | null;
  valueRevisedBucketIdentities?: string[];
};

export type NativeSettlementBucketClassification =
  | 'NATIVE_AND_SETTLEMENT_PRESENT'
  | 'NATIVE_PRESENT_SETTLEMENT_ABSENT'
  | 'SETTLEMENT_PRESENT_NATIVE_ABSENT'
  | 'NEITHER_PRESENT';

export type InteriorBucketJoinRow = {
  temporalIso: string;
  bucketIdentity: string;
  classification: NativeSettlementBucketClassification;
  firstSeenAgeMs: number | null;
  inNativeSequence: boolean;
  inSettlementAtAgeMs: number | null;
};

export type GapSettlementJoinRow = {
  gap: NativeGapLedgerEntry;
  interiorBuckets: InteriorBucketJoinRow[];
};

export type NativeSettlementJoinReport = {
  phaseLabel: string;
  primaryField: string;
  nativeTemporalBucketStarts: string[];
  gapJoinRows: GapSettlementJoinRow[];
  settlementOnlyBuckets: InteriorBucketJoinRow[];
  valueRevisionAtAges: Array<{
    scheduledAgeMs: number;
    revisedBucketIdentities: string[];
    revisionCount: number;
  }>;
};

export function nativeTemporalSet(nativeStarts: string[]): Set<string> {
  return new Set(canonicalizeOrderedNativeTemporalBucketStarts(nativeStarts));
}

export function classifySettlementBucketAgainstNative(args: {
  temporalIso: string;
  primaryField: string;
  nativeSet: Set<string>;
  settlementIdentities: Set<string>;
  firstSeenAgeMs: number | null;
}): InteriorBucketJoinRow {
  const bucketIdentity = buildExp021BucketIdentity(args.primaryField, args.temporalIso);
  const inNative = args.nativeSet.has(args.temporalIso);
  const inSettlement = args.settlementIdentities.has(bucketIdentity);
  let classification: NativeSettlementBucketClassification;
  if (inNative && inSettlement) classification = 'NATIVE_AND_SETTLEMENT_PRESENT';
  else if (inNative && !inSettlement) classification = 'NATIVE_PRESENT_SETTLEMENT_ABSENT';
  else if (!inNative && inSettlement) classification = 'SETTLEMENT_PRESENT_NATIVE_ABSENT';
  else classification = 'NEITHER_PRESENT';

  return {
    temporalIso: args.temporalIso,
    bucketIdentity,
    classification,
    firstSeenAgeMs: inSettlement ? args.firstSeenAgeMs : null,
    inNativeSequence: inNative,
    inSettlementAtAgeMs: inSettlement ? args.firstSeenAgeMs : null,
  };
}

export function firstAgeContainingBucket(
  bucketIdentity: string,
  observations: SettlementObservationJoinInput[],
): number | null {
  const sorted = [...observations].sort((a, b) => a.scheduledAgeMs - b.scheduledAgeMs);
  for (const obs of sorted) {
    if (obs.rawRowCount === 0 || obs.providerRequestStatus === 'ZERO_RESULT') continue;
    if (obs.providerRequestStatus !== 'SUCCESS' && obs.rawRowCount === 0) continue;
    if (obs.uniqueBucketIdentities.includes(bucketIdentity)) return obs.scheduledAgeMs;
  }
  return null;
}

export function joinNativeGapsWithSettlementObservations(args: {
  phaseLabel: string;
  phaseProvenance: string | null;
  orderedNativeTemporalBucketStarts: string[];
  primaryField: string;
  observations: SettlementObservationJoinInput[];
  minGapMs?: number;
}): NativeSettlementJoinReport {
  const nativeStarts = canonicalizeOrderedNativeTemporalBucketStarts(
    args.orderedNativeTemporalBucketStarts,
  );
  const nativeSet = nativeTemporalSet(nativeStarts);
  const gaps = extractNativeGapsFromOrderedTimestamps({
    phaseLabel: args.phaseLabel,
    phaseProvenance: args.phaseProvenance,
    orderedNativeTemporalBucketStarts: nativeStarts,
    minGapMs: args.minGapMs ?? 1,
  });

  const gapJoinRows: GapSettlementJoinRow[] = gaps.map((gap) => ({
    gap,
    interiorBuckets: gap.interiorExpectedTemporalBuckets.map((temporalIso) => {
      const bucketIdentity = buildExp021BucketIdentity(args.primaryField, temporalIso);
      const firstSeen = firstAgeContainingBucket(bucketIdentity, args.observations);
      const settlementIdentities = firstSeen != null ? new Set([bucketIdentity]) : new Set<string>();
      return classifySettlementBucketAgainstNative({
        temporalIso,
        primaryField: args.primaryField,
        nativeSet,
        settlementIdentities,
        firstSeenAgeMs: firstSeen,
      });
    }),
  }));

  const allSettlementTemps = new Set<string>();
  for (const obs of args.observations) {
    if (obs.rawRowCount === 0) continue;
    for (const id of obs.uniqueBucketIdentities) {
      const pipe = id.indexOf('|');
      if (pipe < 0) continue;
      const field = id.slice(0, pipe);
      if (field !== args.primaryField) continue;
      allSettlementTemps.add(id.slice(pipe + 1));
    }
  }

  const settlementOnlyBuckets: InteriorBucketJoinRow[] = [];
  for (const temporalIso of [...allSettlementTemps].sort()) {
    if (nativeSet.has(temporalIso)) continue;
    const bucketIdentity = buildExp021BucketIdentity(args.primaryField, temporalIso);
    settlementOnlyBuckets.push(
      classifySettlementBucketAgainstNative({
        temporalIso,
        primaryField: args.primaryField,
        nativeSet,
        settlementIdentities: new Set([bucketIdentity]),
        firstSeenAgeMs: firstAgeContainingBucket(bucketIdentity, args.observations),
      }),
    );
  }

  const valueRevisionAtAges: NativeSettlementJoinReport['valueRevisionAtAges'] = [];
  const successes = [...args.observations]
    .filter((o) => o.rawRowCount > 0 && o.providerRequestStatus === 'SUCCESS')
    .sort((a, b) => a.scheduledAgeMs - b.scheduledAgeMs);
  let priorSnapshots: BucketValueSnapshots = {};
  for (const obs of successes) {
    const current = obs.bucketValueSnapshots ?? {};
    if (Object.keys(priorSnapshots).length > 0 && Object.keys(current).length > 0) {
      const cmp = compareValueSnapshots(current, priorSnapshots);
      if (cmp.revisionCount > 0) {
        valueRevisionAtAges.push({
          scheduledAgeMs: obs.scheduledAgeMs,
          revisedBucketIdentities: cmp.revisedBuckets.map((r) => r.bucketIdentity),
          revisionCount: cmp.revisionCount,
        });
      }
    }
    priorSnapshots = current;
  }

  return {
    phaseLabel: args.phaseLabel,
    primaryField: args.primaryField,
    nativeTemporalBucketStarts: nativeStarts,
    gapJoinRows,
    settlementOnlyBuckets,
    valueRevisionAtAges,
  };
}

export const MANDATORY_SETTLEMENT_AGES_MS = [...EXP021_MANDATORY_AGES_MS];
