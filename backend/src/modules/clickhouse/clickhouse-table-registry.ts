import type {
  ClickHouseTablePlanStatus,
} from './clickhouse-diagnostics.types';

export interface ClickHouseTableRegistryEntry {
  table: string;
  planStatus: ClickHouseTablePlanStatus;
  purpose: string;
  writeProducer: string | null;
  readConsumers: string[];
  notes: string;
}

/**
 * Authoritative registry of ClickHouse analytics tables vs codebase producers.
 * Status values are derived from this registry + runtime config — not guessed.
 */
export const CLICKHOUSE_TABLE_REGISTRY: ClickHouseTableRegistryEntry[] = [
  {
    table: 'telemetry_snapshots',
    planStatus: 'active',
    purpose: 'DIMO snapshot mirror (~30s poll cycle)',
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
    planStatus: 'active',
    purpose: 'Derived ignition/motion transitions for segment detectors',
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
    planStatus: 'active_if_hf_enabled',
    purpose: 'Post-trip normalized HF signal points (analytics mirror)',
    writeProducer:
      'ClickHouseHfService.insertHfPoints ← HfMirrorService ← TripBehaviorEnrichmentService (HF_MIRROR_ENABLED)',
    readConsumers: ['ClickHouseHfService', 'DataAnalyseService'],
    notes: 'Producer inactive when HF_MIRROR_ENABLED=false (default).',
  },
  {
    table: 'telemetry_hf_events',
    planStatus: 'active_if_hf_enabled',
    purpose: 'Post-trip derived abuse/HF events mirror',
    writeProducer:
      'ClickHouseHfService.insertHfEvents ← HfMirrorService ← TripBehaviorEnrichmentService (HF_MIRROR_ENABLED)',
    readConsumers: ['ClickHouseHfService', 'DataAnalyseService'],
    notes: 'ReplacingMergeTree — re-insert safe. Gated by HF_MIRROR_ENABLED.',
  },
  {
    table: 'telemetry_waypoints',
    planStatus: 'read_only_no_producer',
    purpose: 'Route replay waypoint stream (planned HF/GPS mirror)',
    writeProducer: null,
    readConsumers: ['DataAnalyseService (counts/intervals only)'],
    notes:
      'Schema + migration 004 exist; no insert producer in codebase yet. Empty table is expected — not a broken pipeline.',
  },
  {
    table: 'trip_activity_windows',
    planStatus: 'planned_no_producer',
    purpose: 'Analytical activity window summaries (cache)',
    writeProducer: null,
    readConsumers: [],
    notes:
      'Migration 001 only. ActivityWindowDetector reads telemetry_snapshots directly — does not persist here.',
  },
  {
    table: 'trip_segment_candidates',
    planStatus: 'planned_no_producer',
    purpose: 'Cached ignition segment repair candidates',
    writeProducer: null,
    readConsumers: [],
    notes:
      'Migration 001 only. IgnitionSegmentDetector queries telemetry_state_changes live — no writer.',
  },
  {
    table: 'telemetry_hf_windows',
    planStatus: 'planned_no_producer',
    purpose: 'Aggregated HF windows to avoid scanning raw points',
    writeProducer: null,
    readConsumers: [],
    notes: 'Migration 003 only — future aggregation layer; no producer yet.',
  },
  {
    table: 'schema_migrations',
    planStatus: 'internal',
    purpose: 'ClickHouse schema migration tracking',
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
