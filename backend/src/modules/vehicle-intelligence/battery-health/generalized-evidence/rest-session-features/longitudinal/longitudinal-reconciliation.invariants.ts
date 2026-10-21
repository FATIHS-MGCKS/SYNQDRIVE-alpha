export const LONGITUDINAL_RECONCILIATION_INVARIANT_TYPES = [
  'VEHICLE_ORGANIZATION_MISMATCH',
] as const;

export type LongitudinalReconciliationInvariantType =
  (typeof LONGITUDINAL_RECONCILIATION_INVARIANT_TYPES)[number];

/** Typed reconciliation safety violation — fail-closed; never inferred from logs. */
export class LongitudinalReconciliationInvariantViolationError extends Error {
  readonly code: LongitudinalReconciliationInvariantType;

  constructor(code: LongitudinalReconciliationInvariantType) {
    super(`LongitudinalReconciliationInvariantViolation:${code}`);
    this.name = 'LongitudinalReconciliationInvariantViolationError';
    this.code = code;
  }
}
