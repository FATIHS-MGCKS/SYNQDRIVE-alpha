import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { DiV0S4ResearchCachedOsmProvider } from './di-v0-s4-research-cached-osm.provider';
import { DiV0S4ResearchV2Service } from './di-v0-s4-research-v2.service';
import { DiV0S4ResearchV2Scheduler } from './di-v0-s4-research-v2.scheduler';
import { DI_V0_S4_RESEARCH_OSM_PROVIDER } from './di-v0-s4-research.tokens';

/**
 * Post-S4 shadow research (road matching V2). Flags default OFF; failures do not mutate S4 work items.
 * S4C completion path is unchanged — discovery reads COMPLETED PRIMARY rows via outbox (P2-style hook).
 */
@Module({
  imports: [PrismaModule, SchedulerLeaderElectionModule],
  providers: [
    DiV0S4ResearchCachedOsmProvider,
    {
      provide: DI_V0_S4_RESEARCH_OSM_PROVIDER,
      useExisting: DiV0S4ResearchCachedOsmProvider,
    },
    DiV0S4ResearchV2Service,
    DiV0S4ResearchV2Scheduler,
  ],
  exports: [DiV0S4ResearchV2Service, DI_V0_S4_RESEARCH_OSM_PROVIDER],
})
export class DiV0S4ResearchModule {}
