import { OrganizationStatus } from '@prisma/client';
import {
  assertOrganizationAllowsTenantSurface,
  canIssueOrganizationSession,
  ORGANIZATION_LIFECYCLE_DENIED_CODE,
} from './organization-lifecycle-access.policy';

describe('organization-lifecycle-access.policy', () => {
  it('ACTIVE allows operational and session issuance', () => {
    expect(() =>
      assertOrganizationAllowsTenantSurface(OrganizationStatus.ACTIVE, 'TENANT_OPERATIONAL'),
    ).not.toThrow();
    expect(canIssueOrganizationSession(OrganizationStatus.ACTIVE)).toBe(true);
  });

  it('PENDING allows onboarding and session only', () => {
    expect(() =>
      assertOrganizationAllowsTenantSurface(OrganizationStatus.PENDING, 'TENANT_ONBOARDING'),
    ).not.toThrow();
    expect(() =>
      assertOrganizationAllowsTenantSurface(OrganizationStatus.PENDING, 'TENANT_OPERATIONAL'),
    ).toThrow();
    expect(canIssueOrganizationSession(OrganizationStatus.PENDING)).toBe(true);
  });

  it('SUSPENDED denies tenant operational and session', () => {
    expect(() =>
      assertOrganizationAllowsTenantSurface(OrganizationStatus.SUSPENDED, 'TENANT_OPERATIONAL'),
    ).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: ORGANIZATION_LIFECYCLE_DENIED_CODE }) }));
    expect(canIssueOrganizationSession(OrganizationStatus.SUSPENDED)).toBe(false);
  });

  it('ARCHIVED denies tenant operations', () => {
    expect(() =>
      assertOrganizationAllowsTenantSurface(OrganizationStatus.ARCHIVED, 'TENANT_OPERATIONAL'),
    ).toThrow();
  });

  it('missing organization fails closed', () => {
    expect(() => assertOrganizationAllowsTenantSurface(null, 'TENANT_OPERATIONAL')).toThrow();
  });
});