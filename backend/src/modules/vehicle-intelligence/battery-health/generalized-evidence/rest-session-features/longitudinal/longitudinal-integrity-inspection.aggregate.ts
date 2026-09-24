import { D4_INSPECTION_FLAG_ORDER } from './longitudinal-integrity-inspection.constants';
import type {
  D4DigestVerificationScope,
  D4InspectionFlagV1,
  D4InspectionOverallStatus,
  D4PerSessionInspectionV1,
  D4RebuildabilityStatus,
  M3_3D_D4_INTEGRITY_INSPECTION_V1,
} from './longitudinal-integrity-inspection.types';
import {
  buildD4ProfileSessionCandidates,
  isVerifiableSourceReference,
  type D4SourceIntegrityBatchContext,
  evaluateD4SourceIntegrityForSession,
} from './longitudinal-integrity-inspection.source-integrity';
import type { LongitudinalScientificProfileProjectionV1 } from './longitudinal-profile-scientific-projection';

function aggregateDigestScope(
  perSession: D4PerSessionInspectionV1[],
): D4DigestVerificationScope {
  const evaluated = perSession.filter((s) => s.digestVerificationScope !== 'NOT_EVALUATED');
  if (evaluated.length === 0) return 'NOT_EVALUATED';
  if (evaluated.some((s) => s.digestVerificationScope === 'BOUNDED_LATEST_WINDOW')) {
    return 'BOUNDED_LATEST_WINDOW';
  }
  return 'FULL';
}

function computeRebuildability(input: {
  sourceReferencesExpected: number;
  verifiableSourceReferenceCount: number;
}): D4RebuildabilityStatus {
  if (input.sourceReferencesExpected === 0) return 'FULL';
  if (input.verifiableSourceReferenceCount === 0) return 'UNAVAILABLE';
  if (input.verifiableSourceReferenceCount < input.sourceReferencesExpected) {
    return 'PARTIAL';
  }
  return 'FULL';
}

function computeOverallStatus(input: {
  selfIntegrityFailed: boolean;
  perSession: D4PerSessionInspectionV1[];
  profileDigestScope: D4DigestVerificationScope;
}): D4InspectionOverallStatus {
  if (input.selfIntegrityFailed) {
    return 'REVISION_SELF_INTEGRITY_FAILED';
  }

  const warningReasons = new Set([
    'SOURCE_DIGEST_MISMATCH',
    'SOURCE_CONTENT_MISMATCH',
    'SOURCE_TEMPORAL_ORDER_INVALID',
    'SEMANTIC_REVISION_GAP',
    'SEMANTIC_REVISION_DUPLICATE',
    'SOURCE_IDENTITY_MISMATCH',
    'SOURCE_VERSION_MISMATCH',
  ]);
  const hasIntegrityWarning = input.perSession.some((session) =>
    session.reasons.some((r) => warningReasons.has(r)),
  );
  if (hasIntegrityWarning) return 'INTEGRITY_WARNING';

  const hasSourceLimitation = input.perSession.some(
    (session) =>
      session.sourceEvidenceAvailability === 'MISSING' ||
      session.reasons.includes('UNSUPPORTED_SOURCE_INPUT_CONTRACT'),
  );
  if (hasSourceLimitation) return 'SOURCE_EVIDENCE_LIMITED';

  if (input.profileDigestScope === 'BOUNDED_LATEST_WINDOW') {
    return 'INTEGRITY_PARTIAL';
  }

  return 'OK';
}

function buildInspectionFlags(input: {
  overallStatus: D4InspectionOverallStatus;
  rebuildability: D4RebuildabilityStatus;
  perSession: D4PerSessionInspectionV1[];
  profileDigestScope: D4DigestVerificationScope;
}): D4InspectionFlagV1[] {
  const flags: D4InspectionFlagV1[] = [];
  const integrityLimited =
    input.overallStatus === 'INTEGRITY_PARTIAL' ||
    input.overallStatus === 'INTEGRITY_WARNING' ||
    input.profileDigestScope === 'BOUNDED_LATEST_WINDOW';
  if (integrityLimited) flags.push('INTEGRITY_LIMITED');

  const sourceLimited = input.perSession.some(
    (session) =>
      session.sourceEvidenceAvailability === 'MISSING' ||
      session.reasons.includes('UNSUPPORTED_SOURCE_INPUT_CONTRACT'),
  );
  if (sourceLimited || input.overallStatus === 'SOURCE_EVIDENCE_LIMITED') {
    flags.push('SOURCE_EVIDENCE_LIMITED');
  }

  if (input.rebuildability !== 'FULL') {
    flags.push('REBUILDABILITY_LIMITED');
  }

  return D4_INSPECTION_FLAG_ORDER.filter((flag) => flags.includes(flag));
}

