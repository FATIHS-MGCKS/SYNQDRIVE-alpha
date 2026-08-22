// @vitest-environment happy-dom
import { vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { VehicleData } from '../data/vehicles';
import { resolveBookingVehiclePreflight } from '../lib/booking-vehicle-preflight';
import { VehiclePickerStep } from './new-booking/VehiclePickerStep';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P217_ENFORCE_CLEAN_EXACT = [
  'rental/components/new-booking/VehiclePickerStep.tsx',
  'rental/lib/booking-vehicle-preflight.ts',
];

function isP217EnforceCleanPath(relPath: string): boolean {
  return P217_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function readPickerSource(): string {
  return readFileSync(join(__dirname, 'new-booking/VehiclePickerStep.tsx'), 'utf8');
}

function readPreflightSource(): string {
  return readFileSync(join(__dirname, '../lib/booking-vehicle-preflight.ts'), 'utf8');
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(LanguageProvider, null, ui));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const sampleVehicle = {
  id: 'veh-1',
  license: 'KS-AB 100',
  make: 'BMW',
  model: 'X5 2024',
  year: 2024,
  station: 'Kassel HQ',
  stationId: 'st-1',
  homeStationId: 'st-1',
  fuelType: 'Petrol',
  status: 'Available',
  cleaningStatus: 'Clean',
  healthStatus: 'Good Health',
  online: true,
  lastSignal: new Date().toISOString(),
  badge: 0,
  odometer: 10000,
  fuel: 80,
  battery: 0,
  speed: 0,
  coolant: 90,
  brakes: 90,
  tires: 90,
  engineOil: 90,
  isElectric: false,
  hvBatteryCapacityKwh: null,
  leasingRate: '0',
  insuranceCost: '0',
  taxCost: '0',
  totalMonthlyCost: '0',
  onlineStatus: 'ONLINE',
} as unknown as VehicleData;

function baseProps(overrides: Partial<Parameters<typeof VehiclePickerStep>[0]> = {}) {
  return {
    vehicles: [sampleVehicle],
    selectedVehicleId: null,
    onSelectVehicle: vi.fn(),
    search: '',
    onSearchChange: vi.fn(),
    brandFilter: 'all',
    onBrandFilterChange: vi.fn(),
    stationFilter: 'all',
    onStationFilterChange: vi.fn(),
    fuelFilter: 'all',
    onFuelFilterChange: vi.fn(),
    statusFilter: 'all',
    onStatusFilterChange: vi.fn(),
    onResetFilters: vi.fn(),
    brands: ['BMW'],
    stationOptions: [{ id: 'st-1', label: 'Kassel HQ' }],
    fuelTypes: ['Petrol'],
    pickerHealthMap: new Map(),
    catalogLoading: false,
    vehicleHasTariff: () => true,
    getDailyRateLabel: () => '€120.00',
    isDarkMode: false,
    ...overrides,
  };
}

describe('booking vehicle picker localization (P2.2.17)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reports zero P217 scoped findings in inventory', () => {
    const findings = inventory.findings.filter((finding) => isP217EnforceCleanPath(finding.file));
    expect(findings).toHaveLength(0);
  });

  describe('VehiclePickerStep source guards', () => {
    const source = readPickerSource();

    it('uses canonical translation keys for picker chrome', () => {
      expect(source).toContain('useLanguage');
      expect(source).toContain("t('bookings.wizard.selectVehicle')");
      expect(source).toContain("t('bookings.wizard.searchVehicle')");
      expect(source).toContain("t('bookings.planner.allStations')");
      expect(source).toContain("t('tasks.filter.resetFilters')");
      expect(source).toContain("t('fleetCondition.moreFilters')");
      expect(source).toContain("t('vehicle.status.available')");
      expect(source).toContain('formatVehicleOperationalStatusLabel');
      expect(source).toContain('resolveBookingVehiclePreflight');
      expect(source).toContain('{ locale }');
    });

    it('does not contain hidden German presentation literals', () => {
      expect(source).not.toMatch(/Alle Stationen/);
      expect(source).not.toMatch(/Filter zurücksetzen/);
      expect(source).not.toMatch(/Weitere Filter/);
      expect(source).not.toMatch(/Kein Tarif/);
      expect(source).not.toMatch(/fleetStatusLabelDe/);
      const bannedTabLabels = [/label:\s*'Alle'/, /label:\s*'Verfügbar'/, /label:\s*'Vermietet'/];
      for (const pattern of bannedTabLabels) {
        expect(source, pattern.toString()).not.toMatch(pattern);
      }
    });
  });

  describe('booking-vehicle-preflight source guards', () => {
    const source = readPreflightSource();

    it('routes presentation through the i18n adapter', () => {
      expect(source).toContain('booking-vehicle-preflight-presentation-i18n');
      expect(source).toContain('bookingVehicleOfflineLabel');
      expect(source).toContain('resolveBookingVehiclePreflightLocale');
      expect(source).not.toMatch(/Nicht vermietbar/);
      expect(source).not.toMatch(/Mietfreigabe nicht verifiziert/);
      expect(source).not.toMatch(/VEHICLE_OFFLINE_LABEL/);
    });
  });

  describe('EN chrome', () => {
    it('renders localized title and search placeholder', () => {
      const { container, cleanup } = renderWithLocale(
        'en',
        createElement(VehiclePickerStep, baseProps({ vehicles: [] })),
      );
      expect(container.textContent).toContain(en['bookings.wizard.selectVehicle']);
      const input = container.querySelector('input[type="search"]') as HTMLInputElement;
      expect(input.placeholder).toBe(en['bookings.wizard.searchVehicle']);
      cleanup();
    });

    it('renders EN empty state', () => {
      const { container, cleanup } = renderWithLocale(
        'en',
        createElement(VehiclePickerStep, baseProps({ vehicles: [] })),
      );
      expect(container.textContent).toContain(en['bookings.wizard.noVehiclesInCategory']);
      cleanup();
    });
  });

  describe('DE chrome', () => {
    it('renders localized title and search placeholder', () => {
      const { container, cleanup } = renderWithLocale(
        'de',
        createElement(VehiclePickerStep, baseProps({ vehicles: [] })),
      );
      expect(container.textContent).toContain(de['bookings.wizard.selectVehicle']);
      const input = container.querySelector('input[type="search"]') as HTMLInputElement;
      expect(input.placeholder).toBe(de['bookings.wizard.searchVehicle']);
      cleanup();
    });

    it('renders DE empty state', () => {
      const { container, cleanup } = renderWithLocale(
        'de',
        createElement(VehiclePickerStep, baseProps({ vehicles: [] })),
      );
      expect(container.textContent).toContain(de['bookings.wizard.noVehiclesInCategory']);
      cleanup();
    });
  });

  describe('dynamic vehicle data preservation', () => {
    it('renders license and station unchanged across locales', () => {
      const enView = renderWithLocale('en', createElement(VehiclePickerStep, baseProps()));
      expect(enView.container.textContent).toContain('KS-AB 100');
      expect(enView.container.textContent).toContain('Kassel HQ');
      enView.cleanup();

      const deView = renderWithLocale('de', createElement(VehiclePickerStep, baseProps()));
      expect(deView.container.textContent).toContain('KS-AB 100');
      expect(deView.container.textContent).toContain('Kassel HQ');
      deView.cleanup();
    });
  });

  describe('preflight presentation', () => {
    it('localizes offline blocking copy for picker locale', () => {
      const offlineVehicle = {
        ...sampleVehicle,
        onlineStatus: 'OFFLINE',
        lastSignal: '2020-01-01T00:00:00.000Z',
      } as VehicleData;
      const enResult = resolveBookingVehiclePreflight(offlineVehicle, null, true, false, { locale: 'en' });
      const deResult = resolveBookingVehiclePreflight(offlineVehicle, null, true, false, { locale: 'de' });
      expect(enResult.blockingReason).toBe(en['bookings.wizard.vehiclePicker.preflight.vehicleOffline']);
      expect(deResult.blockingReason).toBe(de['bookings.wizard.vehiclePicker.preflight.vehicleOffline']);
      expect(enResult.isSelectable).toBe(false);
      expect(deResult.isSelectable).toBe(false);
      expect(enResult.hardBlockReason).toBe('offline');
    });
  });

  describe('dictionary reuse', () => {
    it('reuses canonical keys and adds bounded P217 keys only', () => {
      expect(en['bookings.planner.allStations']).toBeTruthy();
      expect(en['tasks.filter.resetFilters']).toBeTruthy();
      expect(en['fleetCondition.moreFilters']).toBeTruthy();
      expect(en['bookings.wizard.vehiclePicker.preflight.vehicleOffline']).toBeTruthy();
      expect(de['bookings.wizard.vehiclePicker.preflight.vehicleOffline']).toBeTruthy();
    });
  });
});
