/**
 * Canonical Fleet Connectivity domain vocabulary.
 *
 * Single source of truth for connectivity runtime dimensions, reason codes,
 * and the {@link VehicleConnectivityRuntimeState} result shape.
 *
 * Rules:
 * - No user-facing labels or i18n strings in this module.
 * - Telemetry freshness reuses {@link TelemetryFreshness} — no parallel enum.
 * - State, reason codes, recommended actions, and technical evidence are separate.
 */
import type { TelemetryFreshness } from '../../vehicle-state-interpreter';

export type { TelemetryFreshness };

/**
 * Product alias map (documentation only — domain uses canonical TelemetryFreshness):
 * LIVE ↔ live · STANDBY ↔ standby · SOFT_OFFLINE ↔ signal_delayed ·
 * OFFLINE ↔ offline · UNKNOWN ↔ no_signal
 */

// ─── A. Provider Link State ───────────────────────────────────────────────────

export const ProviderLinkState = {
  ACTIVE: 'ACTIVE',
  REAUTH_REQUIRED: 'REAUTH_REQUIRED',
  REVOKED: 'REVOKED',
  NO_LINK: 'NO_LINK',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;
export type ProviderLinkState =
  (typeof ProviderLinkState)[keyof typeof ProviderLinkState];
export const PROVIDER_LINK_STATES = Object.values(ProviderLinkState);

// ─── B. Telemetry State — canonical TelemetryFreshness (no duplicate enum) ───

// ─── C. Physical Device State ─────────────────────────────────────────────────

export const PhysicalDeviceState = {
  PLUGGED_CONFIRMED: 'PLUGGED_CONFIRMED',
  PLUGGED_INFERRED: 'PLUGGED_INFERRED',
  UNPLUGGED_CONFIRMED: 'UNPLUGGED_CONFIRMED',
  UNKNOWN: 'UNKNOWN',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
} as const;
export type PhysicalDeviceState =
  (typeof PhysicalDeviceState)[keyof typeof PhysicalDeviceState];
export const PHYSICAL_DEVICE_STATES = Object.values(PhysicalDeviceState);

// ─── D. Data Coverage State ───────────────────────────────────────────────────

export const DataCoverageState = {
  GOOD: 'GOOD',
  PARTIAL: 'PARTIAL',
  INSUFFICIENT: 'INSUFFICIENT',
  UNKNOWN: 'UNKNOWN',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
} as const;
export type DataCoverageState =
  (typeof DataCoverageState)[keyof typeof DataCoverageState];
export const DATA_COVERAGE_STATES = Object.values(DataCoverageState);

// ─── E. Attention State ───────────────────────────────────────────────────────

export const AttentionState = {
  NONE: 'NONE',
  WATCH: 'WATCH',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
  CRITICAL: 'CRITICAL',
} as const;
export type AttentionState = (typeof AttentionState)[keyof typeof AttentionState];
export const ATTENTION_STATES = Object.values(AttentionState);

// ─── F. Overall Connectivity State ────────────────────────────────────────────

export const OverallConnectivityState = {
  TELEMETRY_ACTIVE: 'TELEMETRY_ACTIVE',
  STANDBY: 'STANDBY',
  SOFT_OFFLINE: 'SOFT_OFFLINE',
  OFFLINE: 'OFFLINE',
  DEVICE_UNPLUGGED: 'DEVICE_UNPLUGGED',
  AUTHORIZATION_REQUIRED: 'AUTHORIZATION_REQUIRED',
  NO_ACTIVE_DATA_SOURCE: 'NO_ACTIVE_DATA_SOURCE',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;
export type OverallConnectivityState =
  (typeof OverallConnectivityState)[keyof typeof OverallConnectivityState];
export const OVERALL_CONNECTIVITY_STATES = Object.values(OverallConnectivityState);

// ─── Reason codes (structured, machine-readable) ─────────────────────────────

export const ConnectivityReasonCode = {
  TELEMETRY_FRESH: 'TELEMETRY_FRESH',
  TELEMETRY_STANDBY: 'TELEMETRY_STANDBY',
  TELEMETRY_SOFT_OFFLINE: 'TELEMETRY_SOFT_OFFLINE',
  TELEMETRY_OFFLINE: 'TELEMETRY_OFFLINE',
  NO_TELEMETRY_TIMESTAMP: 'NO_TELEMETRY_TIMESTAMP',
  DEVICE_UNPLUG_WEBHOOK: 'DEVICE_UNPLUG_WEBHOOK',
  DEVICE_RECONNECTED_EXPLICIT: 'DEVICE_RECONNECTED_EXPLICIT',
  DEVICE_RECONNECTED_SNAPSHOT: 'DEVICE_RECONNECTED_SNAPSHOT',
  DEVICE_RECONNECTED_TELEMETRY: 'DEVICE_RECONNECTED_TELEMETRY',
  DEVICE_BINDING_CHANGED: 'DEVICE_BINDING_CHANGED',
  AUTHORIZATION_EXPIRED: 'AUTHORIZATION_EXPIRED',
  CONSENT_MISSING: 'CONSENT_MISSING',
  TOKEN_MISSING: 'TOKEN_MISSING',
  PROVIDER_REVOKED: 'PROVIDER_REVOKED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  LINK_ACTIVE: 'LINK_ACTIVE',
  NO_ACTIVE_PROVIDER_LINK: 'NO_ACTIVE_PROVIDER_LINK',
  DATA_COVERAGE_PARTIAL: 'DATA_COVERAGE_PARTIAL',
  DATA_COVERAGE_INSUFFICIENT: 'DATA_COVERAGE_INSUFFICIENT',
  WEBHOOK_PROCESSING_FAILED: 'WEBHOOK_PROCESSING_FAILED',
  STATE_CONFLICT: 'STATE_CONFLICT',
  MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED',
} as const;
export type ConnectivityReasonCode =
  (typeof ConnectivityReasonCode)[keyof typeof ConnectivityReasonCode];
export const CONNECTIVITY_REASON_CODES = Object.values(ConnectivityReasonCode);

// ─── Recommended actions (codes only — labels live in frontend i18n) ─────────

export const ConnectivityRecommendedAction = {
  NONE: 'NONE',
  CHECK_DEVICE: 'CHECK_DEVICE',
  REAUTHORIZE_PROVIDER: 'REAUTHORIZE_PROVIDER',
  CONNECT_DATA_SOURCE: 'CONNECT_DATA_SOURCE',
  REVIEW_CONNECTIVITY: 'REVIEW_CONNECTIVITY',
  WAIT_FOR_TELEMETRY: 'WAIT_FOR_TELEMETRY',
  CHECK_INTEGRATION: 'CHECK_INTEGRATION',
} as const;
export type ConnectivityRecommendedAction =
  (typeof ConnectivityRecommendedAction)[keyof typeof ConnectivityRecommendedAction];
export const CONNECTIVITY_RECOMMENDED_ACTIONS = Object.values(
  ConnectivityRecommendedAction,
);

/** Monotonic schema version for persisted or API-serialized runtime states. */
export const CONNECTIVITY_RUNTIME_STATE_VERSION = 1;

// ─── Technical evidence (facts, not presentation) ───────────────────────────

export interface VehicleConnectivityTechnicalEvidence {
  /** Latest DIMO / provider connection status token when known. */
  providerConnectionStatus?: string | null;
  /** Open unplug episode from device-connection read-model. */
  openUnpluggedEpisode?: boolean | null;
  /** Active device-connection episode row id when persisted. */
  deviceConnectionEpisodeId?: string | null;
  /** Recent webhook event ids contributing to physical device inference. */
  deviceConnectionEventIds?: string[];
  /** Signal coverage percent used for data-coverage dimension (0–100). */
  signalCoveragePercent?: number | null;
  /** Whether webhook intake is configured for this vehicle. */
  webhookConfigured?: boolean | null;
  /** Internal device binding reference (tokenId hash, binding row id, …). */
  deviceBindingRef?: string | null;
  /** Provider-observed timestamp of last OBD plug signal when available. */
  lastObdPlugObservedAt?: string | null;
}

// ─── Canonical runtime result ─────────────────────────────────────────────────

export interface VehicleConnectivityRuntimeState {
  vehicleId: string;
  organizationId: string;

  providerLinkState: ProviderLinkState;
  /** Canonical telemetry dimension — {@link TelemetryFreshness}, not a duplicate enum. */
  telemetryState: TelemetryFreshness;
  physicalDeviceState: PhysicalDeviceState;
  dataCoverageState: DataCoverageState;
  attentionState: AttentionState;
  overallState: OverallConnectivityState;

  reasonCodes: ConnectivityReasonCode[];

  lastTelemetryAt: string | null;
  lastProviderObservedAt: string | null;
  lastReceivedAt: string | null;

  /** Internal binding reference — not a user-visible identifier. */
  deviceBindingId: string | null;
  activeEpisodeId: string | null;

  requiresAction: boolean;
  recommendedAction: ConnectivityRecommendedAction;

  /** Structured facts supporting the state — never user-facing copy. */
  evidence: VehicleConnectivityTechnicalEvidence;

  calculatedAt: string;
  stateVersion: number;
}
