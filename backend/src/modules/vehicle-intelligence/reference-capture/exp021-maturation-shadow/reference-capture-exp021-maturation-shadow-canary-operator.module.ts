import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { referenceCaptureConfig } from '@config/index';
import { PrismaModule } from '@shared/database/prisma.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import { ReferenceCaptureExp021MaturationShadowRunnerService } from './reference-capture-exp021-maturation-shadow-runner.service';

/**
 * Slim Nest root for EXP-021 maturation shadow canary operator CLI only.
 *
 * Must not import AppModule, WorkersModule, SchedulerLeaderElectionModule, or
 * any HTTP controllers / singleton schedulers. Producer-only BullMQ queue registration.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [referenceCaptureConfig],
    }),
    PrismaModule,
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
        defaultJobOptions: {
          removeOnComplete: { count: 1000, age: 24 * 3600 },
          removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NAMES.REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW }),
  ],
  providers: [
    ReferenceCaptureConfig,
    ReferenceCaptureExp021MaturationShadowRepository,
    ReferenceCaptureExp021MaturationShadowRunnerService,
    ReferenceCaptureExp021MaturationShadowEnrollmentService,
  ],
  exports: [
    ReferenceCaptureConfig,
    ReferenceCaptureExp021MaturationShadowRepository,
    ReferenceCaptureExp021MaturationShadowEnrollmentService,
    PrismaModule,
  ],
})
export class Exp021MaturationShadowCanaryOperatorModule {}
