import type { MembershipPermissionsMap } from '@shared/auth/permission.util';
import { MembershipRole } from '@prisma/client';

/** Org admins and fleet managers (fleet.manage) or document-upload managers. */
export function canAccessZb1RegistrationVehicleDocument(input: {
  membershipRole: MembershipRole | null | undefined;
  permissions: MembershipPermissionsMap | null | undefined;
}): boolean {
  if (input.membershipRole === MembershipRole.ORG_ADMIN) {
    return true;
  }
  const fleet = input.permissions?.fleet;
  if (fleet?.manage === true) {
    return true;
  }
  const doc = input.permissions?.['document-upload'];
  if (doc?.manage === true) {
    return true;
  }
  return false;
}
