/**
 * TRIP LIFECYCLE OWNERSHIP INVARIANTS
 *
 * This module documents and enforces the canonical trip truth ownership rules
 * for the SynqDrive platform. Import these constants anywhere you need to
 * reference the ownership model explicitly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RULE 1 — SOLE CREATOR
 *   Only `TripDecisionEngine.createTrip()` and `TripDecisionEngine.createRepairedTrip()`
 *   may call `prisma.vehicleTrip.create()`.
 *   No other service, processor, or module may create a VehicleTrip record.
 *
 * RULE 2 — SOLE LIFECYCLE WRITER
 *   Only `TripDecisionEngine` methods may change `vehicleTrip.tripStatus`.
 *   Permitted transitions and their owning methods:
 *     ONGOING   → (created)   : createTrip() / createRepairedTrip()
 *     ONGOING   → COMPLETED   : finalizeTrip() / finalizeRepairedTrip()
 *     ONGOING   → CANCELLED   : discardTrip()
 *     COMPLETED → ONGOING     : reopenTripForMerge()
 *   No other code path may perform these transitions.
 *
 * RULE 3 — ENRICHMENT WRITES ARE SEPARATE
 *   Enrichment services (TripEnrichmentOrchestratorService, TripBehaviorEnrichmentService,
 *   LteR1BehaviorEnrichmentService, TripsService) MAY update non-lifecycle fields:
 *     - behaviorEnrichmentStatus
 *     - hardBrakingCount, hardAccelerationCount, etc.
 *     - startLatitude, startLongitude, endLatitude, endLongitude
 *     - distanceKm, durationMinutes, avgSpeedKmh, maxSpeedKmh
 *     - outsideTemperatureStartC, citySharePercent, etc.
 *   These are enrichment fields and do NOT change the trip lifecycle status.
 *
 * RULE 4 — DETECTORS NEVER WRITE
 *   All TripDetector implementations must return DetectorFinding objects only.
 *   No detector may call prisma directly or modify any trip state.
 *
 * RULE 5 — REPAIR LAYER IS NOT A SECOND LIVE ENGINE
 *   TripReconciliationService and TripRepairService may propose and apply
 *   corrections, but must route all actual trip lifecycle mutations through
 *   TripDecisionEngine. The repair layer is a safety net, not a truth source.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VIOLATION DETECTION
 *   If you see `prisma.vehicleTrip.create()` outside TripDecisionEngine → VIOLATION.
 *   If you see `tripStatus:` inside a vehicleTrip.update() outside TripDecisionEngine → VIOLATION.
 *   Report violations during code review; do not introduce workarounds.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const TRIP_OWNERSHIP = {
  /**
   * The canonical service that owns all trip lifecycle mutations.
   * Used in log messages and error context to identify the authority.
   */
  LIFECYCLE_OWNER: 'TripDecisionEngine',

  /**
   * The only allowed sources of trip truth in vehicle_trips.trip_source.
   */
  SOURCES: {
    V2_LIVE: 'V2_LIVE',
    REPAIRED: 'REPAIRED',
  },

  /**
   * The only allowed lifecycle statuses for vehicle_trips.trip_status.
   */
  STATUSES: {
    ONGOING: 'ONGOING',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  },

  /**
   * Fields that are owned by the lifecycle layer (TripDecisionEngine only).
   * No other service may update these.
   */
  LIFECYCLE_FIELDS: [
    'tripStatus',
    'tripSource',
    'isRepaired',
    'mergeParentTripId',
  ] as const,

  /**
   * Fields that enrichment services may update freely.
   * Adding a field here documents that it is enrichment-owned, not lifecycle-owned.
   */
  ENRICHMENT_FIELDS: [
    'behaviorEnrichmentStatus',
    'behaviorEnrichmentStartedAt',
    'behaviorEnrichmentAttempts',
    'behaviorEnrichmentError',
    'hardBrakingCount',
    'hardAccelerationCount',
    'harshBrakeCount',
    'harshAccelCount',
    'harshCornerCount',
    'abuseEventCount',
    'accelerationEventCount',
    'brakingEventCount',
    'fullBrakingCount',
    'possibleImpactCount',
    'kickdownCount',
    'coldEngineAbuseCount',
    'longIdleCount',
    'abuseScore',
    'behaviorSummaryJson',
    'behaviorEnrichedAt',
    'startLatitude',
    'startLongitude',
    'endLatitude',
    'endLongitude',
    'distanceKm',
    'durationMinutes',
    'avgSpeedKmh',
    'maxSpeedKmh',
    'outsideTemperatureStartC',
    'citySharePercent',
    'highwaySharePercent',
    'countrySharePercent',
    'routeTrackingStartedAt',
  ] as const,
} as const;

export type TripLifecycleField = (typeof TRIP_OWNERSHIP.LIFECYCLE_FIELDS)[number];
export type TripEnrichmentField = (typeof TRIP_OWNERSHIP.ENRICHMENT_FIELDS)[number];
