import type { BatteryRestSessionFeature } from '@prisma/client';
import { computeDigestVerificationAccounting } from '../rest-session-feature-shadow-inspection.digest';
import {
  deriveSemanticRevisionIntegrityFromAggregate,
  verifyPersistedFeatureRowDigest,
} from '../rest-session-feature-shadow-inspection.integrity';
import type { RestSessionFeatureRevisionIntegrityAggregate } from '../rest-session-feature-inspection.repository.types';
import {
  parseHistoricalFeatureInputSummaryForD4,
  type D4HistoricalFeatureInputSummaryOutcome,
} from './longitudinal-historical-input-summary.parser';
import type {
  D4DimensionResult,
  D4IntegrityQualifiedDisposition,
  D4PerSessionInspectionV1,
  D4ProfileSlice,
  D4ReasonCode,
  D4SourceEvidenceAvailability,
  D4VersionTupleEnvelope,
} from './longitudinal-integrity-inspection.types';
import type {
  LongitudinalProfileExcludedSessionV1,
  LongitudinalProfileObservationV1,
} from './longitudinal-profile.types';

export type D4ProfileSessionCandidate = {
  restSessionId: string;
  profileSlice: D4ProfileSlice;
  anchorAt: string;
  canonicalFeatureRowId: string | null;
  versionTuple: D4VersionTupleEnvelope;
  observation?: LongitudinalProfileObservationV1;
  excluded?: LongitudinalProfileExcludedSessionV1;
};

export type D4SourceIntegrityBatchContext = {
  organizationId: string;
  vehicleId: string;
  revisionCreatedAt: Date;
  selfIntegrityFailed: boolean;
  sourceRowsById: Map<string, BatteryRestSessionFeature>;
  aggregatesBySessionKey: Map<string, RestSessionFeatureRevisionIntegrityAggregate>;
  totalRowsBySessionKey: Map<string, number>;
  latestRowsBySessionKey: Map<string, BatteryRestSessionFeature[]>;
};

export function buildD4SessionVersionKey(input: {
  restSessionId: string;
  featureModelVersion: string;
  retentionPolicyVersion: string;
  chargeOpportunityPolicyVersion: string;
}): string {
  return [
    input.restSessionId,
    input.featureModelVersion,
    input.retentionPolicyVersion,
    input.chargeOpportunityPolicyVersion,
  ].join('\u0000');
}

function scalarFieldsEqual(
  observation: LongitudinalProfileObservationV1,
  row: BatteryRestSessionFeature,
): boolean {
  const f = observation.features;
  return (
    f.shutdownToFirstRestDeltaMv === row.shutdownToFirstRestDeltaMv &&
    f.robustRestSlopeMvPerHour === row.robustRestSlopeMvPerHour &&
    f.minimumRestVoltageMv === row.minimumRestVoltageMv &&
    f.maximumRestVoltageMv === row.maximumRestVoltageMv &&
    f.medianRestVoltageMv === row.medianRestVoltageMv &&
    f.restVoltageVarianceMv2 === row.restVoltageVarianceMv2 &&
    f.numberOfValidRestPoints === row.numberOfValidRestPoints &&
    f.maxActualRestAgeMs === row.maxActualRestAgeMs &&
    f.maxInterObservationGapMs === row.maxInterObservationGapMs &&
    f.observationSpanMs === row.observationSpanMs &&
    f.missingRungCount === row.missingRungCount &&
    f.chargeOpportunityClass === row.chargeOpportunityClass
  );
}

function versionEnvelopeFromObservation(
  observation: LongitudinalProfileObservationV1,
): D4VersionTupleEnvelope {
  return {
    featureModelVersion: observation.versionTuple.featureModelVersion,
    retentionPolicyVersion: observation.versionTuple.retentionPolicyVersion,
    chargeOpportunityPolicyVersion: observation.versionTuple.chargeOpportunityPolicyVersion,
    inputContractVersion: observation.versionTuple.inputContractVersion,
    inputContractResolution: 'RESOLVED',
  };
}

