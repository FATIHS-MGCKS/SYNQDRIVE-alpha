/**
 * AI-layer telemetry semantics — unified vocabulary for Fleet AI grounded answers.
 *
 * Maps **from** canonical backend {@link TelemetryFreshness} via
 * `resolveTelemetryFreshness` — thresholds are never redefined here.
 *
 * Product alias reference (connectivity-domain.types.ts):
 * LIVE ↔ live/fresh · STANDBY ↔ standby · SOFT_OFFLINE ↔ soft_offline ·
 * OFFLINE ↔ offline · UNKNOWN ↔ unknown
 */
export const AI_EVIDENCE_TELEMETRY_SEMANTICS = [
  /** Signal younger than {@link TELEMETRY_FRESH_THRESHOLD_MS} (15 min). */
  'live',
  /** Live bucket with active movement/ignition/live-tracking hints. */
  'fresh',
  /** 15 min .. 24 h — normal DIMO heartbeat standby. */
  'standby',
  /** Aged data still presented (partial availability, last-known value). */
  'stale',
  /** 24 h .. 48 h — canonical `signal_delayed`. */
  'soft_offline',
  /** Older than 48 h — canonical `offline`. */
  'offline',
  /** No usable timestamp — canonical `no_signal` or indeterminate age. */
  'unknown',
  /** Provider/signal pipeline cannot supply data right now. */
  'unavailable',
  /** Signal not applicable for vehicle type or requested metric. */
  'not_supported',
  /** Caller lacks permission for this telemetry category. */
  'permission_denied',
] as const;

export type AiEvidenceTelemetrySemantics =
  (typeof AI_EVIDENCE_TELEMETRY_SEMANTICS)[number];

/** Re-export canonical thresholds — single source: vehicle-state-interpreter. */
export {
  TELEMETRY_FRESH_THRESHOLD_MS,
  TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS,
  TELEMETRY_STANDBY_THRESHOLD_MS,
} from '@modules/vehicles/telemetry-freshness.resolver';

export type { TelemetryFreshness } from '@modules/vehicles/vehicle-state-interpreter';
