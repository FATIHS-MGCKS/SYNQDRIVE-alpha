import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../data/vehicles';
import {
  formatOperationalDateRange,
  formatOperationalDateTime,
  resolveBookingSupplement,
  resolveOperationalStatusBadge,
  truncateMiddle,
} from './vehicle-operational-booking-display';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';

const TZ = 'Europe/Berlin';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  const status = overrides.status ?? VEHICLE_OPERATIONAL_STATUS.AVAILABLE;
  return {
    id: 'v1',
    license: 'KS-FS 123',
    make: 'VW',
    model: 'Golf',
    year: 2024,
    station: 'Zentrale',
    stationId: 'st-1',
    fuelType: 'Petrol',
    status,
    operationalState: {
      status,
      reason: null,
      source: null,
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: null,
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
      dataQualityReasons: [],
      isReliable: true,
      ...overrides.operationalState,
    },
    bookingContext: {
      activeBooking: null,
      reservedBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
      ...overrides.bookingContext,
    },
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: new Date().toISOString(),
    badge: 0,
    odometer: 10000,
    fuel: 72,
    battery: 100,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    lat: 51.31,
    lng: 9.48,
    fuelPercent: 72,
    odometerKm: 1989,
    isFresh: true,
    onlineStatus: 'ONLINE',
    leasingRate: '',
    insuranceCost: '',
    ...overrides,
  } as VehicleData;
}

describe('truncateMiddle', () => {
  it('keeps short strings intact', () => {
    expect(truncateMiddle('Anna Müller', 22)).toBe('Anna Müller');
  });

  it('truncates long customer names in the middle', () => {
    const long = 'Internationale Mietwagen Gesellschaft Nord GmbH';
    expect(truncateMiddle(long, 24).length).toBeLessThanOrEqual(24);
    expect(truncateMiddle(long, 24)).toContain('…');
  });
});

describe('resolveOperationalStatusBadge', () => {
  it('maps all canonical operational statuses', () => {
    const cases = [
      VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      VEHICLE_OPERATIONAL_STATUS.RESERVED,
      VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
      VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
      VEHICLE_OPERATIONAL_STATUS.BLOCKED,
      VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
    ] as const;

    for (const status of cases) {
      const badge = resolveOperationalStatusBadge(vehicle({ status }), { locale: 'de' });
      expect(badge.status).toBe(status);
      expect(badge.label.length).toBeGreaterThan(0);
    }
  });

  it('UNKNOWN is neutral and includes a data-quality hint', () => {
    const badge = resolveOperationalStatusBadge(
      vehicle({ status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN }),
      { locale: 'de' },
    );
    expect(badge.tone).toBe('neutral');
    expect(badge.isUnknown).toBe(true);
    expect(badge.showUnreliableCallout).toBe(true);
    expect(badge.label).toBe('Status nicht verfügbar');
    expect(badge.dataQualityHint).toMatch(/Buchungszustand/i);
    expect(badge.label).not.toMatch(/verfügbar.*available/i);
  });

  it('does not show green Available tone for unreliable AVAILABLE status', () => {
    const badge = resolveOperationalStatusBadge(
      vehicle({
        status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
        operationalState: {
          status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
          reason: null,
          source: null,
          effectiveFrom: null,
          effectiveUntil: null,
          derivedAt: null,
          dataQualityState: VEHICLE_DATA_QUALITY_STATE.DEGRADED,
          dataQualityReasons: [],
          isReliable: false,
        },
      }),
      { locale: 'en' },
    );
    expect(badge.status).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
    expect(badge.tone).not.toBe('success');
    expect(badge.showUnreliableCallout).toBe(true);
  });

  it('suppresses booking supplement when status is unreliable', () => {
    const supplement = resolveBookingSupplement(
      vehicle({
        status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
        bookingContext: {
          activeBooking: null,
          reservedBooking: null,
          nextBooking: {
            bookingId: 'bk-next',
            customerName: 'Future',
            pickupAt: '2026-09-01T08:00:00.000Z',
            returnAt: '2026-09-05T10:00:00.000Z',
            pickupStationName: null,
            returnStationName: null,
            isOverdue: false,
          },
          futureBookingCount: 1,
        },
      }),
      { locale: 'de' },
    );
    expect(supplement).toBeNull();
  });
});

