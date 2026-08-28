// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { writePersistedLocale } from '../../i18n/locales';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import { DocumentsView } from './DocumentsView';
import {
  formatVehicleDocumentDate,
  formatVehicleDocumentSpecValue,
  resolveFixedCostStatusLabel,
  resolveRentalHealthLabel,
  resolveTimelineKindLabel,
  resolveVehicleDocumentCategoryEmptyHint,
  resolveVehicleDocumentCategoryShortTitle,
  resolveVehicleDocumentUiStatusLabel,
} from '../lib/rental-vehicle-documents-i18n';
import { uiStatusLabel, uiStatusTone } from '../lib/vehicle-file-summary.types';
import { sortDocumentCategories } from './documents/vehicle-file.constants';
import type { VehicleFileSummary } from '../lib/vehicle-file-summary.types';

const P259_ENFORCE_CLEAN_EXACT = [
  'rental/components/DocumentsView.tsx',
  'rental/components/documents/DocumentComplianceSummaryCard.tsx',
];

const P258_ENFORCE_CLEAN_EXACT = ['rental/components/billing/TenantBillingAddOnsTab.tsx'];

const RAW_TIMELINE_TITLE = 'Provider Document Timeline X7';
const RAW_TIMELINE_SUBTITLE = 'Provider Document Subtitle X7';
const RAW_FILENAME = 'Fahrzeugschein_X7.pdf';
const RAW_TASK_TITLE = 'Provider Task Title X7';
const BACKEND_ERROR = 'Backend Vehicle Documents Error X7';
const RAW_SPEC_VALUE = 'Provider Spec X7';
const RAW_LICENSE = 'ABC-123-X7';
const EXTRACTION_ID = 'ext-x7';
const TASK_ID = 'task-x7';
const TIMELINE_ID_A = 'timeline-a-x7';
const TIMELINE_ID_B = 'timeline-b-x7';

const reloadSpy = vi.fn();
let mockError: string | null = null;

const mockSummary: VehicleFileSummary = {
  vehicle: {
    id: 'veh-x7',
    vin: 'VIN123456789',
    licensePlate: RAW_LICENSE,
    make: 'Provider',
    model: 'Model X7',
    year: 2024,
    odometerKm: 12000,
    organizationId: 'org-1',
  },
  canonicalStatus: {
    rentalHealthStatus: 'warning',
    rentalHealthSource: 'rental_health_service',
    rentalBlocked: false,
    blockingReasons: [],
    serviceCompliance: {
      tuv: {
        label: 'TÜV',
        status: 'warning',
        uiStatus: 'expiring_soon',
        validTill: '2026-12-01T00:00:00.000Z',
        lastDate: null,
        source: 'service_compliance_service',
        detail: '',
      },
      bokraft: null,
      nextService: null,
    },
    note: 'Provider canonical note X7',
  },
  documentCategories: [
    {
      id: 'registration',
      label: 'registration',
      uiStatus: 'verified',
      statusSource: 'document_extraction',
      documentCount: 1,
      latestExtractionId: EXTRACTION_ID,
      latestFileName: RAW_FILENAME,
      complianceDisplay: null,
    },
    {
      id: 'insurance',
      label: 'insurance',
      uiStatus: 'missing',
      statusSource: 'not_available',
      documentCount: 0,
      latestExtractionId: null,
      latestFileName: null,
      complianceDisplay: null,
    },
    {
      id: 'other',
      label: 'Provider Unknown Category X7',
      uiStatus: 'uploaded',
      statusSource: 'unknown_source_x7',
      documentCount: 1,
      latestExtractionId: null,
      latestFileName: null,
      complianceDisplay: null,
    },
  ],
  mandatoryDocumentCoverage: { configured: 1, total: 4 },
  fixedCosts: {
    currency: 'EUR',
    monthlyTotal: 250,
    items: [
      {
        key: 'leasing',
        label: 'Leasing',
        amountMonthly: 250,
        amountYearly: 3000,
        source: 'vehicle_master_data',
        evidenceDocumentId: null,
        evidenceFileName: RAW_FILENAME,
        status: 'verified',
      },
      {
        key: 'unknown',
        label: 'Unknown cost',
        amountMonthly: null,
        amountYearly: null,
        source: 'unknown_cost_source_x7',
        evidenceDocumentId: null,
        evidenceFileName: null,
        status: 'unknown_status_x7',
      },
    ],
  },
  variableCostAverages: {
    serviceAverageMonthly: 80,
    repairAverageMonthly: 40,
    sampleServiceEvents: 3,
    sampleRepairEvents: 2,
    source: 'service_events',
  },
  technicalSpecs: {
    general: [{ key: 'spec-x7', label: 'Spec field', value: RAW_SPEC_VALUE, source: 'vehicle_master_data' }],
    lvBattery: [],
    hvBattery: null,
    tankEngine: null,
  },
  pendingReviews: { count: 1, items: [] },
  evidenceCounts: { tuv: 0, service: 0, repair: 0 },
  timeline: [
    {
      id: TIMELINE_ID_B,
      kind: 'document',
      title: RAW_TIMELINE_TITLE,
      subtitle: RAW_TIMELINE_SUBTITLE,
      occurredAt: '2026-06-02T10:00:00.000Z',
      uiStatus: 'verified',
      source: 'document_extraction',
      relatedExtractionId: EXTRACTION_ID,
      relatedServiceEventId: null,
    },
    {
      id: TIMELINE_ID_A,
      kind: 'unknown_kind_x7',
      title: 'Second timeline raw title X7',
      subtitle: null,
      occurredAt: '2026-06-01T10:00:00.000Z',
      uiStatus: 'uploaded',
      source: 'unknown_timeline_source_x7',
      relatedExtractionId: null,
      relatedServiceEventId: 'svc-1',
    },
  ],
};

