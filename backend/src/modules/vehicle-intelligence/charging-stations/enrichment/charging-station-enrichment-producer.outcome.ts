export type ChargingStationEnrichmentEnqueueOutcome =
  | { status: 'enqueued'; jobId: string }
  | { status: 'deduped'; jobId: string }
  | { status: 'skipped'; jobId: null; reason: string }
  | { status: 'terminal_skip'; jobId: null; reason: string }
  | { status: 'deferred_queue_unavailable'; jobId: null };
