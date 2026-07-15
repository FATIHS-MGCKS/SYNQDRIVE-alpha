import { BillingBillableVehicleAssignmentStatus } from '@prisma/client';

export const BillableVehicleExclusionReason = {
  ORG_INACTIVE: 'ORG_INACTIVE',
  NO_BASE_PLAN: 'NO_BASE_PLAN',
  NO_ASSIGNMENT: 'NO_ASSIGNMENT',
  NOT_PROVISIONED: 'NOT_PROVISIONED',
  ASSIGNMENT_ENDED: 'ASSIGNMENT_ENDED',
  DEMO_ASSIGNMENT: 'DEMO_ASSIGNMENT',
  BILLING_EXCLUSION: 'BILLING_EXCLUSION',
  CROSS_TENANT: 'CROSS_TENANT',
  ARCHIVED: 'ARCHIVED',
} as const;

export type BillableVehicleExclusionReason =
  (typeof BillableVehicleExclusionReason)[keyof typeof BillableVehicleExclusionReason];

export const BillableVehicleAssignmentReasonCode = {
  DEMO: 'DEMO',
  TEST: 'TEST',
  NON_BILLABLE: 'NON_BILLABLE',
  BILLING_EXCLUSION: 'BILLING_EXCLUSION',
} as const;

export type BillableVehicleAssignmentReasonCode =
  (typeof BillableVehicleAssignmentReasonCode)[keyof typeof BillableVehicleAssignmentReasonCode];

export const NON_BILLABLE_ASSIGNMENT_REASON_CODES: ReadonlySet<string> = new Set([
  BillableVehicleAssignmentReasonCode.DEMO,
  BillableVehicleAssignmentReasonCode.TEST,
  BillableVehicleAssignmentReasonCode.NON_BILLABLE,
]);

export type VehicleConnectivityStatus = 'CONNECTED' | 'NOT_CONNECTED';
export type VehicleBillingStatus = 'BILLABLE' | 'EXCLUDED';

export interface BillableVehiclePolicyVehicle {
  id: string;
  organizationId: string;
  licensePlate: string | null;
  vin: string;
  make: string;
  model: string;
  archivedAt?: Date | null;
}

export interface BillableVehiclePolicyAssignment {
  id: string;
  organizationId: string;
  vehicleId: string;
  subscriptionItemId: string;
  billableFrom: Date;
  billableUntil: Date | null;
  status: BillingBillableVehicleAssignmentStatus;
  reasonCode: string | null;
  reasonNote: string | null;
  approvedByUserId: string | null;
}

export interface BillableVehiclePolicyContext {
  organizationId: string;
  organizationActive: boolean;
  baseSubscriptionItemId: string | null;
  baseSubscriptionItemActive: boolean;
  asOf: Date;
  /** When true, vehicles without explicit assignments inherit legacy billable status. */
  legacyImplicitAssignments: boolean;
  vehicles: BillableVehiclePolicyVehicle[];
  assignments: BillableVehiclePolicyAssignment[];
  connectivityByVehicleId?: Record<string, boolean>;
}

export interface BillableVehiclePolicyRow {
  id: string;
  licensePlate: string | null;
  vin: string;
  make: string;
  model: string;
  connectivityStatus: VehicleConnectivityStatus;
  billingStatus: VehicleBillingStatus;
}

export interface ExcludedBillableVehiclePolicyRow extends BillableVehiclePolicyRow {
  reason: BillableVehicleExclusionReason;
  assignmentId?: string;
  reasonCode?: string | null;
}

export interface BillableVehiclePolicyResult {
  connectedVehicleCount: number;
  billableVehicleCount: number;
  billableVehicles: BillableVehiclePolicyRow[];
  excludedVehicles: ExcludedBillableVehiclePolicyRow[];
}

function isWithinPeriod(
  from: Date,
  until: Date | null | undefined,
  asOf: Date,
): boolean {
  if (from > asOf) return false;
  if (until != null && until < asOf) return false;
  return true;
}

function isApprovedExclusion(assignment: BillableVehiclePolicyAssignment): boolean {
  return (
    assignment.status === BillingBillableVehicleAssignmentStatus.EXCLUDED &&
    assignment.approvedByUserId != null &&
    assignment.reasonCode != null &&
    assignment.reasonCode.trim().length > 0
  );
}

function isApprovedBillableAssignment(assignment: BillableVehiclePolicyAssignment): boolean {
  return (
    assignment.status === BillingBillableVehicleAssignmentStatus.ACTIVE &&
    assignment.approvedByUserId != null
  );
}

function isNonBillableTypeAssignment(assignment: BillableVehiclePolicyAssignment): boolean {
  return (
    assignment.status === BillingBillableVehicleAssignmentStatus.EXCLUDED &&
    assignment.reasonCode != null &&
    NON_BILLABLE_ASSIGNMENT_REASON_CODES.has(assignment.reasonCode)
  );
}

