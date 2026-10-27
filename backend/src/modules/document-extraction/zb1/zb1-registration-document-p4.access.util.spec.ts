import { MembershipRole } from '@prisma/client';
import { canAccessZb1RegistrationVehicleDocument } from './zb1-registration-document-p4.access.util';

describe('zb1-registration-document-p4.access.util', () => {
  it('allows org admin', () => {
    expect(
      canAccessZb1RegistrationVehicleDocument({
        membershipRole: MembershipRole.ORG_ADMIN,
        permissions: {},
      }),
    ).toBe(true);
  });

  it('allows fleet managers', () => {
    expect(
      canAccessZb1RegistrationVehicleDocument({
        membershipRole: MembershipRole.WORKER,
        permissions: { fleet: { read: true, write: false, manage: true } },
      }),
    ).toBe(true);
  });

  it('denies document-upload read-only employees', () => {
    expect(
      canAccessZb1RegistrationVehicleDocument({
        membershipRole: MembershipRole.WORKER,
        permissions: { 'document-upload': { read: true, write: false, manage: false } },
      }),
    ).toBe(false);
  });

  it('denies document-upload.manage without fleet.manage', () => {
    expect(
      canAccessZb1RegistrationVehicleDocument({
        membershipRole: MembershipRole.WORKER,
        permissions: { 'document-upload': { read: true, write: true, manage: true } },
      }),
    ).toBe(false);
  });
});
