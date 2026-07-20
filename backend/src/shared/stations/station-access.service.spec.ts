import { NotFoundException } from '@nestjs/common';
import { StationAccessService } from './station-access.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('StationAccessService', () => {
  const prisma = {
    organizationMembership: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;

  const service = new StationAccessService(prisma);
  const envBackup = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...envBackup };
    process.env.STATIONS_V2_FLAGS_TEST_DEFAULT = 'off';
    process.env.STATIONS_V2_SCHEMA_ENABLED = 'false';
    process.env.STATIONS_V2_SCOPE_ENABLED = 'false';
  });

  afterAll(() => {
    process.env = envBackup;
  });

  it('bypasses scope when stationsScopeV2Enabled is off (SEC-08)', async () => {
    const access = await service.resolve('user-1', 'org-1');
    expect(access.bypassScope).toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('restricts worker to stationIds json (SEC-05/06)', async () => {
    process.env.STATIONS_V2_SCHEMA_ENABLED = 'true';
    process.env.STATIONS_V2_SCOPE_ENABLED = 'true';
    process.env.STATIONS_V2_ORG_ALLOWLIST = 'org-scoped';
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue({
      role: 'WORKER',
      stationScope: null,
      stationIds: ['s1'],
    });

    const access = await service.resolve('user-1', 'org-scoped');
    expect(access.bypassScope).toBe(false);
    expect(access.allowedStationIds).toEqual(['s1']);
    expect(() => service.assertStationReadable(access, 's2')).toThrow(NotFoundException);
  });

  it('builds vehicle station scope where from allowed station ids', () => {
    const where = service.buildVehicleStationScopeWhere({
      bypassScope: false,
      allowedStationIds: ['s1', 's2'],
      membershipRole: 'WORKER',
      userId: 'user-1',
    });

    expect(where).toEqual({
      OR: [{ homeStationId: { in: ['s1', 's2'] } }, { currentStationId: { in: ['s1', 's2'] } }],
    });
  });
});
