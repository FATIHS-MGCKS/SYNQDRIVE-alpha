import { BillingBillableVehicleAssignmentStatus } from '@prisma/client';
import {
  BillableVehicleAssignmentReasonCode,
  NON_BILLABLE_ASSIGNMENT_REASON_CODES,
  type BillableVehiclePolicyAssignment,
} from './billable-vehicle-policy';

export function isWithinBillablePeriod(
  assignment: Pick<BillableVehiclePolicyAssignment, 'billableFrom' | 'billableUntil'>,
  asOf: Date,
): boolean {
  if (assignment.billableFrom > asOf) return false;
  if (assignment.billableUntil != null && assignment.billableUntil < asOf) return false;
  return true;
}

function isApprovedExclusionAt(
  assignment: BillableVehiclePolicyAssignment,
  asOf: Date,
): boolean {
  return (
    assignment.status === BillingBillableVehicleAssignmentStatus.EXCLUDED &&
    assignment.approvedByUserId != null &&
    assignment.reasonCode != null &&
    assignment.reasonCode.trim().length > 0 &&
    isWithinBillablePeriod(assignment, asOf)
  );
}

function isNonBillableTypeExclusionAt(
  assignment: BillableVehiclePolicyAssignment,
  asOf: Date,
): boolean {
  return (
    assignment.status === BillingBillableVehicleAssignmentStatus.EXCLUDED &&
    assignment.reasonCode != null &&
    NON_BILLABLE_ASSIGNMENT_REASON_CODES.has(assignment.reasonCode) &&
    isWithinBillablePeriod(assignment, asOf)
  );
}

/**
 * Event-time billable assignment: period + approval semantics; mutable status alone is not authoritative.
 */
export function isEffectivelyBillableAssignmentAt(
  assignment: BillableVehiclePolicyAssignment,
  asOf: Date,
): boolean {
  if (assignment.approvedByUserId == null) return false;
  if (!isWithinBillablePeriod(assignment, asOf)) return false;

  if (isNonBillableTypeExclusionAt(assignment, asOf)) return false;

  if (
    isApprovedExclusionAt(assignment, asOf) &&
    assignment.reasonCode === BillableVehicleAssignmentReasonCode.BILLING_EXCLUSION
  ) {
    return false;
  }

  if (assignment.status === BillingBillableVehicleAssignmentStatus.EXCLUDED) {
    return false;
  }

  return (
    assignment.status === BillingBillableVehicleAssignmentStatus.ACTIVE ||
    assignment.status === BillingBillableVehicleAssignmentStatus.ENDED
  );
}

export function listEffectivelyBillableAssignmentsAt(
  assignments: BillableVehiclePolicyAssignment[],
  asOf: Date,
): BillableVehiclePolicyAssignment[] {
  return assignments.filter((assignment) => isEffectivelyBillableAssignmentAt(assignment, asOf));
}
