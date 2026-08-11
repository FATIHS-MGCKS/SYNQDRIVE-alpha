import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { EvaluationsAnalyticsModule } from '../evaluations-analytics.module';
import { EvaluationsFinanceModule } from '@modules/evaluations-finance/evaluations-finance.module';
import { EvaluationsInsightsController } from './evaluations-insights.controller';
import { EvaluationsInsightsRepository } from './evaluations-insights.repository';
import { EvaluationsInsightsService } from './evaluations-insights.service';

/**
 * E4 tenant-safe analytics backend. The single canonical Evaluations analytics
 * orchestration authority: it reuses the E2 scope service (analytics module) and
 * the E3 finance service (finance module) rather than forking either. Kept in a
 * dedicated module to avoid a cycle with the finance module (which already
 * imports the analytics module).
 */
@Module({
  imports: [PrismaModule, EvaluationsAnalyticsModule, EvaluationsFinanceModule],
  controllers: [EvaluationsInsightsController],
  providers: [EvaluationsInsightsService, EvaluationsInsightsRepository],
  exports: [EvaluationsInsightsService],
})
export class EvaluationsInsightsModule {}
