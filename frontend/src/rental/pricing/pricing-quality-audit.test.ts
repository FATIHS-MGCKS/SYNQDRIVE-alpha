import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';

const ASSIGNMENT_I18N_KEYS = Object.keys(en).filter((k) => k.startsWith('priceTariffs.assignments.'));

describe('pricing quality audit — frontend guards', () => {
  it('TariffGroupDrawer uses accessible Sheet and AlertDialog', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/components/price-tariffs/TariffGroupDrawer.tsx'),
      'utf8',
    );
    expect(source).toContain('<Sheet');
    expect(source).toContain('AlertDialog');
    expect(source).not.toContain('window.confirm');
    expect(source).toContain('role="tab"');
    expect(source).toContain('safe-area-inset-bottom');
  });

  it('PriceTariffsPage tabs expose tablist semantics', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/components/price-tariffs/PriceTariffsPage.tsx'),
      'utf8',
    );
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain('aria-selected');
  });

  it('VehicleAssignmentsTab provides mobile card layout', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/components/price-tariffs/VehicleAssignmentsTab.tsx'),
      'utf8',
    );
    expect(source).toContain('md:hidden');
    expect(source).toContain('md:block');
    expect(source).toContain('min-h-11');
    expect(source).toContain('useLanguage');
  });

  it('TariffEditorMoneyField links errors via aria-describedby', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/rental/components/price-tariffs/tariff-editor/TariffEditorMoneyField.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('aria-describedby');
    expect(source).toContain('role="alert"');
  });
});

describe('assignments i18n', () => {
  it('has matching DE and EN keys', () => {
    for (const key of ASSIGNMENT_I18N_KEYS) {
      expect(de[key as keyof typeof de], `missing de ${key}`).toBeTruthy();
      expect(en[key as keyof typeof en], `missing en ${key}`).toBeTruthy();
    }
  });
});

describe('audit scripts exist', () => {
  it('documents read-only and repair ops scripts', () => {
    const audit = readFileSync(
      resolve(process.cwd(), '../backend/scripts/ops/audit-pricing-integrity.ts'),
      'utf8',
    );
    const repair = readFileSync(
      resolve(process.cwd(), '../backend/scripts/ops/repair-pricing-integrity.ts'),
      'utf8',
    );
    expect(audit).toContain('runAudit');
    expect(audit).not.toContain('--execute');
    expect(repair).toContain('--dry-run');
    expect(repair).toContain('--confirm');
    expect(repair).not.toContain('17700');
  });
});
