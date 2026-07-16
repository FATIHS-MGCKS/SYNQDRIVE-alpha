import { forwardRef, Module } from '@nestjs/common';
import { BatteryV2JobsProducerModule } from './battery-v2-jobs-producer.module';
import { BatteryV2IdempotentExecutionService } from './battery-v2-idempotent-execution.service';
import { BatteryV2JobDeadLetterService } from './battery-v2-job-dead-letter.service';
import { BatteryV2JobHandlerRegistry } from './battery-v2-job-handler.registry';
import { BatteryV2JobObservabilityService } from './battery-v2-job-observability.service';
import { BatteryV2VehicleLockService } from './battery-v2-vehicle-lock.service';
import { BatteryV2SnapshotIngestionService } from './battery-v2-snapshot-ingestion.service';
import { BatteryRestTargetEvaluationService } from '../lv-rest-window/battery-rest-target-evaluation.service';
import { BatteryObservationClassifyHandler } from './handlers/battery-observation-classify.handler';
import { BatteryRestTargetEvaluateHandler } from './handlers/battery-rest-target-evaluate.handler';
import { BatteryStartProxyExtractHandler } from './handlers/battery-start-proxy-extract.handler';
import { BatteryAssessmentRecomputeHandler } from './handlers/battery-assessment-recompute.handler';
import { BatteryPublicationUpdateHandler } from './handlers/battery-publication-update.handler';
import { HvCapabilityRefreshHandler } from './handlers/hv-capability-refresh.handler';
import { HvRechargeSessionReconcileHandler } from './handlers/hv-recharge-session-reconcile.handler';
import { HvCapacityShadowRecomputeHandler } from './handlers/hv-capacity-shadow-recompute.handler';
import { HvCapacityCrossSessionAssessmentService } from '../hv-capacity-shadow/hv-capacity-cross-session-assessment.service';
import { HvSohGateAssessmentService } from '../hv-capacity-shadow/hv-soh-gate-assessment.service';
import { HvCapacityM3ValidationService } from '../hv-capacity-shadow/hv-capacity-m3-validation.service';
import { HvCapacityShadowService } from '../hv-capacity-shadow/hv-capacity-shadow.service';
import { HvCapacityM2SampleProviderService } from '../hv-capacity-shadow/hv-capacity-m2-sample-provider.service';
import { HvCapacitySessionSummaryService } from '../hv-capacity-shadow/hv-capacity-session-summary.service';
import { BatteryStartProxyExtractService } from '../lv-start-proxy/battery-start-proxy-extract.service';
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
    BatteryV2VehicleLockService,
    BatteryV2IdempotentExecutionService,
    BatteryV2JobDeadLetterService,
    BatteryV2JobObservabilityService,
    BatteryV2JobHandlerRegistry,
    BatteryV2SnapshotIngestionService,
    BatteryRestTargetEvaluationService,
    BatteryStartProxyExtractService,
    BatteryAssessmentService,
    BatteryPublicationService,
    HvCapacityShadowService,
    HvCapacityM2SampleProviderService,
    HvCapacityObservationRepository,
    HvCapacitySessionSummaryService,
    HvCapacityM3ValidationService,
    HvCapacityCrossSessionAssessmentService,
    HvSohGateAssessmentService,
  ],
  exports: [
    ...BATTERY_V2_JOB_HANDLERS,
    BatteryV2JobHandlerRegistry,
    BatteryV2IdempotentExecutionService,
    BatteryV2VehicleLockService,
    BatteryV2JobDeadLetterService,
    BatteryV2JobObservabilityService,
    BatteryV2JobsProducerModule,
  ],
})
export class BatteryV2JobsModule {}

export { BATTERY_V2_JOB_HANDLERS };
