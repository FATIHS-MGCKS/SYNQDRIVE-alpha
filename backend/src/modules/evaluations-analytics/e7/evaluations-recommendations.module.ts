import { Module } from '@nestjs/common';
import { EvaluationsAnalyticsModule } from '../evaluations-analytics.module';
import { EvaluationsInsightsModule } from '../e4/evaluations-insights.module';
import { EvaluationsQualityModule } from '../e5/evaluations-quality.module';
import { EvaluationsRecommendationsController } from './evaluations-recommendations.controller';
import { EvaluationsRecommendationsService } from './evaluations-recommendations.service';

/**
 * E7 Recommendations / Actions — derived-on-read server authority.
 * Reuses E4 summary (once) and E5 quality-from-summary; no persistence.
 */
@Module({
  imports: [EvaluationsAnalyticsModule, EvaluationsInsightsModule, EvaluationsQualityModule],
  controllers: [EvaluationsRecommendationsController],
  providers: [EvaluationsRecommendationsService],
  exports: [EvaluationsRecommendationsService],
})
export class EvaluationsRecommendationsModule {}
