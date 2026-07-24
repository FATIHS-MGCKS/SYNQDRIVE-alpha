// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { EvaluationsDataQualityUserHint } from './EvaluationsDataQualityUserHint';
import { EvaluationsDataQualityAdminPanel } from './EvaluationsDataQualityAdminPanel';
import { isEvaluationsDataQualityAdmin } from '@synq/evaluations-insights/evaluations-data-quality-panel';

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey) => de[key] ?? key,
  }),
}));

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => ({ userRole: 'ORG_ADMIN', orgId: 'org-1' }),
}));

describe('EvaluationsDataQualityUserHint', () => {
  it('renders reduced partial hint for standard users', () => {
    const html = renderToStaticMarkup(
      <EvaluationsDataQualityUserHint
        hint={{ visible: true, severity: 'watch', messageKey: 'partialData' }}
      />,
    );
    expect(html).toContain('unvollständigen Daten');
    expect(html).toContain('role="status"');
  });

  it('renders nothing when not visible', () => {
    const html = renderToStaticMarkup(
      <EvaluationsDataQualityUserHint
        hint={{ visible: false, severity: 'info', messageKey: 'allGood' }}
      />,
    );
    expect(html).toBe('');
  });
});

describe('EvaluationsDataQualityAdminPanel', () => {
  it('renders admin source grid when data present', () => {
    const html = renderToStaticMarkup(
      <EvaluationsDataQualityAdminPanel
        dataQualityEnvelope={{
          status: 'OK',
          error: null,
          generatedAt: '2026-07-24T10:00:00.000Z',
          data: {
            calculationVersion: 'data-quality-v1',
            period: { key: 'mtd', label: 'MTD', from: '2026-07-01', to: '2026-07-24', timezone: 'UTC' },
            rollupStatus: 'GOOD',
            sources: [
              {
                sourceKey: 'INVOICES',
                label: 'Invoices',
                period: { key: 'mtd', label: 'MTD', from: '2026-07-01', to: '2026-07-24', timezone: 'UTC' },
                integrationConnected: true,
                overallState: 'GOOD',
                dimensions: [],
                expectedRecordCount: 10,
                presentRecordCount: 10,
                coveragePercent: 100,
                lastSuccessfulUpdateAt: '2026-07-24T10:00:00.000Z',
                knownErrors: [],
                affectedMetrics: ['receivables.openAmountMinor'],
                recommendedRemediation: [],
              },
            ],
            metricBindings: [],
            crossCuttingIssues: [],
            thresholds: {
              completeness: { goodMinPercent: 95, limitedMinPercent: 70, missingBelowPercent: 30 },
              coverage: { goodMinPercent: 90, limitedMinPercent: 60 },
              freshness: { staleAfterMs: 86400000, insightsStaleAfterMs: 86400000 },
              uniqueness: { overlappingBookingsWarningAt: 1, overlappingBookingsInvalidAt: 1 },
            },
            overallStatus: 'OK',
            insightsStale: false,
            insightsLastRunAt: null,
            invoiceDataComplete: true,
            fleetDataComplete: true,
            partialSections: [],
            unavailableSections: [],
          },
        }}
        lineageData={null}
      />,
    );
    expect(html).toContain('Datenqualität');
    expect(html).toContain('Rechnungsdaten');
  });

  it('shows empty state without sources', () => {
    const html = renderToStaticMarkup(
      <EvaluationsDataQualityAdminPanel
        dataQualityEnvelope={{ status: 'OK', data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' }}
        lineageData={null}
      />,
    );
    expect(html).toContain('Keine Quellen');
  });
});

describe('role gating', () => {
  it('worker is not dq admin', () => {
    expect(isEvaluationsDataQualityAdmin('WORKER')).toBe(false);
  });
});
