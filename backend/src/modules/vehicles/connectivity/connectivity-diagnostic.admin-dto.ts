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
  /**
   * Whether the provider polling cohort currently includes this vehicle.
   * `false` explains an absent recent fetch without blaming the provider.
   */
  providerPollScheduled: boolean | null;

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
    providerPollScheduled: diagnostic.providerPollEligible,

    deviceBindingRef: runtime.evidence.deviceBindingRef ?? null,
    providerErrorCategory: resolveProviderErrorCategory(runtime.reasonCodes),

    calculatedAt: runtime.calculatedAt,
  };
}

/**
 * Binding = an active provider data source link exists.
 *
 * Prefers the authoritative `diagnostic.bindingActive` evidence the assembler
 * supplies. Falls back to the two link states that prove it on their own:
 * `ACTIVE` requires an active mapping, `NO_LINK` means no provider identity at
 * all. Everything else is `UNKNOWN` — `REVOKED`, `REAUTH_REQUIRED` and `ERROR`
 * describe the grant chain or the provider call, not the binding row, and
 * `deviceBindingId` cannot stand in for it because it falls back to the last
 * known `providerBindingId`, which may reference a deactivated link.
 */
function resolveBindingState(
  runtime: VehicleConnectivityRuntimeState,
): ConnectivityTriState {
  const authoritative = runtime.diagnostic.bindingActive;
  if (authoritative != null) return authoritative ? 'ACTIVE' : 'INACTIVE';

  switch (runtime.providerLinkState) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'NO_LINK':
      return 'INACTIVE';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Consent as far as the canonical reason codes can prove it.
 *
 * `LINK_ACTIVE` is only emitted by `ProviderLinkStateBuilder` when the full
 * chain is active (mapping + consent ACTIVE + token + authorization), so it is
 * sound evidence of active consent. `CONSENT_MISSING` is deliberately reported
 * as `INACTIVE` even though the builder also emits it for a missing org
 * authorization: in every emission path the usable consent grant is absent.
 * Absent both codes we report `UNKNOWN` rather than guessing.
 */
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
