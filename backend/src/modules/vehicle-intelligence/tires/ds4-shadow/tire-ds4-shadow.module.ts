import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import tireDs4ShadowConfig from '@config/tire-ds4-shadow.config';
import { PrismaModule } from '@shared/database/prisma.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { DiV0MotionCoreShadowModule } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow.module';
import { TireDs4ShadowProducerService } from './tire-ds4-shadow-producer.service';
import { TireDs4ShadowProcessorService } from './tire-ds4-shadow-processor.service';
import { TireDs4ShadowRepository } from './tire-ds4-shadow.repository';

@Module({
  imports: [
    ConfigModule.forFeature(tireDs4ShadowConfig),
    PrismaModule,
    DiV0MotionCoreShadowModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.TIRE_DS4_SHADOW }),
  ],
  providers: [
    TireDs4ShadowRepository,
    TireDs4ShadowProducerService,
    TireDs4ShadowProcessorService,
  ],
  exports: [TireDs4ShadowProducerService, TireDs4ShadowProcessorService, TireDs4ShadowRepository],
})
export class TireDs4ShadowModule {}