describe('resolveBookingSupplement', () => {
  it('shows next booking range for Available vehicles', () => {
    const supplement = resolveBookingSupplement(
      vehicle({
        status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
        bookingContext: {
          activeBooking: null,
          reservedBooking: null,
          nextBooking: {
            bookingId: 'bk-next-001',
            customerName: 'Max Mustermann',
            pickupAt: '2026-08-01T08:00:00.000Z',
            returnAt: '2026-08-06T18:00:00.000Z',
            pickupStationName: 'Zentrale',
            returnStationName: 'Zentrale',
            isOverdue: false,
          },
          futureBookingCount: 1,
        },
      }),
      { locale: 'de', timeZone: TZ, compact: true },
    );

    expect(supplement?.short).toMatch(/^Nächste Buchung:/);
    expect(supplement?.short).toMatch(/08.*2026/);
    expect(supplement?.detail).toContain('Max Mustermann');
    expect(supplement?.detail).not.toContain('bk-next-001');
  });

  it('shows pickup today for Reserved vehicles', () => {
    const supplement = resolveBookingSupplement(
      vehicle({
        status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
        bookingContext: {
          activeBooking: null,
          reservedBooking: {
            bookingId: 'bk-res-001',
            customerName: 'Erika Beispiel',
            pickupAt: '2026-07-15T08:00:00.000Z',
            returnAt: '2026-07-20T10:00:00.000Z',
            pickupStationName: 'Zentrale',
            returnStationName: 'Zentrale',
            isOverdue: false,
          },
          nextBooking: null,
          futureBookingCount: 0,
        },
      }),
      {
        locale: 'de',
        timeZone: TZ,
        now: new Date('2026-07-15T07:00:00.000Z').getTime(),
      },
    );

    expect(supplement?.short).toMatch(/Abholung heute um/i);
    expect(supplement?.detail).toContain('Erika Beispiel');
  });

  it('shows return datetime for Active Rented vehicles', () => {
    const supplement = resolveBookingSupplement(
      vehicle({
        status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        bookingContext: {
          activeBooking: {
            bookingId: 'bk-active-001',
            customerName: 'Lisa Fahrer',
            pickupAt: '2026-08-01T08:00:00.000Z',
            returnAt: '2026-08-06T10:00:00.000Z',
            pickupStationName: 'Zentrale',
            returnStationName: 'Zentrale',
            isOverdue: false,
          },
          reservedBooking: null,
          nextBooking: null,
          futureBookingCount: 0,
        },
      }),
      {
        locale: 'de',
        timeZone: TZ,
        now: new Date('2026-08-05T12:00:00.000Z').getTime(),
      },
    );

    expect(supplement?.short).toMatch(/^Rückgabe /);
    expect(supplement?.detail).toContain('Lisa Fahrer');
  });

  it('keeps active return primary when active and nextBooking coexist', () => {
    const supplement = resolveBookingSupplement(
      vehicle({
        status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        bookingContext: {
          activeBooking: {
            bookingId: 'bk-active-001',
            customerName: 'Aktuell',
            pickupAt: '2026-08-01T08:00:00.000Z',
            returnAt: '2026-08-06T10:00:00.000Z',
            pickupStationName: null,
            returnStationName: null,
            isOverdue: false,
          },
          reservedBooking: null,
          nextBooking: {
            bookingId: 'bk-next-002',
            customerName: 'Danach',
            pickupAt: '2026-08-10T08:00:00.000Z',
            returnAt: '2026-08-12T10:00:00.000Z',
            pickupStationName: null,
            returnStationName: null,
            isOverdue: false,
          },
          futureBookingCount: 1,
        },
      }),
      { locale: 'de', timeZone: TZ },
    );

    expect(supplement?.short).toMatch(/^Rückgabe /);
    expect(supplement?.detail).toMatch(/Nächste Buchung:/);
  });

  it('does not treat nextBooking alone as reserved pickup', () => {
    const supplement = resolveBookingSupplement(
      vehicle({
        status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
        bookingContext: {
          activeBooking: null,
          reservedBooking: null,
          nextBooking: {
            bookingId: 'bk-next-only',
            customerName: 'Future',
            pickupAt: '2026-09-01T08:00:00.000Z',
            returnAt: '2026-09-05T10:00:00.000Z',
            pickupStationName: null,
            returnStationName: null,
            isOverdue: false,
          },
          futureBookingCount: 1,
        },
      }),
      { locale: 'en', timeZone: TZ, compact: true },
    );

    expect(supplement?.short).toMatch(/^Next booking:/);
    expect(supplement?.short).not.toMatch(/Pickup today/i);
  });
});

describe('timezone formatting', () => {
  it('formats datetime in the provided timezone', () => {
    const formatted = formatOperationalDateTime('2026-07-15T08:00:00.000Z', {
      locale: 'de',
      timeZone: TZ,
      now: new Date('2026-07-14T12:00:00.000Z').getTime(),
    });
    expect(formatted).toMatch(/15\.07\.2026/i);
  });

  it('formats booking date ranges compactly', () => {
    const range = formatOperationalDateRange(
      '2026-08-01T08:00:00.000Z',
      '2026-08-06T18:00:00.000Z',
      { locale: 'de', timeZone: TZ, compact: true },
    );
    expect(range).toMatch(/01\.08\./);
    expect(range).toMatch(/2026/);
  });
});
