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

/** @deprecated Use TIMESTAMP_BUCKET_MS — kept for callers/tests referencing the old window. */
export const DEDUP_WINDOW_MS = 5_000;

/** Incident bucket for visible dedupe (±2s grouping). */
export const TIMESTAMP_BUCKET_MS = 2_000;

const CLASSIFICATION_RANK: Record<string, number> = {
  LIGHT: 1,
  MODERATE: 2,
  WARNING: 3,
  HARD: 4,
  SEVERE: 5,
  EXTREME: 6,
  CRITICAL: 7,
};

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
  SAFETY_COLLISION: 'ABUSE',
  UNMAPPED_PROVIDER_EVENT: 'ABUSE',
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

/** Legacy ingest snapshot from native event metadata — not T±30s context analysis. */
export interface LegacyIngestEvidence {
  rpm: number | null;
  throttlePct: number | null;
  coolantC: number | null;
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
  // Phase 3: per-event Context Assessment (T±30s engine-signal window). Only
  // present for native LTE_R1/ICE events that were context-enriched; null
  // otherwise. Mirrors metadataJson.contextAssessment for first-class access.
  contextAssessment: unknown | null;
  /** Point-in-time legacy ingest values — kept for backward compatibility. */
  legacyIngestEvidence: LegacyIngestEvidence | null;
  // ── Abuse relevance (explains the KPI contribution) ──
  abuseRelevant: boolean;
  abuseCategory: string | null;
  abuseReason: string | null;
}

function extractLegacyIngestEvidence(
  meta: Record<string, unknown>,
): LegacyIngestEvidence | null {
  const rpm = typeof meta.rpm === 'number' ? meta.rpm : null;
  const throttlePct = typeof meta.throttlePct === 'number' ? meta.throttlePct : null;
  const coolantC = typeof meta.coolantC === 'number' ? meta.coolantC : null;
  if (rpm == null && throttlePct == null && coolantC == null) return null;
  return { rpm, throttlePct, coolantC };
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
    // Legacy ingest snapshot — retained on row fields for backward compatibility.
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
    contextAssessment:
      meta.contextAssessment !== undefined ? meta.contextAssessment : null,
    legacyIngestEvidence: extractLegacyIngestEvidence(meta),
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
    contextAssessment: null,
    legacyIngestEvidence: null,
    ...abuse,
  };
}

/** Stable exact key: same timestamp + type + source → one row (intra-source). */
export function behaviorEventDedupeKey(event: UnifiedBehaviorEvent): string {
  return `${event.startedAt.getTime()}:${event.eventType}:${event.source}`;
}

export function classificationRank(classification: string): number {
  return CLASSIFICATION_RANK[classification.toUpperCase()] ?? 0;
}

/**
 * Canonical incident type for cross-source dedupe. Native harsh/extreme braking
 * share `braking` so HF BRAKING duplicates collapse onto the native row.
 */
export function normalizeDedupeEventType(event: UnifiedBehaviorEvent): string {
  if (event.provenance === 'NATIVE') {
    switch (event.eventType) {
      case 'HARSH_BRAKING':
      case 'EXTREME_BRAKING':
        return 'braking';
      case 'HARSH_ACCELERATION':
        return 'acceleration';
      case 'HARSH_CORNERING':
        return 'cornering';
      case 'SPEEDING':
        return 'abuse:speeding';
      case 'IDLE_EXCESSIVE':
        return 'abuse:idle';
      case 'SAFETY_COLLISION':
        return 'damage:collision_or_impact';
      default:
        return `native:${event.eventType.toLowerCase()}`;
    }
  }
  if (event.eventCategory === 'BRAKING') return 'braking';
  if (event.eventCategory === 'ACCELERATION') return 'acceleration';
  if (event.eventCategory === 'ABUSE') {
    if (event.eventType === 'POSSIBLE_IMPACT') return 'damage:collision_or_impact';
    return `abuse:${event.eventType.toLowerCase()}`;
  }
  return `derived:${event.eventCategory}:${event.eventType}`.toLowerCase();
}

/** Floor timestamp into 2s grid index (used with sliding-window merge). */
export function incidentBucketMs(timestampMs: number): number {
  return Math.floor(timestampMs / TIMESTAMP_BUCKET_MS) * TIMESTAMP_BUCKET_MS;
}

/**
 * Visible incident key: trip + bucket + normalized type.
 * Context classifications are annotations — they never widen the key.
 */
export function visibleIncidentDedupeKey(
  tripId: string,
  event: UnifiedBehaviorEvent,
): string {
  const bucket = incidentBucketMs(event.startedAt.getTime());
  const normType = normalizeDedupeEventType(event);
  return `${tripId}|${bucket}|${normType}`;
}

