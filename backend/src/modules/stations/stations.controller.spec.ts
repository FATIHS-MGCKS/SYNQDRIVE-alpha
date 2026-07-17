import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { StationScopeGuard } from '@shared/guards/station-scope.guard';
import { STATION_SCOPE_CONTEXT_KEY } from '@shared/stations/station-scope.constants';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import { STATION_SCOPE_KEY } from '@shared/decorators/station-scope.decorator';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationMapboxService } from './station-mapbox.service';
import { StationsAssignVehiclePermissionGuard } from './guards/stations-assign-vehicle-permission.guard';
import { StationsPermissionGuard } from './guards/stations-permission.guard';
import { StationsSetPrimaryPermissionGuard } from './guards/stations-set-primary-permission.guard';
import { StationsUpdatePermissionGuard } from './guards/stations-update-permission.guard';
import { StationsVehicleLocationPermissionGuard } from './guards/stations-vehicle-location-permission.guard';
import { STATIONS_PERMISSION_KEY } from './decorators/require-stations-permission.decorator';

const ORG = 'org-1';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function metadata(key: string, method: keyof StationsController) {
  return Reflect.getMetadata(key, StationsController.prototype[method]);
}

describe('StationsController read security', () => {
  it('applies org, role, permission, and scope guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, StationsController);
    expect(guards).toEqual(
      expect.arrayContaining([
        OrgScopingGuard,
        RolesGuard,
        StationsPermissionGuard,
        StationScopeGuard,
      ]),
    );
  });

  it('requires stations.read on list and detail read handlers', () => {
    expect(metadata(STATIONS_PERMISSION_KEY, 'findAll')).toBe('stations.read');
    expect(metadata(STATIONS_PERMISSION_KEY, 'getStats')).toBe('stations.read');
    expect(metadata(STATIONS_PERMISSION_KEY, 'findOne')).toBe('stations.read');
    expect(metadata(STATIONS_PERMISSION_KEY, 'getOverviewStats')).toBe('stations.read');
    expect(metadata(STATIONS_PERMISSION_KEY, 'getFleet')).toBe('stations.read');
    expect(metadata(STATIONS_PERMISSION_KEY, 'getBookings')).toBe('stations.read');
    expect(metadata(STATIONS_PERMISSION_KEY, 'getOperations')).toBe('stations.read');
    expect(metadata(STATIONS_PERMISSION_KEY, 'getTeam')).toBe('stations.read');
    expect(metadata(STATIONS_PERMISSION_KEY, 'getActivity')).toBe('stations.read');
  });

  it('uses list scope for collection reads and station scope for detail reads', () => {
    expect(metadata(STATION_SCOPE_KEY, 'findAll')).toEqual({ resource: 'list' });
    expect(metadata(STATION_SCOPE_KEY, 'getStats')).toEqual({ resource: 'list' });
    expect(metadata(STATION_SCOPE_KEY, 'findOne')).toEqual({ resource: 'station' });
    expect(metadata(STATION_SCOPE_KEY, 'getFleet')).toEqual({ resource: 'station' });
    expect(metadata(STATION_SCOPE_KEY, 'getOperations')).toEqual({ resource: 'station' });
    expect(metadata(STATION_SCOPE_KEY, 'getTeam')).toEqual({ resource: 'station' });
    expect(metadata(STATION_SCOPE_KEY, 'getActivity')).toEqual({ resource: 'station' });
  });
});

