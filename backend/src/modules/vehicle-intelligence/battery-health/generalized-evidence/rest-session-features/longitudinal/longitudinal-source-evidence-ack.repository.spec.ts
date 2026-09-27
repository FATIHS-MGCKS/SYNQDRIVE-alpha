import { LongitudinalSourceEvidenceAckRepository } from './longitudinal-source-evidence-ack.repository';

describe('LongitudinalSourceEvidenceAckRepository', () => {
  it('acknowledgeSourceEvidence — idempotent on duplicate fingerprint', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing' });
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'new' }])
      .mockResolvedValueOnce([]);
    const repo = new LongitudinalSourceEvidenceAckRepository({
      batteryLongitudinalSourceEvidenceAck: { findFirst },
      $queryRaw: queryRaw,
    } as never);

    const input = {
      organizationId: 'org',
      vehicleId: 'veh',
      sourceEvidenceFingerprint: 'a'.repeat(64),
      longitudinalProfileContractVersion: 'M3_3D_LONGITUDINAL_PROFILE_V1',
      profilePolicyVersion: 'M3_3D_PROFILE_POLICY_V1',
      canonicalProfileFingerprint: 'b'.repeat(64),
      revisionId: 'rev-1',
      materializationOutcome: 'EXISTING' as const,
    };

    expect(await repo.acknowledgeSourceEvidence(input)).toBe('CREATED');
    expect(await repo.acknowledgeSourceEvidence(input)).toBe('EXISTING');
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
