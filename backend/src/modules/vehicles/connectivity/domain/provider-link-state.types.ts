/**
 * Canonical provider link vocabulary — authorization/consent/mapping truth,
 * separate from telemetry freshness.
 */
import type { ProviderLinkState } from './connectivity-domain.types';

/** Machine-readable provider-link reason codes exposed via API. */
export const ProviderLinkReasonCode = {
  CONSENT_MISSING: 'CONSENT_MISSING',
  AUTHORIZATION_EXPIRED: 'AUTHORIZATION_EXPIRED',
  TOKEN_MISSING: 'TOKEN_MISSING',
  PROVIDER_REVOKED: 'PROVIDER_REVOKED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  LINK_ACTIVE: 'LINK_ACTIVE',
  NO_ACTIVE_PROVIDER_LINK: 'NO_ACTIVE_PROVIDER_LINK',
} as const;
export type ProviderLinkReasonCode =
  (typeof ProviderLinkReasonCode)[keyof typeof ProviderLinkReasonCode];

export const ConsentLedgerStatus = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
  MISSING: 'MISSING',
  PENDING: 'PENDING',
  UNKNOWN: 'UNKNOWN',
} as const;
export type ConsentLedgerStatus =
  (typeof ConsentLedgerStatus)[keyof typeof ConsentLedgerStatus];

export const ProviderAuthorizationLedgerStatus = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  MISSING: 'MISSING',
  UNKNOWN: 'UNKNOWN',
} as const;
export type ProviderAuthorizationLedgerStatus =
  (typeof ProviderAuthorizationLedgerStatus)[keyof typeof ProviderAuthorizationLedgerStatus];

export interface ProviderMappingEvidence {
  hasActiveMapping: boolean;
  activeMappingCount: number;
  provider: string | null;
  /** When set, must match vehicle organizationId or link is rejected. */
  mappingOrganizationId: string | null;
}

export interface ProviderAuthorizationEvidence {
  status: ProviderAuthorizationLedgerStatus;
  expiresAt: string | null;
}

export interface ProviderConsentEvidence {
  status: ConsentLedgerStatus;
  grantedAt: string | null;
  expiresAt: string | null;
}

export interface ProviderTokenBindingEvidence {
  hasToken: boolean;
  tokenId: number | null;
  bindingId: string | null;
  /** Historical DimoVehicle row exists — never sufficient alone for ACTIVE. */
  hasHistoricalDimoRecord: boolean;
}

export interface ProviderRevocationEvidence {
  isRevoked: boolean;
  revokedAt: string | null;
}

export interface ProviderExpiryEvidence {
  isExpired: boolean;
  expiresAt: string | null;
}

export interface ProviderErrorEvidence {
  hasError: boolean;
  connectionStatus: string | null;
}

export interface ProviderLastAccessEvidence {
  lastSuccessfulAt: string | null;
}

/**
 * Evidence bundle for {@link ProviderLinkStateBuilder}.
 * Source-of-truth priority (highest first) is documented on the builder.
 */
export interface ProviderLinkEvidenceInput {
  organizationId: string;
  vehicleId: string;
  nowMs?: number;
  mapping: ProviderMappingEvidence;
  authorization: ProviderAuthorizationEvidence;
  consent: ProviderConsentEvidence;
  tokenBinding: ProviderTokenBindingEvidence;
  revocation: ProviderRevocationEvidence;
  expiry: ProviderExpiryEvidence;
  providerError: ProviderErrorEvidence;
  lastAccess: ProviderLastAccessEvidence;
}

export interface ProviderLinkStateResult {
  state: ProviderLinkState;
  hasProviderLink: boolean;
  reasonCodes: ProviderLinkReasonCode[];
  /** True when only a historical provider identity exists without an active grant chain. */
  isHistoricalIdentityOnly: boolean;
  providerConnectionStatus: string | null;
}
