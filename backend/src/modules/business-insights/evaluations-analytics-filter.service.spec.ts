import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import { EvaluationsAnalyticsFilterService } from './evaluations-analytics-filter.service';

describe('EvaluationsAnalyticsFilterService', () => {
  const orgId = 'org-filter-test';
  const stationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const foreignStationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const vehicleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Berlin' }) },
    vehicle: {
      findMany: jest.fn().mockResolvedValue([{ id: vehicleId }]),
      findFirst: jest.fn().mockResolvedValue({ id: vehicleId }),
    },
    rentalVehicleCategory: {
      findFirst: jest.fn().mockResolvedValue({ id: 'class-1' }),
    },
  };

  const stationAccess = {
    resolve: jest.fn().mockResolvedValue({
      bypassScope: false,
      allowedStationIds: [stationId],
      membershipRole: 'ORG_ADMIN',
      userId: 'user-1',
    }),
    assertStationReadable: jest.fn((access, id: string) => {
      if (!access.allowedStationIds.includes(id)) {
        throw new NotFoundException(`Station ${id} not found`);
      }
    }),
    buildVehicleStationScopeWhere: jest.fn().mockReturnValue({
      OR: [{ homeStationId: { in: [stationId] } }, { currentStationId: { in: [stationId] } }],
    }),
  };

  let service: EvaluationsAnalyticsFilterService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluationsAnalyticsFilterService,
        { provide: PrismaService, useValue: prisma },
        { provide: StationAccessService, useValue: stationAccess },
      ],
    }).compile();
    service = moduleRef.get(EvaluationsAnalyticsFilterService);
  });

  it('resolves single station filter with scoped vehicle ids', async () => {
    const resolved = await service.resolve(orgId, 'user-1', { stationId });
    expect(resolved.stationId).toBe(stationId);
    expect(resolved.stationVehicleIds?.has(vehicleId)).toBe(true);
  });

  it('rejects foreign station id via station access', async () => {
    await expect(
      service.resolve(orgId, 'user-1', { stationId: foreignStationId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects bookingChannel as unsupported combination', async () => {
    await expect(
      service.resolve(orgId, 'user-1', { bookingChannel: 'WEBSITE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects dataQuality section filters on insights path', async () => {
    await expect(
      service.resolve(orgId, 'user-1', { dataQualityStatus: 'PARTIAL' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows combined vehicleStatus and station filters', async () => {
    const resolved = await service.resolve(orgId, 'user-1', {
      stationId,
      vehicleStatus: 'AVAILABLE',
    });
    expect(resolved.vehicleStatus).toBe('AVAILABLE');
    expect(resolved.scopedVehicleIds).toBeTruthy();
  });
});
