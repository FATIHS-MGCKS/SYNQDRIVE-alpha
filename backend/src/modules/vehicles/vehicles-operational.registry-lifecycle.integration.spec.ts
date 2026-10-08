import { VehiclesOperationalService } from './vehicles-operational.service';
import type { PrismaService } from '@shared/database/prisma.service';
import type { PlatformAdminService } from '@modules/platform-admin/platform-admin.service';
import type { PlatformConnectivitySummaryService } from '@modules/platform-admin/platform-dashboard.service';
import type { VehiclesService } from './vehicles.service';

describe('VehiclesOperationalService registryLifecycle (integration query path)', () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = {
    vehicle: { findMany, count },
    dimoVehicle: { findMany: jest.fn(), count: jest.fn() },
    organization: { findUnique: jest.fn() },
  } as unknown as PrismaService;

  const platformAdmin = {} as PlatformAdminService;
  const connectivitySummary = {
    getPlatformSummary: jest.fn().mockResolvedValue({ freshness: {} }),
  } as unknown as PlatformConnectivitySummaryService;
  const vehiclesService = {} as VehiclesService;

  let svc: VehiclesOperationalService;

  beforeEach(() => {
    findMany.mockClear();
    count.mockClear();
    svc = new VehiclesOperationalService(prisma, platformAdmin, connectivitySummary, vehiclesService);
    jest.spyOn(svc as unknown as { loadPlatformDimoContext: () => Promise<unknown> }, 'loadPlatformDimoContext').mockResolvedValue({
      degraded: false,
      message: null,
    });
    jest
      .spyOn(svc as unknown as { loadPollLogsForVehicles: () => Promise<Map<string, unknown>> }, 'loadPollLogsForVehicles')
      .mockResolvedValue(new Map());
  });

  async function listLifecycle(
    registryLifecycle?: 'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED' | 'all',
  ) {
    const query = {
      page: 2,
      limit: 10,
      registrationState: 'registered' as const,
      ...(registryLifecycle !== undefined ? { registryLifecycle } : {}),
    };
    return svc.findAllOperational(query);
  }

  it('ACTIVE filter applied in prisma where before pagination', async () => {
    await listLifecycle('ACTIVE');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ registryLifecycle: 'ACTIVE' }),
        skip: 10,
        take: 10,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: expect.objectContaining({ registryLifecycle: 'ACTIVE' }) });
  });

  it('OFFBOARDED and ARCHIVED filters', async () => {
    await svc.findAllOperational({ registryLifecycle: 'OFFBOARDED', page: 1, limit: 5 });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ registryLifecycle: 'OFFBOARDED' });

    await svc.findAllOperational({ registryLifecycle: 'ARCHIVED', page: 1, limit: 5 });
    expect(findMany.mock.calls[1][0].where).toMatchObject({ registryLifecycle: 'ARCHIVED' });
  });

  it('all and omitted lifecycle do not add registryLifecycle predicate', async () => {
    await svc.findAllOperational({ registryLifecycle: 'all', page: 1, limit: 5 });
    expect(findMany.mock.calls[0][0].where.registryLifecycle).toBeUndefined();

    await svc.findAllOperational({ page: 1, limit: 5, registrationState: 'registered' });
    expect(findMany.mock.calls[1][0].where.registryLifecycle).toBeUndefined();
  });

  it('organization scope preserved in where', async () => {
    await svc.findAllOperational({
      registryLifecycle: 'ACTIVE',
      organizationId: 'org-99',
      page: 1,
      limit: 5,
    });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      registryLifecycle: 'ACTIVE',
      organizationId: 'org-99',
    });
  });

  it('unregistered path uses dimoVehicle queries (mirror unchanged)', async () => {
    const dimoFindMany = prisma.dimoVehicle.findMany as jest.Mock;
    dimoFindMany.mockResolvedValue([]);
    (prisma.dimoVehicle.count as jest.Mock).mockResolvedValue(0);
    await svc.findAllOperational({ registrationState: 'unregistered', page: 1, limit: 5 });
    expect(dimoFindMany).toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('getOverview still samples registered list without lifecycle default filter', async () => {
    (prisma.vehicle.count as jest.Mock)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    (prisma.dimoVehicle.count as jest.Mock).mockResolvedValue(1);
    const overview = await svc.getOverview();
    expect(overview.counts.registered).toBe(3);
    const sampleCall = findMany.mock.calls.find((c) => c[0].take === 500);
    expect(sampleCall?.[0].where?.registryLifecycle).toBeUndefined();
  });
});
