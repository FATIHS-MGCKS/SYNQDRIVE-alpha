import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import schedulerLeaderElectionConfig from './scheduler-leader-election.config';
import { SchedulerLeaderElectionService } from './scheduler-leader-election.service';
import { SchedulerLeaderGuardService } from './scheduler-leader-guard.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(schedulerLeaderElectionConfig)],
  providers: [SchedulerLeaderElectionService, SchedulerLeaderGuardService],
  exports: [SchedulerLeaderElectionService, SchedulerLeaderGuardService],
})
export class SchedulerLeaderElectionModule {}
