/** DRIVING_MISUSE_RECONCILE contract version — bump when reconcile semantics change (P52). */
export const MISUSE_CASE_RECONCILE_VERSION = 'misuse-case-reconcile-v1';

export const MISUSE_RECONCILE_RESOLUTION_REASON =
  'Reconciliation — Evidence entfallen';

export const MISUSE_RECONCILE_CONFIRMED_PRESERVE_REASON =
  'CONFIRMED — automatische Bewertung unterdrückt';

/** Statuses eligible for automatic resolution when absent from reconcile output. */
export const RECONCILE_RESOLVABLE_STATUSES = [
  'CANDIDATE',
  'ACTIVE',
  'REVIEW_REQUIRED',
] as const;
