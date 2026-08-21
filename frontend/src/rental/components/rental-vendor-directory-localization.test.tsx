// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

const mockVendors = [
  {
    id: 'vendor-1',
    name: 'Acme Workshop',
    category: 'WORKSHOP',
    sourceType: 'LOCAL_BUSINESS',
    source: 'MANUAL',
    externalPlaceId: null,
    street: 'Main 1',
    city: 'Berlin',
    postalCode: '10115',
    country: 'DE',
    latitude: null,
    longitude: null,
    website: null,
    phone: '+491234',
    email: 'shop@acme.test',
    notes: null,
    serviceAreas: ['Tires', 'Brakes'],
    contactName: 'Max',
    contactRole: null,
    contactPhone: null,
    contactEmail: null,
    contactNotes: null,
    isActive: true,
    linkedVehicleCount: 2,
    invoiceCount: 0,
    linkedVehicles: [{ id: 'veh-1', isPreferred: true, relationType: 'PRIMARY_WORKSHOP' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

vi.mock('../../lib/api', () => ({
  api: {
    vendors: {
      list: vi.fn(async () => mockVendors),
      get: vi.fn(async () => mockVendors[0]),
      searchMapbox: vi.fn(async () => ({ suggestions: [], sessionToken: 'tok' })),
      mapboxRetrieve: vi.fn(async () => null),
      create: vi.fn(async () => mockVendors[0]),
      update: vi.fn(async () => mockVendors[0]),
      delete: vi.fn(async () => null),
      linkVehicle: vi.fn(async () => null),
      updateLink: vi.fn(async () => null),
      unlinkVehicle: vi.fn(async () => null),
      invoices: vi.fn(async () => []),
      audit: vi.fn(async () => []),
      documents: vi.fn(async () => []),
    },
    tasks: {
      forVendor: vi.fn(async () => []),
    },
  },
}));

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-1',
    hasPermission: () => true,
  }),
}));

