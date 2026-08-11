import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { EvaluationsAnalyticsModule } from '@modules/evaluations-analytics/evaluations-analytics.module';
import { EvaluationsFinanceController } from './evaluations-finance.controller';
import { EvaluationsFinanceRepository } from './evaluations-finance.repository';
import { EvaluationsFinanceService } from './evaluations-finance.service';

/**
 * E3 canonical finance authority. Reuses the E2 analytics scope service
 * (organization + station + period) — it does not introduce a second scope or
 * period authority. The controller is the canonical live serving path for the
 * Financial Insights core KPIs.
 */
@Module({
  imports: [PrismaModule, EvaluationsAnalyticsModule],
  controllers: [EvaluationsFinanceController],
  providers: [EvaluationsFinanceRepository, EvaluationsFinanceService],
  exports: [EvaluationsFinanceService, EvaluationsFinanceRepository],
})
export class EvaluationsFinanceModule {}
