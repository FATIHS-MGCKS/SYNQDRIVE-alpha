import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QUEUE_NAMES } from './queues/queue-names';
import { DimoModule } from '@modules/dimo/dimo.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { HighMobilityModule } from '@modules/high-mobility/high-mobility.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { BillingModule } from '@modules/billing/billing.module';
import { TaskAutomationOutboxModule } from '@modules/tasks/outbox/task-automation-outbox.module';

import { DimoSnapshotProcessor } from './processors/dimo-snapshot.processor';
import { DimoVehicleSyncProcessor } from './processors/dimo-vehicle-sync.processor';
import { DimoDtcProcessor } from './processors/dimo-dtc.processor';
import { TireRecalculationProcessor } from './processors/tire-recalculation.processor';
import { BrakeRecalculationProcessor } from './processors/brake-recalculation.processor';
import { TripTrackingProcessor } from './processors/trip-tracking.processor';
import { TripBehaviorEnrichmentProcessor } from './processors/trip-behavior-enrichment.processor';
import { DrivingImpactProcessor } from './processors/driving-impact.processor';
import { DtcKnowledgeProcessor } from './processors/dtc-knowledge.processor';
import { NotificationEvaluationProcessor } from './processors/notification-evaluation.processor';
import { NotificationDeliveryProcessor } from './processors/notification-delivery.processor';
import { PaymentEmailProcessor } from './processors/payment-email.processor';
import { TaskAutomationOutboxProcessor } from './processors/task-automation-outbox.processor';

import { DimoSnapshotScheduler } from './schedulers/dimo-snapshot.scheduler';
import { DimoDtcScheduler } from './schedulers/dimo-dtc.scheduler';
import { DimoVehicleSyncScheduler } from './schedulers/dimo-vehicle-sync.scheduler';
import { TireRecalculationScheduler } from './schedulers/tire-recalculation.scheduler';
import { BrakeRecalculationScheduler } from './schedulers/brake-recalculation.scheduler';
import { TripTrackingRecoveryScheduler } from './schedulers/trip-tracking-recovery.scheduler';
import { TripAnalysisRecoveryScheduler } from './schedulers/trip-analysis-recovery.scheduler';
import { TripReconciliationScheduler } from './schedulers/trip-reconciliation.scheduler';
import { PaymentConnectReconciliationScheduler } from './schedulers/payment-connect-reconciliation.scheduler';
import { BillingReconciliationScheduler } from './schedulers/billing-reconciliation.scheduler';
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
      { name: QUEUE_NAMES.BRAKE_RECALCULATION },
      { name: QUEUE_NAMES.TRIP_TRACKING },
      { name: QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT },
      { name: QUEUE_NAMES.DRIVING_IMPACT_COMPUTE },
      { name: QUEUE_NAMES.DTC_KNOWLEDGE_ENRICHMENT },
      { name: QUEUE_NAMES.NOTIFICATION_EVALUATION },
      { name: QUEUE_NAMES.NOTIFICATION_DELIVERY },
      { name: QUEUE_NAMES.PAYMENT_EMAIL },
      { name: QUEUE_NAMES.TASK_AUTOMATION },
    ),
    DimoModule,
    VehicleIntelligenceModule,
    HighMobilityModule,
    NotificationsModule,
    PaymentsModule,
    BillingModule,
    TaskAutomationOutboxModule,
  ],
  providers: [
    // Processors
    DimoSnapshotProcessor,
    DimoVehicleSyncProcessor,
    DimoDtcProcessor,
    TireRecalculationProcessor,
    BrakeRecalculationProcessor,
    TripTrackingProcessor,
    TripBehaviorEnrichmentProcessor,
    DrivingImpactProcessor,
    DtcKnowledgeProcessor,
    NotificationEvaluationProcessor,
    NotificationDeliveryProcessor,
    PaymentEmailProcessor,
    TaskAutomationOutboxProcessor,

    // Schedulers
    DimoSnapshotScheduler,
    DimoDtcScheduler,
    DimoVehicleSyncScheduler,
    TireRecalculationScheduler,
    BrakeRecalculationScheduler,
    TripTrackingRecoveryScheduler,
    TripAnalysisRecoveryScheduler,
    TripReconciliationScheduler,
    PaymentConnectReconciliationScheduler,
    BillingReconciliationScheduler,
    HmHealthPollingScheduler,
    DataRetentionScheduler,
    StorageOrphanSweepScheduler,
  ],
})
export class WorkersModule {}
