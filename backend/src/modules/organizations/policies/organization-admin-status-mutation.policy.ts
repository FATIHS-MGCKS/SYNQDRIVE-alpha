import { ConflictException } from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';

export const ORGANIZATION_ARCHIVED_REQUIRES_FINALIZATION_CODE =
  'ORGANIZATION_ARCHIVED_REQUIRES_OFFBOARDING_FINALIZATION';

export const ORGANIZATION_ARCHIVED_REACTIVATION_FORBIDDEN_CODE =
  'ORGANIZATION_ARCHIVED_REACTIVATION_FORBIDDEN';

/**
 * ARCHIVED may only be set by the authorized offboarding finalization service (P6D4).
 * Archived organizations cannot be reactivated via generic admin PATCH.
 */
export function assertAdminOrganizationStatusMutationAllowed(
  currentStatus: OrganizationStatus,
  nextStatus: OrganizationStatus,
): void {
  if (currentStatus === OrganizationStatus.ARCHIVED && nextStatus !== OrganizationStatus.ARCHIVED) {
    throw new ConflictException({
      code: ORGANIZATION_ARCHIVED_REACTIVATION_FORBIDDEN_CODE,
      message: 'Archived organizations cannot be reactivated via administrative status mutation',
    });
  }
  if (nextStatus === OrganizationStatus.ARCHIVED) {
    throw new ConflictException({
      code: ORGANIZATION_ARCHIVED_REQUIRES_FINALIZATION_CODE,
      message:
        'Organization ARCHIVED status requires controlled offboarding finalization; generic status PATCH is not permitted',
    });
  }
}