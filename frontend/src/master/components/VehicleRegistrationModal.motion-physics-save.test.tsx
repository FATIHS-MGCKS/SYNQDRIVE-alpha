// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent } from '@testing-library/react';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { VehicleRegistrationModal } from './VehicleRegistrationModal';
import type { RegisteredVehicle } from '../data/platform-data';
import { api } from '../../lib/api';

const streamAiSpecsMock = vi.fn();
const getActiveMock = vi.fn();
const createReferenceMock = vi.fn();

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
      motionPhysicsReference: {
        getActive: (...args: unknown[]) => getActiveMock(...args),
        create: (...args: unknown[]) => createReferenceMock(...args),
        confirm: vi.fn(),
      },
    },
  },
  streamAiSpecs: (...args: unknown[]) => streamAiSpecsMock(...args),
  streamAiTireSpecs: vi.fn(),
}));

function teslaVehicle(): RegisteredVehicle {
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

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('VehicleRegistrationModal motion physics save (no reference)', () => {
  beforeEach(() => {
    getActiveMock.mockReset();
    createReferenceMock.mockReset();
    getActiveMock.mockResolvedValue(null);
    document.body.innerHTML = '';
  });

  it('keeps modal open after Save Changes when motion reference fields were edited', async () => {
    const onClose = vi.fn();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
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
            existingVehicle: teslaVehicle(),
            organizations: [{ id: 'org-1', company_name: 'Org' }],
            onRegister: vi.fn(),
            onUpdate,
          }),
        ),
      );
    });

    await flushPromises();
    await flushPromises();

    const powerInput = container.querySelector<HTMLInputElement>(
      '[data-testid="motion-physics-system-power-kw"]',
    );
    const accelInput = container.querySelector<HTMLInputElement>(
      '[data-testid="motion-physics-accel-0-100"]',
    );
    expect(powerInput).toBeTruthy();
    expect(accelInput).toBeTruthy();
    await act(async () => {
      fireEvent.change(powerInput!, { target: { value: '208' } });
      fireEvent.change(accelInput!, { target: { value: '6.1' } });
    });
    await flushPromises();

    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Changes'),
    );
    expect(saveBtn).toBeTruthy();

    await act(async () => {
      saveBtn!.click();
      await flushPromises();
    });

    expect(onUpdate).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/Confirm manual values|Manuelle Werte bestätigen/i);

    root.unmount();
    container.remove();
  });

  it('reloads active reference after manual confirm', async () => {
    const confirmedRef = {
      id: 'ref-confirmed',
      evidenceTier: 'CONFIRMED' as const,
      curbMassKg: 1760,
      systemMotorPowerKw: 208,
      accel0To100S: 6.1,
      variantAssumption: 'RWD',
      systemPowerDefinition: 'OEM_RATED_MOTOR_KW',
    };
    getActiveMock.mockResolvedValueOnce(null).mockResolvedValueOnce(confirmedRef);
    createReferenceMock.mockResolvedValueOnce({ id: 'ref-confirmed', evidenceTier: 'CONFIRMED' });

    const onClose = vi.fn();
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
            existingVehicle: teslaVehicle(),
            organizations: [{ id: 'org-1', company_name: 'Org' }],
            onRegister: vi.fn(),
            onUpdate: vi.fn(),
          }),
        ),
      );
    });

    await flushPromises();
    await flushPromises();

    const powerInput = container.querySelector<HTMLInputElement>(
      '[data-testid="motion-physics-system-power-kw"]',
    );
    const accelInput = container.querySelector<HTMLInputElement>(
      '[data-testid="motion-physics-accel-0-100"]',
    );
    await act(async () => {
      fireEvent.change(powerInput!, { target: { value: '208' } });
      fireEvent.change(accelInput!, { target: { value: '6.1' } });
    });
    await flushPromises();

    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.match(/Confirm manual values|Manuelle Werte bestätigen/i),
    );
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn!.click();
      await flushPromises();
      await flushPromises();
    });

    expect(createReferenceMock).toHaveBeenCalled();
    expect(getActiveMock).toHaveBeenCalledTimes(2);
    expect(powerInput?.value).toBe('208');
    expect(accelInput?.value).toBe('6.1');

    root.unmount();
    container.remove();
  });

  it('keeps editor values when reference POST fails on manual confirm', async () => {
    getActiveMock.mockResolvedValue(null);
    createReferenceMock.mockRejectedValueOnce(new Error('network'));

    const onClose = vi.fn();
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
            existingVehicle: teslaVehicle(),
            organizations: [{ id: 'org-1', company_name: 'Org' }],
            onRegister: vi.fn(),
            onUpdate: vi.fn(),
          }),
        ),
      );
    });

    await flushPromises();
    await flushPromises();

    const powerInput = container.querySelector<HTMLInputElement>(
      '[data-testid="motion-physics-system-power-kw"]',
    );
    await act(async () => {
      fireEvent.change(powerInput!, { target: { value: '208' } });
    });

    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.match(/Confirm manual values|Manuelle Werte bestätigen/i),
    );
    await act(async () => {
      confirmBtn!.click();
      await flushPromises();
    });

    expect(powerInput?.value).toBe('208');
    expect(container.textContent).toMatch(/MOTION_PHYSICS_REFERENCE_CONFIRM_FAILED/);
    expect(onClose).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });
});
