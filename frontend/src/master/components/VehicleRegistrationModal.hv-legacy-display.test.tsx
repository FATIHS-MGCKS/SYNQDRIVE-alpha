// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { VehicleRegistrationModal } from './VehicleRegistrationModal';
import type { RegisteredVehicle } from '../data/platform-data';

const streamAiSpecsMock = vi.fn();
const vehiclesUpdateMock = vi.fn();

vi.mock('./ExteriorImagesEditor', () => ({
  ExteriorImagesEditor: () => createElement('div', { 'data-testid': 'exterior-images-stub' }),
  flushBufferedExteriorImages: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    highMobility: {
      checkAvailability: vi.fn().mockResolvedValue({ isLinked: false }),
    },
    vehicles: {
      update: (...args: unknown[]) => vehiclesUpdateMock(...args),
      motionPhysicsReference: {
        getActive: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        confirm: vi.fn(),
      },
    },
  },
  streamAiSpecs: (...args: unknown[]) => streamAiSpecsMock(...args),
  streamAiTireSpecs: vi.fn(),
}));

function teslaWithLegacy57(): RegisteredVehicle {
  return {
    id: 'tesla-m3',
    vehicleName: 'Tesla Model 3',
    vin: 'LRW3E7FS5PC677180',
    make: 'Tesla',
    model: 'Model 3',
    year: 2023,
    organizationId: 'org-1',
    organizationName: 'Org',
    station: '',
    status: 'Available',
    health: 'Good',
    lastSignal: '',
    online: false,
    fuelType: 'Electric',
    mileage: 12000,
    licensePlate: 'B-EV 1',
    vehicleType: 'SEDAN',
    operationalStatus: 'Active',
    notes: '',
    batteryType: '',
    batteryAmpere: '',
    batteryVolt: '',
    hvBatteryCapacityKwh: '57',
    hvBatteryUsableCapacityKwh: '57',
    tireFrontDimension: '',
    tireFrontBrandModel: '',
    tireFrontSeason: 'All Season',
    tireFrontDot: '',
    tireFrontLoadIndex: '',
    tireFrontSpeedIndex: '',
    tireBackDimension: '',
    tireBackBrandModel: '',
    tireBackSeason: 'All Season',
    tireBackDot: '',
    tireBackLoadIndex: '',
    tireBackSpeedIndex: '',
    treadDepthFL: '',
    treadDepthFR: '',
    treadDepthBL: '',
    treadDepthBR: '',
    brakeFrontRotorDiameter: '',
    brakeFrontRotorWidth: '',
    brakeFrontPadThickness: '',
    brakeBackRotorDiameter: '',
    brakeBackRotorWidth: '',
    brakeBackPadThickness: '',
    idleRpm: '',
    maxRpm: '',
    drivetrain: '',
    brakeForceDistribution: '',
    frontToRearWeightDistribution: '',
    curbWeight: '1760',
    systemMotorPowerKw: '',
    accel0To100S: '',
    serviceIntervals: '',
    serviceIntervalManufacturerKm: '',
    serviceIntervalManufacturerMonths: '',
    oilChangeIntervalKm: '',
    oilChangeIntervalMonths: '',
    lastTuev: '',
    lastBokraft: '',
    lastInspection: '',
    lastOilChange: '',
    lastBrakePadChange: '',
    lastBrakeRotorChange: '',
    hardwareType: 'UNKNOWN',
  };
}

describe('VehicleRegistrationModal HV legacy display (Tesla 57 kWh)', () => {
  beforeEach(() => {
    vehiclesUpdateMock.mockReset();
    document.body.innerHTML = '';
  });

  it('shows legacy 57 kWh usable and performs no vehicle update when closing without save', async () => {
    const onClose = vi.fn();
    const onUpdate = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(VehicleRegistrationModal, {
            isDarkMode: false,
            isOpen: true,
            onClose,
            existingVehicle: teslaWithLegacy57(),
            organizations: [{ id: 'org-1', company_name: 'Org' }],
            onRegister: vi.fn(),
            onUpdate,
          }),
        ),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const usableInput = container.querySelector<HTMLInputElement>(
      '[data-testid="hv-usable-capacity-kwh"]',
    );
    expect(usableInput?.value).toBe('57');
    expect(usableInput?.readOnly).toBe(true);

    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    );
    expect(cancelBtn).toBeTruthy();

    await act(async () => {
      cancelBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(vehiclesUpdateMock).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });
});
