import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { DiV0S4ResearchModule } from '../s4-research-worker/di-v0-s4-research.module';
import { DiV0M7aRoadAssignmentShadowScheduler } from './di-v0-m7a-road-assignment-shadow.scheduler';
import { DiV0M7aRoadAssignmentShadowService } from './di-v0-m7a-road-assignment-shadow.service';
import { DiV0M7aRoadAssignmentShadowReadService } from './di-v0-m7a-road-assignment-shadow-read.service';

/**
 * Post-S4 EXP021 frozen M7A road-assignment shadow (flags OFF by default).
 * Independent of motion-core shadow; does not alter Mapbox routes or customer surfaces.
 */
@Module({
  imports: [PrismaModule, SchedulerLeaderElectionModule, DiV0S4ResearchModule],
  providers: [
    DiV0M7aRoadAssignmentShadowService,
    DiV0M7aRoadAssignmentShadowScheduler,
    DiV0M7aRoadAssignmentShadowReadService,
  ],
  exports: [DiV0M7aRoadAssignmentShadowService, DiV0M7aRoadAssignmentShadowReadService],
})
export class DiV0M7aRoadAssignmentShadowModule {}
