import { ConflictException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { OrganizationRoleService } from '@modules/users/organization-role.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { ModuleRef } from '@nestjs/core';
import {
  ORGANIZATION_HARD_DELETE_DISABLED_CODE,
  ORGANIZATION_OFFBOARDING_ACTION,
} from './organization-delete-safety.errors';

describe('OrganizationsService.delete — P1 hard-delete safety', () => {
  const orgId = 'org-test-1';

  let prisma: { organization: { delete: jest.Mock } };
  let zb1SoftDelete: jest.Mock;
  let moduleRef: { get: jest.Mock };
  let service: OrganizationsService;

  beforeEach(() => {
    prisma = { organization: { delete: jest.fn() } };
    zb1SoftDelete = jest.fn().mockResolvedValue(undefined);
    moduleRef = {
      get: jest.fn().mockReturnValue({
        softDeleteRegistrationDocumentsForOrganization: zb1SoftDelete,
      }),
    };
    service = new OrganizationsService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { ensureDefaultRoles: jest.fn() } as unknown as OrganizationRoleService,
      { aggregateDerivedFleetStatusCounts: jest.fn() } as unknown as VehiclesService,
      moduleRef as unknown as ModuleRef,
    );
  });

  it('denies unsafe hard delete with structured ConflictException', async () => {
    await expect(service.delete(orgId, 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.delete(orgId, 'actor-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ORGANIZATION_HARD_DELETE_DISABLED_CODE,
        action: ORGANIZATION_OFFBOARDING_ACTION,
      }),
    });
  });

  it('does not call prisma.organization.delete or ZB1 cleanup', async () => {
    await expect(service.delete(orgId)).rejects.toThrow();
    expect(prisma.organization.delete).not.toHaveBeenCalled();
    expect(zb1SoftDelete).not.toHaveBeenCalled();
    expect(moduleRef.get).not.toHaveBeenCalled();
  });
});