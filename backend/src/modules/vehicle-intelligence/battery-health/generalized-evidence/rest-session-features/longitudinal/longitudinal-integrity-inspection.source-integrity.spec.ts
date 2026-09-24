import type { BatteryRestSessionFeature } from '@prisma/client';
import { REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION } from '../rest-session-feature.constants';
import {
  buildD4ProfileSessionCandidates,
  evaluateD4SourceIntegrityForSession,
  isVerifiableSourceReference,
} from './longitudinal-integrity-inspection.source-integrity';
import { aggregateD4InspectionOverlay } from './longitudinal-integrity-inspection.aggregate';
import {
  buildD4TestBatchContext,
  buildD4TestProjection,
  buildMatchingFeatureRowForObservation,
  buildProfileTestInventoryItem,
  buildVerifiableSourceContextForSession,
  defaultSingleSessionInventory,
  PROFILE_TEST_ORG,
  PROFILE_TEST_VEHICLE,
} from './longitudinal-integrity-inspection.test-helpers';
import { buildD4SessionVersionKey } from './longitudinal-integrity-inspection.source-integrity';
import type { RestSessionFeatureRevisionIntegrityAggregate } from '../rest-session-feature-inspection.repository.types';
import { buildMinimalLongitudinalInputSummary } from './longitudinal-input.test-fixtures';

