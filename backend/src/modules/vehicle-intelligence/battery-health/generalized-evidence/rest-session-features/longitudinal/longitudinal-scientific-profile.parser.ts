import { compareUtf16CodeUnitLexicographic } from '../feature-input-canonical.serializer';
import { LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS } from './longitudinal-input.constants';
import type { LongitudinalInputExclusionReason } from './longitudinal-input.types';
import {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import type {
  LongitudinalProfileExcludedSessionV1,
  LongitudinalProfileFlagV1,
  LongitudinalProfileObservationV1,
  LongitudinalProfileVersionSegmentV1,
  LongitudinalProfileVersionTupleV1,
} from './longitudinal-profile.types';
import type { D4ReasonCode } from './longitudinal-integrity-inspection.types';
import type { LongitudinalScientificProfileProjectionV1 } from './longitudinal-profile-scientific-projection';
import { isCanonicalUtcIsoTimestamp } from './longitudinal-profile.validation';

const EXCLUSION_REASON_ORDER: LongitudinalInputExclusionReason[] = [
  'NO_CANONICAL_ROW',
  'SESSION_INVALIDATED',
  'SESSION_TRUST_INVALIDATED',
  'INPUT_CONTRACT_VERSION_UNRESOLVED',
];

const RECOGNIZED_FLAGS: LongitudinalProfileFlagV1[] = [
  'VERSION_SEGMENTED',
  'PROVISIONAL_SESSIONS_PRESENT',
  'INPUT_CONTRACT_UNRESOLVED_PRESENT',
];

export type ParseLongitudinalScientificProfileProjectionOutcome =
  | { status: 'OK'; projection: LongitudinalScientificProfileProjectionV1 }
  | { status: 'FAILED'; reason: D4ReasonCode };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(reason: D4ReasonCode): ParseLongitudinalScientificProfileProjectionOutcome {
  return { status: 'FAILED', reason };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isSortedAnchorThenUtf16(
  items: Array<{ restSessionId: string; anchorAt: string }>,
): boolean {
  for (let i = 1; i < items.length; i += 1) {
    const prev = items[i - 1];
    const curr = items[i];
    const anchorDiff = Date.parse(prev.anchorAt) - Date.parse(curr.anchorAt);
    if (anchorDiff > 0) return false;
    if (
      anchorDiff === 0 &&
      compareUtf16CodeUnitLexicographic(prev.restSessionId, curr.restSessionId) > 0
    ) {
      return false;
    }
  }
  return true;
}

function versionTuplesEqual(a: LongitudinalProfileVersionTupleV1, b: LongitudinalProfileVersionTupleV1): boolean {
  return (
    a.featureModelVersion === b.featureModelVersion &&
    a.retentionPolicyVersion === b.retentionPolicyVersion &&
    a.chargeOpportunityPolicyVersion === b.chargeOpportunityPolicyVersion &&
    a.inputContractVersion === b.inputContractVersion
  );
}

function recomputeVersionSegments(
  observations: LongitudinalProfileObservationV1[],
): LongitudinalProfileVersionSegmentV1[] {
  if (observations.length === 0) return [];
  const segments: LongitudinalProfileVersionSegmentV1[] = [];
  let currentTuple = observations[0].versionTuple;
  let segmentStart = 0;
  for (let i = 1; i <= observations.length; i += 1) {
    const next = observations[i];
    if (next && versionTuplesEqual(currentTuple, next.versionTuple)) {
      continue;
    }
    const slice = observations.slice(segmentStart, i);
    segments.push({
      segmentIndex: segments.length,
      versionTuple: { ...currentTuple },
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

function recomputeExcludedByReason(
  excluded: LongitudinalProfileExcludedSessionV1[],
): Partial<Record<LongitudinalInputExclusionReason, number>> {
  const counts: Partial<Record<LongitudinalInputExclusionReason, number>> = {};
  for (const item of excluded) {
    for (const reason of item.exclusionReasons) {
      counts[reason] = (counts[reason] ?? 0) + 1;
    }
  }
  return { ...counts };
}

function parseVersionTuple(value: unknown): LongitudinalProfileVersionTupleV1 | null {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.featureModelVersion) ||
    !isNonEmptyString(value.retentionPolicyVersion) ||
    !isNonEmptyString(value.chargeOpportunityPolicyVersion) ||
    !isNonEmptyString(value.inputContractVersion)
  ) {
    return null;
  }
  return {
    featureModelVersion: value.featureModelVersion,
    retentionPolicyVersion: value.retentionPolicyVersion,
    chargeOpportunityPolicyVersion: value.chargeOpportunityPolicyVersion,
    inputContractVersion: value.inputContractVersion,
  };
}

function parseCanonical(value: unknown): LongitudinalProfileObservationV1['canonical'] | null {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.canonicalFeatureRowId) ||
    typeof value.semanticRevision !== 'number' ||
    !Number.isInteger(value.semanticRevision) ||
    !isNonEmptyString(value.computationPhase) ||
    !isNonEmptyString(value.sessionTrust) ||
    !isNonEmptyString(value.inputDigest)
  ) {
    return null;
  }
  return {
    canonicalFeatureRowId: value.canonicalFeatureRowId,
    semanticRevision: value.semanticRevision,
    computationPhase: value.computationPhase,
    sessionTrust: value.sessionTrust,
    inputDigest: value.inputDigest,
  };
}

function parseFeatures(value: unknown): LongitudinalProfileObservationV1['features'] | null {
  if (!isRecord(value)) return null;
  const fields: (keyof LongitudinalProfileObservationV1['features'])[] = [
    'shutdownToFirstRestDeltaMv',
    'robustRestSlopeMvPerHour',
    'minimumRestVoltageMv',
    'maximumRestVoltageMv',
    'medianRestVoltageMv',
    'restVoltageVarianceMv2',
    'numberOfValidRestPoints',
    'maxActualRestAgeMs',
    'maxInterObservationGapMs',
    'observationSpanMs',
    'missingRungCount',
    'chargeOpportunityClass',
  ];
  for (const key of fields) {
    if (!(key in value)) return null;
  }
  if (
    !isNullableNumber(value.shutdownToFirstRestDeltaMv) ||
    !isNullableNumber(value.robustRestSlopeMvPerHour) ||
    !isNullableNumber(value.minimumRestVoltageMv) ||
    !isNullableNumber(value.maximumRestVoltageMv) ||
    !isNullableNumber(value.medianRestVoltageMv) ||
    !isNullableNumber(value.restVoltageVarianceMv2) ||
    typeof value.numberOfValidRestPoints !== 'number' ||
    !Number.isInteger(value.numberOfValidRestPoints) ||
    !isNullableNumber(value.maxActualRestAgeMs) ||
    !isNullableNumber(value.maxInterObservationGapMs) ||
    !isNullableNumber(value.observationSpanMs) ||
    !isNullableNumber(value.missingRungCount) ||
    typeof value.chargeOpportunityClass !== 'string'
  ) {
    return null;
  }
  return value as LongitudinalProfileObservationV1['features'];
}

function parseObservation(value: unknown): LongitudinalProfileObservationV1 | null {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.restSessionId) ||
    !isCanonicalUtcIsoTimestamp(String(value.anchorAt)) ||
    typeof value.sessionStatus !== 'string' ||
    (value.endReason !== null && typeof value.endReason !== 'string') ||
    value.perSessionInspectionStatus !== 'NOT_EVALUATED' ||
    !Array.isArray(value.chargeContextCompleteness) ||
    !('temperatureC' in value) ||
    (value.temperatureC !== null && typeof value.temperatureC !== 'number') ||
    (value.temperatureSource !== null && typeof value.temperatureSource !== 'string')
  ) {
    return null;
  }
  const versionTuple = parseVersionTuple(value.versionTuple);
  const canonical = parseCanonical(value.canonical);
  const features = parseFeatures(value.features);
  if (!versionTuple || !canonical || !features) return null;
  if (
    typeof value.anchorResolutionStatus !== 'string'
  ) {
    return null;
  }
  return {
    restSessionId: value.restSessionId,
    anchorAt: value.anchorAt as string,
    sessionStatus: value.sessionStatus,
    endReason: value.endReason as string | null,
    canonical,
    versionTuple,
    features,
    anchorResolutionStatus:
      value.anchorResolutionStatus as LongitudinalProfileObservationV1['anchorResolutionStatus'],
    perSessionInspectionStatus: 'NOT_EVALUATED',
    chargeContextCompleteness: value.chargeContextCompleteness as string[],
    temperatureC: value.temperatureC as number | null,
    temperatureSource: value.temperatureSource as string | null,
  };
}

