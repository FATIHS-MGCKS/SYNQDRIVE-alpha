// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    fines: {
      list: vi.fn(async () => []),
      stats: vi.fn(async () => ({
        total: 0,
        new: 0,
        matched: 0,
        forwarded: 0,
        resolved: 0,
        totalAmountCents: 0,
      })),
      get: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      uploadImage: vi.fn(async () => ({ url: 'https://example.com/fine.jpg' })),
    },
    vehicles: {
      listByOrg: vi.fn(async () => []),
    },
  },
}));

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
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
import { FinesView } from './FinesView';
import {
  FINE_OFFENSE_TYPE_VALUES,
  FINE_STATUS_VALUES,
  FINE_STATUS_FILTER_OPTIONS,
  formatFineAmount,
  formatFineDate,
  labelFineOffenseType,
  labelFineStatus,
} from '../lib/fines-i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P212_ENFORCE_CLEAN_EXACT = [
  'rental/components/FinesView.tsx',
  'rental/lib/fines-i18n.ts',
];

function isP212EnforceCleanPath(relPath: string): boolean {
  return P212_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p212ScopedFindings() {
  return inventory.findings.filter((finding) => isP212EnforceCleanPath(finding.file));
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

describe('rental Fines localization (P2.2.12)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P212 scoped findings', () => {
      expect(p212ScopedFindings()).toHaveLength(0);
    });
  });

  describe('machine semantics', () => {
    it('preserves fine status machine values', () => {
      expect(FINE_STATUS_VALUES).toEqual([
        'NEW',
        'UNDER_REVIEW',
        'MATCHED',
        'FORWARDED',
        'PENDING_RESPONSE',
        'RESOLVED',
        'CLOSED',
      ]);
      expect(FINE_STATUS_FILTER_OPTIONS[0]).toBe('all');
    });

    it('preserves offense type machine values for API payloads', () => {
      expect(FINE_OFFENSE_TYPE_VALUES).toContain('Geschwindigkeitsüberschreitung');
      expect(FINE_OFFENSE_TYPE_VALUES).toContain('Sonstiges');
      const source = readFileSync(join(__dirname, 'FinesView.tsx'), 'utf8');
      expect(source).toContain('value={offenseType}');
      expect(source).not.toContain("set('offenseType', t(");
    });

    it('localizes status labels without changing machine keys', () => {
      expect(labelFineStatus('en', 'NEW')).toBe(en['fines.status.NEW']);
      expect(labelFineStatus('de', 'RESOLVED')).toBe(de['fines.status.RESOLVED']);
    });

    it('localizes offense display while keeping German machine values', () => {
      const machine = 'Parkverstoß';
      expect(labelFineOffenseType('en', machine)).toBe(en['fines.offenseType.parking']);
      expect(labelFineOffenseType('de', machine)).toBe(de['fines.offenseType.parking']);
      expect(machine).toBe('Parkverstoß');
    });
  });

  describe('FinesView rendering', () => {
    it('renders EN list surface without German literals', async () => {
      const view = renderWithLocale('en', createElement(FinesView, { isDarkMode: false }));
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['fines.title']);
      expect(view.container.textContent).toContain(en['fines.filters.title']);
      expect(view.container.textContent).not.toMatch(/Bußgelder|Manuell erfassen|Alle Status/);
    });

    it('renders DE list surface with German dictionary strings', async () => {
      const view = renderWithLocale('de', createElement(FinesView, { isDarkMode: false }));
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(de['fines.title']);
      expect(view.container.textContent).toContain(de['fines.manualCreate']);
      expect(view.container.textContent).toContain(de['fines.col.amount']);
    });

    it('uses locale-aware formatting helpers', () => {
      const enAmount = formatFineAmount('en', 12345, 'EUR');
      const deAmount = formatFineAmount('de', 12345, 'EUR');
      expect(enAmount).toContain('123');
      expect(deAmount).toContain('123');
      expect(formatFineDate('en', null)).toBe(en['fines.emptyValue']);
      expect(formatFineDate('de', '2026-08-21T10:00:00.000Z')).toMatch(/21/);
    });
  });

  describe('translation key integrity', () => {
    it('does not leak raw translation keys in EN render', async () => {
      const view = renderWithLocale('en', createElement(FinesView, { isDarkMode: false }));
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).not.toMatch(/fines\.[a-zA-Z.]+/);
    });
  });
});
