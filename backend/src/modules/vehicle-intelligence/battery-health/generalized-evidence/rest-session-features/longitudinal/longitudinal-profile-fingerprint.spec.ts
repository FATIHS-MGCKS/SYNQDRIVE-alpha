import {
  FEATURE_INPUT_CANONICAL_KEY_ORDER_SHA256_LITERAL,
  FeatureInputNonFiniteError,
  sha256HexLowercaseUtf8,
} from '../feature-input-canonical.serializer';
import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import {
  computeLongitudinalScientificProfileFingerprintV1,
  LONGITUDINAL_PROFILE_D3_GOLDEN_FINGERPRINT_LITERAL,
  assertValidProfileFingerprintHex,
} from './longitudinal-profile-fingerprint';
import { buildLongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import {
  buildLongitudinalScientificProfileProjectionV1,
  scientificProjectionOmitsProfileGeneratedAt,
} from './longitudinal-profile-scientific-projection';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
  PROFILE_TEST_ORG,
  PROFILE_TEST_VEHICLE,
} from './longitudinal-profile.test-fixtures';

const assemble = (
  sessions: Parameters<typeof buildProfileTestInventory>[0],
  window?: Parameters<typeof buildProfileTestInventory>[1],
  profileGeneratedAt = PROFILE_TEST_GENERATED_AT,
) => {
  const out = assembleLongitudinalProfileV1({
    inventory: buildProfileTestInventory(sessions, window),
    profileGeneratedAt,
  });
  if (out.status !== 'OK') throw new Error(out.reason);
  return out.profile;
};