describe('StationsController mutation security', () => {
  it('requires explicit permissions on lifecycle and create mutations', () => {
    expect(metadata(STATIONS_PERMISSION_KEY, 'create')).toBe('stations.create');
    expect(metadata(STATIONS_PERMISSION_KEY, 'archive')).toBe('stations.archive');
    expect(metadata(STATIONS_PERMISSION_KEY, 'restore')).toBe('stations.restore');
    expect(metadata(STATIONS_PERMISSION_KEY, 'delete')).toBe('stations.archive');
    expect(metadata(STATIONS_PERMISSION_KEY, 'backfillCoordinates')).toBe('stations.geocode');
  });

  it('uses create/list/station/vehicle_location scope resources on mutations', () => {
    expect(metadata(STATION_SCOPE_KEY, 'create')).toEqual({ resource: 'create' });
    expect(metadata(STATION_SCOPE_KEY, 'backfillCoordinates')).toEqual({ resource: 'list' });
    expect(metadata(STATION_SCOPE_KEY, 'update')).toEqual({ resource: 'station' });
    expect(metadata(STATION_SCOPE_KEY, 'archive')).toEqual({ resource: 'station' });
    expect(metadata(STATION_SCOPE_KEY, 'restore')).toEqual({ resource: 'station' });
    expect(metadata(STATION_SCOPE_KEY, 'setPrimary')).toEqual({ resource: 'station' });
    expect(metadata(STATION_SCOPE_KEY, 'setVehicles')).toEqual({ resource: 'station' });
    expect(metadata(STATION_SCOPE_KEY, 'assignVehicle')).toEqual({ resource: 'station' });
    expect(metadata(STATION_SCOPE_KEY, 'delete')).toEqual({ resource: 'station' });
    expect(metadata(STATION_SCOPE_KEY, 'updateVehicleCurrentStation')).toEqual({
      resource: 'vehicle_location',
    });
  });

  it('applies specialized mutation permission guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, StationsController.prototype.update)).toEqual(
      expect.arrayContaining([StationsUpdatePermissionGuard]),
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, StationsController.prototype.setPrimary)).toEqual(
      expect.arrayContaining([StationsSetPrimaryPermissionGuard]),
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, StationsController.prototype.setVehicles)).toEqual(
      expect.arrayContaining([StationsAssignVehiclePermissionGuard]),
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, StationsController.prototype.assignVehicle)).toEqual(
      expect.arrayContaining([StationsAssignVehiclePermissionGuard]),
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StationsController.prototype.updateVehicleCurrentStation),
    ).toEqual(expect.arrayContaining([StationsVehicleLocationPermissionGuard]));
  });
});

describe('StationsController read handlers', () => {
  const stationsService = {
    findAll: jest.fn(),
    getStationStats: jest.fn(),
    findOne: jest.fn(),
    getStationOverviewStats: jest.fn(),
    getStationFleet: jest.fn(),
    getStationBookings: jest.fn(),
    getStationOperations: jest.fn(),
    getStationTeam: jest.fn(),
    getStationActivity: jest.fn(),
  };

  const controller = new StationsController(
    stationsService as unknown as StationsService,
    {} as StationMapboxService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const assignedScope = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
    allowedStationIds: [STATION_A],
    bypassScope: false,
  };

  it('passes assigned scope into list query', async () => {
    stationsService.findAll.mockResolvedValue([]);
    const req = { [STATION_SCOPE_CONTEXT_KEY]: assignedScope };

    await controller.findAll(ORG, {}, req);

    expect(stationsService.findAll).toHaveBeenCalledWith(ORG, {}, assignedScope);
  });

  it('passes assigned scope into stats aggregation', async () => {
    stationsService.getStationStats.mockResolvedValue({ totalStations: 1 });
    const req = { [STATION_SCOPE_CONTEXT_KEY]: assignedScope };

    await controller.getStats(ORG, req);

    expect(stationsService.getStationStats).toHaveBeenCalledWith(ORG, assignedScope);
  });

  it('passes scope into detail reads', async () => {
    stationsService.findOne.mockResolvedValue({ id: STATION_A });
    const req = { [STATION_SCOPE_CONTEXT_KEY]: assignedScope };

    await controller.findOne(ORG, STATION_A, req);

    expect(stationsService.findOne).toHaveBeenCalledWith(ORG, STATION_A, assignedScope);
  });
});
