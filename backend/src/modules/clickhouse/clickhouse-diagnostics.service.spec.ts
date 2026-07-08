import type { ClickHouseTableStorageStat } from './clickhouse-analytics.service';
import { buildTableDiagnostics } from './clickhouse-diagnostics.service';
import { CLICKHOUSE_TABLE_REGISTRY } from './clickhouse-table-registry';

describe('ClickHouseDiagnosticsService — table matrix', () => {
  const storage = (
    table: string,
    rowCount: number,
    newest: string | null = '2026-07-08 10:00:00',
  ): ClickHouseTableStorageStat => ({
    table,
    rowCount,
    compressedBytes: 0,
    uncompressedBytes: 0,
    oldestRecordAt: null,
    newestRecordAt: newest,
  });

  it('classifies all registry tables', () => {
    expect(CLICKHOUSE_TABLE_REGISTRY.map((t) => t.table)).toEqual([
      'telemetry_snapshots',
      'telemetry_state_changes',
      'telemetry_hf_points',
      'telemetry_hf_events',
      'telemetry_waypoints',
      'trip_activity_windows',
      'trip_segment_candidates',
      'telemetry_hf_windows',
      'schema_migrations',
    ]);
  });

  it('marks tables unavailable when ClickHouse is down', () => {
    const tables = buildTableDiagnostics({
      clickhouseConfigured: true,
      clickhouseAvailable: false,
      hfMirrorEnabled: false,
      storageByTable: new Map(),
    });
    expect(tables.every((t) => t.dataStatus === 'unavailable')).toBe(true);
    expect(tables.every((t) => t.displayStatus === 'unavailable')).toBe(true);
  });

  it('does not treat planned_no_producer empties as active errors', () => {
    const tables = buildTableDiagnostics({
      clickhouseConfigured: true,
      clickhouseAvailable: true,
      hfMirrorEnabled: false,
      storageByTable: new Map(
        [
          'trip_activity_windows',
          'trip_segment_candidates',
          'telemetry_hf_windows',
        ].map((t) => [t, storage(t, 0)]),
      ),
    });
    const planned = tables.filter((t) => t.planStatus === 'planned_no_producer');
    expect(planned.length).toBe(3);
    for (const row of planned) {
      expect(row.displayStatus).toBe('planned_no_producer');
      expect(row.dataStatus).toBe('empty');
      expect(row.notes).toMatch(/expected|no write producer/i);
    }
  });

  it('marks HF tables as disabled when HF_MIRROR_ENABLED=false', () => {
    const tables = buildTableDiagnostics({
      clickhouseConfigured: true,
      clickhouseAvailable: true,
      hfMirrorEnabled: false,
      storageByTable: new Map([
        ['telemetry_hf_points', storage('telemetry_hf_points', 0)],
        ['telemetry_hf_events', storage('telemetry_hf_events', 0)],
      ]),
    });
    const hf = tables.filter((t) => t.planStatus === 'active_if_hf_enabled');
    expect(hf.every((t) => t.displayStatus === 'active_if_hf_disabled')).toBe(
      true,
    );
  });

  it('marks HF tables as has_data when mirror enabled and rows exist', () => {
    const tables = buildTableDiagnostics({
      clickhouseConfigured: true,
      clickhouseAvailable: true,
      hfMirrorEnabled: true,
      storageByTable: new Map([
        ['telemetry_hf_points', storage('telemetry_hf_points', 120)],
      ]),
    });
    const points = tables.find((t) => t.table === 'telemetry_hf_points');
    expect(points?.displayStatus).toBe('has_data');
    expect(points?.dataStatus).toBe('has_data');
  });

  it('marks active snapshot tables with data', () => {
    const tables = buildTableDiagnostics({
      clickhouseConfigured: true,
      clickhouseAvailable: true,
      hfMirrorEnabled: false,
      storageByTable: new Map([
        ['telemetry_snapshots', storage('telemetry_snapshots', 500)],
      ]),
    });
    const snap = tables.find((t) => t.table === 'telemetry_snapshots');
    expect(snap?.displayStatus).toBe('has_data');
    expect(snap?.planStatus).toBe('active');
  });
});
