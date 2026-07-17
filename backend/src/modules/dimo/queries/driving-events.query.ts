/**
 * DIMO Telemetry API — Vehicle Events Query (LTE_R1 driving-events path)
 *
 * Historical note (IMPORTANT):
 * Prior versions of this file built a `signals(... safetySystemBraking* ...)`
 * query. Those signal fields do **not** exist on DIMO's `SignalAggregations`
 * type and DIMO responded with HTTP 422 "Cannot query field" — silently
 * swallowed by the caller, which is why zero DrivingEvent rows were ever
 * persisted for any LTE_R1 vehicle.
 *
 * Canonical source — discovered via `telemetry_introspect`:
 *   Query.events(tokenId, from, to, filter): [Event!]
 *   type Event { timestamp: Time!  name: String!  source: String!
 *                durationNs: Int!   metadata: String }
 *
 * Observed event names on real LTE_R1 vehicles (verified against VW Golf 2026,
 * tokenId 189118):
 *   - behavior.harshBraking
 *   - behavior.extremeBraking
 *   - behavior.harshAcceleration
 *   - behavior.harshCornering
 *
 * Additionally requested (DIMO emits these on some vehicles/firmwares; the
 * server-side `name { in: [...] }` filter simply returns nothing for names a
 * given vehicle never produces, so listing them is safe and never 422s):
 *   - behavior.extremeAcceleration       → mapped to HARSH_ACCELERATION (classification EXTREME)
 *   - behavior.extremeEmergency          → mapped to EXTREME_BRAKING
 *   - behavior.extremeEmergencyBraking   → mapped to EXTREME_BRAKING
 *
 * `metadata` is a JSON string, typically `{"counterValue": 1}`. `source` is
 * the DIMO connection (LTE R1 device) wallet address.
 *
 * Mapping to SynqDrive DrivingEventType is handled in
 * LteR1BehaviorEnrichmentService.normalizeEventName (case-insensitive,
 * prefix-tolerant).
 */

/** One record as returned by DIMO's `events(...)` root query. */
export interface DimoVehicleEventRecord {
  /** ISO timestamp of the event (device wall-clock). */
  timestamp: string;
  /** Canonical DIMO event name, e.g. `behavior.harshBraking`. */
  name: string;
  /** DIMO connection address that emitted the event (wallet of the device). */
  source: string;
  /** Event duration in nanoseconds (usually 0 for instantaneous events). */
  durationNs: number;
  /** Raw metadata JSON string (e.g. `{"counterValue":1}`). */
  metadata: string | null;
}

/**
 * Build a GraphQL query that returns all `behavior.*` events for a vehicle
 * in the given time window.
 *
 * The DIMO `events(...)` query supports server-side filtering via
 * `EventFilter { name: StringValueFilter, source: StringValueFilter, ... }`.
 * We restrict to `behavior.*` names to keep payloads small and to avoid
 * other event families (e.g. ignition transitions) that SynqDrive does not
 * map to DrivingEvent rows.
 */
export function buildDrivingEventsQuery(
  tokenId: number,
  from: Date,
  to: Date,
): string {
  return buildDimoEventsQuery(tokenId, from, to, [
    'behavior.harshBraking',
    'behavior.extremeBraking',
    'behavior.harshAcceleration',
    'behavior.extremeAcceleration',
    'behavior.harshCornering',
    'behavior.extremeEmergency',
    'behavior.extremeEmergencyBraking',
  ]);
}

/**
 * Safety-family DIMO events (e.g. collision). Kept separate from behavior.*
 * driving events — NOT mapped to DrivingEventType rows.
 */
export function buildSafetyEventsQuery(
  tokenId: number,
  from: Date,
  to: Date,
): string {
  return buildDimoEventsQuery(tokenId, from, to, ['safety.collision']);
}

function buildDimoEventsQuery(
  tokenId: number,
  from: Date,
  to: Date,
  names: string[],
): string {
  const namesJson = names.map((n) => `"${n}"`).join(', ');
  return `
    query DimoEvents {
      events(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        filter: { name: { in: [${namesJson}] } }
      ) {
        timestamp
        name
        source
        durationNs
        metadata
      }
    }
  `.trim();
}

/** Capability preflight via official DIMO dataSummary.eventDataSummary. */
export function buildEventDataSummaryQuery(tokenId: number): string {
  return `
    query DimoEventDataSummary {
      dataSummary(tokenId: ${tokenId}) {
        eventDataSummary {
          name
          numberOfEvents
          firstSeen
          lastSeen
        }
      }
    }
  `.trim();
}
