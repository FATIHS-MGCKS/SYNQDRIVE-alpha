import { Global, Module } from '@nestjs/common';
import { VehicleDetailMetricsService } from './vehicle-detail-metrics.service';
import { VehicleDetailObservabilityService } from './vehicle-detail-observability.service';

@Global()
@Module({
  providers: [VehicleDetailMetricsService, VehicleDetailObservabilityService],
  exports: [VehicleDetailMetricsService, VehicleDetailObservabilityService],
})
export class VehicleDetailObservabilityModule {}
