import { ForbiddenException } from '@nestjs/common';
import {
  assertHighMobilityRecordTenantAccess,
  resolveHighMobilityTenantOrganizationId,
} from './high-mobility-tenant-access.policy';

describe('high-mobility-tenant-access.policy', () => {
  it('rejects body organizationId mismatch for tenant user', () => {
    expect(() =>
      resolveHighMobilityTenantOrganizationId(
        { platformRole: 'USER', organizationId: 'org-a' },
        'org-b',
      ),
    ).toThrow(ForbiddenException);
  });

  it('denies cross-org HM record for tenant', () => {
    expect(() =>
      assertHighMobilityRecordTenantAccess({ organizationId: 'org-b' }, 'org-a', false),
    ).toThrow(ForbiddenException);
  });

  it('allows platform-scoped HM record (null org) for tenant', () => {
    expect(() =>
      assertHighMobilityRecordTenantAccess({ organizationId: null }, 'org-a', false),
    ).not.toThrow();
  });

  it('allows Master Admin discovery without org context', () => {
    expect(
      resolveHighMobilityTenantOrganizationId(
        { platformRole: 'MASTER_ADMIN', organizationId: null },
        undefined,
        { allowMasterAdminWithoutOrg: true },
      ),
    ).toBeNull();
  });

  it('requires Master Admin HM_ONLY destination org', () => {
    expect(() =>
      resolveHighMobilityTenantOrganizationId(
        { platformRole: 'MASTER_ADMIN', organizationId: null },
        undefined,
        { requireMasterAdminDestinationOrg: true },
      ),
    ).toThrow();
  });
});