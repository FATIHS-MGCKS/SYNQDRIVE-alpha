import { EvaluationsRecommendationsService } from './evaluations-recommendations.service';
import { e7BaseSummary } from './domain/evaluations-recommendations.fixtures';

describe('EvaluationsRecommendationsService orchestration', () => {
  it('calls getSummary exactly once and never calls finance directly', async () => {
    const summary = e7BaseSummary();
    const insights = { getSummary: jest.fn().mockResolvedValue(summary) };
    const quality = {
      buildQualityReportFromSummary: jest.fn().mockResolvedValue({
        schemaVersion: '1.0.0',
        generatedAt: summary.generatedAt,
        scope: summary.scope,
        period: summary.period,
        calculationVersion: 'evaluations-quality-e5-v2',
        sections: [],
        overall: { status: 'PARTIAL', complete: false, reason: 'QUALITY_INCOMPLETE' },
      }),
      getQualityReport: jest.fn(),
    };
    const finance = { computeFinancialInsights: jest.fn() };
    const service = new EvaluationsRecommendationsService(
      insights as never,
      quality as never,
    );
    await service.getRecommendations(
      {
        organizationId: 'org-a',
        stationIds: null,
        stationScoped: false,
        period: summary.period,
      },
      { id: 'u1', organizationId: 'org-a' },
      new Date(summary.generatedAt),
    );
    expect(insights.getSummary).toHaveBeenCalledTimes(1);
    expect(quality.buildQualityReportFromSummary).toHaveBeenCalledTimes(1);
    expect(quality.getQualityReport).not.toHaveBeenCalled();
    expect(finance.computeFinancialInsights).not.toHaveBeenCalled();
  });
});
