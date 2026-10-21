import { canonicalFeatureInputUtf8 } from '../feature-input-canonical.serializer';
import {
  buildLongitudinalAssessmentInputV1,
  computeM3_3E_ConsumptionInputFingerprintV1,
} from './longitudinal-assessment-input.adapter';
import { M3_3E_E1_GOLDEN_CONSUMPTION_FINGERPRINT_LITERAL } from './longitudinal-assessment-input.golden';
import type { M3_3E_AssessmentGradeObservationV1 } from './longitudinal-assessment-input.types';
import {
  buildE1FullPartitionFixture,
  buildE1GoldenConsumptionFixture,
  buildE1OkFromSessions,
  buildE1SingleEligibleFixture,
  d4RowForSession,
  withE1D4Inspection,
} from './longitudinal-assessment-input.test-helpers';
import type { D4InspectionOutcome } from './longitudinal-integrity-inspection.types';
import { buildProfileTestInventoryItem, versionTuple } from './longitudinal-profile.test-fixtures';
import * as fs from 'fs';
import * as path from 'path';

const build = buildLongitudinalAssessmentInputV1;

function rejectReason(
  fixture: Parameters<typeof build>[0],
): string | undefined {
  const out = build(fixture);
  return out.status === 'REJECTED' ? out.reason : undefined;
}

function okInput(fixture: Parameters<typeof build>[0]) {
  const out = build(fixture);
  if (out.status !== 'OK') {
    throw new Error(`expected OK got ${JSON.stringify(out)}`);
  }
  return out.input;
}

