import type { VehicleProviderConsent } from '@prisma/client';
import { validateLegacyReconcileConsent } from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconcile-consent';
import { VsiAuthorizationStatus } from './vehicle-signal-evidence.contract';
import type { VsiLatestStateSnapshot, VsiSourceLinkRow } from './vsi-readonly-composer.types';

/** Independent prior aggregated provider source time — never inferred from poll logs alone. */
export function resolveStrictSourceAdvanceEvidence(input: {
  priorAggregatedSourceTimestamp: Date | null | undefined;
  currentAggregatedSourceTimestamp: Date | null | undefined;
}): boolean | 'UNKNOWN' {
  const priorMs = input.priorAggregatedSourceTimestamp?.getTime() ?? null;
  const currentMs = input.currentAggregatedSourceTimestamp?.getTime() ?? null;
  if (currentMs == null) return 'UNKNOWN';
  if (priorMs == null) return 'UNKNOWN';
  if (!Number.isFinite(priorMs) || !Number.isFinite(currentMs)) return 'UNKNOWN';
  return currentMs > priorMs;
}

/**
 * Latest vehicle state may only be attributed to a source link when binding id matches.
 * Null binding with multiple active links => no per-link attribution.
 */
export function isLatestStateAttributedToLink(input: {
  latestState: VsiLatestStateSnapshot | null;
  link: VsiSourceLinkRow;
  activeLinkCount: number;
}): boolean {
  const { latestState, link, activeLinkCount } = input;
  if (!latestState || link.id === 'UNRESOLVED') return false;
  if (latestState.providerBindingId == null) {
    return false;
  }
  if (latestState.providerBindingId !== link.id) {
    return false;
  }
  const stateProvider = latestState.providerSource?.trim().toUpperCase();
  const linkProvider = link.provider?.trim().toUpperCase();
  if (stateProvider && linkProvider && stateProvider !== linkProvider) {
    return false;
  }
  if (activeLinkCount > 1 && latestState.providerBindingId == null) {
    return false;
  }
  return true;
}

export function isRegistryNonOperational(
  lifecycle: string | 'UNKNOWN',
): boolean {
  return lifecycle === 'OFFBOARDED' || lifecycle === 'ARCHIVED';
}

/** Poll SUCCESS and link existence do not prove scoped telemetry authorization. */
export function resolveScopedTelemetryAuthorization(input: {
  scopedTelemetryAuthorizationProven?: boolean;
}): VsiAuthorizationStatus {
  if (input.scopedTelemetryAuthorizationProven === true) {
    return VsiAuthorizationStatus.AUTHORIZED;
  }
  return VsiAuthorizationStatus.UNKNOWN;
}

export function proveScopedTelemetryAuthorizationFromConsent(input: {
  consent: Pick<
    VehicleProviderConsent,
    | 'id'
    | 'vehicleId'
    | 'organizationId'
    | 'provider'
    | 'grantType'
    | 'status'
    | 'revokedAt'
    | 'expiresAt'
    | 'providerVehicleRef'
  > | null;
  organizationId: string;
  vehicleId: string;
  dimoExternalId?: string | null;
  now: Date;
}): boolean {
  const verdict = validateLegacyReconcileConsent({
    consent: input.consent,
    vehicleId: input.vehicleId,
    organizationId: input.organizationId,
    dimoExternalId: input.dimoExternalId ?? null,
    now: input.now,
  });
  return verdict.ok === true;
}
