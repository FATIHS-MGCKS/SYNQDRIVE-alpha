import { InvalidProfileFingerprintError } from './longitudinal-profile-materialization.errors';
import { buildLongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';
import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { computeLongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
} from './longitudinal-profile.test-fixtures';

function validPersistenceInput() {
  const assembled = assembleLongitudinalProfileV1({
    inventory: buildProfileTestInventory([
      buildProfileTestInventoryItem({
        restSessionId: 's1',
        anchorAt: '2026-04-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
    ]),
    profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
  });
  if (assembled.status !== 'OK') throw new Error(assembled.reason);
  const fingerprint = computeLongitudinalScientificProfileFingerprintV1(assembled.profile);
  return {
    input: buildLongitudinalProfileMaterializationPersistenceInput(fingerprint),
    utf8: fingerprint.canonicalScientificUtf8,
  };
}

describe('LongitudinalProfileMaterializationRepository', () => {
  it('rejects malformed fingerprint before opening a transaction', async () => {
    const { input, utf8 } = validPersistenceInput();
    const transaction = jest.fn();
    const repo = new LongitudinalProfileMaterializationRepository({
      $transaction: transaction,
      batteryLongitudinalProfileRevision: {} as never,
    });

    await expect(
      repo.insertIdempotent(
        { ...input, canonicalProfileFingerprint: 'NOT_VALID_HEX' },
        utf8,
      ),
    ).rejects.toBeInstanceOf(InvalidProfileFingerprintError);

    expect(transaction).not.toHaveBeenCalled();
  });
});
