import type { ClickHouseTableRegistryEntry } from './clickhouse-table-registry.types';

/**
 * Authoritative registry of ClickHouse analytics tables vs codebase producers.
 * Status values are derived from this registry + runtime config — not guessed.
 */
export const CLICKHOUSE_TABLE_REGISTRY: ClickHouseTableRegistryEntry[] = [
  {
    table: 'telemetry_snapshots',
    purpose: 'DIMO snapshot mirror (~30s poll cycle)',
    futureUseCase: 'Trip repair, activity windows, Data Analyse cadence stats',
    producerStatus: 'active',
    mvpStatus: 'active',
    expectedEmptyAllowed: false,
    writeProducer:
      'ClickHouseTelemetryService.insertSnapshot ← DimoSnapshotProcessor',
    readConsumers: [
      'ClickHouseAnalyticsService.summarizeActivityWindow',
      'DataAnalyseService',
      'ActivityWindowDetector',
    ],
    notes: 'Best-effort fire-and-forget mirror after PostgreSQL vehicle_latest_states upsert.',
  },
  {
    table: 'telemetry_state_changes',
    purpose: 'Derived ignition/motion transitions for segment detectors',
    futureUseCase: 'Ignition/motion segment repair scans',
    producerStatus: 'active',
    mvpStatus: 'active',
    expectedEmptyAllowed: false,
    writeProducer:
      'ClickHouseTelemetryService.detectAndInsertStateChanges ← DimoSnapshotProcessor',
    readConsumers: [
      'ClickHouseAnalyticsService.findIgnitionSegments',
      'ClickHouseAnalyticsService.findMotionSegments',
      'IgnitionSegmentDetector',
      'MotionSegmentDetector',
    ],
    notes: 'Written on snapshot ingest when previous state is available.',
  },
  {
    table: 'telemetry_hf_points',
    purpose: 'Post-trip normalized HF signal points (analytics mirror)',
    futureUseCase: 'HF availability, signal frequency, Data Analyse HF tab',
    producerStatus: 'active_if_hf_enabled',
    mvpStatus: 'active',
    expectedEmptyAllowed: true,
    writeProducer:
      'ClickHouseHfService.insertHfPoints ← HfMirrorService ← TripBehaviorEnrichmentService (HF_MIRROR_ENABLED)',
    readConsumers: [
      'ClickHouseHfService',
      'DataAnalyseService',
      'SignalQualityReadService',
      'TripEvidenceReadService',
    ],
    notes:
      'Producer inactive when HF_MIRROR_ENABLED=false (default). Does not affect canonical trip scores.',
  },
  {
    table: 'telemetry_hf_events',
    purpose: 'Post-trip derived abuse/HF events mirror',
    futureUseCase: 'HF event timeline in Data Analyse / trip detail evidence',
    producerStatus: 'active_if_hf_enabled',
    mvpStatus: 'active',
    expectedEmptyAllowed: true,
    writeProducer:
      'ClickHouseHfService.insertHfEvents ← HfMirrorService ← TripBehaviorEnrichmentService (HF_MIRROR_ENABLED)',
    readConsumers: [
      'ClickHouseHfService',
      'DataAnalyseService',
      'TripEvidenceReadService',
    ],
    notes: 'ReplacingMergeTree — re-insert safe. Gated by HF_MIRROR_ENABLED.',
  },
  {
    table: 'telemetry_waypoints',
    purpose: 'Post-trip route waypoint mirror (downsampled)',
    futureUseCase: 'Route replay evidence, launch detection geometry',
    producerStatus: 'active_if_waypoint_mirror_enabled',
    mvpStatus: 'active',
    expectedEmptyAllowed: true,
    writeProducer:
      'ClickHouseWaypointsService ← WaypointMirrorService ← TripChEvidenceMirrorCoordinator (WAYPOINT_MIRROR_ENABLED)',
    readConsumers: ['DataAnalyseService', 'TripEvidenceReadService'],
    notes:
      'Post-trip only from PG vehicle_trip_waypoints — never live-map flood. Default off (WAYPOINT_MIRROR_ENABLED).',
  },
  {
    table: 'trip_activity_windows',
    purpose: 'Post-trip analytical activity window summaries',
    futureUseCase: 'Repair audit trail; complements on-the-fly ActivityWindowDetector',
    producerStatus: 'active_if_activity_window_mirror_enabled',
    mvpStatus: 'active',
    expectedEmptyAllowed: true,
    writeProducer:
      'ClickHouseActivityWindowsService ← ActivityWindowProducerService ← TripChEvidenceMirrorCoordinator (ACTIVITY_WINDOW_MIRROR_ENABLED)',
    readConsumers: ['DataAnalyseService'],
    notes:
      'Evidence-only cache. Live detector still reads telemetry_snapshots. Default off.',
  },
  {
    table: 'trip_segment_candidates',
    purpose: 'Cached ignition segment repair candidates',
    futureUseCase: 'Persist IgnitionSegmentDetector repair candidates without re-scan',
    producerStatus: 'planned_no_producer',
    mvpStatus: 'planned',
    expectedEmptyAllowed: true,
    writeProducer: null,
    readConsumers: [],
    notes:
      'Migration 001 only. IgnitionSegmentDetector queries telemetry_state_changes live — no writer yet.',
  },
  {
    table: 'telemetry_hf_windows',
    purpose: 'Aggregated HF windows (30s buckets) for signal quality evidence',
    futureUseCase: 'Trip detail signal quality without scanning raw HF points',
    producerStatus: 'active_if_hf_enabled',
    mvpStatus: 'active',
    expectedEmptyAllowed: true,
    writeProducer:
      'ClickHouseHfService.insertHfWindows ← HfMirrorService ← TripBehaviorEnrichmentService (HF_MIRROR_ENABLED)',
    readConsumers: ['SignalQualityReadService', 'TripEvidenceReadService', 'DataAnalyseService'],
    notes:
      'Post-trip aggregation mirror. Gated by HF_MIRROR_ENABLED. Does not write final misuse/score verdicts.',
  },
  {
    table: 'schema_migrations',
    purpose: 'ClickHouse schema migration tracking',
    futureUseCase: null,
    producerStatus: 'internal',
    mvpStatus: 'internal',
    expectedEmptyAllowed: true,
    writeProducer: 'ClickHouseSchemaService',
    readConsumers: ['ClickHouseSchemaService'],
    notes: 'Internal ops table — not business analytics data.',
  },
];

export function getClickHouseTableRegistryEntry(
  table: string,
): ClickHouseTableRegistryEntry | undefined {
  return CLICKHOUSE_TABLE_REGISTRY.find((e) => e.table === table);
}
