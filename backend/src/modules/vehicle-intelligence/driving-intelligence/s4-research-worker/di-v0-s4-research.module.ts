import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { DiV0S4ResearchNullOsmProvider } from './di-v0-s4-research-osm-context';
import { DiV0S4ResearchV2Service } from './di-v0-s4-research-v2.service';
import { DiV0S4ResearchV2Scheduler } from './di-v0-s4-research-v2.scheduler';

/**
 * Post-S4 shadow research (road matching V2). Flags default OFF; failures do not mutate S4 work items.
 * S4C completion path is unchanged — discovery reads COMPLETED PRIMARY rows via outbox (P2-style hook).
 */
@Module({
  imports: [PrismaModule, SchedulerLeaderElectionModule],
  providers: [DiV0S4ResearchNullOsmProvider, DiV0S4ResearchV2Service, DiV0S4ResearchV2Scheduler],
  exports: [DiV0S4ResearchV2Service],
})
export class DiV0S4ResearchModule {}
