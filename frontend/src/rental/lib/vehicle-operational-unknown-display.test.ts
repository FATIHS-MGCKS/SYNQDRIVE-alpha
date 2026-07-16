import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../data/vehicles';
import {
  canViewOperationalStatusDiagnostics,
  isOperationalStatusUnreliable,
  resolveOperationalStatusDiagnostics,
  resolveUnreliableOperationalStatusDisplay,
} from './vehicle-operational-unknown-display';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';

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
      reason: 'booking_context_conflict',
      source: 'runtime',
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: '2026-07-15T10:00:00.000Z',
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
      dataQualityReasons: ['payload_inconsistent'],
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

describe('isOperationalStatusUnreliable', () => {
  it('returns true for UNKNOWN status', () => {
    expect(
      isOperationalStatusUnreliable(
        vehicle({ status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN }),
      ),
    ).toBe(true);
  });

  it('returns true for UNAVAILABLE data quality', () => {
    expect(
      isOperationalStatusUnreliable(
        vehicle({
          operationalState: {
            status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
            reason: null,
            source: null,
            effectiveFrom: null,
            effectiveUntil: null,
            derivedAt: null,
            dataQualityState: VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE,
            dataQualityReasons: ['backend_unavailable'],
            isReliable: false,
          },
        }),
      ),
    ).toBe(true);
  });

  it('returns true when AVAILABLE is degraded and not reliable', () => {
    expect(
      isOperationalStatusUnreliable(
        vehicle({
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
      ),
    ).toBe(true);
  });

  it('returns false for reliable AVAILABLE', () => {
    expect(isOperationalStatusUnreliable(vehicle())).toBe(false);
  });
});

describe('resolveUnreliableOperationalStatusDisplay', () => {
  it('uses neutral German copy for UNKNOWN', () => {
    const display = resolveUnreliableOperationalStatusDisplay(
      vehicle({ status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN }),
      { locale: 'de' },
    );
    expect(display?.badgeLabel).toBe('Status nicht verfügbar');
    expect(display?.explanation).toMatch(/Buchungszustand/i);
    expect(display?.tone).toBe('neutral');
  });

  it('uses English copy when requested', () => {
    const display = resolveUnreliableOperationalStatusDisplay(
      vehicle({ status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN }),
      { locale: 'en' },
    );
    expect(display?.badgeLabel).toBe('Status unavailable');
    expect(display?.explanation).toMatch(/booking state/i);
  });

  it('returns null for reliable vehicles', () => {
    expect(resolveUnreliableOperationalStatusDisplay(vehicle())).toBeNull();
  });
});

describe('resolveOperationalStatusDiagnostics', () => {
  it('includes sanitized admin fields', () => {
    const diagnostics = resolveOperationalStatusDiagnostics(
      vehicle({ status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN }),
      { locale: 'de' },
    );
    expect(diagnostics?.fields.map((field) => field.key)).toEqual([
      'reason',
      'dataQualityState',
      'derivedAt',
      'diagnosticReasons',
    ]);
    expect(diagnostics?.fields.find((f) => f.key === 'reason')?.value).toBe(
      'booking_context_conflict',
    );
    expect(diagnostics?.fields.find((f) => f.key === 'diagnosticReasons')?.value).toBe(
      'payload_inconsistent',
    );
  });

  it('filters stacktrace-like diagnostic text', () => {
    const diagnostics = resolveOperationalStatusDiagnostics(
      vehicle({
        status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
        operationalState: {
          status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
          reason: 'Error: TypeError at stack trace line 42',
          source: null,
          effectiveFrom: null,
          effectiveUntil: null,
          derivedAt: null,
          dataQualityState: VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE,
          dataQualityReasons: [],
          isReliable: false,
        },
      }),
      { locale: 'de' },
    );
    expect(diagnostics?.fields.find((f) => f.key === 'reason')?.value).toBe('—');
  });
});

describe('canViewOperationalStatusDiagnostics', () => {
  const deny = () => false;

  it('allows ORG_ADMIN', () => {
    expect(
      canViewOperationalStatusDiagnostics({
        userRole: 'ORG_ADMIN',
        hasPermission: deny,
      }),
    ).toBe(true);
  });

  it('allows data-analyse read permission', () => {
    expect(
      canViewOperationalStatusDiagnostics({
        userRole: 'WORKER',
        hasPermission: (module, level) => module === 'data-analyse' && level === 'read',
      }),
    ).toBe(true);
  });

  it('denies users without admin diagnostic permission', () => {
    expect(
      canViewOperationalStatusDiagnostics({
        userRole: 'WORKER',
        hasPermission: deny,
      }),
    ).toBe(false);
  });
});
