/**
 * Canonical provider link state synthesis from authorization/consent/mapping evidence.
 *
 * Source-of-truth priority (highest wins):
 * 1. Cross-tenant mapping mismatch → ERROR
 * 2. Provider/integration error → ERROR
 * 3. Explicit revocation (consent or authorization) → REVOKED
 * 4. No mapping and no historical identity → NO_LINK
 * 5. Active mapping without token → REAUTH_REQUIRED (TOKEN_MISSING)
 * 6. Authorization expired → REAUTH_REQUIRED
 * 7. Consent missing/expired/pending → REAUTH_REQUIRED
 * 8. Historical DimoVehicle identity only → UNKNOWN (never ACTIVE)
 * 9. Ambiguous authorization → UNKNOWN
 * 10. Full active chain (mapping + consent + token + authorization) → ACTIVE
 *
 * Telemetry recency is intentionally excluded — use telemetry dimension separately.
 */
import { ProviderLinkState } from './connectivity-domain.types';
import {
  ConsentLedgerStatus,
  ProviderAuthorizationLedgerStatus,
  ProviderLinkReasonCode,
  type ProviderLinkEvidenceInput,
  type ProviderLinkStateResult,
} from './provider-link-state.types';

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function hasAnyProviderIdentity(input: ProviderLinkEvidenceInput): boolean {
  return (
    input.mapping.hasActiveMapping ||
    input.tokenBinding.hasHistoricalDimoRecord ||
    input.tokenBinding.hasToken
  );
}

export class ProviderLinkStateBuilder {
  static build(input: ProviderLinkEvidenceInput): ProviderLinkStateResult {
    const reasonCodes: ProviderLinkReasonCode[] = [];
    const connectionStatus = input.providerError.connectionStatus;
    const nowMs = input.nowMs ?? Date.now();

    if (
      input.mapping.mappingOrganizationId != null &&
      input.mapping.mappingOrganizationId !== input.organizationId
    ) {
      reasonCodes.push(ProviderLinkReasonCode.PROVIDER_ERROR);
      return result(
        ProviderLinkState.ERROR,
        false,
        reasonCodes,
        false,
        connectionStatus,
      );
    }

    if (
      input.providerError.hasError ||
      connectionStatus === 'ERROR'
    ) {
      reasonCodes.push(ProviderLinkReasonCode.PROVIDER_ERROR);
      return result(
        ProviderLinkState.ERROR,
        hasAnyProviderIdentity(input),
        reasonCodes,
        false,
        connectionStatus,
      );
    }

    const consentRevoked =
      input.revocation.isRevoked ||
      input.consent.status === ConsentLedgerStatus.REVOKED;
    const authorizationRevoked =
      input.authorization.status === ProviderAuthorizationLedgerStatus.REVOKED;

    if (consentRevoked || authorizationRevoked) {
      reasonCodes.push(ProviderLinkReasonCode.PROVIDER_REVOKED);
      return result(
        ProviderLinkState.REVOKED,
        hasAnyProviderIdentity(input),
        reasonCodes,
        false,
        connectionStatus,
      );
    }

    if (!hasAnyProviderIdentity(input)) {
      reasonCodes.push(ProviderLinkReasonCode.NO_ACTIVE_PROVIDER_LINK);
      return result(
        ProviderLinkState.NO_LINK,
        false,
        reasonCodes,
        false,
        connectionStatus,
      );
    }

    const historicalOnly =
      input.tokenBinding.hasHistoricalDimoRecord &&
      !input.mapping.hasActiveMapping &&
      input.consent.status !== ConsentLedgerStatus.ACTIVE;

    if (input.mapping.hasActiveMapping && !input.tokenBinding.hasToken) {
      reasonCodes.push(ProviderLinkReasonCode.TOKEN_MISSING);
      return result(
        ProviderLinkState.REAUTH_REQUIRED,
        true,
        reasonCodes,
        historicalOnly,
        connectionStatus,
      );
    }

    const authorizationExpired =
      input.authorization.status === ProviderAuthorizationLedgerStatus.EXPIRED ||
      input.expiry.isExpired ||
      (input.authorization.expiresAt != null &&
        (parseIsoMs(input.authorization.expiresAt) ?? Infinity) <= nowMs);

    if (authorizationExpired) {
      reasonCodes.push(ProviderLinkReasonCode.AUTHORIZATION_EXPIRED);
      return result(
        ProviderLinkState.REAUTH_REQUIRED,
        true,
        reasonCodes,
        historicalOnly,
        connectionStatus,
      );
    }

    const consentExpired =
      input.consent.status === ConsentLedgerStatus.EXPIRED ||
      (input.consent.expiresAt != null &&
        (parseIsoMs(input.consent.expiresAt) ?? Infinity) <= nowMs);

    const consentMissing =
      input.consent.status === ConsentLedgerStatus.MISSING ||
      input.consent.status === ConsentLedgerStatus.PENDING ||
      consentExpired;

    if (consentMissing) {
      reasonCodes.push(ProviderLinkReasonCode.CONSENT_MISSING);
      if (historicalOnly) {
        return result(
          ProviderLinkState.UNKNOWN,
          true,
          reasonCodes,
          true,
          connectionStatus,
        );
      }
      return result(
        ProviderLinkState.REAUTH_REQUIRED,
        true,
        reasonCodes,
        historicalOnly,
        connectionStatus,
      );
    }

    if (
      input.authorization.status === ProviderAuthorizationLedgerStatus.MISSING
    ) {
      reasonCodes.push(ProviderLinkReasonCode.CONSENT_MISSING);
      return result(
        ProviderLinkState.REAUTH_REQUIRED,
        true,
        reasonCodes,
        historicalOnly,
        connectionStatus,
      );
    }

    if (historicalOnly) {
      return result(
        ProviderLinkState.UNKNOWN,
        true,
        reasonCodes,
        true,
        connectionStatus,
      );
    }

    if (
      input.authorization.status === ProviderAuthorizationLedgerStatus.UNKNOWN ||
      input.consent.status === ConsentLedgerStatus.UNKNOWN
    ) {
      return result(
        ProviderLinkState.UNKNOWN,
        true,
        reasonCodes,
        false,
        connectionStatus,
      );
    }

    const fullyActive =
      input.mapping.hasActiveMapping &&
      input.consent.status === ConsentLedgerStatus.ACTIVE &&
      input.tokenBinding.hasToken &&
      input.authorization.status === ProviderAuthorizationLedgerStatus.ACTIVE;

    if (fullyActive) {
      reasonCodes.push(ProviderLinkReasonCode.LINK_ACTIVE);
      return result(
        ProviderLinkState.ACTIVE,
        true,
        reasonCodes,
        false,
        connectionStatus,
      );
    }

    return result(
      ProviderLinkState.UNKNOWN,
      hasAnyProviderIdentity(input),
      reasonCodes,
      historicalOnly,
      connectionStatus,
    );
  }
}

function result(
  state: ProviderLinkState,
  hasProviderLink: boolean,
  reasonCodes: ProviderLinkReasonCode[],
  isHistoricalIdentityOnly: boolean,
  providerConnectionStatus: string | null,
): ProviderLinkStateResult {
  return {
    state,
    hasProviderLink,
    reasonCodes: [...new Set(reasonCodes)],
    isHistoricalIdentityOnly,
    providerConnectionStatus,
  };
}
