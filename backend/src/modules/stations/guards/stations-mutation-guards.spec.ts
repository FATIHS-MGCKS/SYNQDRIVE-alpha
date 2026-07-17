import { BadRequestException } from '@nestjs/common';
import { StationsAssignVehiclePermissionGuard } from './stations-assign-vehicle-permission.guard';
import { StationsSetPrimaryPermissionGuard } from './stations-set-primary-permission.guard';
import { StationsUpdatePermissionGuard } from './stations-update-permission.guard';
import { StationsVehicleLocationPermissionGuard } from './stations-vehicle-location-permission.guard';
import { StationsAccessService } from '../stations-access.service';

function mockContext(body: Record<string, unknown> = {}, user: Record<string, unknown> = { id: 'u1' }) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params: { orgId: 'org-1' },
        body,
        user,
      }),
    }),
  };
}

describe('Stations mutation permission guards', () => {
  const stationsAccess = {
    assertStationsAccess: jest.fn().mockResolvedValue('org-1'),
    assertStationsAccessForActions: jest.fn().mockResolvedValue('org-1'),
    assertCanSetPrimary: jest.fn().mockResolvedValue(undefined),
  } as unknown as StationsAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('StationsUpdatePermissionGuard resolves permissions from patch body', async () => {
    const guard = new StationsUpdatePermissionGuard(stationsAccess);
    await guard.canActivate(
      mockContext({ name: 'Updated', capacity: 4 }) as never,
    );

    expect(stationsAccess.assertStationsAccessForActions).toHaveBeenCalledWith(
      expect.any(Object),
      { id: 'u1' },
      expect.arrayContaining([
        'stations.update_master_data',
        'stations.manage_operations',
      ]),
    );
  });

  it('StationsUpdatePermissionGuard rejects empty patch', async () => {
    const guard = new StationsUpdatePermissionGuard(stationsAccess);
    await expect(guard.canActivate(mockContext({}) as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('StationsAssignVehiclePermissionGuard maps target to permission', async () => {
    const guard = new StationsAssignVehiclePermissionGuard(stationsAccess);
    await guard.canActivate(mockContext({ vehicleId: 'v1', target: 'expected' }) as never);

    expect(stationsAccess.assertStationsAccess).toHaveBeenCalledWith(
      expect.any(Object),
      { id: 'u1' },
      'stations.manage_transfers',
    );
  });

  it('StationsSetPrimaryPermissionGuard checks permission and role policy', async () => {
    const guard = new StationsSetPrimaryPermissionGuard(stationsAccess);
    await guard.canActivate(mockContext() as never);

    expect(stationsAccess.assertStationsAccess).toHaveBeenCalledWith(
      expect.any(Object),
      { id: 'u1' },
      'stations.set_primary',
    );
    expect(stationsAccess.assertCanSetPrimary).toHaveBeenCalledWith('org-1', { id: 'u1' });
  });

  it('StationsVehicleLocationPermissionGuard resolves current/expected permissions', async () => {
    const guard = new StationsVehicleLocationPermissionGuard(stationsAccess);
    await guard.canActivate(
      mockContext({ vehicleId: 'v1', currentStationId: 's1' }) as never,
    );

    expect(stationsAccess.assertStationsAccessForActions).toHaveBeenCalledWith(
      expect.any(Object),
      { id: 'u1' },
      ['stations.manage_current_location'],
    );
  });

  it('StationsVehicleLocationPermissionGuard rejects empty body', async () => {
    const guard = new StationsVehicleLocationPermissionGuard(stationsAccess);
    await expect(
      guard.canActivate(mockContext({ vehicleId: 'v1' }) as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
