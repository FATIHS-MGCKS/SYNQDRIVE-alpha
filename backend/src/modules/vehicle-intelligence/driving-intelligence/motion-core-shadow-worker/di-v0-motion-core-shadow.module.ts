import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { DiV0MotionCoreShadowScheduler } from './di-v0-motion-core-shadow.scheduler';
import { DiV0MotionCoreShadowService } from './di-v0-motion-core-shadow.service';

/**
 * Post-S4 EXP021 motion-core shadow comparison (flags OFF by default).
 * Does not alter S4C shadow intervals, trip scores, or customer surfaces.
 */
@Module({
  imports: [PrismaModule, SchedulerLeaderElectionModule],
  providers: [DiV0MotionCoreShadowService, DiV0MotionCoreShadowScheduler],
  exports: [DiV0MotionCoreShadowService],
})
export class DiV0MotionCoreShadowModule {}
