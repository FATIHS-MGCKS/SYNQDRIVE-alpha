import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import dimoProviderBudgetConfig from './dimo-provider-budget.config';
import { DimoProviderBudgetService } from './dimo-provider-budget.service';
import { DimoRequestExecutor } from './dimo-request-executor.service';
import { DimoQueueBackpressureService } from './dimo-queue-backpressure.service';
import { RedisModule } from '@shared/redis/redis.module';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../../workers/queues/queue-names';

/**
 * Redis-backed global DIMO provider budget (P1.3).
 * Final review artifact (PR #1417): architecture/P1_3_GLOBAL_DIMO_PROVIDER_BUDGET_FINAL_RESPONSE_2026-08-29.md
 */
@Module({
  imports: [
    ConfigModule.forFeature(dimoProviderBudgetConfig),
    RedisModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.DIMO_SNAPSHOT },
      { name: QUEUE_NAMES.TRIP_TRACKING },
      { name: QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT },
      { name: QUEUE_NAMES.DTC_POLL },
      { name: QUEUE_NAMES.DIMO_VEHICLE_SYNC },
      { name: QUEUE_NAMES.BATTERY_V2 },
    ),
  ],
  providers: [
    DimoProviderBudgetService,
    DimoRequestExecutor,
    DimoQueueBackpressureService,
  ],
  exports: [
    DimoProviderBudgetService,
    DimoRequestExecutor,
    DimoQueueBackpressureService,
  ],
})
export class DimoProviderBudgetModule {}
