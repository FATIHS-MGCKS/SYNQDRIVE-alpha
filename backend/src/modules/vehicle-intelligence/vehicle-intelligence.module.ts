import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VehicleIntelligenceController } from './vehicle-intelligence.controller';
import { BatteryService } from './battery/battery.service';
import { TiresService } from './tires/tires.service';
import { TireWearModelService } from './tires/tire-wear-model.service';
import { TireHealthService } from './tires/tire-health.service';
import { BrakesService } from './brakes/brakes.service';
import { BrakeHealthService } from './brakes/brake-health.service';
import { ServiceEventsService } from './service-events/service-events.service';
import { EnrichmentJobsService } from './enrichment-jobs/enrichment-jobs.service';
import { DtcService } from './dtc/dtc.service';
import { DrivingEventsService } from './driving-events/driving-events.service';
import { TripsService } from './trips/trips.service';
import { TripDetectionOrchestrationService } from './trips/trip-detection-orchestration.service';
import { TripBehaviorEnrichmentService } from './trips/trip-behavior-enrichment.service';
import { TripEnrichmentOrchestratorService } from './trips/trip-enrichment-orchestrator.service';
import { LteR1BehaviorEnrichmentService } from './trips/lte-r1-behavior-enrichment.service';
import { MapboxService } from './trips/mapbox.service';
import { DamagesService } from './damages/damages.service';
import { BatteryHealthService } from './battery-health/battery-health.service';
import { HvBatteryHealthService } from './battery-health/hv-battery-health.service';
import { BatteryV2Service } from './battery-health/battery-v2.service';
import { HealthSummaryService } from './health-summary/health-summary.service';
import { AiHealthCareAggregationService } from './health-summary/ai-health-care-aggregation.service';
import { DrivingImpactService } from './driving-impact/driving-impact.service';
import { DimoModule } from '../dimo/dimo.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { HighMobilityModule } from '../high-mobility/high-mobility.module';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';

@Module({
  imports: [
    forwardRef(() => DimoModule),
    forwardRef(() => InvoicesModule),
    forwardRef(() => HighMobilityModule),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.TRIP_TRACKING },
      { name: QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT },
      { name: QUEUE_NAMES.DRIVING_IMPACT_COMPUTE },
    ),
  ],
  controllers: [VehicleIntelligenceController],
  providers: [
    BatteryService,
    TiresService,
    TireWearModelService,
    TireHealthService,
    BrakesService,
    BrakeHealthService,
    ServiceEventsService,
    EnrichmentJobsService,
    DtcService,
    DrivingEventsService,
    TripsService,
    TripDetectionOrchestrationService,
    TripBehaviorEnrichmentService,
    TripEnrichmentOrchestratorService,
    LteR1BehaviorEnrichmentService,
    MapboxService,
    DamagesService,
    BatteryHealthService,
    HvBatteryHealthService,
    BatteryV2Service,
    HealthSummaryService,
    AiHealthCareAggregationService,
    DrivingImpactService,
  ],
  exports: [
    BatteryService,
    TiresService,
    TireWearModelService,
    TireHealthService,
    BrakesService,
    BrakeHealthService,
    ServiceEventsService,
    EnrichmentJobsService,
    DtcService,
    DrivingEventsService,
    TripsService,
    TripDetectionOrchestrationService,
    TripBehaviorEnrichmentService,
    TripEnrichmentOrchestratorService,
    LteR1BehaviorEnrichmentService,
    DamagesService,
    BatteryHealthService,
    HvBatteryHealthService,
    BatteryV2Service,
    DrivingImpactService,
  ],
})
export class VehicleIntelligenceModule {}