vi.mock('../FleetContext', () => ({
  useFleetVehicles: () => ({
    fleetVehicles: [{ id: 'veh-1', model: 'Golf', license: 'B-AC 123', make: 'VW', year: 2024 }],
  }),
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
import { VendorDirectoryCard } from './vendors/VendorDirectoryCard';
import { VendorManagementView } from './VendorManagementView';
import {
  filterVendorDirectory,
  VENDOR_CATEGORIES,
  VENDOR_SERVICE_AREAS,
} from '../lib/vendor-directory.utils';
import {
  labelVendorCategory,
  labelVendorCategoryFilter,
  labelVendorRelationType,
  labelVendorScope,
  labelVendorServiceArea,
  labelVendorServiceAreaFilter,
  VENDOR_CATEGORY_LABEL_KEY_ENTRIES,
  VENDOR_RELATION_VALUES,
  VENDOR_SCOPE_VALUES,
  VENDOR_SERVICE_AREA_LABEL_KEY_ENTRIES,
  formatVendorDirectoryDate,
  vdi,
} from '../lib/vendor-directory-i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P215_ENFORCE_CLEAN_EXACT = [
  'rental/components/VendorManagementView.tsx',
  'rental/components/VendorDetailView.tsx',
  'rental/components/vendors/VendorOperationalTasks.tsx',
  'rental/components/vendors/VendorDirectoryCard.tsx',
  'rental/lib/vendor-directory.utils.ts',
  'rental/lib/vendor-directory-i18n.ts',
];

function isP215EnforceCleanPath(relPath: string): boolean {
  return P215_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p215ScopedFindings() {
  return inventory.findings.filter((finding) => isP215EnforceCleanPath(finding.file));
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

describe('rental Vendor Directory localization (P2.2.15)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P215 scoped findings', () => {
      expect(p215ScopedFindings()).toHaveLength(0);
    });
  });

  describe('machine semantics', () => {
    it('preserves vendor category machine values', () => {
      expect(VENDOR_CATEGORIES.map((c) => c.value)).toContain('WORKSHOP');
      expect(VENDOR_CATEGORIES[0].value).toBe('WORKSHOP');
    });

    it('preserves service area machine tokens for filtering', () => {
      expect(VENDOR_SERVICE_AREAS).toContain('Tires');
      expect(VENDOR_SERVICE_AREAS).toContain('Oil / Service');
    });

    it('preserves scope and relation machine values', () => {
      expect(VENDOR_SCOPE_VALUES).toEqual(['ALL', 'ACTIVE', 'INACTIVE', 'LINKED', 'PREFERRED']);
      expect(VENDOR_RELATION_VALUES).toContain('PRIMARY_WORKSHOP');
    });

    it('filters with identical machine semantics regardless of locale labels', () => {
      const filtered = filterVendorDirectory(mockVendors as never, {
        search: 'acme',
        category: 'WORKSHOP',
        serviceArea: 'Tires',
        scope: 'LINKED',
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.category).toBe('WORKSHOP');
      expect(filtered[0]?.serviceAreas).toContain('Tires');
    });

    it('localizes category labels without changing machine keys', () => {
      expect(labelVendorCategory('en', 'WORKSHOP')).toBe(en['tasks.vendor.category.WORKSHOP']);
      expect(labelVendorCategory('de', 'PARTS_DEALER')).toBe(de['vendors.directory.category.PARTS_DEALER']);
    });

    it('localizes service area presentation while preserving machine token', () => {
      expect(labelVendorServiceArea('en', 'Tires')).toBe(en['vendors.directory.serviceArea.Tires']);
      expect(labelVendorServiceArea('de', 'Brakes')).toBe(de['vendors.directory.serviceArea.Brakes']);
      expect(VENDOR_SERVICE_AREAS).toContain('Tires');
    });

    it('localizes scope and relation presentation', () => {
      expect(labelVendorScope('en', 'ACTIVE')).toBe(en['vendors.directory.scope.ACTIVE']);
      expect(labelVendorRelationType('de', 'TIRE_PARTNER')).toBe(de['vendors.directory.relation.TIRE_PARTNER']);
    });

    it('localizes filter labels with ALL using reused task vendor keys', () => {
      expect(labelVendorCategoryFilter('en', 'ALL')).toBe(en['tasks.vendor.allCategories']);
      expect(labelVendorServiceAreaFilter('de', 'ALL')).toBe(de['tasks.vendor.allServiceAreas']);
    });

    it('uses locale-aware date formatting', () => {
      expect(formatVendorDirectoryDate('de', '2026-07-01T00:00:00.000Z')).toMatch(/2026/);
      expect(formatVendorDirectoryDate('en', '2026-07-01T00:00:00.000Z')).toMatch(/2026/);
    });
  });

  describe('VendorManagementView rendering', () => {
    it('renders EN directory chrome without German literals', async () => {
      const view = renderWithLocale('en', createElement(VendorManagementView, {}));
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['vendors.directory.page.service']);
      expect(view.container.textContent).toContain(en['vendors.directory.filters.title']);
      expect(view.container.textContent).not.toMatch(/Partnerverzeichnis filtern|Alle Partner/);
    });

    it('renders DE directory chrome with German dictionary strings', async () => {
      const view = renderWithLocale('de', createElement(VendorManagementView, {}));
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(de['vendors.directory.page.service']);
      expect(view.container.textContent).toContain(de['vendors.directory.filters.title']);
      expect(view.container.textContent).toContain(de['vendors.directory.scope.ALL']);
    });

    it('renders embedded service center header in DE without English ternaries', async () => {
      const view = renderWithLocale(
        'de',
        createElement(VendorManagementView, { embedded: true, embeddedInServiceCenter: true }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(de['vendors.directory.page.embeddedTitle']);
      expect(view.container.textContent).not.toContain('Service providers & workshops');
    });
  });

  describe('VendorDirectoryCard rendering', () => {
    it('renders localized card actions and category label', async () => {
      const view = renderWithLocale(
        'en',
        createElement(VendorDirectoryCard, {
          vendor: mockVendors[0] as never,
          onView: vi.fn(),
          onEdit: vi.fn(),
          onCreateTask: vi.fn(),
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['vendors.directory.action.view']);
      expect(view.container.textContent).toContain(en['tasks.vendor.category.WORKSHOP']);
      expect(view.container.textContent).toContain(en['vendors.directory.serviceArea.Tires']);
    });

    it('renders DE card labels', async () => {
      const view = renderWithLocale(
        'de',
        createElement(VendorDirectoryCard, {
          vendor: mockVendors[0] as never,
          onView: vi.fn(),
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(de['vendors.directory.action.view']);
      expect(view.container.textContent).toContain(de['tasks.vendor.category.WORKSHOP']);
    });
  });

  describe('blind-spot guard', () => {
    it('maps every category to a translation key', () => {
      expect(VENDOR_CATEGORY_LABEL_KEY_ENTRIES).toHaveLength(VENDOR_CATEGORIES.length);
      for (const entry of VENDOR_CATEGORY_LABEL_KEY_ENTRIES) {
        expect(en[entry.labelKey]).toBeTruthy();
        expect(de[entry.labelKey]).toBeTruthy();
      }
    });

    it('maps every service area to a translation key', () => {
      expect(VENDOR_SERVICE_AREA_LABEL_KEY_ENTRIES).toHaveLength(VENDOR_SERVICE_AREAS.length);
      for (const entry of VENDOR_SERVICE_AREA_LABEL_KEY_ENTRIES) {
        expect(en[entry.labelKey]).toBeTruthy();
        expect(de[entry.labelKey]).toBeTruthy();
      }
    });

    it('keeps vendor-directory.utils free of presentation literals', () => {
      const source = readFileSync(join(__dirname, '../lib/vendor-directory.utils.ts'), 'utf8');
      expect(source).not.toMatch(/label:\s*'/);
      expect(source).not.toMatch(/Werkstatt/);
    });

    it('keeps vendor-directory-i18n free of inline German presentation strings', () => {
      const source = readFileSync(join(__dirname, '../lib/vendor-directory-i18n.ts'), 'utf8');
      expect(source).not.toMatch(/'Werkstatt'/);
      expect(source).not.toMatch(/'Alle Partner'/);
      expect(source).toContain('vendors.directory.scope.ALL');
    });

    it('does not leak raw translation keys in rendered card output', async () => {
      const view = renderWithLocale(
        'en',
        createElement(VendorDirectoryCard, {
          vendor: mockVendors[0] as never,
          onView: vi.fn(),
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).not.toContain('vendors.directory.');
    });
  });

  describe('dictionary integrity spot checks', () => {
    it('resolves interpolated filter counts via vdi', () => {
      expect(vdi('en', 'vendors.directory.filters.showing', { visible: 3, total: 10 })).toContain('3');
      expect(vdi('de', 'vendors.directory.filters.showing', { visible: 3, total: 10 })).toContain('10');
    });
  });
});