function versionEnvelopeFromExcluded(
  excluded: LongitudinalProfileExcludedSessionV1,
): D4VersionTupleEnvelope {
  if (!excluded.version) return null;
  return {
    featureModelVersion: excluded.version.featureModelVersion,
    retentionPolicyVersion: excluded.version.retentionPolicyVersion,
    chargeOpportunityPolicyVersion: excluded.version.chargeOpportunityPolicyVersion,
    inputContractVersion: excluded.version.inputContractVersion,
    inputContractResolution: excluded.version.inputContractResolution,
  };
}

function defaultDispositionFromSession(input: {
  selfIntegrityFailed: boolean;
  reasons: D4ReasonCode[];
  sourceEvidenceAvailability: D4SourceEvidenceAvailability;
}): D4IntegrityQualifiedDisposition {
  if (input.selfIntegrityFailed) {
    return 'NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED';
  }
  const warningReasons: D4ReasonCode[] = [
    'SOURCE_DIGEST_MISMATCH',
    'SOURCE_CONTENT_MISMATCH',
    'SOURCE_TEMPORAL_ORDER_INVALID',
    'SEMANTIC_REVISION_GAP',
    'SEMANTIC_REVISION_DUPLICATE',
    'SOURCE_IDENTITY_MISMATCH',
    'SOURCE_VERSION_MISMATCH',
  ];
  if (input.reasons.some((r) => warningReasons.includes(r))) {
    return 'QUARANTINED_INTEGRITY_WARNING';
  }
  if (
    input.sourceEvidenceAvailability === 'MISSING' ||
    input.reasons.includes('UNSUPPORTED_SOURCE_INPUT_CONTRACT')
  ) {
    return 'SOURCE_EVIDENCE_LIMITED';
  }
  return 'ELIGIBLE';
}

function applyHistoricalInputOutcome(input: {
  historical: D4HistoricalFeatureInputSummaryOutcome;
  observation: LongitudinalProfileObservationV1;
  reasons: D4ReasonCode[];
  sourceIdentity: D4DimensionResult;
}): {
  sourceIdentity: D4DimensionResult;
  sourceSnapshotContextIntegrity: D4DimensionResult;
} {
  let sourceIdentity = input.sourceIdentity;
  let sourceSnapshotContextIntegrity: D4DimensionResult = 'NOT_EVALUATED';

  switch (input.historical.status) {
    case 'VERSION_UNRESOLVED_OR_MISMATCH':
      sourceIdentity = sourceIdentity === 'PASS' ? 'FAIL' : sourceIdentity;
      input.reasons.push('SOURCE_VERSION_MISMATCH');
      break;
    case 'IDENTITY_MISMATCH':
      sourceIdentity = 'FAIL';
      input.reasons.push('SOURCE_IDENTITY_MISMATCH');
      break;
    case 'MALFORMED_SUPPORTED_INPUT_SUMMARY':
      sourceSnapshotContextIntegrity = 'FAIL';
      input.reasons.push('SOURCE_CONTENT_MISMATCH');
      break;
    case 'UNSUPPORTED_SOURCE_INPUT_CONTRACT':
      input.reasons.push('UNSUPPORTED_SOURCE_INPUT_CONTRACT');
      break;
    case 'OK': {
      const parsed = input.historical.parsed;
      const obs = input.observation;
      const snapshotOk =
        parsed.anchorResolutionStatus === obs.anchorResolutionStatus &&
        JSON.stringify(parsed.chargeContextCompleteness) ===
          JSON.stringify(obs.chargeContextCompleteness) &&
        parsed.temperatureC === obs.temperatureC &&
        parsed.temperatureSource === obs.temperatureSource;
      sourceSnapshotContextIntegrity = snapshotOk ? 'PASS' : 'FAIL';
      if (!snapshotOk) input.reasons.push('SOURCE_CONTENT_MISMATCH');
      break;
    }
    default:
      break;
  }

  return { sourceIdentity, sourceSnapshotContextIntegrity };
}