export function evaluateBillableVehiclePolicy(
  context: BillableVehiclePolicyContext,
): BillableVehiclePolicyResult {
  const billableVehicles: BillableVehiclePolicyRow[] = [];
  const excludedVehicles: ExcludedBillableVehiclePolicyRow[] = [];
  let connectedVehicleCount = 0;

  const assignmentsByVehicle = new Map<string, BillableVehiclePolicyAssignment[]>();
  for (const assignment of context.assignments) {
    const existing = assignmentsByVehicle.get(assignment.vehicleId) ?? [];
    existing.push(assignment);
    assignmentsByVehicle.set(assignment.vehicleId, existing);
  }

  for (const vehicle of context.vehicles) {
    const connectivityStatus: VehicleConnectivityStatus = context.connectivityByVehicleId?.[
      vehicle.id
    ]
      ? 'CONNECTED'
      : 'NOT_CONNECTED';

    if (connectivityStatus === 'CONNECTED') {
      connectedVehicleCount += 1;
    }

    const baseRow: BillableVehiclePolicyRow = {
      id: vehicle.id,
      licensePlate: vehicle.licensePlate,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      connectivityStatus,
      billingStatus: 'EXCLUDED',
    };

    const exclusion = resolveVehicleExclusion(vehicle, context, assignmentsByVehicle.get(vehicle.id) ?? []);
    if (exclusion) {
      excludedVehicles.push({
        ...baseRow,
        reason: exclusion.reason,
        assignmentId: exclusion.assignmentId,
        reasonCode: exclusion.reasonCode,
      });
      continue;
    }

    billableVehicles.push({
      ...baseRow,
      billingStatus: 'BILLABLE',
    });
  }

  return {
    connectedVehicleCount,
    billableVehicleCount: billableVehicles.length,
    billableVehicles,
    excludedVehicles,
  };
}

function resolveVehicleExclusion(
  vehicle: BillableVehiclePolicyVehicle,
  context: BillableVehiclePolicyContext,
  assignments: BillableVehiclePolicyAssignment[],
): {
  reason: BillableVehicleExclusionReason;
  assignmentId?: string;
  reasonCode?: string | null;
} | null {
  if (vehicle.organizationId !== context.organizationId) {
    return { reason: BillableVehicleExclusionReason.CROSS_TENANT };
  }

  if (vehicle.archivedAt != null) {
    return { reason: BillableVehicleExclusionReason.ARCHIVED };
  }

  if (!context.organizationActive) {
    return { reason: BillableVehicleExclusionReason.ORG_INACTIVE };
  }

  if (!context.baseSubscriptionItemId || !context.baseSubscriptionItemActive) {
    return { reason: BillableVehicleExclusionReason.NO_BASE_PLAN };
  }

  const scoped = assignments.filter(
    (assignment) => assignment.subscriptionItemId === context.baseSubscriptionItemId,
  );

  const activeExclusion = scoped.find(
    (assignment) =>
      isApprovedExclusion(assignment) &&
      assignment.reasonCode === BillableVehicleAssignmentReasonCode.BILLING_EXCLUSION &&
      isWithinPeriod(assignment.billableFrom, assignment.billableUntil, context.asOf),
  );
  if (activeExclusion) {
    return {
      reason: BillableVehicleExclusionReason.BILLING_EXCLUSION,
      assignmentId: activeExclusion.id,
      reasonCode: activeExclusion.reasonCode,
    };
  }

  const activeDemoAssignment = scoped.find(
    (assignment) =>
      isNonBillableTypeAssignment(assignment) &&
      isWithinPeriod(assignment.billableFrom, assignment.billableUntil, context.asOf),
  );
  if (activeDemoAssignment) {
    return {
      reason: BillableVehicleExclusionReason.DEMO_ASSIGNMENT,
      assignmentId: activeDemoAssignment.id,
      reasonCode: activeDemoAssignment.reasonCode,
    };
  }

  const activeBillableAssignment = scoped.find(
    (assignment) =>
      isApprovedBillableAssignment(assignment) &&
      isWithinPeriod(assignment.billableFrom, assignment.billableUntil, context.asOf),
  );
  if (activeBillableAssignment) {
    return null;
  }

  if (context.legacyImplicitAssignments) {
    return null;
  }

  const endedAssignment = scoped.find(
    (assignment) =>
      assignment.status === BillingBillableVehicleAssignmentStatus.ENDED ||
      (assignment.billableUntil != null && assignment.billableUntil < context.asOf),
  );
  if (endedAssignment) {
    return {
      reason: BillableVehicleExclusionReason.ASSIGNMENT_ENDED,
      assignmentId: endedAssignment.id,
      reasonCode: endedAssignment.reasonCode,
    };
  }

  const futureAssignment = scoped.find((assignment) => assignment.billableFrom > context.asOf);
  if (futureAssignment) {
    return {
      reason: BillableVehicleExclusionReason.NOT_PROVISIONED,
      assignmentId: futureAssignment.id,
      reasonCode: futureAssignment.reasonCode,
    };
  }

  if (scoped.length > 0) {
    return { reason: BillableVehicleExclusionReason.NO_ASSIGNMENT };
  }

  return { reason: BillableVehicleExclusionReason.NO_ASSIGNMENT };
}
