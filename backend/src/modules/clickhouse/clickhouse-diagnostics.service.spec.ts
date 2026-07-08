import type { ClickHouseTableStorageStat } from './clickhouse-analytics.service';
import { buildTableDiagnostics } from './clickhouse-diagnostics.service';
import { CLICKHOUSE_TABLE_REGISTRY } from './clickhouse-table-registry';

describe('ClickHouseDiagnosticsService — table registry matrix', () => {
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

  it('marks planned_no_producer empties as planned — not errors', () => {
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
    const planned = tables.filter((t) => t.producerStatus === 'planned_no_producer');
    expect(planned).toHaveLength(3);
    for (const row of planned) {
      expect(row.displayStatus).toBe('planned');
      expect(row.mvpStatus).toBe('planned');
      expect(row.expectedEmptyAllowed).toBe(true);
      expect(row.notes).toMatch(/producer not active yet/i);
    }
  });

  it('marks telemetry_waypoints as read_only planned — empty allowed', () => {
    const tables = buildTableDiagnostics({
      clickhouseConfigured: true,
      clickhouseAvailable: true,
      hfMirrorEnabled: false,
      storageByTable: new Map([['telemetry_waypoints', storage('telemetry_waypoints', 0)]]),
    });
    const wp = tables.find((t) => t.table === 'telemetry_waypoints');
    expect(wp?.displayStatus).toBe('read_only');
    expect(wp?.mvpStatus).toBe('planned');
    expect(wp?.expectedEmptyAllowed).toBe(true);
  });

  it('warns on empty active producer tables when empty not expected', () => {
    const tables = buildTableDiagnostics({
      clickhouseConfigured: true,
      clickhouseAvailable: true,
      hfMirrorEnabled: false,
      storageByTable: new Map([
        ['telemetry_snapshots', storage('telemetry_snapshots', 0)],
      ]),
    });
    const snap = tables.find((t) => t.table === 'telemetry_snapshots');
    expect(snap?.displayStatus).toBe('empty_active_warning');
    expect(snap?.notes).toMatch(/Producer active but no rows/i);
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

  it('marks HF tables disabled when HF_MIRROR_ENABLED=false', () => {
    const tables = buildTableDiagnostics({
      clickhouseConfigured: true,
      clickhouseAvailable: true,
      hfMirrorEnabled: false,
      storageByTable: new Map([
        ['telemetry_hf_points', storage('telemetry_hf_points', 0)],
      ]),
    });
    const hf = tables.find((t) => t.table === 'telemetry_hf_points');
    expect(hf?.displayStatus).toBe('active_if_hf_disabled');
  });
});