function evaluateRevisionLineageAndDigest(input: {
  ctx: D4SourceIntegrityBatchContext;
  candidate: D4ProfileSessionCandidate;
  row: BatteryRestSessionFeature;
  version: {
    featureModelVersion: string;
    retentionPolicyVersion: string;
    chargeOpportunityPolicyVersion: string;
  };
  reasons: D4ReasonCode[];
}): Pick<
  D4PerSessionInspectionV1,
  | 'revisionLineage'
  | 'digestIntegrity'
  | 'digestRowsChecked'
  | 'digestRowsUnchecked'
  | 'digestVerificationScope'
  | 'sourceTemporalProvenance'
> {
  let digestIntegrity: D4DimensionResult = verifyPersistedFeatureRowDigest(input.row)
    ? 'PASS'
    : 'FAIL';
  if (digestIntegrity === 'FAIL') input.reasons.push('SOURCE_DIGEST_MISMATCH');

  let sourceTemporalProvenance: D4DimensionResult =
    input.row.createdAt.getTime() <= input.ctx.revisionCreatedAt.getTime() ? 'PASS' : 'FAIL';
  if (sourceTemporalProvenance === 'FAIL') {
    input.reasons.push('SOURCE_TEMPORAL_ORDER_INVALID');
  }

  let revisionLineage: D4DimensionResult = 'NOT_EVALUATED';
  let digestRowsChecked = 0;
  let digestRowsUnchecked = 0;
  let digestVerificationScope: D4PerSessionInspectionV1['digestVerificationScope'] =
    'NOT_EVALUATED';

  const sessionKey = buildD4SessionVersionKey({
    restSessionId: input.candidate.restSessionId,
    featureModelVersion: input.version.featureModelVersion,
    retentionPolicyVersion: input.version.retentionPolicyVersion,
    chargeOpportunityPolicyVersion: input.version.chargeOpportunityPolicyVersion,
  });
  const aggregate = input.ctx.aggregatesBySessionKey.get(sessionKey) ?? null;
  const totalRows = input.ctx.totalRowsBySessionKey.get(sessionKey) ?? 0;
  const latestRows = input.ctx.latestRowsBySessionKey.get(sessionKey) ?? [];

  if (aggregate) {
    const lineage = deriveSemanticRevisionIntegrityFromAggregate(aggregate);
    revisionLineage =
      lineage.semanticRevisionGapCount > 0 || lineage.duplicateSemanticRevisionCount > 0
        ? 'FAIL'
        : 'PASS';
    if (lineage.semanticRevisionGapCount > 0) input.reasons.push('SEMANTIC_REVISION_GAP');
    if (lineage.duplicateSemanticRevisionCount > 0) {
      input.reasons.push('SEMANTIC_REVISION_DUPLICATE');
    }

    const digestAccounting = computeDigestVerificationAccounting({
      totalRows,
      latestRows,
      canonicalRow: input.row,
      includeRaw: false,
    });
    digestRowsChecked = digestAccounting.digestRowsChecked;
    digestRowsUnchecked = digestAccounting.digestRowsUnchecked;
    digestVerificationScope = digestAccounting.digestVerificationScope;
    if (digestVerificationScope === 'BOUNDED_LATEST_WINDOW') {
      input.reasons.push('DIGEST_COVERAGE_PARTIAL');
    }
  }

  return {
    revisionLineage,
    digestIntegrity,
    digestRowsChecked,
    digestRowsUnchecked,
    digestVerificationScope,
    sourceTemporalProvenance,
  };
}

