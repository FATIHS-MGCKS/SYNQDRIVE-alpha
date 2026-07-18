import { StationBookingRulesService } from './station-booking-rules.service';
import {
  StationBookingRuleOutcome,
  StationBookingRulesBookingChannel,
  StationBookingRulesBookingType,
} from '@shared/stations/station-booking-rules.contract';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';

const ORG_ID = 'org-booking-service';
const STATION = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: ORG_ID,
  status: 'ACTIVE' as const,
  pickupEnabled: true,
  returnEnabled: true,
  afterHoursReturnEnabled: false,
  keyBoxAvailable: false,
  timezone: 'Europe/Berlin',
  openingHours: {
    version: 2,
    monday: { slots: [{ open: '09:00', close: '18:00' }] },
    tuesday: { slots: [{ open: '09:00', close: '18:00' }] },
    wednesday: { slots: [{ open: '09:00', close: '18:00' }] },
    thursday: { slots: [{ open: '09:00', close: '18:00' }] },
    friday: { slots: [{ open: '09:00', close: '18:00' }] },
    saturday: { closed: true },
    sunday: { closed: true },
  },
  calendarExceptions: [],
};

describe('StationBookingRulesService', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
  } as unknown as PrismaService;

  const stationAccessScope = {
    resolveFromContextOrEmpty: jest.fn(),
    requireReadableStation: jest.fn(),
  } as unknown as StationAccessScopeService;

  const service = new StationBookingRulesService(prisma, stationAccessScope);

  beforeEach(() => {
    jest.clearAllMocks();
    (stationAccessScope.resolveFromContextOrEmpty as jest.Mock).mockReturnValue({
      orgId: ORG_ID,
    });
  });

  it('delegates evaluation to the shared resolver', () => {
    const result = service.evaluate({
      organizationId: ORG_ID,
      pickupStation: STATION,
      returnStation: { ...STATION, id: STATION.id },
      pickupDateTime: '2026-07-14T08:00:00.000Z',
      returnDateTime: '2026-07-17T08:00:00.000Z',
      bookingType: StationBookingRulesBookingType.STANDARD,
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.return.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.pickup.evaluatedInstant.instantUtc).toBeTruthy();
    expect(result.pickup.evaluatedInstant.localDate).toBeTruthy();
  });

  it('evaluates pickup rules directly with admin override support', () => {
    const result = service.evaluatePickup({
      organizationId: ORG_ID,
      pickupStation: STATION,
      pickupDateTime: '2026-07-14T22:00:00.000Z',
      bookingType: StationBookingRulesBookingType.STANDARD,
      bookingContext: {
        channel: StationBookingRulesBookingChannel.INTERNAL_ADMIN,
        adminOverride: {
          enabled: true,
          reason: 'Approved after-hours pickup',
        },
      },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.adminOverrideApplied).toBe(true);
  });

  it('evaluates return rules directly with after-hours presentation', () => {
    const result = service.evaluateReturn({
      organizationId: ORG_ID,
      returnStation: {
        ...STATION,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
      },
      returnDateTime: '2026-07-17T18:00:00.000Z',
      bookingType: StationBookingRulesBookingType.STANDARD,
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.side).toBe('return');
    expect(result.evaluatedInstant.timezone).toBe('Europe/Berlin');
  });

  it('exposes contract metadata without booking integration or frontend recomputation', () => {
    expect(service.getContractMetadata().bookingIntegration).toBe(false);
    expect(service.getContractMetadata().frontendRecomputation).toBe(false);
    expect(service.getContractMetadata().instantEvaluation).toBe('station_timezone');
    expect(service.getPickupRulesMetadata().contract).toBe('station-booking-pickup-rules');
    expect(service.getReturnRulesMetadata().contract).toBe('station-booking-return-rules');
    expect(service.getMetadata().contract).toBe('station-booking-rules');
  });
});
