import { Global, Module } from '@nestjs/common';
import { DataAuthMetricsService } from './data-auth-metrics.service';

@Global()
@Module({
  providers: [DataAuthMetricsService],
  exports: [DataAuthMetricsService],
})
export class DataAuthObservabilityModule {}
