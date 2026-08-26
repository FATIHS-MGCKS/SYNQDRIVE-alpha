import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../lib/api';
import type { BookingUiRow } from '../components/bookings/bookingTypes';
import type { VehicleData } from '../data/vehicles';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import {
  evaluateBookingVehicleEligibility,
} from './booking-vehicle-eligibility';
import {
  isBookingVehicleHardBlocked,
  resolveBookingVehiclePreflight,
} from './booking-vehicle-preflight';

const NOW_ISO = '2026-08-26T12:00:00.000Z';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v-1',
    license: 'B 1',
    model: 'Golf',
    year: 2024,
    station: 'Berlin',
    fuelType: 'Petrol',
    status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: NOW_ISO,
    badge: 0,
    odometer: 10000,
    fuel: 80,
    operationalAvailability: { state: 'AVAILABLE', generatedAt: NOW_ISO },
    operationalState: {
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      reason: null,
      source: 'fleet-read-model',
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: NOW_ISO,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
    },
    ...overrides,
  } as VehicleData;
}

function health(overrides: Partial<VehicleHealthResponse> = {}): VehicleHealthResponse {
  return {
    vehicle_id: 'v-1',
    organization_id: 'org-1',
    overall_state: 'good',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {} as VehicleHealthResponse['modules'],
    generated_at: NOW_ISO,
    availability: 'ready',
    ...overrides,
  };
}

function bookingRow(overrides: Partial<BookingUiRow> & { id: string; vehicleId: string }): BookingUiRow {
  return {
    id: overrides.id,
    vehicleId: overrides.vehicleId,
    customer: 'A',
    vehicle: 'Golf',
    plate: 'B-1',
    status: 'active',
    startDate: '20 Aug 2026',
    endDate: '22 Aug 2026',
    startTime: '10:00',
    endTime: '10:00',
    pickupLocation: 'Berlin',
    returnLocation: 'Berlin',
    revenue: 100,
    days: [20, 21, 22],
    startDay: 20,
    endDay: 22,
    startMonth: 7,
    endMonth: 7,
    startYear: 2026,
    endYear: 2026,
    _raw: {
      startDate: '2026-08-20T10:00:00.000Z',
      endDate: '2026-08-22T10:00:00.000Z',
      statusEnum: 'ACTIVE',
    },
    ...overrides,
  };
}

const BOOKING_KEYS = [
  'booking.eligibility.conflict',
  'booking.eligibility.businessBlocked',
  'booking.eligibility.maintenance',
  'booking.eligibility.noTariff',
  'booking.eligibility.statusUnavailable',
  'booking.eligibility.notAvailable',
  'booking.eligibility.notRentable',
  'booking.eligibility.healthNotLoaded',
  'booking.eligibility.healthLoading',
  'booking.eligibility.vehicleNotAvailable',
  'booking.eligibility.caution.rented',
  'booking.eligibility.caution.reserved',
  'booking.eligibility.caution.healthCritical',
  'booking.eligibility.caution.healthWarning',
] as const satisfies readonly TranslationKey[];

describe('booking eligibility i18n', () => {
  it('defines DE/EN keys for booking eligibility copy', () => {
    for (const key of BOOKING_KEYS) {
      expect(de[key], `missing de ${key}`).toBeTruthy();
      expect(en[key], `missing en ${key}`).toBeTruthy();
    }
  });
});

