import { StationBookingRulesService } from './station-booking-rules.service';
import {
  StationBookingRuleOutcome,
  StationBookingRulesBookingType,
} from '@shared/stations/station-booking-rules.contract';

const STATION = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
  const service = new StationBookingRulesService();

  it('delegates evaluation to the shared resolver', () => {
    const result = service.evaluate({
      pickupStation: STATION,
      returnStation: { ...STATION, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      pickupDateTime: '2026-07-14T08:00:00.000Z',
      returnDateTime: '2026-07-17T08:00:00.000Z',
      bookingType: StationBookingRulesBookingType.STANDARD,
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.return.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
  });

  it('exposes contract metadata without booking integration', () => {
    expect(service.getContractMetadata().bookingIntegration).toBe(false);
    expect(service.getMetadata().contract).toBe('station-booking-rules');
  });
});
