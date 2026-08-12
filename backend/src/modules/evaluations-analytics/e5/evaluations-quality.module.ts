import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { EvaluationsAnalyticsModule } from '../evaluations-analytics.module';
import { EvaluationsInsightsModule } from '../e4/evaluations-insights.module';
import { EvaluationsQualityController } from './evaluations-quality.controller';
import { EvaluationsQualityRepository } from './evaluations-quality.repository';
import { EvaluationsQualityService } from './evaluations-quality.service';

/**
 * E5A – Data Quality, Freshness & Lineage governance layer. Reuses the E2 scope
 * service (analytics module) and the single E4 orchestration service (insights
 * module); it does not fork any E1–E4 authority.
 */
@Module({
  imports: [PrismaModule, EvaluationsAnalyticsModule, EvaluationsInsightsModule],
  controllers: [EvaluationsQualityController],
  providers: [EvaluationsQualityService, EvaluationsQualityRepository],
  exports: [EvaluationsQualityService],
})
export class EvaluationsQualityModule {}
