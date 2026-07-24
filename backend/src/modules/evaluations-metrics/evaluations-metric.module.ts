import { Module } from '@nestjs/common';
import { EvaluationsMetricController } from './evaluations-metric.controller';
import { EvaluationsMetricService } from './evaluations-metric.service';

@Module({
  controllers: [EvaluationsMetricController],
  providers: [EvaluationsMetricService],
  exports: [EvaluationsMetricService],
})
export class EvaluationsMetricsModule {}
