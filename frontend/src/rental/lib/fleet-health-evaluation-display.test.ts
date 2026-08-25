import { describe, expect, it } from 'vitest';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import type { VehicleData } from '../data/vehicles';
import {
  FLEET_HEALTH_CONDITION,
  HEALTH_EVALUABILITY_STATE,
} from './fleet-health-evaluation/types';

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

describe('resolveFleetVehicleDisplayState — health evaluation badge (P0.4)', () => {
  it('uses P0.4 health badge on Fleet surfaces when healthEvaluationBadge is true', () => {
    const vehicle = baseVehicle({
      healthEvaluation: {
        condition: FLEET_HEALTH_CONDITION.GOOD,
        evaluability: HEALTH_EVALUABILITY_STATE.NOT_EVALUABLE,
        generatedAt: '2026-08-25T12:00:00.000Z',
        healthEvidenceAt: null,
        pipelineAvailability: null,
        anyModuleDataStale: true,
        source: 'p0.2_projection',
      },
    });

    const legacy = resolveFleetVehicleDisplayState(vehicle, { locale: 'de' });
    const fleet = resolveFleetVehicleDisplayState(vehicle, {
      locale: 'de',
      healthEvaluationBadge: true,
      t: tFor('de'),
    });

    expect(legacy.healthDisplay.label).toBe('Gut');
    expect(fleet.healthDisplay.label).toBe('Nicht bewertbar');
    expect(fleet.healthDisplay.label).not.toBe('Gut');
  });

  it('F9 — desktop and mobile mapper share the same presentation path', () => {
    const vehicle = baseVehicle({
      healthEvaluation: {
        condition: FLEET_HEALTH_CONDITION.GOOD,
        evaluability: HEALTH_EVALUABILITY_STATE.EVALUABLE,
        generatedAt: '2026-08-25T12:00:00.000Z',
        healthEvidenceAt: '2026-08-25T11:00:00.000Z',
        pipelineAvailability: 'ready',
        anyModuleDataStale: false,
        source: 'p0.2_projection',
      },
    });

    const deDisplay = resolveFleetVehicleDisplayState(vehicle, {
      locale: 'de',
      healthEvaluationBadge: true,
      t: tFor('de'),
    });
    const enDisplay = resolveFleetVehicleDisplayState(vehicle, {
      locale: 'en',
      healthEvaluationBadge: true,
      t: tFor('en'),
    });

    expect(deDisplay.healthDisplay.label).toBe('Gut');
    expect(enDisplay.healthDisplay.label).toBe('Good');
  });

  it('missing healthEvaluation → Status unbekannt (not Gut)', () => {
    const vehicle = baseVehicle({ healthEvaluation: undefined });
    const display = resolveFleetVehicleDisplayState(vehicle, {
      locale: 'de',
      healthEvaluationBadge: true,
      t: tFor('de'),
    });
    expect(display.healthDisplay.label).toBe('Status unbekannt');
    expect(display.healthDisplay.label).not.toBe('Gut');
  });
});
