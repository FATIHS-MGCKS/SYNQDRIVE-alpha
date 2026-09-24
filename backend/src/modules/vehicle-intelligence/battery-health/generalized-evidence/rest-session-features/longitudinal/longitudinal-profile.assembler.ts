import { compareUtf16CodeUnitLexicographic } from '../feature-input-canonical.serializer';
import type {
  LongitudinalInputExclusionReason,
  LongitudinalInputSessionInventoryItem,
  LongitudinalInputVersionTuple,
} from './longitudinal-input.types';
import {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import type {
  LongitudinalProfileAssemblyInput,
  LongitudinalProfileAssemblyOutcome,
  LongitudinalProfileExcludedSessionV1,
  LongitudinalProfileFlagV1,
  LongitudinalProfileObservationV1,
  LongitudinalProfileVersionSegmentV1,
  LongitudinalProfileVersionTupleV1,
} from './longitudinal-profile.types';
import { validateLongitudinalProfileAssemblyInput } from './longitudinal-profile.validation';

const EXCLUSION_REASON_ORDER: LongitudinalInputExclusionReason[] = [
  'NO_CANONICAL_ROW',
  'SESSION_INVALIDATED',
  'SESSION_TRUST_INVALIDATED',
  'INPUT_CONTRACT_VERSION_UNRESOLVED',
];

export function sortLongitudinalInventoryChronological(
  sessions: LongitudinalInputSessionInventoryItem[],
): LongitudinalInputSessionInventoryItem[] {
  return [...sessions].sort((a, b) => {
    const anchorDiff =
      Date.parse(a.session.anchorAt) - Date.parse(b.session.anchorAt);
    if (anchorDiff !== 0) return anchorDiff;
    return compareUtf16CodeUnitLexicographic(a.restSessionId, b.restSessionId);
  });
}

function toResolvedVersionTuple(
  version: LongitudinalInputVersionTuple,
): LongitudinalProfileVersionTupleV1 {
  return {
    featureModelVersion: version.featureModelVersion,
    retentionPolicyVersion: version.retentionPolicyVersion,
    chargeOpportunityPolicyVersion: version.chargeOpportunityPolicyVersion,
    inputContractVersion: version.inputContractVersion as string,
  };
}

function versionTuplesEqual(
  a: LongitudinalProfileVersionTupleV1,
  b: LongitudinalProfileVersionTupleV1,
): boolean {
  return (
    a.featureModelVersion === b.featureModelVersion &&
    a.retentionPolicyVersion === b.retentionPolicyVersion &&
    a.chargeOpportunityPolicyVersion === b.chargeOpportunityPolicyVersion &&
    a.inputContractVersion === b.inputContractVersion
  );
}

function mapObservation(
  item: LongitudinalInputSessionInventoryItem,
): LongitudinalProfileObservationV1 {
  return {
    restSessionId: item.restSessionId,
    anchorAt: item.session.anchorAt,
    sessionStatus: item.session.sessionStatus,
    endReason: item.session.endReason,
    canonical: item.canonical!,
    versionTuple: toResolvedVersionTuple(item.version!),
    features: item.features!,
    anchorResolutionStatus: item.snapshot!.anchorResolutionStatus,
    perSessionInspectionStatus: 'NOT_EVALUATED',
    chargeContextCompleteness: item.snapshot!.chargeContextCompleteness,
    temperatureC: item.snapshot!.temperatureC,
    temperatureSource: item.snapshot!.temperatureSource,
  };
}

function mapExcluded(
  item: LongitudinalInputSessionInventoryItem,
): LongitudinalProfileExcludedSessionV1 {
  return {
    restSessionId: item.restSessionId,
    anchorAt: item.session.anchorAt,
    sessionStatus: item.session.sessionStatus,
    endReason: item.session.endReason,
    exclusionReasons: [...item.quality.exclusionReasons].sort((a, b) =>
      EXCLUSION_REASON_ORDER.indexOf(a) - EXCLUSION_REASON_ORDER.indexOf(b),
    ),
    canonical: item.canonical,
    version: item.version,
    inputDigest: item.canonical?.inputDigest ?? null,
  };
}

function countExcludedByReason(
  excluded: LongitudinalInputSessionInventoryItem[],
): Partial<Record<LongitudinalInputExclusionReason, number>> {
  const counts: Partial<Record<LongitudinalInputExclusionReason, number>> = {};
  for (const item of excluded) {
    for (const reason of item.quality.exclusionReasons) {
      counts[reason] = (counts[reason] ?? 0) + 1;
    }
  }
  return counts;
}

function buildVersionSegments(
  observations: LongitudinalProfileObservationV1[],
): LongitudinalProfileVersionSegmentV1[] {
  if (observations.length === 0) return [];

  const segments: LongitudinalProfileVersionSegmentV1[] = [];
  let currentTuple = observations[0].versionTuple;
  let segmentStart = 0;

  for (let i = 1; i <= observations.length; i++) {
    const next = observations[i];
    if (next && versionTuplesEqual(currentTuple, next.versionTuple)) {
      continue;
    }
    const slice = observations.slice(segmentStart, i);
    segments.push({
      segmentIndex: segments.length,
      versionTuple: currentTuple,
      sessionCount: slice.length,
      firstAnchorAt: slice[0].anchorAt,
      lastAnchorAt: slice[slice.length - 1].anchorAt,
    });
    if (next) {
      currentTuple = next.versionTuple;
      segmentStart = i;
    }
  }

  return segments;
}

function computeValidEvidenceSpanMs(
  observations: LongitudinalProfileObservationV1[],
): number | null {
  if (observations.length === 0) return null;
  if (observations.length === 1) return 0;
  const first = Date.parse(observations[0].anchorAt);
  const last = Date.parse(observations[observations.length - 1].anchorAt);
  return last - first;
}

function buildProfileFlags(input: {
  versionSegmentCount: number;
  provisionalCount: number;
  inventory: LongitudinalInputSessionInventoryItem[];
}): LongitudinalProfileFlagV1[] {
  const flags: LongitudinalProfileFlagV1[] = [];
  if (input.versionSegmentCount > 1) {
    flags.push('VERSION_SEGMENTED');
  }
  if (input.provisionalCount > 0) {
    flags.push('PROVISIONAL_SESSIONS_PRESENT');
  }
  const unresolvedPresent = input.inventory.some((session) =>
    session.quality.exclusionReasons.includes('INPUT_CONTRACT_VERSION_UNRESOLVED'),
  );
  if (unresolvedPresent) {
    flags.push('INPUT_CONTRACT_UNRESOLVED_PRESENT');
  }
  return flags;
}

/**
 * Pure D2 assembler — no DB, no clock, no side effects.
 */
export function assembleLongitudinalProfileV1(
  input: LongitudinalProfileAssemblyInput,
): LongitudinalProfileAssemblyOutcome {
  const rejection = validateLongitudinalProfileAssemblyInput(input.inventory);
  if (rejection) {
    return { status: 'REJECTED', reason: rejection };
  }

  const sorted = sortLongitudinalInventoryChronological(input.inventory.sessions);

  const defaults = sorted.filter((s) => s.quality.inclusionMode === 'DEFAULT');
  const provisionals = sorted.filter(
    (s) => s.quality.inclusionMode === 'PROVISIONAL',
  );
  const excludedItems = sorted.filter(
    (s) => s.quality.inclusionMode === 'EXCLUDED',
  );

  const observations = defaults.map(mapObservation);
  const provisionalObservations = provisionals.map(mapObservation);
  const excludedSessions = excludedItems.map(mapExcluded);

  const excludedByReason = countExcludedByReason(excludedItems);
  const versionSegments = buildVersionSegments(observations);

  const profileStatus =
    observations.length > 0 ? ('OK' as const) : ('NO_ELIGIBLE_SESSIONS' as const);

  const firstIncludedAnchorAt =
    observations.length > 0 ? observations[0].anchorAt : null;
  const lastIncludedAnchorAt =
    observations.length > 0 ? observations[observations.length - 1].anchorAt : null;

  return {
    status: 'OK',
    profile: {
      longitudinalProfileContractVersion:
        REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
      profilePolicyVersion: REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
      organizationId: input.inventory.organizationId,
      vehicleId: input.inventory.vehicleId,
      window: {
        requestedSessionLimit: input.inventory.requestedSessionLimit,
        appliedSessionLimit: input.inventory.appliedSessionLimit,
        firstIncludedAnchorAt,
        lastIncludedAnchorAt,
        profileGeneratedAt: input.profileGeneratedAt,
      },
      coverage: {
        candidateRestSessionCount: sorted.length,
        includedSessionCount: observations.length,
        provisionalSessionCount: provisionalObservations.length,
        excludedSessionCount: excludedSessions.length,
        excludedByReason,
        validEvidenceSpanMs: computeValidEvidenceSpanMs(observations),
      },
      profileStatus,
      profileFlags: buildProfileFlags({
        versionSegmentCount: versionSegments.length,
        provisionalCount: provisionalObservations.length,
        inventory: sorted,
      }),
      statusReasons: {
        stableDefaultCount: observations.length,
        provisionalCount: provisionalObservations.length,
        excludedCount: excludedSessions.length,
        versionSegmentCount: versionSegments.length,
        excludedByReason,
      },
      trendReadiness: {
        trendReadiness: 'NOT_EVALUATED',
        minimumSessionsForDescriptiveTrend: null,
        meetsMinimum: null,
      },
      observations,
      provisionalObservations,
      excludedSessions,
      versionSegments,
      derived: null,
    },
  };
}
