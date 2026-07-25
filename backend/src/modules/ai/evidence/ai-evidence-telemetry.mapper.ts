/**
 * Central mapper: canonical SynqDrive telemetry freshness → AI Evidence semantics.
 *
 * **Does not** reimplement thresholds — delegates to
 * `resolveTelemetryFreshness` / `classifyTelemetryFreshness` from
 * `telemetry-freshness.resolver` and `vehicle-state-interpreter`.
 */
import type {
  AiEvidenceAvailability,
  AiEvidenceConfidence,
  AiEvidenceFreshness,
  AiEvidenceReasonCode,
  AiEvidenceSource,
} from './ai-evidence.enums';
import type { AiEvidenceTelemetrySemantics } from './ai-evidence-telemetry.enums';
import type {
  AiTelemetryLiveHints,
  AiTelemetrySemanticsMappingRow,
  MapTelemetryToAiEvidenceInput,
  MappedTelemetryAiSemantics,
} from './ai-evidence-telemetry.types';
import {
  resolveTelemetryFreshness,
  TELEMETRY_FRESH_THRESHOLD_MS,
} from '@modules/vehicles/telemetry-freshness.resolver';
import type { ResolvedTelemetryFreshness } from '@modules/vehicles/telemetry-freshness.resolver';
import type { TelemetryFreshness } from '@modules/vehicles/vehicle-state-interpreter';

export const AI_TELEMETRY_SEMANTICS_MAPPING_TABLE: readonly AiTelemetrySemanticsMappingRow[] =
  [
    {
      canonicalFreshness: 'live',
      telemetrySemantics: 'live',
      evidenceFreshness: 'live',
      availability: 'available',
      notes: 'Age < 15 min, no active live hints',
    },
    {
      canonicalFreshness: 'live',
      telemetrySemantics: 'fresh',
      evidenceFreshness: 'live',
      availability: 'available',
      notes: 'Age < 15 min with live-tracking / movement hints',
    },
    {
      canonicalFreshness: 'standby',
      telemetrySemantics: 'standby',
      evidenceFreshness: 'standby',
      availability: 'available',
      notes: '15 min .. 24 h — normal DIMO standby heartbeat',
    },
    {
      canonicalFreshness: 'standby',
      telemetrySemantics: 'stale',
      evidenceFreshness: 'standby',
      availability: 'partial',
      notes: 'Historical snapshot or last-known presentation in standby window',
    },
    {
      canonicalFreshness: 'signal_delayed',
      telemetrySemantics: 'soft_offline',
      evidenceFreshness: 'signal_delayed',
      availability: 'partial',
      notes: '24 h .. 48 h — backend canonical signal_delayed',
    },
    {
      canonicalFreshness: 'signal_delayed',
      telemetrySemantics: 'stale',
      evidenceFreshness: 'signal_delayed',
      availability: 'partial',
      notes: 'Last-known position/metric surfaced despite soft-offline age',
    },
    {
      canonicalFreshness: 'offline',
      telemetrySemantics: 'offline',
      evidenceFreshness: 'offline',
      availability: 'partial',
      notes: '≥ 48 h without last-known override',
    },
    {
      canonicalFreshness: 'offline',
      telemetrySemantics: 'stale',
      evidenceFreshness: 'offline',
      availability: 'partial',
      notes: 'Last-known data shown for offline vehicle',
    },
    {
      canonicalFreshness: 'no_signal',
      telemetrySemantics: 'unknown',
      evidenceFreshness: 'no_signal',
      availability: 'unavailable',
      notes: 'No usable observation timestamp',
    },
    {
      canonicalFreshness: 'meta',
      telemetrySemantics: 'unavailable',
      evidenceFreshness: 'no_signal',
      availability: 'unavailable',
      notes: 'No provider link or pipeline outage',
    },
    {
      canonicalFreshness: 'meta',
      telemetrySemantics: 'not_supported',
      evidenceFreshness: 'not_applicable',
      availability: 'unavailable',
      notes: 'Signal not applicable for vehicle type / metric',
    },
    {
      canonicalFreshness: 'meta',
      telemetrySemantics: 'permission_denied',
      evidenceFreshness: 'not_applicable',
      availability: 'permission_denied',
      notes: 'Role or DataAuthorization denied',
    },
  ] as const;

function defaultSource(input: MapTelemetryToAiEvidenceInput): AiEvidenceSource {
  return input.source ?? 'vehicle_latest_state';
}

