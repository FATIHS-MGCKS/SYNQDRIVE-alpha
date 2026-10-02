import type { BatteryRestSessionFeature } from '@prisma/client';
import { aggregateD4InspectionOverlay } from './longitudinal-integrity-inspection.aggregate';
import { D4_INSPECTION_FLAG_ORDER } from './longitudinal-integrity-inspection.constants';
import {
  buildD4TestBatchContext,
  buildD4TestProjection,
  buildMatchingFeatureRowForObservation,
  buildProfileTestInventoryItem,
  buildVerifiableSourceContextForSession,
  defaultSingleSessionInventory,
} from './longitudinal-integrity-inspection.test-helpers';
import { buildD4SessionVersionKey } from './longitudinal-integrity-inspection.source-integrity';

function runAggregate(input: {
  projection: ReturnType<typeof buildD4TestProjection>;
  batchContext: ReturnType<typeof buildD4TestBatchContext>;
  selfIntegrityFailed?: boolean;
}) {
  const selfIntegrityFailed = input.selfIntegrityFailed ?? false;
  return aggregateD4InspectionOverlay({
    projection: input.projection,
    revisionId: 'rev-1',
    canonicalProfileFingerprint: 'a'.repeat(64),
    inspectionGeneratedAt: '2026-09-24T12:00:00.000Z',
    selfIntegrityFailed,
    selfIntegrityReasons: selfIntegrityFailed ? ['PROFILE_FINGERPRINT_MISMATCH'] : [],
    batchContext: {
      ...input.batchContext,
      selfIntegrityFailed,
    },
  });
}

