import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { computeLongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';
import { buildLongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
} from './longitudinal-profile.test-fixtures';

describe('longitudinal-profile-materialization.mapper', () => {
  it('derives all persistence fields from fingerprint.scientificProjection only', () => {
    const inventory = buildProfileTestInventory([
      buildProfileTestInventoryItem({
        restSessionId: 's1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
      buildProfileTestInventoryItem({
        restSessionId: 's2',
        anchorAt: '2026-01-02T10:00:00.000Z',
        inclusionMode: 'PROVISIONAL',
      }),
    ]);
    const assembled = assembleLongitudinalProfileV1({
      inventory,
      profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
    });
    if (assembled.status !== 'OK') throw new Error(assembled.reason);
    const fingerprint = computeLongitudinalScientificProfileFingerprintV1(assembled.profile);
    const row = buildLongitudinalProfileMaterializationPersistenceInput(fingerprint);
    const projection = fingerprint.scientificProjection;

    expect(row.organizationId).toBe(projection.organizationId);
    expect(row.includedSessionCount).toBe(projection.coverage.includedSessionCount);
    expect(row.canonicalProfileFingerprint).toBe(fingerprint.canonicalProfileFingerprint);
    expect(row.scientificProfileJson).toEqual(projection);
  });

  it('cannot combine profile A metadata with fingerprint B projection via public API', () => {
    const invA = buildProfileTestInventory([
      buildProfileTestInventoryItem({
        restSessionId: 'a',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
    ]);
    const invB = buildProfileTestInventory([
      buildProfileTestInventoryItem({
        restSessionId: 'b',
        anchorAt: '2026-02-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
      buildProfileTestInventoryItem({
        restSessionId: 'p1',
        anchorAt: '2026-02-02T10:00:00.000Z',
        inclusionMode: 'PROVISIONAL',
      }),
    ]);
    const profileA = assembleLongitudinalProfileV1({
      inventory: invA,
      profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
    });
    const profileB = assembleLongitudinalProfileV1({
      inventory: invB,
      profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
    });
    if (profileA.status !== 'OK' || profileB.status !== 'OK') throw new Error('assemble failed');
    const fpB = computeLongitudinalScientificProfileFingerprintV1(profileB.profile);
    const rowFromB = buildLongitudinalProfileMaterializationPersistenceInput(fpB);

    expect(rowFromB.includedSessionCount).toBe(fpB.scientificProjection.coverage.includedSessionCount);
    expect(rowFromB.includedSessionCount).toBe(1);
    expect(
      (rowFromB.scientificProfileJson as { observations: { restSessionId: string }[] }).observations[0]
        .restSessionId,
    ).toBe('b');
    expect(
      (rowFromB.scientificProfileJson as { provisionalObservations: unknown[] }).provisionalObservations,
    ).toHaveLength(1);
  });
});
