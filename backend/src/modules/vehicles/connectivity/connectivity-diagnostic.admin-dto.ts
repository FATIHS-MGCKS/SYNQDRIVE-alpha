/**
 * Master-Admin-only connectivity diagnostic payload.
 *
 * Exposed exclusively via `GET admin/vehicles/:vehicleId/operational/diagnostics`
 * (`@Roles('MASTER_ADMIN')`). Never merged into tenant-facing connectivity DTOs.
 *
 * Contains no secrets: no access tokens, JWTs, credentials, or raw provider
 * payloads. `deviceBindingRef` is the same internal reference already carried by
 * the tenant runtime evidence block.
 */
import { ConnectivityReasonCode } from './domain/connectivity-domain.types';
import type { VehicleConnectivityRuntimeState } from './domain/connectivity-domain.types';
import type { ConnectivityDiagnosticState } from './domain/connectivity-diagnostic-state';
import type { TelemetryFreshness } from '../vehicle-state-interpreter';

export type ConnectivityTriState = 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';

export interface ConnectivityDiagnosticAdminDto {
  /** Provider name (e.g. `DIMO`) — null when no data source is bound. */
  provider: string | null;
  /** Diagnostic classification. Separate dimension from `telemetryState`. */
  diagnosticState: ConnectivityDiagnosticState;

  /** Provider API answered within the canonical fresh window. */
  providerApiReachable: boolean | null;
  /** Last successful provider response (`providerFetchedAt`). Not vehicle freshness. */
  lastProviderFetchAt: string | null;
  lastProviderFetchAgeMs: number | null;

  /** Last real vehicle observation (`sourceTimestamp`). Drives canonical freshness. */
  lastVehicleObservationAt: string | null;
  lastVehicleObservationAgeMs: number | null;
  /** Canonical observation freshness — identical to the runtime `telemetryState`. */
  observationState: TelemetryFreshness;

  bindingState: ConnectivityTriState;
  consentState: ConnectivityTriState;
  /** Provider-reported connection status token when known. */
  connectionStatus: string | null;

  /** Internal binding reference — not a credential. */
  deviceBindingRef: string | null;
  /** Coarse provider/auth failure category derived from reason codes. */
  providerErrorCategory: ConnectivityReasonCode | null;

  calculatedAt: string;
}

/** Reason codes indicating a grant-chain fault, most specific first. */
const PROVIDER_ERROR_CATEGORIES: readonly ConnectivityReasonCode[] = [
  ConnectivityReasonCode.PROVIDER_REVOKED,
  ConnectivityReasonCode.AUTHORIZATION_EXPIRED,
  ConnectivityReasonCode.CONSENT_MISSING,
  ConnectivityReasonCode.TOKEN_MISSING,
  ConnectivityReasonCode.PROVIDER_ERROR,
  ConnectivityReasonCode.NO_ACTIVE_PROVIDER_LINK,
];

export function serializeConnectivityDiagnosticAdmin(
  runtime: VehicleConnectivityRuntimeState,
  context: { provider: string | null },
): ConnectivityDiagnosticAdminDto {
  const { diagnostic } = runtime;

  return {
    provider: context.provider,
    diagnosticState: diagnostic.state,

    providerApiReachable: diagnostic.providerReachable,
    lastProviderFetchAt: runtime.lastReceivedAt,
    lastProviderFetchAgeMs: diagnostic.providerFetchAgeMs,

    lastVehicleObservationAt: runtime.lastTelemetryAt,
    lastVehicleObservationAgeMs: diagnostic.observationAgeMs,
    observationState: diagnostic.observationState,

    bindingState: resolveBindingState(runtime),
    consentState: resolveConsentState(runtime),
    connectionStatus: runtime.evidence.providerConnectionStatus ?? null,

    deviceBindingRef: runtime.evidence.deviceBindingRef ?? null,
    providerErrorCategory: resolveProviderErrorCategory(runtime.reasonCodes),

    calculatedAt: runtime.calculatedAt,
  };
}

function resolveBindingState(
  runtime: VehicleConnectivityRuntimeState,
): ConnectivityTriState {
  switch (runtime.providerLinkState) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'NO_LINK':
    case 'REVOKED':
      return 'INACTIVE';
    case 'REAUTH_REQUIRED':
    case 'ERROR':
      // Binding row exists; the grant chain or provider call is what failed.
      return runtime.deviceBindingId ? 'ACTIVE' : 'INACTIVE';
    default:
      return 'UNKNOWN';
  }
}

function resolveConsentState(
  runtime: VehicleConnectivityRuntimeState,
): ConnectivityTriState {
  if (runtime.reasonCodes.includes(ConnectivityReasonCode.CONSENT_MISSING)) {
    return 'INACTIVE';
  }
  if (runtime.reasonCodes.includes(ConnectivityReasonCode.PROVIDER_REVOKED)) {
    return 'INACTIVE';
  }
  if (runtime.reasonCodes.includes(ConnectivityReasonCode.LINK_ACTIVE)) {
    return 'ACTIVE';
  }
  return 'UNKNOWN';
}

function resolveProviderErrorCategory(
  reasonCodes: readonly ConnectivityReasonCode[],
): ConnectivityReasonCode | null {
  return (
    PROVIDER_ERROR_CATEGORIES.find((code) => reasonCodes.includes(code)) ?? null
  );
}
