// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement, useEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { writePersistedLocale } from '../../i18n/locales';
import { RentalStressAnalysisCard } from './RentalStressAnalysisCard';
import { MisuseCasesPanel } from './MisuseCasesPanel';
import { api } from '../../lib/api';
import {
  resolveContextClassificationLabel,
  resolveMisuseCaseStatusLabel,
  resolveMisuseSeverityLabel,
  resolveUnknownMachineLabel,
  resolveWearImpactLabel,
} from '../lib/rental-misuse-stress-i18n';

const P264_ENFORCE_CLEAN_EXACT = [
  'rental/components/MisuseCasesPanel.tsx',
  'rental/components/RentalStressAnalysisCard.tsx',
  'rental/lib/misuse-case-lifecycle.ui.ts',
  'rental/lib/rental-misuse-stress-i18n.ts',
];

const ORG_ID = 'org-p264';
const RAW_BACKEND_DESCRIPTION = 'Backend Misuse Description X7';
const RAW_VEHICLE_AREA = 'Provider Wear Area X7';
const RAW_WATCHPOINT = 'Provider Watchpoint X7';

const apiCounters = { misuseList: 0 };
let mountCount = 0;

const mockMisuseCase = {
  id: 'misuse-p264-x7',
  type: 'COLD_ENGINE_ABUSE',
  tripId: 'trip-p264',
  vehicleId: 'vehicle-p264',
  bookingId: 'booking-p264',
  severity: 'WARNING',
  confidence: 'MEDIUM',
  status: 'REVIEW_REQUIRED',
  description: RAW_BACKEND_DESCRIPTION,
  eventCount: 2,
  lifecycle: {
    status: 'REVIEW_REQUIRED',
    decisionEligibility: 'INFORMATIONAL_ONLY',
  },
  evidenceSummary: {
    contextEvidence: {
      contextClassifications: ['PROVIDER_CLASSIFICATION_X7'],
      evidenceGrade: 'PROVIDER_GRADE_X7',
      confidence: 'PROVIDER_CONFIDENCE_X7',
      usedSignals: ['hardBraking'],
      sourceAnchors: { drivingEventIds: ['evt-1'] },
    },
    evidenceCase: {
      evidenceLevel: 'MISUSE_SUSPECTED',
      confidence: 'LOW',
      source: 'NATIVE_EVENT',
      reasons: [RAW_BACKEND_DESCRIPTION],
      explanation: RAW_BACKEND_DESCRIPTION,
      measurements: [],
      requiresHumanReview: true,
    },
  },
};

const mockAnalysis = {
  drivingScore: 72,
  payload: {
    vehicleStressSummary: {
      drivingStressScore: 72,
      stressLevel: 'high',
      summary: RAW_BACKEND_DESCRIPTION,
    },
    analysisMeta: {
      dataConfidence: 'medium',
      scoredTripCount: 3,
      totalDistanceKm: 120.4,
    },
    overallAssessment: { shortSummary: RAW_BACKEND_DESCRIPTION },
    wearImpactAssessment: {
      summary: RAW_BACKEND_DESCRIPTION,
      affectedAreas: [{ area: RAW_VEHICLE_AREA, impact: 'high' }],
    },
    watchpoints: [RAW_WATCHPOINT],
  },
};

function tFor(locale: 'de' | 'en') {
  const dict = locale === 'de' ? de : en;
  return (key: keyof typeof de, vars?: Record<string, string | number>) => {
    let value = String(dict[key as keyof typeof dict] ?? key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  };
}

function LocaleHarness({ children }: { children: ReactNode }) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      mountCount += 1;
    }
  }, []);
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', 'data-testid': 'locale-de', onClick: () => setLocale('de') },
      'DE',
    ),
    createElement(
      'button',
      { type: 'button', 'data-testid': 'locale-en', onClick: () => setLocale('en') },
      'EN',
    ),
    createElement('div', { 'data-testid': `active-locale-${locale}` }, children),
  );
}

