import { Global, Module } from '@nestjs/common';
import { EvaluationsMetricsService } from './evaluations-metrics.service';
import { EvaluationsObservabilityService } from './evaluations-observability.service';

@Global()
@Module({
  providers: [EvaluationsMetricsService, EvaluationsObservabilityService],
  exports: [EvaluationsMetricsService, EvaluationsObservabilityService],
})
export class EvaluationsObservabilityModule {}
