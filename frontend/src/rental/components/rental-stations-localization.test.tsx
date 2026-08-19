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
import type { Station } from '../../lib/api';
import { LanguageProvider, translateKey } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { StationSelectFields } from './stations/StationSelectFields';
import { labelStationWarning, st } from './stations/stations-i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P26_ENFORCE_CLEAN_PREFIXES = ['rental/components/stations/'];

function isP26EnforceCleanPath(relPath: string): boolean {
  return P26_ENFORCE_CLEAN_PREFIXES.some(
    (prefix) => relPath === prefix || relPath.startsWith(prefix),
  );
}

function p26ScopedFindings() {
  return inventory.findings.filter((finding) => isP26EnforceCleanPath(finding.file));
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

function makeStation(overrides: Partial<Station> = {}): Station {
  return {
    id: 'station-1',
    name: 'Berlin Mitte',
    code: null,
    status: 'ACTIVE',
    statusLabel: 'Active',
    type: 'BRANCH',
    typeLabel: 'Branch',
    isPrimary: true,
    address: null,
    addressLine1: null,
    addressLine2: null,
    city: 'Berlin',
    postalCode: null,
    country: null,
    latitude: null,
    longitude: null,
    timezone: null,
    radiusMeters: null,
    geofenceRadiusMeters: null,
    phone: null,
    email: null,
    managerName: null,
    contactPerson: null,
    pickupEnabled: true,
    returnEnabled: true,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    capacity: null,
    openingHours: null,
    holidayRules: null,
    handoverInstructions: null,
    returnInstructions: null,
    notes: null,
    internalNotes: null,
    googlePlaceId: null,
    archivedAt: null,
    vehicleCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('rental stations localization (P2.2.6)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
  });

  describe('stations tab & select fields', () => {
    it('resolves stations tab labels through canonical i18n', () => {
      expect(st('en', 'settings.stationsBranches')).toBe(en['settings.stationsBranches']);
      expect(st('de', 'stations.status.ACTIVE')).toBe(de['stations.status.ACTIVE']);
    });

    it('resolves station select field labels in EN and DE', () => {
      expect(st('en', 'stations.select.pickupLabel')).toBe(en['stations.select.pickupLabel']);
      expect(st('de', 'stations.select.sameReturn')).toBe(de['stations.select.sameReturn']);
    });

    it('maps station booking warnings through canonical status keys', () => {
      expect(labelStationWarning('en', 'pickupDisabled')).toBe(
        en['stations.select.warning.pickupDisabled'],
      );
      expect(labelStationWarning('de', 'archived')).toBe(de['stations.status.ARCHIVED']);
      expect(labelStationWarning('de', 'inactive')).toBe(de['stations.status.INACTIVE']);
    });

    it('reuses bookings.detail.oneWayRental for one-way rental hint', () => {
      expect(en['bookings.detail.oneWayRental']).toContain('One-way');
      expect(de['bookings.detail.oneWayRental']).toContain('One-Way');
    });

    it('falls back partial locales to English for stations tab copy', () => {
      const result = translateKey('pl', 'stations.tab.loading');
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe(en['stations.tab.loading']);
    });
  });

  describe('StationSelectFields component rendering', () => {
    const stations = [
      makeStation(),
      makeStation({
        id: 'station-2',
        name: 'Munich Airport',
        city: 'Munich',
        isPrimary: false,
        status: 'ARCHIVED',
        statusLabel: 'Archived',
        pickupEnabled: false,
        returnEnabled: false,
      }),
    ];

    it('renders English pickup/return labels and same-return checkbox from component output', () => {
      ({ cleanup } = renderWithLocale(
        'en',
        createElement(StationSelectFields, {
          stations,
          pickupStationId: 'station-1',
          returnStationId: 'station-1',
          sameReturnStation: true,
          onPickupChange: () => {},
          onReturnChange: () => {},
          onSameReturnChange: () => {},
        }),
      ));

      const text = document.body.textContent ?? '';
      expect(text).toContain(en['stations.select.pickupLabel']);
      expect(text).toContain(en['stations.select.returnLabel']);
      expect(text).toContain(en['stations.select.sameReturn']);
      expect(text).toContain(en['stations.select.placeholder']);
      expect(text).toContain('Berlin Mitte (Berlin)');
      expect(text).toContain(en['stations.select.primarySuffix'].trim());
    });

    it('renders German pickup/return labels from component output', () => {
      ({ cleanup } = renderWithLocale(
        'de',
        createElement(StationSelectFields, {
          stations,
          pickupStationId: 'station-1',
          returnStationId: 'station-2',
          sameReturnStation: false,
          onPickupChange: () => {},
          onReturnChange: () => {},
          onSameReturnChange: () => {},
        }),
      ));

      const text = document.body.textContent ?? '';
      expect(text).toContain(de['stations.select.pickupLabel']);
      expect(text).toContain(de['stations.select.returnLabel']);
      expect(text).toContain(de['stations.select.sameReturn']);
      expect(text).toContain(de['bookings.detail.oneWayRental']);
    });

    it('renders archived warning chip via canonical stations.status.ARCHIVED key', () => {
      ({ cleanup } = renderWithLocale(
        'en',
        createElement(StationSelectFields, {
          stations,
          pickupStationId: 'station-2',
          returnStationId: 'station-2',
          sameReturnStation: true,
          onPickupChange: () => {},
          onReturnChange: () => {},
          onSameReturnChange: () => {},
        }),
      ));

      expect(document.body.textContent).toContain(en['stations.status.ARCHIVED']);
      expect(document.body.textContent).not.toContain('stations.select.warning.archived');
    });
  });

  describe('guardrails', () => {
    it('keeps P2.2.6 enforce-clean scope at zero findings', () => {
      const debt = p26ScopedFindings().filter((finding) => finding.severity === 'enforce-clean');
      expect(debt).toHaveLength(0);
    });

    it('does not add new ../i18n/ compatibility shim consumers in touched stations files', () => {
      const touched = [
        join(__dirname, 'stations/StationsTab.tsx'),
        join(__dirname, 'stations/StationSelectFields.tsx'),
        join(__dirname, 'stations/StationsView.tsx'),
        join(__dirname, 'stations/StationFormModal.tsx'),
        join(__dirname, 'stations/StationDetailView.tsx'),
        join(__dirname, 'stations/StationAssignVehicleModal.tsx'),
      ];
      for (const filePath of touched) {
        const source = readFileSync(filePath, 'utf8');
        expect(source, filePath).not.toMatch(/from '\.\.\/i18n\//);
        expect(source, filePath).not.toMatch(/from '\.\.\/\.\.\/i18n\//);
      }
    });

    it('keeps EN and DE dictionaries aligned for stations tab/select keys', () => {
      const enKeys = Object.keys(en);
      const deKeys = new Set(Object.keys(de));
      const stationsKeys = enKeys.filter(
        (key) => key.startsWith('stations.tab.') || key.startsWith('stations.select.'),
      );
      expect(stationsKeys.length).toBeGreaterThan(0);
      for (const key of stationsKeys) {
        expect(deKeys.has(key), key).toBe(true);
      }
    });
  });
});
