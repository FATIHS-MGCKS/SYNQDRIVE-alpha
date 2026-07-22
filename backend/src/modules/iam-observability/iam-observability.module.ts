import { Global, Module } from '@nestjs/common';
import { IamMetricsService } from './iam-metrics.service';
import { IamMetricsRefreshService } from './iam-metrics-refresh.service';

@Global()
@Module({
  providers: [IamMetricsService, IamMetricsRefreshService],
  exports: [IamMetricsService],
})
export class IamObservabilityModule {}
