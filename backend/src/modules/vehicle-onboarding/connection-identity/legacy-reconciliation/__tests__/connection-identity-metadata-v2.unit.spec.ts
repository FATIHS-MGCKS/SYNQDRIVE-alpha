import {
  buildLegacyReconciliationConnectionIdentityV2,
  isOnboardingActivationConnectionIdentity,
  parseConnectionIdentityFromLinkMetadata,
  VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION,
} from '../connection-identity-metadata-v2';
import { VehicleConnectionModality } from '../../vehicle-connection-identity.contract';
import { VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION } from '../../source-link-connection-identity.metadata';

describe('connection identity metadata v2', () => {
  it('discriminates legacy reconciliation from onboarding v1', () => {
    const legacy = buildLegacyReconciliationConnectionIdentityV2({
      link: { id: 'link-1' },
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      dimo: { id: 'dimo-1', externalId: '186946', tokenId: 186946, rawJson: { syntheticDevice: { id: 'x' } } },
      verifiedModality: VehicleConnectionModality.SOFTWARE_INTEGRATION,
      modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
      physicalDeviceReference: 'NOT_APPLICABLE',
      verificationEvidence: ['DIMO_RAW_JSON:API_SYNTHETIC'],
      verifiedAt: new Date('2026-10-13T12:00:00.000Z'),
      reconciliationProvenance: {
        runId: 'run',
        authorizationReference: 'auth',
        evidenceCheckedAt: '2026-10-13T12:00:00.000Z',
      },
    });
    expect(legacy.preActivationProviderSourceRefId).toBeNull();
    expect(isOnboardingActivationConnectionIdentity(legacy)).toBe(false);

    const v1 = {
      version: VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION,
      preActivationProviderSourceRefId: 'ref-1',
    } as const;
    expect(isOnboardingActivationConnectionIdentity(v1 as never)).toBe(true);

    const parsed = parseConnectionIdentityFromLinkMetadata({ connectionIdentity: legacy });
    expect(parsed?.kind).toBe('v2');
    expect(parsed?.record.version).toBe(VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION);
  });
});
