import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { buildLongitudinalScientificProfileProjectionV1 } from './longitudinal-profile-scientific-projection';
import {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
  versionTuple,
} from './longitudinal-profile.test-fixtures';
import { parseLongitudinalScientificProfileProjectionV1 } from './longitudinal-scientific-profile.parser';
import { buildD4TestProjection } from './longitudinal-integrity-inspection.test-helpers';

function validProjection() {
  return buildD4TestProjection([
    buildProfileTestInventoryItem({
      restSessionId: 's1',
      anchorAt: '2026-01-01T10:00:00.000Z',
      inclusionMode: 'DEFAULT',
    }),
  ]);
}

function parseRaw(input: unknown) {
  return parseLongitudinalScientificProfileProjectionV1(input);
}

describe('parseLongitudinalScientificProfileProjectionV1 (M3.3D D4)', () => {
  describe('§7.1 identity / contract', () => {
    it('accepts assembled scientific projection', () => {
      const projection = validProjection();
      const parsed = parseRaw(projection);
      expect(parsed).toEqual({ status: 'OK', projection });
    });

    it('rejects non-object root', () => {
      expect(parseRaw(null)).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });

    it('rejects unsupported contract', () => {
      const projection = validProjection();
      expect(
        parseRaw({ ...projection, longitudinalProfileContractVersion: 'UNKNOWN' }),
      ).toEqual({ status: 'FAILED', reason: 'UNSUPPORTED_PROFILE_CONTRACT' });
    });

    it('rejects unsupported policy', () => {
      const projection = validProjection();
      expect(parseRaw({ ...projection, profilePolicyVersion: 'UNKNOWN' })).toEqual({
        status: 'FAILED',
        reason: 'UNSUPPORTED_PROFILE_POLICY_VERSION',
      });
    });

    it('rejects empty organizationId', () => {
      const projection = validProjection();
      expect(parseRaw({ ...projection, organizationId: '' })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('pins supported contract constants', () => {
      expect(REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION).toBe(
        'M3_3D_LONGITUDINAL_PROFILE_V1',
      );
      expect(REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION).toBe('M3_3D_PROFILE_POLICY_V1');
    });
  });

  describe('§7.2 window', () => {
    it('rejects profileGeneratedAt inside window', () => {
      const projection = validProjection();
      expect(
        parseRaw({
          ...projection,
          window: { ...projection.window, profileGeneratedAt: PROFILE_TEST_GENERATED_AT },
        }),
      ).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });

    it('rejects requested/applied limit mismatch', () => {
      const projection = validProjection();
      expect(
        parseRaw({
          ...projection,
          window: { ...projection.window, requestedSessionLimit: 5, appliedSessionLimit: 10 },
        }),
      ).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });

    it('rejects invalid firstIncludedAnchorAt', () => {
      const projection = validProjection();
      expect(
        parseRaw({
          ...projection,
          window: { ...projection.window, firstIncludedAnchorAt: 'not-a-date' },
        }),
      ).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });
  });

  describe('§7.3 partition / coverage', () => {
    it('rejects partition count mismatch', () => {
      const projection = validProjection();
      expect(
        parseRaw({
          ...projection,
          coverage: { ...projection.coverage, candidateRestSessionCount: 99 },
        }),
      ).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });

    it('rejects includedSessionCount drift', () => {
      const projection = validProjection();
      expect(
        parseRaw({
          ...projection,
          coverage: { ...projection.coverage, includedSessionCount: 0 },
        }),
      ).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });

    it('rejects duplicate restSessionId across slices', () => {
      const projection = validProjection();
      const dup = { ...projection.observations[0], restSessionId: 'dup' };
      expect(
        parseRaw({
          ...projection,
          observations: [dup],
          provisionalObservations: [{ ...dup }],
          coverage: {
            ...projection.coverage,
            candidateRestSessionCount: 2,
            includedSessionCount: 1,
            provisionalSessionCount: 1,
          },
        }),
      ).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });
  });

  describe('§7.6 profileStatus', () => {
    it('rejects OK status with zero observations', () => {
      const projection = buildD4TestProjection([
        buildProfileTestInventoryItem({
          restSessionId: 'p1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
      ]);
      expect(parseRaw({ ...projection, profileStatus: 'OK' })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('rejects NO_ELIGIBLE_SESSIONS with observations present', () => {
      const projection = validProjection();
      expect(parseRaw({ ...projection, profileStatus: 'NO_ELIGIBLE_SESSIONS' })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });
  });

  describe('§7.7 window derivations', () => {
    it('accepts zero observation anchors and span null', () => {
      const projection = buildD4TestProjection([
        buildProfileTestInventoryItem({
          restSessionId: 'e1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['NO_CANONICAL_ROW'],
          includePayload: false,
        }),
      ]);
      expect(parseRaw(projection).status).toBe('OK');
    });

    it('rejects span mismatch for multi-default profile', () => {
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
      expect(
        parseRaw({
          ...projection,
          coverage: { ...projection.coverage, validEvidenceSpanMs: 1 },
        }),
      ).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });
  });

  describe('§7.8 statusReasons / excludedByReason', () => {
    it('rejects stableDefaultCount drift', () => {
      const projection = validProjection();
      expect(
        parseRaw({
          ...projection,
          statusReasons: { ...projection.statusReasons, stableDefaultCount: 0 },
        }),
      ).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });

    it('rejects coverage.excludedByReason drift', () => {
      const projection = buildD4TestProjection([
        buildProfileTestInventoryItem({
          restSessionId: 'e1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['NO_CANONICAL_ROW'],
          includePayload: false,
        }),
      ]);
      expect(
        parseRaw({
          ...projection,
          coverage: { ...projection.coverage, excludedByReason: { NO_CANONICAL_ROW: 99 } },
        }),
      ).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });
  });

  describe('§7.9 version segments', () => {
    it('rejects broken segmentIndex sequence', () => {
      const projection = buildD4TestProjection([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: versionTuple({ featureModelVersion: 'fm-a' }),
        }),
        buildProfileTestInventoryItem({
          restSessionId: 's2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: versionTuple({ featureModelVersion: 'fm-b' }),
        }),
      ]);
      const broken = projection.versionSegments.map((s) => ({ ...s, segmentIndex: s.segmentIndex + 1 }));
      expect(parseRaw({ ...projection, versionSegments: broken })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('accepts VERSION_SEGMENTED flag when multiple segments', () => {
      const projection = buildD4TestProjection([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: versionTuple({ featureModelVersion: 'fm-a' }),
        }),
        buildProfileTestInventoryItem({
          restSessionId: 's2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: versionTuple({ featureModelVersion: 'fm-b' }),
        }),
      ]);
      const parsed = parseRaw(projection);
      expect(parsed.status).toBe('OK');
      if (parsed.status === 'OK') {
        expect(parsed.projection.profileFlags).toContain('VERSION_SEGMENTED');
      }
    });
  });

  describe('§7.10 profile flags', () => {
    it('rejects duplicate profileFlags', () => {
      const projection = buildD4TestProjection([
        buildProfileTestInventoryItem({
          restSessionId: 'p1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
      ]);
      expect(
        parseRaw({
          ...projection,
          profileFlags: ['PROVISIONAL_SESSIONS_PRESENT', 'PROVISIONAL_SESSIONS_PRESENT'],
        }),
      ).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });

    it('rejects unknown profile flag', () => {
      const projection = validProjection();
      expect(parseRaw({ ...projection, profileFlags: ['UNKNOWN_FLAG'] })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('rejects missing PROVISIONAL flag when provisional sessions exist', () => {
      const projection = buildD4TestProjection([
        buildProfileTestInventoryItem({
          restSessionId: 'p1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
      ]);
      expect(parseRaw({ ...projection, profileFlags: [] })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('sets INPUT_CONTRACT_UNRESOLVED_PRESENT when excluded unresolved', () => {
      const projection = buildD4TestProjection([
        buildProfileTestInventoryItem({
          restSessionId: 'e1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['INPUT_CONTRACT_VERSION_UNRESOLVED'],
          includePayload: false,
          version: versionTuple({ inputContractResolution: 'UNRESOLVED', inputContractVersion: null }),
        }),
      ]);
      const parsed = parseRaw(projection);
      expect(parsed.status).toBe('OK');
      if (parsed.status === 'OK') {
        expect(parsed.projection.profileFlags).toContain('INPUT_CONTRACT_UNRESOLVED_PRESENT');
      }
    });
  });

  describe('§7.11 derived / ordering / trendReadiness', () => {
    it('rejects non-null derived', () => {
      const projection = validProjection();
      expect(parseRaw({ ...projection, derived: { unexpected: true } })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('rejects unsorted observations by anchorAt', () => {
      const assembled = assembleLongitudinalProfileV1({
        inventory: buildProfileTestInventory([
          buildProfileTestInventoryItem({
            restSessionId: 's2',
            anchorAt: '2026-01-02T10:00:00.000Z',
            inclusionMode: 'DEFAULT',
          }),
          buildProfileTestInventoryItem({
            restSessionId: 's1',
            anchorAt: '2026-01-01T10:00:00.000Z',
            inclusionMode: 'DEFAULT',
          }),
        ]),
        profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
      });
      if (assembled.status !== 'OK') throw new Error(assembled.reason);
      const projection = buildLongitudinalScientificProfileProjectionV1(assembled.profile);
      const swapped = [projection.observations[1], projection.observations[0]];
      expect(parseRaw({ ...projection, observations: swapped })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('rejects embedded perSessionInspectionStatus other than NOT_EVALUATED', () => {
      const projection = validProjection();
      const obs = {
        ...projection.observations[0],
        perSessionInspectionStatus: 'ELIGIBLE' as const,
      };
      expect(parseRaw({ ...projection, observations: [obs] })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('rejects trendReadiness evaluated fields', () => {
      const projection = validProjection();
      expect(
        parseRaw({
          ...projection,
          trendReadiness: {
            trendReadiness: 'READY',
            minimumSessionsForDescriptiveTrend: 3,
            meetsMinimum: true,
          },
        }),
      ).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
    });

    it('rejects unsorted exclusionReasons on excluded session', () => {
      const projection = buildD4TestProjection([
        buildProfileTestInventoryItem({
          restSessionId: 'e1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['SESSION_INVALIDATED', 'NO_CANONICAL_ROW'],
          includePayload: false,
        }),
      ]);
      const excluded = {
        ...projection.excludedSessions[0],
        exclusionReasons: ['SESSION_INVALIDATED', 'NO_CANONICAL_ROW'],
      };
      expect(parseRaw({ ...projection, excludedSessions: [excluded] })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });
  });

  describe('strict V1 unknown keys and coercion', () => {
    it('rejects unknown root field', () => {
      const projection = validProjection();
      expect(parseRaw({ ...projection, extraRootField: true })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('rejects unknown observation field', () => {
      const projection = validProjection();
      const obs = { ...projection.observations[0], extraObservationField: true };
      expect(parseRaw({ ...projection, observations: [obs] })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('rejects unknown feature field', () => {
      const projection = validProjection();
      const obs = {
        ...projection.observations[0],
        features: { ...projection.observations[0].features, extraFeatureField: 1 },
      };
      expect(parseRaw({ ...projection, observations: [obs] })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('rejects excluded version tuple with numeric featureModelVersion', () => {
      const projection = buildD4TestProjection([
        buildProfileTestInventoryItem({
          restSessionId: 'e-num',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['NO_CANONICAL_ROW'],
          includePayload: false,
        }),
      ]);
      const excluded = {
        ...projection.excludedSessions[0],
        version: {
          featureModelVersion: 1,
          retentionPolicyVersion: 'ret-v1',
          chargeOpportunityPolicyVersion: 'chg-v1',
          inputContractVersion: null,
          inputContractResolution: 'UNRESOLVED',
        },
      };
      expect(parseRaw({ ...projection, excludedSessions: [excluded] })).toEqual({
        status: 'FAILED',
        reason: 'MALFORMED_SCIENTIFIC_PROFILE',
      });
    });

    it('accepts JSON key-order differences on observation objects', () => {
      const projection = validProjection();
      const obs = projection.observations[0];
      const reordered = JSON.parse(
        JSON.stringify({
          features: obs.features,
          restSessionId: obs.restSessionId,
          anchorAt: obs.anchorAt,
          sessionStatus: obs.sessionStatus,
          endReason: obs.endReason,
          canonical: obs.canonical,
          versionTuple: obs.versionTuple,
          anchorResolutionStatus: obs.anchorResolutionStatus,
          perSessionInspectionStatus: obs.perSessionInspectionStatus,
          chargeContextCompleteness: obs.chargeContextCompleteness,
          temperatureC: obs.temperatureC,
          temperatureSource: obs.temperatureSource,
        }),
      );
      expect(parseRaw({ ...projection, observations: [reordered] }).status).toBe('OK');
    });
  });
});
