import { ConflictException } from '@nestjs/common';
import {
  TripStatus,
  VehicleRegistryLifecycle,
  type Prisma,
} from '@prisma/client';
import type { OrganizationOffboardHardBlockCode } from './organization-offboard-preflight.reason-codes';
import { ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE } from './organization-offboarding-finalization.policy';

const COMMITTED_BOOKING_STATUSES = ['PENDING', 'CONFIRMED'] as const;

type TxClient = Prisma.TransactionClient;

export async function collectArchivalCommitHardBlockers(
  tx: TxClient,
  organizationId: string,
): Promise<OrganizationOffboardHardBlockCode[]> {
  const now = new Date();
  const hardBlockers: OrganizationOffboardHardBlockCode[] = [];

  const ongoingTripCount = await tx.vehicleTrip.count({
    where: {
      vehicle: { organizationId },
      tripStatus: TripStatus.ONGOING,
    },
  });
  if (ongoingTripCount > 0) {
    hardBlockers.push('ONGOING_TRIP');
  }

  const activeBookingCount = await tx.booking.count({
    where: { organizationId, status: 'ACTIVE' },
  });
  if (activeBookingCount > 0) {
    hardBlockers.push('ACTIVE_RENTAL_BOOKING');
  }

  const futureCommittedBookingCount = await tx.booking.count({
    where: {
      organizationId,
      status: { in: [...COMMITTED_BOOKING_STATUSES] },
      endDate: { gte: now },
    },
  });
  if (futureCommittedBookingCount > 0) {
    hardBlockers.push('RELEVANT_COMMITTED_BOOKING');
  }

  const activeRegistryVehicles = await tx.vehicle.count({
    where: {
      organizationId,
      registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
    },
  });
  if (activeRegistryVehicles > 0) {
    hardBlockers.push('VEHICLE_OFFBOARD_BLOCKED');
  }

  return [...new Set(hardBlockers)];
}

export async function assertArchivalCommitHardBlockers(
  tx: TxClient,
  organizationId: string,
): Promise<void> {
  const blockers = await collectArchivalCommitHardBlockers(tx, organizationId);
  if (blockers.length > 0) {
    throw new ConflictException({
      code: ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE,
      message: 'Archival commit blocked by organization operational state',
      hardBlockers: blockers,
    });
  }
}