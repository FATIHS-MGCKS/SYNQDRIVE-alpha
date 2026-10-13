/**
 * VSI multi-axis capability and evidence contracts (read-only metadata).
 *
 * VSI reports observations; domain modules own eligibility and policy decisions.
 */

import type { VsiCanonicalSignalKey } from './canonical-signal-keys';

export const VSI_EVIDENCE_CONTRACT_VERSION = 'vsi-evidence-v1' as const;

export type VsiEvidenceContractVersion = typeof VSI_EVIDENCE_CONTRACT_VERSION;

/** Explicit unresolved provider source-link — never substitute another link. */
export const VSI_UNRESOLVED_PROVIDER_SOURCE_LINK_ID = 'UNRESOLVED_PROVIDER_SOURCE_LINK' as const;

export type VsiProviderSourceLinkRef =
  | { kind: 'resolved'; providerSourceLinkId: string }
  | { kind: 'unresolved'; reason: string };

export const VsiProviderCatalogStatus = {
  LISTED: 'LISTED',
  NOT_LISTED: 'NOT_LISTED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type VsiProviderCatalogStatus =
  (typeof VsiProviderCatalogStatus)[keyof typeof VsiProviderCatalogStatus];

export const VsiEmpiricalObservationStatus = {
  NEVER_OBSERVED: 'NEVER_OBSERVED',
  OBSERVED: 'OBSERVED',
  OBSERVED_STALE: 'OBSERVED_STALE',
  NOT_OBSERVED_IN_WINDOW: 'NOT_OBSERVED_IN_WINDOW',
} as const;

export type VsiEmpiricalObservationStatus =
  (typeof VsiEmpiricalObservationStatus)[keyof typeof VsiEmpiricalObservationStatus];

export const VsiAuthorizationStatus = {
  AUTHORIZED: 'AUTHORIZED',
  AUTH_BLOCKED: 'AUTH_BLOCKED',
  ENTITLEMENT_GAP: 'ENTITLEMENT_GAP',
  UNKNOWN: 'UNKNOWN',
} as const;

export type VsiAuthorizationStatus =
  (typeof VsiAuthorizationStatus)[keyof typeof VsiAuthorizationStatus];

/** Aligns with Battery V2 provider observation outcomes where applicable. */
export const VsiSignalQualityStatus = {
  VALID: 'VALID',
  REJECTED: 'REJECTED',
  DUPLICATE: 'DUPLICATE',
  STALE_REPLAY: 'STALE_REPLAY',
  UNKNOWN: 'UNKNOWN',
} as const;

export type VsiSignalQualityStatus =
  (typeof VsiSignalQualityStatus)[keyof typeof VsiSignalQualityStatus];

export const VsiConsumerEligibilityStatus = {
  ELIGIBLE: 'ELIGIBLE',
  INELIGIBLE: 'INELIGIBLE',
  UNKNOWN: 'UNKNOWN',
} as const;

export type VsiConsumerEligibilityStatus =
  (typeof VsiConsumerEligibilityStatus)[keyof typeof VsiConsumerEligibilityStatus];

export type VsiMeasuredTimestamp = Date | 'NOT_MEASURED' | 'UNKNOWN';

export type VsiMultiAxisCapability = {
  providerCatalog: VsiProviderCatalogStatus;
  empiricalObservation: VsiEmpiricalObservationStatus;
  authorization: VsiAuthorizationStatus;
  signalQuality: VsiSignalQualityStatus;
};

export type VsiEvidenceOrigin =
  | 'DIMO_SNAPSHOT'
  | 'DIMO_PREFLIGHT'
  | 'DIMO_POLL_LOG'
  | 'HIGH_MOBILITY_MQTT'
  | 'BATTERY_MEASUREMENT'
  | 'HV_BATTERY_SNAPSHOT'
  | 'VEHICLE_LATEST_STATE'
  | 'APDS_SHADOW_DECISION'
  | 'MANUAL_AUDIT'
  | 'UNKNOWN';

export type VsiCatalogListingEvidence = {
  listed: boolean | 'UNKNOWN';
  providerNativeSignalName: string | 'UNKNOWN';
  checkedAt: VsiMeasuredTimestamp;
  evidenceOrigin: VsiEvidenceOrigin;
  reference?: string;
};

export type VsiEmpiricalObservationEvidence = {
  observationStatus: VsiEmpiricalObservationStatus;
  lastObservedAt: VsiMeasuredTimestamp;
  lastSourceTimestamp: VsiMeasuredTimestamp;
  /** Strict provider source advance vs prior known source time. */
  strictSourceAdvanced: boolean | 'UNKNOWN';
  sampleCountInWindow: number | 'NOT_MEASURED';
  evidenceOrigin: VsiEvidenceOrigin;
  reference?: string;
};

export type VsiAuthorizationEvidence = {
  status: VsiAuthorizationStatus;
  evaluatedAt: VsiMeasuredTimestamp;
  httpStatus?: number | 'NOT_MEASURED';
  providerSourceLinkRef: VsiProviderSourceLinkRef;
  reference?: string;
};

export type VsiConsumerEligibilityEvidence = {
  consumer: string;
  verdict: VsiConsumerEligibilityStatus;
  /** Domain-owned reason code — VSI does not invent policy semantics. */
  domainReason: string | 'UNKNOWN';
  evaluatedAt: VsiMeasuredTimestamp;
};

export type VsiVehicleSignalEvidenceDescriptorV1 = {
  contractVersion: VsiEvidenceContractVersion;
  /** Projection as-of time — distinct from historical domain decision times. */
  projectionAsOf: Date;
  identity: {
    organizationId: string;
    vehicleId: string;
    providerIdentity: string;
    providerSourceLinkRef: VsiProviderSourceLinkRef;
    canonicalSignalKey: VsiCanonicalSignalKey;
  };
  providerNativeSignalName: string | 'UNKNOWN';
  timestamps: {
    source: VsiMeasuredTimestamp;
    observed: VsiMeasuredTimestamp;
    received: VsiMeasuredTimestamp;
    persisted: VsiMeasuredTimestamp;
  };
  capability: VsiMultiAxisCapability;
  catalogEvidence?: VsiCatalogListingEvidence;
  empiricalEvidence?: VsiEmpiricalObservationEvidence;
  authorizationEvidence?: VsiAuthorizationEvidence;
  consumerEligibility?: VsiConsumerEligibilityEvidence[];
  freshnessClassification: 'FRESH' | 'STALE' | 'UNKNOWN';
  cadenceMsP50: number | 'NOT_MEASURED';
  cadenceMsP95: number | 'NOT_MEASURED';
  confidenceLimitations: readonly string[];
};

export type VsiEvidenceScopeKeyInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkRef: VsiProviderSourceLinkRef;
  canonicalSignalKey: VsiCanonicalSignalKey;
};

