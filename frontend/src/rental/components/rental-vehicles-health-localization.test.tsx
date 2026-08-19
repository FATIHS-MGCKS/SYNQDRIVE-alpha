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
import { vt, vehicleFormattingLocale } from './vehicle/vehicle-i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P22_SCOPE_PREFIXES = [
  'rental/components/fleet/',
  'rental/components/vehicle-detail/',
  'rental/components/health/',
  'rental/components/trips/',
  'rental/components/HealthErrorsView.tsx',
  'rental/components/FleetView.tsx',
];

describe('rental vehicles, detail & health localization (P2.2.2)', () => {
  it('resolves fleet list labels through canonical i18n', () => {
    expect(en['fleet.title']).toBeTruthy();
    expect(vt('en', 'fleet.title')).toBe(en['fleet.title']);
    expect(vt('de', 'fleet.map.title')).toBe(de['fleet.map.title']);
  });

  it('resolves vehicle detail shell and tab labels', () => {
    expect(vt('en', 'vehicle.overview')).toBe(en['vehicle.overview']);
    expect(vt('de', 'vehicleDetail.tab.health')).toBe(de['vehicleDetail.tab.health']);
    expect(vt('en', 'vehicle.trips')).toBe(en['vehicle.trips']);
  });

  it('resolves health module labels including battery, tire, brake', () => {
    expect(vt('en', 'health.battery.lv.title')).toBe(en['health.battery.lv.title']);
    expect(vt('de', 'health.tires')).toBe(de['health.tires']);
    expect(vt('en', 'health.brakes')).toBe(en['health.brakes']);
  });

  it('resolves DTC UI labels while leaving DTC codes unchanged in source', () => {
    expect(vt('en', 'health.dtc.noActiveFaults')).toBe(en['health.dtc.noActiveFaults']);
    const healthSource = readFileSync(join(__dirname, 'HealthErrorsView.tsx'), 'utf8');
    expect(healthSource).toMatch(/P0300|dtcCode/);
    expect(healthSource).not.toMatch(/>\s*P0300\s*</);
  });

  it('keeps internal telemetry state identifiers unchanged', () => {
    const source = readFileSync(
      join(__dirname, 'fleet-connectivity/fleet-connectivity.presentation.ts'),
      'utf8',
    );
    expect(source).toContain('TELEMETRY_ACTIVE');
    expect(source).toContain('SOFT_OFFLINE');
  });

  it('keeps internal readiness/status enum values unchanged', () => {
    const source = readFileSync(join(__dirname, '../lib/vehicle-status.ts'), 'utf8');
    expect(source).toContain('VEHICLE_OPERATIONAL_STATUS');
  });

  it('localizes visible vehicle status presentation via translation keys', () => {
    expect(vt('en', 'vehicle.status.available')).toBe(en['vehicle.status.available']);
    expect(vt('de', 'vehicle.status.maintenance')).toBe(de['vehicle.status.maintenance']);
  });

  it('falls back Turkish to English for vehicle health copy', () => {
    const result = translateKey('tr', 'health.errorCodes');
    expect(result.source).toBe('fallback-en');
    expect(result.text).toBe(en['health.errorCodes']);
  });

  it('falls back partial locales explicitly to English when key is missing', () => {
    const result = translateKey('pl', 'health.dtc.noActiveFaults');
    expect(result.source).toBe('fallback-en');
    expect(result.text).toBe(en['health.dtc.noActiveFaults']);
  });

  it('uses formattingLocale helper in vehicle-i18n', () => {
    const source = readFileSync(join(__dirname, 'vehicle/vehicle-i18n.ts'), 'utf8');
    expect(source).toContain('vehicleFormattingLocale');
    expect(source).toContain('getFormattingLocale');
  });

  it('formats vehicle-domain numbers with a non-DE/EN active locale', () => {
    expect(vehicleFormattingLocale('pl')).toBe('pl-PL');
    const formatted = (12345.6).toLocaleString(vehicleFormattingLocale('pl'), {
      maximumFractionDigits: 1,
    });
    expect(formatted).toMatch(/12/);
    expect(formatted).toMatch(/345/);
  });

  it('reports zero enforce-clean findings for P2.2.2 scope in inventory', () => {
    expect(inventory.summary.enforceCleanRemaining).toBe(0);
    const p22Debt = inventory.findings.filter((finding) =>
      finding.migrationPhase === 'P2.2.2' && finding.severity !== 'enforce-clean',
    );
    expect(p22Debt).toHaveLength(0);
  });
});
