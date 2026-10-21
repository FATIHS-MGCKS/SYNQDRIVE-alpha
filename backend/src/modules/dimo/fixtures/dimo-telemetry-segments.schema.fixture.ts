/**
 * Committed DIMO Telemetry `segments` query contract (live schema, 2026-08).
 *
 * Source: docs/audits/trip-enrichment-driver-score-energy-events-audit-2026-08.md
 * Regression commit: 79e381069 — invalid `id`, `limit`, `after` on Segment.
 *
 * This fixture is used by CI to validate GraphQL query builders — not merely
 * substring mocks against hand-written expectations.
 */

/** Arguments supported on `segments(...)` per live DIMO Telemetry schema. */
export const DIMO_SEGMENTS_SUPPORTED_ARGUMENTS = [
  'tokenId',
  'from',
  'to',
  'mechanism',
  'signalRequests',
  'config',
  'signalFilter',
] as const;

/** Fields that MUST NOT appear in Segment selection sets (HTTP 422). */
export const DIMO_SEGMENT_FORBIDDEN_SELECTION_FIELDS = ['id'] as const;

/** Arguments that MUST NOT be passed to `segments(...)` (HTTP 422). */
export const DIMO_SEGMENTS_FORBIDDEN_ARGUMENTS = ['limit', 'after'] as const;

/** Minimum fields required on a valid energy-event segment selection. */
export const DIMO_SEGMENT_REQUIRED_SELECTION_FIELDS = [
  'start',
  'end',
  'duration',
  'isOngoing',
  'startedBeforeRange',
  'signals',
] as const;

/** Live Segment.signals selection — `agg` is not returned at selection time. */
export const DIMO_SEGMENT_SIGNALS_SELECTION_FIELDS = ['name', 'value'] as const;
