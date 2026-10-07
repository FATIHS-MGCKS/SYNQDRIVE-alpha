import { BillingBillableVehicleAssignmentStatus } from '@prisma/client';
import {
  BillableVehicleAssignmentReasonCode,
  NON_BILLABLE_ASSIGNMENT_REASON_CODES,
  type BillableVehiclePolicyAssignment,
} from './billable-vehicle-policy';

/**
 * Assignment rows created after a registry lifecycle boundary are not ordinary prestate evidence.
 * (Schema has no full bitemporal assignment history — see VO5B evidence.)
 */
export function isAssignmentOrdinaryPrestateEvidenceAt(
  assignment: Pick<BillableVehiclePolicyAssignment, 'createdAt'>,
  boundaryAt: Date,
): boolean {
  if (assignment.createdAt == null) {
    return true;
  }
  return assignment.createdAt.getTime() <= boundaryAt.getTime();
}

export function filterAssignmentsForRegistryOffboardPrestate<
  T extends BillableVehiclePolicyAssignment,
>(assignments: T[], boundaryAt: Date): T[] {
  return assignments.filter((assignment) =>
    isAssignmentOrdinaryPrestateEvidenceAt(assignment, boundaryAt),
  );
}

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
  options?: { registryOffboardPrestate?: boolean },
): BillableVehiclePolicyAssignment[] {
  const scoped = options?.registryOffboardPrestate
    ? filterAssignmentsForRegistryOffboardPrestate(assignments, asOf)
    : assignments;
  return scoped.filter((assignment) => isEffectivelyBillableAssignmentAt(assignment, asOf));
}
