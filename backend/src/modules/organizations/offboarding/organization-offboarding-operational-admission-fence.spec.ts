import { ConflictException } from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';
import {
  assertOrganizationOperationalAdmissionAllowed,
  ORGANIZATION_OFFBOARDING_OPERATIONAL_ADMISSION_DENIED_CODE,
} from './organization-offboarding-operational-admission-fence';

describe('organization-offboarding-operational-admission-fence', () => {
  it('allows ACTIVE organization operational admission', () => {
    expect(() =>
      assertOrganizationOperationalAdmissionAllowed(OrganizationStatus.ACTIVE, 'BOOKING'),
    ).not.toThrow();
  });

  it('denies booking on SUSPENDED organization', () => {
    try {
      assertOrganizationOperationalAdmissionAllowed(OrganizationStatus.SUSPENDED, 'BOOKING');
      throw new Error('expected deny');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: ORGANIZATION_OFFBOARDING_OPERATIONAL_ADMISSION_DENIED_CODE,
        organizationStatus: OrganizationStatus.SUSPENDED,
      });
    }
  });

  it('denies trip start on ARCHIVED organization', () => {
    try {
      assertOrganizationOperationalAdmissionAllowed(OrganizationStatus.ARCHIVED, 'TRIP_START');
      throw new Error('expected deny');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
    }
  });
});