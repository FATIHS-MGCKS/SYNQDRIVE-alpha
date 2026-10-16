import { buildP5b1CorrelationEvidenceFingerprint } from './vsi-apds-p5b1-evidence-fingerprint';
import { resolveOfflineCorrelationSourceLink } from './vsi-apds-p5b1-link-attribution';
import { VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION } from './vsi-apds-p5b1.contract';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';

describe('vsi-apds-p5b1 offline replay', () => {
  it('B2 and B4 remain distinct policy identities', () => {
    const b2 = {
      organizationId: 'org',
      vehicleId: 'veh',
      opportunityId: 'opp-1',
      policyVersion: P25_APD_B2_V1,
      decisionAt: '2026-10-16T06:00:00.000Z',
      activationEpochId: null,
      shadowExecutionVersion: 'v2',
    };
    const b4 = { ...b2, policyVersion: P25_APD_B4_V1 };
    expect(JSON.stringify(b2)).not.toEqual(JSON.stringify(b4));
  });

  it('single historical link attribution', () => {
    const r = resolveOfflineCorrelationSourceLink({
      historical: {
        historicalActiveLinkCount: 1,
        historicalActiveLinkIds: ['link-a'],
        evidenceComplete: true,
        reasons: [],
      },
    });
    expect(r.status).toBe('UNIQUE_ATTRIBUTED');
    expect(r.providerSourceLinkId).toBe('link-a');
  });

  it('multi-link ambiguity blocks attribution', () => {
    const r = resolveOfflineCorrelationSourceLink({
      historical: {
        historicalActiveLinkCount: 2,
        historicalActiveLinkIds: ['a', 'b'],
        evidenceComplete: true,
        reasons: [],
      },
    });
    expect(r.status).toBe('AMBIGUOUS');
    expect(r.providerSourceLinkId).toBeNull();
  });

  it('fingerprint stable for identical correlation rows', () => {
    const row = {
      contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
      decisionIdentity: {
        organizationId: 'org',
        vehicleId: 'veh',
        opportunityId: 'opp',
        policyVersion: P25_APD_B4_V1,
        decisionAt: '2026-10-16T06:00:00.000Z',
        activationEpochId: null,
        shadowExecutionVersion: null,
      },
      originalApdsDecision: 'HOLD',
      originalApdsReason: 'test',
      sourceLinkAttribution: {
        status: 'UNIQUE_ATTRIBUTED' as const,
        providerSourceLinkId: 'link',
        historicalActiveLinkCountAtDecision: 1,
        reasons: [],
      },
      observation: null,
      correlation: null,
      investigationHints: [],
      skippedReason: null,
    };
    expect(buildP5b1CorrelationEvidenceFingerprint(row)).toEqual(
      buildP5b1CorrelationEvidenceFingerprint(row),
    );
  });
});
