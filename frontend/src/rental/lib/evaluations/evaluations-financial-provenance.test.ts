import { describe, expect, it } from 'vitest';
import { parseCalculationProvenance } from '@synq/evaluations-metrics/evaluations-calculation-provenance';
import {
  buildFinancialInsightsProvenanceBundle,
  buildFinancialMtdProvenance,
} from '@synq/evaluations-metrics/evaluations-financial-provenance';

describe('financial calculation provenance', () => {
  const now = new Date('2026-06-16T12:00:00.000Z');
  const monthStart = new Date('2026-06-01T00:00:00.000Z');

  it('builds MTD provenance with client computation layer', () => {
    const p = buildFinancialMtdProvenance({
      metricId: 'fin.mtd_issued_revenue',
      calculationVersion: '1.0.0',
      generatedAt: now,
      periodStart: monthStart,
      periodEnd: now,
      organizationId: 'org-1',
      timezone: 'Europe/Berlin',
      invoiceRowCount: 120,
      currencyFilter: 'EUR',
    });

    expect(p.metricId).toBe('fin.mtd_issued_revenue');
    expect(p.sourceVersions.computationLayer).toBe('client');
    expect(p.appliedFilters.period).toBe('MTD');
    expect(p.completeness).toBe('complete');
  });

  it('marks partial completeness when flagged', () => {
    const p = buildFinancialMtdProvenance({
      metricId: 'fin.top_customers_mtd',
      calculationVersion: '1.0.0',
      generatedAt: now,
      periodStart: monthStart,
      periodEnd: now,
      organizationId: 'org-1',
      timezone: 'UTC',
      invoiceRowCount: 120,
      currencyFilter: 'EUR',
      isPartial: true,
    });

    expect(p.completeness).toBe('partial');
  });

  it('builds consistent bundle for primary financial KPIs', () => {
    const bundle = buildFinancialInsightsProvenanceBundle({
      generatedAt: now,
      periodStart: monthStart,
      periodEnd: now,
      organizationId: 'org-1',
      timezone: 'Europe/Berlin',
      invoiceRowCount: 50,
      calculationVersions: {
        mtdIssuedRevenue: '1.0.0',
        mtdPaidRevenue: '1.0.0',
        mtdExpenses: '1.0.0',
        mtdNetResult: '1.0.0',
        openReceivables: '1.0.0',
        overdueReceivables: '1.0.0',
      },
    });

    expect(bundle.mtdNetResult.metricId).toBe('fin.mtd_net_result');
    expect(bundle.openReceivables.periodStart).toBe(now.toISOString());
    const parsed = parseCalculationProvenance(JSON.parse(JSON.stringify(bundle.mtdExpenses)));
    expect(parsed?.calculationVersion).toBe('1.0.0');
  });
});