function evaluateCanonicalRowIdentityForExcluded(input: {
  ctx: D4SourceIntegrityBatchContext;
  candidate: D4ProfileSessionCandidate;
  row: BatteryRestSessionFeature;
  excluded: LongitudinalProfileExcludedSessionV1;
  reasons: D4ReasonCode[];
}): D4DimensionResult {
  const excluded = input.excluded;
  const canonical = excluded.canonical!;
  let sourceIdentity: D4DimensionResult = 'PASS';
  if (
    input.row.organizationId !== input.ctx.organizationId ||
    input.row.vehicleId !== input.ctx.vehicleId ||
    input.row.restSessionId !== input.candidate.restSessionId ||
    input.row.id !== canonical.canonicalFeatureRowId ||
    input.row.semanticRevision !== canonical.semanticRevision ||
    input.row.inputDigest !== canonical.inputDigest ||
    input.row.computationPhase !== canonical.computationPhase ||
    input.row.sessionTrust !== canonical.sessionTrust
  ) {
    sourceIdentity = 'FAIL';
    input.reasons.push('SOURCE_IDENTITY_MISMATCH');
  }
  if (excluded.version) {
    if (
      input.row.featureModelVersion !== excluded.version.featureModelVersion ||
      input.row.retentionPolicyVersion !== excluded.version.retentionPolicyVersion ||
      input.row.chargeOpportunityPolicyVersion !== excluded.version.chargeOpportunityPolicyVersion
    ) {
      sourceIdentity = 'FAIL';
      input.reasons.push('SOURCE_VERSION_MISMATCH');
    }
    if (
      excluded.version.inputContractResolution === 'RESOLVED' &&
      excluded.version.inputContractVersion
    ) {
      const historical = parseHistoricalFeatureInputSummaryForD4({
        inputSummary: input.row.inputSummary,
        organizationId: input.ctx.organizationId,
        vehicleId: input.ctx.vehicleId,
        restSessionId: input.candidate.restSessionId,
        expectedInputContractVersion: excluded.version.inputContractVersion,
      });
      if (historical.status === 'UNSUPPORTED_SOURCE_INPUT_CONTRACT') {
        input.reasons.push('UNSUPPORTED_SOURCE_INPUT_CONTRACT');
      } else if (historical.status === 'VERSION_UNRESOLVED_OR_MISMATCH') {
        sourceIdentity = 'FAIL';
        input.reasons.push('SOURCE_VERSION_MISMATCH');
      } else if (historical.status === 'IDENTITY_MISMATCH') {
        sourceIdentity = 'FAIL';
        input.reasons.push('SOURCE_IDENTITY_MISMATCH');
      } else if (historical.status === 'MALFORMED_SUPPORTED_INPUT_SUMMARY') {
        input.reasons.push('SOURCE_CONTENT_MISMATCH');
      }
    }
  }
  return sourceIdentity;
}

