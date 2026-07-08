import type { ClickHouseOverallStatus } from './clickhouse.service';

export type ClickHouseTablePlanStatus =
  | 'active'
  | 'active_if_hf_enabled'
  | 'read_only_no_producer'
  | 'planned_no_producer'
  | 'internal';

export type ClickHouseTableDataStatus =
  | 'has_data'
  | 'empty'
  | 'unavailable'
  | 'unknown';

/**
 * Operator-facing table status for internal diagnostics surfaces.
 * Combines registry plan + runtime data without treating planned empties as errors.
 */
export type ClickHouseTableDisplayStatus =
  | 'active'
  | 'active_if_hf_enabled'
  | 'active_if_hf_disabled'
  | 'read_only_no_producer'
  | 'planned_no_producer'
  | 'internal'
  | 'unavailable'
  | 'empty'
  | 'has_data';

export interface ClickHouseTableDiagnosticDto {
  table: string;
  planStatus: ClickHouseTablePlanStatus;
  displayStatus: ClickHouseTableDisplayStatus;
  dataStatus: ClickHouseTableDataStatus;
  rowCount: number | null;
  lastEventAt: string | null;
  writeProducer: string | null;
  readConsumers: string[];
  purpose: string;
  notes: string;
}

export interface ClickHouseSchemaMigrationsDiagnosticDto {
  appliedCount: number | null;
  pendingCount: number | null;
  lastInitAt: string | null;
  lastError: string | null;
}

export interface ClickHouseDiagnosticsDto {
  /** Marks this payload as internal debug — not a customer product contract. */
  purpose: 'temporary_internal_debug';
  clickhouseConfigured: boolean;
  clickhouseAvailable: boolean;
  clickhouseStatus: ClickHouseOverallStatus;
  degraded: boolean;
  hfMirrorEnabled: boolean;
  hfMirrorStatus: 'enabled' | 'disabled' | 'unknown';
  schemaMigrations: ClickHouseSchemaMigrationsDiagnosticDto;
  /** Newest event timestamp per mirror table (from system.parts metadata). */
  lastMirrorWriteAt: Record<string, string | null>;
  tables: ClickHouseTableDiagnosticDto[];
  notes: string[];
}
