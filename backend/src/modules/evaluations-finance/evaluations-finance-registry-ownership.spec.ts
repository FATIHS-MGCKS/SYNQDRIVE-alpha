import { EVALUATIONS_METRIC_DEFINITIONS } from '@modules/evaluations-metrics';
import { EVALUATIONS_FINANCE_METRIC_IDS } from './evaluations-finance.service';

/**
 * E3.2 ownership reconciliation: every `active` finance VALUE metric
 * (MONEY / PERCENT / SIGNED_PERCENT) must be canonically served by the E3 finance
 * service. Non-served finance value metrics must be downgraded (active_degraded /
 * prepared / planned). Observed COUNT metrics are presentation and exempt.
 */
describe('E3.2 finance metric ownership', () => {
  const canonical = new Set<string>(Object.values(EVALUATIONS_FINANCE_METRIC_IDS));
  const financeValueTypes = new Set(['MONEY', 'PERCENT', 'SIGNED_PERCENT']);

  const activeFinanceValueMetrics = EVALUATIONS_METRIC_DEFINITIONS.filter(
    (m) =>
      m.id.startsWith('fin.') &&
      financeValueTypes.has(m.valueType) &&
      m.implementationStatus === 'active',
  );

  it('has no active finance value metric without a canonical E3 owner', () => {
    const notServed = activeFinanceValueMetrics
      .map((m) => m.id)
      .filter((id) => !canonical.has(id));
    expect(notServed).toEqual([]);
  });

  it('serves exactly the eight canonical core metrics as active', () => {
    const activeIds = new Set(activeFinanceValueMetrics.map((m) => m.id));
    for (const id of canonical) {
      expect(activeIds.has(id)).toBe(true);
    }
    expect(activeFinanceValueMetrics.length).toBe(canonical.size);
  });

  it('keeps the canonical core calculation versions', () => {
    const byId = new Map(EVALUATIONS_METRIC_DEFINITIONS.map((m) => [m.id, m]));
    expect(byId.get('fin.mtd_issued_revenue')?.calculationVersion).toBe('1.0.0');
    for (const id of [
      'fin.mtd_paid_revenue',
      'fin.mtd_expenses',
      'fin.mtd_net_result',
      'fin.profit_margin_mtd',
      'fin.open_receivables',
      'fin.overdue_receivables',
      'fin.total_outstanding_receivables',
    ]) {
      expect(byId.get(id)?.calculationVersion).toBe('2.0.0');
    }
  });
});