export function evaluateD4SourceIntegrityForSession(
  candidate: D4ProfileSessionCandidate,
  ctx: D4SourceIntegrityBatchContext,
): D4PerSessionInspectionV1 {
  const reasons: D4ReasonCode[] = [];
  let sourceEvidenceAvailability: D4SourceEvidenceAvailability;
  if (candidate.canonicalFeatureRowId === null) {
    sourceEvidenceAvailability = 'NO_SOURCE_REFERENCE_EXPECTED';
  } else {
    sourceEvidenceAvailability = ctx.sourceRowsById.has(candidate.canonicalFeatureRowId)
      ? 'FOUND'
      : 'MISSING';
  }

  const notApplicableContent: D4DimensionResult = 'NOT_APPLICABLE';
  let sourceIdentity: D4DimensionResult = 'NOT_APPLICABLE';
  let sourceFeatureScalarIntegrity: D4DimensionResult = 'NOT_APPLICABLE';
  let sourceSnapshotContextIntegrity: D4DimensionResult = 'NOT_APPLICABLE';
  let sourceTemporalProvenance: D4DimensionResult = 'NOT_APPLICABLE';
  let digestIntegrity: D4DimensionResult = 'NOT_APPLICABLE';
  let revisionLineage: D4DimensionResult = 'NOT_APPLICABLE';
  let digestRowsChecked = 0;
  let digestRowsUnchecked = 0;
  let digestVerificationScope: D4PerSessionInspectionV1['digestVerificationScope'] =
    'NOT_EVALUATED';

  const row =
    candidate.canonicalFeatureRowId !== null
      ? ctx.sourceRowsById.get(candidate.canonicalFeatureRowId) ?? null
      : null;

  if (candidate.canonicalFeatureRowId === null) {
    sourceIdentity = 'NOT_APPLICABLE';
    sourceFeatureScalarIntegrity = notApplicableContent;
    sourceSnapshotContextIntegrity = notApplicableContent;
    sourceTemporalProvenance = 'NOT_APPLICABLE';
    digestIntegrity = 'NOT_APPLICABLE';
    revisionLineage = 'NOT_APPLICABLE';
  } else if (sourceEvidenceAvailability === 'MISSING') {
    sourceIdentity = 'NOT_EVALUATED';
    sourceTemporalProvenance = 'NOT_EVALUATED';
    digestIntegrity = 'NOT_EVALUATED';
    revisionLineage = 'NOT_EVALUATED';
    if (candidate.profileSlice === 'EXCLUDED') {
      sourceFeatureScalarIntegrity = notApplicableContent;
      sourceSnapshotContextIntegrity = notApplicableContent;
    } else {
      sourceFeatureScalarIntegrity = 'NOT_EVALUATED';
      sourceSnapshotContextIntegrity = 'NOT_EVALUATED';
    }
    reasons.push('SOURCE_ROW_MISSING');
  } else if (row && candidate.profileSlice === 'EXCLUDED' && candidate.excluded?.canonical) {
    sourceIdentity = evaluateCanonicalRowIdentityForExcluded({
      ctx,
      candidate,
      row,
      excluded: candidate.excluded,
      reasons,
    });
    sourceFeatureScalarIntegrity = 'NOT_APPLICABLE';
    sourceSnapshotContextIntegrity = 'NOT_APPLICABLE';
    const version = candidate.excluded.version;
    if (version) {
      const lineageDigest = evaluateRevisionLineageAndDigest({
        ctx,
        candidate,
        row,
        version,
        reasons,
      });
      sourceTemporalProvenance = lineageDigest.sourceTemporalProvenance;
      digestIntegrity = lineageDigest.digestIntegrity;
      revisionLineage = lineageDigest.revisionLineage;
      digestRowsChecked = lineageDigest.digestRowsChecked;
      digestRowsUnchecked = lineageDigest.digestRowsUnchecked;
      digestVerificationScope = lineageDigest.digestVerificationScope;
    } else {
      sourceTemporalProvenance =
        row.createdAt.getTime() <= ctx.revisionCreatedAt.getTime() ? 'PASS' : 'FAIL';
      if (sourceTemporalProvenance === 'FAIL') {
        reasons.push('SOURCE_TEMPORAL_ORDER_INVALID');
      }
      digestIntegrity = verifyPersistedFeatureRowDigest(row) ? 'PASS' : 'FAIL';
      if (digestIntegrity === 'FAIL') reasons.push('SOURCE_DIGEST_MISMATCH');
    }
  } else if (row && candidate.observation) {
    const obs = candidate.observation;
    const canonical = obs.canonical;
    sourceIdentity = 'PASS';
    if (
      row.organizationId !== ctx.organizationId ||
      row.vehicleId !== ctx.vehicleId ||
      row.restSessionId !== candidate.restSessionId ||
      row.id !== canonical.canonicalFeatureRowId ||
      row.semanticRevision !== canonical.semanticRevision ||
      row.inputDigest !== canonical.inputDigest ||
      row.computationPhase !== canonical.computationPhase ||
      row.sessionTrust !== canonical.sessionTrust ||
      row.featureModelVersion !== obs.versionTuple.featureModelVersion ||
      row.retentionPolicyVersion !== obs.versionTuple.retentionPolicyVersion ||
      row.chargeOpportunityPolicyVersion !== obs.versionTuple.chargeOpportunityPolicyVersion
    ) {
      sourceIdentity = 'FAIL';
      reasons.push('SOURCE_IDENTITY_MISMATCH');
    }

    const historical = parseHistoricalFeatureInputSummaryForD4({
      inputSummary: row.inputSummary,
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      restSessionId: candidate.restSessionId,
      expectedInputContractVersion: obs.versionTuple.inputContractVersion,
    });
    const historicalApplied = applyHistoricalInputOutcome({
      historical,
      observation: obs,
      reasons,
      sourceIdentity,
    });
    sourceIdentity = historicalApplied.sourceIdentity;
    sourceSnapshotContextIntegrity = historicalApplied.sourceSnapshotContextIntegrity;

    sourceFeatureScalarIntegrity = scalarFieldsEqual(obs, row) ? 'PASS' : 'FAIL';
    if (sourceFeatureScalarIntegrity === 'FAIL') {
      reasons.push('SOURCE_CONTENT_MISMATCH');
    }

    const lineageDigest = evaluateRevisionLineageAndDigest({
      ctx,
      candidate,
      row,
      version: obs.versionTuple,
      reasons,
    });
    sourceTemporalProvenance = lineageDigest.sourceTemporalProvenance;
    digestIntegrity = lineageDigest.digestIntegrity;
    revisionLineage = lineageDigest.revisionLineage;
    digestRowsChecked = lineageDigest.digestRowsChecked;
    digestRowsUnchecked = lineageDigest.digestRowsUnchecked;
    digestVerificationScope = lineageDigest.digestVerificationScope;
  }

  const integrityQualifiedDisposition =
    candidate.profileSlice === 'DEFAULT'
      ? defaultDispositionFromSession({
          selfIntegrityFailed: ctx.selfIntegrityFailed,
          reasons,
          sourceEvidenceAvailability,
        })
      : 'NOT_APPLICABLE';

  return {
    restSessionId: candidate.restSessionId,
    profileSlice: candidate.profileSlice,
    versionTuple: candidate.versionTuple,
    canonicalFeatureRowId: candidate.canonicalFeatureRowId,
    sourceEvidenceAvailability,
    sourceIdentity,
    sourceFeatureScalarIntegrity,
    sourceSnapshotContextIntegrity,
    sourceTemporalProvenance,
    digestIntegrity,
    revisionLineage,
    digestRowsChecked,
    digestRowsUnchecked,
    digestVerificationScope,
    integrityQualifiedDisposition,
    reasons: [...new Set(reasons)],
  };
}