/** Deterministic scope key — one provider source link per key (T07, T11, T14). */
export function buildVsiEvidenceScopeKey(input: VsiEvidenceScopeKeyInput): string {
  assertDistinctTenantScope(input.organizationId, input.vehicleId);
  const linkPart =
    input.providerSourceLinkRef.kind === 'resolved'
      ? input.providerSourceLinkRef.providerSourceLinkId
      : VSI_UNRESOLVED_PROVIDER_SOURCE_LINK_ID;
  return `${input.organizationId}:${input.vehicleId}:${linkPart}:${input.canonicalSignalKey}`;
}

export function assertDistinctTenantScope(organizationId: string, vehicleId: string): void {
  if (!organizationId?.trim() || !vehicleId?.trim()) {
    throw new Error('organizationId and vehicleId are required for VSI evidence scope');
  }
}

export function deriveProviderCatalogStatus(
  listed: boolean | null | undefined,
): VsiProviderCatalogStatus {
  if (listed === true) return VsiProviderCatalogStatus.LISTED;
  if (listed === false) return VsiProviderCatalogStatus.NOT_LISTED;
  return VsiProviderCatalogStatus.UNKNOWN;
}

/**
 * Listed catalog entry without empirical samples → NEVER_OBSERVED, not SUPPORTED.
 */
