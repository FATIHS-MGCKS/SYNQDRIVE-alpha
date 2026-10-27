import { MembershipRole } from '@prisma/client';
import { canAccessZb1RegistrationCertificate } from './zb1-registration-certificate-access.policy';

describe('zb1-registration-certificate-access.policy', () => {
  it('allows ORG_ADMIN', () => {
    expect(
      canAccessZb1RegistrationCertificate({
        membershipRole: MembershipRole.ORG_ADMIN,
        permissions: {},
      }),
    ).toBe(true);
  });

  it('allows fleet.manage', () => {
    expect(
      canAccessZb1RegistrationCertificate({
        membershipRole: MembershipRole.WORKER,
        permissions: { fleet: { read: true, write: false, manage: true } },
      }),
    ).toBe(true);
  });

  it('denies document-upload.read', () => {
    expect(
      canAccessZb1RegistrationCertificate({
        membershipRole: MembershipRole.WORKER,
        permissions: { 'document-upload': { read: true, write: false, manage: false } },
      }),
    ).toBe(false);
  });

  it('denies document-upload.write', () => {
    expect(
      canAccessZb1RegistrationCertificate({
        membershipRole: MembershipRole.WORKER,
        permissions: { 'document-upload': { read: true, write: true, manage: false } },
      }),
    ).toBe(false);
  });

  it('denies document-upload.manage alone', () => {
    expect(
      canAccessZb1RegistrationCertificate({
        membershipRole: MembershipRole.WORKER,
        permissions: { 'document-upload': { read: true, write: true, manage: true } },
      }),
    ).toBe(false);
  });

  it('denies DRIVER role without fleet.manage', () => {
    expect(
      canAccessZb1RegistrationCertificate({
        membershipRole: MembershipRole.DRIVER,
        permissions: { fleet: { read: true, write: false, manage: false } },
      }),
    ).toBe(false);
  });
});
