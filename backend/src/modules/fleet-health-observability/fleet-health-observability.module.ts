import { Global, Module } from '@nestjs/common';
import { FleetHealthMetricsService } from './fleet-health-metrics.service';
import { FleetHealthObservabilityService } from './fleet-health-observability.service';

@Global()
@Module({
  providers: [FleetHealthMetricsService, FleetHealthObservabilityService],
  exports: [FleetHealthMetricsService, FleetHealthObservabilityService],
})
export class FleetHealthObservabilityModule {}
