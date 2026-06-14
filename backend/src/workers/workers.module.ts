import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QUEUE_NAMES } from './queues/queue-names';
import { DimoModule } from '@modules/dimo/dimo.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { HighMobilityModule } from '@modules/high-mobility/high-mobility.module';

import { DimoSnapshotProcessor } from './processors/dimo-snapshot.processor';
import { DimoVehicleSyncProcessor } from './processors/dimo-vehicle-sync.processor';
import { DimoDtcProcessor } from './processors/dimo-dtc.processor';
import { TireRecalculationProcessor } from './processors/tire-recalculation.processor';
import { TripTrackingProcessor } from './processors/trip-tracking.processor';
import { TripBehaviorEnrichmentProcessor } from './processors/trip-behavior-enrichment.processor';
import { DrivingImpactProcessor } from './processors/driving-impact.processor';
import { DtcKnowledgeProcessor } from './processors/dtc-knowledge.processor';

import { DimoSnapshotScheduler } from './schedulers/dimo-snapshot.scheduler';
import { DimoDtcScheduler } from './schedulers/dimo-dtc.scheduler';
import { DimoVehicleSyncScheduler } from './schedulers/dimo-vehicle-sync.scheduler';
import { TireRecalculationScheduler } from './schedulers/tire-recalculation.scheduler';
import { BrakeRecalculationScheduler } from './schedulers/brake-recalculation.scheduler';
import { TripTrackingRecoveryScheduler } from './schedulers/trip-tracking-recovery.scheduler';
import { TripReconciliationScheduler } from './schedulers/trip-reconciliation.scheduler';
import { HmHealthPollingScheduler } from './schedulers/hm-health-polling.scheduler';
import { DataRetentionScheduler } from './schedulers/data-retention.scheduler';
import { StorageOrphanSweepScheduler } from './schedulers/storage-orphan-sweep.scheduler';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.DIMO_SNAPSHOT },
      { name: QUEUE_NAMES.DIMO_VEHICLE_SYNC },
      { name: QUEUE_NAMES.DTC_POLL },
      { name: QUEUE_NAMES.TIRE_RECALCULATION },
      { name: QUEUE_NAMES.TRIP_TRACKING },
      { name: QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT },
      { name: QUEUE_NAMES.DRIVING_IMPACT_COMPUTE },
      { name: QUEUE_NAMES.DTC_KNOWLEDGE_ENRICHMENT },
    ),
    DimoModule,
    VehicleIntelligenceModule,
    HighMobilityModule,
  ],
  providers: [
    // Processors
    DimoSnapshotProcessor,
    DimoVehicleSyncProcessor,
    DimoDtcProcessor,
    TireRecalculationProcessor,
    TripTrackingProcessor,
    TripBehaviorEnrichmentProcessor,
    DrivingImpactProcessor,
    DtcKnowledgeProcessor,

    // Schedulers
    DimoSnapshotScheduler,
    DimoDtcScheduler,
    DimoVehicleSyncScheduler,
    TireRecalculationScheduler,
    BrakeRecalculationScheduler,
    TripTrackingRecoveryScheduler,
    TripReconciliationScheduler,
    HmHealthPollingScheduler,
    DataRetentionScheduler,
    StorageOrphanSweepScheduler,
  ],
})
export class WorkersModule {}
