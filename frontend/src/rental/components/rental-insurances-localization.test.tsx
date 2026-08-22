// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

const mockOverview = {
  summary: {
    total: 2,
    insured: 1,
    expiringSoon: 0,
    expired: 0,
    missing: 1,
    pendingInquiry: 0,
  },
  vehicles: [
    {
      status: 'ACTIVE',
      vehicle: {
        id: 'veh-1',
        make: 'BMW',
        model: 'X3',
        year: 2024,
        licensePlate: 'M-AB 1234',
        vin: 'WBA1234567890ABCDE',
      },
      insurance: {
        insurerName: 'Allianz Fleet',
        policyNumber: 'POL-998877',
        validFrom: '2025-01-01',
        validUntil: '2026-12-31',
        insuranceType: 'FULL',
      },
    },
    {
      status: 'MISSING',
      vehicle: {
        id: 'veh-2',
        make: 'Audi',
        model: 'A4',
        year: 2023,
        licensePlate: 'M-CD 5678',
        vin: 'WAUZZZ8V9KA123456',
      },
      insurance: null,
    },
  ],
};

vi.mock('../../lib/api', () => ({
  api: {
    insurances: {
      overview: vi.fn(async () => mockOverview),
      partners: vi.fn(async () => []),
      disclosure: vi.fn(async () => null),
      vehicleInsurance: vi.fn(async () => ({ inquiries: [], liveSharingPermissions: [] })),
      submitInquiry: vi.fn(async () => ({ inquiryId: 'inq-1', recipients: [] })),
    },
  },
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { InsurancesView } from './InsurancesView';
import {
  INSURANCE_STATUS_FILTER_OPTIONS,
  INSURANCE_STATUS_VALUES,
  INQUIRY_PURPOSE_VALUES,
  formatInsuranceDate,
  labelInsuranceStatus,
  labelInquiryPurpose,
} from '../lib/insurances-i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P219_ENFORCE_CLEAN_EXACT = [
  'rental/components/InsurancesView.tsx',
  'rental/lib/insurances-i18n.ts',
];

function isP219EnforceCleanPath(relPath: string): boolean {
  return P219_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p219ScopedFindings() {
  return inventory.findings.filter((finding) => isP219EnforceCleanPath(finding.file));
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

describe('rental Insurances localization (P2.2.19)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P219 scoped findings', () => {
      expect(p219ScopedFindings()).toHaveLength(0);
    });
  });

  describe('machine semantics', () => {
    it('preserves insurance status machine values', () => {
      expect(INSURANCE_STATUS_VALUES).toEqual([
        'ACTIVE',
        'EXPIRING_SOON',
        'EXPIRED',
        'MISSING',
        'PENDING_INQUIRY',
      ]);
      expect(INSURANCE_STATUS_FILTER_OPTIONS[0]).toBe('all');
    });

    it('preserves inquiry purpose machine values for API payloads', () => {
      expect(INQUIRY_PURPOSE_VALUES).toContain('quote_standard');
      expect(INQUIRY_PURPOSE_VALUES).toContain('dynamic_insurance_interest');
      const source = readFileSync(join(__dirname, 'InsurancesView.tsx'), 'utf8');
      expect(source).toContain('inquiryType: inquiryPurpose');
      expect(source).not.toContain("setInquiryPurpose(t(");
    });

    it('localizes status labels without changing machine keys', () => {
      expect(labelInsuranceStatus('en', 'ACTIVE')).toBe(en['insurances.status.ACTIVE']);
      expect(labelInsuranceStatus('de', 'EXPIRED')).toBe(de['insurances.status.EXPIRED']);
    });

    it('localizes inquiry purpose display while keeping machine values', () => {
      const machine = 'quote_standard';
      expect(labelInquiryPurpose('en', machine)).toBe(en['insurances.inquiry.purpose.quote_standard.label']);
      expect(labelInquiryPurpose('de', machine)).toBe(de['insurances.inquiry.purpose.quote_standard.label']);
      expect(machine).toBe('quote_standard');
    });
  });

  describe('InsurancesView rendering', () => {
    it('renders EN overview without German literals', async () => {
      const view = renderWithLocale('en', createElement(InsurancesView, {}));
      cleanup = view.cleanup;
      await act(async () => {});
      const text = view.container.textContent ?? '';
      expect(text).toContain(en['insurances.title']);
      expect(text).toContain(en['insurances.kpi.totalVehicles']);
      expect(text).toContain(en['insurances.filters.allStatuses']);
      expect(text).toContain('Allianz Fleet');
      expect(text).toContain('POL-998877');
      expect(text).toContain('M-AB 1234');
      expect(text).not.toMatch(/Flottenversicherung|Alle Status|Läuft bald ab/);
    });

    it('renders DE overview with German dictionary strings', async () => {
      const view = renderWithLocale('de', createElement(InsurancesView, {}));
      cleanup = view.cleanup;
      await act(async () => {});
      const text = view.container.textContent ?? '';
      expect(text).toContain(de['insurances.title']);
      expect(text).toContain(de['insurances.kpi.insured']);
      expect(text).toContain(de['insurances.actions.newInquiry']);
      expect(text).toContain('Allianz Fleet');
      expect(text).toContain('POL-998877');
    });

    it('switches locale at runtime without stale labels', async () => {
      const enView = renderWithLocale('en', createElement(InsurancesView, {}));
      await act(async () => {});
      expect(enView.container.textContent).toContain(en['insurances.title']);
      enView.cleanup();

      const deView = renderWithLocale('de', createElement(InsurancesView, {}));
      cleanup = deView.cleanup;
      await act(async () => {});
      expect(deView.container.textContent).toContain(de['insurances.title']);
      expect(deView.container.textContent).not.toContain(en['insurances.title']);
    });

    it('uses locale-aware date formatting helpers', () => {
      expect(formatInsuranceDate('en', null)).toBe(en['insurances.emptyValue']);
      expect(formatInsuranceDate('de', '2026-08-21T10:00:00.000Z')).toMatch(/21/);
    });
  });

  describe('translation key integrity', () => {
    it('does not leak raw translation keys in EN render', async () => {
      const view = renderWithLocale('en', createElement(InsurancesView, {}));
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).not.toMatch(/insurances\.[a-zA-Z.]+/);
    });
  });
});