/**
 * Mirrors frontend `hasFreshLiveHint` — used only to choose `fresh` vs `live`
 * within the canonical live bucket; thresholds still come from backend resolver.
 */
export function hasAiTelemetryFreshLiveHint(
  hints: AiTelemetryLiveHints | undefined,
  ageMs: number | null,
): boolean {
  if (ageMs == null || ageMs >= TELEMETRY_FRESH_THRESHOLD_MS) return false;
  if (hints?.isLiveTracking === true) return true;
  if (hints?.isFresh === true) return true;
  if (hints?.online === true || hints?.onlineStatus === 'ONLINE') return true;
  if (hints?.displayState === 'MOVING') return true;
  if (hints?.displayIgnition === 'ON') return true;
  return typeof hints?.speedKmh === 'number' && hints.speedKmh > 0;
}

function mapCanonicalFreshnessToEvidenceFreshness(
  canonical: TelemetryFreshness,
): AiEvidenceFreshness {
  switch (canonical) {
    case 'live':
      return 'live';
    case 'standby':
      return 'standby';
    case 'signal_delayed':
      return 'signal_delayed';
    case 'offline':
      return 'offline';
    case 'no_signal':
    default:
      return 'no_signal';
  }
}

function resolveSemanticsFromCanonical(
  resolved: ResolvedTelemetryFreshness,
  input: MapTelemetryToAiEvidenceInput,
): MappedTelemetryAiSemantics {
  const warnings: string[] = [];
  const source = defaultSource(input);
  const canonical = resolved.freshness;
  const evidenceFreshness = mapCanonicalFreshnessToEvidenceFreshness(canonical);
  const hasLastKnown =
    resolved.observedAtIso != null && input.lastKnownPositionAvailable !== false;
  const isHistorical = input.isHistoricalSnapshot === true;

  switch (canonical) {
    case 'live': {
      const freshHint = hasAiTelemetryFreshLiveHint(input.liveHints, resolved.ageMs);
      return {
        telemetrySemantics: freshHint ? 'fresh' : 'live',
        freshness: evidenceFreshness,
        availability: 'available',
        reasonCode: 'ok',
        observedAt: resolved.observedAtIso,
        ageMs: resolved.ageMs,
        canonicalFreshness: canonical,
        warnings,
        confidence: 'high',
        source,
      };
    }
    case 'standby': {
      if (isHistorical || (hasLastKnown && input.lastKnownPositionAvailable === true)) {
        warnings.push('presenting_last_known_while_standby');
        return {
          telemetrySemantics: 'stale',
          freshness: evidenceFreshness,
          availability: 'partial',
          reasonCode: 'stale_data',
          observedAt: resolved.observedAtIso,
          ageMs: resolved.ageMs,
          canonicalFreshness: canonical,
          warnings,
          confidence: 'medium',
          source,
        };
      }
      return {
        telemetrySemantics: 'standby',
        freshness: evidenceFreshness,
        availability: 'available',
        reasonCode: 'ok',
        observedAt: resolved.observedAtIso,
        ageMs: resolved.ageMs,
        canonicalFreshness: canonical,
        warnings,
        confidence: 'high',
        source,
      };
    }
    case 'signal_delayed': {
      if (isHistorical || input.lastKnownPositionAvailable === true) {
        warnings.push('last_known_position_while_soft_offline');
      }
      const semantics: AiEvidenceTelemetrySemantics =
        isHistorical || input.lastKnownPositionAvailable === true
          ? 'stale'
          : 'soft_offline';
      return {
        telemetrySemantics: semantics,
        freshness: evidenceFreshness,
        availability: 'partial',
        reasonCode: 'stale_data',
        observedAt: resolved.observedAtIso,
        ageMs: resolved.ageMs,
        canonicalFreshness: canonical,
        warnings,
        confidence: 'medium',
        source,
      };
    }
    case 'offline': {
      if (hasLastKnown) warnings.push('last_known_position_while_offline');
      return {
        telemetrySemantics: hasLastKnown ? 'stale' : 'offline',
        freshness: evidenceFreshness,
        availability: 'partial',
        reasonCode: 'stale_data',
        observedAt: resolved.observedAtIso,
        ageMs: resolved.ageMs,
        canonicalFreshness: canonical,
        warnings,
        confidence: 'low',
        source,
      };
    }
    case 'no_signal':
    default: {
      if (input.hasProviderLink === false) {
        warnings.push('provider_not_linked');
      }
      return {
        telemetrySemantics: 'unknown',
        freshness: evidenceFreshness,
        availability: 'unavailable',
        reasonCode: 'data_unavailable',
        observedAt: resolved.observedAtIso,
        ageMs: resolved.ageMs,
        canonicalFreshness: canonical,
        warnings,
        confidence: 'unknown',
        source,
      };
    }
  }
}