beforeEach(() => {
  mountCount = 0;
  apiCounters.misuseList = 0;
  writePersistedLocale('de');
  vi.spyOn(api.misuseCases, 'list').mockImplementation(async () => {
    apiCounters.misuseList += 1;
    return { data: [mockMisuseCase] } as never;
  });
});

describe('rental vehicle stress & misuse hints localization (P2.2.64)', () => {
  it('keeps P264 enforce-clean scope at zero inventory findings', () => {
    const debt = inventory.findings.filter((f) => P264_ENFORCE_CLEAN_EXACT.includes(f.file));
    expect(debt).toHaveLength(0);
  });

  it('resolves known machines and preserves unknown raw fallbacks', () => {
    const tEn = tFor('en');
    expect(resolveMisuseSeverityLabel(tEn, 'CRITICAL')).toBe('Critical');
    expect(resolveMisuseSeverityLabel(tEn, 'PROVIDER_SEVERITY_X7')).toBe('PROVIDER_SEVERITY_X7');
    expect(resolveMisuseCaseStatusLabel(tEn, 'CONFIRMED')).toBe('Confirmed');
    expect(resolveMisuseCaseStatusLabel(tEn, 'PROVIDER_STATUS_X7')).toBe('PROVIDER_STATUS_X7');
    expect(resolveWearImpactLabel('en', 'high')).toBe('High');
    expect(resolveWearImpactLabel('en', 'PROVIDER_WEAR_X7')).toBe('PROVIDER_WEAR_X7');
    expect(resolveContextClassificationLabel('en', 'PROVIDER_CLASSIFICATION_X7')).toBe(
      'PROVIDER_CLASSIFICATION_X7',
    );
    expect(resolveUnknownMachineLabel('PROVIDER_MISUSE_TYPE_X7')).toBe('PROVIDER_MISUSE_TYPE_X7');
  });

  it('localizes RentalStressAnalysisCard host copy in DE and EN', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LocaleHarness, {
            children: createElement(RentalStressAnalysisCard, {
              analysis: mockAnalysis as never,
            }),
          }),
        ),
      );
    });

    expect(container.textContent).toContain(de['misuseStress.stress.wearRelevance']);
    expect(container.textContent).toContain(RAW_BACKEND_DESCRIPTION);
    expect(container.textContent).toContain(RAW_VEHICLE_AREA);
    expect(container.textContent).toContain(RAW_WATCHPOINT);

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain(en['misuseStress.stress.wearRelevance']);
    expect(container.textContent).toContain(RAW_BACKEND_DESCRIPTION);
    expect(container.textContent).toContain(RAW_VEHICLE_AREA);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('preserves same-mount state across DE → EN → DE with zero locale business refetch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LocaleHarness, {
            children: createElement(MisuseCasesPanel, {
              orgId: ORG_ID,
              bookingId: 'booking-p264',
            }),
          }),
        ),
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mountCount).toBe(1);
    expect(apiCounters.misuseList).toBe(1);
    expect(container.textContent).toContain(RAW_BACKEND_DESCRIPTION);
    expect(container.textContent).toContain(de['misuseStress.panel.defaultTitle']);

    const countersAfterLoad = { ...apiCounters };

    await act(async () => {
      (container.querySelector('[data-testid="locale-en"]') as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain(en['misuseStress.panel.defaultTitle']);
    expect(container.textContent).toContain(RAW_BACKEND_DESCRIPTION);
    expect(apiCounters).toEqual(countersAfterLoad);

    await act(async () => {
      (container.querySelector('[data-testid="locale-de"]') as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain(de['misuseStress.panel.defaultTitle']);
    expect(container.textContent).toContain(RAW_BACKEND_DESCRIPTION);
    expect(apiCounters).toEqual(countersAfterLoad);
    expect(mountCount).toBe(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps adapter free of fetch and domain mutation logic', () => {
    const source = readFileSync(
      resolve(__dirname, '../lib/rental-misuse-stress-i18n.ts'),
      'utf8',
    );
    expect(source).not.toContain('api.misuseCases');
    expect(source).not.toContain('normalizeOperationalIssues');
    expect(source).not.toContain('resolveDrivingStressScore');
  });
});
