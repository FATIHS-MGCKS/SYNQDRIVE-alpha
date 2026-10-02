import type { Prisma } from '@prisma/client';
import type { VehicleOffboardReasonCode } from '../contracts/vehicle-offboard-reason.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

/**
 * Closes the single open org assignment for offboarding.
 *
 * DB partial unique index `uq_vehicle_org_assignment_open` guarantees at most one
 * open row per vehicle; zero open rows are permitted for legacy vehicles predating VO-2.
 */
export async function closeOpenOrganizationAssignmentForOffboard(
  tx: Prisma.TransactionClient,
  input: {
    vehicleId: string;
    organizationId: string;
    reason: VehicleOffboardReasonCode;
    offboardedAt: Date;
  },
): Promise<void> {
  const openAssignments = await tx.vehicleOrganizationAssignment.findMany({
    where: { vehicleId: input.vehicleId, validTo: null },
    select: { id: true, organizationId: true },
  });

  if (openAssignments.length > 1) {
    throw new VehicleOnboardingError(
      'ONBOARDING_CONCURRENCY_CONFLICT',
      'Multiple open organization assignments for vehicle',
      { vehicleId: input.vehicleId, openCount: openAssignments.length },
    );
  }

  if (openAssignments.length === 0) {
    return;
  }

  const open = openAssignments[0]!;
  if (open.organizationId !== input.organizationId) {
    throw new VehicleOnboardingError(
      'ORGANIZATION_MISMATCH',
      'Open organization assignment does not belong to target organization',
      { vehicleId: input.vehicleId, assignmentOrgId: open.organizationId },
    );
  }

  await tx.vehicleOrganizationAssignment.update({
    where: { id: open.id },
    data: {
      validTo: input.offboardedAt,
      assignmentReason: input.reason,
    },
  });
}
