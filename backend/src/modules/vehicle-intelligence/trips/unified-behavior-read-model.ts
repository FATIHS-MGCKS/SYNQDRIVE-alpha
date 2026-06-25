/**
 * SynqDrive — Unified Trip Behaviour Read-Model (Phase 4)
 *
 * Single, explainable read-model that merges the two physical event stores into
 * one UI list WITHOUT creating a "second truth":
 *
 *   - DrivingEvent      (native DIMO Telemetry API events — LTE_R1 path)
 *   - TripBehaviorEvent (HF-reconstructed accel/braking/abuse events)
 *
 * Why this module exists
 * ----------------------
 * The Abuse/KPI counters on VehicleTrip are written by the enrichment pipeline.
 * On the LTE_R1 path the abuse KPI is:
 *     abuseEvents = (#HF abuse events) + (#native EXTREME_BRAKING)
 * i.e. native `behavior.extremeBraking` contributes to the abuse KPI. Until now
 * the detail read-model surfaced that native event only as a BRAKING/EXTREME row
 * with no abuse marker, so a trip could read "Missbrauchsverdacht" in its KPI
 * while the event list showed nothing abuse-relevant. This module makes the
 * contribution explainable: every event carries `abuseRelevant` + `abuseCategory`
 * + `abuseReason`, mirroring exactly what the counters count.
 *
 * Pure & deterministic — no DB access, no side effects — so it can be unit tested
 * and reused. The controller only does the DB reads and passes rows in.
 */

// ── Provenance / detection metadata ──────────────────────────────────────────

/** Where the event physically came from. */
export type EventProvenance = 'NATIVE' | 'RECONSTRUCTED';

/** Native DIMO events are deduped preferentially within this window. */
export const DEDUP_WINDOW_MS = 5_000;

/**
 * Native DrivingEventType → UI behaviour category. Mirrors the categories used
 * by HF-derived TripBehaviorEvent rows so both streams share one filter axis.
 */
export const DRIVING_EVENT_CATEGORY_MAP: Record<string, string> = {
  HARSH_BRAKING: 'BRAKING',
  EXTREME_BRAKING: 'BRAKING',
  HARSH_ACCELERATION: 'ACCELERATION',
  HARSH_CORNERING: 'ACCELERATION',
  SPEEDING: 'ABUSE',
  IDLE_EXCESSIVE: 'ABUSE',
};

/** Fallback classification when a native event has no stored classification. */
export const DRIVING_EVENT_CLASSIFICATION_MAP: Record<string, string> = {
  HARSH_BRAKING: 'HARD',
  EXTREME_BRAKING: 'EXTREME',
  HARSH_ACCELERATION: 'HARD',
  HARSH_CORNERING: 'MODERATE',
  SPEEDING: 'WARNING',
  IDLE_EXCESSIVE: 'LIGHT',
};

// ── Abuse-relevance vocabulary ───────────────────────────────────────────────
// Category strings intentionally reuse the MisuseCaseType / MisuseCaseCategory
// vocabulary so the abuse-relevance shown in Trip Detail speaks the same language
// as the Misuse Cases panel.

export interface AbuseRelevance {
  abuseRelevant: boolean;
  abuseCategory: string | null;
  abuseReason: string | null;
}

const NOT_ABUSE: AbuseRelevance = {
  abuseRelevant: false,
  abuseCategory: null,
  abuseReason: null,
};

/**
 * Native DrivingEvent abuse relevance.
 *
 * IMPORTANT — must mirror the KPI contribution in
 * trip-behavior-enrichment.service.ts: on the LTE_R1 path ONLY
 * `EXTREME_BRAKING` feeds the abuse KPI (`dimoAbuseContribution`). Normal harsh
 * braking / harsh acceleration / harsh cornering are NOT abuse — flagging them
 * would over-claim and break the "counted == visible" invariant.
 *
 * Native extreme acceleration is persisted as HARSH_ACCELERATION with
 * classification EXTREME and is surfaced as a severe acceleration, but it does
 * NOT feed the abuse KPI, so it is intentionally not abuse-flagged here.
 */
export function deriveNativeAbuseRelevance(eventType: string): AbuseRelevance {
  if (eventType === 'EXTREME_BRAKING') {
    return {
      abuseRelevant: true,
      abuseCategory: 'BRAKE_ABUSE_PATTERN',
      abuseReason:
        'Natives DIMO-Extrembremsereignis — zählt in die Abuse-KPI dieses Trips.',
    };
  }
  return NOT_ABUSE;
}

