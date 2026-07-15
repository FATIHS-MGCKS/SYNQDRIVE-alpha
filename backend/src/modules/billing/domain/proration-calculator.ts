import { BillingBillableVehicleAssignmentStatus } from '@prisma/client';
import { NON_BILLABLE_ASSIGNMENT_REASON_CODES } from './billable-vehicle-policy';

export const ProrationErrorCode = {
  INVALID_PERIOD: 'INVALID_PERIOD',
  NEGATIVE_ACTIVE_WINDOW: 'NEGATIVE_ACTIVE_WINDOW',
} as const;

export interface ProrationAssignmentInput {
  vehicleId: string;
  assignmentId: string;
  billableFrom: Date;
  billableUntil: Date | null;
  status: BillingBillableVehicleAssignmentStatus;
  reasonCode?: string | null;
}

export interface ProrationPeriodWindow {
  periodStart: Date;
  /** Exclusive period boundary. */
  periodEnd: Date;
}

export interface ProrationLineDetail {
  vehicleId: string;
  assignmentId: string;
  periodStart: Date;
  periodEnd: Date;
  activeFrom: Date;
  activeUntil: Date;
  activeMs: number;
  periodMs: number;
  prorationFactorBps: number;
  proratedUnitMicros: number;
  amountCents: number | null;
}

export interface ProrationCalculationInput {
  period: ProrationPeriodWindow;
  assignments: ProrationAssignmentInput[];
  unitPriceCents?: number | null;
}

export interface ProrationCalculationResult {
  periodMs: number;
  lines: ProrationLineDetail[];
  totalActiveMs: number;
  totalProratedUnitMicros: number;
  proratedBillableQuantity: number;
  proratedSubtotalCents: number | null;
}

export interface QuantityEventValidationInput {
  period: ProrationPeriodWindow;
  ledgerQuantityAtPeriodEnd: number;
  proratedBillableQuantity: number;
  retroactiveEventCount: number;
}

export interface QuantityEventValidationResult {
  valid: boolean;
  ledgerQuantityAtPeriodEnd: number;
  proratedBillableQuantity: number;
  quantityDelta: number;
  retroactiveEventCount: number;
  warnings: string[];
}

function isBillableAssignment(assignment: ProrationAssignmentInput): boolean {
  if (assignment.status === BillingBillableVehicleAssignmentStatus.ENDED) {
    return false;
  }
  if (assignment.status === BillingBillableVehicleAssignmentStatus.EXCLUDED) {
    if (
      assignment.reasonCode &&
      NON_BILLABLE_ASSIGNMENT_REASON_CODES.has(assignment.reasonCode)
    ) {
      return false;
    }
  }
  return assignment.status === BillingBillableVehicleAssignmentStatus.ACTIVE;
}

function intersectAssignmentWindow(
  assignment: ProrationAssignmentInput,
  period: ProrationPeriodWindow,
): { activeFrom: Date; activeUntil: Date } | null {
  if (!isBillableAssignment(assignment)) {
    return null;
  }

  const activeFromMs = Math.max(assignment.billableFrom.getTime(), period.periodStart.getTime());
  const activeUntilMs = Math.min(
    assignment.billableUntil?.getTime() ?? period.periodEnd.getTime(),
    period.periodEnd.getTime(),
  );

  if (activeUntilMs <= activeFromMs) {
    return null;
  }

  return {
    activeFrom: new Date(activeFromMs),
    activeUntil: new Date(activeUntilMs),
  };
}

export function calculateProration(input: ProrationCalculationInput): ProrationCalculationResult {
  const periodMs = input.period.periodEnd.getTime() - input.period.periodStart.getTime();
  if (periodMs <= 0) {
    throw new Error(ProrationErrorCode.INVALID_PERIOD);
  }

  const lines: ProrationLineDetail[] = [];
  let totalActiveMs = 0;
  let totalProratedUnitMicros = 0;
  let proratedSubtotalCents = input.unitPriceCents != null ? 0 : null;

  for (const assignment of input.assignments) {
    const window = intersectAssignmentWindow(assignment, input.period);
    if (!window) continue;

    const activeMs = window.activeUntil.getTime() - window.activeFrom.getTime();
    if (activeMs <= 0) continue;

    const prorationFactorBps = Math.floor((activeMs * 10_000) / periodMs);
    const proratedUnitMicros = Math.round((activeMs * 1_000_000) / periodMs);
    const amountCents =
      input.unitPriceCents != null
        ? Math.round((input.unitPriceCents * activeMs) / periodMs)
        : null;

    lines.push({
      vehicleId: assignment.vehicleId,
      assignmentId: assignment.assignmentId,
      periodStart: input.period.periodStart,
      periodEnd: input.period.periodEnd,
      activeFrom: window.activeFrom,
      activeUntil: window.activeUntil,
      activeMs,
      periodMs,
      prorationFactorBps,
      proratedUnitMicros,
      amountCents,
    });

    totalActiveMs += activeMs;
    totalProratedUnitMicros += proratedUnitMicros;
    if (proratedSubtotalCents != null && amountCents != null) {
      proratedSubtotalCents += amountCents;
    }
  }

  lines.sort((a, b) => a.vehicleId.localeCompare(b.vehicleId));

  return {
    periodMs,
    lines,
    totalActiveMs,
    totalProratedUnitMicros,
    proratedBillableQuantity: Math.round(totalProratedUnitMicros / 10_000) / 100,
    proratedSubtotalCents,
  };
}

export function validateQuantityEvents(
  input: QuantityEventValidationInput,
): QuantityEventValidationResult {
  const warnings: string[] = [];
  const quantityDelta = input.ledgerQuantityAtPeriodEnd - input.proratedBillableQuantity;

  if (Math.abs(quantityDelta) > 0.01) {
    warnings.push('QUANTITY_LEDGER_PRORATION_MISMATCH');
  }

  if (input.retroactiveEventCount > 0) {
    warnings.push('RETROACTIVE_QUANTITY_EVENTS_PRESENT');
  }

  return {
    valid: warnings.length === 0,
    ledgerQuantityAtPeriodEnd: input.ledgerQuantityAtPeriodEnd,
    proratedBillableQuantity: input.proratedBillableQuantity,
    quantityDelta,
    retroactiveEventCount: input.retroactiveEventCount,
    warnings,
  };
}

export function buildProrationAmountCents(
  unitPriceCents: number,
  activeMs: number,
  periodMs: number,
): number {
  return Math.round((unitPriceCents * activeMs) / periodMs);
}
