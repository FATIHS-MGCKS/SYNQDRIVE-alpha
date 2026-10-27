import type { MembershipPermissionsMap } from '@shared/auth/permission.util';
import { MembershipRole } from '@prisma/client';
import { canAccessZb1RegistrationCertificate } from './zb1-registration-certificate-access.policy';

/** @deprecated Use canAccessZb1RegistrationCertificate — kept for import stability in tests. */
export function canAccessZb1RegistrationVehicleDocument(input: {
  membershipRole: MembershipRole | null | undefined;
  permissions: MembershipPermissionsMap | null | undefined;
}): boolean {
  return canAccessZb1RegistrationCertificate(input);
}
