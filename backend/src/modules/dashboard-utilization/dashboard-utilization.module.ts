import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { EvaluationsInsightsModule } from '@modules/evaluations-analytics/e4/evaluations-insights.module';
import { DashboardUtilizationController } from './dashboard-utilization.controller';
import { DashboardUtilizationService } from './dashboard-utilization.service';

@Module({
  imports: [PrismaModule, EvaluationsInsightsModule],
  controllers: [DashboardUtilizationController],
  providers: [DashboardUtilizationService],
  exports: [DashboardUtilizationService],
})
export class DashboardUtilizationModule {}
