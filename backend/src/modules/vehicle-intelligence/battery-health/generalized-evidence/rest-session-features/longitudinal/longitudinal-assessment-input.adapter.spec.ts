import { FEATURE_INPUT_CANONICAL_KEY_ORDER_SHA256_LITERAL } from '../feature-input-canonical.serializer';
import {
  buildLongitudinalAssessmentInputV1,
} from './longitudinal-assessment-input.adapter';
import { M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION } from './longitudinal-assessment-input.constants';
import { M3_3E_E1_GOLDEN_CONSUMPTION_FINGERPRINT_LITERAL } from './longitudinal-assessment-input.golden';
import {
  buildE1GoldenConsumptionFixture,
  buildE1OkFromSessions,
  buildE1SingleEligibleFixture,
} from './longitudinal-assessment-input.test-helpers';
import { REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION } from './longitudinal-integrity-inspection.constants';
import type { D4InspectionOutcome } from './longitudinal-integrity-inspection.types';
import { LONGITUDINAL_PROFILE_D3_GOLDEN_FINGERPRINT_LITERAL } from './longitudinal-profile-fingerprint';
import {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import {
  buildProfileTestInventoryItem,
  versionTuple,
} from './longitudinal-profile.test-fixtures';

const build = buildLongitudinalAssessmentInputV1;

describe('buildLongitudinalAssessmentInputV1 (M3.3E E1)', () => {
  describe('A — revision identity', () => {
    it('accepts valid identity', () => {
      const f = buildE1SingleEligibleFixture();
      expect(build(f).status).toBe('OK');
    });

    it.each([
      ['organizationId', ''],
      ['vehicleId', ''],
      ['revisionId', ''],
    ] as const)('rejects empty %s → D3_D4_IDENTITY_MISMATCH', (field, value) => {
      const f = buildE1SingleEligibleFixture();
      const revisionIdentity = { ...f.revisionIdentity, [field]: value };
      const out = build({
        scientificProfile: f.scientificProfile,
        revisionIdentity,
        d4Outcome: f.d4Outcome,
      });
      expect(out).toEqual({ status: 'REJECTED', reason: 'D3_D4_IDENTITY_MISMATCH' });
    });

    it('rejects malformed fingerprint', () => {
      const f = buildE1SingleEligibleFixture();
      const out = build({
        scientificProfile: f.scientificProfile,
        revisionIdentity: { ...f.revisionIdentity, canonicalProfileFingerprint: 'NOT_HEX' },
        d4Outcome: f.d4Outcome,
      });
      expect(out).toEqual({
        status: 'REJECTED',
        reason: 'D3_SCIENTIFIC_PROFILE_FINGERPRINT_MISMATCH',
      });
    });

    it('rejects unsupported contract on identity envelope', () => {
      const f = buildE1SingleEligibleFixture();
      const out = build({
        scientificProfile: f.scientificProfile,
        revisionIdentity: {
          ...f.revisionIdentity,
          longitudinalProfileContractVersion: 'WRONG' as typeof REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
        },
        d4Outcome: f.d4Outcome,
      });
      expect(out).toEqual({ status: 'REJECTED', reason: 'UNSUPPORTED_D3_PROFILE_CONTRACT' });
    });

    it('rejects unsupported policy on identity envelope', () => {
      const f = buildE1SingleEligibleFixture();
      const out = build({
        scientificProfile: f.scientificProfile,
        revisionIdentity: {
          ...f.revisionIdentity,
          profilePolicyVersion: 'WRONG' as typeof REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
        },
        d4Outcome: f.d4Outcome,
      });
      expect(out).toEqual({ status: 'REJECTED', reason: 'UNSUPPORTED_D3_PROFILE_POLICY' });
    });
  });

  describe('B — D4 outcome', () => {
    it('REVISION_NOT_FOUND', () => {
      const f = buildE1SingleEligibleFixture();
      expect(
        build({
          scientificProfile: f.scientificProfile,
          revisionIdentity: f.revisionIdentity,
          d4Outcome: { status: 'REVISION_NOT_FOUND' },
        }),
      ).toEqual({ status: 'REJECTED', reason: 'REVISION_NOT_FOUND' });
    });

    it('top-level REVISION_SELF_INTEGRITY_FAILED', () => {
      const f = buildE1SingleEligibleFixture();
      expect(
        build({
          scientificProfile: f.scientificProfile,
          revisionIdentity: f.revisionIdentity,
          d4Outcome: {
            status: 'REVISION_SELF_INTEGRITY_FAILED',
            failure: {
              inspectionContractVersion: REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION,
              inspectionGeneratedAt: '2026-09-25T00:00:00.000Z',
              snapshotIsolation: 'REPEATABLE_READ',
              identity: {
                organizationId: f.revisionIdentity.organizationId,
                vehicleId: f.revisionIdentity.vehicleId,
                revisionId: f.revisionIdentity.revisionId,
              },
              selfIntegrity: 'SELF_INTEGRITY_FAILED',
              reasons: ['PROFILE_FINGERPRINT_MISMATCH'],
            },
          },
        }),
      ).toEqual({ status: 'REJECTED', reason: 'REVISION_SELF_INTEGRITY_FAILED' });
    });

    it('OK + materialized selfIntegrity FAILED', () => {
      const f = buildE1SingleEligibleFixture();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          materializedRevision: {
            selfIntegrity: 'SELF_INTEGRITY_FAILED',
            selfIntegrityReasons: ['PROFILE_FINGERPRINT_MISMATCH'],
          },
        },
      };
      expect(
        build({
          scientificProfile: f.scientificProfile,
          revisionIdentity: f.revisionIdentity,
          d4Outcome,
        }),
      ).toEqual({ status: 'REJECTED', reason: 'REVISION_SELF_INTEGRITY_FAILED' });
    });

    it('unsupported D4 contract', () => {
      const f = buildE1SingleEligibleFixture();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          inspectionContractVersion: 'WRONG' as typeof REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION,
        },
      };
      expect(
        build({
          scientificProfile: f.scientificProfile,
          revisionIdentity: f.revisionIdentity,
          d4Outcome,
        }),
      ).toEqual({ status: 'REJECTED', reason: 'UNSUPPORTED_D4_INSPECTION_CONTRACT' });
    });
  });

  describe('C — scientific profile validation', () => {
    it('malformed projection', () => {
      const f = buildE1SingleEligibleFixture();
      expect(
        build({
          scientificProfile: { not: 'a profile' },
          revisionIdentity: f.revisionIdentity,
          d4Outcome: f.d4Outcome,
        }),
      ).toEqual({ status: 'REJECTED', reason: 'UNSUPPORTED_D3_PROFILE_CONTRACT' });
    });

    it('unknown V1 field on projection root', () => {
      const f = buildE1SingleEligibleFixture();
      const scientificProfile = { ...f.scientificProfile, extraField: true };
      expect(
        build({
          scientificProfile,
          revisionIdentity: f.revisionIdentity,
          d4Outcome: f.d4Outcome,
        }),
      ).toEqual({ status: 'REJECTED', reason: 'MALFORMED_D3_SCIENTIFIC_PROFILE' });
    });

    it('org mismatch → D3_D4_IDENTITY_MISMATCH', () => {
      const f = buildE1SingleEligibleFixture();
      const scientificProfile = { ...f.scientificProfile, organizationId: '00000000-0000-0000-0000-000000000099' };
      expect(
        build({
          scientificProfile,
          revisionIdentity: f.revisionIdentity,
          d4Outcome: f.d4Outcome,
        }),
      ).toEqual({ status: 'REJECTED', reason: 'D3_D4_IDENTITY_MISMATCH' });
    });

    it('fingerprint mismatch when content changed', () => {
      const f = buildE1SingleEligibleFixture();
      const scientificProfile = structuredClone(f.scientificProfile);
      scientificProfile.observations[0].features.minimumRestVoltageMv = 1;
      expect(
        build({
          scientificProfile,
          revisionIdentity: f.revisionIdentity,
          d4Outcome: f.d4Outcome,
        }),
      ).toEqual({
        status: 'REJECTED',
        reason: 'D3_SCIENTIFIC_PROFILE_FINGERPRINT_MISMATCH',
      });
    });

    it('valid profile with matching fingerprint', () => {
      const f = buildE1SingleEligibleFixture();
      const out = build(f);
      expect(out.status).toBe('OK');
    });
  });

  describe('D/E/F/G/H — pairing and eligibility', () => {
    it('DEFAULT + PROVISIONAL + EXCLUDED exact pass', () => {
      const sessions = [
        buildProfileTestInventoryItem({
          restSessionId: 'd-s1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'd-p1',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'd-x1',
          anchorAt: '2026-01-03T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['NO_CANONICAL_ROW'],
          includePayload: false,
        }),
      ];
      const f = buildE1OkFromSessions(sessions);
      expect(build(f).status).toBe('OK');
    });

    it('missing D4 row → session set mismatch', () => {
      const f = buildE1SingleEligibleFixture();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: { ...f.d4Outcome.inspection, perSession: [] },
      };
      const out = build({ ...f, d4Outcome });
      expect(out.status).toBe('REJECTED');
      if (out.status === 'REJECTED') {
        expect(out.reason).toBe('D3_D4_SESSION_SET_MISMATCH');
      }
    });

    it('duplicate D4 restSessionId', () => {
      const f = buildE1SingleEligibleFixture();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const row = f.d4Outcome.inspection.perSession[0];
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          perSession: [row, { ...row }],
        },
      };
      const out = build({ ...f, d4Outcome });
      expect(out.status).toBe('REJECTED');
      if (out.status === 'REJECTED') {
        expect(out.reason).toBe('DUPLICATE_SESSION_MAPPING');
      }
    });

    it('DEFAULT mapped to PROVISIONAL slice', () => {
      const f = buildE1SingleEligibleFixture();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          perSession: f.d4Outcome.inspection.perSession.map((row) => ({
            ...row,
            profileSlice: 'PROVISIONAL' as const,
          })),
        },
      };
      const out = build({ ...f, d4Outcome });
      expect(out.status).toBe('REJECTED');
      if (out.status === 'REJECTED') {
        expect(out.reason).toBe('D3_D4_PROFILE_SLICE_MISMATCH');
      }
    });

    it('canonical mismatch', () => {
      const f = buildE1SingleEligibleFixture();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          perSession: f.d4Outcome.inspection.perSession.map((row) => ({
            ...row,
            canonicalFeatureRowId: 'wrong-row-id',
          })),
        },
      };
      const out = build({ ...f, d4Outcome });
      expect(out.status).toBe('REJECTED');
      if (out.status === 'REJECTED') {
        expect(out.reason).toBe('D3_D4_CANONICAL_REFERENCE_MISMATCH');
      }
    });

    it('version tuple mismatch', () => {
      const f = buildE1SingleEligibleFixture();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          perSession: f.d4Outcome.inspection.perSession.map((row) => ({
            ...row,
            versionTuple: row.versionTuple
              ? { ...row.versionTuple, featureModelVersion: 'fm-wrong' }
              : row.versionTuple,
          })),
        },
      };
      const out = build({ ...f, d4Outcome });
      expect(out.status).toBe('REJECTED');
      if (out.status === 'REJECTED') {
        expect(out.reason).toBe('D3_D4_VERSION_TUPLE_MISMATCH');
      }
    });

    it('QUARANTINED excluded from assessment-grade', () => {
      const f = buildE1SingleEligibleFixture();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          perSession: f.d4Outcome.inspection.perSession.map((row) => ({
            ...row,
            integrityQualifiedDisposition: 'QUARANTINED_INTEGRITY_WARNING' as const,
          })),
        },
      };
      const out = build({ ...f, d4Outcome });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.input.assessmentGradeObservations).toHaveLength(0);
      expect(out.input.coverage.quarantinedIntegrityWarningCount).toBe(1);
    });

    it('DEFAULT NOT_APPLICABLE → contract inconsistency', () => {
      const f = buildE1SingleEligibleFixture();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          perSession: f.d4Outcome.inspection.perSession.map((row) => ({
            ...row,
            integrityQualifiedDisposition: 'NOT_APPLICABLE' as const,
          })),
        },
      };
      const out = build({ ...f, d4Outcome });
      expect(out.status).toBe('REJECTED');
      if (out.status === 'REJECTED') {
        expect(out.reason).toBe('D3_D4_CONTRACT_INCONSISTENCY');
      }
    });

    it('PROVISIONAL never assessment-grade', () => {
      const sessions = [
        buildProfileTestInventoryItem({
          restSessionId: 'prov-only',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
      ];
      const f = buildE1OkFromSessions(sessions);
      const out = build(f);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.input.assessmentGradeObservations).toHaveLength(0);
      expect(out.input.coverage.provisionalContextCount).toBe(1);
    });
  });

  describe('I/J/K — coverage, ordering, segments', () => {
    it('coverage partition equation', () => {
      const f = buildE1GoldenConsumptionFixture();
      const out = build(f);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const c = out.input.coverage;
      expect(c.d3DefaultObservationCount).toBe(
        c.assessmentGradeObservationCount +
          c.quarantinedIntegrityWarningCount +
          c.sourceEvidenceLimitedCount,
      );
    });

    it('anchorAt ordering with UTF-16 tie-break', () => {
      const sameAnchor = '2026-01-01T10:00:00.000Z';
      const sessions = [
        buildProfileTestInventoryItem({
          restSessionId: 'session-b',
          anchorAt: sameAnchor,
          inclusionMode: 'DEFAULT',
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'session-a',
          anchorAt: sameAnchor,
          inclusionMode: 'DEFAULT',
        }),
      ];
      const f = buildE1OkFromSessions(sessions);
      const out = build(f);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.input.assessmentGradeObservations.map((o) => o.restSessionId)).toEqual([
        'session-a',
        'session-b',
      ]);
    });

    it('zero eligible evidence window nulls', () => {
      const f = buildE1SingleEligibleFixture();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          perSession: f.d4Outcome.inspection.perSession.map((row) => ({
            ...row,
            integrityQualifiedDisposition: 'SOURCE_EVIDENCE_LIMITED' as const,
          })),
        },
      };
      const out = build({ ...f, d4Outcome });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.input.evidenceWindow).toEqual({
        firstEligibleAnchorAt: null,
        lastEligibleAnchorAt: null,
        eligibleEvidenceSpanMs: null,
      });
    });

    it('A→B→A preserves three source segments when all eligible', () => {
      const vA = versionTuple({ featureModelVersion: 'fm-a' });
      const vB = versionTuple({ featureModelVersion: 'fm-b' });
      const sessions = [
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: vA,
        }),
        buildProfileTestInventoryItem({
          restSessionId: 's2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: vA,
        }),
        buildProfileTestInventoryItem({
          restSessionId: 's3',
          anchorAt: '2026-01-03T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: vB,
        }),
        buildProfileTestInventoryItem({
          restSessionId: 's4',
          anchorAt: '2026-01-04T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: vB,
        }),
        buildProfileTestInventoryItem({
          restSessionId: 's5',
          anchorAt: '2026-01-05T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: vA,
        }),
      ];
      const f = buildE1OkFromSessions(sessions);
      const out = build(f);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.input.eligibleVersionSegments.map((s) => s.sourceSegmentIndex)).toEqual([0, 1, 2]);
    });
  });

  describe('L/M — model evaluation and fingerprint', () => {
    it('modelSufficiency always NOT_EVALUATED', () => {
      const f = buildE1GoldenConsumptionFixture();
      const out = build(f);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.input.modelEvaluation).toEqual({
        inputAvailability: 'ASSESSMENT_GRADE_INPUT_AVAILABLE',
        modelSufficiency: 'NOT_EVALUATED',
      });
    });

    it('golden consumption fingerprint literal', () => {
      const f = buildE1GoldenConsumptionFixture();
      const out = build(f);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.input.consumptionInputFingerprint).toBe(
        M3_3E_E1_GOLDEN_CONSUMPTION_FINGERPRINT_LITERAL,
      );
      expect(out.input.consumptionInputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    });

    it('inspectionGeneratedAt change alone does not change fingerprint', () => {
      const f = buildE1GoldenConsumptionFixture();
      const out1 = build(f);
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          inspectionGeneratedAt: '2099-01-01T00:00:00.000Z',
        },
      };
      const out2 = build({ ...f, d4Outcome });
      expect(out1.status).toBe('OK');
      expect(out2.status).toBe('OK');
      if (out1.status !== 'OK' || out2.status !== 'OK') return;
      expect(out1.input.consumptionInputFingerprint).toBe(out2.input.consumptionInputFingerprint);
    });

    it('revisionId change alone does not change fingerprint when pair consistent', () => {
      const f = buildE1GoldenConsumptionFixture();
      const out1 = build(f);
      const revisionIdentity = { ...f.revisionIdentity, revisionId: 'different-rev-id' };
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          identity: { ...f.d4Outcome.inspection.identity, revisionId: 'different-rev-id' },
        },
      };
      const out2 = build({ scientificProfile: f.scientificProfile, revisionIdentity, d4Outcome });
      expect(out1.status).toBe('OK');
      expect(out2.status).toBe('OK');
      if (out1.status !== 'OK' || out2.status !== 'OK') return;
      expect(out1.input.consumptionInputFingerprint).toBe(out2.input.consumptionInputFingerprint);
    });

    it('eligible anchor change changes fingerprint', () => {
      const f = buildE1GoldenConsumptionFixture();
      const out1 = build(f);
      const sessions = [
        buildProfileTestInventoryItem({
          restSessionId: 'e1-golden-s1',
          anchorAt: '2026-01-01T11:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'e1-golden-s2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ];
      const f2 = buildE1OkFromSessions(sessions, f.revisionIdentity.revisionId);
      const out2 = build(f2);
      expect(out1.status).toBe('OK');
      expect(out2.status).toBe('OK');
      if (out1.status !== 'OK' || out2.status !== 'OK') return;
      expect(out1.input.consumptionInputFingerprint).not.toBe(
        out2.input.consumptionInputFingerprint,
      );
    });

    it('C3 and D3 golden vectors unchanged', () => {
      expect(FEATURE_INPUT_CANONICAL_KEY_ORDER_SHA256_LITERAL).toBe(
        'e7b6e05a14a7bece2b8568b716d7dfc2ff360507b7a9f308c5771f648fd8dff3',
      );
      expect(LONGITUDINAL_PROFILE_D3_GOLDEN_FINGERPRINT_LITERAL).toBe(
        'e2d39c602370c92a7b4304d01ee0f0d102aa4ce033c38a03f72187a3afbcaecb',
      );
    });
  });

  describe('N — pure function', () => {
    it('does not mutate inputs', () => {
      const f = buildE1GoldenConsumptionFixture();
      const scientificProfile = structuredClone(f.scientificProfile);
      const revisionIdentity = structuredClone(f.revisionIdentity);
      const d4Outcome = structuredClone(f.d4Outcome);
      const beforeSci = JSON.stringify(scientificProfile);
      const beforeRev = JSON.stringify(revisionIdentity);
      const beforeD4 = JSON.stringify(d4Outcome);
      build({ scientificProfile, revisionIdentity, d4Outcome });
      expect(JSON.stringify(scientificProfile)).toBe(beforeSci);
      expect(JSON.stringify(revisionIdentity)).toBe(beforeRev);
      expect(JSON.stringify(d4Outcome)).toBe(beforeD4);
    });

    it('deterministic output', () => {
      const f = buildE1GoldenConsumptionFixture();
      const a = build(f);
      const b = build(f);
      expect(a).toEqual(b);
    });
  });

  describe('contract constant', () => {
    it('M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1', () => {
      expect(M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION).toBe(
        'M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1',
      );
      const f = buildE1SingleEligibleFixture();
      const out = build(f);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.input.contractVersion).toBe(M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION);
      expect(out.input.consumptionInputFingerprint).toBeTruthy();
    });
  });
});
