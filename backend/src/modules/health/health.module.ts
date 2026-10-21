import { Module, forwardRef } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { DocumentExtractionModule } from '@modules/document-extraction/document-extraction.module';
import { ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeModule } from '@modules/vehicle-intelligence/reference-capture/exp021-canary-live-window/reference-capture-exp021-canary-live-window-activation-scheduler-runtime.module';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    SchedulerLeaderElectionModule,
    ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeModule,
    forwardRef(() => DocumentExtractionModule),
  ],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
