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

  const baseInput = {
    clickhouseConfigured: true,
    clickhouseAvailable: true,
    hfMirrorEnabled: false,
    waypointMirrorEnabled: false,
    activityWindowMirrorEnabled: false,
    storageByTable: new Map<string, ClickHouseTableStorageStat>(),
  };

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
      ...baseInput,
      storageByTable: new Map(
        ['trip_segment_candidates'].map((t) => [t, storage(t, 0)]),
      ),
    });
    const planned = tables.filter((t) => t.producerStatus === 'planned_no_producer');
    expect(planned).toHaveLength(1);
    for (const row of planned) {
      expect(row.displayStatus).toBe('planned');
      expect(row.expectedEmptyAllowed).toBe(true);
    }
  });

  it('marks optional mirror tables as disabled when flags off', () => {
    const tables = buildTableDiagnostics({
      ...baseInput,
      storageByTable: new Map([
        ['telemetry_hf_points', storage('telemetry_hf_points', 0)],
        ['telemetry_waypoints', storage('telemetry_waypoints', 0)],
        ['trip_activity_windows', storage('trip_activity_windows', 0)],
      ]),
    });
    expect(tables.find((t) => t.table === 'telemetry_hf_points')?.displayStatus).toBe(
      'active_if_mirror_disabled',
    );
    expect(tables.find((t) => t.table === 'telemetry_waypoints')?.displayStatus).toBe(
      'active_if_mirror_disabled',
    );
    expect(tables.find((t) => t.table === 'trip_activity_windows')?.displayStatus).toBe(
      'active_if_mirror_disabled',
    );
  });

  it('warns on empty active producer tables when empty not expected', () => {
    const tables = buildTableDiagnostics({
      ...baseInput,
      storageByTable: new Map([
        ['telemetry_snapshots', storage('telemetry_snapshots', 0)],
      ]),
    });
    const snap = tables.find((t) => t.table === 'telemetry_snapshots');
    expect(snap?.displayStatus).toBe('empty_active_warning');
    expect(snap?.notes).toMatch(/Producer active but no rows/i);
  });
});