describe('aggregateD4InspectionOverlay', () => {
  it('defaults to SOURCE_EVIDENCE_LIMITED when no source rows', () => {
    const projection = buildD4TestProjection(defaultSingleSessionInventory());
    const inspection = runAggregate({
      projection,
      batchContext: buildD4TestBatchContext(),
    });
    expect(inspection.profile.overallStatus).toBe('SOURCE_EVIDENCE_LIMITED');
    expect(inspection.profile.defaultObservationCount).toBe(1);
    expect(
      inspection.profile.integrityQualifiedDefaultCount +
        inspection.profile.quarantinedIntegrityWarningDefaultCount +
        inspection.profile.sourceEvidenceLimitedDefaultCount +
        inspection.profile.notEligibleRevisionSelfIntegrityFailedDefaultCount,
    ).toBe(inspection.profile.defaultObservationCount);
  });

  it('overallStatus OK when verifiable source and full digest scope', () => {
    const { projection, batchContext } = buildVerifiableSourceContextForSession('s1');
    const inspection = runAggregate({ projection, batchContext });
    expect(inspection.profile.overallStatus).toBe('OK');
    expect(inspection.profile.rebuildability).toBe('FULL');
    expect(inspection.profile.integrityQualifiedDefaultCount).toBe(1);
    expect(inspection.profile.inspectionFlags).toEqual([]);
  });

  it('overallStatus INTEGRITY_WARNING beats SOURCE_EVIDENCE_LIMITED', () => {
    const { projection, batchContext } = buildVerifiableSourceContextForSession('s1');
    const obs = projection.observations[0];
    const row = buildMatchingFeatureRowForObservation(obs, {
      minimumRestVoltageMv: 1,
    });
    batchContext.sourceRowsById.set(row.id, row);
    const inspection = runAggregate({ projection, batchContext });
    expect(inspection.profile.overallStatus).toBe('INTEGRITY_WARNING');
    expect(inspection.profile.quarantinedIntegrityWarningDefaultCount).toBe(1);
    expect(inspection.profile.inspectionFlags).toContain('INTEGRITY_LIMITED');
    expect(inspection.profile.inspectionFlags).toContain('REBUILDABILITY_LIMITED');
  });

  it('overallStatus INTEGRITY_PARTIAL for digest coverage partial without warnings', () => {
    const { projection, row, batchContext } = buildVerifiableSourceContextForSession('s1');
    const sessionKey = buildD4SessionVersionKey({
      restSessionId: row.restSessionId,
      featureModelVersion: row.featureModelVersion,
      retentionPolicyVersion: row.retentionPolicyVersion,
      chargeOpportunityPolicyVersion: row.chargeOpportunityPolicyVersion,
    });
    batchContext.totalRowsBySessionKey.set(sessionKey, 200);
    const inspection = runAggregate({ projection, batchContext });
    expect(inspection.coverage.digestVerificationScope).toBe('BOUNDED_LATEST_WINDOW');
    expect(inspection.profile.overallStatus).toBe('INTEGRITY_PARTIAL');
    expect(inspection.profile.inspectionFlags).toContain('INTEGRITY_LIMITED');
  });

  it('overallStatus REVISION_SELF_INTEGRITY_FAILED when self integrity failed', () => {
    const { projection, batchContext } = buildVerifiableSourceContextForSession('s1');
    const inspection = runAggregate({
      projection,
      batchContext,
      selfIntegrityFailed: true,
    });
    expect(inspection.profile.overallStatus).toBe('REVISION_SELF_INTEGRITY_FAILED');
    expect(inspection.profile.integrityQualifiedDefaultCount).toBe(0);
    expect(inspection.profile.notEligibleRevisionSelfIntegrityFailedDefaultCount).toBe(1);
  });

  it('orders inspection flags per D4_INSPECTION_FLAG_ORDER', () => {
    const { projection, batchContext } = buildVerifiableSourceContextForSession('s1');
    const obs = projection.observations[0];
    const row = buildMatchingFeatureRowForObservation(obs, {
      minimumRestVoltageMv: 1,
    });
    batchContext.sourceRowsById.set(row.id, row);
    const inspection = runAggregate({ projection, batchContext });
    const flags = inspection.profile.inspectionFlags;
    const sorted = D4_INSPECTION_FLAG_ORDER.filter((f) => flags.includes(f));
    expect(flags).toEqual(sorted);
  });

  it('rebuildability UNAVAILABLE when references expected but none verifiable', () => {
    const projection = buildD4TestProjection(defaultSingleSessionInventory());
    const inspection = runAggregate({
      projection,
      batchContext: buildD4TestBatchContext(),
    });
    expect(inspection.coverage.sourceReferencesExpected).toBe(1);
    expect(inspection.coverage.verifiableSourceReferenceCount).toBe(0);
    expect(inspection.profile.rebuildability).toBe('UNAVAILABLE');
    expect(inspection.profile.inspectionFlags).toContain('REBUILDABILITY_LIMITED');
  });

  it('rebuildability PARTIAL when only some references verifiable', () => {
    const { projection: s1Projection, row, batchContext: s1Context } =
      buildVerifiableSourceContextForSession('s1');
    const projection = buildD4TestProjection([
      buildProfileTestInventoryItem({
        restSessionId: 's1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
      buildProfileTestInventoryItem({
        restSessionId: 's2',
        anchorAt: '2026-01-02T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
    ]);
    const mergedProjection = {
      ...projection,
      observations: s1Projection.observations.concat(
        projection.observations.filter((o) => o.restSessionId === 's2'),
      ),
    };
    const inspection = runAggregate({
      projection: mergedProjection,
      batchContext: s1Context,
    });
    expect(inspection.profile.rebuildability).toBe('PARTIAL');
    expect(inspection.coverage.verifiableSourceReferenceCount).toBe(1);
    expect(inspection.coverage.sourceReferencesExpected).toBe(2);
  });

  it('perSession length equals candidateRestSessionCount', () => {
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
      buildProfileTestInventoryItem({
        restSessionId: 'e1',
        anchorAt: '2026-01-03T10:00:00.000Z',
        inclusionMode: 'EXCLUDED',
        exclusionReasons: ['NO_CANONICAL_ROW'],
        includePayload: false,
      }),
    ]);
    const inspection = runAggregate({
      projection,
      batchContext: buildD4TestBatchContext(),
    });
    expect(inspection.perSession.length).toBe(projection.coverage.candidateRestSessionCount);
    expect(inspection.perSession.length).toBe(3);
  });
});
