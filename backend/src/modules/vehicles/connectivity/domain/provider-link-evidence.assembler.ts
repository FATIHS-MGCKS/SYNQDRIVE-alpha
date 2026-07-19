/**
 * Maps persisted provider rows into {@link ProviderLinkEvidenceInput}.
 */
import {
  ConsentLedgerStatus,
  ProviderAuthorizationLedgerStatus,
  type ProviderConsentEvidence,
  type ProviderLinkEvidenceInput,
  type ProviderMappingEvidence,
} from './provider-link-state.types';

export interface AssembleProviderLinkEvidenceParams {
  organizationId: string;
  vehicleId: string;
  nowMs?: number;
  dimoVehicleId: string | null;
  dimoVehicle: {
    tokenId: number | null;
    connectionStatus: string;
  } | null;
  dataSourceLinks: Array<{
    id: string;
    provider: string;
    isActive: boolean;
    organizationId?: string | null;
  }>;
  providerConsents: Array<{
    organizationId: string;
    provider: string;
    status: string;
    grantedAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }>;
  orgAuthorization: {
    status: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
  } | null;
  lastSuccessfulTelemetryAt: Date | null;
}

function resolveConsentStatus(
  consents: AssembleProviderLinkEvidenceParams['providerConsents'],
  provider: string,
  nowMs: number,
): ProviderConsentEvidence {
  const dimoConsents = consents
    .filter((c) => c.provider === provider)
    .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime());

  const latest = dimoConsents[0];
  if (!latest) {
    return { status: ConsentLedgerStatus.MISSING, grantedAt: null, expiresAt: null };
  }

  if (latest.status === 'REVOKED' || latest.revokedAt != null) {
    return {
      status: ConsentLedgerStatus.REVOKED,
      grantedAt: latest.grantedAt.toISOString(),
      expiresAt: latest.expiresAt?.toISOString() ?? null,
    };
  }

  if (
    latest.status === 'EXPIRED' ||
    (latest.expiresAt != null && latest.expiresAt.getTime() <= nowMs)
  ) {
    return {
      status: ConsentLedgerStatus.EXPIRED,
      grantedAt: latest.grantedAt.toISOString(),
      expiresAt: latest.expiresAt?.toISOString() ?? null,
    };
  }

  if (latest.status === 'PENDING') {
    return {
      status: ConsentLedgerStatus.PENDING,
      grantedAt: latest.grantedAt.toISOString(),
      expiresAt: latest.expiresAt?.toISOString() ?? null,
    };
  }

  if (latest.status === 'ACTIVE') {
    return {
      status: ConsentLedgerStatus.ACTIVE,
      grantedAt: latest.grantedAt.toISOString(),
      expiresAt: latest.expiresAt?.toISOString() ?? null,
    };
  }

  return {
    status: ConsentLedgerStatus.UNKNOWN,
    grantedAt: latest.grantedAt.toISOString(),
    expiresAt: latest.expiresAt?.toISOString() ?? null,
  };
}

function resolveAuthorizationStatus(
  orgAuth: AssembleProviderLinkEvidenceParams['orgAuthorization'],
  consent: ProviderConsentEvidence,
  nowMs: number,
): ProviderLinkEvidenceInput['authorization'] {
  if (orgAuth?.status === 'REVOKED' || orgAuth?.revokedAt != null) {
    return {
      status: ProviderAuthorizationLedgerStatus.REVOKED,
      expiresAt: orgAuth.expiresAt?.toISOString() ?? null,
    };
  }

  if (
    orgAuth?.status === 'EXPIRED' ||
    (orgAuth?.expiresAt != null && orgAuth.expiresAt.getTime() <= nowMs)
  ) {
    return {
      status: ProviderAuthorizationLedgerStatus.EXPIRED,
      expiresAt: orgAuth.expiresAt?.toISOString() ?? null,
    };
  }

  if (orgAuth?.status === 'ACTIVE') {
    return {
      status: ProviderAuthorizationLedgerStatus.ACTIVE,
      expiresAt: orgAuth.expiresAt?.toISOString() ?? null,
    };
  }

  if (consent.status === ConsentLedgerStatus.ACTIVE) {
    return {
      status: ProviderAuthorizationLedgerStatus.ACTIVE,
      expiresAt: consent.expiresAt,
    };
  }

  if (
    consent.status === ConsentLedgerStatus.MISSING ||
    consent.status === ConsentLedgerStatus.PENDING
  ) {
    return {
      status: ProviderAuthorizationLedgerStatus.MISSING,
      expiresAt: null,
    };
  }

  return {
    status: ProviderAuthorizationLedgerStatus.UNKNOWN,
    expiresAt: null,
  };
}

function resolveMapping(
  links: AssembleProviderLinkEvidenceParams['dataSourceLinks'],
  organizationId: string,
): ProviderMappingEvidence {
  const activeDimo = links.filter((l) => l.isActive && l.provider === 'DIMO');
  const primary = activeDimo[0] ?? null;
  return {
    hasActiveMapping: activeDimo.length > 0,
    activeMappingCount: activeDimo.length,
    provider: primary?.provider ?? (activeDimo.length > 0 ? 'DIMO' : null),
    mappingOrganizationId: primary?.organizationId ?? organizationId,
  };
}

export function assembleProviderLinkEvidence(
  params: AssembleProviderLinkEvidenceParams,
): ProviderLinkEvidenceInput {
  const nowMs = params.nowMs ?? Date.now();
  const mapping = resolveMapping(params.dataSourceLinks, params.organizationId);
  const consent = resolveConsentStatus(
    params.providerConsents,
    'DIMO',
    nowMs,
  );
  const authorization = resolveAuthorizationStatus(
    params.orgAuthorization,
    consent,
    nowMs,
  );

  const tokenId = params.dimoVehicle?.tokenId ?? null;
  const hasToken = tokenId != null && tokenId > 0;
  const bindingId =
    params.dataSourceLinks.find((l) => l.isActive && l.provider === 'DIMO')?.id ??
    null;

  const consentRevoked = consent.status === ConsentLedgerStatus.REVOKED;
  const authRevoked =
    authorization.status === ProviderAuthorizationLedgerStatus.REVOKED;

  return {
    organizationId: params.organizationId,
    vehicleId: params.vehicleId,
    nowMs,
    mapping,
    authorization,
    consent,
    tokenBinding: {
      hasToken,
      tokenId,
      bindingId,
      hasHistoricalDimoRecord: params.dimoVehicleId != null,
    },
    revocation: {
      isRevoked: consentRevoked || authRevoked,
      revokedAt: null,
    },
    expiry: {
      isExpired:
        authorization.status === ProviderAuthorizationLedgerStatus.EXPIRED ||
        consent.status === ConsentLedgerStatus.EXPIRED,
      expiresAt: authorization.expiresAt ?? consent.expiresAt,
    },
    providerError: {
      hasError: false,
      connectionStatus: params.dimoVehicle?.connectionStatus ?? null,
    },
    lastAccess: {
      lastSuccessfulAt: params.lastSuccessfulTelemetryAt?.toISOString() ?? null,
    },
  };
}
