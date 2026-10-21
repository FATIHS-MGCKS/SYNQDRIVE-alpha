import { Global, Module } from '@nestjs/common';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { EnergyEventsMetricsService } from '../vehicle-intelligence/energy-events/energy-events-metrics.service';
import { RawFuelRefuelFallbackMetricsService } from '../vehicle-intelligence/energy-events/raw-fuel-refuel-fallback/raw-fuel-refuel-fallback-metrics.service';
import { PhysicalRefuelReconciliationMetricsService } from '../vehicle-intelligence/energy-events/physical-refuel-reconciliation-metrics.service';

@Global()
@Module({
  imports: [ObservabilityModule],
  providers: [
    EnergyEventsMetricsService,
    RawFuelRefuelFallbackMetricsService,
    PhysicalRefuelReconciliationMetricsService,
  ],
  exports: [
    EnergyEventsMetricsService,
    RawFuelRefuelFallbackMetricsService,
    PhysicalRefuelReconciliationMetricsService,
  ],
})
export class EnergyEventsObservabilityModule {}
