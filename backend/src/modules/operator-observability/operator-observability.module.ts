import { Global, Module } from '@nestjs/common';
import { OperatorMetricsService } from './operator-metrics.service';
import { OperatorObservabilityService } from './operator-observability.service';
import { OperatorHealthService } from './operator-health.service';

@Global()
@Module({
  providers: [OperatorMetricsService, OperatorObservabilityService, OperatorHealthService],
  exports: [OperatorMetricsService, OperatorObservabilityService, OperatorHealthService],
})
export class OperatorObservabilityModule {}