function parseExcluded(value: unknown): LongitudinalProfileExcludedSessionV1 | null {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.restSessionId) ||
    !isCanonicalUtcIsoTimestamp(String(value.anchorAt)) ||
    typeof value.sessionStatus !== 'string' ||
    (value.endReason !== null && typeof value.endReason !== 'string') ||
    !Array.isArray(value.exclusionReasons)
  ) {
    return null;
  }
  for (const reason of value.exclusionReasons) {
    if (
      typeof reason !== 'string' ||
      !EXCLUSION_REASON_ORDER.includes(reason as LongitudinalInputExclusionReason)
    ) {
      return null;
    }
  }
  const sortedReasons = [...(value.exclusionReasons as LongitudinalInputExclusionReason[])].sort(
    (a, b) => EXCLUSION_REASON_ORDER.indexOf(a) - EXCLUSION_REASON_ORDER.indexOf(b),
  );
  if (
    JSON.stringify(value.exclusionReasons) !== JSON.stringify(sortedReasons)
  ) {
    return null;
  }
  const canonical =
    value.canonical === null ? null : parseCanonical(value.canonical);
  if (value.canonical !== null && !canonical) return null;
  let version: LongitudinalProfileExcludedSessionV1['version'] = null;
  if (value.version !== null) {
    if (!isRecord(value.version)) return null;
    const resolution = value.version.inputContractResolution;
    if (resolution !== 'RESOLVED' && resolution !== 'UNRESOLVED') return null;
    version = {
      featureModelVersion: String(value.version.featureModelVersion ?? ''),
      retentionPolicyVersion: String(value.version.retentionPolicyVersion ?? ''),
      chargeOpportunityPolicyVersion: String(value.version.chargeOpportunityPolicyVersion ?? ''),
      inputContractVersion:
        value.version.inputContractVersion === null
          ? null
          : String(value.version.inputContractVersion),
      inputContractResolution: resolution,
    };
    if (
      !version.featureModelVersion ||
      !version.retentionPolicyVersion ||
      !version.chargeOpportunityPolicyVersion
    ) {
      return null;
    }
  }
  const inputDigest =
    value.inputDigest === null
      ? null
      : typeof value.inputDigest === 'string'
        ? value.inputDigest
        : null;
  if (value.inputDigest !== null && inputDigest === null) return null;
  return {
    restSessionId: value.restSessionId,
    anchorAt: value.anchorAt as string,
    sessionStatus: value.sessionStatus,
    endReason: value.endReason as string | null,
    exclusionReasons: sortedReasons,
    canonical,
    version,
    inputDigest,
  };
}