describe('booking preflight real-path integration', () => {
  const futurePickup = '2026-09-01T10:00:00.000Z';
  const futureReturn = '2026-09-05T10:00:00.000Z';
  const overlapPickup = '2026-08-21T10:00:00.000Z';
  const overlapReturn = '2026-08-23T10:00:00.000Z';

  const activeBooking = bookingRow({ id: 'bk-active', vehicleId: 'v-1' });

  const baseOptions = {
    locale: 'en' as const,
    bookingRows: [activeBooking],
    pickupAt: futurePickup,
    returnAt: futureReturn,
    healthLoading: false,
    healthRecordAbsent: false,
  };

  it('A. overlapping requested interval => booking_conflict via preflight', () => {
    const result = resolveBookingVehiclePreflight(
      vehicle(),
      health(),
      true,
      false,
      {
        ...baseOptions,
        pickupAt: overlapPickup,
        returnAt: overlapReturn,
      },
    );
    expect(result.isSelectable).toBe(false);
    expect(result.hardBlockReason).toBe('booking_conflict');
    expect(result.primaryDenialDomain).toBe('booking_conflict');
  });

  it('B. ACTIVE_RENTED now + non-overlapping future interval => selectable with caution', () => {
    const rented = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        reason: null,
        source: 'fleet-read-model',
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: NOW_ISO,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
        isReliable: true,
      },
    });
    const result = resolveBookingVehiclePreflight(rented, health(), true, false, baseOptions);
    expect(result.isSelectable).toBe(true);
    expect(result.cautionReason).toBe(en['booking.eligibility.caution.rented']);
  });

  it('C. editing existing booking excludes self from overlap', () => {
    const result = resolveBookingVehiclePreflight(
      vehicle(),
      health(),
      true,
      false,
      {
        ...baseOptions,
        pickupAt: overlapPickup,
        returnAt: overlapReturn,
        excludeBookingId: 'bk-active',
      },
    );
    expect(result.isSelectable).toBe(true);
  });

  it('D. edit dates overlapping another booking => blocked', () => {
    const other = bookingRow({
      id: 'bk-other',
      vehicleId: 'v-1',
      _raw: {
        startDate: '2026-08-21T10:00:00.000Z',
        endDate: '2026-08-23T10:00:00.000Z',
        statusEnum: 'CONFIRMED',
      },
    });
    const result = resolveBookingVehiclePreflight(
      vehicle(),
      health(),
      true,
      false,
      {
        locale: 'en',
        bookingRows: [activeBooking, other],
        pickupAt: overlapPickup,
        returnAt: overlapReturn,
        excludeBookingId: 'bk-active',
        healthLoading: false,
      },
    );
    expect(result.isSelectable).toBe(false);
    expect(result.hardBlockReason).toBe('booking_conflict');
  });

  it('E. operational AVAILABLE cannot override booking conflict', () => {
    const result = resolveBookingVehiclePreflight(
      vehicle({ operationalAvailability: { state: 'AVAILABLE', generatedAt: NOW_ISO } }),
      health(),
      true,
      false,
      {
        ...baseOptions,
        pickupAt: overlapPickup,
        returnAt: overlapReturn,
      },
    );
    expect(result.operationalGatePass).toBe(true);
    expect(result.isSelectable).toBe(false);
    expect(result.hardBlockReason).toBe('booking_conflict');
  });

  it('F. NEEDS_VERIFICATION remains blocked without conflict', () => {
    const result = resolveBookingVehiclePreflight(
      vehicle({ operationalAvailability: { state: 'NEEDS_VERIFICATION', generatedAt: NOW_ISO } }),
      health(),
      true,
      false,
      baseOptions,
    );
    expect(result.isSelectable).toBe(false);
    expect(result.hardBlockReason).toBe('operational_gate');
  });

  it('create rental_blocked => blocked', () => {
    expect(
      isBookingVehicleHardBlocked(vehicle(), health({ rental_blocked: true }), true, false, baseOptions),
    ).toBe(true);
  });

  it('edit candidate rental_blocked => blocked', () => {
    expect(
      isBookingVehicleHardBlocked(
        vehicle({ id: 'v-2' }),
        health({ vehicle_id: 'v-2', rental_blocked: true }),
        true,
        false,
        baseOptions,
      ),
    ).toBe(true);
  });

  it('create rental unverified => blocked', () => {
    expect(
      isBookingVehicleHardBlocked(vehicle(), health({ rental_blocked: null, availability: 'partial' }), true, false, baseOptions),
    ).toBe(true);
  });

  it('edit candidate rental unverified => blocked', () => {
    expect(
      isBookingVehicleHardBlocked(
        vehicle({ id: 'v-2' }),
        health({ vehicle_id: 'v-2', rental_blocked: null, availability: 'partial' }),
        true,
        false,
        baseOptions,
      ),
    ).toBe(true);
  });

  it('health absent after load => blocked as not loaded', () => {
    const result = resolveBookingVehiclePreflight(vehicle(), null, true, false, {
      ...baseOptions,
      healthRecordAbsent: true,
    });
    expect(result.isSelectable).toBe(false);
    expect(result.primaryDenialDomain).toBe('rental_health');
  });

  it('unchanged current edit vehicle bypasses health hard block', () => {
    const result = resolveBookingVehiclePreflight(
      vehicle(),
      health({ rental_blocked: true }),
      true,
      false,
      { ...baseOptions, allowHealthBypass: true },
    );
    expect(result.isSelectable).toBe(true);
  });

  it('maintenance is a hard business block (vehicle detail policy)', () => {
    const maintained = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
        reason: null,
        source: 'fleet-read-model',
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: NOW_ISO,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
        isReliable: true,
      },
    });
    const result = resolveBookingVehiclePreflight(maintained, health(), true, false, baseOptions);
    expect(result.isSelectable).toBe(false);
    expect(result.hardBlockReason).toBe('business_block');
    expect(result.blockingReason).toBe(en['booking.eligibility.maintenance']);
  });

  it('denial precedence: booking conflict beats rental health', () => {
    const result = resolveBookingVehiclePreflight(
      vehicle(),
      health({ rental_blocked: true }),
      true,
      false,
      {
        ...baseOptions,
        pickupAt: overlapPickup,
        returnAt: overlapReturn,
      },
    );
    expect(result.primaryDenialDomain).toBe('booking_conflict');
  });

  it('A. CREATE candidate healthLoading => pending, not selectable, no health failure', () => {
    const result = resolveBookingVehiclePreflight(vehicle(), null, true, false, {
      ...baseOptions,
      healthLoading: true,
    });
    const eligibility = evaluateBookingVehicleEligibility({
      vehicle: vehicle(),
      health: null,
      hasTariff: true,
      healthLoading: true,
      locale: 'en',
    });
    expect(result.isSelectable).toBe(false);
    expect(result.pending).toBe(true);
    expect(result.healthPending).toBe(true);
    expect(result.pendingReason).toBe(en['booking.eligibility.healthLoading']);
    expect(result.hardBlockReason).toBeNull();
    expect(result.primaryDenialDomain).toBeNull();
    expect(result.blockingReason).toBeNull();
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.healthEligible).toBe(false);
    expect(eligibility.healthPending).toBe(true);
    expect(eligibility.primaryDenialDomain).toBeNull();
  });

  it('B. CREATE candidate health loaded + good => selectable', () => {
    const result = resolveBookingVehiclePreflight(vehicle(), health(), true, false, baseOptions);
    expect(result.isSelectable).toBe(true);
    expect(result.pending).toBe(false);
    expect(result.healthPending).toBe(false);
  });

  it('C. CREATE candidate health loaded + rental_blocked => blocked', () => {
    const result = resolveBookingVehiclePreflight(
      vehicle(),
      health({ rental_blocked: true }),
      true,
      false,
      baseOptions,
    );
    expect(result.isSelectable).toBe(false);
    expect(result.pending).toBe(false);
    expect(result.hardBlockReason).toBe('rental_blocked');
    expect(result.primaryDenialDomain).toBe('rental_health');
  });

  it('D. EDIT new candidate healthLoading => pending, not selectable', () => {
    const result = resolveBookingVehiclePreflight(
      vehicle({ id: 'v-2' }),
      null,
      true,
      false,
      {
        ...baseOptions,
        healthLoading: true,
        allowHealthBypass: false,
      },
    );
    expect(result.isSelectable).toBe(false);
    expect(result.healthPending).toBe(true);
    expect(result.pendingReason).toBe(en['booking.eligibility.healthLoading']);
    expect(result.hardBlockReason).toBeNull();
  });

  it('E. EDIT new candidate health loaded + good => selectable', () => {
    const result = resolveBookingVehiclePreflight(
      vehicle({ id: 'v-2' }),
      health({ vehicle_id: 'v-2' }),
      true,
      false,
      baseOptions,
    );
    expect(result.isSelectable).toBe(true);
    expect(result.healthPending).toBe(false);
  });

  it('F. EDIT unchanged current vehicle allowHealthBypass + healthLoading => save may proceed', () => {
    const result = resolveBookingVehiclePreflight(vehicle(), null, true, false, {
      ...baseOptions,
      healthLoading: true,
      allowHealthBypass: true,
    });
    expect(result.isSelectable).toBe(true);
    expect(result.healthPending).toBe(false);
    expect(
      isBookingVehicleHardBlocked(vehicle(), null, true, false, {
        ...baseOptions,
        healthLoading: true,
        allowHealthBypass: true,
      }),
    ).toBe(false);
  });

  it('G. EDIT unchanged current vehicle allowHealthBypass + rental_blocked => save may proceed', () => {
    const result = resolveBookingVehiclePreflight(
      vehicle(),
      health({ rental_blocked: true }),
      true,
      false,
      { ...baseOptions, allowHealthBypass: true },
    );
    expect(result.isSelectable).toBe(true);
    expect(
      isBookingVehicleHardBlocked(vehicle(), health({ rental_blocked: true }), true, false, {
        ...baseOptions,
        allowHealthBypass: true,
      }),
    ).toBe(false);
  });

  it('H. allowHealthBypass does not bypass booking conflict, operational, business, or tariff gates', () => {
    const overlap = resolveBookingVehiclePreflight(
      vehicle(),
      health({ rental_blocked: true }),
      true,
      false,
      {
        ...baseOptions,
        pickupAt: overlapPickup,
        returnAt: overlapReturn,
        allowHealthBypass: true,
      },
    );
    expect(overlap.isSelectable).toBe(false);
    expect(overlap.primaryDenialDomain).toBe('booking_conflict');

    const operational = resolveBookingVehiclePreflight(
      vehicle({ operationalAvailability: { state: 'NEEDS_VERIFICATION', generatedAt: NOW_ISO } }),
      health({ rental_blocked: true }),
      true,
      false,
      { ...baseOptions, allowHealthBypass: true },
    );
    expect(operational.isSelectable).toBe(false);
    expect(operational.hardBlockReason).toBe('operational_gate');

    const maintenance = resolveBookingVehiclePreflight(
      vehicle({
        status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
        operationalState: {
          status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
          reason: null,
          source: 'fleet-read-model',
          effectiveFrom: null,
          effectiveUntil: null,
          derivedAt: NOW_ISO,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
          isReliable: true,
        },
      }),
      health({ rental_blocked: true }),
      true,
      false,
      { ...baseOptions, allowHealthBypass: true },
    );
    expect(maintenance.isSelectable).toBe(false);
    expect(maintenance.hardBlockReason).toBe('business_block');

    const noTariff = resolveBookingVehiclePreflight(
      vehicle(),
      health({ rental_blocked: true }),
      false,
      false,
      { ...baseOptions, allowHealthBypass: true },
    );
    expect(noTariff.isSelectable).toBe(false);
    expect(noTariff.hardBlockReason).toBe('no_tariff');
  });
});
