import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { BatteryV2JobHandlerRegistry } from './battery-v2-job-handler.registry';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { BatteryObservationClassifyHandler } from './handlers/battery-observation-classify.handler';
import { BatteryRestTargetEvaluateHandler } from './handlers/battery-rest-target-evaluate.handler';
import { BatteryStartProxyExtractHandler } from './handlers/battery-start-proxy-extract.handler';
import { BatteryAssessmentRecomputeHandler } from './handlers/battery-assessment-recompute.handler';
import { BatteryPublicationUpdateHandler } from './handlers/battery-publication-update.handler';
import { HvCapabilityRefreshHandler } from './handlers/hv-capability-refresh.handler';
import { HvRechargeSessionReconcileHandler } from './handlers/hv-recharge-session-reconcile.handler';
import { HvCapacityShadowRecomputeHandler } from './handlers/hv-capacity-shadow-recompute.handler';

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

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.BATTERY_V2 })],
  providers: [
    ...BATTERY_V2_JOB_HANDLERS,
    BatteryV2JobHandlerRegistry,
    BatteryV2JobProducerService,
  ],
  exports: [
    ...BATTERY_V2_JOB_HANDLERS,
    BatteryV2JobHandlerRegistry,
    BatteryV2JobProducerService,
    BullModule,
  ],
})
export class BatteryV2JobsModule {}

export { BATTERY_V2_JOB_HANDLERS };