export function aggregateD4InspectionOverlay(input: {
  projection: LongitudinalScientificProfileProjectionV1;
  revisionId: string;
  canonicalProfileFingerprint: string;
  inspectionGeneratedAt: string;
  selfIntegrityFailed: boolean;
  selfIntegrityReasons: M3_3D_D4_INTEGRITY_INSPECTION_V1['materializedRevision']['selfIntegrityReasons'];
  batchContext: D4SourceIntegrityBatchContext;
}): M3_3D_D4_INTEGRITY_INSPECTION_V1 {
  const candidates = buildD4ProfileSessionCandidates({
    observations: input.projection.observations,
    provisionalObservations: input.projection.provisionalObservations,
    excludedSessions: input.projection.excludedSessions,
  });

  const perSession = candidates.map((candidate) =>
    evaluateD4SourceIntegrityForSession(candidate, input.batchContext),
  );

  const sourceReferencesExpected = perSession.filter(
    (s) => s.canonicalFeatureRowId !== null,
  ).length;
  const sourceRowsFound = perSession.filter(
    (s) => s.sourceEvidenceAvailability === 'FOUND',
  ).length;
  const sourceRowsMissing = perSession.filter(
    (s) => s.sourceEvidenceAvailability === 'MISSING',
  ).length;
  const verifiableSourceReferenceCount = perSession.filter(isVerifiableSourceReference).length;

  const digestRowsChecked = perSession.reduce((sum, s) => sum + s.digestRowsChecked, 0);
  const digestRowsUnchecked = perSession.reduce((sum, s) => sum + s.digestRowsUnchecked, 0);
  const profileDigestScope = aggregateDigestScope(perSession);

  const defaultSessions = perSession.filter((s) => s.profileSlice === 'DEFAULT');
  const defaultObservationCount = defaultSessions.length;
  const integrityQualifiedDefaultCount = defaultSessions.filter(
    (s) => s.integrityQualifiedDisposition === 'ELIGIBLE',
  ).length;
  const quarantinedIntegrityWarningDefaultCount = defaultSessions.filter(
    (s) => s.integrityQualifiedDisposition === 'QUARANTINED_INTEGRITY_WARNING',
  ).length;
  const sourceEvidenceLimitedDefaultCount = defaultSessions.filter(
    (s) => s.integrityQualifiedDisposition === 'SOURCE_EVIDENCE_LIMITED',
  ).length;
  const notEligibleRevisionSelfIntegrityFailedDefaultCount = defaultSessions.filter(
    (s) => s.integrityQualifiedDisposition === 'NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED',
  ).length;

  if (
    defaultObservationCount !==
    integrityQualifiedDefaultCount +
      quarantinedIntegrityWarningDefaultCount +
      sourceEvidenceLimitedDefaultCount +
      notEligibleRevisionSelfIntegrityFailedDefaultCount
  ) {
    throw new Error('D4 default disposition accounting invariant violated');
  }

  const rebuildability = computeRebuildability({
    sourceReferencesExpected,
    verifiableSourceReferenceCount,
  });

  const overallStatus = computeOverallStatus({
    selfIntegrityFailed: input.selfIntegrityFailed,
    perSession,
    profileDigestScope,
  });

  const inspectionFlags = buildInspectionFlags({
    overallStatus,
    rebuildability,
    perSession,
    profileDigestScope,
  });

  return {
    inspectionContractVersion: 'M3_3D_D4_INTEGRITY_INSPECTION_V1',
    inspectionGeneratedAt: input.inspectionGeneratedAt,
    snapshotIsolation: 'REPEATABLE_READ',
    identity: {
      organizationId: input.projection.organizationId,
      vehicleId: input.projection.vehicleId,
      revisionId: input.revisionId,
      canonicalProfileFingerprint: input.canonicalProfileFingerprint,
    },
    materializedRevision: {
      selfIntegrity: input.selfIntegrityFailed ? 'SELF_INTEGRITY_FAILED' : 'SELF_INTEGRITY_OK',
      selfIntegrityReasons: input.selfIntegrityReasons,
    },
    coverage: {
      candidateRestSessionCount: input.projection.coverage.candidateRestSessionCount,
      sourceReferencesExpected,
      sourceRowsFound,
      sourceRowsMissing,
      verifiableSourceReferenceCount,
      digestRowsChecked,
      digestRowsUnchecked,
      digestVerificationScope: profileDigestScope,
    },
    profile: {
      overallStatus,
      inspectionFlags,
      rebuildability,
      defaultObservationCount,
      integrityQualifiedDefaultCount,
      quarantinedIntegrityWarningDefaultCount,
      sourceEvidenceLimitedDefaultCount,
      notEligibleRevisionSelfIntegrityFailedDefaultCount,
    },
    perSession,
  };
}