/**
 * Maps domain telemetry evidence to unified AI telemetry semantics + Evidence
 * freshness/availability. Entry point for all Fleet AI telemetry tools.
 */
export function mapTelemetryToAiEvidenceSemantics(
  input: MapTelemetryToAiEvidenceInput,
): MappedTelemetryAiSemantics {
  const source = defaultSource(input);

  if (input.permissionDenied === true) {
    return {
      telemetrySemantics: 'permission_denied',
      freshness: 'not_applicable',
      availability: 'permission_denied',
      reasonCode: 'permission_denied',
      observedAt: null,
      ageMs: null,
      canonicalFreshness: 'no_signal',
      warnings: [],
      confidence: 'unknown',
      source,
    };
  }

  if (input.signalSupported === false) {
    return {
      telemetrySemantics: 'not_supported',
      freshness: 'not_applicable',
      availability: 'unavailable',
      reasonCode: 'signal_not_supported',
      observedAt: null,
      ageMs: null,
      canonicalFreshness: 'no_signal',
      warnings: ['signal_not_applicable_for_vehicle'],
      confidence: 'unknown',
      source,
    };
  }

  if (input.providerOutage === true) {
    return {
      telemetrySemantics: 'unavailable',
      freshness: 'not_applicable',
      availability: 'unavailable',
      reasonCode: 'provider_outage',
      observedAt: null,
      ageMs: null,
      canonicalFreshness: 'no_signal',
      warnings: ['provider_temporarily_unavailable'],
      confidence: 'unknown',
      source,
    };
  }

  if (input.hasProviderLink === false) {
    const resolved = resolveTelemetryFreshness(
      input.timestampEvidence,
      input.nowMs,
    );
    return {
      telemetrySemantics: 'unavailable',
      freshness: mapCanonicalFreshnessToEvidenceFreshness(resolved.freshness),
      availability: 'unavailable',
      reasonCode: 'data_unavailable',
      observedAt: resolved.observedAtIso,
      ageMs: resolved.ageMs,
      canonicalFreshness: resolved.freshness,
      warnings: ['provider_not_linked'],
      confidence: 'low',
      source,
    };
  }

  const resolved = resolveTelemetryFreshness(input.timestampEvidence, input.nowMs);
  return resolveSemanticsFromCanonical(resolved, input);
}

/** Maps frontend dashboard `TelemetryConnectionState` labels for cross-surface docs. */
export function mapDashboardTelemetryStateToSemantics(
  dashboardState: 'live' | 'standby' | 'soft_offline' | 'offline' | 'unknown',
): AiEvidenceTelemetrySemantics {
  switch (dashboardState) {
    case 'live':
      return 'live';
    case 'standby':
      return 'standby';
    case 'soft_offline':
      return 'soft_offline';
    case 'offline':
      return 'offline';
    case 'unknown':
    default:
      return 'unknown';
  }
}

/** Maps backend canonical freshness to default AI telemetry semantics (no hints). */
export function mapCanonicalTelemetryFreshnessToSemantics(
  canonical: TelemetryFreshness,
  options?: { hasLastKnown?: boolean; isHistorical?: boolean },
): AiEvidenceTelemetrySemantics {
  const resolved: ResolvedTelemetryFreshness = {
    freshness: canonical,
    observedAtMs: canonical === 'no_signal' ? null : Date.now(),
    ageMs: canonical === 'no_signal' ? null : 0,
    observedAtIso: canonical === 'no_signal' ? null : new Date().toISOString(),
  };
  return resolveSemanticsFromCanonical(resolved, {
    tenantId: '00000000-0000-4000-8000-000000000001',
    entityId: '00000000-0000-4000-8000-000000000002',
    timestampEvidence: {},
    hasProviderLink: true,
    lastKnownPositionAvailable: options?.hasLastKnown,
    isHistoricalSnapshot: options?.isHistorical,
  }).telemetrySemantics;
}
