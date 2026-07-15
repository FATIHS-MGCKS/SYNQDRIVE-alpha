import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleCleaningTaskService } from '../tasks/vehicle-cleaning-task.service';
import { VehicleExteriorImagesService } from './vehicle-exterior-images.service';

describe('VehiclesController generic PATCH security', () => {
  let controller: VehiclesController;
  let vehiclesService: {
    updateMasterData: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    vehiclesService = {
      updateMasterData: jest.fn().mockResolvedValue({ id: 'veh-1' }),
      update: jest.fn(),
    };
    controller = new VehiclesController(
      vehiclesService as unknown as VehiclesService,
      {} as VehicleExteriorImagesService,
      {} as VehicleCleaningTaskService,
    );
  });

  it('applies OrgScopingGuard on org-scoped generic PATCH', () => {
    const guards =
      Reflect.getMetadata(GUARDS_METADATA, VehiclesController.prototype.updateByOrg) ??
      [];
    expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard]));
  });

  it('applies VehicleOwnershipGuard on direct vehicle PATCH', () => {
    const guards =
      Reflect.getMetadata(GUARDS_METADATA, VehiclesController.prototype.update) ??
      [];
    expect(guards).toEqual(expect.arrayContaining([VehicleOwnershipGuard]));
  });

  it('routes org PATCH through updateMasterData with org id', async () => {
    await controller.updateByOrg('org-1', 'veh-1', {
      licensePlate: 'B-NEW 1',
    });

    expect(vehiclesService.updateMasterData).toHaveBeenCalledWith(
      'veh-1',
      { licensePlate: 'B-NEW 1' },
      'org-1',
    );
    expect(vehiclesService.update).not.toHaveBeenCalled();
  });

  it('routes direct PATCH through updateMasterData with caller org', async () => {
    await controller.update(
      'veh-1',
      { notes: 'hello' },
      { user: { organizationId: 'org-2', platformRole: 'ORG_ADMIN' } },
    );

    expect(vehiclesService.updateMasterData).toHaveBeenCalledWith(
      'veh-1',
      { notes: 'hello' },
      'org-2',
    );
  });
});

describe('OrgScopingGuard tenant separation', () => {
  it('forbids cross-tenant org access when JWT org mismatches', async () => {
    const guard = new OrgScopingGuard({
      organizationMembership: { findFirst: jest.fn() },
    } as any);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'user-1', organizationId: 'org-a' },
          params: { orgId: 'org-b' },
        }),
      }),
    };

    await expect(guard.canActivate(context as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
