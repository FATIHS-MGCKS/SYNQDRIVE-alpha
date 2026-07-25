import type { AiEvidenceSource } from './ai-evidence.enums';
import type { AiEvidenceTelemetrySemantics } from './ai-evidence-telemetry.enums';
import type {
  AiEvidenceAvailability,
  AiEvidenceConfidence,
  AiEvidenceFreshness,
  AiEvidenceReasonCode,
} from './ai-evidence.enums';
import type { TelemetryTimestampEvidence } from '@modules/vehicles/telemetry-freshness.resolver';
import type { TelemetryFreshness } from '@modules/vehicles/vehicle-state-interpreter';

/** Optional vehicle/runtime hints — mirrors frontend `hasFreshLiveHint` inputs. */
export interface AiTelemetryLiveHints {
  readonly isLiveTracking?: boolean;
  readonly isFresh?: boolean;
  readonly online?: boolean;
  readonly onlineStatus?: string | null;
  readonly displayState?: string | null;
  readonly displayIgnition?: string | null;
  readonly speedKmh?: number | null;
}

/**
 * Input for mapping domain telemetry state → AI Evidence semantics.
 * Timestamp resolution delegates to {@link resolveTelemetryFreshness}.
 */
export interface MapTelemetryToAiEvidenceInput {
  readonly tenantId: string;
  readonly entityId: string;
  readonly timestampEvidence: TelemetryTimestampEvidence;
  readonly source?: AiEvidenceSource;
  /** False when vehicle has no DIMO/provider link. */
  readonly hasProviderLink?: boolean;
  /** GPS or signal category denied by IAM / DataAuthorization. */
  readonly permissionDenied?: boolean;
  /** False when requested metric does not apply (e.g. coolant on EV). */
  readonly signalSupported?: boolean;
  /** Temporary upstream provider failure. */
  readonly providerOutage?: boolean;
  /** Value comes from stored snapshot, not live pipeline. */
  readonly isHistoricalSnapshot?: boolean;
  /** Last-known coordinates/metrics are intentionally surfaced. */
  readonly lastKnownPositionAvailable?: boolean;
  readonly liveHints?: AiTelemetryLiveHints;
  readonly nowMs?: number;
}

/** Result of central telemetry → AI semantics mapping. */
export interface MappedTelemetryAiSemantics {
  readonly telemetrySemantics: AiEvidenceTelemetrySemantics;
  readonly freshness: AiEvidenceFreshness;
  readonly availability: AiEvidenceAvailability;
  readonly reasonCode: AiEvidenceReasonCode;
  readonly observedAt: string | null;
  readonly ageMs: number | null;
  readonly canonicalFreshness: TelemetryFreshness;
  readonly warnings: readonly string[];
  readonly confidence: AiEvidenceConfidence;
  readonly source: AiEvidenceSource;
}

/** Documented mapping from canonical backend freshness to AI telemetry semantics. */
export interface AiTelemetrySemanticsMappingRow {
  readonly canonicalFreshness: TelemetryFreshness | 'meta';
  readonly telemetrySemantics: AiEvidenceTelemetrySemantics;
  readonly evidenceFreshness: AiEvidenceFreshness;
  readonly availability: AiEvidenceAvailability;
  readonly notes: string;
}
