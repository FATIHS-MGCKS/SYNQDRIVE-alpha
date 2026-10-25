// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { VehicleRegistrationModal } from './VehicleRegistrationModal';
import type { RegisteredVehicle } from '../data/platform-data';

const streamAiSpecsMock = vi.fn();

vi.mock('./ExteriorImagesEditor', () => ({
  ExteriorImagesEditor: () => createElement('div', { 'data-testid': 'exterior-images-stub' }),
  flushBufferedExteriorImages: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    highMobility: {
      checkAvailability: vi.fn().mockResolvedValue({ isLinked: false }),
      activateHealth: vi.fn(),
    },
    vehicles: {
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

function minimalExistingVehicle(): RegisteredVehicle {
  return {
    id: 'veh-1',
    vehicleName: 'Tesla Model 3',
    vin: '5YJ3E1EA1KF123456',
    make: 'Tesla',
    model: 'Model 3',
    year: 2022,
    organizationId: 'org-1',
    organizationName: 'Org',
    station: '',
    status: 'Available',
    health: 'Good',
    lastSignal: '',
    online: false,
    fuelType: 'Electric',
    mileage: 1000,
    licensePlate: 'B-EV 1',
    vehicleType: 'SEDAN',
    operationalStatus: 'Active',
    notes: '',
    batteryType: '',
    batteryAmpere: '',
    batteryVolt: '',
    hvBatteryCapacityKwh: '',
    tireFrontDimension: '235/45 R18',
    tireFrontBrandModel: 'Michelin',
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
    curbWeight: '1847',
    systemMotorPowerKw: '',
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

describe('VehicleRegistrationModal mobile shell (Phase A.2)', () => {
  beforeEach(() => {
    streamAiSpecsMock.mockReset();
    streamAiSpecsMock.mockImplementation((_params, handlers: { onEvent?: (e: unknown) => void }) => {
      handlers.onEvent?.({ type: 'step', step: 'mock', status: 'done' });
      handlers.onEvent?.({ type: 'complete', specs: {} });
      return { abort: vi.fn() };
    });
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
    document.body.removeAttribute('data-scroll-locked');
  });

  it('exposes a single scroll region and restores only its own overflow lock on close', async () => {
    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(VehicleRegistrationModal, {
            isDarkMode: false,
            isOpen: true,
            onClose,
            organizations: [],
            existingVehicle: minimalExistingVehicle(),
            initialOrganizationId: 'org-1',
            onRegister: vi.fn(),
            onUpdate: vi.fn(),
          }),
        }),
      );
    });

    const panel = document.querySelector('[data-testid="vehicle-registration-modal-panel"]');
    const scroll = document.querySelector('[data-testid="vehicle-registration-modal-scroll"]');
    expect(panel).toBeTruthy();
    expect(scroll).toBeTruthy();
    expect(scroll?.className).toMatch(/min-h-0/);
    expect(scroll?.className).toMatch(/overflow-y-auto/);
    expect(scroll?.textContent).toMatch(/Technical Vehicle Data/);

    const fetchBtn = document.querySelector('[data-testid="vehicle-registration-fetch-ai-specs"]');
    expect(fetchBtn).toBeTruthy();
    expect((fetchBtn as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      fetchBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(streamAiSpecsMock).toHaveBeenCalled();

    const input = document.querySelector('input');
    expect(input).toBeTruthy();
    await act(async () => {
      input?.focus();
    });
    expect(document.activeElement).toBe(input);

    expect(document.body.style.overflow).toBe('hidden');

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(VehicleRegistrationModal, {
            isDarkMode: false,
            isOpen: false,
            onClose,
            organizations: [],
            onRegister: vi.fn(),
          }),
        }),
      );
    });

    expect(document.body.style.overflow).toBe('');

    root.unmount();
    container.remove();
  });

  it('does not clear foreign Radix scroll-lock attributes when closing', async () => {
    document.body.style.overflow = 'hidden';
    document.body.style.pointerEvents = 'none';
    document.body.setAttribute('data-scroll-locked', '');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(VehicleRegistrationModal, {
            isDarkMode: false,
            isOpen: true,
            onClose: vi.fn(),
            organizations: [],
            existingVehicle: minimalExistingVehicle(),
            initialOrganizationId: 'org-1',
            onRegister: vi.fn(),
            onUpdate: vi.fn(),
          }),
        }),
      );
    });

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(VehicleRegistrationModal, {
            isDarkMode: false,
            isOpen: false,
            onClose: vi.fn(),
            organizations: [],
            onRegister: vi.fn(),
          }),
        }),
      );
    });

    expect(document.body.getAttribute('data-scroll-locked')).toBe('');
    expect(document.body.style.pointerEvents).toBe('none');
    expect(document.body.style.overflow).toBe('hidden');

    root.unmount();
    container.remove();
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
    document.body.removeAttribute('data-scroll-locked');
  });
});
