import { REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION } from './longitudinal-input.constants';
import {
  assembleLongitudinalProfileV1,
  sortLongitudinalInventoryChronological,
} from './longitudinal-profile.assembler';
import {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
  PROFILE_TEST_ORG,
  PROFILE_TEST_VEHICLE,
  versionTuple,
} from './longitudinal-profile.test-fixtures';

const assemble = (sessions: Parameters<typeof buildProfileTestInventory>[0], window?: Parameters<typeof buildProfileTestInventory>[1]) =>
  assembleLongitudinalProfileV1({
    inventory: buildProfileTestInventory(sessions, window),
    profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
  });

describe('longitudinal-profile.assembler (M3.3D D2)', () => {
  describe('A — empty inventory', () => {
    it('NO_ELIGIBLE_SESSIONS, null anchors and span', () => {
      const out = assemble([]);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.profileStatus).toBe('NO_ELIGIBLE_SESSIONS');
      expect(out.profile.window.firstIncludedAnchorAt).toBeNull();
      expect(out.profile.window.lastIncludedAnchorAt).toBeNull();
      expect(out.profile.coverage.validEvidenceSpanMs).toBeNull();
      expect(out.profile.coverage.candidateRestSessionCount).toBe(0);
    });
  });

  describe('B — one DEFAULT', () => {
    it('included=1, span=0, OK, trend not evaluated', () => {
      const out = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.profileStatus).toBe('OK');
      expect(out.profile.coverage.includedSessionCount).toBe(1);
      expect(out.profile.coverage.validEvidenceSpanMs).toBe(0);
      expect(out.profile.trendReadiness.trendReadiness).toBe('NOT_EVALUATED');
      expect(out.profile.trendReadiness.meetsMinimum).toBeNull();
      expect(out.profile.derived).toBeNull();
    });
  });

  describe('C — multiple DEFAULT', () => {
    it('chronological normalization, span, first/last', () => {
      const out = assemble([
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
      ]);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.observations.map((o) => o.restSessionId)).toEqual(['s1', 's2']);
      expect(out.profile.window.firstIncludedAnchorAt).toBe('2026-01-01T10:00:00.000Z');
      expect(out.profile.window.lastIncludedAnchorAt).toBe('2026-01-02T10:00:00.000Z');
      expect(out.profile.coverage.validEvidenceSpanMs).toBe(86_400_000);
    });
  });

  describe('D — DEFAULT / PROVISIONAL / EXCLUDED partition', () => {
    it('counts sum to candidate; stable series excludes provisional and excluded', () => {
      const sessions = [
        buildProfileTestInventoryItem({
          restSessionId: 'd1',
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
      ];
      const out = assemble(sessions);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const { coverage } = out.profile;
      expect(coverage.candidateRestSessionCount).toBe(3);
      expect(coverage.includedSessionCount).toBe(1);
      expect(coverage.provisionalSessionCount).toBe(1);
      expect(coverage.excludedSessionCount).toBe(1);
      expect(
        coverage.includedSessionCount +
          coverage.provisionalSessionCount +
          coverage.excludedSessionCount,
      ).toBe(coverage.candidateRestSessionCount);
      expect(out.profile.observations).toHaveLength(1);
      expect(out.profile.provisionalObservations).toHaveLength(1);
      expect(out.profile.excludedSessions).toHaveLength(1);
    });
  });

  describe('E — provisional only', () => {
    it('NO_ELIGIBLE_SESSIONS + PROVISIONAL_SESSIONS_PRESENT', () => {
      const out = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 'p1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
      ]);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.profileStatus).toBe('NO_ELIGIBLE_SESSIONS');
      expect(out.profile.observations).toHaveLength(0);
      expect(out.profile.provisionalObservations).toHaveLength(1);
      expect(out.profile.profileFlags).toContain('PROVISIONAL_SESSIONS_PRESENT');
    });
  });

  describe('F — excluded NO_CANONICAL_ROW', () => {
    it('exclusion audit with null canonical/version/features', () => {
      const out = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 'e1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['NO_CANONICAL_ROW'],
          includePayload: false,
        }),
      ]);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const ex = out.profile.excludedSessions[0];
      expect(ex.canonical).toBeNull();
      expect(ex.version).toBeNull();
      expect(ex.inputDigest).toBeNull();
      expect(ex.exclusionReasons).toEqual(['NO_CANONICAL_ROW']);
    });
  });

  describe('G — INPUT_CONTRACT UNRESOLVED', () => {
    it('flag + persisted column versions on excluded item', () => {
      const unresolvedVersion = versionTuple({
        inputContractVersion: null,
        inputContractResolution: 'UNRESOLVED',
      });
      const out = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 'e1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['INPUT_CONTRACT_VERSION_UNRESOLVED'],
          version: unresolvedVersion,
          includePayload: true,
        }),
      ]);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.profileFlags).toContain('INPUT_CONTRACT_UNRESOLVED_PRESENT');
      expect(out.profile.excludedSessions[0].version).toEqual(unresolvedVersion);
    });
  });

  describe('H — multi-reason exclusion', () => {
    it('session counted once; reasons counted per occurrence', () => {
      const out = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 'e1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['SESSION_INVALIDATED', 'SESSION_TRUST_INVALIDATED'],
          includePayload: false,
        }),
      ]);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.coverage.excludedSessionCount).toBe(1);
      expect(out.profile.coverage.excludedByReason.SESSION_INVALIDATED).toBe(1);
      expect(out.profile.coverage.excludedByReason.SESSION_TRUST_INVALIDATED).toBe(1);
      const reasonSum = Object.values(out.profile.coverage.excludedByReason).reduce(
        (a, b) => a + (b ?? 0),
        0,
      );
      expect(reasonSum).toBeGreaterThan(out.profile.coverage.excludedSessionCount);
    });
  });

  describe('I — version segment single', () => {
    it('one segment for uniform tuple', () => {
      const out = assemble([
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
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.versionSegments).toHaveLength(1);
      expect(out.profile.versionSegments[0].sessionCount).toBe(2);
      expect(out.profile.profileFlags).not.toContain('VERSION_SEGMENTED');
    });
  });

  describe('J — version segment change', () => {
    it('splits when any tuple component changes', () => {
      const v1 = versionTuple({ featureModelVersion: 'fm-a' });
      const v2 = versionTuple({ featureModelVersion: 'fm-b' });
      const out = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: v1,
        }),
        buildProfileTestInventoryItem({
          restSessionId: 's2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: v2,
        }),
      ]);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.versionSegments).toHaveLength(2);
      expect(out.profile.profileFlags).toContain('VERSION_SEGMENTED');
    });
  });

  describe('K — version segment A-B-A', () => {
    it('three contiguous segments, no global collapse', () => {
      const vA = versionTuple({ featureModelVersion: 'fm-a' });
      const vB = versionTuple({ featureModelVersion: 'fm-b' });
      const out = assemble([
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
      ]);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.versionSegments).toHaveLength(3);
      expect(out.profile.versionSegments.map((s) => s.sessionCount)).toEqual([2, 2, 1]);
      expect(out.profile.versionSegments.map((s) => s.segmentIndex)).toEqual([0, 1, 2]);
    });
  });

  describe('L — provisional version change', () => {
    it('does not create stable version segments', () => {
      const v1 = versionTuple({ featureModelVersion: 'fm-a' });
      const v2 = versionTuple({ featureModelVersion: 'fm-b' });
      const out = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 'p1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
          version: v1,
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'p2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
          version: v2,
        }),
      ]);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.versionSegments).toHaveLength(0);
    });
  });

  describe('M — UTF-16 ordering tie-break', () => {
    it('orders equal anchorAt by restSessionId code units', () => {
      const anchor = '2026-01-01T10:00:00.000Z';
      const low = 'a\u0061';
      const high = 'a\u0062';
      const sessions = [
        buildProfileTestInventoryItem({
          restSessionId: high,
          anchorAt: anchor,
          inclusionMode: 'DEFAULT',
        }),
        buildProfileTestInventoryItem({
          restSessionId: low,
          anchorAt: anchor,
          inclusionMode: 'DEFAULT',
        }),
      ];
      const sorted = sortLongitudinalInventoryChronological(sessions);
      expect(sorted.map((s) => s.restSessionId)).toEqual([low, high]);
    });
  });

  describe('N — shuffled D1 input determinism', () => {
    it('identical scientific output regardless of input order', () => {
      const items = [
        buildProfileTestInventoryItem({
          restSessionId: 's3',
          anchorAt: '2026-01-03T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
        buildProfileTestInventoryItem({
          restSessionId: 's2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['NO_CANONICAL_ROW'],
          includePayload: false,
        }),
      ];
      const ordered = assemble([items[1], items[2], items[0]]);
      const shuffled = assemble([items[0], items[2], items[1]]);
      expect(ordered.status).toBe('OK');
      expect(shuffled.status).toBe('OK');
      if (ordered.status !== 'OK' || shuffled.status !== 'OK') return;
      const stripEnvelope = (p: typeof ordered.profile) => {
        const { window, ...rest } = p;
        const { profileGeneratedAt: _g, ...windowRest } = window;
        return { ...rest, window: windowRest };
      };
      expect(stripEnvelope(ordered.profile)).toEqual(stripEnvelope(shuffled.profile));
    });
  });

  describe('O — profileGeneratedAt explicit envelope', () => {
    it('changing generatedAt does not change stable evidence', () => {
      const inventory = buildProfileTestInventory([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      const a = assembleLongitudinalProfileV1({
        inventory,
        profileGeneratedAt: '2026-01-01T00:00:00.000Z',
      });
      const b = assembleLongitudinalProfileV1({
        inventory,
        profileGeneratedAt: '2026-12-31T23:59:59.999Z',
      });
      expect(a.status).toBe('OK');
      expect(b.status).toBe('OK');
      if (a.status !== 'OK' || b.status !== 'OK') return;
      expect(a.profile.window.profileGeneratedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(b.profile.window.profileGeneratedAt).toBe('2026-12-31T23:59:59.999Z');
      expect(a.profile.observations).toEqual(b.profile.observations);
      expect(a.profile.versionSegments).toEqual(b.profile.versionSegments);
      expect(a.profile.profileStatus).toEqual(b.profile.profileStatus);
    });
  });

  describe('P — limit = 100', () => {
    it('does not infer TRUNCATED or PARTIAL_COVERAGE flags', () => {
      const sessions = Array.from({ length: 100 }, (_, i) =>
        buildProfileTestInventoryItem({
          restSessionId: `s-${String(i).padStart(3, '0')}`,
          anchorAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
          inclusionMode: 'DEFAULT',
        }),
      );
      const out = assemble(sessions, {
        requestedSessionLimit: 100,
        appliedSessionLimit: 100,
      });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.coverage.candidateRestSessionCount).toBe(100);
      expect(out.profile.profileFlags).not.toContain('PARTIAL_COVERAGE' as never);
      expect(out.profile.profileFlags).not.toContain('TRUNCATED_OLDER_SESSIONS' as never);
    });
  });

  describe('Q — no scientific threshold', () => {
    it('one session OK; INSUFFICIENT_SESSIONS not in profileStatus union', () => {
      const out = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.profileStatus).toBe('OK');
      expect(['OK', 'NO_ELIGIBLE_SESSIONS']).toContain(out.profile.profileStatus);
    });
  });

  describe('R — no derived trend', () => {
    it('derived null', () => {
      const out = assemble([
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
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.profile.derived).toBeNull();
    });
  });

  describe('S — contract rejection', () => {
    it('wrong D1 contract version', () => {
      const inventory = buildProfileTestInventory([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      inventory.longitudinalInputContractVersion = 'WRONG' as typeof inventory.longitudinalInputContractVersion;
      const out = assembleLongitudinalProfileV1({
        inventory,
        profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
      });
      expect(out).toEqual({ status: 'REJECTED', reason: 'UNSUPPORTED_D1_CONTRACT' });
    });

    it('identity mismatch on session', () => {
      const item = buildProfileTestInventoryItem({
        restSessionId: 's1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      });
      item.organizationId = 'other-org';
      const out = assemble([item]);
      expect(out).toEqual({ status: 'REJECTED', reason: 'IDENTITY_MISMATCH' });
    });

    it('duplicate restSessionId', () => {
      const item = buildProfileTestInventoryItem({
        restSessionId: 'dup',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      });
      const out = assemble([item, { ...item }]);
      expect(out).toEqual({ status: 'REJECTED', reason: 'DUPLICATE_REST_SESSION' });
    });

    it('impossible DEFAULT without canonical', () => {
      const out = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          includePayload: false,
        }),
      ]);
      expect(out).toEqual({ status: 'REJECTED', reason: 'INCONSISTENT_DEFAULT_ITEM' });
    });

    it('impossible DEFAULT unresolved input contract', () => {
      const out = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: versionTuple({
            inputContractVersion: null,
            inputContractResolution: 'UNRESOLVED',
          }),
        }),
      ]);
      expect(out).toEqual({ status: 'REJECTED', reason: 'INCONSISTENT_DEFAULT_ITEM' });
    });
  });

  describe('T — determinism golden vector', () => {
    it('fixed fixture deep equality', () => {
      const inventory = buildProfileTestInventory([
        buildProfileTestInventoryItem({
          restSessionId: 'golden-default',
          anchorAt: '2026-06-15T08:00:00.000Z',
          inclusionMode: 'DEFAULT',
          version: versionTuple({ featureModelVersion: 'fm-golden' }),
        }),
        buildProfileTestInventoryItem({
          restSessionId: 'golden-prov',
          anchorAt: '2026-06-16T08:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
      ]);
      const generatedAt = '2026-09-24T12:00:00.000Z';
      const first = assembleLongitudinalProfileV1({ inventory, profileGeneratedAt: generatedAt });
      const second = assembleLongitudinalProfileV1({ inventory, profileGeneratedAt: generatedAt });
      expect(first).toEqual(second);
      expect(first.status).toBe('OK');
      if (first.status !== 'OK') return;
      expect(first.profile.longitudinalProfileContractVersion).toBe(
        REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
      );
      expect(first.profile.profilePolicyVersion).toBe(
        REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
      );
      expect(first.profile.organizationId).toBe(PROFILE_TEST_ORG);
      expect(first.profile.vehicleId).toBe(PROFILE_TEST_VEHICLE);
      expect(first.profile.window.profileGeneratedAt).toBe(generatedAt);
    });
  });

  describe('contract identity', () => {
    it('accepts exact D1 contract constant', () => {
      const inventory = buildProfileTestInventory([]);
      expect(inventory.longitudinalInputContractVersion).toBe(
        REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION,
      );
      const out = assembleLongitudinalProfileV1({
        inventory,
        profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
      });
      expect(out.status).toBe('OK');
    });
  });
});