export function buildD4ProfileSessionCandidates(input: {
  observations: LongitudinalProfileObservationV1[];
  provisionalObservations: LongitudinalProfileObservationV1[];
  excludedSessions: LongitudinalProfileExcludedSessionV1[];
}): D4ProfileSessionCandidate[] {
  const candidates: D4ProfileSessionCandidate[] = [];
  for (const observation of input.observations) {
    candidates.push({
      restSessionId: observation.restSessionId,
      profileSlice: 'DEFAULT',
      anchorAt: observation.anchorAt,
      canonicalFeatureRowId: observation.canonical.canonicalFeatureRowId,
      versionTuple: versionEnvelopeFromObservation(observation),
      observation,
    });
  }
  for (const observation of input.provisionalObservations) {
    candidates.push({
      restSessionId: observation.restSessionId,
      profileSlice: 'PROVISIONAL',
      anchorAt: observation.anchorAt,
      canonicalFeatureRowId: observation.canonical.canonicalFeatureRowId,
      versionTuple: versionEnvelopeFromObservation(observation),
      observation,
    });
  }
  for (const excluded of input.excludedSessions) {
    candidates.push({
      restSessionId: excluded.restSessionId,
      profileSlice: 'EXCLUDED',
      anchorAt: excluded.anchorAt,
      canonicalFeatureRowId: excluded.canonical?.canonicalFeatureRowId ?? null,
      versionTuple: versionEnvelopeFromExcluded(excluded),
      excluded,
    });
  }
  return candidates;
}

export function isVerifiableSourceReference(session: D4PerSessionInspectionV1): boolean {
  if (session.canonicalFeatureRowId === null) return false;
  if (session.sourceEvidenceAvailability !== 'FOUND') return false;
  if (session.sourceIdentity !== 'PASS') return false;
  if (session.digestIntegrity !== 'PASS') return false;
  if (session.sourceTemporalProvenance !== 'PASS') return false;
  if (session.profileSlice === 'DEFAULT' || session.profileSlice === 'PROVISIONAL') {
    if (session.sourceFeatureScalarIntegrity !== 'PASS') return false;
    if (
      session.sourceSnapshotContextIntegrity !== 'PASS' &&
      session.sourceSnapshotContextIntegrity !== 'NOT_EVALUATED'
    ) {
      return false;
    }
    if (
      session.reasons.includes('UNSUPPORTED_SOURCE_INPUT_CONTRACT') &&
      session.sourceSnapshotContextIntegrity === 'NOT_EVALUATED' &&
      session.sourceFeatureScalarIntegrity === 'PASS'
    ) {
      return false;
    }
  }
  return true;
}
