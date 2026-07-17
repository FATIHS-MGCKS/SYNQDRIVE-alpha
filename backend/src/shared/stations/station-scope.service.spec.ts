import { MembershipRole, StationStatus } from '@prisma/client';
import { StationScopeErrorCode } from './station-scope.constants';
import { StationScopeForbiddenException } from './station-scope.errors';
import { StationScopeService } from './station-scope.service';

const ORG = 'org-1';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VEHICLE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('StationScopeService', () => {
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
    station: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
  };

  let service: StationScopeService;

  beforeEach(() => {
    service = new StationScopeService(prisma as never);
    jest.clearAllMocks();
  });

  function workerMembership(overrides: Record<string, unknown> = {}) {
    return {
      role: MembershipRole.WORKER,
      stationScope: STATION_A,
      stationIds: [STATION_A],
      permissions: { stationsV2: { read: true } },
      ...overrides,
    };
  }

  function request(overrides: Record<string, unknown> = {}) {
    return {
      method: 'GET',
      params: { orgId: ORG, id: STATION_A },
      query: {},
      body: {},
      user: { id: 'user-1', organizationId: ORG },
      ...overrides,
    };
  }

  it('requires authentication', async () => {
    await expect(
      service.enforceRequestScope({ method: 'GET', params: { orgId: ORG } }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.AUTHENTICATION_REQUIRED,
      }),
    });
  });

  it('rejects cross-organization JWT context', async () => {
    await expect(
      service.enforceRequestScope(
        request({ user: { id: 'user-1', organizationId: 'other-org' } }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.CROSS_ORGANIZATION,
      }),
    });
  });

  it('requires active membership for tenant users', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(service.enforceRequestScope(request())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.MEMBERSHIP_REQUIRED,
      }),
    });
  });

  it('denies NO_STATIONS memberships', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(
      workerMembership({
        role: MembershipRole.DRIVER,
        stationScope: null,
        stationIds: null,
      }),
    );

    await expect(service.enforceRequestScope(request())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.NO_STATIONS,
      }),
    });
  });

  it('denies ASSIGNED_STATIONS with empty stationIds on list routes', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(
      workerMembership({ stationScope: null, stationIds: [] }),
    );

    await expect(
      service.enforceRequestScope(request({ params: { orgId: ORG } }), { resource: 'list' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.NO_STATIONS,
      }),
    });
  });

  it('allows assigned station after DB verification', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(workerMembership());
    prisma.station.findFirst.mockResolvedValue({ status: StationStatus.ACTIVE });

    const ctx = await service.enforceRequestScope(request());

    expect(ctx.allowedStationIds).toEqual([STATION_A]);
    expect(prisma.station.findFirst).toHaveBeenCalledWith({
      where: { id: STATION_A, organizationId: ORG },
      select: { status: true },
    });
  });

  it('denies station outside assigned scope', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(workerMembership());
    prisma.station.findFirst.mockResolvedValue({ status: StationStatus.ACTIVE });

    await expect(
      service.enforceRequestScope(
        request({ params: { orgId: ORG, id: STATION_B } }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.STATION_NOT_IN_SCOPE,
        stationId: STATION_B,
      }),
    });
  });

  it('rejects cross-tenant station ownership', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(workerMembership());
    prisma.station.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: STATION_B });

    await expect(
      service.enforceRequestScope(
        request({ params: { orgId: ORG, id: STATION_B } }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.CROSS_ORGANIZATION,
      }),
    });
  });

  it('rejects invalid station id format without DB trust', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(workerMembership());

    await expect(
      service.enforceRequestScope(
        request({ params: { orgId: ORG, id: 'not-a-uuid' } }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.INVALID_STATION_ID,
      }),
    });

    expect(prisma.station.findFirst).not.toHaveBeenCalled();
  });

  it('allows master admin with org-scoped ALL_STATIONS and verifies tenant', async () => {
    prisma.station.findFirst.mockResolvedValue({ status: StationStatus.ACTIVE });

    const ctx = await service.enforceRequestScope(
      request({
        user: { id: 'master-1', platformRole: 'MASTER_ADMIN' },
      }),
    );

    expect(ctx.mode).toBe('ALL_STATIONS');
    expect(ctx.bypassScope).toBe(true);
  });

  it('allows archived historical read when stations.read is granted', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(workerMembership());
    prisma.station.findFirst.mockResolvedValue({ status: StationStatus.ARCHIVED });

    await expect(service.enforceRequestScope(request())).resolves.toBeDefined();
  });

  it('denies archived historical read without stations.read', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(
      workerMembership({ permissions: { stationsV2: { read: false } } }),
    );
    prisma.station.findFirst.mockResolvedValue({ status: StationStatus.ARCHIVED });

    await expect(service.enforceRequestScope(request())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.ARCHIVED_READ_PERMISSION_REQUIRED,
      }),
    });
  });

  it('denies writes to archived stations', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(workerMembership());
    prisma.station.findFirst.mockResolvedValue({ status: StationStatus.ARCHIVED });

    await expect(
      service.enforceRequestScope(request({ method: 'PATCH' })),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.ARCHIVED_WRITE_FORBIDDEN,
      }),
    });
  });

  it('allows archived restore lifecycle write with stations.restore permission', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(
      workerMembership({ permissions: { stationsV2: { read: true, restore: true } } }),
    );
    prisma.station.findFirst.mockResolvedValue({ status: StationStatus.ARCHIVED });

    await expect(
      service.enforceRequestScope(request({ method: 'POST' }), {
        resource: 'station',
        allowArchivedLifecycleWrite: true,
      }),
    ).resolves.toBeDefined();
  });

  it('denies archived restore lifecycle write without stations.restore permission', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(workerMembership());
    prisma.station.findFirst.mockResolvedValue({ status: StationStatus.ARCHIVED });

    await expect(
      service.enforceRequestScope(request({ method: 'POST' }), {
        resource: 'station',
        allowArchivedLifecycleWrite: true,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.ARCHIVED_RESTORE_PERMISSION_REQUIRED,
      }),
    });
  });

  it('allows nested vehicle when any linked station is in scope', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(workerMembership());
    prisma.vehicle.findFirst.mockResolvedValue({
      homeStationId: STATION_A,
      currentStationId: STATION_B,
      expectedStationId: null,
    });
    prisma.station.findFirst.mockResolvedValue({ status: StationStatus.ACTIVE });

    await expect(
      service.enforceRequestScope(
        request({
          method: 'PATCH',
          params: { orgId: ORG },
          body: { vehicleId: VEHICLE },
        }),
        { resource: 'vehicle' },
      ),
    ).resolves.toBeDefined();

    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: VEHICLE, organizationId: ORG },
      select: {
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
      },
    });
  });

  it('denies nested vehicle when no linked station is in scope', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(workerMembership());
    prisma.vehicle.findFirst.mockResolvedValue({
      homeStationId: STATION_B,
      currentStationId: STATION_B,
      expectedStationId: null,
    });
    prisma.station.findFirst.mockResolvedValue({ status: StationStatus.ACTIVE });

    await expect(
      service.enforceRequestScope(
        request({
          method: 'PATCH',
          params: { orgId: ORG },
          body: { vehicleId: VEHICLE },
        }),
        { resource: 'vehicle' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.NESTED_RESOURCE_OUT_OF_SCOPE,
      }),
    });
  });

  it('passes through none resource without membership lookup', async () => {
    const ctx = await service.enforceRequestScope(
      request({ user: { id: 'user-1', organizationId: ORG } }),
      { resource: 'none' },
    );

    expect(ctx.bypassScope).toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('allows create without existing station id but still blocks NO_STATIONS', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(
      workerMembership({
        role: MembershipRole.DRIVER,
        stationScope: null,
        stationIds: null,
      }),
    );

    await expect(
      service.enforceRequestScope(
        request({ method: 'POST', params: { orgId: ORG } }),
        { resource: 'create' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationScopeErrorCode.NO_STATIONS,
      }),
    });
  });

  it('allows create for assigned memberships without station route id', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(workerMembership());

    const ctx = await service.enforceRequestScope(
      request({ method: 'POST', params: { orgId: ORG } }),
      { resource: 'create' },
    );

    expect(ctx.mode).toBe('ASSIGNED_STATIONS');
    expect(prisma.station.findFirst).not.toHaveBeenCalled();
  });

  it('scopes vehicle_location mutations by vehicle and target station ids', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(workerMembership());
    prisma.vehicle.findFirst.mockResolvedValue({
      homeStationId: STATION_A,
      currentStationId: STATION_B,
      expectedStationId: null,
    });
    prisma.station.findFirst.mockResolvedValue({ status: StationStatus.ACTIVE });

    await expect(
      service.enforceRequestScope(
        request({
          method: 'PATCH',
          params: { orgId: ORG },
          body: { vehicleId: VEHICLE, currentStationId: STATION_A },
        }),
        { resource: 'vehicle_location' },
      ),
    ).resolves.toBeDefined();
  });

  it('throws structured forbidden payloads', () => {
    try {
      throw new StationScopeForbiddenException({
        statusCode: 403,
        code: StationScopeErrorCode.STATION_NOT_IN_SCOPE,
        message: 'test',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(StationScopeForbiddenException);
      expect((error as StationScopeForbiddenException).getResponse()).toEqual({
        statusCode: 403,
        code: StationScopeErrorCode.STATION_NOT_IN_SCOPE,
        message: 'test',
      });
    }
  });
});