describe('longitudinal-integrity-inspection.source-integrity', () => {
  it('marks missing canonical source as SOURCE_ROW_MISSING', () => {
    const projection = buildD4TestProjection(defaultSingleSessionInventory());
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], buildD4TestBatchContext());
    expect(session.sourceEvidenceAvailability).toBe('MISSING');
    expect(session.reasons).toContain('SOURCE_ROW_MISSING');
    expect(isVerifiableSourceReference(session)).toBe(false);
  });

  it('passes identity, scalar, snapshot, digest when row matches observation', () => {
    const { projection, row, batchContext } = buildVerifiableSourceContextForSession('s1');
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], batchContext);
    expect(session.sourceEvidenceAvailability).toBe('FOUND');
    expect(session.sourceIdentity).toBe('PASS');
    expect(session.sourceFeatureScalarIntegrity).toBe('PASS');
    expect(session.sourceSnapshotContextIntegrity).toBe('PASS');
    expect(session.digestIntegrity).toBe('PASS');
    expect(session.sourceTemporalProvenance).toBe('PASS');
    expect(session.integrityQualifiedDisposition).toBe('ELIGIBLE');
    expect(isVerifiableSourceReference(session)).toBe(true);
    expect(row.id).toBe(projection.observations[0].canonical.canonicalFeatureRowId);
  });

  it('emits SOURCE_CONTENT_MISMATCH on scalar drift', () => {
    const { projection, batchContext } = buildVerifiableSourceContextForSession('s1');
    const obs = projection.observations[0];
    const row = buildMatchingFeatureRowForObservation(obs, {
      minimumRestVoltageMv: 99999,
    });
    batchContext.sourceRowsById.set(row.id, row);
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], batchContext);
    expect(session.sourceFeatureScalarIntegrity).toBe('FAIL');
    expect(session.reasons).toContain('SOURCE_CONTENT_MISMATCH');
    expect(session.integrityQualifiedDisposition).toBe('QUARANTINED_INTEGRITY_WARNING');
  });

  it('emits SOURCE_DIGEST_MISMATCH when digest invalid', () => {
    const { projection, batchContext } = buildVerifiableSourceContextForSession('s1');
    const obs = projection.observations[0];
    const row = buildMatchingFeatureRowForObservation(obs, {
      inputDigest: 'deadbeef'.repeat(8),
    });
    batchContext.sourceRowsById.set(row.id, row);
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], batchContext);
    expect(session.digestIntegrity).toBe('FAIL');
    expect(session.reasons).toContain('SOURCE_DIGEST_MISMATCH');
  });

  it('emits SOURCE_TEMPORAL_ORDER_INVALID when row created after revision', () => {
    const { projection, batchContext } = buildVerifiableSourceContextForSession('s1');
    const obs = projection.observations[0];
    const row = buildMatchingFeatureRowForObservation(obs, {
      createdAt: new Date('2026-09-25T00:00:00.000Z'),
    });
    batchContext.sourceRowsById.set(row.id, row);
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], batchContext);
    expect(session.sourceTemporalProvenance).toBe('FAIL');
    expect(session.reasons).toContain('SOURCE_TEMPORAL_ORDER_INVALID');
  });

  it('emits SEMANTIC_REVISION_GAP from aggregate lineage', () => {
    const { projection, row, batchContext } = buildVerifiableSourceContextForSession('s1');
    const sessionKey = buildD4SessionVersionKey({
      restSessionId: row.restSessionId,
      featureModelVersion: row.featureModelVersion,
      retentionPolicyVersion: row.retentionPolicyVersion,
      chargeOpportunityPolicyVersion: row.chargeOpportunityPolicyVersion,
    });
    const aggregate: RestSessionFeatureRevisionIntegrityAggregate = {
      totalRows: 3,
      incrementalRows: 0,
      finalRows: 3,
      validRows: 3,
      invalidatedRows: 0,
      latestSemanticRevision: 3,
      positiveRevisionRowCount: 3,
      distinctPositiveRevisionCount: 2,
      minPositiveSemanticRevision: 1,
      maxPositiveSemanticRevision: 3,
      nonPositiveRevisionRowCount: 0,
    };
    batchContext.aggregatesBySessionKey.set(sessionKey, aggregate);
    batchContext.totalRowsBySessionKey.set(sessionKey, 3);
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], batchContext);
    expect(session.revisionLineage).toBe('FAIL');
    expect(session.reasons).toContain('SEMANTIC_REVISION_GAP');
  });

  it('records DIGEST_COVERAGE_PARTIAL when total rows exceed checked window', () => {
    const { projection, row, batchContext } = buildVerifiableSourceContextForSession('s1');
    const sessionKey = buildD4SessionVersionKey({
      restSessionId: row.restSessionId,
      featureModelVersion: row.featureModelVersion,
      retentionPolicyVersion: row.retentionPolicyVersion,
      chargeOpportunityPolicyVersion: row.chargeOpportunityPolicyVersion,
    });
    batchContext.totalRowsBySessionKey.set(sessionKey, 50);
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], batchContext);
    expect(session.digestVerificationScope).toBe('BOUNDED_LATEST_WINDOW');
    expect(session.reasons).toContain('DIGEST_COVERAGE_PARTIAL');
    expect(session.digestRowsUnchecked).toBeGreaterThan(0);
  });

  it('returns UNSUPPORTED_SOURCE_INPUT_CONTRACT without integrity warning disposition', () => {
    const unsupportedContract = 'FUTURE_CONTRACT_V9';
    const { projection, batchContext } = buildVerifiableSourceContextForSession('s1');
    const obs = projection.observations[0];
    const obsWithContract = {
      ...obs,
      versionTuple: {
        ...obs.versionTuple,
        inputContractVersion: unsupportedContract,
      },
    };
    const rowUnsupported = buildMatchingFeatureRowForObservation(obsWithContract, {
      inputSummary: buildMinimalLongitudinalInputSummary({
        organizationId: PROFILE_TEST_ORG,
        vehicleId: PROFILE_TEST_VEHICLE,
        restSessionId: obs.restSessionId,
        inputContractVersion: unsupportedContract,
        anchorResolutionStatus: obs.anchorResolutionStatus,
        contextCompleteness: obs.chargeContextCompleteness,
        temperatureC: obs.temperatureC,
        temperatureSource: obs.temperatureSource ?? 'UNKNOWN',
      }) as BatteryRestSessionFeature['inputSummary'],
    });
    const mutatedProjection = {
      ...projection,
      observations: [
        {
          ...obsWithContract,
          canonical: {
            ...obsWithContract.canonical,
            inputDigest: rowUnsupported.inputDigest,
          },
        },
      ],
    };
    batchContext.sourceRowsById.set(rowUnsupported.id, rowUnsupported);
    const candidates = buildD4ProfileSessionCandidates({
      observations: mutatedProjection.observations,
      provisionalObservations: [],
      excludedSessions: [],
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], batchContext);
    expect(session.reasons).toContain('UNSUPPORTED_SOURCE_INPUT_CONTRACT');
    expect(session.sourceSnapshotContextIntegrity).toBe('NOT_EVALUATED');
    expect(session.sourceFeatureScalarIntegrity).toBe('PASS');
    expect(session.integrityQualifiedDisposition).toBe('SOURCE_EVIDENCE_LIMITED');
    expect(isVerifiableSourceReference(session)).toBe(false);
  });

  it('marks EXCLUDED slice content subdimensions NOT_APPLICABLE', () => {
    const projection = buildD4TestProjection([
      buildProfileTestInventoryItem({
        restSessionId: 'e1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'EXCLUDED',
        exclusionReasons: ['NO_CANONICAL_ROW'],
        includePayload: false,
      }),
    ]);
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], buildD4TestBatchContext());
    expect(session.profileSlice).toBe('EXCLUDED');
    expect(session.sourceFeatureScalarIntegrity).toBe('NOT_APPLICABLE');
    expect(session.sourceSnapshotContextIntegrity).toBe('NOT_APPLICABLE');
    expect(session.integrityQualifiedDisposition).toBe('NOT_APPLICABLE');
    expect(session.sourceEvidenceAvailability).toBe('NO_SOURCE_REFERENCE_EXPECTED');
  });

  it('marks PROVISIONAL disposition NOT_APPLICABLE even when source missing', () => {
    const projection = buildD4TestProjection([
      buildProfileTestInventoryItem({
        restSessionId: 'p1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'PROVISIONAL',
      }),
    ]);
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], buildD4TestBatchContext());
    expect(session.profileSlice).toBe('PROVISIONAL');
    expect(session.integrityQualifiedDisposition).toBe('NOT_APPLICABLE');
    expect(session.sourceEvidenceAvailability).toBe('MISSING');
  });

  it('uses NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED for DEFAULT when self integrity failed', () => {
    const { projection, batchContext } = buildVerifiableSourceContextForSession('s1');
    batchContext.selfIntegrityFailed = true;
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], batchContext);
    expect(session.integrityQualifiedDisposition).toBe(
      'NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED',
    );
  });

  it('parses registered M3_3C contract via historical parser path', () => {
    expect(REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION).toBe('M3_3C_FEATURE_INPUT_V1');
    const { projection, batchContext } = buildVerifiableSourceContextForSession('s1');
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], batchContext);
    expect(session.sourceSnapshotContextIntegrity).toBe('PASS');
  });
});

describe('aggregate overlay source flags from source-integrity batch', () => {
  it('includes SOURCE_EVIDENCE_LIMITED inspection flag when provisional missing source', () => {
    const projection = buildD4TestProjection([
      buildProfileTestInventoryItem({
        restSessionId: 's1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
      buildProfileTestInventoryItem({
        restSessionId: 'p1',
        anchorAt: '2026-01-02T10:00:00.000Z',
        inclusionMode: 'PROVISIONAL',
      }),
    ]);
    const inspection = aggregateD4InspectionOverlay({
      projection,
      revisionId: 'rev-1',
      canonicalProfileFingerprint: 'a'.repeat(64),
      inspectionGeneratedAt: '2026-09-24T12:00:00.000Z',
      selfIntegrityFailed: false,
      selfIntegrityReasons: [],
      batchContext: buildD4TestBatchContext(),
    });
    expect(inspection.profile.overallStatus).toBe('SOURCE_EVIDENCE_LIMITED');
    expect(inspection.profile.inspectionFlags).toContain('SOURCE_EVIDENCE_LIMITED');
  });
});
