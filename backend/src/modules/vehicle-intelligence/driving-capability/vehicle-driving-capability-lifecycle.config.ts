import { DIMO_PREFLIGHT_MIN_INTERVAL_MS } from './dimo-preflight-classifier.config';

/** Lifecycle contract version — bump when refresh semantics change. */
export const CAPABILITY_LIFECYCLE_VERSION = 'capability-lifecycle-v1';

/** Default periodic refresh — same floor as P29 preflight (7 days, not 30s). */
export const CAPABILITY_PERIODIC_REFRESH_MS = DIMO_PREFLIGHT_MIN_INTERVAL_MS;

/** Shorter retry after repeated signal loss or provider DEGRADED — still not aggressive. */
export const CAPABILITY_DEGRADED_RETRY_MS = 24 * 60 * 60 * 1000;

/** Minimum interval after a signal reappears before another inventory preflight. */
export const CAPABILITY_SIGNAL_REAPPEARED_RETRY_MS = 24 * 60 * 60 * 1000;

/** Consecutive refreshes observing loss before SIGNAL_LOSS_RETRY is scheduled. */
export const CAPABILITY_SIGNAL_LOSS_STREAK_THRESHOLD = 2;

/** Max audit entries stored per capability row metadata. */
export const CAPABILITY_STATUS_HISTORY_LIMIT = 8;
