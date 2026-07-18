import { BadRequestException } from '@nestjs/common';
import { StationValidationService } from './station-validation.service';
import { StationRuleEngineService } from './booking-rules/station-rule-engine.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('StationValidationService', () => {
  const prisma = {
    station: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;

  const stationRuleEngine = {
    assertBookingPersistenceAllowed: jest.fn().mockResolvedValue({
      evaluations: [],
      overallOutcome: 'ALLOWED',
    }),
  } as unknown as StationRuleEngineService;

  const service = new StationValidationService(prisma, stationRuleEngine);

  beforeEach(() => jest.clearAllMocks());

  it('rejects archived station for pickup', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      {
        id: 's1',
        name: 'Alt',
        status: 'ARCHIVED',
        pickupEnabled: true,
        returnEnabled: true,
        organizationId: 'org1',
      },
    ]);

    await expect(
      service.validateBookingStations('org1', { pickupStationId: 's1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects pickup when pickupEnabled is false', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      {
        id: 's1',
        name: 'Nur Rückgabe',
        status: 'ACTIVE',
        pickupEnabled: false,
        returnEnabled: true,
        organizationId: 'org1',
      },
    ]);

    await expect(
      service.validateBookingStations('org1', { pickupStationId: 's1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('computes isOneWayRental from station ids', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'a',
        name: 'A',
        status: 'ACTIVE',
        pickupEnabled: true,
        returnEnabled: true,
      },
      {
        id: 'b',
        name: 'B',
        status: 'ACTIVE',
        pickupEnabled: true,
        returnEnabled: true,
      },
    ]);

    const result = await service.validateBookingStations('org1', {
      pickupStationId: 'a',
      returnStationId: 'b',
    });
    expect(result.isOneWayRental).toBe(true);
  });
});