const translate =
  (dict: Record<string, string>) =>
  (key: TranslationKey, vars?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

const tDe = translate(de);
const tEn = translate(en);

let documentsMountCount = 0;

vi.mock('./documents/VehicleDocumentUploadDrawer', () => ({
  VehicleDocumentUploadDrawer: () => null,
}));

vi.mock('../hooks/useVehicleFileSummary', () => ({
  useVehicleFileSummary: () => ({
    summary: mockError ? null : mockSummary,
    loading: false,
    error: mockError,
    reload: reloadSpy,
  }),
}));

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-1',
    hasPermission: () => true,
    loading: false,
  }),
}));

vi.mock('../../lib/api', () => ({
  api: {
    tasks: {
      forVehicle: vi.fn(async () => [
        {
          id: TASK_ID,
          title: RAW_TASK_TITLE,
          documentId: EXTRACTION_ID,
        },
      ]),
    },
  },
}));

describe('P2.2.59 rental vehicle documents overview localization', () => {
  beforeEach(() => {
    documentsMountCount = 0;
    mockError = null;
    reloadSpy.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('has zero P259 enforce-clean scanner debt on active paths', () => {
    const scoped = inventory.findings.filter((f) => P259_ENFORCE_CLEAN_EXACT.includes(f.file));
    expect(scoped).toHaveLength(0);
  });

  it('localizes known category, status, timeline kind, and fixed-cost mappings', () => {
    expect(resolveVehicleDocumentCategoryShortTitle('registration', tEn)).toBe(
      en['vehicleDocuments.category.registration.shortTitle'],
    );
    expect(resolveVehicleDocumentCategoryShortTitle('registration', tDe)).toBe(
      de['vehicleDocuments.category.registration.shortTitle'],
    );
    expect(resolveVehicleDocumentCategoryShortTitle('unknown_cat', tEn, 'Provider Unknown Category X7')).toBe(
      'Provider Unknown Category X7',
    );
    expect(resolveVehicleDocumentUiStatusLabel('verified', tEn)).toBe(
      en['vehicleDocuments.status.verified'],
    );
    expect(uiStatusLabel('verified', false)).toBe(en['vehicleDocuments.status.verified']);
    expect(uiStatusLabel('verified', true)).toBe(de['vehicleDocuments.status.verified']);
    expect(resolveTimelineKindLabel('service_event', tDe)).toBe(
      de['vehicleDocuments.timelineKind.service_event'],
    );
    expect(resolveTimelineKindLabel('unknown_kind_x7', tEn)).toBe('unknown_kind_x7');
    expect(resolveFixedCostStatusLabel('verified', tEn)).toBe(
      en['vehicleDocuments.fixedCostStatus.verified'],
    );
    expect(resolveFixedCostStatusLabel('not_configured', tEn)).toBe(
      en['vehicleDocuments.fixedCostStatus.not_configured'],
    );
    expect(resolveFixedCostStatusLabel('unknown_status_x7', tEn)).toBe(
      en['vehicleDocuments.specs.notProvided'],
    );
  });

  it('reuses canonical readiness keys for rental health where exact', () => {
    expect(resolveRentalHealthLabel('healthy', tEn)).toBe(en['vehicle.overview.readiness.ready']);
    expect(resolveRentalHealthLabel('healthy', tDe)).toBe(de['vehicle.overview.readiness.ready']);
    expect(resolveRentalHealthLabel('unknown', tEn)).toBe(en['vehicle.overview.readiness.unknown']);
    expect(resolveRentalHealthLabel('warning', tEn)).toBe(en['vehicleDocuments.rentalHealth.warning']);
    expect(resolveRentalHealthLabel('warning', tEn)).not.toBe(en['vehicle.overview.readiness.attention']);
    expect(resolveRentalHealthLabel('blocked', tDe)).toBe(de['vehicleDocuments.rentalHealth.blocked']);
    expect(resolveRentalHealthLabel('blocked', tDe)).not.toBe(de['vehicle.overview.readiness.blocked']);
  });

  it('uses proof-category empty-hint template with localized short titles', () => {
    expect(resolveVehicleDocumentCategoryEmptyHint('service_proof', tEn)).toBe(
      'No Service evidence on file yet.',
    );
    expect(resolveVehicleDocumentCategoryEmptyHint('service_proof', tDe)).toBe(
      'Noch keine Service-Nachweise hinterlegt.',
    );
    expect(resolveVehicleDocumentCategoryEmptyHint('repair_proof', tEn)).toBe(
      en['vehicleDocuments.category.repair_proof.emptyHint'],
    );
  });

  it('preserves status tone machine while localizing labels', () => {
    expect(uiStatusTone('verified')).toBe('success');
    expect(uiStatusTone('expired')).toBe('critical');
    expect(resolveVehicleDocumentUiStatusLabel('verified', tEn)).not.toBe(
      resolveVehicleDocumentUiStatusLabel('verified', tDe),
    );
  });

  it('preserves raw ISO dates while formatting display per locale', () => {
    const iso = '2026-06-02T10:00:00.000Z';
    const deDisplay = formatVehicleDocumentDate('de', iso, true);
    const enDisplay = formatVehicleDocumentDate('en', iso, true);
    expect(deDisplay).not.toBe(enDisplay);
    expect(new Date(iso).toISOString()).toBe(iso);
  });

  it('localizes spec fallback only and preserves raw spec values', () => {
    expect(formatVehicleDocumentSpecValue(RAW_SPEC_VALUE, tEn)).toBe(RAW_SPEC_VALUE);
    expect(formatVehicleDocumentSpecValue(null, tEn)).toBe(en['vehicleDocuments.specs.notProvided']);
    expect(formatVehicleDocumentSpecValue(null, tDe)).toBe(de['vehicleDocuments.specs.notProvided']);
  });

  it('preserves raw timeline, filename, task title, spec, and license in DE and EN DOM', async () => {
    writePersistedLocale('de');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function LocaleSurface() {
      const { setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-de',
          onClick: () => setLocale('de'),
        }),
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }),
        createElement(DocumentsView, {
          vehicle: { id: 'veh-x7', make: 'Provider', model: 'Model X7', license: RAW_LICENSE } as never,
          onOpenLinkedTask: vi.fn(),
        }),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(LocaleSurface)));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    for (const locale of ['de', 'en'] as const) {
      await act(async () => {
        container.querySelector(`[data-testid="locale-${locale}"]`)?.dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(container.textContent).toContain(RAW_TIMELINE_TITLE);
      expect(container.textContent).toContain(RAW_TIMELINE_SUBTITLE);
      expect(container.textContent).toContain(RAW_FILENAME);
      expect(container.textContent).toContain(RAW_TASK_TITLE);
      expect(container.textContent).toContain(RAW_SPEC_VALUE);
      expect(container.textContent).toContain(RAW_LICENSE);
    }

    root.unmount();
    container.remove();
  });

  it('preserves category machine order across locale switches', async () => {
    writePersistedLocale('de');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const expectedCategoryOrder = sortDocumentCategories(mockSummary.documentCategories).map(
      (cat) => cat.id,
    );

    function LocaleSurface() {
      const { setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-de',
          onClick: () => setLocale('de'),
        }),
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }),
        createElement(DocumentsView, {
          vehicle: { id: 'veh-x7', make: 'Provider', model: 'Model X7', license: RAW_LICENSE } as never,
          onOpenLinkedTask: vi.fn(),
        }),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(LocaleSurface)));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const readCategoryIds = () =>
      Array.from(container.querySelectorAll('[data-category-id]')).map((el) =>
        el.getAttribute('data-category-id'),
      );

    const categoryIdsDe = readCategoryIds();
    expect(categoryIdsDe).toEqual(expectedCategoryOrder);

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const categoryIdsEn = readCategoryIds();
    expect(categoryIdsEn).toEqual(expectedCategoryOrder);

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(readCategoryIds()).toEqual(expectedCategoryOrder);

    root.unmount();
    container.remove();
  });

  it('preserves timeline machine order across locale switches', async () => {
    writePersistedLocale('de');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const expectedTimelineOrder = mockSummary.timeline.map((item) => item.id);

    function LocaleSurface() {
      const { setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-de',
          onClick: () => setLocale('de'),
        }),
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }),
        createElement(DocumentsView, {
          vehicle: { id: 'veh-x7', make: 'Provider', model: 'Model X7', license: RAW_LICENSE } as never,
          onOpenLinkedTask: vi.fn(),
        }),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(LocaleSurface)));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const readTimelineIds = () =>
      Array.from(container.querySelectorAll('[data-timeline-id]')).map((el) =>
        el.getAttribute('data-timeline-id'),
      );

    expect(readTimelineIds()).toEqual(expectedTimelineOrder);

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(readTimelineIds()).toEqual(expectedTimelineOrder);

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(readTimelineIds()).toEqual(expectedTimelineOrder);

    root.unmount();
    container.remove();
  });

  it('preserves true same-mount state across DE→EN→DE without reload side effects', async () => {
    writePersistedLocale('de');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function MountTrackedDocuments() {
      useEffect(() => {
        documentsMountCount += 1;
      }, []);
      return createElement(DocumentsView, {
        vehicle: { id: 'veh-x7', make: 'Provider', model: 'Model X7', license: RAW_LICENSE } as never,
      });
    }

    function LocaleSurface() {
      const { setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-de',
          onClick: () => setLocale('de'),
        }),
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }),
        createElement(MountTrackedDocuments),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(LocaleSurface)));
    });
    expect(documentsMountCount).toBe(1);
    expect(container.textContent).toContain(de['vehicleDocuments.header.title']);

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(documentsMountCount).toBe(1);
    expect(container.textContent).toContain(en['vehicleDocuments.header.title']);
    expect(container.textContent).toContain(RAW_TIMELINE_TITLE);

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(documentsMountCount).toBe(1);
    expect(container.textContent).toContain(de['vehicleDocuments.header.title']);
    expect(reloadSpy).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  it('preserves raw backend error body with localized host heading', async () => {
    writePersistedLocale('en');
    mockError = BACKEND_ERROR;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(DocumentsView, {
            vehicle: { id: 'veh-x7', make: 'Provider', model: 'Model X7' } as never,
          }),
        ),
      );
    });

    expect(container.textContent).toContain(en['vehicleDocuments.error.title']);
    expect(container.textContent).toContain(BACKEND_ERROR);

    root.unmount();
    container.remove();
    mockError = null;
  });

  it('has no locale-based React keys in P259 paths', () => {
    for (const relPath of P259_ENFORCE_CLEAN_EXACT) {
      const source = readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
      expect(source).not.toMatch(/key=\{locale\}/);
      expect(source).not.toMatch(/key=\{t\(/);
      expect(source).not.toMatch(/key=\{translatedLabel\}/);
    }
  });

  it('certifies P258 add-ons path remains frozen', () => {
    const p258Debt = inventory.findings.filter((f) => P258_ENFORCE_CLEAN_EXACT.includes(f.file));
    expect(p258Debt).toHaveLength(0);
  });
});
