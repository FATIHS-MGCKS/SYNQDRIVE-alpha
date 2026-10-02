import { LongitudinalSourceEvidenceAckRepository } from './longitudinal-source-evidence-ack.repository';
import {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';

describe('LongitudinalSourceEvidenceAckRepository', () => {
  const baseLookup = {
    organizationId: 'org',
    vehicleId: 'veh',
    sourceEvidenceFingerprint: 'a'.repeat(64),
    longitudinalProfileContractVersion: REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
    profilePolicyVersion: REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
  };

  it('acknowledgeSourceEvidence — idempotent on duplicate target-version fingerprint', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing' });
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'new' }])
      .mockResolvedValueOnce([]);
    const repo = new LongitudinalSourceEvidenceAckRepository({
      batteryLongitudinalSourceEvidenceAck: { findFirst, findMany: jest.fn() },
      $queryRaw: queryRaw,
    } as never);

    const input = {
      ...baseLookup,
      canonicalProfileFingerprint: 'b'.repeat(64),
      revisionId: 'rev-1',
      materializationOutcome: 'EXISTING' as const,
    };

    expect(await repo.acknowledgeSourceEvidence(input)).toBe('CREATED');
    expect(await repo.acknowledgeSourceEvidence(input)).toBe('EXISTING');
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('isSourceEvidenceAcknowledged — V1 ack does not satisfy V2 profile policy lookup', async () => {
    const findFirst = jest.fn().mockResolvedValueOnce({ id: 'v1-ack' }).mockResolvedValueOnce(null);
    const repo = new LongitudinalSourceEvidenceAckRepository({
      batteryLongitudinalSourceEvidenceAck: { findFirst, findMany: jest.fn() },
      $queryRaw: jest.fn(),
    } as never);

    expect(
      await repo.isSourceEvidenceAcknowledged({
        ...baseLookup,
        profilePolicyVersion: REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
      }),
    ).toBe(true);

    expect(
      await repo.isSourceEvidenceAcknowledged({
        ...baseLookup,
        profilePolicyVersion: 'M3_3D_PROFILE_POLICY_V2_TEST_ONLY',
      }),
    ).toBe(false);

    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        organizationId: 'org',
        vehicleId: 'veh',
        sourceEvidenceFingerprint: baseLookup.sourceEvidenceFingerprint,
        longitudinalProfileContractVersion: REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
        profilePolicyVersion: 'M3_3D_PROFILE_POLICY_V2_TEST_ONLY',
      },
      select: { id: true },
    });
  });
});
