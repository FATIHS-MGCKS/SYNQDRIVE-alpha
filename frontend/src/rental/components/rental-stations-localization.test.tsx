// @vitest-environment happy-dom
import { vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { translateKey } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
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

describe('rental stations localization (P2.2.6)', () => {
  describe('stations tab & select fields', () => {
    it('resolves stations tab labels through canonical i18n', () => {
      expect(st('en', 'stations.tab.title')).toBe(en['stations.tab.title']);
      expect(st('de', 'stations.tab.scope.active')).toBe(de['stations.tab.scope.active']);
    });

    it('resolves station select field labels in EN and DE', () => {
      expect(st('en', 'stations.select.pickupLabel')).toBe(en['stations.select.pickupLabel']);
      expect(st('de', 'stations.select.sameReturn')).toBe(de['stations.select.sameReturn']);
    });

    it('maps station booking warnings through canonical keys', () => {
      expect(labelStationWarning('en', 'pickupDisabled')).toBe(
        en['stations.select.warning.pickupDisabled'],
      );
      expect(labelStationWarning('de', 'archived')).toBe(de['stations.select.warning.archived']);
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