/** HF abuse eventType → misuse category vocabulary. */
const DERIVED_ABUSE_CATEGORY: Record<string, string> = {
  FULL_BRAKING: 'BRAKE_ABUSE_PATTERN',
  POSSIBLE_IMPACT: 'POSSIBLE_COLLISION_OR_IMPACT',
  COLD_ENGINE_HIGH_RPM: 'COLD_ENGINE_ABUSE',
  COLD_ENGINE_FULL_THROTTLE: 'COLD_ENGINE_ABUSE',
  ENGINE_REV_IN_IDLE: 'REPEATED_ENGINE_REV_IN_IDLE',
  HIGH_RPM_CONSTANT: 'AGGRESSIVE_DRIVING_PATTERN',
  KICKDOWN: 'AGGRESSIVE_DRIVING_PATTERN',
  LAUNCH_LIKE_START: 'LAUNCH_ABUSE_PATTERN',
  OVERHEATING_ENGINE: 'OVERHEATING_DAMAGE_RISK',
  LONG_IDLE: 'USAGE_ANOMALY',
  ENGINE_SHUTDOWN_WHILE_DRIVING: 'TECHNICAL_RISK',
};

/**
 * HF-derived (reconstructed) abuse relevance. Every TripBehaviorEvent in the
 * ABUSE category contributes to the abuse KPI (`abuseEvents = allAbuse.length`),
 * so all of them are abuse-relevant. Accel/braking-category HF events are not.
 */
export function deriveDerivedAbuseRelevance(
  eventCategory: string,
  eventType: string,
): AbuseRelevance {
  if (eventCategory !== 'ABUSE') return NOT_ABUSE;
  return {
    abuseRelevant: true,
    abuseCategory: DERIVED_ABUSE_CATEGORY[eventType] ?? 'AGGRESSIVE_DRIVING_PATTERN',
    abuseReason: `Aus 1s-Hochfrequenzdaten rekonstruiertes Missbrauchsereignis (${eventType}) — zählt in die Abuse-KPI dieses Trips.`,
  };
}

// ── Row input shapes (subset of Prisma rows the read-model actually reads) ────

export interface DrivingEventRow {
  id: string;
  organizationId: string | null;
  vehicleId: string;
  tripId: string | null;
  eventType: string;
  severity: number | null;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  deltaKmh: number | null;
  durationMs: number | null;
  metadataJson: unknown;
  recordedAt: Date;
  createdAt: Date;
}

export interface BehaviorEventRow {
  id: string;
  organizationId: string | null;
  vehicleId: string;
  tripId: string;
  eventCategory: string;
  eventType: string;
  classification: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  peakValue: number | null;
  peakValueUnit: string | null;
  peakG: number | null;
  maxThrottlePos: number | null;
  maxEngineRpm: number | null;
  maxCoolantTemp: number | null;
  metadataJson: unknown;
  createdAt: Date;
}

