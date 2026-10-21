import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadAndValidateVsiApdsP5b2Phase2ManifestFromFile,
  validateVsiApdsP5b2Phase2ManifestDocument,
} from './vsi-apds-p5b2-phase2-manifest';
import { VsiApdsP5b2Phase2ManifestError } from './vsi-apds-p5b2-phase2-manifest.errors';
import {
  VSI_P5B2_PHASE2_MANIFEST_SHA256,
  VSI_P5B2_PHASE2_ORGANIZATION_ID,
} from './vsi-apds-p5b2-phase2-manifest.contract';
import { assertManifestDecisionRowsMatchScope } from './vsi-apds-p5b2-phase2-manifest-scope';
import { buildPhase2ScientificAggregates } from './vsi-apds-p5b2-phase2-scientific-summary';

const FIXTURE_PATH = resolve(
  __dirname,
  'fixtures/p5b2-phase2-proposed-manifest.json',
);

function loadFixtureDoc() {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

describe('vsi-apds-p5b2 phase2 manifest', () => {
  it('verifies frozen production manifest SHA256 and 120 unique ids', () => {
    const bytes = readFileSync(FIXTURE_PATH);
    const sha = createHash('sha256').update(bytes).digest('hex');
    expect(sha).toBe(VSI_P5B2_PHASE2_MANIFEST_SHA256);
    const validated = loadAndValidateVsiApdsP5b2Phase2ManifestFromFile(FIXTURE_PATH);
    expect(validated.orderedDecisionIds).toHaveLength(120);
    expect(new Set(validated.orderedDecisionIds).size).toBe(120);
    expect(validated.organizationId).toBe(VSI_P5B2_PHASE2_ORGANIZATION_ID);
  });

  it('rejects wrong SHA256', () => {
    expect(() =>
      loadAndValidateVsiApdsP5b2Phase2ManifestFromFile(FIXTURE_PATH, {
        expectedSha256: '0'.repeat(64),
      }),
    ).toThrow(VsiApdsP5b2Phase2ManifestError);
  });

  it('rejects duplicate UUID in uniqueDecisionIds', () => {
    const doc = loadFixtureDoc();
    doc.uniqueDecisionIds = [doc.uniqueDecisionIds[0], doc.uniqueDecisionIds[0]];
    doc.entries = [doc.entries[0], doc.entries[0]];
    expect(() => validateVsiApdsP5b2Phase2ManifestDocument(doc)).toThrow(
      VsiApdsP5b2Phase2ManifestError,
    );
    try {
      validateVsiApdsP5b2Phase2ManifestDocument(doc);
    } catch (e) {
      expect((e as VsiApdsP5b2Phase2ManifestError).code).toBe('MANIFEST_DUPLICATE_ID');
    }
  });

  it('rejects more than 120 ids', () => {
    const doc = loadFixtureDoc();
    doc.uniqueDecisionIds = [...doc.uniqueDecisionIds, 'extra-id'];
    doc.entries = [...doc.entries, { ...doc.entries[0], id: 'extra-id' }];
    try {
      validateVsiApdsP5b2Phase2ManifestDocument(doc);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as VsiApdsP5b2Phase2ManifestError).code).toBe('MANIFEST_TOO_MANY_DECISIONS');
    }
  });

  it('rejects foreign organization in manifest document', () => {
    const doc = loadFixtureDoc();
    doc.org = '00000000-0000-4000-8000-000000000099';
    try {
      validateVsiApdsP5b2Phase2ManifestDocument(doc);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as VsiApdsP5b2Phase2ManifestError).code).toBe('MANIFEST_ORG_MISMATCH');
    }
  });

  it('rejects decision outside frozen UTC window in manifest entry', () => {
    const doc = loadFixtureDoc();
    doc.entries[0].decisionAt = '2020-01-01T00:00:00.000Z';
    try {
      validateVsiApdsP5b2Phase2ManifestDocument(doc);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as VsiApdsP5b2Phase2ManifestError).code).toBe('MANIFEST_DECISION_OUTSIDE_WINDOW');
    }
  });

  function miniValidatedManifest(singleId: string) {
    return validateVsiApdsP5b2Phase2ManifestDocument({
      org: VSI_P5B2_PHASE2_ORGANIZATION_ID,
      vehicles: [
        '68868291-5478-42cd-b0c4-cc77b2a78e21',
        'c10351f8-b6a2-4258-947f-631aeaa6d359',
        '8c850ff1-4201-432b-af2e-2711dbc7ca48',
        '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      ],
      proposedWindow: {
        from: '2026-10-17T19:07:24.212Z',
        to: '2026-10-21T12:04:24.059Z',
      },
      uniqueDecisionIds: [singleId],
      entries: [
        {
          id: singleId,
          vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
          decisionAt: '2026-10-18T12:00:00.000Z',
          policyVersion: 'P25_APD_B2_V1',
          decision: 'WOULD_POLL',
          reason: 'TEST',
          stratum: 'TEST',
        },
      ],
    });
  }

  it('scope guard rejects foreign organization on loaded row', () => {
    const validated = miniValidatedManifest('test-decision-id');
    const id = validated.orderedDecisionIds[0];
    try {
      assertManifestDecisionRowsMatchScope(validated, [
        {
          id,
          organizationId: 'foreign-org',
          vehicleId: validated.allowedVehicleIds[0],
          opportunityId: 'opp',
          decisionAt: validated.decisionAtFrom,
          activationEpochId: validated.activationEpochId,
          policyVersion: 'P25_APD_B2_V1',
          shadowExecutionVersion: null,
          decision: 'WOULD_POLL',
          reason: 'test',
          realPollId: null,
          realPollStatus: null,
        },
      ]);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as VsiApdsP5b2Phase2ManifestError).code).toBe('MANIFEST_FOREIGN_ORGANIZATION');
    }
  });

  it('scope guard rejects wrong activation epoch', () => {
    const validated = miniValidatedManifest('test-decision-id-2');
    const id = validated.orderedDecisionIds[0];
    try {
      assertManifestDecisionRowsMatchScope(validated, [
        {
          id,
          organizationId: validated.organizationId,
          vehicleId: validated.allowedVehicleIds[0],
          opportunityId: 'opp',
          decisionAt: validated.decisionAtFrom,
          activationEpochId: 'wrong-epoch',
          policyVersion: 'P25_APD_B2_V1',
          shadowExecutionVersion: null,
          decision: 'WOULD_POLL',
          reason: 'test',
          realPollId: null,
          realPollStatus: null,
        },
      ]);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as VsiApdsP5b2Phase2ManifestError).code).toBe('MANIFEST_EPOCH_MISMATCH');
    }
  });

  it('aggregates B2/B4 twin poll dedup groups', () => {
    const agg = buildPhase2ScientificAggregates({
      elapsedMs: 1,
      researchRows: [
        {
          persistedShadowDecisionId: 'a',
          vehicleId: 'v',
          opportunityId: 'o',
          decisionAt: '2026-10-18T00:00:00.000Z',
          policyVersion: 'P25_APD_B2_V1',
          realPollId: 'poll-1',
          originalDecision: 'WOULD_POLL',
          originalReason: 'r',
          processingStatus: 'CORRELATED',
          providerSourceLinkId: 'link',
          historicalRevisionAuthority: null,
          historicalRevisionEvidence: null,
          commitVisibilityStatus: 'NOT_APPLICABLE',
          consumerDemandAssessment: null,
          correlationNotAssessable: false,
          errorCode: null,
          manifestStratum: null,
          manifestMotionState: null,
        },
        {
          persistedShadowDecisionId: 'b',
          vehicleId: 'v',
          opportunityId: 'o',
          decisionAt: '2026-10-18T00:00:00.000Z',
          policyVersion: 'P25_APD_B4_V1',
          realPollId: 'poll-1',
          originalDecision: 'WOULD_POLL',
          originalReason: 'r',
          processingStatus: 'CORRELATED',
          providerSourceLinkId: 'link',
          historicalRevisionAuthority: null,
          historicalRevisionEvidence: null,
          commitVisibilityStatus: 'NOT_APPLICABLE',
          consumerDemandAssessment: null,
          correlationNotAssessable: false,
          errorCode: null,
          manifestStratum: null,
          manifestMotionState: null,
        },
      ],
    });
    expect(agg.b2B4TwinPollGroups).toBe(1);
    expect(agg.b2B4TwinSamePollId).toBe(1);
    expect(agg.distinctRealPollIds).toBe(1);
  });
});
