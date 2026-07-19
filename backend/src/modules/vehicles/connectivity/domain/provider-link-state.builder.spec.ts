import { ProviderLinkState } from './connectivity-domain.types';
import { ProviderLinkStateBuilder } from './provider-link-state.builder';
import {
  ConsentLedgerStatus,
  ProviderAuthorizationLedgerStatus,
  ProviderLinkReasonCode,
  type ProviderLinkEvidenceInput,
} from './provider-link-state.types';

const NOW_MS = new Date('2026-07-18T12:00:00.000Z').getTime();
const ORG = 'org-1';
const VEHICLE = 'veh-1';

function baseEvidence(
  overrides: Partial<ProviderLinkEvidenceInput> = {},
): ProviderLinkEvidenceInput {
  return {
    organizationId: ORG,
    vehicleId: VEHICLE,
    nowMs: NOW_MS,
    mapping: {
      hasActiveMapping: true,
      activeMappingCount: 1,
      provider: 'DIMO',
      mappingOrganizationId: ORG,
    },
    authorization: {
      status: ProviderAuthorizationLedgerStatus.ACTIVE,
      expiresAt: null,
    },
    consent: {
      status: ConsentLedgerStatus.ACTIVE,
      grantedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
    },
    tokenBinding: {
      hasToken: true,
      tokenId: 12345,
      bindingId: 'binding-1',
      hasHistoricalDimoRecord: true,
    },
    revocation: { isRevoked: false, revokedAt: null },
    expiry: { isExpired: false, expiresAt: null },
    providerError: { hasError: false, connectionStatus: 'CONNECTED' },
    lastAccess: { lastSuccessfulAt: '2026-07-18T11:55:00.000Z' },
    ...overrides,
  };
}

