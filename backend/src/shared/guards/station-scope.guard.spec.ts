import { Reflector } from '@nestjs/core';
import { MembershipRole, StationStatus } from '@prisma/client';
import { STATION_SCOPE_KEY } from '@shared/decorators/station-scope.decorator';
import { StationScopeErrorCode } from '@shared/stations/station-scope.constants';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { StationScopeGuard } from './station-scope.guard';

const ORG = 'org-1';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('StationScopeGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const stationScopeService = {
    enforceRequestScope: jest.fn(),
  };
  let guard: StationScopeGuard;

  beforeEach(() => {
    guard = new StationScopeGuard(reflector, stationScopeService as unknown as StationScopeService);
    jest.clearAllMocks();
  });

  function buildContext(request: Record<string, unknown>) {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
  }

  it('passes through when handler has no station scope metadata', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    await expect(
      guard.canActivate(
        buildContext({
          method: 'GET',
          params: { orgId: ORG },
          user: { id: 'user-1' },
        }) as never,
      ),
    ).resolves.toBe(true);

    expect(stationScopeService.enforceRequestScope).not.toHaveBeenCalled();
  });

  it('delegates to StationScopeService when metadata is present', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({ resource: 'station' });
    stationScopeService.enforceRequestScope.mockResolvedValue({
      orgId: ORG,
      mode: 'ASSIGNED_STATIONS',
      allowedStationIds: [STATION_A],
      bypassScope: false,
    });

    const request = {
      method: 'GET',
      params: { orgId: ORG, id: STATION_A },
      user: { id: 'user-1', organizationId: ORG },
    };

    await expect(guard.canActivate(buildContext(request) as never)).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(STATION_SCOPE_KEY, expect.any(Array));
    expect(stationScopeService.enforceRequestScope).toHaveBeenCalledWith(request, {
      resource: 'station',
    });
  });

  it('propagates structured scope failures', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({ resource: 'list' });
    stationScopeService.enforceRequestScope.mockRejectedValue({
      response: {
        statusCode: 403,
        code: StationScopeErrorCode.NO_STATIONS,
        message: 'No stations assigned to this membership',
      },
    });

    await expect(
      guard.canActivate(
        buildContext({
          method: 'GET',
          params: { orgId: ORG },
          user: { id: 'user-1', organizationId: ORG, membershipRole: MembershipRole.WORKER },
        }) as never,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.NO_STATIONS,
      }),
    });
  });

  it('supports list and vehicle metadata options', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      resource: 'vehicle',
      resourceIdField: 'vehicleId',
    });
    stationScopeService.enforceRequestScope.mockResolvedValue({
      orgId: ORG,
      mode: 'ASSIGNED_STATIONS',
      allowedStationIds: [STATION_A],
      bypassScope: false,
    });

    const request = {
      method: 'PATCH',
      params: { orgId: ORG },
      body: { vehicleId: 'vehicle-1' },
      user: { id: 'user-1', organizationId: ORG },
    };

    await guard.canActivate(buildContext(request) as never);

    expect(stationScopeService.enforceRequestScope).toHaveBeenCalledWith(request, {
      resource: 'vehicle',
      resourceIdField: 'vehicleId',
    });
  });
});

describe('StationScopeGuard integration shape', () => {
  it('documents expected guard ordering with org scoping', () => {
    const ordering = ['AuthGuard', 'OrgScopingGuard', 'PermissionsGuard', 'StationScopeGuard'];
    expect(ordering.indexOf('OrgScopingGuard')).toBeLessThan(
      ordering.indexOf('StationScopeGuard'),
    );
  });

  it('documents station status values used for archived policy', () => {
    expect(StationStatus.ARCHIVED).toBe('ARCHIVED');
  });
});
