import { StationsV2ConfigService } from '../stations-v2-config.service';
import { StationRuleEngineService } from './station-rule-engine.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('StationRuleEngineService', () => {
  const prisma = {
    station: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    vehicle: {
      count: jest.fn(),
    },
  } as unknown as PrismaService;

  const config = {
    resolve: jest.fn().mockReturnValue({
      stationBookingRulesEnabled: true,
      bookingRulesEnforcement: 'enforce',
      stationCapacityWarningsEnabled: true,
    }),
  } as unknown as StationsV2ConfigService;

  const service = new StationRuleEngineService(prisma, config);

  beforeEach(() => jest.clearAllMocks());

  it('returns ALLOWED when booking rules are disabled', async () => {
    (config.resolve as jest.Mock).mockReturnValueOnce({
      stationBookingRulesEnabled: false,
      bookingRulesEnforcement: 'off',
      stationCapacityWarningsEnabled: false,
    });

    const result = await service.evaluate({
      organizationId: 'org-1',
      pickupStationId: 's1',
      returnStationId: 's1',
    });
    expect(result.overallOutcome).toBe('ALLOWED');
  });

  it('blocks archived pickup station', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      {
        id: 's1',
        name: 'Alt',
        status: 'ARCHIVED',
        pickupEnabled: true,
        returnEnabled: true,
        openingHours: null,
        holidayRules: null,
        timezone: 'Europe/Berlin',
        afterHoursReturnEnabled: false,
      },
    ]);

    const result = await service.evaluate({
      organizationId: 'org-1',
      pickupStationId: 's1',
      returnStationId: null,
    });
    expect(result.overallOutcome).toBe('BLOCKED');
  });
});
