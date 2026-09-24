import type { BatteryLongitudinalProfileRevision } from '@prisma/client';
import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { computeLongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';
import { buildLongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
  PROFILE_TEST_ORG,
  PROFILE_TEST_VEHICLE,
} from './longitudinal-profile.test-fixtures';
import { evaluateMaterializedRevisionSelfIntegrity } from './longitudinal-integrity-inspection.self-integrity';

function revisionFromProfile(): BatteryLongitudinalProfileRevision {
  const assembled = assembleLongitudinalProfileV1({
    inventory: buildProfileTestInventory([
      buildProfileTestInventoryItem({
        restSessionId: 's1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
    ]),
    profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
  });
  if (assembled.status !== 'OK') throw new Error(assembled.reason);
  const fingerprint = computeLongitudinalScientificProfileFingerprintV1(assembled.profile);
  const persistence = buildLongitudinalProfileMaterializationPersistenceInput(fingerprint);
  return {
    id: 'rev-1',
    organizationId: PROFILE_TEST_ORG,
    vehicleId: PROFILE_TEST_VEHICLE,
    longitudinalProfileContractVersion: persistence.longitudinalProfileContractVersion,
    profilePolicyVersion: persistence.profilePolicyVersion,
    canonicalProfileFingerprint: persistence.canonicalProfileFingerprint,
    scientificProfileJson: persistence.scientificProfileJson,
    requestedSessionLimit: persistence.requestedSessionLimit,
    appliedSessionLimit: persistence.appliedSessionLimit,
    candidateRestSessionCount: persistence.candidateRestSessionCount,
    includedSessionCount: persistence.includedSessionCount,
    provisionalSessionCount: persistence.provisionalSessionCount,
    excludedSessionCount: persistence.excludedSessionCount,
    firstIncludedAnchorAt: persistence.firstIncludedAnchorAt,
    lastIncludedAnchorAt: persistence.lastIncludedAnchorAt,
    profileStatus: persistence.profileStatus,
    createdAt: new Date('2026-09-24T12:00:00.000Z'),
    updatedAt: new Date('2026-09-24T12:00:00.000Z'),
    materializedAt: new Date('2026-09-24T12:00:00.000Z'),
  } as unknown as BatteryLongitudinalProfileRevision;
}

describe('evaluateMaterializedRevisionSelfIntegrity (D4)', () => {
  it('passes coherent revision row', () => {
    const outcome = evaluateMaterializedRevisionSelfIntegrity(revisionFromProfile());
    expect(outcome.status).toBe('OK');
  });

  it('fails fingerprint mismatch', () => {
    const revision = revisionFromProfile();
    revision.canonicalProfileFingerprint = 'a'.repeat(64);
    const outcome = evaluateMaterializedRevisionSelfIntegrity(revision);
    expect(outcome.status).toBe('SELF_INTEGRITY_FAILED');
    if (outcome.status === 'SELF_INTEGRITY_FAILED') {
      expect(outcome.reasons).toContain('PROFILE_FINGERPRINT_MISMATCH');
    }
  });

  it('fails mirror drift', () => {
    const revision = revisionFromProfile();
    revision.includedSessionCount = 999;
    const outcome = evaluateMaterializedRevisionSelfIntegrity(revision);
    expect(outcome.status).toBe('SELF_INTEGRITY_FAILED');
    if (outcome.status === 'SELF_INTEGRITY_FAILED') {
      expect(outcome.reasons).toContain('PROFILE_METADATA_MIRROR_MISMATCH');
    }
  });
});
