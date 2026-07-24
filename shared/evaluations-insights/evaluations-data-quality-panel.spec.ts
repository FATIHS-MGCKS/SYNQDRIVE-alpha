/**
 * Unit tests — data quality admin panel builders (Prompt 29/54).
 */
import { buildAdminSourceRows, buildUserDataQualityHint, isEvaluationsDataQualityAdmin } from './evaluations-data-quality-panel';
import type { EvaluationsDataQualityDomainSummary } from './evaluations-data-quality.contract';
import type { EvaluationsLineageSummary } from './evaluations-lineage.contract';

const baseSource = (
  overrides: Partial<EvaluationsDataQualityDomainSummary['sources'][0]> = {},
): EvaluationsDataQualityDomainSummary['sources'][0] => ({
  sourceKey: 'INVOICES',
  label: 'Invoices',
  period: { key: 'mtd', label: 'MTD', from: '2026-07-01', to: '2026-07-24', timezone: 'UTC' },
  integrationConnected: true,
  overallState: 'GOOD',
  dimensions: [],
  expectedRecordCount: 100,
  presentRecordCount: 100,
  coveragePercent: 100,
  lastSuccessfulUpdateAt: '2026-07-24T10:00:00.000Z',
  knownErrors: [],
  affectedMetrics: ['receivables.openAmountMinor'],
  recommendedRemediation: [],
  ...overrides,
});

const domain = (
  sources: EvaluationsDataQualityDomainSummary['sources'],
): EvaluationsDataQualityDomainSummary => ({
  calculationVersion: 'data-quality-v1',
  period: { key: 'mtd', label: 'MTD', from: '2026-07-01', to: '2026-07-24', timezone: 'UTC' },
  rollupStatus: 'GOOD',
  sources,
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
});

describe('isEvaluationsDataQualityAdmin', () => {
  it('org admin is admin', () => {
    expect(isEvaluationsDataQualityAdmin('ORG_ADMIN')).toBe(true);
  });
  it('worker is not admin', () => {
    expect(isEvaluationsDataQualityAdmin('WORKER')).toBe(false);
  });
});

describe('buildAdminSourceRows', () => {
  it('marks not connected as missing integration — not zero error rate display', () => {
    const rows = buildAdminSourceRows(
      domain([
        baseSource({
          integrationConnected: false,
          overallState: 'NOT_CONNECTED',
          coveragePercent: null,
        }),
      ]),
      null,
    );
    expect(rows[0].issueKind).toBe('missing_integration');
    expect(rows[0].errorRatePercent).toBeNull();
    expect(rows[0].lastFailedJobLabel).toBeNull();
  });

  it('technical error exposes job label without stack trace fields', () => {
    const lineage = {
      metrics: [
        {
          metricKey: 'financial.revenueMtdMinor',
          metricLabel: 'Revenue',
          dataSources: ['Invoices'],
          oldestIncludedRecordAt: null,
          newestIncludedRecordAt: null,
          lastSuccessfulImportAt: null,
          lastSuccessfulBackgroundJobAt: null,
          calculatedAt: '2026-07-24T10:00:00.000Z',
          calculationVersion: 'v1',
          excludedRecordCount: 0,
          exclusionReasons: [],
          dataCoverage: { percent: null, includedCount: null, eligibleCount: null },
          freshness: { state: 'FAILED', staleThresholdMs: null, staleThresholdLabel: null },
          sourceErrors: [],
          adminDiagnostics: {
            loaderKey: 'financial',
            backgroundJobName: 'invoice-sync',
            recalculationTrigger: 'SCHEDULED',
            servedFromCache: false,
            cacheGeneratedAt: null,
            sourceKey: 'INVOICES',
            notes: [],
          },
        },
      ],
    } as unknown as EvaluationsLineageSummary;

    const rows = buildAdminSourceRows(
      domain([
        baseSource({
          knownErrors: [{ code: 'LOADER_FAILED', message: 'Invoice loader failed', severity: 'CRITICAL' }],
          overallState: 'INVALID',
        }),
      ]),
      lineage,
    );
    expect(rows[0].issueKind).toBe('technical_error');
    expect(rows[0].lastFailedJobLabel).toBe('invoice-sync');
  });
});

describe('buildUserDataQualityHint', () => {
  it('hides hint when all good', () => {
    const hint = buildUserDataQualityHint(domain([baseSource()]), 'OK');
    expect(hint.visible).toBe(false);
  });

  it('shows reduced hint for partial', () => {
    const hint = buildUserDataQualityHint(
      domain([baseSource({ overallState: 'LIMITED', coveragePercent: 72 })]),
      'PARTIAL',
    );
    expect(hint.visible).toBe(true);
    expect(hint.messageKey).toBe('partialData');
  });

  it('shows unavailable on envelope error', () => {
    const hint = buildUserDataQualityHint(domain([baseSource()]), 'ERROR');
    expect(hint.messageKey).toBe('unavailable');
  });
});
