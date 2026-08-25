import { describe, expect, it } from 'vitest';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import type { VehicleData } from '../data/vehicles';
import { OPERATIONAL_AVAILABILITY_STATE } from './operational-availability/types';

function tFor(locale: 'en' | 'de') {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey) => dict[key] ?? key;
}

function baseVehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: 'veh-1',
    license: 'WOB L 7503',
    model: 'Test',
    year: 2024,
    station: 'Home',
    fuelType: 'Petrol',
    status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    operationalState: {
      status: 'AVAILABLE',
      reason: null,
      source: 'test',
      derivedAt: '2026-08-25T12:00:00.000Z',
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
    },
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: '2026-08-25T11:00:00.000Z',
    badge: 0,
    odometer: 1000,
    fuel: 50,
    battery: 0,
    speed: 0,
    coolant: 0,
    brakes: 0,
    tires: 0,
    engineOil: 0,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    leasingRate: '€ 0',
    insuranceCost: '€ 0',
    taxCost: '€ 0',
    totalMonthlyCost: '€ 0',
    ...overrides,
  };
}

describe('resolveFleetVehicleDisplayState — operational availability badge (P0.3)', () => {
  it('uses P0.2 badge on Fleet surfaces when operationalAvailabilityBadge is true', () => {
    const vehicle = baseVehicle({
      operationalAvailability: {
        state: OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION,
        primaryReason: 'DEVICE_CHECK_REQUIRED',
        reasonCodes: ['DEVICE_CHECK_REQUIRED'],
        recommendedAction: 'CHECK_DEVICE',
        attention: 'ACTION_REQUIRED',
        generatedAt: '2026-08-25T12:00:00.000Z',
      },
    });

    const legacy = resolveFleetVehicleDisplayState(vehicle, { locale: 'de' });
    const fleet = resolveFleetVehicleDisplayState(vehicle, {
      locale: 'de',
      operationalAvailabilityBadge: true,
      t: tFor('de'),
    });

    expect(legacy.statusBadge.label).toBe('Verfügbar');
    expect(fleet.statusBadge.label).toBe('Prüfung erforderlich');
    expect(fleet.statusBadge.status).toBe(VEHICLE_OPERATIONAL_STATUS.AVAILABLE);
  });

  it('WOB L 7503 fixture — NEEDS_VERIFICATION label', () => {
    const vehicle = baseVehicle({
      license: 'WOB L 7503',
      operationalAvailability: {
        state: OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION,
        primaryReason: 'DEVICE_CHECK_REQUIRED',
        reasonCodes: ['DEVICE_CHECK_REQUIRED', 'TELEMETRY_OFFLINE'],
        recommendedAction: 'CHECK_DEVICE',
        attention: 'ACTION_REQUIRED',
        generatedAt: '2026-08-25T12:00:00.000Z',
      },
    });
    const display = resolveFleetVehicleDisplayState(vehicle, {
      locale: 'de',
      operationalAvailabilityBadge: true,
      t: tFor('de'),
    });
    expect(display.statusBadge.label).toBe('Prüfung erforderlich');
  });

  it('WOB L 9755 fixture — NEEDS_VERIFICATION label', () => {
    const vehicle = baseVehicle({
      license: 'WOB L 9755',
      operationalAvailability: {
        state: OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION,
        primaryReason: 'DEVICE_CHECK_REQUIRED',
        reasonCodes: ['DEVICE_CHECK_REQUIRED'],
        recommendedAction: 'CHECK_DEVICE',
        attention: 'ACTION_REQUIRED',
        generatedAt: '2026-08-25T12:00:00.000Z',
      },
    });
    const display = resolveFleetVehicleDisplayState(vehicle, {
      locale: 'de',
      operationalAvailabilityBadge: true,
      t: tFor('de'),
    });
    expect(display.statusBadge.label).toBe('Prüfung erforderlich');
  });

  it('HMÜ C 215 fixture — UNKNOWN label (not AVAILABLE)', () => {
    const vehicle = baseVehicle({
      license: 'HMÜ C 215',
      operationalAvailability: {
        state: OPERATIONAL_AVAILABILITY_STATE.UNKNOWN,
        primaryReason: null,
        reasonCodes: [],
        recommendedAction: 'NONE',
        attention: 'NONE',
        generatedAt: '2026-08-25T12:00:00.000Z',
      },
    });
    const display = resolveFleetVehicleDisplayState(vehicle, {
      locale: 'de',
      operationalAvailabilityBadge: true,
      t: tFor('de'),
    });
    expect(display.statusBadge.label).toBe('Status unbekannt');
    expect(display.statusBadge.label).not.toBe('Verfügbar');
    expect(display.statusBadge.label).not.toBe('Prüfung erforderlich');
  });

  it('UNAVAILABLE hard block — Nicht verfügbar', () => {
    const vehicle = baseVehicle({
      status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
      operationalState: {
        status: 'OUT_OF_SERVICE',
        reason: null,
        source: 'test',
        derivedAt: '2026-08-25T12:00:00.000Z',
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
        isReliable: true,
      },
      operationalAvailability: {
        state: OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE,
        primaryReason: 'BUSINESS_WORKFLOW_BLOCKED',
        reasonCodes: ['BUSINESS_WORKFLOW_BLOCKED'],
        recommendedAction: 'NONE',
        attention: 'ACTION_REQUIRED',
        generatedAt: '2026-08-25T12:00:00.000Z',
      },
    });
    const display = resolveFleetVehicleDisplayState(vehicle, {
      locale: 'de',
      operationalAvailabilityBadge: true,
      t: tFor('de'),
    });
    expect(display.statusBadge.label).toBe('Nicht verfügbar');
  });

  it('missing operationalAvailability → UNKNOWN presentation (not green AVAILABLE)', () => {
    const vehicle = baseVehicle({ operationalAvailability: undefined });
    const display = resolveFleetVehicleDisplayState(vehicle, {
      locale: 'de',
      operationalAvailabilityBadge: true,
      t: tFor('de'),
    });
    expect(display.statusBadge.label).toBe('Status unbekannt');
  });
});
