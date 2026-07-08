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
    readConsumers: ['ClickHouseHfService', 'DataAnalyseService'],
    notes: 'Producer inactive when HF_MIRROR_ENABLED=false (default).',
  },
  {
    table: 'telemetry_hf_events',
    purpose: 'Post-trip derived abuse/HF events mirror',
    futureUseCase: 'HF event timeline in Data Analyse / future trip detail',
    producerStatus: 'active_if_hf_enabled',
    mvpStatus: 'active',
    expectedEmptyAllowed: true,
    writeProducer:
      'ClickHouseHfService.insertHfEvents ← HfMirrorService ← TripBehaviorEnrichmentService (HF_MIRROR_ENABLED)',
    readConsumers: ['ClickHouseHfService', 'DataAnalyseService'],
    notes: 'ReplacingMergeTree — re-insert safe. Gated by HF_MIRROR_ENABLED.',
  },
  {
    table: 'telemetry_waypoints',
    purpose: 'Route replay waypoint stream (HF/GPS mirror)',
    futureUseCase: 'Trip route replay, launch detection geometry, map overlays',
    producerStatus: 'read_only_no_producer',
    mvpStatus: 'planned',
    expectedEmptyAllowed: true,
    writeProducer: null,
    readConsumers: ['DataAnalyseService (counts/intervals only — read path exists)'],
    notes:
      'Schema + migration 004 exist; no insert producer in codebase yet. Empty is expected — read-only/debug counts only.',
  },
  {
    table: 'trip_activity_windows',
    purpose: 'Analytical activity window summaries (cache)',
    futureUseCase: 'Persist ActivityWindowDetector outputs for repair audit trail',
    producerStatus: 'planned_no_producer',
    mvpStatus: 'planned',
    expectedEmptyAllowed: true,
    writeProducer: null,
    readConsumers: [],
    notes:
      'Migration 001 only. ActivityWindowDetector reads telemetry_snapshots directly — does not persist here yet.',
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
    purpose: 'Aggregated HF windows to avoid scanning raw points',
    futureUseCase: 'Pre-aggregated HF KPIs for trip detail / monitoring',
    producerStatus: 'planned_no_producer',
    mvpStatus: 'planned',
    expectedEmptyAllowed: true,
    writeProducer: null,
    readConsumers: [],
    notes: 'Migration 003 only — future aggregation layer; no producer yet.',
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
