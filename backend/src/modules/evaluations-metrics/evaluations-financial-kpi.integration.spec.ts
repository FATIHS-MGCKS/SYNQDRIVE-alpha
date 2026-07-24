import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { EvaluationsFinancialKpiService } from './evaluations-financial-kpi.service';
import { EvaluationsPeriodService } from './evaluations-period.service';
import { EvaluationsFxRateService } from './evaluations-fx-rate.service';
import { createFinanceKpiHarness } from './evaluations-financial-kpi.harness';
import type { FinancialKpiInvoiceRow } from './financial-kpi.logic';
import {
  GOLDEN_ORG_ALPHA,
  GOLDEN_ORG_BETA,
  GOLDEN_REFERENCE,
} from '@synq/evaluations-fixtures/finance-golden-organizations';
import { assertValidEvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.validator';

describe('EvaluationsFinancialKpiService integration harness', () => {
  async function buildService(state: Parameters<typeof createFinanceKpiHarness>[0]) {
    const { prisma } = createFinanceKpiHarness(state);
    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluationsFinancialKpiService,
        EvaluationsPeriodService,
        EvaluationsFxRateService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    return moduleRef.get(EvaluationsFinancialKpiService);
  }

  it('returns financial-mtd bundle for EUR org with AVAILABLE metrics', async () => {
    const service = await buildService({
      organizationId: GOLDEN_ORG_ALPHA.id,
      organizationTimezone: GOLDEN_ORG_ALPHA.timezone,
      invoices: GOLDEN_ORG_ALPHA.invoices as FinancialKpiInvoiceRow[],
      paymentAccountDefaultCurrency: 'EUR',
    });

    const bundle = await service.getFinancialMtdBundle({
      organizationId: GOLDEN_ORG_ALPHA.id,
      reference: GOLDEN_REFERENCE,
    });

    expect(bundle.revenueCashflowContribution).not.toBeNull();
    expect(bundle.receivablesAnalytics).not.toBeNull();
    expect(bundle.multiCurrency).not.toBeNull();
    expect(bundle.metrics.length).toBeGreaterThan(0);

    const periodRevenue = bundle.metrics.find((m) => m.metricId === 'fin.mtd_issued_revenue');
    expect(periodRevenue?.value).toBe(GOLDEN_ORG_ALPHA.expected.periodRevenueNetMinor);
    expect(periodRevenue?.status).not.toBe('ERROR');
    expect(periodRevenue?.value).not.toBeNull();

    for (const metric of bundle.metrics) {
      if (metric.status === 'ERROR' || metric.status === 'UNAVAILABLE') {
        expect(metric.value).toBeNull();
      } else {
        expect(metric.value).not.toBeNull();
        assertValidEvaluationsMetricResponse(metric);
      }
    }
  });

  it('returns PARTIAL metrics when foreign currency lacks FX in reference provider', async () => {
    const service = await buildService({
      organizationId: GOLDEN_ORG_BETA.id,
      organizationTimezone: GOLDEN_ORG_BETA.timezone,
      invoices: [
        ...(GOLDEN_ORG_BETA.invoices as FinancialKpiInvoiceRow[]),
        {
          id: 'sek-no-rate',
          type: 'OUTGOING_BOOKING',
          status: 'SENT',
          currency: 'SEK',
          totalCents: 1_000,
          subtotalCents: 1_000,
          taxCents: 0,
          paidCents: 0,
          outstandingCents: 1_000,
          invoiceDate: '2026-06-09',
          dueDate: '2026-06-25',
          paidAt: null,
          createdAt: '2026-06-09',
        } satisfies FinancialKpiInvoiceRow,
      ],
      paymentAccountDefaultCurrency: 'EUR',
    });

    const bundle = await service.getFinancialMtdBundle({
      organizationId: GOLDEN_ORG_BETA.id,
      reference: GOLDEN_REFERENCE,
    });

    const periodRevenue = bundle.metrics.find((m) => m.metricId === 'fin.mtd_issued_revenue');
    expect(periodRevenue?.status).toBe('PARTIAL');
    expect(bundle.multiCurrency?.completeness).toBe('PARTIAL');
  });

  it('returns UNAVAILABLE metrics with null values when no invoices exist', async () => {
    const service = await buildService({
      organizationId: 'org-empty',
      organizationTimezone: 'Europe/Berlin',
      invoices: [],
      paymentAccountDefaultCurrency: 'EUR',
    });

    const bundle = await service.getFinancialMtdBundle({
      organizationId: 'org-empty',
      reference: GOLDEN_REFERENCE,
    });

    const revenue = bundle.metrics.find((m) => m.metricId === 'fin.mtd_issued_revenue');
    expect(revenue?.status).toBe('UNAVAILABLE');
    expect(revenue?.value).toBeNull();
  });
});
