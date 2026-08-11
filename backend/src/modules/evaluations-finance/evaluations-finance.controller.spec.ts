import { EvaluationsFinanceController } from './evaluations-finance.controller';
import {
  EVALUATIONS_FINANCE_METRIC_IDS,
  type FinancialInsightsResult,
} from './evaluations-finance.service';

describe('EvaluationsFinanceController', () => {
  function makeController(capture: { input?: any } = {}) {
    const service = {
      computeFinancialInsights: jest.fn(async (input: any) => {
        capture.input = input;
        return {
          organizationId: input.orgId,
          period: { periodType: 'MTD' },
          metrics: {},
        } as unknown as FinancialInsightsResult;
      }),
    };
    return { controller: new EvaluationsFinanceController(service as any), service, capture };
  }

  it('delegates to the canonical finance service with the route organization', async () => {
    const { controller, capture } = makeController();
    await controller.insights(
      { id: 'user-1', platformRole: null },
      'ORG_A',
      { organizationId: 'ORG_B', stationIds: 'st-1,st-2' },
    );
    // Uses the guarded :orgId route param, never a client-supplied organizationId.
    expect(capture.input.orgId).toBe('ORG_A');
    expect(capture.input.actor).toEqual({ id: 'user-1', platformRole: null });
    expect(capture.input.requestedStationIds).toEqual(['st-1', 'st-2']);
  });

  it('passes null station scope when none requested (full authorized scope)', async () => {
    const { controller, capture } = makeController();
    await controller.insights({ id: 'u', platformRole: null }, 'ORG_A', {});
    expect(capture.input.requestedStationIds).toBeNull();
  });

  it('returns the canonical finance bundle unchanged (no controller recomputation)', async () => {
    const { controller } = makeController();
    const result = await controller.insights({ id: 'u', platformRole: null }, 'ORG_A', {});
    expect(result.organizationId).toBe('ORG_A');
    expect(result.metrics).toBeDefined();
    // sanity: the metric-id map is the canonical set
    expect(Object.values(EVALUATIONS_FINANCE_METRIC_IDS)).toContain('fin.mtd_issued_revenue');
  });
});