function expectedProfileFlags(input: {
  versionSegmentCount: number;
  provisionalCount: number;
  excluded: LongitudinalProfileExcludedSessionV1[];
}): LongitudinalProfileFlagV1[] {
  const flags: LongitudinalProfileFlagV1[] = [];
  if (input.versionSegmentCount > 1) flags.push('VERSION_SEGMENTED');
  if (input.provisionalCount > 0) flags.push('PROVISIONAL_SESSIONS_PRESENT');
  const unresolved = input.excluded.some((s) =>
    s.exclusionReasons.includes('INPUT_CONTRACT_VERSION_UNRESOLVED'),
  );
  if (unresolved) flags.push('INPUT_CONTRACT_UNRESOLVED_PRESENT');
  return flags;
}

export function parseLongitudinalScientificProfileProjectionV1(
  input: unknown,
): ParseLongitudinalScientificProfileProjectionOutcome {
  if (!isRecord(input)) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  if (
    input.longitudinalProfileContractVersion !== REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION
  ) {
    return fail('UNSUPPORTED_PROFILE_CONTRACT');
  }
  if (input.profilePolicyVersion !== REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION) {
    return fail('UNSUPPORTED_PROFILE_POLICY_VERSION');
  }
  if (!isNonEmptyString(input.organizationId) || !isNonEmptyString(input.vehicleId)) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  if (!isRecord(input.window)) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }
  if (Object.prototype.hasOwnProperty.call(input.window, 'profileGeneratedAt')) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  const max = LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS;
  const requestedSessionLimit = input.window.requestedSessionLimit;
  const appliedSessionLimit = input.window.appliedSessionLimit;
  if (
    typeof requestedSessionLimit !== 'number' ||
    typeof appliedSessionLimit !== 'number' ||
    !Number.isInteger(requestedSessionLimit) ||
    !Number.isInteger(appliedSessionLimit) ||
    requestedSessionLimit < 1 ||
    appliedSessionLimit < 1 ||
    requestedSessionLimit > max ||
    appliedSessionLimit > max ||
    requestedSessionLimit !== appliedSessionLimit
  ) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  const firstIncludedAnchorAt = input.window.firstIncludedAnchorAt;
  const lastIncludedAnchorAt = input.window.lastIncludedAnchorAt;
  if (
    (firstIncludedAnchorAt !== null &&
      !isCanonicalUtcIsoTimestamp(String(firstIncludedAnchorAt))) ||
    (lastIncludedAnchorAt !== null &&
      !isCanonicalUtcIsoTimestamp(String(lastIncludedAnchorAt)))
  ) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  if (!Array.isArray(input.observations) || !Array.isArray(input.provisionalObservations) || !Array.isArray(input.excludedSessions)) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  const observations: LongitudinalProfileObservationV1[] = [];
  for (const raw of input.observations) {
    const parsed = parseObservation(raw);
    if (!parsed) return fail('MALFORMED_SCIENTIFIC_PROFILE');
    observations.push(parsed);
  }
  const provisionalObservations: LongitudinalProfileObservationV1[] = [];
  for (const raw of input.provisionalObservations) {
    const parsed = parseObservation(raw);
    if (!parsed) return fail('MALFORMED_SCIENTIFIC_PROFILE');
    provisionalObservations.push(parsed);
  }
  const excludedSessions: LongitudinalProfileExcludedSessionV1[] = [];
  for (const raw of input.excludedSessions) {
    const parsed = parseExcluded(raw);
    if (!parsed) return fail('MALFORMED_SCIENTIFIC_PROFILE');
    excludedSessions.push(parsed);
  }

  if (!isSortedAnchorThenUtf16(observations)) return fail('MALFORMED_SCIENTIFIC_PROFILE');
  if (!isSortedAnchorThenUtf16(provisionalObservations)) return fail('MALFORMED_SCIENTIFIC_PROFILE');
  if (!isSortedAnchorThenUtf16(excludedSessions)) return fail('MALFORMED_SCIENTIFIC_PROFILE');

  const seen = new Set<string>();
  for (const item of [...observations, ...provisionalObservations, ...excludedSessions]) {
    if (seen.has(item.restSessionId)) return fail('MALFORMED_SCIENTIFIC_PROFILE');
    seen.add(item.restSessionId);
  }

  if (!isRecord(input.coverage)) return fail('MALFORMED_SCIENTIFIC_PROFILE');
  const coverage = input.coverage;
  const candidateRestSessionCount = coverage.candidateRestSessionCount;
  if (
    typeof candidateRestSessionCount !== 'number' ||
    !Number.isInteger(candidateRestSessionCount) ||
    candidateRestSessionCount !==
      observations.length + provisionalObservations.length + excludedSessions.length ||
    coverage.includedSessionCount !== observations.length ||
    coverage.provisionalSessionCount !== provisionalObservations.length ||
    coverage.excludedSessionCount !== excludedSessions.length ||
    candidateRestSessionCount > appliedSessionLimit
  ) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  const profileStatus = input.profileStatus;
  if (profileStatus === 'OK' && observations.length === 0) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }
  if (profileStatus === 'NO_ELIGIBLE_SESSIONS' && observations.length > 0) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }
  if (profileStatus !== 'OK' && profileStatus !== 'NO_ELIGIBLE_SESSIONS') {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  const validEvidenceSpanMs = coverage.validEvidenceSpanMs;
  if (observations.length === 0) {
    if (
      firstIncludedAnchorAt !== null ||
      lastIncludedAnchorAt !== null ||
      validEvidenceSpanMs !== null
    ) {
      return fail('MALFORMED_SCIENTIFIC_PROFILE');
    }
  } else if (observations.length === 1) {
    if (
      firstIncludedAnchorAt !== observations[0].anchorAt ||
      lastIncludedAnchorAt !== observations[0].anchorAt ||
      validEvidenceSpanMs !== 0
    ) {
      return fail('MALFORMED_SCIENTIFIC_PROFILE');
    }
  } else {
    const first = observations[0].anchorAt;
    const last = observations[observations.length - 1].anchorAt;
    const span = Date.parse(last) - Date.parse(first);
    if (
      firstIncludedAnchorAt !== first ||
      lastIncludedAnchorAt !== last ||
      validEvidenceSpanMs !== span
    ) {
      return fail('MALFORMED_SCIENTIFIC_PROFILE');
    }
  }

  if (!isRecord(input.statusReasons)) return fail('MALFORMED_SCIENTIFIC_PROFILE');
  const statusReasons = input.statusReasons;
  const expectedExcludedByReason = recomputeExcludedByReason(excludedSessions);
  const versionSegmentsParsed = recomputeVersionSegments(observations);
  if (
    statusReasons.stableDefaultCount !== observations.length ||
    statusReasons.provisionalCount !== provisionalObservations.length ||
    statusReasons.excludedCount !== excludedSessions.length ||
    statusReasons.versionSegmentCount !== versionSegmentsParsed.length ||
    JSON.stringify(statusReasons.excludedByReason) !== JSON.stringify(expectedExcludedByReason)
  ) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }
  if (
    JSON.stringify(coverage.excludedByReason) !== JSON.stringify(expectedExcludedByReason)
  ) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  if (!Array.isArray(input.versionSegments)) return fail('MALFORMED_SCIENTIFIC_PROFILE');
  const parsedSegments: LongitudinalProfileVersionSegmentV1[] = [];
  for (const raw of input.versionSegments) {
    if (!isRecord(raw)) return fail('MALFORMED_SCIENTIFIC_PROFILE');
    const tuple = parseVersionTuple(raw.versionTuple);
    if (
      !tuple ||
      typeof raw.segmentIndex !== 'number' ||
      typeof raw.sessionCount !== 'number' ||
      !isCanonicalUtcIsoTimestamp(String(raw.firstAnchorAt)) ||
      !isCanonicalUtcIsoTimestamp(String(raw.lastAnchorAt))
    ) {
      return fail('MALFORMED_SCIENTIFIC_PROFILE');
    }
    parsedSegments.push({
      segmentIndex: raw.segmentIndex,
      versionTuple: tuple,
      sessionCount: raw.sessionCount,
      firstAnchorAt: raw.firstAnchorAt as string,
      lastAnchorAt: raw.lastAnchorAt as string,
    });
  }
  if (JSON.stringify(parsedSegments) !== JSON.stringify(versionSegmentsParsed)) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  if (!Array.isArray(input.profileFlags)) return fail('MALFORMED_SCIENTIFIC_PROFILE');
  const flags = input.profileFlags as unknown[];
  const flagSet = new Set(flags);
  if (flagSet.size !== flags.length) return fail('MALFORMED_SCIENTIFIC_PROFILE');
  for (const flag of flags) {
    if (typeof flag !== 'string' || !RECOGNIZED_FLAGS.includes(flag as LongitudinalProfileFlagV1)) {
      return fail('MALFORMED_SCIENTIFIC_PROFILE');
    }
  }
  const expectedFlags = expectedProfileFlags({
    versionSegmentCount: versionSegmentsParsed.length,
    provisionalCount: provisionalObservations.length,
    excluded: excludedSessions,
  });
  if (JSON.stringify(flags) !== JSON.stringify(expectedFlags)) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  if (input.derived !== null) return fail('MALFORMED_SCIENTIFIC_PROFILE');

  if (!isRecord(input.trendReadiness)) return fail('MALFORMED_SCIENTIFIC_PROFILE');
  if (
    input.trendReadiness.trendReadiness !== 'NOT_EVALUATED' ||
    input.trendReadiness.minimumSessionsForDescriptiveTrend !== null ||
    input.trendReadiness.meetsMinimum !== null
  ) {
    return fail('MALFORMED_SCIENTIFIC_PROFILE');
  }

  const projection: LongitudinalScientificProfileProjectionV1 = {
    longitudinalProfileContractVersion: REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
    profilePolicyVersion: REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    window: {
      requestedSessionLimit,
      appliedSessionLimit,
      firstIncludedAnchorAt: firstIncludedAnchorAt as string | null,
      lastIncludedAnchorAt: lastIncludedAnchorAt as string | null,
    },
    coverage: {
      candidateRestSessionCount,
      includedSessionCount: observations.length,
      provisionalSessionCount: provisionalObservations.length,
      excludedSessionCount: excludedSessions.length,
      excludedByReason: expectedExcludedByReason,
      validEvidenceSpanMs: validEvidenceSpanMs as number | null,
    },
    profileStatus,
    profileFlags: expectedFlags,
    statusReasons: {
      stableDefaultCount: observations.length,
      provisionalCount: provisionalObservations.length,
      excludedCount: excludedSessions.length,
      versionSegmentCount: versionSegmentsParsed.length,
      excludedByReason: expectedExcludedByReason,
    },
    trendReadiness: {
      trendReadiness: 'NOT_EVALUATED',
      minimumSessionsForDescriptiveTrend: null,
      meetsMinimum: null,
    },
    observations,
    provisionalObservations,
    excludedSessions,
    versionSegments: versionSegmentsParsed,
    derived: null,
  };

  return { status: 'OK', projection };
}
