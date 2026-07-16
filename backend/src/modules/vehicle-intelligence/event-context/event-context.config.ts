/** Versioned context model — one durable job per event × model version (P26). */
export const EVENT_CONTEXT_MODEL_VERSION = '2026-07-16.1';

/** Only enrich native events recorded within this lookback (days). */
export const EVENT_CONTEXT_HISTORICAL_WINDOW_DAYS = 90;

/** Max parallel context job enqueues per trip fan-out. */
export const EVENT_CONTEXT_FANOUT_CONCURRENCY = 5;

/** BullMQ / worker retry attempts for per-event context jobs. */
export const EVENT_CONTEXT_JOB_MAX_ATTEMPTS = 3;
