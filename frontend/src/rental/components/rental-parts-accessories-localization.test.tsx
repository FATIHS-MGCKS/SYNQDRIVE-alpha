// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

const mockFleetVehicles = [
  {
    id: 'veh-1',
    license: 'M-AB 1234',
    make: 'BMW',
    model: 'X3',
    year: 2024,
    vin: 'WBA1234567890ABCDE',
  },
];

vi.mock('../FleetContext', () => ({
  useFleetVehicles: vi.fn(() => ({
    fleetVehicles: mockFleetVehicles,
    loading: false,
  })),
}));

vi.mock('../../lib/api', () => ({
  api: {
    partsAccessories: {
      providers: vi.fn(async () => []),
      disclosure: vi.fn(async () => ({ disclosure: null, disclosedFields: null })),
      confirmDisclosure: vi.fn(async () => ({ correlationId: 'corr-1' })),
      search: vi.fn(async () => ({ results: [], totalCount: 0, searchDurationMs: 42, hasMore: false })),
      productDetail: vi.fn(async () => null),
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
import { PartsAccessoriesView } from './PartsAccessoriesView';
import {
  PARTS_CATEGORY_VALUES,
  PARTS_SORT_VALUES,
  formatPartsPrice,
  labelAvailability,
  labelCategory,
  labelSortOption,
} from '../lib/parts-accessories-i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P220_ENFORCE_CLEAN_EXACT = [
  'rental/components/PartsAccessoriesView.tsx',
  'rental/lib/parts-accessories-i18n.ts',
];

function isP220EnforceCleanPath(relPath: string): boolean {
  return P220_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p220ScopedFindings() {
  return inventory.findings.filter((finding) => isP220EnforceCleanPath(finding.file));
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

describe('rental Parts & Accessories localization (P2.2.20)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P220 scoped findings', () => {
      expect(p220ScopedFindings()).toHaveLength(0);
    });
  });

  describe('machine semantics', () => {
    it('preserves category machine values', () => {
      expect(PARTS_CATEGORY_VALUES).toEqual(['TIRES', 'PARTS', 'ACCESSORIES']);
    });

    it('preserves sort machine values for API payloads', () => {
      expect(PARTS_SORT_VALUES).toEqual(['relevance', 'price_asc', 'price_desc']);
      const source = readFileSync(join(__dirname, 'PartsAccessoriesView.tsx'), 'utf8');
      expect(source).toContain("sortBy: sort === 'relevance' ? undefined : sort === 'price_asc' ? 'price_asc' : 'price_desc'");
      expect(source).not.toContain("setSortBy(t(");
    });

    it('localizes category labels without changing machine keys', () => {
      expect(labelCategory('en', 'TIRES')).toBe(en['partsAccessories.category.TIRES.label']);
      expect(labelCategory('de', 'PARTS')).toBe(de['partsAccessories.category.PARTS.label']);
      expect('TIRES').toBe('TIRES');
    });

    it('localizes availability and sort display labels', () => {
      expect(labelAvailability('en', 'in_stock')).toBe(en['partsAccessories.availability.in_stock']);
      expect(labelSortOption('de', 'price_asc')).toBe(de['partsAccessories.sort.priceAsc']);
    });
  });

  describe('PartsAccessoriesView rendering', () => {
    it('renders EN step 1 without German literals', async () => {
      const view = renderWithLocale('en', createElement(PartsAccessoriesView, { isDarkMode: false }));
      cleanup = view.cleanup;
      await act(async () => {});
      const text = view.container.textContent ?? '';
      expect(text).toContain(en['nav.partsAccessories']);
      expect(text).toContain(en['partsAccessories.vehicle.title']);
      expect(text).toContain(en['partsAccessories.wizard.step.vehicle']);
      expect(text).toContain('M-AB 1234');
      expect(text).toContain('BMW');
      expect(text).not.toMatch(/Fahrzeug auswaehlen|Suchergebnisse|Autorisierung/);
    });

    it('renders DE step 1 with German dictionary strings', async () => {
      const view = renderWithLocale('de', createElement(PartsAccessoriesView, { isDarkMode: false }));
      cleanup = view.cleanup;
      await act(async () => {});
      const text = view.container.textContent ?? '';
      expect(text).toContain(de['nav.partsAccessories']);
      expect(text).toContain(de['partsAccessories.vehicle.title']);
      expect(text).toContain(de['partsAccessories.wizard.step.vehicle']);
      expect(text).toContain('M-AB 1234');
      expect(text).toContain('BMW');
    });

    it('switches locale at runtime without stale labels', async () => {
      const enView = renderWithLocale('en', createElement(PartsAccessoriesView, { isDarkMode: false }));
      await act(async () => {});
      expect(enView.container.textContent).toContain(en['partsAccessories.vehicle.title']);
      enView.cleanup();

      const deView = renderWithLocale('de', createElement(PartsAccessoriesView, { isDarkMode: false }));
      cleanup = deView.cleanup;
      await act(async () => {});
      expect(deView.container.textContent).toContain(de['partsAccessories.vehicle.title']);
      expect(deView.container.textContent).not.toContain(en['partsAccessories.vehicle.title']);
    });

    it('uses locale-aware price formatting helpers', () => {
      expect(formatPartsPrice('en', undefined, 'EUR')).toBe(en['partsAccessories.emptyValue']);
      expect(formatPartsPrice('de', 99.5, 'EUR')).toMatch(/99/);
    });
  });

  describe('translation key integrity', () => {
    it('does not leak raw translation keys in EN render', async () => {
      const view = renderWithLocale('en', createElement(PartsAccessoriesView, { isDarkMode: false }));
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).not.toMatch(/partsAccessories\.[a-zA-Z.]+/);
    });
  });
});
