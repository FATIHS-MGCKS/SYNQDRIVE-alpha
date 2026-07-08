import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';
import { ClickHouseAnalyticsService } from './clickhouse-analytics.service';
import type { ClickHouseTableStorageStat } from './clickhouse-analytics.service';
import {
  isHfMirrorEnabled,
  resolveHfMirrorFlagStatus,
} from './clickhouse-env.util';
import { CLICKHOUSE_TABLE_REGISTRY } from './clickhouse-table-registry';
import type {
  ClickHouseDiagnosticsDto,
  ClickHouseTableDataStatus,
  ClickHouseTableDiagnosticDto,
  ClickHouseTableDisplayStatus,
} from './clickhouse-diagnostics.types';
import type { ClickHouseTableRegistryEntry } from './clickhouse-table-registry';

export interface BuildTableDiagnosticsInput {
  clickhouseConfigured: boolean;
  clickhouseAvailable: boolean;
  hfMirrorEnabled: boolean;
  storageByTable: Map<string, ClickHouseTableStorageStat>;
}

/**
 * Pure builder — unit-tested without Nest/ClickHouse I/O.
 */
export function buildTableDiagnostics(
  input: BuildTableDiagnosticsInput,
): ClickHouseTableDiagnosticDto[] {
  return CLICKHOUSE_TABLE_REGISTRY.map((entry) =>
    buildOneTableDiagnostic(entry, input),
  );
}

function buildOneTableDiagnostic(
  entry: ClickHouseTableRegistryEntry,
  input: BuildTableDiagnosticsInput,
): ClickHouseTableDiagnosticDto {
  const storage = input.storageByTable.get(entry.table);
  const dataStatus = resolveDataStatus(input.clickhouseAvailable, storage);
  const displayStatus = resolveDisplayStatus(
    entry.planStatus,
    dataStatus,
    input.hfMirrorEnabled,
    input.clickhouseAvailable,
  );

  const notes = [entry.notes];
  if (!input.clickhouseAvailable) {
    notes.push('ClickHouse unreachable or disabled — row counts unavailable.');
  } else if (entry.planStatus === 'planned_no_producer' && dataStatus === 'empty') {
    notes.push('Empty is expected — no write producer registered.');
  } else if (entry.planStatus === 'read_only_no_producer' && dataStatus === 'empty') {
    notes.push('Empty is expected — read-only schema; no insert path in codebase.');
  } else if (
    entry.planStatus === 'active_if_hf_enabled' &&
    !input.hfMirrorEnabled
  ) {
    notes.push('HF_MIRROR_ENABLED=false — mirror producer is intentionally off.');
  } else if (
    entry.planStatus === 'active' &&
    dataStatus === 'empty' &&
    input.clickhouseAvailable
  ) {
    notes.push(
      'Producer active but no rows yet — check DIMO snapshot worker and CLICKHOUSE_URL.',
    );
  }

  return {
    table: entry.table,
    planStatus: entry.planStatus,
    displayStatus,
    dataStatus,
    rowCount: storage?.rowCount ?? null,
    lastEventAt: storage?.newestRecordAt ?? null,
    writeProducer: entry.writeProducer,
    readConsumers: entry.readConsumers,
    purpose: entry.purpose,
    notes: notes.join(' '),
  };
}

function resolveDataStatus(
  clickhouseAvailable: boolean,
  storage: ClickHouseTableStorageStat | undefined,
): ClickHouseTableDataStatus {
  if (!clickhouseAvailable) return 'unavailable';
  if (!storage) return 'unknown';
  return storage.rowCount > 0 ? 'has_data' : 'empty';
}

function resolveDisplayStatus(
  planStatus: ClickHouseTableRegistryEntry['planStatus'],
  dataStatus: ClickHouseTableDataStatus,
  hfMirrorEnabled: boolean,
  clickhouseAvailable: boolean,
): ClickHouseTableDisplayStatus {
  if (!clickhouseAvailable) return 'unavailable';

  if (planStatus === 'internal') return 'internal';
  if (planStatus === 'planned_no_producer') return 'planned_no_producer';
  if (planStatus === 'read_only_no_producer') return 'read_only_no_producer';

  if (planStatus === 'active_if_hf_enabled') {
    if (!hfMirrorEnabled) return 'active_if_hf_disabled';
    return dataStatus === 'has_data' ? 'has_data' : 'active_if_hf_enabled';
  }

  if (planStatus === 'active') {
    return dataStatus === 'has_data' ? 'has_data' : 'empty';
  }

  return 'active';
}

function buildLastMirrorWriteAt(
  tables: ClickHouseTableDiagnosticDto[],
): Record<string, string | null> {
  const mirrorTables = [
    'telemetry_snapshots',
    'telemetry_state_changes',
    'telemetry_hf_points',
    'telemetry_hf_events',
  ];
  const out: Record<string, string | null> = {};
  for (const name of mirrorTables) {
    const row = tables.find((t) => t.table === name);
    out[name] = row?.lastEventAt ?? null;
  }
  return out;
}

/**
 * ClickHouseDiagnosticsService
 *
 * Reusable read-only diagnostics for internal ops/debug surfaces (Data Analyse
 * today; Monitoring / Vehicle Detail later). Never throws — degrades cleanly.
 */
@Injectable()
export class ClickHouseDiagnosticsService {
  private readonly logger = new Logger(ClickHouseDiagnosticsService.name);

  constructor(
    private readonly clickHouse: ClickHouseService,
    private readonly analytics: ClickHouseAnalyticsService,
  ) {}

  async getDiagnostics(): Promise<ClickHouseDiagnosticsDto> {
    const status = this.clickHouse.getStatus();
    const hfMirrorEnabled = isHfMirrorEnabled();
    const hfMirrorStatus = resolveHfMirrorFlagStatus();
    const notes: string[] = [
      'Temporary internal diagnostics — not canonical business truth.',
    ];

    let storageByTable = new Map<string, ClickHouseTableStorageStat>();
    if (status.available) {
      try {
        const storage = await this.analytics.getStorageStats();
        if (storage) {
          storageByTable = new Map(storage.tables.map((t) => [t.table, t]));
        } else {
          notes.push('Storage stats unavailable (best-effort query returned null).');
        }
      } catch (err: unknown) {
        this.logger.warn(
          `ClickHouse storage stats failed: ${(err as Error).message}`,
        );
        notes.push('Storage stats query failed — table row counts may be unknown.');
      }
    } else if (!status.configured) {
      notes.push('CLICKHOUSE_URL not set — analytics mirror disabled.');
    } else {
      notes.push('ClickHouse configured but not reachable (degraded).');
    }

    const tables = buildTableDiagnostics({
      clickhouseConfigured: status.configured,
      clickhouseAvailable: status.available,
      hfMirrorEnabled,
      storageByTable,
    });

    const degraded =
      status.configured &&
      (status.status === 'degraded' || status.status === 'schema_error');

    if (degraded) {
      notes.push(`Operational status: ${status.status}.`);
    }

    return {
      purpose: 'temporary_internal_debug',
      clickhouseConfigured: status.configured,
      clickhouseAvailable: status.available,
      clickhouseStatus: status.status,
      degraded,
      hfMirrorEnabled,
      hfMirrorStatus,
      schemaMigrations: {
        appliedCount: status.appliedMigrationCount,
        pendingCount: status.pendingMigrationCount,
        lastInitAt: status.lastSchemaInitAt,
        lastError: status.lastSchemaError,
      },
      lastMirrorWriteAt: buildLastMirrorWriteAt(tables),
      tables,
      notes,
    };
  }
}
