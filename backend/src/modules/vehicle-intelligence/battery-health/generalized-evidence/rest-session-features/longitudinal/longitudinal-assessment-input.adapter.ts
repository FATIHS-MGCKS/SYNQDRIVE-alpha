import {
  canonicalFeatureInputUtf8,
  compareUtf16CodeUnitLexicographic,
  sha256HexLowercaseUtf8,
} from '../feature-input-canonical.serializer';
import { M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION } from './longitudinal-assessment-input.constants';
import type {
  M3_3E_AssessmentGradeObservationV1,
  M3_3E_BuildLongitudinalAssessmentInputArgs,
  M3_3E_BuildOutcome,
  M3_3E_ConsumptionRejectReason,
  M3_3E_LongitudinalAssessmentInputV1,
  M3_3E_RevisionIdentityV1,
} from './longitudinal-assessment-input.types';
import { REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION } from './longitudinal-integrity-inspection.constants';
import type {
  D4PerSessionInspectionV1,
  D4VersionTupleEnvelope,
  M3_3D_D4_INTEGRITY_INSPECTION_V1,
} from './longitudinal-integrity-inspection.types';
import type { LongitudinalInputFeatureScalars, LongitudinalInputVersionTuple } from './longitudinal-input.types';
import { LONGITUDINAL_PROFILE_FINGERPRINT_HEX_PATTERN } from './longitudinal-profile-materialization.errors';
import {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import type {
  LongitudinalProfileExcludedSessionV1,
  LongitudinalProfileObservationV1,
  LongitudinalProfileVersionTupleV1,
} from './longitudinal-profile.types';
import type { LongitudinalScientificProfileProjectionV1 } from './longitudinal-profile-scientific-projection';
import { parseLongitudinalScientificProfileProjectionV1 } from './longitudinal-scientific-profile.parser';

function reject(reason: M3_3E_ConsumptionRejectReason): M3_3E_BuildOutcome {
  return { status: 'REJECTED', reason };
}

function isNonEmptyString(value: string): boolean {
  return typeof value === 'string' && value.length > 0;
}

function isValidProfileFingerprintHex(fingerprint: string): boolean {
  return LONGITUDINAL_PROFILE_FINGERPRINT_HEX_PATTERN.test(fingerprint);
}

function validateRevisionIdentityEnvelope(
  revisionIdentity: M3_3E_RevisionIdentityV1,
): M3_3E_ConsumptionRejectReason | null {
  if (
    !isNonEmptyString(revisionIdentity.organizationId) ||
    !isNonEmptyString(revisionIdentity.vehicleId) ||
    !isNonEmptyString(revisionIdentity.revisionId)
  ) {
    return 'D3_D4_IDENTITY_MISMATCH';
  }
  if (!isValidProfileFingerprintHex(revisionIdentity.canonicalProfileFingerprint)) {
    return 'D3_SCIENTIFIC_PROFILE_FINGERPRINT_MISMATCH';
  }
  if (
    revisionIdentity.longitudinalProfileContractVersion !==
    REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION
  ) {
    return 'UNSUPPORTED_D3_PROFILE_CONTRACT';
  }
  if (revisionIdentity.profilePolicyVersion !== REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION) {
    return 'UNSUPPORTED_D3_PROFILE_POLICY';
  }
  return null;
}

function d4ResolvedTupleMatchesObservation(
  d4Tuple: D4VersionTupleEnvelope,
  observationTuple: LongitudinalProfileVersionTupleV1,
): boolean {
  if (d4Tuple === null) return false;
  if (d4Tuple.inputContractResolution !== 'RESOLVED') return false;
  return (
    d4Tuple.featureModelVersion === observationTuple.featureModelVersion &&
    d4Tuple.retentionPolicyVersion === observationTuple.retentionPolicyVersion &&
    d4Tuple.chargeOpportunityPolicyVersion === observationTuple.chargeOpportunityPolicyVersion &&
    d4Tuple.inputContractVersion === observationTuple.inputContractVersion
  );
}

function d4TupleMatchesExcludedVersion(
  d4Tuple: D4VersionTupleEnvelope,
  d3Version: LongitudinalInputVersionTuple | null,
): boolean {
  if (d3Version === null) {
    return d4Tuple === null;
  }
  if (d4Tuple === null) {
    return false;
  }
  return (
    d4Tuple.featureModelVersion === d3Version.featureModelVersion &&
    d4Tuple.retentionPolicyVersion === d3Version.retentionPolicyVersion &&
    d4Tuple.chargeOpportunityPolicyVersion === d3Version.chargeOpportunityPolicyVersion &&
    d4Tuple.inputContractVersion === d3Version.inputContractVersion &&
    d4Tuple.inputContractResolution === d3Version.inputContractResolution
  );
}

function compareAssessmentGradeObservations(
  a: M3_3E_AssessmentGradeObservationV1,
  b: M3_3E_AssessmentGradeObservationV1,
): number {
  const anchorCmp = a.anchorAt.localeCompare(b.anchorAt);
  if (anchorCmp !== 0) return anchorCmp;
  return compareUtf16CodeUnitLexicographic(a.restSessionId, b.restSessionId);
}

function cloneFeatureScalars(
  features: LongitudinalInputFeatureScalars,
): LongitudinalInputFeatureScalars {
  return { ...features };
}

function cloneVersionTuple(
  tuple: LongitudinalProfileVersionTupleV1,
): LongitudinalProfileVersionTupleV1 {
  return { ...tuple };
}

function buildAssessmentGradeObservation(
  observation: LongitudinalProfileObservationV1,
  d4Row: D4PerSessionInspectionV1,
): M3_3E_AssessmentGradeObservationV1 {
  return {
    restSessionId: observation.restSessionId,
    anchorAt: observation.anchorAt,
    canonicalFeatureRowId: observation.canonical.canonicalFeatureRowId,
    inputDigest: observation.canonical.inputDigest,
    versionTuple: cloneVersionTuple(observation.versionTuple),
    features: cloneFeatureScalars(observation.features),
    anchorResolutionStatus: observation.anchorResolutionStatus,
    chargeOpportunityClass: observation.features.chargeOpportunityClass,
    chargeContextCompleteness: [...observation.chargeContextCompleteness],
    temperatureC: observation.temperatureC,
    temperatureSource: observation.temperatureSource,
    integrityContext: {
      digestVerificationScope: d4Row.digestVerificationScope,
      integrityQualifiedDisposition: 'ELIGIBLE',
    },
  };
}

function computeEvidenceWindow(observations: M3_3E_AssessmentGradeObservationV1[]): {
  firstEligibleAnchorAt: string | null;
  lastEligibleAnchorAt: string | null;
  eligibleEvidenceSpanMs: number | null;
} {
  if (observations.length === 0) {
    return {
      firstEligibleAnchorAt: null,
      lastEligibleAnchorAt: null,
      eligibleEvidenceSpanMs: null,
    };
  }
  if (observations.length === 1) {
    const anchor = observations[0].anchorAt;
    return {
      firstEligibleAnchorAt: anchor,
      lastEligibleAnchorAt: anchor,
      eligibleEvidenceSpanMs: 0,
    };
  }
  const first = observations[0].anchorAt;
  const last = observations[observations.length - 1].anchorAt;
  const span = Date.parse(last) - Date.parse(first);
  if (span < 0) {
    throw new Error('E1 evidence window span negative');
  }
  return {
    firstEligibleAnchorAt: first,
    lastEligibleAnchorAt: last,
    eligibleEvidenceSpanMs: span,
  };
}

function buildEligibleVersionSegments(
  projection: LongitudinalScientificProfileProjectionV1,
  eligibleBySessionId: Map<string, M3_3E_AssessmentGradeObservationV1>,
): M3_3E_LongitudinalAssessmentInputV1['eligibleVersionSegments'] {
  const segments: M3_3E_LongitudinalAssessmentInputV1['eligibleVersionSegments'] = [];
  let cursor = 0;
  for (const sourceSegment of projection.versionSegments) {
    const sourceSlice = projection.observations.slice(
      cursor,
      cursor + sourceSegment.sessionCount,
    );
    cursor += sourceSegment.sessionCount;
    const retained: M3_3E_AssessmentGradeObservationV1[] = [];
    for (const obs of sourceSlice) {
      const eligible = eligibleBySessionId.get(obs.restSessionId);
      if (eligible) {
        retained.push(eligible);
      }
    }
    if (retained.length === 0) {
      continue;
    }
    retained.sort(compareAssessmentGradeObservations);
    segments.push({
      sourceSegmentIndex: sourceSegment.segmentIndex,
      versionTuple: cloneVersionTuple(sourceSegment.versionTuple),
      observationCount: retained.length,
      firstAnchorAt: retained[0].anchorAt,
      lastAnchorAt: retained[retained.length - 1].anchorAt,
      restSessionIds: retained.map((o) => o.restSessionId),
    });
  }
  return segments;
}

export function computeM3_3E_ConsumptionInputFingerprintV1(input: {
  organizationId: string;
  vehicleId: string;
  canonicalProfileFingerprint: string;
  longitudinalProfileContractVersion: string;
  profilePolicyVersion: string;
  integrityInspectionContractVersion: string;
  assessmentGradeObservations: M3_3E_AssessmentGradeObservationV1[];
}): string {
  const sorted = [...input.assessmentGradeObservations].sort(compareAssessmentGradeObservations);
  const preimage = {
    contractVersion: M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    canonicalProfileFingerprint: input.canonicalProfileFingerprint,
    longitudinalProfileContractVersion: input.longitudinalProfileContractVersion,
    profilePolicyVersion: input.profilePolicyVersion,
    integrityInspectionContractVersion: input.integrityInspectionContractVersion,
    assessmentGradeObservations: sorted.map((obs) => ({
      restSessionId: obs.restSessionId,
      anchorAt: obs.anchorAt,
      canonicalFeatureRowId: obs.canonicalFeatureRowId,
      inputDigest: obs.inputDigest,
      versionTuple: obs.versionTuple,
      features: obs.features,
      anchorResolutionStatus: obs.anchorResolutionStatus,
      chargeOpportunityClass: obs.chargeOpportunityClass,
      chargeContextCompleteness: obs.chargeContextCompleteness,
      temperatureC: obs.temperatureC,
      temperatureSource: obs.temperatureSource,
      digestVerificationScope: obs.integrityContext.digestVerificationScope,
    })),
  };
  return sha256HexLowercaseUtf8(canonicalFeatureInputUtf8(preimage));
}

function validateDefaultDispositionAccounting(input: {
  projection: LongitudinalScientificProfileProjectionV1;
  d4BySessionId: Map<string, D4PerSessionInspectionV1>;
  materializedSelfIntegrityOk: boolean;
}): M3_3E_ConsumptionRejectReason | null {
  let eligible = 0;
  let quarantined = 0;
  let sourceLimited = 0;

  for (const observation of input.projection.observations) {
    const d4Row = input.d4BySessionId.get(observation.restSessionId);
    if (!d4Row) {
      return 'D3_D4_SESSION_SET_MISMATCH';
    }
    if (d4Row.profileSlice !== 'DEFAULT') {
      return 'D3_D4_PROFILE_SLICE_MISMATCH';
    }
    switch (d4Row.integrityQualifiedDisposition) {
      case 'ELIGIBLE':
        eligible += 1;
        break;
      case 'QUARANTINED_INTEGRITY_WARNING':
        quarantined += 1;
        break;
      case 'SOURCE_EVIDENCE_LIMITED':
        sourceLimited += 1;
        break;
      case 'NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED':
      case 'NOT_APPLICABLE':
        if (input.materializedSelfIntegrityOk) {
          return 'D3_D4_CONTRACT_INCONSISTENCY';
        }
        break;
      default:
        break;
    }
  }

  const d3Default = input.projection.observations.length;
  if (d3Default !== eligible + quarantined + sourceLimited) {
    return 'D3_D4_CONTRACT_INCONSISTENCY';
  }
  return null;
}

function pairCanonicalAndVersionForObservation(
  observation: LongitudinalProfileObservationV1,
  d4Row: D4PerSessionInspectionV1,
): M3_3E_ConsumptionRejectReason | null {
  if (observation.canonical.canonicalFeatureRowId !== d4Row.canonicalFeatureRowId) {
    return 'D3_D4_CANONICAL_REFERENCE_MISMATCH';
  }
  if (!d4ResolvedTupleMatchesObservation(d4Row.versionTuple, observation.versionTuple)) {
    return 'D3_D4_VERSION_TUPLE_MISMATCH';
  }
  return null;
}

function pairCanonicalAndVersionForExcluded(
  excluded: LongitudinalProfileExcludedSessionV1,
  d4Row: D4PerSessionInspectionV1,
): M3_3E_ConsumptionRejectReason | null {
  const expectedCanonical = excluded.canonical?.canonicalFeatureRowId ?? null;
  if (expectedCanonical !== d4Row.canonicalFeatureRowId) {
    return 'D3_D4_CANONICAL_REFERENCE_MISMATCH';
  }
  if (!d4TupleMatchesExcludedVersion(d4Row.versionTuple, excluded.version)) {
    return 'D3_D4_VERSION_TUPLE_MISMATCH';
  }
  return null;
}

function buildD4SessionMap(
  inspection: M3_3D_D4_INTEGRITY_INSPECTION_V1,
): { map: Map<string, D4PerSessionInspectionV1> } | { reason: M3_3E_ConsumptionRejectReason } {
  const map = new Map<string, D4PerSessionInspectionV1>();
  for (const row of inspection.perSession) {
    if (map.has(row.restSessionId)) {
      return { reason: 'DUPLICATE_SESSION_MAPPING' };
    }
    map.set(row.restSessionId, row);
  }
  return { map };
}

export function buildLongitudinalAssessmentInputV1(
  args: M3_3E_BuildLongitudinalAssessmentInputArgs,
): M3_3E_BuildOutcome {
  const envelopeReject = validateRevisionIdentityEnvelope(args.revisionIdentity);
  if (envelopeReject) {
    return reject(envelopeReject);
  }

  if (args.d4Outcome.status === 'REVISION_NOT_FOUND') {
    return reject('REVISION_NOT_FOUND');
  }
  if (args.d4Outcome.status === 'REVISION_SELF_INTEGRITY_FAILED') {
    return reject('REVISION_SELF_INTEGRITY_FAILED');
  }

  const inspection = args.d4Outcome.inspection;
  if (inspection.materializedRevision.selfIntegrity === 'SELF_INTEGRITY_FAILED') {
    return reject('REVISION_SELF_INTEGRITY_FAILED');
  }

  const parsed = parseLongitudinalScientificProfileProjectionV1(args.scientificProfile);
  if (parsed.status === 'FAILED') {
    if (parsed.reason === 'UNSUPPORTED_PROFILE_CONTRACT') {
      return reject('UNSUPPORTED_D3_PROFILE_CONTRACT');
    }
    if (parsed.reason === 'UNSUPPORTED_PROFILE_POLICY_VERSION') {
      return reject('UNSUPPORTED_D3_PROFILE_POLICY');
    }
    return reject('MALFORMED_D3_SCIENTIFIC_PROFILE');
  }
  const projection = parsed.projection;

  if (projection.organizationId !== args.revisionIdentity.organizationId) {
    return reject('D3_D4_IDENTITY_MISMATCH');
  }
  if (projection.vehicleId !== args.revisionIdentity.vehicleId) {
    return reject('D3_D4_IDENTITY_MISMATCH');
  }
  if (
    projection.longitudinalProfileContractVersion !==
    args.revisionIdentity.longitudinalProfileContractVersion
  ) {
    return reject('D3_D4_IDENTITY_MISMATCH');
  }
  if (projection.profilePolicyVersion !== args.revisionIdentity.profilePolicyVersion) {
    return reject('D3_D4_IDENTITY_MISMATCH');
  }

  const recomputedFingerprint = sha256HexLowercaseUtf8(
    canonicalFeatureInputUtf8(projection),
  );
  if (recomputedFingerprint !== args.revisionIdentity.canonicalProfileFingerprint) {
    return reject('D3_SCIENTIFIC_PROFILE_FINGERPRINT_MISMATCH');
  }

  if (
    inspection.inspectionContractVersion !==
    REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION
  ) {
    return reject('UNSUPPORTED_D4_INSPECTION_CONTRACT');
  }

  const identity = inspection.identity;
  if (
    identity.organizationId !== args.revisionIdentity.organizationId ||
    identity.vehicleId !== args.revisionIdentity.vehicleId ||
    identity.revisionId !== args.revisionIdentity.revisionId ||
    identity.canonicalProfileFingerprint !== args.revisionIdentity.canonicalProfileFingerprint
  ) {
    return reject('D3_D4_IDENTITY_MISMATCH');
  }

  const d4MapResult = buildD4SessionMap(inspection);
  if ('reason' in d4MapResult) {
    return reject(d4MapResult.reason);
  }
  const d4BySessionId = d4MapResult.map;

  const candidateCount =
    projection.observations.length +
    projection.provisionalObservations.length +
    projection.excludedSessions.length;
  if (projection.coverage.candidateRestSessionCount !== candidateCount) {
    return reject('MALFORMED_D3_SCIENTIFIC_PROFILE');
  }
  if (inspection.perSession.length !== projection.coverage.candidateRestSessionCount) {
    return reject('D3_D4_SESSION_SET_MISMATCH');
  }

  const d3SessionIds = new Set<string>();
  for (const obs of projection.observations) {
    if (d3SessionIds.has(obs.restSessionId)) {
      return reject('MALFORMED_D3_SCIENTIFIC_PROFILE');
    }
    d3SessionIds.add(obs.restSessionId);
    const d4Row = d4BySessionId.get(obs.restSessionId);
    if (!d4Row) {
      return reject('D3_D4_SESSION_SET_MISMATCH');
    }
    if (d4Row.profileSlice !== 'DEFAULT') {
      return reject('D3_D4_PROFILE_SLICE_MISMATCH');
    }
    const pairErr = pairCanonicalAndVersionForObservation(obs, d4Row);
    if (pairErr) {
      return reject(pairErr);
    }
  }

  for (const obs of projection.provisionalObservations) {
    if (d3SessionIds.has(obs.restSessionId)) {
      return reject('MALFORMED_D3_SCIENTIFIC_PROFILE');
    }
    d3SessionIds.add(obs.restSessionId);
    const d4Row = d4BySessionId.get(obs.restSessionId);
    if (!d4Row) {
      return reject('D3_D4_SESSION_SET_MISMATCH');
    }
    if (d4Row.profileSlice !== 'PROVISIONAL') {
      return reject('D3_D4_PROFILE_SLICE_MISMATCH');
    }
    const pairErr = pairCanonicalAndVersionForObservation(obs, d4Row);
    if (pairErr) {
      return reject(pairErr);
    }
  }

  for (const excluded of projection.excludedSessions) {
    if (d3SessionIds.has(excluded.restSessionId)) {
      return reject('MALFORMED_D3_SCIENTIFIC_PROFILE');
    }
    d3SessionIds.add(excluded.restSessionId);
    const d4Row = d4BySessionId.get(excluded.restSessionId);
    if (!d4Row) {
      return reject('D3_D4_SESSION_SET_MISMATCH');
    }
    if (d4Row.profileSlice !== 'EXCLUDED') {
      return reject('D3_D4_PROFILE_SLICE_MISMATCH');
    }
    const pairErr = pairCanonicalAndVersionForExcluded(excluded, d4Row);
    if (pairErr) {
      return reject(pairErr);
    }
  }

  if (d4BySessionId.size !== d3SessionIds.size) {
    return reject('D3_D4_SESSION_SET_MISMATCH');
  }

  const dispositionReject = validateDefaultDispositionAccounting({
    projection,
    d4BySessionId,
    materializedSelfIntegrityOk: true,
  });
  if (dispositionReject) {
    return reject(dispositionReject);
  }

  let quarantinedIntegrityWarningCount = 0;
  let sourceEvidenceLimitedCount = 0;
  const assessmentGradeObservations: M3_3E_AssessmentGradeObservationV1[] = [];

  for (const observation of projection.observations) {
    const d4Row = d4BySessionId.get(observation.restSessionId)!;
    switch (d4Row.integrityQualifiedDisposition) {
      case 'ELIGIBLE':
        assessmentGradeObservations.push(buildAssessmentGradeObservation(observation, d4Row));
        break;
      case 'QUARANTINED_INTEGRITY_WARNING':
        quarantinedIntegrityWarningCount += 1;
        break;
      case 'SOURCE_EVIDENCE_LIMITED':
        sourceEvidenceLimitedCount += 1;
        break;
      default:
        break;
    }
  }

  assessmentGradeObservations.sort(compareAssessmentGradeObservations);

  const eligibleBySessionId = new Map(
    assessmentGradeObservations.map((obs) => [obs.restSessionId, obs] as const),
  );
  const eligibleVersionSegments = buildEligibleVersionSegments(projection, eligibleBySessionId);
  const evidenceWindow = computeEvidenceWindow(assessmentGradeObservations);

  const assessmentGradeObservationCount = assessmentGradeObservations.length;
  const inputAvailability =
    assessmentGradeObservationCount > 0
      ? ('ASSESSMENT_GRADE_INPUT_AVAILABLE' as const)
      : ('NO_ASSESSMENT_GRADE_INPUT' as const);

  const consumptionInputFingerprint = computeM3_3E_ConsumptionInputFingerprintV1({
    organizationId: args.revisionIdentity.organizationId,
    vehicleId: args.revisionIdentity.vehicleId,
    canonicalProfileFingerprint: args.revisionIdentity.canonicalProfileFingerprint,
    longitudinalProfileContractVersion: args.revisionIdentity.longitudinalProfileContractVersion,
    profilePolicyVersion: args.revisionIdentity.profilePolicyVersion,
    integrityInspectionContractVersion: inspection.inspectionContractVersion,
    assessmentGradeObservations,
  });

  return {
    status: 'OK',
    input: {
      contractVersion: M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION,
      identity: {
        organizationId: args.revisionIdentity.organizationId,
        vehicleId: args.revisionIdentity.vehicleId,
        revisionId: args.revisionIdentity.revisionId,
        canonicalProfileFingerprint: args.revisionIdentity.canonicalProfileFingerprint,
        longitudinalProfileContractVersion: args.revisionIdentity.longitudinalProfileContractVersion,
        profilePolicyVersion: args.revisionIdentity.profilePolicyVersion,
        integrityInspectionContractVersion: inspection.inspectionContractVersion,
      },
      evidenceWindow,
      coverage: {
        d3DefaultObservationCount: projection.observations.length,
        assessmentGradeObservationCount,
        quarantinedIntegrityWarningCount,
        sourceEvidenceLimitedCount,
        provisionalContextCount: projection.provisionalObservations.length,
        excludedContextCount: projection.excludedSessions.length,
        d4DigestVerificationScope: inspection.coverage.digestVerificationScope,
        d4Rebuildability: inspection.profile.rebuildability,
      },
      assessmentGradeObservations,
      eligibleVersionSegments,
      modelEvaluation: {
        inputAvailability,
        modelSufficiency: 'NOT_EVALUATED',
      },
      diagnosticContext: {
        d4OverallStatus: inspection.profile.overallStatus,
        inspectionFlags: [...inspection.profile.inspectionFlags],
        rebuildability: inspection.profile.rebuildability,
      },
      consumptionInputFingerprint,
    },
  };
}
