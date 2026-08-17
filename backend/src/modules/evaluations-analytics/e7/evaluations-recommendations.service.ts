import { Injectable } from '@nestjs/common';
import type { EvaluationsAuthorizedAnalyticsScope } from '@synq/evaluations-analytics/evaluations-analytics.contract';
import { EvaluationsInsightsService } from '../e4/evaluations-insights.service';
import { EvaluationsQualityService } from '../e5/evaluations-quality.service';
import type { EvaluationsRecommendationsResponse } from '@synq/evaluations-recommendations/evaluations-recommendations.contract';
import { deriveEvaluationsRecommendations } from './domain/evaluations-recommendations.derive';

/**
 * E7 canonical Recommendations / Actions server authority.
 *
 * Orchestrates exactly ONE E4 summary per request and reuses E5 quality built
 * from that summary — no separate E3 finance call, no second getSummary().
 */
@Injectable()
export class EvaluationsRecommendationsService {
  constructor(
    private readonly insights: EvaluationsInsightsService,
    private readonly quality: EvaluationsQualityService,
  ) {}

  async getRecommendations(
    scope: EvaluationsAuthorizedAnalyticsScope,
    actor: { id?: string; organizationId?: string | null; platformRole?: string | null },
    now?: Date,
  ): Promise<EvaluationsRecommendationsResponse> {
    const generatedAt = now ?? new Date();
    const summary = await this.insights.getSummary(scope, actor, generatedAt);
    const qualityReport = await this.quality.buildQualityReportFromSummary(
      summary,
      scope,
      generatedAt,
    );

    return deriveEvaluationsRecommendations({
      summary,
      quality: qualityReport,
      requestPeriod: scope.period,
      scope: {
        organizationId: summary.scope.organizationId,
        stationIds: summary.scope.stationIds,
        stationScoped: summary.scope.stationScoped,
      },
      generatedAt: generatedAt.toISOString(),
    });
  }
}