export function deriveEmpiricalObservationFromSamples(input: {
  usableSampleCount: number;
  staleSampleCount?: number;
  windowActive?: boolean;
}): VsiEmpiricalObservationStatus {
  if (input.usableSampleCount > 0) {
    if (input.staleSampleCount && input.staleSampleCount >= input.usableSampleCount) {
      return VsiEmpiricalObservationStatus.OBSERVED_STALE;
    }
    return VsiEmpiricalObservationStatus.OBSERVED;
  }
  if (input.windowActive) {
    return VsiEmpiricalObservationStatus.NOT_OBSERVED_IN_WINDOW;
  }
  return VsiEmpiricalObservationStatus.NEVER_OBSERVED;
}

export function deriveAuthorizationFromHttpStatus(
  httpStatus: number | null | undefined,
): VsiAuthorizationStatus {
  if (httpStatus == null || !Number.isFinite(httpStatus)) {
    return VsiAuthorizationStatus.UNKNOWN;
  }
  if (httpStatus === 403 || httpStatus === 401) {
    return VsiAuthorizationStatus.AUTH_BLOCKED;
  }
  if (httpStatus >= 400 && httpStatus < 500) {
    return VsiAuthorizationStatus.ENTITLEMENT_GAP;
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    return VsiAuthorizationStatus.AUTHORIZED;
  }
  return VsiAuthorizationStatus.UNKNOWN;
}

/** HTTP success alone does not advance provider source time (T09). */
export function evaluateStrictSourceAdvance(input: {
  previousSourceMs: number | null | undefined;
  latestSourceMs: number | null | undefined;
}): boolean | 'UNKNOWN' {
  const { previousSourceMs, latestSourceMs } = input;
  if (latestSourceMs == null) return 'UNKNOWN';
  if (previousSourceMs == null) return false;
  if (!Number.isFinite(previousSourceMs) || !Number.isFinite(latestSourceMs)) {
    return 'UNKNOWN';
  }
  return latestSourceMs > previousSourceMs;
}

export function mapBatteryProviderObservationOutcomeToVsiQuality(
  outcome: string | null | undefined,
): VsiSignalQualityStatus {
  switch (outcome) {
    case 'NEW_OBSERVATION':
      return VsiSignalQualityStatus.VALID;
    case 'DUPLICATE_OBSERVATION':
      return VsiSignalQualityStatus.DUPLICATE;
    case 'STALE_REPLAY':
      return VsiSignalQualityStatus.STALE_REPLAY;
    case 'INVALID_TIMESTAMP':
    case 'OUT_OF_ORDER':
    case 'VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP':
      return VsiSignalQualityStatus.REJECTED;
    default:
      return VsiSignalQualityStatus.UNKNOWN;
  }
}

/**
 * Suppression / skipped polls: absence in window is NOT confirmed unsupported (T08).
 */
export function observationStatusDuringSuppressionWindow(
  hadObservationBeforeWindow: boolean,
): VsiEmpiricalObservationStatus {
  return hadObservationBeforeWindow
    ? VsiEmpiricalObservationStatus.NOT_OBSERVED_IN_WINDOW
    : VsiEmpiricalObservationStatus.NEVER_OBSERVED;
}

/** VSI projections must not mutate immutable historical domain records (T12). */
export function assertVsiProjectionDoesNotOverwriteHistoricalFields<
  T extends Record<string, unknown>,
>(
  historical: T,
  projectionPatch: Record<string, unknown>,
  protectedKeys: readonly string[],
): { ok: true } | { ok: false; violatedKey: string } {
  for (const key of protectedKeys) {
    if (!(key in projectionPatch)) continue;
    if (Object.prototype.hasOwnProperty.call(historical, key)) {
      return { ok: false, violatedKey: key };
    }
  }
  return { ok: true };
}

/** No implicit unit conversion — conflicts remain unresolved until explicitly mapped (T13). */
export function assertCanonicalUnitCompatible(
  declaredUnit: string | null | undefined,
  acceptedUnits: readonly string[],
): { compatible: true } | { compatible: false; reason: 'UNIT_CONFLICT_UNRESOLVED' } {
  if (!declaredUnit?.trim()) {
    return { compatible: true };
  }
  const normalized = declaredUnit.trim().toLowerCase();
  const ok = acceptedUnits.some((u) => u.toLowerCase() === normalized);
  return ok ? { compatible: true } : { compatible: false, reason: 'UNIT_CONFLICT_UNRESOLVED' };
}