export interface UnifiedBehaviorEvent {
  id: string;
  organizationId: string | null;
  vehicleId: string;
  tripId: string;
  eventCategory: string;
  eventType: string;
  classification: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  peakValue: number | null;
  peakValueUnit: string | null;
  peakG: number | null;
  maxThrottlePos: number | null;
  maxEngineRpm: number | null;
  maxCoolantTemp: number | null;
  latitude: number | null;
  longitude: number | null;
  metadataJson: unknown;
  createdAt: Date;
  // ── Unified provenance ──
  source: 'DRIVING_EVENT' | 'BEHAVIOR_EVENT';
  provenance: EventProvenance;
  detectionMethod: string;
  confidence: 'low' | 'medium' | 'high' | string;
  requiredSignals: string[];
  // Native original event identity (only present for native DIMO events).
  originalEventName: string | null;
  originalEventSource: string | null;
  // ── Abuse relevance (explains the KPI contribution) ──
  abuseRelevant: boolean;
  abuseCategory: string | null;
  abuseReason: string | null;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

/** Map a native DrivingEvent row into the unified shape. */
export function mapDrivingEventRow(
  de: DrivingEventRow,
  fallbackTripId: string,
): UnifiedBehaviorEvent {
  const meta = (de.metadataJson as Record<string, unknown> | null) ?? {};
  const classification =
    (typeof meta.classification === 'string' && meta.classification) ||
    DRIVING_EVENT_CLASSIFICATION_MAP[de.eventType] ||
    'MODERATE';
  const abuse = deriveNativeAbuseRelevance(de.eventType);
  const peakG =
    de.deltaKmh != null
      ? Math.abs(de.deltaKmh / 3.6 / Math.max(0.5, (de.durationMs ?? 1000) / 1000)) / 9.81
      : null;

  return {
    id: de.id,
    organizationId: de.organizationId,
    vehicleId: de.vehicleId,
    tripId: de.tripId ?? fallbackTripId,
    eventCategory: DRIVING_EVENT_CATEGORY_MAP[de.eventType] ?? 'ACCELERATION',
    eventType: de.eventType,
    classification,
    startedAt: de.recordedAt,
    endedAt: null,
    durationMs: de.durationMs,
    startSpeedKmh: de.speedKmh,
    endSpeedKmh: null,
    peakValue: de.deltaKmh ?? de.severity,
    peakValueUnit: de.deltaKmh != null ? 'km/h delta' : 'severity',
    peakG,
    maxThrottlePos: typeof meta.throttlePct === 'number' ? meta.throttlePct : null,
    maxEngineRpm: typeof meta.rpm === 'number' ? meta.rpm : null,
    maxCoolantTemp: typeof meta.coolantC === 'number' ? meta.coolantC : null,
    latitude: de.latitude,
    longitude: de.longitude,
    metadataJson: de.metadataJson,
    createdAt: de.createdAt,
    // Native DIMO Telemetry API events are authoritative ("nativ").
    source: 'DRIVING_EVENT',
    provenance: 'NATIVE',
    detectionMethod: 'DIMO_TELEMETRY_EVENT',
    confidence: 'high',
    requiredSignals: [],
    originalEventName:
      typeof meta.dimoEventName === 'string' ? meta.dimoEventName : null,
    originalEventSource:
      typeof meta.dimoEventSource === 'string' ? meta.dimoEventSource : null,
    ...abuse,
  };
}

/** Map an HF-derived TripBehaviorEvent row into the unified shape. */
export function mapBehaviorEventRow(e: BehaviorEventRow): UnifiedBehaviorEvent {
  const meta = (e.metadataJson as Record<string, unknown> | null) ?? {};
  const abuse = deriveDerivedAbuseRelevance(e.eventCategory, e.eventType);
  return {
    id: e.id,
    organizationId: e.organizationId,
    vehicleId: e.vehicleId,
    tripId: e.tripId,
    eventCategory: e.eventCategory,
    eventType: e.eventType,
    classification: e.classification,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    durationMs: e.durationMs,
    startSpeedKmh: e.startSpeedKmh,
    endSpeedKmh: e.endSpeedKmh,
    peakValue: e.peakValue,
    peakValueUnit: e.peakValueUnit,
    peakG: e.peakG,
    maxThrottlePos: e.maxThrottlePos,
    maxEngineRpm: e.maxEngineRpm,
    maxCoolantTemp: e.maxCoolantTemp,
    latitude: null,
    longitude: null,
    metadataJson: e.metadataJson,
    createdAt: e.createdAt,
    source: 'BEHAVIOR_EVENT',
    provenance: 'RECONSTRUCTED',
    detectionMethod:
      typeof meta.detectionMethod === 'string' ? meta.detectionMethod : 'HF_RECONSTRUCTION',
    confidence: typeof meta.confidence === 'string' ? meta.confidence : 'medium',
    requiredSignals: Array.isArray(meta.requiredSignals)
      ? (meta.requiredSignals as string[])
      : [],
    originalEventName: null,
    originalEventSource: null,
    ...abuse,
  };
}

// ── Merge + native-preferred dedup ───────────────────────────────────────────

/**
 * Build the unified, deduped, time-sorted behaviour event list.
 *
 * Dedup rules (task 5):
 *   - Native events are PREFERRED. When a native event and an HF-reconstructed
 *     event share the SAME category within DEDUP_WINDOW_MS, the reconstructed
 *     duplicate is dropped (the native one wins).
 *   - Dedup is category-scoped, so different event types are NEVER merged
 *     together (e.g. native BRAKING never suppresses an HF ABUSE event — abuse
 *     events have no native equivalent and are always preserved).
 */
export function buildUnifiedBehaviorEvents(input: {
  behaviorEvents: BehaviorEventRow[];
  drivingEvents: DrivingEventRow[];
  tripId: string;
}): UnifiedBehaviorEvent[] {
  const mappedDriving = input.drivingEvents.map((de) =>
    mapDrivingEventRow(de, input.tripId),
  );

  const nativeKeys = mappedDriving.map((de) => ({
    category: de.eventCategory,
    t: de.startedAt.getTime(),
  }));
  const collidesWithNative = (category: string, startedAt: Date): boolean =>
    nativeKeys.some(
      (n) =>
        n.category === category &&
        Math.abs(n.t - startedAt.getTime()) <= DEDUP_WINDOW_MS,
    );

  const mappedBehavior = input.behaviorEvents
    .filter((e) => !collidesWithNative(e.eventCategory, e.startedAt))
    .map((e) => mapBehaviorEventRow(e));

  const merged = [...mappedBehavior, ...mappedDriving];
  merged.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  return merged;
}
