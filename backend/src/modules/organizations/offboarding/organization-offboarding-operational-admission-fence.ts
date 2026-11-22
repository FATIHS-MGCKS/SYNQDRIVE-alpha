import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrganizationStatus, type Prisma } from '@prisma/client';
import {
  acquirePgAdvisoryXactLock,
  organizationOffboardingFinalizeLockKey,
} from '@shared/database/pg-advisory-lock.util';

export const ORGANIZATION_OFFBOARDING_OPERATIONAL_ADMISSION_DENIED_CODE =
  'ORGANIZATION_OFFBOARDING_OPERATIONAL_ADMISSION_DENIED';

export type OrganizationOperationalAdmissionSurface = 'BOOKING' | 'TRIP_START';

type TxClient = Prisma.TransactionClient;

/**
 * Shared finalize/commit serialization fence — couples operational admissions
 * with archival commit under the same transactional advisory lock.
 */
export async function acquireOrganizationArchivalCommitFence(
  tx: TxClient,
  organizationId: string,
): Promise<OrganizationStatus> {
  await acquirePgAdvisoryXactLock(tx, organizationOffboardingFinalizeLockKey(organizationId));
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  if (!org) {
    throw new NotFoundException({
      code: 'ORGANIZATION_NOT_FOUND',
      message: 'Organization not found',
    });
  }
  return org.status;
}

export function assertOrganizationOperationalAdmissionAllowed(
  status: OrganizationStatus,
  surface: OrganizationOperationalAdmissionSurface,
): void {
  if (status === OrganizationStatus.SUSPENDED || status === OrganizationStatus.ARCHIVED) {
    throw new ConflictException({
      code: ORGANIZATION_OFFBOARDING_OPERATIONAL_ADMISSION_DENIED_CODE,
      message: `Operational ${surface} admission is not allowed for organization status ${status}`,
      organizationStatus: status,
      surface,
    });
  }
}

export async function fenceOrganizationOperationalAdmission(
  tx: TxClient,
  organizationId: string,
  surface: OrganizationOperationalAdmissionSurface,
): Promise<void> {
  const status = await acquireOrganizationArchivalCommitFence(tx, organizationId);
  assertOrganizationOperationalAdmissionAllowed(status, surface);
}