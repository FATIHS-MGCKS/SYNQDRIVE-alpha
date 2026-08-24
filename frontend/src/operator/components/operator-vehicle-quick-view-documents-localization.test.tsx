// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  operatorVehicleQuickViewDocumentPrimaryLine,
  operatorVehicleQuickViewDocumentsSectionTitle,
  operatorVehicleQuickViewDocumentSecondaryLine,
  operatorVehicleQuickViewDocumentStatusLabel,
  operatorVehicleQuickViewDocumentTypeLabel,
} from '../lib/operator-vehicle-quick-view-i18n';
import {
  OperatorVehicleQuickViewDocuments,
  type OperatorVehicleQuickViewDocumentRow,
} from './OperatorVehicleQuickViewDocuments';

const P235_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewDocuments.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

const FILENAME_FIXTURE = 'Fahrzeugschein_Muster_ABC-42.pdf';

function isP235EnforceCleanPath(relPath: string): boolean {
  return P235_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p235ScopedFindings() {
  return inventory.findings.filter((finding) => isP235EnforceCleanPath(finding.file));
}

function documentFixture(
  overrides: Partial<OperatorVehicleQuickViewDocumentRow> = {},
): OperatorVehicleQuickViewDocumentRow {
  return {
    id: 'doc-1',
    documentType: 'TIRE',
    status: 'READY_FOR_REVIEW',
    sourceFileName: FILENAME_FIXTURE,
    createdAt: '2026-08-24T10:00:00.000Z',
    ...overrides,
  };
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

function renderDocuments(
  locale: 'de' | 'en',
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewDocuments>> = {},
) {
  return renderWithLocale(
    locale,
    createElement(OperatorVehicleQuickViewDocuments, {
      documents: [documentFixture()],
      documentsLoading: false,
      ...props,
    }),
  );
}

function LocaleSwitchHarness(
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewDocuments>>,
) {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    createElement(OperatorVehicleQuickViewDocuments, {
      documents: [documentFixture({ documentType: 'INVOICE', status: 'APPLIED' })],
      documentsLoading: false,
      ...props,
    }),
  );
}

function documentRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.rounded-xl.border.border-border\\/50.px-3.py-2'));
}

describe('operator Vehicle Quick View Documents localization (P2.2.35)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P235 scoped findings', () => {
      expect(p235ScopedFindings()).toHaveLength(0);
    });
  });

  describe('EN presentation', () => {
    it('renders localized section title and document row labels', () => {
      const view = renderDocuments('en');
      cleanup = view.cleanup;
      expect(view.container.querySelector('h3')?.textContent?.trim()).toBe(
        en['operator.vehicleQuickView.documents.sectionTitle'],
      );
      expect(view.container.textContent).toContain(en['documentExtraction.type.TIRE']);
      expect(view.container.textContent).toContain(en['documentExtraction.status.READY_FOR_REVIEW']);
      expect(view.container.textContent).toContain(FILENAME_FIXTURE);
    });
  });

  describe('DE presentation', () => {
    it('renders localized section title and document row labels', () => {
      const view = renderDocuments('de');
      cleanup = view.cleanup;
      expect(view.container.querySelector('h3')?.textContent?.trim()).toBe(
        de['operator.vehicleQuickView.documents.sectionTitle'],
      );
      expect(view.container.textContent).toContain(de['documentExtraction.type.TIRE']);
      expect(view.container.textContent).toContain(de['documentExtraction.status.READY_FOR_REVIEW']);
      expect(view.container.textContent).toContain(FILENAME_FIXTURE);
    });
  });

  describe('machine value freeze', () => {
    it('maps canonical document types and statuses without changing machine values', () => {
      const doc = documentFixture({ documentType: 'TIRE', status: 'PARTIALLY_APPLIED' });
      expect(doc.documentType).toBe('TIRE');
      expect(doc.status).toBe('PARTIALLY_APPLIED');
      expect(operatorVehicleQuickViewDocumentTypeLabel('en', doc.documentType)).toBe(
        en['documentExtraction.type.TIRE'],
      );
      expect(operatorVehicleQuickViewDocumentStatusLabel('de', doc.status)).toBe(
        de['documentExtraction.status.PARTIALLY_APPLIED'],
      );
    });

    it('preserves filename verbatim across locales', () => {
      const summary = documentFixture({ sourceFileName: FILENAME_FIXTURE });
      const enView = renderDocuments('en', { documents: [summary] });
      const deView = renderDocuments('de', { documents: [summary] });
      cleanup = () => {
        enView.cleanup();
        deView.cleanup();
      };
      expect(enView.container.textContent).toContain(FILENAME_FIXTURE);
      expect(deView.container.textContent).toContain(FILENAME_FIXTURE);
    });

    it('preserves document order and ids across locales', () => {
      const documents = [
        documentFixture({ id: 'doc-a', documentType: 'SERVICE', status: 'CONFIRMED' }),
        documentFixture({ id: 'doc-b', documentType: 'INVOICE', status: 'APPLIED' }),
      ];
      const enView = renderDocuments('en', { documents });
      const deView = renderDocuments('de', { documents });
      cleanup = () => {
        enView.cleanup();
        deView.cleanup();
      };
      const enLines = documentRows(enView.container).map((row) => row.textContent ?? '');
      const deLines = documentRows(deView.container).map((row) => row.textContent ?? '');
      expect(enLines[0]).toContain(en['documentExtraction.type.SERVICE']);
      expect(enLines[1]).toContain(en['documentExtraction.type.INVOICE']);
      expect(deLines[0]).toContain(de['documentExtraction.type.SERVICE']);
      expect(deLines[1]).toContain(de['documentExtraction.type.INVOICE']);
      expect(operatorVehicleQuickViewDocumentPrimaryLine('en', documents[0])).not.toBe(
        operatorVehicleQuickViewDocumentPrimaryLine('en', documents[1]),
      );
    });
  });

  describe('same-mount locale switch', () => {
    it('updates labels without remounting documents list', () => {
      const view = renderWithLocale('de', createElement(LocaleSwitchHarness));
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(
        de['operator.vehicleQuickView.documents.sectionTitle'],
      );
      expect(view.container.textContent).toContain(de['documentExtraction.type.INVOICE']);

      const toggle = view.container.querySelector('button') as HTMLButtonElement;
      act(() => toggle.click());

      expect(view.container.textContent).toContain(
        en['operator.vehicleQuickView.documents.sectionTitle'],
      );
      expect(view.container.textContent).toContain(en['documentExtraction.type.INVOICE']);
      expect(view.container.textContent).not.toContain('operator.vehicleQuickView.documents');
    });
  });

  describe('raw key and machine-code leakage guards', () => {
    it('does not render raw translation keys or mapped machine codes', () => {
      const view = renderDocuments('en');
      cleanup = view.cleanup;
      expect(view.container.textContent).not.toContain('operator.vehicleQuickView.documents');
      expect(view.container.textContent).not.toContain('documentExtraction.type');
      expect(view.container.textContent).not.toContain('READY_FOR_REVIEW');
      expect(operatorVehicleQuickViewDocumentsSectionTitle('de')).toBe(
        de['operator.vehicleQuickView.documents.sectionTitle'],
      );
      expect(operatorVehicleQuickViewDocumentSecondaryLine('en', documentFixture())).toContain(
        FILENAME_FIXTURE,
      );
    });
  });
});
