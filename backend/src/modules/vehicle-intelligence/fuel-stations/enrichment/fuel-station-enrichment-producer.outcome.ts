export type FuelStationEnrichmentEnqueueStatus =
  | 'enqueued'
  | 'deduped'
  | 'deferred_queue_unavailable'
  | 'terminal_skip'
  | 'skipped';

export interface FuelStationEnrichmentEnqueueOutcome {
  status: FuelStationEnrichmentEnqueueStatus;
  jobId: string | null;
  reason?: string;
}
