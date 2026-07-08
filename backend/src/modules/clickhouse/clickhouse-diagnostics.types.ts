import type {
  ClickHouseMvpStatus,
  ClickHouseProducerStatus,
  ClickHouseTableDataStatus,
  ClickHouseTableDisplayStatus,
} from './clickhouse-table-registry.types';

export type ClickHouseOverallStatus =
  | 'disabled'
  | 'available'
  | 'degraded'
  | 'schema_error';

export interface ClickHouseTableDiagnosticDto {
  table: string;
  purpose: string;
  futureUseCase: string | null;
  producerStatus: ClickHouseProducerStatus;
  mvpStatus: ClickHouseMvpStatus;
  expectedEmptyAllowed: boolean;
  displayStatus: ClickHouseTableDisplayStatus;
  dataStatus: ClickHouseTableDataStatus;
  rowCount: number | null;
  lastEventAt: string | null;
  writeProducer: string | null;
  readConsumers: string[];
  notes: string;
}

export interface ClickHouseDiagnosticsDto {
  purpose: 'temporary_internal_debug';
  clickhouseConfigured: boolean;
  clickhouseAvailable: boolean;
  clickhouseStatus: ClickHouseOverallStatus;
  degraded: boolean;
  hfMirrorEnabled: boolean;
  hfMirrorStatus: 'enabled' | 'disabled' | 'unknown';
  schemaMigrations: {
    appliedCount: number | null;
    pendingCount: number | null;
    lastInitAt: string | null;
    lastError: string | null;
  };
  lastMirrorWriteAt: Record<string, string | null>;
  tables: ClickHouseTableDiagnosticDto[];
  notes: string[];
}
