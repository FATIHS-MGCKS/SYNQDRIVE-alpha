import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { EvaluationsMetricController } from './evaluations-metric.controller';
import { EvaluationsMetricService } from './evaluations-metric.service';
import { EvaluationsPeriodController } from './evaluations-period.controller';
import { EvaluationsPeriodService } from './evaluations-period.service';
import { EvaluationsFinancialKpiService } from './evaluations-financial-kpi.service';
import { EvaluationsKpiController } from './evaluations-kpi.controller';

@Module({
  imports: [PrismaModule],
  controllers: [EvaluationsMetricController, EvaluationsPeriodController, EvaluationsKpiController],
  providers: [EvaluationsMetricService, EvaluationsPeriodService, EvaluationsFinancialKpiService],
  exports: [EvaluationsMetricService, EvaluationsPeriodService, EvaluationsFinancialKpiService],
})
export class EvaluationsMetricsModule {}
