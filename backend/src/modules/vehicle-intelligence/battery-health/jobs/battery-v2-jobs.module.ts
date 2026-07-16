import { forwardRef, Module } from '@nestjs/common';
import { BatteryV2JobsProducerModule } from './battery-v2-jobs-producer.module';
import { BatteryV2JobHandlerRegistry } from './battery-v2-job-handler.registry';
import { BatteryV2SnapshotIngestionService } from './battery-v2-snapshot-ingestion.service';
import { BatteryObservationClassifyHandler } from './handlers/battery-observation-classify.handler';
import { BatteryRestTargetEvaluateHandler } from './handlers/battery-rest-target-evaluate.handler';
import { BatteryStartProxyExtractHandler } from './handlers/battery-start-proxy-extract.handler';
import { BatteryAssessmentRecomputeHandler } from './handlers/battery-assessment-recompute.handler';
import { BatteryPublicationUpdateHandler } from './handlers/battery-publication-update.handler';
import { HvCapabilityRefreshHandler } from './handlers/hv-capability-refresh.handler';
import { HvRechargeSessionReconcileHandler } from './handlers/hv-recharge-session-reconcile.handler';
import { HvCapacityShadowRecomputeHandler } from './handlers/hv-capacity-shadow-recompute.handler';
import { VehicleIntelligenceModule } from '../../vehicle-intelligence.module';

const BATTERY_V2_JOB_HANDLERS = [
  BatteryObservationClassifyHandler,
  BatteryRestTargetEvaluateHandler,
  BatteryStartProxyExtractHandler,
  BatteryAssessmentRecomputeHandler,
  BatteryPublicationUpdateHandler,
  HvCapabilityRefreshHandler,
  HvRechargeSessionReconcileHandler,
  HvCapacityShadowRecomputeHandler,
] as const;

/** Worker-side handlers — imported by WorkersModule only. */
@Module({
  imports: [BatteryV2JobsProducerModule, forwardRef(() => VehicleIntelligenceModule)],
  providers: [
    ...BATTERY_V2_JOB_HANDLERS,
    BatteryV2JobHandlerRegistry,
    BatteryV2SnapshotIngestionService,
  ],
  exports: [...BATTERY_V2_JOB_HANDLERS, BatteryV2JobHandlerRegistry, BatteryV2JobsProducerModule],
})
export class BatteryV2JobsModule {}

export { BATTERY_V2_JOB_HANDLERS };