describe('M3.3E E1.1 — matrix closure', () => {
  describe('ordering audit', () => {
    it('E1 adapter source has no localeCompare', () => {
      const src = fs.readFileSync(
        path.join(__dirname, 'longitudinal-assessment-input.adapter.ts'),
        'utf8',
      );
      expect(src.includes('localeCompare')).toBe(false);
    });
  });

  describe('session set matrix', () => {
    const full = () => buildE1FullPartitionFixture();

    it('missing DEFAULT → D3_D4_SESSION_SET_MISMATCH', () => {
      const f = withE1D4Inspection(full(), (insp) => ({
        ...insp,
        perSession: insp.perSession.filter((r) => r.restSessionId !== 'd-s1'),
      }));
      expect(rejectReason(f)).toBe('D3_D4_SESSION_SET_MISMATCH');
    });

    it('missing PROVISIONAL → D3_D4_SESSION_SET_MISMATCH', () => {
      const f = withE1D4Inspection(full(), (insp) => ({
        ...insp,
        perSession: insp.perSession.filter((r) => r.restSessionId !== 'd-p1'),
      }));
      expect(rejectReason(f)).toBe('D3_D4_SESSION_SET_MISMATCH');
    });

    it('missing EXCLUDED → D3_D4_SESSION_SET_MISMATCH', () => {
      const f = withE1D4Inspection(full(), (insp) => ({
        ...insp,
        perSession: insp.perSession.filter((r) => r.restSessionId !== 'd-x1'),
      }));
      expect(rejectReason(f)).toBe('D3_D4_SESSION_SET_MISMATCH');
    });

    it('extra D4 session → D3_D4_SESSION_SET_MISMATCH', () => {
      const f = full();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const extra = { ...f.d4Outcome.inspection.perSession[0], restSessionId: 'extra-session' };
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          perSession: [...f.d4Outcome.inspection.perSession, extra],
        },
      };
      expect(rejectReason({ ...f, d4Outcome })).toBe('D3_D4_SESSION_SET_MISMATCH');
    });

    it('duplicate D4 restSessionId → DUPLICATE_SESSION_MAPPING', () => {
      const f = full();
      if (f.d4Outcome.status !== 'OK') throw new Error('expected OK');
      const row = f.d4Outcome.inspection.perSession[0];
      const d4Outcome: D4InspectionOutcome = {
        status: 'OK',
        inspection: {
          ...f.d4Outcome.inspection,
          perSession: [...f.d4Outcome.inspection.perSession, { ...row }],
        },
      };
      expect(rejectReason({ ...f, d4Outcome })).toBe('DUPLICATE_SESSION_MAPPING');
    });
  });

  describe('profile slice matrix', () => {
    it('DEFAULT → DEFAULT passes', () => {
      expect(build(buildE1SingleEligibleFixture()).status).toBe('OK');
    });

    it('DEFAULT → PROVISIONAL rejects', () => {
      const f = withE1D4Inspection(buildE1SingleEligibleFixture(), (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) => ({ ...r, profileSlice: 'PROVISIONAL' as const })),
      }));
      expect(rejectReason(f)).toBe('D3_D4_PROFILE_SLICE_MISMATCH');
    });

    it('PROVISIONAL → PROVISIONAL passes', () => {
      const f = buildE1OkFromSessions([
        buildProfileTestInventoryItem({
          restSessionId: 'p1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
      ]);
      expect(build(f).status).toBe('OK');
    });

    it('PROVISIONAL → DEFAULT rejects', () => {
      const f = withE1D4Inspection(
        buildE1OkFromSessions([
          buildProfileTestInventoryItem({
            restSessionId: 'p1',
            anchorAt: '2026-01-01T10:00:00.000Z',
            inclusionMode: 'PROVISIONAL',
          }),
        ]),
        (insp) => ({
          ...insp,
          perSession: insp.perSession.map((r) => ({ ...r, profileSlice: 'DEFAULT' as const })),
        }),
      );
      expect(rejectReason(f)).toBe('D3_D4_PROFILE_SLICE_MISMATCH');
    });

    it('EXCLUDED → EXCLUDED passes', () => {
      const f = buildE1FullPartitionFixture();
      expect(build(f).status).toBe('OK');
    });

    it('EXCLUDED → DEFAULT rejects', () => {
      const f = withE1D4Inspection(buildE1FullPartitionFixture(), (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) =>
          r.restSessionId === 'd-x1' ? { ...r, profileSlice: 'DEFAULT' as const } : r,
        ),
      }));
      expect(rejectReason(f)).toBe('D3_D4_PROFILE_SLICE_MISMATCH');
    });

    it('EXCLUDED → PROVISIONAL rejects', () => {
      const f = withE1D4Inspection(buildE1FullPartitionFixture(), (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) =>
          r.restSessionId === 'd-x1' ? { ...r, profileSlice: 'PROVISIONAL' as const } : r,
        ),
      }));
      expect(rejectReason(f)).toBe('D3_D4_PROFILE_SLICE_MISMATCH');
    });
  });

  describe('canonical pairing matrix', () => {
    it('PROVISIONAL canonical exact pass', () => {
      const f = buildE1OkFromSessions([
        buildProfileTestInventoryItem({
          restSessionId: 'p-can',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
      ]);
      expect(build(f).status).toBe('OK');
    });

    it('EXCLUDED canonical null pairing pass', () => {
      const f = buildE1FullPartitionFixture();
      const row = d4RowForSession(f, 'd-x1');
      expect(row.canonicalFeatureRowId).toBeNull();
      expect(build(f).status).toBe('OK');
    });

    it('EXCLUDED canonical reference exact pass', () => {
      const f = buildE1OkFromSessions([
        buildProfileTestInventoryItem({
          restSessionId: 'x-can',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['SESSION_INVALIDATED'],
          includePayload: true,
        }),
      ]);
      expect(build(f).status).toBe('OK');
    });

    it('EXCLUDED canonical mismatch', () => {
      const f = withE1D4Inspection(
        buildE1OkFromSessions([
          buildProfileTestInventoryItem({
            restSessionId: 'x-can',
            anchorAt: '2026-01-01T10:00:00.000Z',
            inclusionMode: 'EXCLUDED',
            exclusionReasons: ['SESSION_INVALIDATED'],
            includePayload: true,
          }),
        ]),
        (insp) => ({
          ...insp,
          perSession: insp.perSession.map((r) => ({
            ...r,
            canonicalFeatureRowId: 'wrong-canonical-id',
          })),
        }),
      );
      expect(rejectReason(f)).toBe('D3_D4_CANONICAL_REFERENCE_MISMATCH');
    });
  });

  describe('version pairing matrix', () => {
    it('EXCLUDED version null + D4 versionTuple null pass', () => {
      const f = buildE1FullPartitionFixture();
      expect(build(f).status).toBe('OK');
    });

    it('EXCLUDED RESOLVED exact pass', () => {
      const f = buildE1OkFromSessions([
        buildProfileTestInventoryItem({
          restSessionId: 'x-ver',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['SESSION_INVALIDATED'],
          includePayload: true,
          version: versionTuple({ featureModelVersion: 'fm-x' }),
        }),
      ]);
      expect(build(f).status).toBe('OK');
    });

    it('EXCLUDED UNRESOLVED + null inputContractVersion pass', () => {
      const f = buildE1OkFromSessions([
        buildProfileTestInventoryItem({
          restSessionId: 'x-unres',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['INPUT_CONTRACT_VERSION_UNRESOLVED'],
          includePayload: true,
          version: versionTuple({
            inputContractVersion: null,
            inputContractResolution: 'UNRESOLVED',
          }),
        }),
      ]);
      expect(build(f).status).toBe('OK');
    });

    it('tuple mismatch on DEFAULT', () => {
      const f = withE1D4Inspection(buildE1SingleEligibleFixture(), (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) => ({
          ...r,
          versionTuple: r.versionTuple
            ? { ...r.versionTuple, featureModelVersion: 'fm-wrong' }
            : r.versionTuple,
        })),
      }));
      expect(rejectReason(f)).toBe('D3_D4_VERSION_TUPLE_MISMATCH');
    });
  });

  describe('eligibility matrix', () => {
    it('SOURCE_EVIDENCE_LIMITED DEFAULT excluded + counter', () => {
      const f = withE1D4Inspection(buildE1SingleEligibleFixture(), (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) => ({
          ...r,
          integrityQualifiedDisposition: 'SOURCE_EVIDENCE_LIMITED' as const,
        })),
      }));
      const input = okInput(f);
      expect(input.assessmentGradeObservations).toHaveLength(0);
      expect(input.coverage.sourceEvidenceLimitedCount).toBe(1);
    });

    it('NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED → contract inconsistency', () => {
      const f = withE1D4Inspection(buildE1SingleEligibleFixture(), (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) => ({
          ...r,
          integrityQualifiedDisposition: 'NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED' as const,
        })),
      }));
      expect(rejectReason(f)).toBe('D3_D4_CONTRACT_INCONSISTENCY');
    });

    it('PROVISIONAL never assessment-grade', () => {
      const input = okInput(buildE1FullPartitionFixture());
      expect(
        input.assessmentGradeObservations.every((o) => o.restSessionId !== 'd-p1'),
      ).toBe(true);
    });

    it('EXCLUDED never assessment-grade', () => {
      const input = okInput(buildE1FullPartitionFixture());
      expect(input.assessmentGradeObservations.every((o) => o.restSessionId === 'd-s1')).toBe(
        true,
      );
    });

    it('BOUNDED_LATEST_WINDOW + ELIGIBLE included with scope carried', () => {
      const f = withE1D4Inspection(buildE1SingleEligibleFixture(), (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) => ({
          ...r,
          digestVerificationScope: 'BOUNDED_LATEST_WINDOW' as const,
        })),
      }));
      const input = okInput(f);
      expect(input.assessmentGradeObservations).toHaveLength(1);
      expect(input.assessmentGradeObservations[0].integrityContext.digestVerificationScope).toBe(
        'BOUNDED_LATEST_WINDOW',
      );
    });
  });

  describe('coverage matrix', () => {
    it('mixed partition counts + provisional-only limitation does not inflate DEFAULT sourceEvidenceLimitedCount', () => {
      const sessions = [
        buildProfileTestInventoryItem({
          restSessionId: 'd-elig',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'd-quar',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'd-lim',
          anchorAt: '2026-01-03T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'd-p1',
          anchorAt: '2026-01-04T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'd-x1',
          anchorAt: '2026-01-05T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['NO_CANONICAL_ROW'],
          includePayload: false,
        }),
      ];
      let f = buildE1OkFromSessions(sessions, 'cov-mix');
      f = withE1D4Inspection(f, (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) => {
          if (r.restSessionId === 'd-quar') {
            return { ...r, integrityQualifiedDisposition: 'QUARANTINED_INTEGRITY_WARNING' as const };
          }
          if (r.restSessionId === 'd-lim') {
            return { ...r, integrityQualifiedDisposition: 'SOURCE_EVIDENCE_LIMITED' as const };
          }
          if (r.restSessionId === 'd-p1') {
            return { ...r, integrityQualifiedDisposition: 'SOURCE_EVIDENCE_LIMITED' as const };
          }
          return r;
        }),
      }));
      const input = okInput(f);
      const c = input.coverage;
      expect(c.d3DefaultObservationCount).toBe(3);
      expect(c.d3DefaultObservationCount).toBe(
        c.assessmentGradeObservationCount +
          c.quarantinedIntegrityWarningCount +
          c.sourceEvidenceLimitedCount,
      );
      expect(c.provisionalContextCount).toBe(f.scientificProfile.provisionalObservations.length);
      expect(c.excludedContextCount).toBe(f.scientificProfile.excludedSessions.length);
      expect(c.sourceEvidenceLimitedCount).toBe(1);
    });
  });

  describe('evidence window matrix', () => {
    it('0 eligible — null window + NO_ASSESSMENT_GRADE_INPUT + empty segments + fingerprint', () => {
      const f = withE1D4Inspection(buildE1SingleEligibleFixture(), (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) => ({
          ...r,
          integrityQualifiedDisposition: 'SOURCE_EVIDENCE_LIMITED' as const,
        })),
      }));
      const input = okInput(f);
      expect(input.evidenceWindow).toEqual({
        firstEligibleAnchorAt: null,
        lastEligibleAnchorAt: null,
        eligibleEvidenceSpanMs: null,
      });
      expect(input.modelEvaluation.inputAvailability).toBe('NO_ASSESSMENT_GRADE_INPUT');
      expect(input.eligibleVersionSegments).toEqual([]);
      expect(input.consumptionInputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    });

    it('1 eligible — span 0', () => {
      const input = okInput(buildE1SingleEligibleFixture());
      const anchor = input.assessmentGradeObservations[0].anchorAt;
      expect(input.evidenceWindow).toEqual({
        firstEligibleAnchorAt: anchor,
        lastEligibleAnchorAt: anchor,
        eligibleEvidenceSpanMs: 0,
      });
    });

    it('N>=2 eligible — exact span ms', () => {
      const input = okInput(buildE1GoldenConsumptionFixture());
      const first = input.assessmentGradeObservations[0].anchorAt;
      const last =
        input.assessmentGradeObservations[input.assessmentGradeObservations.length - 1].anchorAt;
      expect(input.evidenceWindow.firstEligibleAnchorAt).toBe(first);
      expect(input.evidenceWindow.lastEligibleAnchorAt).toBe(last);
      expect(input.evidenceWindow.eligibleEvidenceSpanMs).toBe(
        Date.parse(last) - Date.parse(first),
      );
    });

    it('equal anchorAt — UTF-16 restSessionId order in assessment-grade list', () => {
      const anchor = '2026-01-01T10:00:00.000Z';
      const input = okInput(
        buildE1OkFromSessions([
          buildProfileTestInventoryItem({
            restSessionId: 'session-2',
            anchorAt: anchor,
            inclusionMode: 'DEFAULT',
          }),
          buildProfileTestInventoryItem({
            restSessionId: 'session-10',
            anchorAt: anchor,
            inclusionMode: 'DEFAULT',
          }),
        ]),
      );
      expect(input.assessmentGradeObservations.map((o) => o.restSessionId)).toEqual([
        'session-10',
        'session-2',
      ]);
    });
  });

  describe('version segment matrix', () => {
    const abaSessions = () => {
      const vA = versionTuple({ featureModelVersion: 'fm-a' });
      const vB = versionTuple({ featureModelVersion: 'fm-b' });
      return [
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
    };

    it('A→B→A all eligible → [0,1,2]', () => {
      const input = okInput(buildE1OkFromSessions(abaSessions()));
      expect(input.eligibleVersionSegments.map((s) => s.sourceSegmentIndex)).toEqual([0, 1, 2]);
    });

    it('A→B→A with B non-eligible → [0,2] not merged', () => {
      let f = buildE1OkFromSessions(abaSessions());
      f = withE1D4Inspection(f, (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) =>
          r.restSessionId === 's3' || r.restSessionId === 's4'
            ? { ...r, integrityQualifiedDisposition: 'QUARANTINED_INTEGRITY_WARNING' as const }
            : r,
        ),
      }));
      const input = okInput(f);
      expect(input.eligibleVersionSegments.map((s) => s.sourceSegmentIndex)).toEqual([0, 2]);
    });

    it('segment metadata exact for filtered boundary segment', () => {
      const vA = versionTuple({ featureModelVersion: 'fm-a' });
      let f = buildE1OkFromSessions([
        buildProfileTestInventoryItem({
          restSessionId: 'seg-a1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: vA,
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'seg-a2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: vA,
        }),
      ]);
      f = withE1D4Inspection(f, (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) =>
          r.restSessionId === 'seg-a1'
            ? { ...r, integrityQualifiedDisposition: 'QUARANTINED_INTEGRITY_WARNING' as const }
            : r,
        ),
      }));
      const input = okInput(f);
      expect(input.eligibleVersionSegments).toHaveLength(1);
      const seg = input.eligibleVersionSegments[0];
      expect(seg.sourceSegmentIndex).toBe(0);
      expect(seg.observationCount).toBe(1);
      expect(seg.restSessionIds).toEqual(['seg-a2']);
      expect(seg.firstAnchorAt).toBe('2026-01-02T10:00:00.000Z');
      expect(seg.lastAnchorAt).toBe('2026-01-02T10:00:00.000Z');
      expect(seg.firstAnchorAt).toBe(seg.lastAnchorAt);
    });

    it('source segment with zero retained observations omitted', () => {
      const vA = versionTuple({ featureModelVersion: 'fm-seg-a' });
      const vB = versionTuple({ featureModelVersion: 'fm-seg-b' });
      let f = buildE1OkFromSessions([
        buildProfileTestInventoryItem({
          restSessionId: 'omit-a1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: vA,
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'omit-b1',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: vB,
        }),
      ]);
      f = withE1D4Inspection(f, (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) =>
          r.restSessionId === 'omit-a1'
            ? { ...r, integrityQualifiedDisposition: 'QUARANTINED_INTEGRITY_WARNING' as const }
            : r,
        ),
      }));
      const input = okInput(f);
      expect(input.eligibleVersionSegments).toHaveLength(1);
      expect(input.eligibleVersionSegments[0].sourceSegmentIndex).toBe(1);
      expect(input.eligibleVersionSegments[0].restSessionIds).toEqual(['omit-b1']);
    });
  });

  describe('fingerprint matrix', () => {
    const baseline = () => okInput(buildE1GoldenConsumptionFixture());

    function rebuildFromSessions(
      sessions: Parameters<typeof buildE1OkFromSessions>[0],
      revisionId: string,
    ) {
      return okInput(buildE1OkFromSessions(sessions, revisionId));
    }

    it('golden unchanged after UTF-16 ordering fix', () => {
      expect(baseline().consumptionInputFingerprint).toBe(
        M3_3E_E1_GOLDEN_CONSUMPTION_FINGERPRINT_LITERAL,
      );
    });

    it('zero-eligible deterministic fingerprint on repeat', () => {
      const f = withE1D4Inspection(buildE1SingleEligibleFixture(), (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) => ({
          ...r,
          integrityQualifiedDisposition: 'SOURCE_EVIDENCE_LIMITED' as const,
        })),
      }));
      const a = okInput(f);
      const b = okInput(f);
      expect(a.consumptionInputFingerprint).toBe(b.consumptionInputFingerprint);
    });

    function fingerprintParamsFromInput(
      input: ReturnType<typeof baseline>,
    ): Parameters<typeof computeM3_3E_ConsumptionInputFingerprintV1>[0] {
      return {
        organizationId: input.identity.organizationId,
        vehicleId: input.identity.vehicleId,
        canonicalProfileFingerprint: input.identity.canonicalProfileFingerprint,
        longitudinalProfileContractVersion: input.identity.longitudinalProfileContractVersion,
        profilePolicyVersion: input.identity.profilePolicyVersion,
        integrityInspectionContractVersion: input.identity.integrityInspectionContractVersion,
        assessmentGradeObservations: input.assessmentGradeObservations,
      };
    }

    it('key insertion order does not change fingerprint', () => {
      const input = baseline();
      const obs0 = input.assessmentGradeObservations[0];
      const obs1 = input.assessmentGradeObservations[1];
      const reordered0 = {
        temperatureSource: obs0.temperatureSource,
        temperatureC: obs0.temperatureC,
        restSessionId: obs0.restSessionId,
        anchorAt: obs0.anchorAt,
        features: obs0.features,
        versionTuple: obs0.versionTuple,
        inputDigest: obs0.inputDigest,
        canonicalFeatureRowId: obs0.canonicalFeatureRowId,
        chargeOpportunityClass: obs0.chargeOpportunityClass,
        chargeContextCompleteness: obs0.chargeContextCompleteness,
        anchorResolutionStatus: obs0.anchorResolutionStatus,
        integrityContext: obs0.integrityContext,
      } as M3_3E_AssessmentGradeObservationV1;
      const params = fingerprintParamsFromInput(input);
      const fp1 = computeM3_3E_ConsumptionInputFingerprintV1(params);
      const fp2 = computeM3_3E_ConsumptionInputFingerprintV1({
        ...params,
        assessmentGradeObservations: [reordered0, obs1],
      });
      expect(fp1).toBe(fp2);
      expect(canonicalFeatureInputUtf8({ z: 1, a: 2 })).toBe(
        canonicalFeatureInputUtf8({ a: 2, z: 1 }),
      );
    });

    it.each([
      [
        'eligible set',
        () =>
          rebuildFromSessions(
            [
              buildProfileTestInventoryItem({
                restSessionId: 'only-one',
                anchorAt: '2026-01-01T10:00:00.000Z',
                inclusionMode: 'DEFAULT',
              }),
            ],
            'fp-eligible-set',
          ),
      ],
      [
        'feature scalar',
        () => {
          const s1 = buildProfileTestInventoryItem({
            restSessionId: 'e1-golden-s1',
            anchorAt: '2026-01-01T10:00:00.000Z',
            inclusionMode: 'DEFAULT',
          });
          return okInput(
            buildE1OkFromSessions(
              [
                {
                  ...s1,
                  features: s1.features
                    ? { ...s1.features, minimumRestVoltageMv: 99999 }
                    : s1.features,
                },
                buildProfileTestInventoryItem({
                  restSessionId: 'e1-golden-s2',
                  anchorAt: '2026-01-02T10:00:00.000Z',
                  inclusionMode: 'DEFAULT',
                }),
              ],
              'e1-golden-rev',
            ),
          );
        },
      ],
      [
        'temperatureC',
        () => {
          const s1 = buildProfileTestInventoryItem({
            restSessionId: 'e1-golden-s1',
            anchorAt: '2026-01-01T10:00:00.000Z',
            inclusionMode: 'DEFAULT',
          });
          return okInput(
            buildE1OkFromSessions(
              [
                {
                  ...s1,
                  snapshot: s1.snapshot
                    ? { ...s1.snapshot, temperatureC: 21.5 }
                    : s1.snapshot,
                },
                buildProfileTestInventoryItem({
                  restSessionId: 'e1-golden-s2',
                  anchorAt: '2026-01-02T10:00:00.000Z',
                  inclusionMode: 'DEFAULT',
                }),
              ],
              'e1-golden-rev',
            ),
          );
        },
      ],
      [
        'temperatureSource',
        () => {
          const s1 = buildProfileTestInventoryItem({
            restSessionId: 'e1-golden-s1',
            anchorAt: '2026-01-01T10:00:00.000Z',
            inclusionMode: 'DEFAULT',
          });
          return okInput(
            buildE1OkFromSessions(
              [
                {
                  ...s1,
                  snapshot: s1.snapshot
                    ? { ...s1.snapshot, temperatureSource: 'TRIP_EXTERIOR' as const }
                    : s1.snapshot,
                },
                buildProfileTestInventoryItem({
                  restSessionId: 'e1-golden-s2',
                  anchorAt: '2026-01-02T10:00:00.000Z',
                  inclusionMode: 'DEFAULT',
                }),
              ],
              'e1-golden-rev',
            ),
          );
        },
      ],
      [
        'chargeOpportunityClass',
        () => {
          const s1 = buildProfileTestInventoryItem({
            restSessionId: 'e1-golden-s1',
            anchorAt: '2026-01-01T10:00:00.000Z',
            inclusionMode: 'DEFAULT',
          });
          return okInput(
            buildE1OkFromSessions(
              [
                {
                  ...s1,
                  features: s1.features
                    ? { ...s1.features, chargeOpportunityClass: 'SUFFICIENT' as const }
                    : s1.features,
                },
                buildProfileTestInventoryItem({
                  restSessionId: 'e1-golden-s2',
                  anchorAt: '2026-01-02T10:00:00.000Z',
                  inclusionMode: 'DEFAULT',
                }),
              ],
              'e1-golden-rev',
            ),
          );
        },
      ],
      [
        'chargeContextCompleteness',
        () => {
          const s1 = buildProfileTestInventoryItem({
            restSessionId: 'e1-golden-s1',
            anchorAt: '2026-01-01T10:00:00.000Z',
            inclusionMode: 'DEFAULT',
          });
          return okInput(
            buildE1OkFromSessions(
              [
                {
                  ...s1,
                  snapshot: s1.snapshot
                    ? { ...s1.snapshot, chargeContextCompleteness: ['MISSING_TEMPERATURE'] }
                    : s1.snapshot,
                },
                buildProfileTestInventoryItem({
                  restSessionId: 'e1-golden-s2',
                  anchorAt: '2026-01-02T10:00:00.000Z',
                  inclusionMode: 'DEFAULT',
                }),
              ],
              'e1-golden-rev',
            ),
          );
        },
      ],
      [
        'inputDigest',
        () =>
          okInput(
            buildE1OkFromSessions(
              [
                buildProfileTestInventoryItem({
                  restSessionId: 'e1-golden-s1',
                  anchorAt: '2026-01-01T10:00:01.000Z',
                  inclusionMode: 'DEFAULT',
                }),
                buildProfileTestInventoryItem({
                  restSessionId: 'e1-golden-s2',
                  anchorAt: '2026-01-02T10:00:00.000Z',
                  inclusionMode: 'DEFAULT',
                }),
              ],
              'e1-golden-rev',
            ),
          ),
      ],
      [
        'versionTuple',
        () =>
          okInput(
            buildE1OkFromSessions(
              [
                buildProfileTestInventoryItem({
                  restSessionId: 'e1-golden-s1',
                  anchorAt: '2026-01-01T10:00:00.000Z',
                  inclusionMode: 'DEFAULT',
                  version: versionTuple({ featureModelVersion: 'fm-fp-mutated' }),
                }),
                buildProfileTestInventoryItem({
                  restSessionId: 'e1-golden-s2',
                  anchorAt: '2026-01-02T10:00:00.000Z',
                  inclusionMode: 'DEFAULT',
                }),
              ],
              'e1-golden-rev',
            ),
          ),
      ],
    ] as const)('fingerprint changes when %s changes', (_label, mutate) => {
      const baseFp = baseline().consumptionInputFingerprint;
      const mutated = mutate();
      expect(mutated.consumptionInputFingerprint).not.toBe(baseFp);
    });

    it('fingerprint changes when digestVerificationScope changes', () => {
      const baseFp = baseline().consumptionInputFingerprint;
      const f = withE1D4Inspection(buildE1GoldenConsumptionFixture(), (insp) => ({
        ...insp,
        perSession: insp.perSession.map((r) =>
          r.restSessionId === 'e1-golden-s1'
            ? { ...r, digestVerificationScope: 'BOUNDED_LATEST_WINDOW' as const }
            : r,
        ),
      }));
      expect(okInput(f).consumptionInputFingerprint).not.toBe(baseFp);
    });
  });
});