describe('longitudinal-profile D3 scientific projection + fingerprint', () => {
  describe('A — profileGeneratedAt omitted from fingerprint', () => {
    it('same science, different envelope → equal fingerprint', () => {
      const sessions = [
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ];
      const p1 = assemble(sessions, undefined, '2026-01-01T00:00:00.000Z');
      const p2 = assemble(sessions, undefined, '2026-12-31T23:59:59.999Z');
      const f1 = computeLongitudinalScientificProfileFingerprintV1(p1);
      const f2 = computeLongitudinalScientificProfileFingerprintV1(p2);
      expect(f1.canonicalProfileFingerprint).toBe(f2.canonicalProfileFingerprint);
      expect(f1.canonicalScientificUtf8).toBe(f2.canonicalScientificUtf8);
    });
  });

  describe('B — property absent', () => {
    it('profileGeneratedAt not in projection window', () => {
      const profile = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      const projection = buildLongitudinalScientificProfileProjectionV1(profile);
      expect(scientificProjectionOmitsProfileGeneratedAt(projection)).toBe(true);
      expect(JSON.stringify(projection.window)).not.toContain('profileGeneratedAt');
    });
  });

  describe('C — DEFAULT change', () => {
    it('different DEFAULT observation → different fingerprint', () => {
      const base = [
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ];
      const changed = [
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ];
      changed[0].features!.medianRestVoltageMv = 99999;
      const fBase = computeLongitudinalScientificProfileFingerprintV1(assemble(base));
      const fChanged = computeLongitudinalScientificProfileFingerprintV1(assemble(changed));
      expect(fBase.canonicalProfileFingerprint).not.toBe(fChanged.canonicalProfileFingerprint);
    });
  });

  describe('D — PROVISIONAL change', () => {
    it('same DEFAULT + provisional delta → different fingerprint', () => {
      const onlyDefault = [
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ];
      const withProv = [
        ...onlyDefault,
        buildProfileTestInventoryItem({
          restSessionId: 's2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          inclusionMode: 'PROVISIONAL',
        }),
      ];
      const f1 = computeLongitudinalScientificProfileFingerprintV1(assemble(onlyDefault));
      const f2 = computeLongitudinalScientificProfileFingerprintV1(assemble(withProv));
      expect(f1.canonicalProfileFingerprint).not.toBe(f2.canonicalProfileFingerprint);
    });
  });

  describe('E — EXCLUDED change', () => {
    it('same DEFAULT + excluded audit change → different fingerprint', () => {
      const base = [
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ];
      const withExcluded = [
        ...base,
        buildProfileTestInventoryItem({
          restSessionId: 'x1',
          anchorAt: '2026-01-03T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['NO_CANONICAL_ROW'],
          includePayload: false,
        }),
      ];
      const withExcluded2 = [
        ...base,
        buildProfileTestInventoryItem({
          restSessionId: 'x2',
          anchorAt: '2026-01-03T10:00:00.000Z',
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['SESSION_INVALIDATED'],
          includePayload: false,
        }),
      ];
      const f1 = computeLongitudinalScientificProfileFingerprintV1(assemble(withExcluded));
      const f2 = computeLongitudinalScientificProfileFingerprintV1(assemble(withExcluded2));
      expect(f1.canonicalProfileFingerprint).not.toBe(f2.canonicalProfileFingerprint);
    });
  });

  describe('F — window limit change', () => {
    it('same observations, different applied limit → different fingerprint', () => {
      const sessions = [
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ];
      const f1 = computeLongitudinalScientificProfileFingerprintV1(
        assemble(sessions, { requestedSessionLimit: 10, appliedSessionLimit: 10 }),
      );
      const f2 = computeLongitudinalScientificProfileFingerprintV1(
        assemble(sessions, { requestedSessionLimit: 5, appliedSessionLimit: 5 }),
      );
      expect(f1.canonicalProfileFingerprint).not.toBe(f2.canonicalProfileFingerprint);
    });
  });

  describe('G — policy version in projection', () => {
    it('uses profile policy constant in fingerprint namespace', () => {
      const profile = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      expect(profile.profilePolicyVersion).toBe(REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION);
      const fp = computeLongitudinalScientificProfileFingerprintV1(profile);
      expect(fp.scientificProjection.profilePolicyVersion).toBe(
        REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
      );
    });
  });

  describe('H — contract version', () => {
    it('includes longitudinal contract version in projection', () => {
      const profile = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      expect(profile.longitudinalProfileContractVersion).toBe(
        REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
      );
      const fp = computeLongitudinalScientificProfileFingerprintV1(profile);
      expect(fp.scientificProjection.longitudinalProfileContractVersion).toBe(
        REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
      );
    });
  });

  describe('I — determinism', () => {
    it('key order in object does not change fingerprint', () => {
      const profile = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      const reordered = { ...profile, vehicleId: profile.vehicleId, organizationId: profile.organizationId };
      const f1 = computeLongitudinalScientificProfileFingerprintV1(profile);
      const f2 = computeLongitudinalScientificProfileFingerprintV1(reordered);
      expect(f1.canonicalProfileFingerprint).toBe(f2.canonicalProfileFingerprint);
    });
  });

  describe('J — fingerprint format', () => {
    it('64 lowercase hex', () => {
      const fp = computeLongitudinalScientificProfileFingerprintV1(
        assemble([
          buildProfileTestInventoryItem({
            restSessionId: 's1',
            anchorAt: '2026-01-01T10:00:00.000Z',
            inclusionMode: 'DEFAULT',
          }),
        ]),
      );
      expect(fp.canonicalProfileFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(() => assertValidProfileFingerprintHex(fp.canonicalProfileFingerprint)).not.toThrow();
    });
  });

  describe('K — non-finite fail closed', () => {
    it('rejects NaN in projection', () => {
      const profile = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      const broken = structuredClone(profile);
      broken.observations[0].features.restVoltageVarianceMv2 = Number.NaN;
      expect(() => computeLongitudinalScientificProfileFingerprintV1(broken)).toThrow(
        FeatureInputNonFiniteError,
      );
    });
  });

  describe('L — original profile immutable', () => {
    it('projection does not mutate D2 profile window', () => {
      const profile = assemble([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      const before = profile.window.profileGeneratedAt;
      buildLongitudinalScientificProfileProjectionV1(profile);
      expect(profile.window.profileGeneratedAt).toBe(before);
    });
  });

  describe('M — C3 golden vector unchanged', () => {
    it('FEATURE_INPUT_CANONICAL_KEY_ORDER_SHA256_LITERAL', () => {
      expect(FEATURE_INPUT_CANONICAL_KEY_ORDER_SHA256_LITERAL).toBe(
        'e7b6e05a14a7bece2b8568b716d7dfc2ff360507b7a9f308c5771f648fd8dff3',
      );
      expect(
        sha256HexLowercaseUtf8(
          '{"10":1,"2":2,"A":3,"a":4,"z":6,"ä":5,"Ω":7}',
        ),
      ).toBe(FEATURE_INPUT_CANONICAL_KEY_ORDER_SHA256_LITERAL);
    });
  });

  describe('N — full D2 golden fingerprint', () => {
    it('frozen literal for two-DEFAULT fixture', () => {
      const profile = assemble([
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
      const fp = computeLongitudinalScientificProfileFingerprintV1(profile);
      expect(fp.canonicalProfileFingerprint).toBe(LONGITUDINAL_PROFILE_D3_GOLDEN_FINGERPRINT_LITERAL);
    });
  });

  describe('metadata mapper mirrors profile', () => {
    it('derived counts match profile coverage', () => {
      const profile = assemble([
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
      const fp = computeLongitudinalScientificProfileFingerprintV1(profile);
      const row = buildLongitudinalProfileMaterializationPersistenceInput(fp);
      expect(row.includedSessionCount).toBe(profile.coverage.includedSessionCount);
      expect(row.organizationId).toBe(PROFILE_TEST_ORG);
      expect(row.vehicleId).toBe(PROFILE_TEST_VEHICLE);
      expect(row.profileStatus).toBe(profile.profileStatus);
    });
  });
});
