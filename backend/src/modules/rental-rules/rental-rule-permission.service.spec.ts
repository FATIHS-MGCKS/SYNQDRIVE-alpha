import { Logger } from '@nestjs/common';
import { RentalRulePermissionService } from './rental-rule-permission.service';

describe('RentalRulePermissionService', () => {
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };
  let service: RentalRulePermissionService;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new RentalRulePermissionService(prisma as never);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.clearAllMocks();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('audits MASTER_ADMIN cross-tenant publish actions', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await service.assert(
      { id: 'master-1', platformRole: 'MASTER_ADMIN', organizationId: 'org-home' },
      'org-target',
      'rental_rules.publish',
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('MASTER_ADMIN cross-tenant rental rule action'),
    );
  });

  it('does not audit MASTER_ADMIN acting within home org', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await service.assert(
      { id: 'master-1', platformRole: 'MASTER_ADMIN', organizationId: 'org-home' },
      'org-home',
      'rental_rules.publish',
    );

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
