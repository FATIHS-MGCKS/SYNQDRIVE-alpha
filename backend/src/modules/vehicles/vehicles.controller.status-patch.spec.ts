import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CleaningStatus, HealthStatus, VehicleStatus } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehiclesController } from './vehicles.controller';

describe('VehiclesController — operational status write guard', () => {
  const orgId = 'org-1';
  const vehicleId = 'veh-1';

  const vehiclesService = {
    update: jest.fn().mockResolvedValue({ id: vehicleId, status: VehicleStatus.AVAILABLE }),
    findOne: jest
      .fn()
      .mockResolvedValue({ id: vehicleId, status: VehicleStatus.AVAILABLE }),
    invalidateFleetMapCache: jest.fn().mockResolvedValue(undefined),
  };
  const vehicleCleaningTasks = {
    ensureCleaningTask: jest.fn(),
    completeOpenCleaningTasks: jest.fn(),
  };
  const activityLog = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const controller = new VehiclesController(
    vehiclesService as any,
    {} as any,
    vehicleCleaningTasks as any,
    activityLog as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies OrgScopingGuard on status PATCH', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        VehiclesController.prototype.updateVehicleStatus,
      ) ?? [];
    expect(guards).toContain(OrgScopingGuard);
  });

  it('applies RolesGuard on controller', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, VehiclesController) ?? [];
    expect(guards).toContain(RolesGuard);
  });

  it('rejects direct RENTED writes', async () => {
    await expect(
      controller.updateVehicleStatus(orgId, vehicleId, { user: { id: 'u1' } }, {
        status: VehicleStatus.RENTED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(vehiclesService.update).not.toHaveBeenCalled();
  });

  it('rejects direct RESERVED writes', async () => {
    await expect(
      controller.updateVehicleStatus(orgId, vehicleId, { user: { id: 'u1' } }, {
        status: VehicleStatus.RESERVED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows AVAILABLE / IN_SERVICE / OUT_OF_SERVICE admin writes', async () => {
    for (const status of [
      VehicleStatus.AVAILABLE,
      VehicleStatus.IN_SERVICE,
      VehicleStatus.OUT_OF_SERVICE,
    ]) {
      await controller.updateVehicleStatus(orgId, vehicleId, { user: { id: 'u1' } }, {
        status,
      });
    }
    expect(vehiclesService.update).toHaveBeenCalledTimes(3);
    expect(vehiclesService.update).toHaveBeenCalledWith(
      vehicleId,
      expect.objectContaining({ status: VehicleStatus.AVAILABLE }),
      orgId,
    );
  });

  it('scopes update to organization via service.update third argument', async () => {
    await controller.updateVehicleStatus(orgId, vehicleId, { user: { id: 'u1' } }, {
      cleaningStatus: CleaningStatus.CLEAN,
      healthStatus: HealthStatus.GOOD,
    });
    expect(vehiclesService.update).toHaveBeenCalledWith(
      vehicleId,
      expect.objectContaining({
        cleaningStatus: CleaningStatus.CLEAN,
        healthStatus: HealthStatus.GOOD,
      }),
      orgId,
    );
  });

  it('writes activity log for operational status changes', async () => {
    vehiclesService.findOne.mockResolvedValueOnce({
      id: vehicleId,
      status: VehicleStatus.AVAILABLE,
    });

    await controller.updateVehicleStatus(orgId, vehicleId, { user: { id: 'u1' } }, {
      status: VehicleStatus.IN_SERVICE,
    });

    expect(activityLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        userId: 'u1',
        entityId: vehicleId,
        metaJson: expect.objectContaining({
          auditAction: 'VEHICLE_OPERATIONAL_STATUS_UPDATE',
          previousStatus: VehicleStatus.AVAILABLE,
          nextStatus: VehicleStatus.IN_SERVICE,
        }),
      }),
    );
  });

  it('writes activity log for cleaning status changes', async () => {
    vehiclesService.findOne.mockResolvedValueOnce({
      id: vehicleId,
      cleaningStatus: CleaningStatus.NEEDS_CLEANING,
    });

    await controller.updateVehicleStatus(orgId, vehicleId, { user: { id: 'u1' } }, {
      cleaningStatus: CleaningStatus.CLEAN,
    });

    expect(activityLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        userId: 'u1',
        entityId: vehicleId,
        metaJson: expect.objectContaining({
          auditAction: 'VEHICLE_CLEANING_STATUS_UPDATE',
          previousCleaningStatus: CleaningStatus.NEEDS_CLEANING,
          nextCleaningStatus: CleaningStatus.CLEAN,
        }),
      }),
    );
  });
});
