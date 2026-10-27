import { ForbiddenException } from '@nestjs/common';
import type { MembershipPermissionsMap } from '@shared/auth/permission.util';
import { MembershipRole } from '@prisma/client';

/**
 * ZB-I (REGISTRATION_CERTIFICATE) read/download/delete metadata policy.
 * Independent of P4 feature flag — legacy rows remain protected.
 */
export function canAccessZb1RegistrationCertificate(input: {
  membershipRole: MembershipRole | null | undefined;
  permissions: MembershipPermissionsMap | null | undefined;
}): boolean {
  if (input.membershipRole === MembershipRole.ORG_ADMIN) {
    return true;
  }
  if (input.permissions?.fleet?.manage === true) {
    return true;
  }
  return false;
}

export function assertZb1RegistrationCertificateAccess(input: {
  membershipRole: MembershipRole | null | undefined;
  permissions: MembershipPermissionsMap | null | undefined;
}): void {
  if (!canAccessZb1RegistrationCertificate(input)) {
    throw new ForbiddenException({
      code: 'ZB1_REGISTRATION_DOCUMENT_FORBIDDEN',
      message:
        'Registration certificate documents are restricted to organization admins and fleet managers with fleet.manage.',
    });
  }
}