function mergeContextAssessment(a: unknown, b: unknown): unknown {
  if (!a) return b;
  if (!b) return a;
  const ta = a as Record<string, unknown>;
  const tb = b as Record<string, unknown>;
  const classesA = Array.isArray(ta.classifications) ? (ta.classifications as string[]) : [];
  const classesB = Array.isArray(tb.classifications) ? (tb.classifications as string[]) : [];
  const mergedClasses = [...new Set([...classesA, ...classesB])];
  const pickRicher = <T>(va: T | undefined, vb: T | undefined): T | undefined => {
    if (va === 'INSUFFICIENT' || va === 'INSUFFICIENT_CONTEXT') return vb ?? va;
    if (vb === 'INSUFFICIENT' || vb === 'INSUFFICIENT_CONTEXT') return va ?? vb;
    return va ?? vb;
  };
  return {
    ...ta,
    ...tb,
    classifications:
      mergedClasses.length > 0 ? mergedClasses : (ta.classifications ?? tb.classifications),
    confidence: pickRicher(
      ta.confidence as string | undefined,
      tb.confidence as string | undefined,
    ),
    evidenceGrade: pickRicher(
      ta.evidenceGrade as string | undefined,
      tb.evidenceGrade as string | undefined,
    ),
  };
}

function pickPreferredEvent(
  current: UnifiedBehaviorEvent,
  candidate: UnifiedBehaviorEvent,
): UnifiedBehaviorEvent {
  const currentNative = current.provenance === 'NATIVE';
  const candidateNative = candidate.provenance === 'NATIVE';
  if (candidateNative && !currentNative) return candidate;
  if (currentNative && !candidateNative) return current;

  const currentHasContext = current.contextAssessment != null;
  const candidateHasContext = candidate.contextAssessment != null;
  const currentRank = classificationRank(current.classification);
  const candidateRank = classificationRank(candidate.classification);

  let winner: UnifiedBehaviorEvent;
  let loser: UnifiedBehaviorEvent;
  if (candidateRank > currentRank) {
    winner = candidate;
    loser = current;
  } else if (candidateRank < currentRank) {
    winner = current;
    loser = candidate;
  } else if (candidateHasContext && !currentHasContext) {
    winner = candidate;
    loser = current;
  } else if (currentHasContext && !candidateHasContext) {
    winner = current;
    loser = candidate;
  } else {
    winner = current.createdAt >= candidate.createdAt ? current : candidate;
    loser = winner === current ? candidate : current;
  }

  if (
    classificationRank(loser.classification) > classificationRank(winner.classification)
  ) {
    winner = { ...winner, classification: loser.classification };
  }

  if (loser.contextAssessment) {
    winner = {
      ...winner,
      contextAssessment: mergeContextAssessment(
        winner.contextAssessment,
        loser.contextAssessment,
      ),
    };
  }

  return winner;
}

/**
 * Drop duplicate visible rows. Rules:
 *   - Group by tripId + ±2s bucket + normalizedEventType
 *   - Native preferred over reconstructed at the same incident
 *   - Higher classification severity wins when provenance matches
 *   - contextAssessment classifications merge onto one row (never extra rows)
 */
export function dedupeUnifiedBehaviorEvents(
  events: UnifiedBehaviorEvent[],
  _tripId?: string,
): UnifiedBehaviorEvent[] {
  const sorted = [...events].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );
  const merged: UnifiedBehaviorEvent[] = [];

  for (const event of sorted) {
    const normType = normalizeDedupeEventType(event);
    const t = event.startedAt.getTime();
    let mergedInto = false;

    for (let i = merged.length - 1; i >= 0; i -= 1) {
      const existing = merged[i];
      if (normalizeDedupeEventType(existing) !== normType) continue;
      if (Math.abs(existing.startedAt.getTime() - t) > TIMESTAMP_BUCKET_MS) break;
      merged[i] = pickPreferredEvent(existing, event);
      mergedInto = true;
      break;
    }

    if (!mergedInto) merged.push(event);
  }

  return merged;
}

/** Visible event count for trip/day summaries — length of deduped list. */
export function countVisibleUnifiedBehaviorEvents(
  events: UnifiedBehaviorEvent[],
): number {
  return events.length;
}

/**
 * Build the unified, deduped, time-sorted behaviour event list.
 *
 * Dedup rules:
 *   - All native + HF rows are mapped, then collapsed by incident bucket (±2s)
 *     + normalizedEventType within the trip.
 *   - Native events are PREFERRED over HF-reconstructed duplicates.
 *   - Higher classification severity wins when provenance matches.
 *   - contextAssessment classifications are merged as annotations — never
 *     separate visible rows.
 */
export function buildUnifiedBehaviorEvents(input: {
  behaviorEvents: BehaviorEventRow[];
  drivingEvents: DrivingEventRow[];
  tripId: string;
}): UnifiedBehaviorEvent[] {
  const mappedDriving = input.drivingEvents.map((de) =>
    mapDrivingEventRow(de, input.tripId),
  );
  const mappedBehavior = input.behaviorEvents.map((e) => mapBehaviorEventRow(e));
  return dedupeUnifiedBehaviorEvents(
    [...mappedDriving, ...mappedBehavior],
    input.tripId,
  );
}