describe('ProviderLinkStateBuilder', () => {
  it('fully active — mapping + consent + token + authorization', () => {
    const result = ProviderLinkStateBuilder.build(baseEvidence());
    expect(result.state).toBe(ProviderLinkState.ACTIVE);
    expect(result.hasProviderLink).toBe(true);
    expect(result.reasonCodes).toContain(ProviderLinkReasonCode.LINK_ACTIVE);
    expect(result.isHistoricalIdentityOnly).toBe(false);
  });

  it('mapping without consent → REAUTH_REQUIRED + CONSENT_MISSING', () => {
    const result = ProviderLinkStateBuilder.build(
      baseEvidence({
        consent: {
          status: ConsentLedgerStatus.MISSING,
          grantedAt: null,
          expiresAt: null,
        },
        authorization: {
          status: ProviderAuthorizationLedgerStatus.MISSING,
          expiresAt: null,
        },
      }),
    );
    expect(result.state).toBe(ProviderLinkState.REAUTH_REQUIRED);
    expect(result.reasonCodes).toContain(ProviderLinkReasonCode.CONSENT_MISSING);
  });

  it('consent without token → REAUTH_REQUIRED + TOKEN_MISSING', () => {
    const result = ProviderLinkStateBuilder.build(
      baseEvidence({
        tokenBinding: {
          hasToken: false,
          tokenId: null,
          bindingId: 'binding-1',
          hasHistoricalDimoRecord: true,
        },
      }),
    );
    expect(result.state).toBe(ProviderLinkState.REAUTH_REQUIRED);
    expect(result.reasonCodes).toContain(ProviderLinkReasonCode.TOKEN_MISSING);
  });

  it('expired authorization → REAUTH_REQUIRED + AUTHORIZATION_EXPIRED', () => {
    const result = ProviderLinkStateBuilder.build(
      baseEvidence({
        authorization: {
          status: ProviderAuthorizationLedgerStatus.EXPIRED,
          expiresAt: '2026-06-01T00:00:00.000Z',
        },
        expiry: {
          isExpired: true,
          expiresAt: '2026-06-01T00:00:00.000Z',
        },
      }),
    );
    expect(result.state).toBe(ProviderLinkState.REAUTH_REQUIRED);
    expect(result.reasonCodes).toContain(
      ProviderLinkReasonCode.AUTHORIZATION_EXPIRED,
    );
  });

  it('revoked consent → REVOKED + PROVIDER_REVOKED', () => {
    const result = ProviderLinkStateBuilder.build(
      baseEvidence({
        consent: {
          status: ConsentLedgerStatus.REVOKED,
          grantedAt: '2026-01-01T00:00:00.000Z',
          expiresAt: null,
        },
        revocation: { isRevoked: true, revokedAt: '2026-07-01T00:00:00.000Z' },
      }),
    );
    expect(result.state).toBe(ProviderLinkState.REVOKED);
    expect(result.reasonCodes).toContain(ProviderLinkReasonCode.PROVIDER_REVOKED);
  });

  it('provider error → ERROR + PROVIDER_ERROR', () => {
    const result = ProviderLinkStateBuilder.build(
      baseEvidence({
        providerError: { hasError: true, connectionStatus: 'ERROR' },
      }),
    );
    expect(result.state).toBe(ProviderLinkState.ERROR);
    expect(result.reasonCodes).toContain(ProviderLinkReasonCode.PROVIDER_ERROR);
  });

  it('historical DimoVehicle only — never ACTIVE', () => {
    const result = ProviderLinkStateBuilder.build(
      baseEvidence({
        mapping: {
          hasActiveMapping: false,
          activeMappingCount: 0,
          provider: null,
          mappingOrganizationId: ORG,
        },
        consent: {
          status: ConsentLedgerStatus.MISSING,
          grantedAt: null,
          expiresAt: null,
        },
        authorization: {
          status: ProviderAuthorizationLedgerStatus.MISSING,
          expiresAt: null,
        },
        tokenBinding: {
          hasToken: false,
          tokenId: null,
          bindingId: null,
          hasHistoricalDimoRecord: true,
        },
      }),
    );
    expect(result.state).toBe(ProviderLinkState.UNKNOWN);
    expect(result.isHistoricalIdentityOnly).toBe(true);
    expect(result.state).not.toBe(ProviderLinkState.ACTIVE);
  });

  it('multiple mappings — uses active mapping count without error', () => {
    const result = ProviderLinkStateBuilder.build(
      baseEvidence({
        mapping: {
          hasActiveMapping: true,
          activeMappingCount: 2,
          provider: 'DIMO',
          mappingOrganizationId: ORG,
        },
      }),
    );
    expect(result.state).toBe(ProviderLinkState.ACTIVE);
    expect(result.hasProviderLink).toBe(true);
  });

  it('cross-tenant mapping → ERROR + PROVIDER_ERROR', () => {
    const result = ProviderLinkStateBuilder.build(
      baseEvidence({
        mapping: {
          hasActiveMapping: true,
          activeMappingCount: 1,
          provider: 'DIMO',
          mappingOrganizationId: 'other-org',
        },
      }),
    );
    expect(result.state).toBe(ProviderLinkState.ERROR);
    expect(result.hasProviderLink).toBe(false);
    expect(result.reasonCodes).toContain(ProviderLinkReasonCode.PROVIDER_ERROR);
  });

  it('no mapping and no historical identity → NO_LINK', () => {
    const result = ProviderLinkStateBuilder.build(
      baseEvidence({
        mapping: {
          hasActiveMapping: false,
          activeMappingCount: 0,
          provider: null,
          mappingOrganizationId: ORG,
        },
        tokenBinding: {
          hasToken: false,
          tokenId: null,
          bindingId: null,
          hasHistoricalDimoRecord: false,
        },
      }),
    );
    expect(result.state).toBe(ProviderLinkState.NO_LINK);
    expect(result.reasonCodes).toContain(
      ProviderLinkReasonCode.NO_ACTIVE_PROVIDER_LINK,
    );
  });
});
