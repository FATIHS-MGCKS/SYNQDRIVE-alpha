/**
 * ClickHouse table producer / MVP classification — analytics mirror only.
 * PostgreSQL remains canonical; empty planned tables are not pipeline errors.
 */

export type ClickHouseMvpStatus =
  | 'active'
  | 'planned'
  | 'internal'
  | 'experimental';

/** How the codebase treats the table's write producer today. */
export type ClickHouseProducerStatus =
  | 'active'
  | 'active_if_hf_enabled'
  | 'read_only_no_producer'
  | 'planned_no_producer'
  | 'internal';

/** UI/diagnostics display bucket derived from registry + runtime data. */
export type ClickHouseTableDisplayStatus =
  | 'has_data'
  | 'empty'
  | 'empty_active_warning'
  | 'unavailable'
  | 'planned'
  | 'read_only'
  | 'active_if_hf_disabled'
  | 'active_if_hf_enabled'
  | 'internal';

export type ClickHouseTableDataStatus =
  | 'has_data'
  | 'empty'
  | 'unknown'
  | 'unavailable';

export interface ClickHouseTableRegistryEntry {
  table: string;
  purpose: string;
  /** Short label for future product use (debug surfaces only). */
  futureUseCase: string | null;
  producerStatus: ClickHouseProducerStatus;
  mvpStatus: ClickHouseMvpStatus;
  /** Empty table is expected today — not a broken pipeline. */
  expectedEmptyAllowed: boolean;
  writeProducer: string | null;
  readConsumers: string[];
  notes: string;
}
