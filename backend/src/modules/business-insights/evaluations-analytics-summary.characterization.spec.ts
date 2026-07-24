import { EvaluationsAnalyticsController } from './evaluations-analytics.controller';

describe('EvaluationsAnalyticsController contract', () => {
  it('exposes GET summary on evaluations/analytics path', () => {
    const path = Reflect.getMetadata('path', EvaluationsAnalyticsController);
    expect(path).toBe('organizations/:orgId/evaluations/analytics');
  });

  it('summary handler is bound to GET summary sub-route', () => {
    const summaryPath = Reflect.getMetadata('path', EvaluationsAnalyticsController.prototype.getAnalyticsSummary);
    const method = Reflect.getMetadata('method', EvaluationsAnalyticsController.prototype.getAnalyticsSummary);
    expect(summaryPath).toBe('summary');
    expect(method).toBe(0);
  });
});
