import { ConflictException } from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';
import {
  assertAdminOrganizationStatusMutationAllowed,
  ORGANIZATION_ARCHIVED_REQUIRES_FINALIZATION_CODE,
  ORGANIZATION_ARCHIVED_REACTIVATION_FORBIDDEN_CODE,
} from './organization-admin-status-mutation.policy';

describe('assertAdminOrganizationStatusMutationAllowed (P6D4)', () => {
  it('denies PATCH to ARCHIVED', () => {
    try {
      assertAdminOrganizationStatusMutationAllowed(OrganizationStatus.ACTIVE, OrganizationStatus.ARCHIVED);
      fail('expected ConflictException');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: ORGANIZATION_ARCHIVED_REQUIRES_FINALIZATION_CODE,
      });
    }
  });

  it('denies ARCHIVED reactivation', () => {
    try {
      assertAdminOrganizationStatusMutationAllowed(OrganizationStatus.ARCHIVED, OrganizationStatus.ACTIVE);
      fail('expected ConflictException');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: ORGANIZATION_ARCHIVED_REACTIVATION_FORBIDDEN_CODE,
      });
    }
  });

  it('allows ACTIVE to SUSPENDED', () => {
    expect(() =>
      assertAdminOrganizationStatusMutationAllowed(OrganizationStatus.ACTIVE, OrganizationStatus.SUSPENDED),
    ).not.toThrow();
  });
});