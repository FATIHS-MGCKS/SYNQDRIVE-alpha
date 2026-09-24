import {
  InvalidProfileFingerprintError,
  ProfileFingerprintPayloadMismatchError,
} from './longitudinal-profile-materialization.errors';
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
  return buildLongitudinalProfileMaterializationPersistenceInput(fingerprint);
}

function mockRepo() {
  const transaction = jest.fn();
  const repo = new LongitudinalProfileMaterializationRepository({
    $transaction: transaction,
    batteryLongitudinalProfileRevision: {} as never,
  });
  return { repo, transaction };
}

describe('LongitudinalProfileMaterializationRepository', () => {
  it('A — rejects malformed fingerprint before opening a transaction', async () => {
    const input = validPersistenceInput();
    const { repo, transaction } = mockRepo();

    await expect(
      repo.insertIdempotent({ ...input, canonicalProfileFingerprint: 'NOT_VALID_HEX' }),
    ).rejects.toBeInstanceOf(InvalidProfileFingerprintError);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('B — valid 64-hex fingerprint wrong for payload → PROFILE_FINGERPRINT_PAYLOAD_MISMATCH', async () => {
    const input = validPersistenceInput();
    const { repo, transaction } = mockRepo();

    await expect(
      repo.insertIdempotent({
        ...input,
        canonicalProfileFingerprint: 'b'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(ProfileFingerprintPayloadMismatchError);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('C — payload mutated after fingerprint → PROFILE_FINGERPRINT_PAYLOAD_MISMATCH', async () => {
    const input = validPersistenceInput();
    const mutatedJson = {
      ...(input.scientificProfileJson as Record<string, unknown>),
      profileStatus: 'MUTATED_AFTER_FINGERPRINT',
    };
    const { repo, transaction } = mockRepo();

    await expect(
      repo.insertIdempotent({
        ...input,
        scientificProfileJson: mutatedJson,
      }),
    ).rejects.toBeInstanceOf(ProfileFingerprintPayloadMismatchError);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('D — coherent input opens transaction for persistence', async () => {
    const input = validPersistenceInput();
    const { repo, transaction } = mockRepo();
    transaction.mockResolvedValue({
      persistenceOutcome: 'CREATED',
      revision: { id: 'rev-1' },
    });

    await repo.insertIdempotent(input);

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
