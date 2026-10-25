// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { VehicleRegistrationModal } from './VehicleRegistrationModal';
import type { Organization, RegisteredVehicle } from '../data/platform-data';

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
        getActive: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        confirm: vi.fn(),
      },
    },
  },
  streamAiSpecs: vi.fn(),
  streamAiTireSpecs: vi.fn(),
}));

function teslaDimoSoftwareIntegration(): RegisteredVehicle {
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
    hardwareType: 'LTE_R1',
    connectionModality: 'SOFTWARE_INTEGRATION',
    telemetryConnectionFamily: 'API_SYNTHETIC',
  };
}

describe('VehicleRegistrationModal connection identity vs DI routing', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows SOFTWARE INTEGRATION modality separately from stored LTE_R1 routing', async () => {
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
            onClose: vi.fn(),
            existingVehicle: teslaDimoSoftwareIntegration(),
            organizations: [{ id: 'org-1', company_name: 'Org' } as Organization],
            onRegister: vi.fn(),
            onUpdate: vi.fn(),
          }),
        ),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const summary = container.querySelector('[data-testid="connection-identity-summary"]');
    expect(summary?.textContent).toContain('SOFTWARE INTEGRATION');
    expect(summary?.textContent).toContain('API SYNTHETIC');

    const hwButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      ['LTE_R1', 'SMART5', 'Unknown'].includes(b.textContent?.trim() ?? ''),
    );
    expect(hwButtons.length).toBeGreaterThan(0);
    for (const btn of hwButtons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }

    root.unmount();
    container.remove();
  });
});
