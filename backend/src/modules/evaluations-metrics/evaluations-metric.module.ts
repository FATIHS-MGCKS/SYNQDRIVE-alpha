import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { EvaluationsMetricController } from './evaluations-metric.controller';
import { EvaluationsMetricService } from './evaluations-metric.service';
import { EvaluationsPeriodController } from './evaluations-period.controller';
import { EvaluationsPeriodService } from './evaluations-period.service';

@Module({
  imports: [PrismaModule],
  controllers: [EvaluationsMetricController, EvaluationsPeriodController],
  providers: [EvaluationsMetricService, EvaluationsPeriodService],
  exports: [EvaluationsMetricService, EvaluationsPeriodService],
})
export class EvaluationsMetricsModule {}
