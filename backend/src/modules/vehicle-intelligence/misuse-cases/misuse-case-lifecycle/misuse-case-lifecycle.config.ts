/** Lifecycle contract version — bump when status/eligibility semantics change. */
export const MISUSE_CASE_LIFECYCLE_VERSION = 'misuse-case-lifecycle-v1';

/** Statuses set only by manual operator action — never by telemetry upsert. */
export const MANUAL_ONLY_STATUSES = new Set([
  'CONFIRMED',
  'DISMISSED',
  'RESOLVED',
] as const);

/** Terminal statuses — telemetry reprocessing must not reopen without explicit downgrade. */
export const TERMINAL_STATUSES = new Set([
  'CONFIRMED',
  'DISMISSED',
  'RESOLVED',
  'SUPERSEDED',
  'NOT_ASSESSABLE',
] as const);
