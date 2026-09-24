import * as profileAssembler from './longitudinal-profile.assembler';
import { computeLongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';
import { LongitudinalProfileMaterializationService } from './longitudinal-profile-materialization.service';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
  PROFILE_TEST_ORG,
  PROFILE_TEST_VEHICLE,
} from './longitudinal-profile.test-fixtures';
import type { LongitudinalInputReaderService } from './longitudinal-input.reader';
import type { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';

describe('LongitudinalProfileMaterializationService', () => {
  const inventory = buildProfileTestInventory([
    buildProfileTestInventoryItem({
      restSessionId: 's1',
      anchorAt: '2026-04-01T10:00:00.000Z',
      inclusionMode: 'DEFAULT',
    }),
  ]);

  function createService(deps: {
    reader: Pick<LongitudinalInputReaderService, 'readInventory'>;
    repository: Pick<LongitudinalProfileMaterializationRepository, 'insertIdempotent'>;
  }) {
    return new LongitudinalProfileMaterializationService(
      deps.reader as LongitudinalInputReaderService,
      deps.repository as LongitudinalProfileMaterializationRepository,
    );
  }

  it('A — D1_REJECTED does not call repository', async () => {
    const readInventory = jest.fn().mockResolvedValue({
      status: 'REJECTED',
      reason: 'INVALID_SESSION_LIMIT',
    });
    const insertIdempotent = jest.fn();
    const service = createService({
      reader: { readInventory },
      repository: { insertIdempotent },
    });

    const outcome = await service.materialize({
      organizationId: PROFILE_TEST_ORG,
      vehicleId: PROFILE_TEST_VEHICLE,
      sessionLimit: 0,
      profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
    });

    expect(outcome).toEqual({ outcome: 'D1_REJECTED', reason: 'INVALID_SESSION_LIMIT' });
    expect(insertIdempotent).not.toHaveBeenCalled();
  });

  it('B — D2_REJECTED does not call repository', async () => {
    const readInventory = jest.fn().mockResolvedValue({
      status: 'OK',
      result: inventory,
    });
    const insertIdempotent = jest.fn();
    const service = createService({
      reader: { readInventory },
      repository: { insertIdempotent },
    });

    const outcome = await service.materialize({
      organizationId: PROFILE_TEST_ORG,
      vehicleId: PROFILE_TEST_VEHICLE,
      sessionLimit: 10,
      profileGeneratedAt: 'not-an-iso-timestamp',
    });

    expect(outcome.outcome).toBe('D2_REJECTED');
    expect(insertIdempotent).not.toHaveBeenCalled();
  });

  it('C — CREATED orchestrates D1 → D2 → repository', async () => {
    const readInventory = jest.fn().mockResolvedValue({
      status: 'OK',
      result: inventory,
    });
    const assembled = profileAssembler.assembleLongitudinalProfileV1({
      inventory,
      profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
    });
    if (assembled.status !== 'OK') throw new Error(assembled.reason);
    const fingerprint = computeLongitudinalScientificProfileFingerprintV1(assembled.profile);
    const insertIdempotent = jest.fn().mockResolvedValue({
      persistenceOutcome: 'CREATED',
      revision: {
        id: 'rev-1',
        canonicalProfileFingerprint: fingerprint.canonicalProfileFingerprint,
        longitudinalProfileContractVersion:
          assembled.profile.longitudinalProfileContractVersion,
        profilePolicyVersion: assembled.profile.profilePolicyVersion,
      },
    });
    const service = createService({
      reader: { readInventory },
      repository: { insertIdempotent },
    });

    const outcome = await service.materialize({
      organizationId: PROFILE_TEST_ORG,
      vehicleId: PROFILE_TEST_VEHICLE,
      sessionLimit: 10,
      profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
    });

    expect(outcome.outcome).toBe('CREATED');
    expect(insertIdempotent).toHaveBeenCalledTimes(1);
    expect(readInventory).toHaveBeenCalledWith({
      organizationId: PROFILE_TEST_ORG,
      vehicleId: PROFILE_TEST_VEHICLE,
      sessionLimit: 10,
    });
  });

  it('D — EXISTING propagates repository outcome', async () => {
    const readInventory = jest.fn().mockResolvedValue({
      status: 'OK',
      result: inventory,
    });
    const insertIdempotent = jest.fn().mockResolvedValue({
      persistenceOutcome: 'EXISTING',
      revision: {
        id: 'rev-existing',
        canonicalProfileFingerprint: 'a'.repeat(64),
        longitudinalProfileContractVersion: 'M3_3D_LONGITUDINAL_PROFILE_V1',
        profilePolicyVersion: 'M3_3D_PROFILE_POLICY_V1',
      },
    });
    const service = createService({
      reader: { readInventory },
      repository: { insertIdempotent },
    });

    const outcome = await service.materialize({
      organizationId: PROFILE_TEST_ORG,
      vehicleId: PROFILE_TEST_VEHICLE,
      sessionLimit: 10,
      profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
    });

    expect(outcome.outcome).toBe('EXISTING');
    if (outcome.outcome === 'EXISTING') {
      expect(outcome.revisionId).toBe('rev-existing');
    }
  });

  it('E — forwards explicit profileGeneratedAt to D2 assembly', async () => {
    const explicitGeneratedAt = '2026-03-15T08:30:00.000Z';
    const readInventory = jest.fn().mockResolvedValue({
      status: 'OK',
      result: inventory,
    });
    const assembleSpy = jest.spyOn(profileAssembler, 'assembleLongitudinalProfileV1');
    const insertIdempotent = jest.fn().mockResolvedValue({
      persistenceOutcome: 'CREATED',
      revision: {
        id: 'rev-2',
        canonicalProfileFingerprint: 'b'.repeat(64),
        longitudinalProfileContractVersion: 'M3_3D_LONGITUDINAL_PROFILE_V1',
        profilePolicyVersion: 'M3_3D_PROFILE_POLICY_V1',
      },
    });
    const service = createService({
      reader: { readInventory },
      repository: { insertIdempotent },
    });

    await service.materialize({
      organizationId: PROFILE_TEST_ORG,
      vehicleId: PROFILE_TEST_VEHICLE,
      sessionLimit: 10,
      profileGeneratedAt: explicitGeneratedAt,
    });

    expect(assembleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ profileGeneratedAt: explicitGeneratedAt }),
    );
    assembleSpy.mockRestore();
  });
});
