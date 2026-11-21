import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';

export const ORGANIZATION_LIFECYCLE_DENIED_CODE = 'ORGANIZATION_LIFECYCLE_RESTRICTED';

/** How the caller intends to use the organization context. */
export type OrganizationAccessSurface =
  | 'TENANT_OPERATIONAL'
  | 'TENANT_ONBOARDING'
  | 'SESSION_ISSUANCE'
  | 'PLATFORM_MASTER_ADMIN';

export function organizationLifecycleDeniedException(
  status: OrganizationStatus,
  surface: OrganizationAccessSurface,
): ForbiddenException {
  return new ForbiddenException({
    code: ORGANIZATION_LIFECYCLE_DENIED_CODE,
    message: `Organization lifecycle state ${status} does not allow ${surface}`,
    organizationStatus: status,
    surface,
  });
}

/**
 * Canonical tenant lifecycle gate (P3). MASTER_ADMIN surfaces bypass at the guard layer.
 */
export function assertOrganizationAllowsTenantSurface(
  status: OrganizationStatus | null | undefined,
  surface: OrganizationAccessSurface,
): void {
  if (status == null) {
    throw new NotFoundException('Organization not found');
  }

  if (status === OrganizationStatus.ACTIVE) {
    return;
  }

  if (status === OrganizationStatus.PENDING) {
    if (surface === 'TENANT_ONBOARDING' || surface === 'SESSION_ISSUANCE') {
      return;
    }
    throw organizationLifecycleDeniedException(status, surface);
  }

  throw organizationLifecycleDeniedException(status, surface);
}

export function canIssueOrganizationSession(status: OrganizationStatus): boolean {
  try {
    assertOrganizationAllowsTenantSurface(status, 'SESSION_ISSUANCE');
    return true;
  } catch {
    return false;
  }
}