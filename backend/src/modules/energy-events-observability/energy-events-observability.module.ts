import { Global, Module } from '@nestjs/common';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { EnergyEventsMetricsService } from '../vehicle-intelligence/energy-events/energy-events-metrics.service';

@Global()
@Module({
  imports: [ObservabilityModule],
  providers: [EnergyEventsMetricsService],
  exports: [EnergyEventsMetricsService],
})
export class EnergyEventsObservabilityModule {}
